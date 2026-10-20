import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readLocationStore } from '../src/locations/location-store.js';
import { locationExtractionSchema, mentionsLocation } from '../src/locations/location-context.js';
import { promptText } from '../src/prompts/prompt-texts.js';

const place = (id, name, extra = {}) => ({ id, name, aliases: [], description: '', parentId: '', ...extra });
const state = () => ({ locations: { enabled: true, currentId: 'private-inn-id', records: {
    'private-inn-id': place('private-inn-id', 'Copper Lantern', {
        aliases: ['the Lantern'], description: 'A warm roadside inn.', parentId: 'private-town-id',
    }),
    'private-town-id': place('private-town-id', 'Ashford', { description: 'A riverside town.' }),
    'private-ruins-id': place('private-ruins-id', 'Old Ruins', { aliases: ['the broken tower'] }),
    'private-other-id': place('private-other-id', 'Unmentioned Cave'),
} } });

function fixture(reply = {}) {
    const source = readFileSync(new URL('../src/locations/location-reader.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replace(/^export\s+(?=(?:async\s+)?function|const|let|class)/gm, '');
    const requests = [];
    const dependencies = {
        readLocationStore, locationExtractionSchema, mentionsLocation, promptText,
        requestExtraction: async (...args) => { requests.push(args); return reply; },
        coerceToUpdate: raw => {
            if (raw && typeof raw === 'object') return Array.isArray(raw) ? null : raw;
            try { return JSON.parse(String(raw)); } catch { return null; }
        },
    };
    const api = new Function(...Object.keys(dependencies),
        `${source}\nreturn { buildLocationPrompt, requestLocationReading };`)(...Object.values(dependencies));
    return { ...api, requests };
}

const input = overrides => ({ state: state(), messageText: 'We enter the broken tower.',
    earlier: ['We leave the Lantern.'], playerName: 'Alex', ...overrides });

test('the dedicated reader sees current place, aliases, parent names and known destinations', () => {
    const f = fixture();
    const args = input();
    const before = structuredClone(args);
    const prompt = f.buildLocationPrompt(args);
    for (const text of ['Copper Lantern', 'the Lantern', 'Ashford', 'Old Ruins', 'the broken tower',
        'A warm roadside inn.', 'We enter the broken tower.', 'We leave the Lantern.', 'Alex']) {
        assert.ok(prompt.includes(text), `Missing location context: ${text}`);
    }
    assert.doesNotMatch(prompt, /private-(?:inn|town|ruins|other)-id|parentId/);
    assert.deepEqual(args, before);
});

test('opening scenes have an explicit unknown current place and include the opening evidence', () => {
    const f = fixture();
    const prompt = f.buildLocationPrompt(input({ state: { locations: { enabled: true, records: {}, currentId: '' } },
        messageText: 'Alex wakes beneath the observatory dome.', earlier: [] }));
    assert.match(prompt, /observatory dome/);
    assert.match(prompt, /unknown|null|none|unestablished/i);
    assert.doesNotMatch(prompt, /\{\{\w+\}\}/);
});

test('the location prompt grounds destination and place details in the player scene', () => {
    const prompt = fixture().buildLocationPrompt(input());
    assert.match(prompt, /player|Alex/i);
    assert.match(prompt, /"places"/);
    assert.match(prompt, /"current"/);
    assert.match(prompt, /aliases/);
    assert.match(prompt, /parent/);
    assert.match(prompt, /description/);
    assert.match(prompt, /plans|rumours|mentions|established/i);
    assert.doesNotMatch(prompt, /player\.stats|globalDeltas|capacity growth|level-up|UUID|parentRef|currentRef/);
});

test('the location reader bounds saved context and earlier conversation without mutating either', () => {
    const current = state();
    for (let i = 0; i < 300; i++) {
        const id = `extra-${i}`;
        current.locations.records[id] = place(id, `Venue ${i}`, {
            aliases: Array.from({ length: 30 }, (_, n) => `Alias ${i} ${n} ${'a'.repeat(180)}`),
            description: 'x'.repeat(4000),
        });
    }
    const args = input({ state: current, earlier: Array.from({ length: 300 }, (_, i) => ({
        is_user: i % 2 === 0, mes: `Message ${i}. ${'y'.repeat(5000)}`,
    })) });
    const before = structuredClone(args);
    const prompt = fixture().buildLocationPrompt(args);
    assert.ok(prompt.length < 65000, `Oversized location prompt: ${prompt.length}`);
    assert.deepEqual(args, before);
});

test('the dedicated request uses the reader connection settings, location schema and own system message', async () => {
    const raw = { places: [{ name: 'Old Ruins', description: 'A roofless stone tower.', parent: 'Ashford' }],
        current: 'Old Ruins' };
    const f = fixture(raw);
    const trackerSettings = { extractionProfileId: 'local-gemma', extractionUseSchema: true, extractionMaxTokens: 1200 };
    const result = await f.requestLocationReading(input({ trackerSettings }));
    assert.deepEqual(result, { output: raw, raw, warnings: [] });
    assert.equal(f.requests.length, 1);
    const [user, schema, settings, system, options] = f.requests[0];
    assert.equal(user, f.buildLocationPrompt(input()));
    assert.deepEqual(schema, locationExtractionSchema());
    assert.equal(settings, trackerSettings);
    assert.equal(system, promptText('locationReaderSystem'));
    assert.match(system, /place|location/i);
    assert.doesNotMatch(system, /tracker update|stats|NPC present/);
    assert.deepEqual(options, { usageKind: 'location' });
});

test('a no-change location response preserves the raw reply without inventing an update', async () => {
    for (const raw of [{}, '{}', null]) {
        const result = await fixture(raw).requestLocationReading(input({ trackerSettings: {} }));
        assert.equal(result.output, null);
        assert.equal(result.raw, raw);
        assert.deepEqual(result.warnings, []);
    }
});

test('explicit departure may clear the current place while partial record updates stay partial', async () => {
    const raw = { current: '', places: [{ name: 'Copper Lantern', aliases: ['Lantern Inn'] }] };
    const result = await fixture(raw).requestLocationReading(input({ trackerSettings: {} }));
    assert.deepEqual(result.output, raw);
    assert.equal(Object.hasOwn(result.output.places[0], 'parent'), false);
    assert.equal(Object.hasOwn(result.output.places[0], 'description'), false);
});

test('unsupported response and place fields produce warnings while valid facts survive', async () => {
    const raw = { current: 'Blue Heron Inn', confidence: 0.9, places: [
        { name: 'Blue Heron Inn', description: 'An inn in Brackenport.' },
        { name: 'Brackenport', type: 'town', id: 'model-owned-id' },
    ] };
    const before = structuredClone(raw);
    const result = await fixture(raw).requestLocationReading(input());
    assert.deepEqual(result.output, { current: 'Blue Heron Inn', places: [
        { name: 'Blue Heron Inn', description: 'An inn in Brackenport.' },
        { name: 'Brackenport' },
    ] });
    assert.equal(result.warnings.length, 2);
    assert.match(result.warnings[0], /response: "confidence"/);
    assert.match(result.warnings[1], /places\[1\]: "type", "id"/);
    assert.equal(Object.hasOwn(result.output.places[0], 'parent'), false);
    assert.deepEqual(result.raw, before);
    assert.deepEqual(raw, before);
});

test('unsupported fields alone leave state unchanged and report the ignored fields', async () => {
    const result = await fixture({ locations: { current: 'Inn' } }).requestLocationReading(input());
    assert.equal(result.output, null);
    assert.match(result.warnings[0], /response: "locations"/);
});

test('malformed location replies fail visibly instead of producing a location proposal', async () => {
    for (const raw of ['', 'not JSON', [], { places: {} }, { places: [null] },
        { places: [{ description: 'Nameless' }] }, { places: [{ name: 7 }] },
        { places: [{ name: 'Inn', aliases: 'Lantern' }] },
        { places: [{ name: 'Inn', aliases: [false] }] }, { places: [{ name: 'Inn', parent: 5 }] },
        { places: [{ name: 'Inn', description: false }] }, { current: false }]) {
        await assert.rejects(fixture(raw).requestLocationReading(input({ trackerSettings: {} })),
            /Invalid location reading/, `Expected rejection for ${JSON.stringify(raw)}`);
    }
});
