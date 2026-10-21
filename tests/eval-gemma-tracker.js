// Default: 20 frozen roleplay exchanges (10 Fantasy, 10 Dating). --minimal selects the old synthetic suite.
// node tests/eval-gemma-tracker.js --freeze roleplay-baseline
// node tests/eval-gemma-tracker.js --run roleplay-baseline --repeats 2 --endpoints http://127.0.0.1:8080/v1
// Port 9931 authors scenes; choose the tracker endpoint explicitly when evaluating another model.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { requestBatches } from './fixtures/gemma-request-batches.mjs';
import { readerRequestBody } from './fixtures/gemma-reader-request.mjs';
import { score } from './fixtures/gemma-tracker-score.mjs';
import { parseReaderReply } from './fixtures/gemma-reply-parsing.mjs';
import { harness, constants } from './fixtures/gemma-tracker-harness.mjs';
import { scenarios as standardScenarios, criteria as standardCriteria, makeState } from './fixtures/gemma-tracker-scenarios.mjs';
import { locationChangeScenarios, makeLocationChangeState } from './fixtures/gemma-location-change-scenarios.mjs';
import { naturalScenarios, makeNaturalState } from './fixtures/gemma-tracker-natural-scenarios.mjs';
import { locationTreeScenarios, naturalLocationTreeScenarios, mixedLocationTreeScenarios } from './fixtures/gemma-location-tree-scenarios.mjs';
import { roleplayScenarios, qualitativeScenarios, makeRoleplayState } from './fixtures/gemma-tracker-roleplay-scenarios.mjs';
import { xpThresholdScenarios } from './fixtures/gemma-xp-threshold-scenarios.mjs';
const args = process.argv.slice(2), action = args[0], label = args[1];
if (!['--freeze', '--run', '--score'].includes(action) || !/^[a-z0-9-]+$/.test(label || '')) throw Error('Usage: --freeze|--run|--score LABEL [--qualitative|--xp-threshold|--minimal|--location-change|--natural|--location-tree|--location-tree-prose|--location-tree-mixed] [--absolute] [--schema] [--repeats N] [--endpoints URL,URL] [--concurrency N]');
// --absolute remains an accepted alias; every new evaluation uses the production contract.
const readerContract = 'absolute';
const useSchema = args.includes('--schema');
const xpThreshold = args.includes('--xp-threshold');
const qualitative = args.includes('--qualitative');
const minimal = args.includes('--minimal');
const locationChange = args.includes('--location-change');
const natural = args.includes('--natural');
const locationTree = args.includes('--location-tree');
const locationTreeProse = args.includes('--location-tree-prose');
const locationTreeMixed = args.includes('--location-tree-mixed');
if ([qualitative, xpThreshold, minimal, locationChange, natural, locationTree, locationTreeProse, locationTreeMixed].filter(Boolean).length > 1) throw Error('Choose only one scenario suite.');
const roleplay = ![qualitative, xpThreshold, minimal, locationChange, natural, locationTree, locationTreeProse, locationTreeMixed].some(Boolean);
const scenarios = qualitative ? qualitativeScenarios : xpThreshold ? xpThresholdScenarios : locationChange ? locationChangeScenarios : locationTreeMixed ? mixedLocationTreeScenarios : locationTreeProse ? naturalLocationTreeScenarios
    : locationTree ? locationTreeScenarios : natural ? naturalScenarios : minimal ? standardScenarios : roleplayScenarios;
const makeScenarioState = locationChange ? makeLocationChangeState : natural ? makeNaturalState : roleplay || qualitative || xpThreshold ? makeRoleplayState : makeState;
const freezeCriteria = qualitative ? { ...standardCriteria, suite: 'qualitative-roleplay' } : xpThreshold ? { ...standardCriteria, suite: 'xp-threshold' } : locationChange ? { ...standardCriteria, suite: 'location-change' } : natural ? { ...standardCriteria, suite: 'natural-prose' }
    : locationTree || locationTreeProse || locationTreeMixed ? { ...standardCriteria,
        suite: locationTreeMixed ? 'location-tree-mixed' : locationTreeProse ? 'location-tree-prose' : 'location-tree', overallRequiredCheckRate: 1,
        perSystemRequiredCheckRate: 1 } : roleplay ? { ...standardCriteria, suite: 'roleplay-exchanges' } : standardCriteria;
const directory = new URL('../docs/evaluations/', import.meta.url);
mkdirSync(directory, { recursive: true });
const sourceFiles = ['src/core/builtin-systems.js', 'src/core/settings-tracker-defaults.js',
    'src/core/constants-prompts.js', 'src/prompts/prompt-texts-reader.js',
    'src/tracker/extractor/status-extractor-prompt.js', 'src/tracker/extractor/status-extractor-prompt-state.js',
    'src/tracker/extractor/status-extractor-schema.js', 'src/tracker/stat-prompt-definitions.js',
    'src/tracker/ui/status-ui-placement.js',
    'src/core/npc-templates.js', 'src/core/collection-fields.js', 'src/locations/location-context.js',
    'src/locations/location-proposals.js', 'src/tracker/status-stat-values.js',
    'src/tracker/status-collection-updates.js', 'src/tracker/status-update-constraints.js',
    'src/tracker/status-update-parser.js',
    'src/tracker/status-apply-update.js', 'src/tracker/stat-reading-equality.js',
    'src/tracker/progression.js', 'src/tracker/numeric-stat-bounds.js',
    'tests/eval-gemma-tracker.js', 'tests/fixtures/gemma-request-batches.mjs', 'tests/fixtures/gemma-reader-request.mjs',
    'tests/fixtures/gemma-location-change-scenarios.mjs',
    'tests/fixtures/gemma-location-check.mjs', 'tests/fixtures/tracker-pool-audit.mjs',
    'tests/fixtures/gemma-tracker-roleplay-scenarios.mjs', 'tests/fixtures/gemma-tracker-score.mjs',
    'tests/fixtures/gemma-tracker-scenarios.mjs', 'tests/fixtures/gemma-tracker-harness.mjs',
    'src/core/utils-format.js', 'tests/fixtures/gemma-reply-parsing.mjs',
    'tests/fixtures/gemma-xp-threshold-scenarios.mjs', 'src/tracker/extractor/status-extractor-readings.js',
    ...roleplayScenarios.map(scene => `tests/fixtures/roleplay/${scene.id}.json`),
    ...qualitativeScenarios.map(scene => `tests/fixtures/roleplay/qualitative/${scene.id}.json`)];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex')]));
const file = suffix => new URL(`gemma-e4b-${label}-${suffix}.json`, directory);
if (action === '--freeze') {
    const bundles = [];
    for (const scenario of scenarios) {
        const empty = await harness(scenario.system, { global: {}, player: { stats: {} }, characters: [] });
        const state = makeScenarioState(scenario, empty.settings);
        const reader = await harness(scenario.system, state);
        bundles.push({ scenario, state, settings: reader.settings, schema: reader.schema,
            messages: [{ role: 'system', content: constants.SYSTEM_PROMPT }, { role: 'user', content: reader.prompt(scenario.text, scenario.earlier) }] });
    }
    writeFileSync(file('prompts'), JSON.stringify({ readerContract, useSchema, frozenAt: new Date().toISOString(), sourceHashes: sourceHashes(), git: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), criteria: freezeCriteria, bundles }, null, 2));
    console.log(`Frozen ${bundles.length} actual production prompts: ${file('prompts').pathname}`);
    process.exit(0);
}
const frozen = JSON.parse(readFileSync(file('prompts')));
if (action === '--run' && useSchema && !frozen.useSchema) throw Error('Freeze a new label with --schema before running constrained evaluation.');
if (frozen.readerContract !== 'absolute') throw Error('Historical delta snapshots are read-only. Freeze a new label to evaluate the production absolute contract.');
const criteria = frozen.criteria;
const output = action === '--score' ? JSON.parse(readFileSync(file('results'))) : { startedAt: new Date().toISOString(), label, criteria, readerContract: frozen.readerContract,
    useSchema: Boolean(frozen.useSchema),
    sourceHashes: sourceHashes(), endpoint: 'http://127.0.0.1:9931/v1', model: null, server: null, repeats: Number(args[args.indexOf('--repeats') + 1]) || 2, trials: [] };
if (action === '--run') {
    const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
    const endpoints = [...new Set(option('--endpoints', output.endpoint).split(',').map(value => value.trim().replace(/\/$/, '')))];
    const concurrency = Number(option('--concurrency', 1));
    const jobs = frozen.bundles.flatMap(bundle => Array.from({ length: output.repeats }, (_, repeat) => ({ repeat, bundle })));
    const batches = requestBatches(jobs, endpoints, concurrency);
    const servers = await Promise.allSettled(endpoints.map(async endpoint => {
        const metadata = await (await fetch(`${endpoint}/models`)).json();
        const props = await (await fetch(`${endpoint.replace(/\/v1$/, '')}/props`)).json();
        if (props.total_slots && concurrency > props.total_slots) throw Error(`${endpoint} has only ${props.total_slots} slots`);
        return { endpoint, model: metadata.data[0].id, build: props.build_info,
            defaults: props.default_generation_settings, modelPath: props.model_path, slots: props.total_slots };
    }));
    output.servers = servers.filter(result => result.status === 'fulfilled').map(result => result.value);
    const failures = servers.filter(result => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Endpoint verification failed');
    output.endpoint = endpoints[0];
    output.concurrencyPerEndpoint = concurrency;
    output.model = output.servers[0].model;
    output.server = output.servers[0];
    for (const batch of batches) {
        const responses = await Promise.allSettled(batch.map(async ({ bundle, endpoint }) => {
            const start = Date.now();
            const server = output.servers.find(server => server.endpoint === endpoint);
            const response = await fetch(`${endpoint}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(readerRequestBody(bundle, server.model, { useSchema: Boolean(frozen.useSchema) })) });
            if (!response.ok) throw Error(`${endpoint}: ${response.status}: ${await response.text()}`);
            return { completion: await response.json(), elapsedMs: Date.now() - start };
        }));
        for (let index = 0; index < batch.length; index++) {
            const { bundle, repeat, endpoint } = batch[index];
            const response = responses[index];
            const requestError = response.status === 'rejected' ? String(response.reason) : null;
            const choice = response.status === 'fulfilled' ? response.value.completion.choices?.[0] : null;
            const elapsedMs = response.status === 'fulfilled' ? response.value.elapsedMs : null;
            const completion = response.status === 'fulfilled' ? response.value.completion : null;
            const content = choice?.message?.content || '';
            const { parsed, strictJsonValid, parseRecovered } = parseReaderReply(content);
            const reader = await harness(bundle.scenario.system, bundle.state);
            let normalized = null, error = null;
            try { if (parsed) normalized = reader.normalize(parsed, bundle.scenario.text); } catch (err) { error = err.stack; }
            const checks = score(bundle, normalized, parsed, choice?.finish_reason, { strictJsonValid });
            output.trials.push({ id: bundle.scenario.id, system: bundle.scenario.system, holdout: Boolean(bundle.scenario.holdout), repeat,
                endpoint, elapsedMs, requestError, finishReason: choice?.finish_reason, usage: completion?.usage, content, parsed, strictJsonValid, parseRecovered, normalized, error, checks });
            writeFileSync(file('results'), JSON.stringify(output, null, 2));
            console.log(`${endpoint} ${bundle.scenario.id} #${repeat + 1}: ${checks.filter(c => c.passed).length}/${checks.length} ${checks.filter(c => !c.passed).map(c => c.name).join('; ')}`);
        }
    }
}
if (action === '--score') { output.rescoredAt = new Date().toISOString(); output.rescoreSourceHashes = sourceHashes(); }
if (action === '--score') for (const trial of output.trials) {
    const bundle = frozen.bundles.find(b => b.scenario.id === trial.id);
    const reader = await harness(bundle.scenario.system, bundle.state);
    trial.originalChecks ||= structuredClone(trial.checks);
    Object.assign(trial, parseReaderReply(trial.content));
    trial.normalized = trial.parsed ? reader.normalize(trial.parsed, bundle.scenario.text) : null;
    trial.checks = score(bundle, trial.normalized, trial.parsed, trial.finishReason, { strictJsonValid: trial.strictJsonValid });
}
for (const trial of output.trials) {
    const bundle = frozen.bundles.find(b => b.scenario.id === trial.id);
    const owners = [trial.normalized?.update?.player, ...(trial.normalized?.update?.characters || [])];
    const additions = owners.flatMap(owner => Object.values(owner?.collections || {}).flatMap(col => col?.add || []));
    trial.audit = {
        placeholderInventory: additions.some(item => /identifies the item|<[^>]+>/.test(String(item.name))),
        openingInventedInventory: Boolean(bundle.scenario.opening && additions.length),
        xpProgression: trial.normalized?.progression || null,
    };
}
const all = output.trials.flatMap(t => t.checks);
const rate = checks => checks.filter(check => check.passed).length / checks.length;
output.summary = { checks: all.length, passed: all.filter(c => c.passed).length, rate: rate(all),
    criticalFailures: output.trials.flatMap(trial => trial.checks.filter(c => c.critical && !c.passed).map(c => `${trial.id} #${trial.repeat + 1}: ${c.name}`)),
    systems: Object.fromEntries(['fantasy', 'dating'].map(system => [system, rate(output.trials.filter(t => t.system === system).flatMap(t => t.checks))])) };
output.summary.perSystemCounts = Object.fromEntries(['fantasy', 'dating'].map(system => {
    const checks = output.trials.filter(t => t.system === system).flatMap(t => t.checks);
    return [system, { checks: checks.length, passed: checks.filter(c => c.passed).length, rate: rate(checks) }];
}));
output.summary.splits = Object.fromEntries([false, true].map(holdout => {
    const checks = output.trials.filter(t => t.holdout === holdout).flatMap(t => t.checks);
    return [holdout ? 'originalHoldout' : 'main', { checks: checks.length, passed: checks.filter(c => c.passed).length, rate: rate(checks) }];
}));
output.summary.auditFailures = output.trials.filter(t => t.audit.placeholderInventory || t.audit.openingInventedInventory).map(t => `${t.id} #${t.repeat + 1}: unsupported inventory additions`);
output.summary.endpoints = Object.fromEntries((output.servers || []).map(server => {
    const trials = output.trials.filter(trial => trial.endpoint === server.endpoint);
    const checks = trials.flatMap(trial => trial.checks);
    return [server.endpoint, { trials: trials.length, checks: checks.length, passed: checks.filter(check => check.passed).length,
        criticalFailures: checks.filter(check => check.critical && !check.passed).length }];
}));
output.summary.acceptable = !output.summary.auditFailures.length && output.summary.rate >= criteria.overallRequiredCheckRate && !output.summary.criticalFailures.length
    && Object.values(output.summary.systems).every(value => value >= criteria.perSystemRequiredCheckRate);
writeFileSync(file('results'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output.summary, null, 2));
