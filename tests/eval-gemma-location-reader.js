// Explicit evaluation only: --freeze followed by --run. Uses the configured local Gemma server.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readLocationStore } from '../src/locations/location-store.js';
import { buildLocationProposals } from '../src/locations/location-proposals.js';
import { locationExtractionSchema, mentionsLocation } from '../src/locations/location-context.js';
import { promptText } from '../src/prompts/prompt-texts.js';
import { requestBatches } from './fixtures/gemma-request-batches.mjs';

const sourceFiles = ['src/locations/location-reader.js', 'src/locations/location-context.js',
    'src/locations/location-store.js', 'src/locations/location-proposals.js',
    'src/prompts/prompt-texts.js', 'src/prompts/prompt-texts-locations.js',
    'src/core/utils-format.js', 'src/tracker/extractor/status-extractor-request.js',
    'tests/eval-gemma-location-reader.js', 'tests/fixtures/gemma-request-batches.mjs'];
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hashSources = () => Object.fromEntries(sourceFiles.map(path => [path,
    createHash('sha256').update(source(path)).digest('hex')]));
function loadFunctions(path, dependencies, names) {
    const text = source(path).replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replace(/^export\s+(?=(?:async\s+)?function|const|let|class)/gm, '');
    return new Function(...Object.keys(dependencies), `${text}\nreturn {${names.join(',')}};`)(...Object.values(dependencies));
}
// Stub host-only imports while retaining production coercion, JSON extraction and place validation.
const { extractJSON, safeJsonParse } = loadFunctions('src/core/utils-format.js', { debugLog() {} }, ['extractJSON', 'safeJsonParse']);
const { coerceToUpdate } = loadFunctions('src/tracker/extractor/status-extractor-request.js',
    { extractJSON, safeJsonParse }, ['coerceToUpdate']);
const { buildLocationPrompt, parseLocationReading } = loadFunctions('src/locations/location-reader.js',
    { readLocationStore, locationExtractionSchema, mentionsLocation, promptText, coerceToUpdate },
    ['buildLocationPrompt', 'parseLocationReading']);
const place = (id, name, extra = {}) => ({ id, name, aliases: [], description: '', parentId: '', ...extra });
const state = (currentId = 'inn') => ({ locations: { enabled: true, currentId, records: {
    town: place('town', 'Ashford', { description: 'A riverside town.' }),
    inn: place('inn', 'Copper Lantern', { aliases: ['the Lantern'], description: 'A warm roadside inn.', parentId: 'town' }),
    ruins: place('ruins', 'Old Ruins', { aliases: ['the broken tower'], description: 'A roofless stone tower.', parentId: 'town' }),
} } });
const empty = () => ({ locations: { enabled: true, currentId: '', records: {} } });
const scenarios = [
    { id: 'opening-fantasy', state: empty(), text: 'Alex and Mira sit inside the Blue Heron Inn in the town of Brackenport. Rain taps the inn’s leaded windows while a fire warms the common room. Alex stays at the table as Mira places two healing potions beside him and describes their quest.',
        current: 'Blue Heron Inn', creates: ['Blue Heron Inn', 'Brackenport'], parents: [['Blue Heron Inn', 'Brackenport']], descriptions: [['Blue Heron Inn', 'window', 'fire']] },
    { id: 'opening-dating', state: empty(), text: 'Alex is at Moonbeam Café, a quiet café with blue chairs and a brass espresso machine. June sits across the table and gives Alex a sunflower. They remain there chatting over coffee.',
        current: 'Moonbeam Café', creates: ['Moonbeam Café'], roots: ['Moonbeam Café'], descriptions: [['Moonbeam Café', 'blue', 'espresso']] },
    { id: 'known-alias-revisit', state: state(), text: 'Alex leaves the Lantern and walks back to the broken tower. Mira stays at the inn. Alex reaches the roofless stone walls of the broken tower and waits inside them. He takes four points of damage climbing over rubble.',
        current: 'Old Ruins', creates: [] },
    { id: 'new-parent-inn-mixed', state: state(), text: 'Alex and Mira leave Ashford behind and arrive in Brackenport. They enter the Blue Heron Inn, a small tavern within Brackenport, and sit at its oak bar under a green lantern. Mira buys Alex a potion for three gold, and Alex recovers two HP while drinking it. They remain inside the inn.',
        current: 'Blue Heron Inn', creates: ['Brackenport', 'Blue Heron Inn'], parents: [['Blue Heron Inn', 'Brackenport']], descriptions: [['Blue Heron Inn', 'oak', 'green']] },
    { id: 'independent-root-mixed', state: state(), text: 'Alex leaves Ashford entirely, crosses the unincorporated countryside, and enters Moonbeam Café. The café is a standalone roadside building outside every town, not part of Ashford. It has pink curtains. June is waiting inside. Alex gives her one of his two sunflowers and stays at their table in the café.',
        current: 'Moonbeam Café', creates: ['Moonbeam Café'], roots: ['Moonbeam Café'], descriptions: [['Moonbeam Café', 'pink']] },
    { id: 'room-arrival', state: state(), text: 'Alex climbs the stairs inside the Copper Lantern and enters the Reading Room. The Reading Room is a small room within the Copper Lantern, lined with walnut bookshelves. He closes its door and settles into an armchair. Mira remains downstairs at the bar.',
        current: 'Reading Room', creates: ['Reading Room'], parents: [['Reading Room', 'Copper Lantern']], descriptions: [['Reading Room', 'walnut']] },
    { id: 'unknown-destination-departure', state: state(), text: 'Alex leaves the Copper Lantern and Ashford behind. A sudden fog swallows the road. When it lifts, Alex is somewhere he cannot identify. The narrator gives no destination or description of this new place. Mira is still back at the inn.',
        current: '', creates: [] },
    { id: 'stationary-invitation', state: state(), text: 'Alex stays seated at the Copper Lantern’s bar. Mira invites him to visit the Moonbeam Café tomorrow, saying she has heard rumours about it. She leaves for the Old Ruins alone. Alex declines to follow and remains on his barstool.',
        current: 'Copper Lantern', creates: [], stationary: true },
];
const action = process.argv[2];
const label = process.argv[3] || 'location-reader-initial';
const failedFrom = process.argv.includes('--failed-from') ? process.argv[process.argv.indexOf('--failed-from') + 1] : null;
if (!['--freeze', '--run'].includes(action) || !/^[a-z0-9-]+$/.test(label)
    || (failedFrom && !/^[a-z0-9-]+$/.test(failedFrom))) {
    throw Error('Usage: node tests/eval-gemma-location-reader.js --freeze|--run [LABEL] [--failed-from LABEL]');
}
const directory = new URL('../docs/evaluations/', import.meta.url);
mkdirSync(directory, { recursive: true });
const file = suffix => new URL(`gemma-e4b-${label}-${suffix}`, directory);
if (action === '--freeze') {
    const earlierRun = failedFrom ? JSON.parse(readFileSync(new URL(`gemma-e4b-${failedFrom}-results.json`, directory), 'utf8')) : null;
    const failedIds = earlierRun ? new Set(earlierRun.trials.filter(trial => trial.checks.some(check => !check.passed)).map(trial => trial.id)) : null;
    const selected = failedIds ? scenarios.filter(scenario => failedIds.has(scenario.id)) : scenarios;
    const bundles = selected.map(scenario => ({ scenario, settings: { extractionMaxTokens: 2400, extractionUseSchema: false },
        messages: [{ role: 'system', content: promptText('locationReaderSystem') },
            { role: 'user', content: buildLocationPrompt({ state: scenario.state, messageText: scenario.text, earlier: [], playerName: 'Alex' }) }] }));
    writeFileSync(file('prompts.json'), JSON.stringify({ frozenAt: new Date().toISOString(),
        sourceHashes: hashSources(), git: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        criteria: { requiredCheckRate: 1, repeats: 2, casesInformedWording: Boolean(failedFrom), failedFrom,
            note: 'Focused initial component evaluation, not end-to-end tracker trigger coverage or broad reliability validation.' }, bundles }, null, 2));
    console.log(`Frozen ${bundles.length} exact production location-reader prompts.`);
    process.exit(0);
}
const frozen = JSON.parse(readFileSync(file('prompts.json'), 'utf8'));
if (JSON.stringify(frozen.sourceHashes) !== JSON.stringify(hashSources())) throw Error('Source changed since prompt freeze. Freeze a fresh run explicitly.');
const endpoint = 'http://127.0.0.1:9931/v1';
const getJSON = async url => { const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(`${url}: ${response.status}: ${await response.text()}`); return response.json(); };
const [models, props] = await Promise.all([getJSON(`${endpoint}/models`), getJSON('http://127.0.0.1:9931/props')]);
if (props.total_slots && props.total_slots < 4) throw Error(`Server has ${props.total_slots} slots; four requested.`);
const output = { startedAt: new Date().toISOString(), endpoint, model: models.data[0].id,
    server: { build: props.build_info, modelPath: props.model_path, slots: props.total_slots, defaults: props.default_generation_settings },
    sourceHashes: hashSources(), concurrency: 4, repeats: 2, schema: false, maxTokens: 2400,
    sampling: 'Server defaults. No sampling overrides or seed supplied.', trials: [] };
const jobs = frozen.bundles.flatMap(bundle => [0, 1].map(repeat => ({ bundle, repeat })));
const lower = value => String(value ?? '').normalize('NFKC').toLowerCase();
function score(scenario, parsed, proposal, error, finishReason) {
    const checks = [];
    const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
    check('completeResponse', !error && finishReason === 'stop');
    check('validLocationShape', !error);
    check('proposalWarningsEmpty', !error && proposal.warnings.length === 0);
    const rows = proposal.rows;
    const effective = { ...scenario.state.locations.records };
    for (const row of rows) if (row.kind !== 'location-current') effective[row.location.id] = row.location.record;
    const currentRow = rows.findLast(row => row.kind === 'location-current');
    const currentId = currentRow ? currentRow.location.id : scenario.state.locations.currentId;
    check('currentPlace', !error && lower(effective[currentId]?.name || '') === lower(scenario.current));
    const created = rows.filter(row => row.kind === 'location-create');
    check('exactCreatedPlaces', !error && created.length === scenario.creates.length
        && scenario.creates.every(name => created.some(row => lower(row.actor) === lower(name))));
    for (const [child, parent] of scenario.parents || []) {
        const record = Object.values(effective).find(place => lower(place.name) === lower(child));
        check(`parent:${child}`, !error && lower(effective[record?.parentId]?.name) === lower(parent));
    }
    for (const root of scenario.roots || []) {
        check(`root:${root}`, !error && Object.values(effective).some(place => lower(place.name) === lower(root) && !place.parentId));
    }
    for (const [name, ...details] of scenario.descriptions || []) {
        const record = Object.values(effective).find(place => lower(place.name) === lower(name));
        check(`description:${name}`, !error && details.every(detail => lower(record?.description).includes(lower(detail))));
    }
    check('existingFactsPreserved', !error && Object.values(scenario.state.locations.records).every(before => {
        const after = effective[before.id];
        return after?.name === before.name && before.aliases.every(alias => after.aliases.includes(alias))
            && (!before.description || after.description.includes(before.description));
    }));
    if (scenario.stationary) check('stationaryNoUpdates', !error && rows.length === 0 && !parsed?.places?.length);
    return checks;
}
for (const batch of requestBatches(jobs, [endpoint], 4)) {
    const responses = await Promise.allSettled(batch.map(async ({ bundle }) => {
        const start = Date.now();
        const response = await fetch(`${endpoint}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: output.model, messages: bundle.messages, max_tokens: 2400, stream: false }),
            signal: AbortSignal.timeout(240000) });
        if (!response.ok) throw Error(`${response.status}: ${await response.text()}`);
        return { completion: await response.json(), elapsedMs: Date.now() - start };
    }));
    for (let index = 0; index < batch.length; index++) {
        const { bundle, repeat } = batch[index], response = responses[index];
        const result = response.status === 'fulfilled' ? response.value : null;
        const choice = result?.completion?.choices?.[0];
        const raw = choice?.message?.content ?? '';
        let parsed = null, proposal = { rows: [], warnings: [] }, error = response.status === 'rejected' ? String(response.reason) : null;
        if (!error) try {
            parsed = parseLocationReading(raw);
            let id = 0;
            proposal = buildLocationProposals(bundle.scenario.state, parsed, {
                makeId: () => `evaluation-place-${++id}`, provenance: { source: bundle.scenario.id, repeat },
            });
        } catch (failure) { error = String(failure); }
        const checks = score(bundle.scenario, parsed, proposal, error, choice?.finish_reason);
        output.trials.push({ id: bundle.scenario.id, repeat, elapsedMs: result?.elapsedMs ?? null,
            finishReason: choice?.finish_reason ?? null, usage: result?.completion?.usage ?? null,
            raw, parsed, proposal, error, completion: result?.completion ?? null, checks });
        writeFileSync(file('results.json'), JSON.stringify(output, null, 2));
        console.log(`${bundle.scenario.id} #${repeat + 1}: ${checks.filter(check => check.passed).length}/${checks.length} ${checks.filter(check => !check.passed).map(check => check.name).join(', ')}`);
    }
}
const checks = output.trials.flatMap(trial => trial.checks);
output.completedAt = new Date().toISOString();
output.summary = { trials: output.trials.length, checks: checks.length, passed: checks.filter(check => check.passed).length,
    failedTrials: output.trials.filter(trial => trial.checks.some(check => !check.passed)).length,
    acceptable: checks.every(check => check.passed), sourceHashesMatch: JSON.stringify(hashSources()) === JSON.stringify(frozen.sourceHashes) };
writeFileSync(file('results.json'), JSON.stringify(output, null, 2));
const report = [`# Gemma E4B: dedicated location reader, ${label}`, '',
    `Completed ${output.completedAt}. **${output.summary.passed}/${checks.length} checks passed** across ${output.trials.length} trials. ${output.summary.failedTrials} trials failed at least one check.`, '',
    `Used only port 9931, four concurrent requests, two repetitions per scene, server sampling defaults, no schema, maximum 2400 reply tokens. No retries or discarded replies. Source hashes match frozen prompts: ${output.summary.sourceHashesMatch}.`, '',
    `Model: \`${output.model}\`. Build: \`${output.server.build}\`.`, '',
    'This evaluates the separate place reader with production prompt construction, response coercion, and proposal validation. It does not test tracker-trigger recall or end-to-end orchestration. These are small focused scenarios, not a broad reliability claim.', '',
    ...(frozen.criteria.failedFrom ? [`Focused retest of every scenario that failed at least once in ${frozen.criteria.failedFrom}. These cases informed the revised wording. Other scenarios were not rerun.`, ''] : []),
    'Known facts preservation uses exact containment of the previous description. A faithful paraphrase could fail that conservative check. Other semantic description checks use stated keywords.', '',
    `[Frozen full prompts and source hashes](gemma-e4b-${label}-prompts.json) · [All raw replies, checks and proposals](gemma-e4b-${label}-results.json)`, '',
    '| Case | Repetition | Checks | Failed checks |', '| --- | --- | --- | --- |',
    ...output.trials.map(trial => `| ${trial.id} | ${trial.repeat + 1} | ${trial.checks.filter(check => check.passed).length}/${trial.checks.length} | ${trial.checks.filter(check => !check.passed).map(check => check.name).join(', ') || '—'} |`), '',
    ...output.trials.filter(trial => trial.checks.some(check => !check.passed)).flatMap(trial => [
        `## ${trial.id}, repetition ${trial.repeat + 1}`, '',
        `Failed: ${trial.checks.filter(check => !check.passed).map(check => check.name).join(', ')}.`, '',
        ...(trial.error ? [`Error: ${trial.error}`, ''] : []), '```json', trial.raw, '```', '',
        `Proposal warnings: ${JSON.stringify(trial.proposal.warnings)}`, '',
    ]),
].join('\n');
writeFileSync(file('report.md'), report);
console.log(JSON.stringify(output.summary, null, 2));
