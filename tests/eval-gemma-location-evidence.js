// Historical A/B replay using prompts frozen before the citation contract changed.
// node tests/eval-gemma-location-evidence.js
import { readFileSync, writeFileSync } from 'node:fs';
import { constants } from './fixtures/gemma-tracker-harness.mjs';

const endpoint = 'http://127.0.0.1:9931/v1';
const outputFile = new URL('../docs/evaluations/gemma-e4b-location-evidence-ab.json', import.meta.url);
const model = (await (await fetch(`${endpoint}/models`)).json()).data[0].id;

const same = (a, b) => String(a || '').toLocaleLowerCase() === String(b || '').toLocaleLowerCase();
function rawPlaceChecks(scenario, raw) {
    const places = Array.isArray(raw?.locations?.places) ? raw.locations.places : [];
    const find = name => places.find(place => same(place?.name, name));
    const check = (kind, ...args) => {
        if (kind === 'placeCreated') return Boolean(find(args[0]));
        if (kind === 'placeRoot') return Boolean(find(args[0]) && !find(args[0]).parentRef);
        if (kind === 'placeParent') return Boolean(find(args[0]) && find(args[1])
            && same(find(args[0]).parentRef, find(args[1]).ref));
        if (kind === 'currentPlace') return Boolean(find(args[0]) && same(raw?.locations?.currentRef, find(args[0]).ref));
        if (kind === 'createdPlaceCount') return places.filter(place =>
            !same(place?.name?.replace(/^the\s+/i, ''), scenario.system === 'fantasy' ? 'Rusty Lantern' : 'Moonbeam Café')).length === args[0];
        return null;
    };
    return scenario.checks.flatMap(([kind, ...args]) => {
        const passed = check(kind, ...args);
        return passed === null ? [] : [{ check: `${kind} ${args.filter(value => value !== true).join(' ')}`, passed }];
    });
}

const bundles = JSON.parse(readFileSync(outputFile, 'utf8')).bundles;
const output = { createdAt: new Date().toISOString(), model, endpoint, bundles, trials: [] };
for (let repeat = 0; repeat < 3; repeat++) for (const bundle of bundles) for (const variant of ['normal', 'noQuotes']) {
    const response = await fetch(`${endpoint}/chat/completions`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: constants.SYSTEM_PROMPT },
            { role: 'user', content: bundle[variant] }], max_tokens: 2400, stream: false }) });
    if (!response.ok) throw Error(`${response.status}: ${await response.text()}`);
    const choice = (await response.json()).choices?.[0];
    const content = choice?.message?.content || '';
    let raw = null;
    try { raw = JSON.parse(content.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')); } catch {}
    const checks = rawPlaceChecks(bundle.scenario, raw);
    output.trials.push({ id: bundle.scenario.id, repeat, variant, finishReason: choice?.finish_reason,
        content, raw, checks });
    writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`${bundle.scenario.id} ${variant} #${repeat + 1}: ${checks.filter(check => check.passed).length}/${checks.length}`);
}
