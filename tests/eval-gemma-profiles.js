// Explicit opt-in local evaluation. Freeze before running: no user chat/settings are changed.
// node tests/eval-gemma-profiles.js --freeze
// node tests/eval-gemma-profiles.js --run --repeats 1
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { profileHarness } from './fixtures/gemma-profile-harness.mjs';
import { profileScenarios, profileCriteria } from './fixtures/gemma-profile-scenarios.mjs';

const action = process.argv[2];
if (!['--freeze', '--run', '--score'].includes(action)) throw Error('Use --freeze, --run, or --score');
const directory = new URL('../docs/evaluations/', import.meta.url);
mkdirSync(directory, { recursive: true });
const file = kind => new URL(`gemma-e4b-profiles-${kind}.json`, directory);

function score(scenario, applied) {
    const profile = applied.profile || {};
    const allText = Object.values(profile).join(' ').toLowerCase();
    const checks = [{ name: 'readable response and expected format', critical: true, passed: applied.readable }];
    for (const [kind, ...args] of scenario.checks) {
        let passed = false;
        if (kind === 'preserved') passed = profile[args[0]] === args[1];
        else if (kind === 'omitted') passed = !String(profile[args[0]] || '').trim();
        else if (kind === 'avoid') passed = args[0].every(word => !allText.includes(word.toLowerCase()));
        else passed = args[0].some(word => String(profile[kind] || '').toLowerCase().includes(word.toLowerCase()));
        checks.push({ name: kind === 'avoid' ? 'no player detail copied' : `${kind}: ${kind === 'preserved' || kind === 'omitted' ? args[0] : args[0].join(' or ')}`,
            critical: profileCriteria.critical.includes(kind), passed });
    }
    return checks;
}
const rate = checks => checks.length ? checks.filter(c => c.passed).length / checks.length : 0;
function summarize(results) {
    const all = results.trials.flatMap(t => t.checks);
    const systems = Object.fromEntries(['fantasy-adventure', 'dating-sim'].map(system => [system,
        rate(results.trials.filter(t => t.system === system).flatMap(t => t.checks))]));
    const paths = Object.fromEntries(['fill', 'auto'].map(path => [path,
        rate(results.trials.filter(t => t.path === path).flatMap(t => t.checks))]));
    const criticalFailures = results.trials.flatMap(t => t.checks.filter(c => c.critical && !c.passed)
        .map(c => `${t.id} #${t.repeat + 1}: ${c.name}`));
    return { checks: all.length, passed: all.filter(c => c.passed).length, rate: rate(all), systems, paths,
        criticalFailures,
        acceptable: !criticalFailures.length && rate(all) >= profileCriteria.overallRequiredCheckRate
            && Object.values(systems).every(value => value >= profileCriteria.perSystemRequiredCheckRate)
            && Object.values(paths).every(value => value >= profileCriteria.perPathRequiredCheckRate) };
}

if (action === '--freeze') {
    const bundles = [];
    for (const scenario of profileScenarios) {
        const fixture = profileHarness(scenario);
        bundles.push({ scenario, messages: [
            { role: 'system', content: fixture.systemPrompt },
            { role: 'user', content: await fixture.prompt() },
        ], maxTokens: fixture.maxTokens });
    }
    writeFileSync(file('prompts'), JSON.stringify({ frozenAt: new Date().toISOString(), criteria: profileCriteria, bundles }, null, 2));
    console.log(`Frozen ${bundles.length} production profile prompts at ${file('prompts').pathname}`);
    process.exit(0);
}
const frozen = JSON.parse(readFileSync(file('prompts')));
const results = action === '--score' ? JSON.parse(readFileSync(file('results'))) : {
    startedAt: new Date().toISOString(), endpoint: 'http://127.0.0.1:9931/v1', criteria: profileCriteria,
    model: '', server: null, trials: [],
};
if (action === '--run') {
    const repeats = Number(process.argv[process.argv.indexOf('--repeats') + 1]) || 1;
    const models = await (await fetch(`${results.endpoint}/models`)).json();
    results.model = models.data?.[0]?.id || '';
    const props = await (await fetch('http://127.0.0.1:9931/props')).json();
    results.server = { build: props.build_info, model: props.model_path, defaults: props.default_generation_settings };
    for (let repeat = 0; repeat < repeats; repeat++) for (const bundle of frozen.bundles) {
        const start = Date.now();
        const response = await fetch(`${results.endpoint}/chat/completions`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: results.model, messages: bundle.messages,
                max_tokens: bundle.maxTokens, stream: false }) });
        if (!response.ok) throw Error(`${response.status}: ${await response.text()}`);
        const completion = await response.json(), choice = completion.choices?.[0];
        const fixture = profileHarness(bundle.scenario);
        let applied, error = null;
        try { applied = await fixture.apply(choice?.message?.content || '', choice?.finish_reason); }
        catch (caught) { error = caught.stack; applied = { readable: false, profile: {}, parsed: null }; }
        const checks = score(bundle.scenario, applied);
        results.trials.push({ id: bundle.scenario.id, path: bundle.scenario.path, system: bundle.scenario.system,
            repeat, elapsedMs: Date.now() - start, finishReason: choice?.finish_reason,
            usage: completion.usage, content: choice?.message?.content || '', applied, error, checks });
        results.summary = summarize(results);
        writeFileSync(file('results'), JSON.stringify(results, null, 2));
        console.log(`${bundle.scenario.id} #${repeat + 1}: ${checks.filter(c => c.passed).length}/${checks.length}`);
    }
}
if (action === '--score') for (const trial of results.trials) {
    const scenario = frozen.bundles.find(b => b.scenario.id === trial.id).scenario;
    const fixture = profileHarness(scenario);
    trial.applied = await fixture.apply(trial.content, trial.finishReason);
    trial.checks = score(scenario, trial.applied);
}
results.summary = summarize(results);
writeFileSync(file('results'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.summary, null, 2));
