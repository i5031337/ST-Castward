// Explicit real-model evaluation: freeze with --natural for two-paragraph prose scenes.
// node tests/eval-gemma-tracker.js --freeze natural-prose --natural
// node tests/eval-gemma-tracker.js --run natural-prose --repeats 2
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { requestBatches } from './fixtures/gemma-request-batches.mjs';
import { currentPlaceContains } from './fixtures/gemma-location-check.mjs';
import { changedPoolMaxima } from './fixtures/tracker-pool-audit.mjs';
import { harness, constants } from './fixtures/gemma-tracker-harness.mjs';
import { scenarios as standardScenarios, criteria as standardCriteria, makeState } from './fixtures/gemma-tracker-scenarios.mjs';
import { naturalScenarios, makeNaturalState } from './fixtures/gemma-tracker-natural-scenarios.mjs';
import { locationTreeScenarios, naturalLocationTreeScenarios, mixedLocationTreeScenarios } from './fixtures/gemma-location-tree-scenarios.mjs';
const args = process.argv.slice(2), action = args[0], label = args[1];
if (!['--freeze', '--run', '--score'].includes(action) || !/^[a-z0-9-]+$/.test(label || '')) throw Error('Usage: --freeze|--run|--score LABEL [--natural|--location-tree|--location-tree-prose|--location-tree-mixed] [--repeats N] [--endpoints URL,URL] [--concurrency N]');
const natural = args.includes('--natural');
const locationTree = args.includes('--location-tree');
const locationTreeProse = args.includes('--location-tree-prose');
const locationTreeMixed = args.includes('--location-tree-mixed');
if ([natural, locationTree, locationTreeProse, locationTreeMixed].filter(Boolean).length > 1) throw Error('Choose only one scenario suite.');
const scenarios = locationTreeMixed ? mixedLocationTreeScenarios : locationTreeProse ? naturalLocationTreeScenarios
    : locationTree ? locationTreeScenarios : natural ? naturalScenarios : standardScenarios;
const makeScenarioState = natural ? makeNaturalState : makeState;
const freezeCriteria = natural ? { ...standardCriteria, suite: 'natural-prose' }
    : locationTree || locationTreeProse || locationTreeMixed ? { ...standardCriteria,
        suite: locationTreeMixed ? 'location-tree-mixed' : locationTreeProse ? 'location-tree-prose' : 'location-tree', overallRequiredCheckRate: 1,
        perSystemRequiredCheckRate: 1 } : standardCriteria;
const directory = new URL('../docs/evaluations/', import.meta.url);
mkdirSync(directory, { recursive: true });
const sourceFiles = ['src/core/builtin-systems.js', 'src/core/settings-tracker-defaults.js',
    'src/core/constants-prompts.js', 'src/prompts/prompt-texts-reader.js',
    'src/tracker/extractor/status-extractor-prompt.js', 'src/tracker/extractor/status-extractor-prompt-state.js',
    'src/tracker/extractor/status-extractor-schema.js', 'src/tracker/stat-prompt-definitions.js',
    'src/core/npc-templates.js', 'src/core/collection-fields.js', 'src/locations/location-context.js',
    'src/locations/location-proposals.js', 'src/tracker/status-stat-values.js',
    'src/tracker/status-collection-updates.js', 'src/tracker/status-update-constraints.js',
    'src/tracker/status-update-parser.js',
    'src/tracker/status-apply-update.js',
    'src/tracker/progression.js', 'src/tracker/numeric-stat-bounds.js',
    'tests/eval-gemma-tracker.js', 'tests/fixtures/gemma-request-batches.mjs',
    'tests/fixtures/gemma-location-check.mjs', 'tests/fixtures/tracker-pool-audit.mjs'];
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
    writeFileSync(file('prompts'), JSON.stringify({ frozenAt: new Date().toISOString(), sourceHashes: sourceHashes(), git: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), criteria: freezeCriteria, bundles }, null, 2));
    console.log(`Frozen ${bundles.length} actual production prompts: ${file('prompts').pathname}`);
    process.exit(0);
}
const frozen = JSON.parse(readFileSync(file('prompts')));
const criteria = frozen.criteria;
const includes = (value, wanted) => String(value || '').toLowerCase().includes(String(wanted).toLowerCase());
function score(bundle, normalized, raw, finishReason) {
    const u = normalized?.update || {}, rows = normalized?.places || [], state = bundle.state;
    const heldActor = name => normalized?.holdings?.characters?.find(c => includes(c.name, name));
    const heldItem = (owner, col, name) => owner?.collections?.[col]?.find(entry => String(entry.name).toLowerCase() === String(name).toLowerCase());
    // A new entry may use a plural noun; removals must resolve the exact stored identifier.
    const acquiredItem = (owner, col, name) => owner?.collections?.[col]?.find(entry => String(entry.name).toLowerCase().replace(/s$/, '') === String(name).toLowerCase().replace(/s$/, ''));
    const initialItem = (col, name) => heldItem(state.player, col, name);
    const actor = name => u.characters?.find(c => includes(c.name, name));
    const stat = (name) => u.player?.stats?.[name] ?? u.player?.[name] ?? state.player.stats[name];
    const effectiveStat = name => normalized?.effective?.player?.stats?.[name];
    const effectiveNpcStat = (actorName, field) => normalized?.effective?.characters?.find(actor => includes(actor.name, actorName))?.stats?.[field];
    const current = value => Number(String(value ?? '').split('/')[0]);
    const belowCapacity = value => { const parts = String(value ?? '').split('/').map(Number); return parts.length === 2 && parts[0] < parts[1]; };
    const inventory = owner => Object.values(owner?.collections || {}).some(col => ['add', 'remove', 'update'].some(verb => col?.[verb]?.length));
    const methods = {
        placeCreated: name => rows.some(row => row.kind === 'location-create' && includes(row.actor, name)),
        currentPlace: name => currentPlaceContains(rows, state, name),
        placeParent: (childName, parentName) => {
            const child = rows.find(row => row.kind === 'location-create' && includes(row.actor, childName));
            const parent = rows.find(row => row.kind === 'location-create' && includes(row.actor, parentName));
            return Boolean(child && parent && child.location?.record?.parentId === parent.location?.id);
        },
        placeRoot: name => rows.some(row => row.kind === 'location-create' && includes(row.actor, name)
            && row.location?.record?.parentId === ''),
        createdPlaceCount: count => rows.filter(row => row.kind === 'location-create').length === count,
        worldContains: (key, value) => includes(u.global?.[key] ?? state.global[key], value),
        npcPresent: name => Boolean(actor(name) && !actor(name).offstage),
        noXp: () => Number.parseFloat(stat('XP') || '0') === Number.parseFloat(state.player.stats.XP || '0'),
        noNpcXp: name => {
            const before = state.characters.find(char => includes(char.name, name))?.stats?.XP;
            const after = actor(name)?.stats?.XP ?? actor(name)?.XP ?? before;
            return Number.parseFloat(after || '0') === Number.parseFloat(before || '0');
        },
        noMovement: () => !rows.some(row => row.kind === 'location-current'),
        noPlaceCreated: name => !rows.some(row => row.kind === 'location-create' && includes(row.actor, name)),
        noInventoryChanges: () => !inventory(u.player) && !(u.characters || []).some(inventory),
        noInventoryAddsOrRemoves: () => [u.player, ...(u.characters || [])].every(owner =>
            Object.values(owner?.collections || {}).every(col => !(col?.add?.length || col?.remove?.length))),
        noPlayerInventoryChanges: () => !inventory(u.player),
        playerValue: (name, value) => String(stat(name)) === value,
        appliedPlayerValue: (name, value) => String(effectiveStat(name)) === value,
        appliedNpcValue: (name, field, value) => String(effectiveNpcStat(name, field)) === value,
        playerIncreased: name => current(effectiveStat(name)) > current(state.player.stats[name]),
        playerBelowCapacity: name => belowCapacity(effectiveStat(name)),
        playerDecreased: name => current(effectiveStat(name)) < current(state.player.stats[name]),
        playerUnchanged: name => String(effectiveStat(name)) === String(state.player.stats[name]),
        itemAdd: (col, name, quantity) => Number(acquiredItem(normalized?.holdings?.player, col, name)?.quantity) === Number(initialItem(col, name)?.quantity || 0) + quantity,
        itemRemove: (col, name, quantity) => quantity === undefined ? !heldItem(normalized?.holdings?.player, col, name) : Number(heldItem(normalized?.holdings?.player, col, name)?.quantity || 0) === Number(initialItem(col, name)?.quantity) - quantity,
        npcItemAdd: (name, col, itemName, quantity) => Number(acquiredItem(heldActor(name), col, itemName)?.quantity) === quantity,
        npcIncreased: (name, field) => Number(actor(name)?.stats?.[field] ?? actor(name)?.[field]) > Number(state.characters.find(c => c.name === name)?.stats[field]),
        npcAppliedIncreased: (name, field) => current(effectiveNpcStat(name, field)) > current(state.characters.find(c => c.name === name)?.stats[field]),
        npcBelowCapacity: (name, field) => belowCapacity(effectiveNpcStat(name, field)),
        notRemoved: (col, name) => Boolean(heldItem(normalized?.holdings?.player, col, name)),
        relationshipUnchanged: name => !(actor(name)?.stats?.Relationship ?? actor(name)?.Relationship) || (actor(name)?.stats?.Relationship ?? actor(name)?.Relationship) === state.characters.find(c => c.name === name)?.stats.Relationship,
    };
    return [{ name: 'validJsonAndNotTruncated', critical: true, passed: Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && finishReason === 'stop') },
        { name: 'preservedPoolMaxima', critical: true, passed: changedPoolMaxima(raw, state).length === 0 },
        ...bundle.scenario.checks.map(([name, ...params]) => ({ name: `${name} ${params.filter(v => v !== true).join(' ')}`, critical: params.at(-1) === true,
            passed: Boolean(methods[name](...params.filter(v => v !== true))) }))];
}
const output = action === '--score' ? JSON.parse(readFileSync(file('results'))) : { startedAt: new Date().toISOString(), label, criteria,
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
                body: JSON.stringify({ model: server.model, messages: bundle.messages, max_tokens: bundle.settings.extractionMaxTokens || 1200, stream: false }) });
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
            let parsed = null;
            try { parsed = JSON.parse(content.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')); } catch {}
            const reader = await harness(bundle.scenario.system, bundle.state);
            let normalized = null, error = null;
            try { if (parsed) normalized = reader.normalize(parsed, bundle.scenario.text); } catch (err) { error = err.stack; }
            const checks = score(bundle, normalized, parsed, choice?.finish_reason);
            output.trials.push({ id: bundle.scenario.id, system: bundle.scenario.system, holdout: Boolean(bundle.scenario.holdout), repeat,
                endpoint, elapsedMs, requestError, finishReason: choice?.finish_reason, usage: completion?.usage, content, parsed, normalized, error, checks });
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
    trial.normalized = trial.parsed ? reader.normalize(trial.parsed, bundle.scenario.text) : null;
    trial.checks = score(bundle, trial.normalized, trial.parsed, trial.finishReason);
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
