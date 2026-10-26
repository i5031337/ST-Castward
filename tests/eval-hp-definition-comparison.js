// node tests/eval-hp-definition-comparison.js LABEL
// Runs a frozen two-definition comparison with balanced endpoints and alternating order.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { requestBatches } from './fixtures/gemma-request-batches.mjs';
import { readerRequestBody } from './fixtures/gemma-reader-request.mjs';
import { parseReaderReply } from './fixtures/gemma-reply-parsing.mjs';
import { score } from './fixtures/gemma-tracker-score.mjs';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
const label = process.argv[2];
if (!/^[a-z0-9-]+$/.test(label || '')) throw Error('Supply the frozen comparison label.');
const dir = new URL('../docs/evaluations/', import.meta.url);
const input = new URL(`gemma-e4b-${label}-prompts.json`, dir);
const target = new URL(`gemma-e4b-${label}-results.json`, dir);
if (fs.existsSync(target)) throw Error('Results already exist; use a new snapshot label.');
const frozen = JSON.parse(fs.readFileSync(input));
const scriptPath = 'tests/eval-hp-definition-comparison.js';
const sha = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
for (const [path, hash] of Object.entries(frozen.sourceHashes)) if (sha(path) !== hash) throw Error(`Source drift: ${path}`);
const servers = await Promise.all(frozen.endpoints.map(async endpoint => {
    const models = await (await fetch(endpoint + '/models')).json();
    const props = await (await fetch(endpoint.replace(/\/v1$/, '') + '/props')).json();
    if (props.total_slots < frozen.concurrencyPerEndpoint) throw Error('Insufficient slots.');
    return { endpoint, model: models.data[0].id, build: props.build_info,
        modelPath: props.model_path, defaults: props.default_generation_settings, slots: props.total_slots };
}));
const comparable = ({ endpoint, ...rest }) => JSON.stringify(rest);
if (servers.some(s => comparable(s) !== comparable(servers[0]))) throw Error('Server configurations differ.');
const jobs = [];
const [first, second] = ['original', 'current'].map(k => frozen.variants[k].bundles);
if (first.length !== second.length) throw Error('Unpaired scenarios.');
for (let index = 0; index < first.length; index++) {
    if (first[index].scenario.id !== second[index].scenario.id) throw Error('Unpaired scene.');
    for (let repeat = 0; repeat < frozen.repeats; repeat++) {
        for (const variant of repeat % 2 ? ['current', 'original'] : ['original', 'current']) {
            jobs.push({ variant, repeat, bundle: frozen.variants[variant].bundles[index] });
        }
    }
}
const batches = requestBatches(jobs, frozen.endpoints, frozen.concurrencyPerEndpoint);
const assignment = batches.flat().reduce((map, j) => {
    const key = [j.bundle.scenario.id, j.variant, j.endpoint].join('|');
    map[key] = (map[key] || 0) + 1; return map;
}, {});
if (Object.values(assignment).some(count => count !== frozen.repeats / servers.length)) throw Error('Unbalanced endpoints.');
const output = { startedAt: new Date().toISOString(), label, input: input.pathname.split('/').pop(),
    sourceHashes: frozen.sourceHashes, runnerSha256: sha(scriptPath), servers, assignment, trials: [] };
for (const batch of batches) {
    const responses = await Promise.allSettled(batch.map(async ({ bundle, endpoint }) => {
        const start = Date.now(), server = servers.find(s => s.endpoint === endpoint);
        const r = await fetch(endpoint + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(readerRequestBody(bundle, server.model, { useSchema: frozen.useSchema })) });
        if (!r.ok) throw Error(`${endpoint} ${r.status}: ${await r.text()}`);
        return { completion: await r.json(), elapsedMs: Date.now() - start };
    }));
    for (let i = 0; i < batch.length; i++) {
        const { bundle, variant, repeat, endpoint } = batch[i], response = responses[i];
        const result = response.status === 'fulfilled' ? response.value : null;
        const choice = result?.completion.choices?.[0], content = choice?.message?.content || '';
        const parsedReply = parseReaderReply(content), reader = await harness(bundle.scenario.system, bundle.state);
        // Purpose text affects inference, but keep the normalizer's configured definitions paired too.
        reader.settings.playerStats = structuredClone(bundle.settings.playerStats);
        reader.settings.npcStats = structuredClone(bundle.settings.npcStats);
        let normalized = null, error = null;
        try { if (parsedReply.parsed) normalized = reader.normalize(parsedReply.parsed, bundle.scenario.text); }
        catch (err) { error = String(err.stack || err); }
        const checks = score(bundle, normalized, parsedReply.parsed, choice?.finish_reason, parsedReply);
        output.trials.push({ id: bundle.scenario.id, system: bundle.scenario.system, variant, repeat, endpoint,
            elapsedMs: result?.elapsedMs, requestError: response.status === 'rejected' ? String(response.reason) : null,
            finishReason: choice?.finish_reason, usage: result?.completion.usage, content, ...parsedReply, normalized, error, checks });
    }
    fs.writeFileSync(target, JSON.stringify(output, null, 2));
    console.log(`${output.trials.length}/${jobs.length} replies; latest scene ${batch.at(-1).bundle.scenario.id}`);
}
const summarize = trials => {
    const checks = trials.flatMap(t => t.checks), numeric = checks.filter(c => /^(playerChangeBetween|npcChangeBetween) /.test(c.name));
    const hp = numeric.filter(c => c.name.split(' ').includes('HP'));
    return { replies: trials.length, checks: checks.length, passed: checks.filter(c => c.passed).length,
        fullyPassing: trials.filter(t => t.checks.every(c => c.passed)).length,
        numericChecks: numeric.length, numericPassed: numeric.filter(c => c.passed).length,
        hpChangeChecks: hp.length, hpChangePassed: hp.filter(c => c.passed).length,
        inventoryFailures: checks.filter(c => !c.passed && c.name.trim() === 'sameHoldings').length,
        strictJsonValid: trials.filter(t => t.strictJsonValid).length,
        warnings: trials.reduce((n, t) => n + (t.normalized?.warnings?.length || 0), 0),
        requestErrors: trials.filter(t => t.requestError).length, normalizationErrors: trials.filter(t => t.error).length };
};
output.finishedAt = new Date().toISOString();
output.summary = Object.fromEntries(['original', 'current'].map(variant => {
    const trials = output.trials.filter(t => t.variant === variant);
    return [variant, { ...summarize(trials), scenes: Object.fromEntries(first.map(b =>
        [b.scenario.id, summarize(trials.filter(t => t.id === b.scenario.id))])),
    endpoints: Object.fromEntries(servers.map(s => [s.endpoint, summarize(trials.filter(t => t.endpoint === s.endpoint))])) }];
}));
for (const [path, hash] of Object.entries(frozen.sourceHashes)) if (sha(path) !== hash) throw Error(`Source drift at completion: ${path}`);
fs.writeFileSync(target, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output.summary, null, 2));
