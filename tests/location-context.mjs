import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildLocationSceneContext, buildLocationReaderNotes, recentLocationMessages,
    mentionsLocation, locationExtractionSchema } from '../src/locations/location-context.js';

const record = (id, name, extra = {}) => ({ id, name, aliases: [], description: `Facts about ${name}`, parentId: '', ...extra });
const state = () => ({ locations: { enabled: true, currentId: 'inn', records: {
    inn: record('inn', 'Rusty Lantern', { aliases: ['the Lantern'], parentId: 'town' }),
    town: record('town', 'Ashford'), ruins: record('ruins', 'Old Ruins'),
    other: record('other', 'Unmentioned Cave'),
} } });
const json = context => JSON.parse(context.slice(context.indexOf('{')));

test('reader recognizes an established opening scene without requiring travel', () => {
    const current = { locations: { enabled: true, currentId: '', records: {} } };
    const notes = buildLocationReaderNotes(current, 'You sit inside the Copper Lantern tavern.');
    assert.match(notes, /opening scene/);
    assert.match(notes, /establishes the current place without any travel/);
    assert.match(notes, /set currentRef to the same ref/);
    assert.match(notes, /"sceneMarker":\{"lastConfirmedRef":null\}/);
    assert.doesNotMatch(notes, /"lastConfirmedCurrentRef"/);
    assert.match(notes, /top-level "locations" object/);
    assert.match(notes, /"characters":\[\],"locations":\{"places":/);
    assert.match(notes, /Mentioning a place, remembering it, planning travel/);
    assert.match(notes, /opening a door, inviting the player inside/);
    assert.match(notes, /never join excerpts with ellipses/);
});

test('recall includes current ancestors and places named by the player without a global dump', () => {
    const current = state();
    const before = structuredClone(current);
    const context = buildLocationSceneContext(current, recentLocationMessages([
        { is_user: true, mes: 'What happened at the Old Ruins?' }, { mes: 'You wait.' },
    ]));
    assert.match(context, /^Known places:\n- Rusty Lantern \(last confirmed setting; in Ashford; also known as the Lantern\) — Facts about Rusty Lantern/m);
    assert.match(context, /- Ashford — Facts about Ashford/);
    assert.match(context, /- Old Ruins — Facts about Old Ruins/);
    assert.doesNotMatch(context, /"ref"|lastConfirmedCurrentRef|\binn\b|\btown\b|\bruins\b/);
    assert.deepEqual(current, before);
});

test('literal Unicode boundaries and punctuation aliases never run user patterns', () => {
    assert.equal(mentionsLocation('Ashfordian', 'Ashford'), false);
    assert.equal(mentionsLocation('éAshford', 'Ashford'), false);
    assert.equal(mentionsLocation('Visit ASHFORD.', 'Ashford'), true);
    assert.equal(mentionsLocation('anything', '.*'), false);
    assert.equal(mentionsLocation('The [Moon] glows.', '[Moon]'), true);
    assert.equal(mentionsLocation('éclairshop', 'éclair'), false);
});

test('ambiguous aliases do not recall either record or infer a current destination', () => {
    const current = state(); current.locations.currentId = '';
    current.locations.records.inn.aliases = ['the hall'];
    current.locations.records.ruins.aliases = ['the hall'];
    assert.equal(buildLocationSceneContext(current, ['We enter the hall.']), '');
    assert.equal(current.locations.currentId, '');
});

test('disabled locations contribute no narrator or reader context', () => {
    const current = state(); current.locations.enabled = false;
    assert.equal(buildLocationSceneContext(current, ['Old Ruins']), '');
    assert.equal(buildLocationReaderNotes(current, 'We arrive.'), '');
    assert.equal(buildLocationSceneContext({}), '');
});

test('recent messages retain latest player input and remain bounded', () => {
    const chat = [{ is_user: true, mes: 'Old Ruins' },
        ...Array.from({ length: 12 }, () => ({ mes: 'a'.repeat(3000) }))];
    const recent = recentLocationMessages(chat);
    assert.equal(recent.length, 7);
    assert.equal(recent[0], 'Old Ruins');
    assert.ok(recent.every(text => text.length <= 1200));
});

test('reader directory preserves identities with selected full descriptions and partial-list warning', () => {
    const current = state();
    current.locations.records.inn.description = 'x'.repeat(4000);
    for (let i = 0; i < 100; i++) current.locations.records[`p${i}`] = record(`p${i}`, `Place ${i}`);
    const notes = buildLocationReaderNotes(current, 'We enter the Old Ruins.');
    const directory = json(notes.slice(notes.indexOf('Directory JSON')));
    assert.equal(directory.places[0].ref, 'inn');
    assert.equal(directory.places[0].description.length, 4000);
    assert.ok(directory.places.length <= 80);
    assert.match(notes, /directory is partial/);
    assert.match(notes, /every place proposal requires one continuous exact quote/i);
    assert.match(notes, /explicit departure with no known destination/);
    assert.ok(notes.length < 27000);
    assert.ok(!directory.places.find(place => place.ref === 'other')?.description);
});

test('narrator context remains bounded under large saved records', () => {
    const current = state();
    for (const place of Object.values(current.locations.records)) {
        place.description = 'x'.repeat(4000);
        place.aliases = Array.from({ length: 30 }, (_, i) => `${place.id} ${i} ${'a'.repeat(180)}`);
    }
    assert.ok(buildLocationSceneContext(current, ['Old Ruins Unmentioned Cave']).length < 14500);
});

test('schema allows field omission for updates and requires quoted place evidence', () => {
    const schema = locationExtractionSchema();
    assert.deepEqual(schema.properties.places.items.required, ['ref', 'evidence']);
    assert.equal(schema.required, undefined);
    assert.equal(schema.properties.currentEvidence.type, 'string');
});

test('lore helpers only read entries and return detached scalar data', async () => {
    const source = readFileSync(new URL('../src/locations/location-lore.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ')
        .replaceAll('export async function ', 'async function ');
    let loads = 0;
    const api = new Function('world_names', 'loadWorldInfo', source
        + '\nreturn {listLocationLorebooks,listLocationLoreEntries,readLocationLoreEntry};')(['Story'], async () => {
        loads++;
        return { entries: { 0: { uid: 0, comment: 'Lantern', content: 'Warm hearth.' } } };
    });
    assert.deepEqual(api.listLocationLorebooks(), ['Story']);
    assert.deepEqual(await api.listLocationLoreEntries('missing'), []);
    assert.equal(loads, 0);
    assert.deepEqual(await api.readLocationLoreEntry('Story', 0), { uid: 0, name: 'Lantern', content: 'Warm hearth.' });
    assert.equal(await api.readLocationLoreEntry('Story', 9), null);
});

const sourceWithoutImports = path => readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');

test('scene and inline narrator prompts wire place recall to live player messages', () => {
    const current = state(); current.locations.currentId = '';
    const deps = {
        committedState: current, formatCompactStatus: (_state, _detail, places) => ['Character facts.', places].filter(Boolean).join('\n'),
        describeNpcStatFields: () => '',
    };
    const settings = { collections: [], npcTemplates: [] };
    new Function('getSettings', 'getContext', 'buildLocationSceneContext', 'recentLocationMessages',
        'describeStatDefinitions', 'promptText', 'applyMacros', 'DEFAULT_INLINE_RULES', 'progressionFields',
        sourceWithoutImports('../src/tracker/status-scene-prompt.js') + '\nreturn bind;')(
        () => ({ statusTracker: settings }), () => ({ chat: [{ is_user: true, mes: 'Old Ruins' }] }),
        buildLocationSceneContext, recentLocationMessages, () => '', (_id, values) => `Inline instructions.\n${values.status}`,
        text => text, '', () => ({ enabled: false }))(deps);
    for (const context of [deps.buildSceneContext(), deps.getStatusInstructions()]) {
        assert.match(context, /Old Ruins/);
        assert.ok(!context.includes('Unmentioned Cave'));
        assert.doesNotMatch(context, /"ref"|lastConfirmedCurrentRef/);
    }
});

test('reader schema integration opts in without making locations mandatory', () => {
    const build = new Function('progressionFields', 'configuredXpName', 'numericDeltaNames', 'npcTemplates',
        'locationExtractionSchema', sourceWithoutImports('../src/tracker/extractor/status-extractor-schema.js')
        + '\nreturn buildExtractionSchema;')(() => ({ enabled: false }), () => '', () => [], () => [], locationExtractionSchema);
    const disabled = build({}, { state: {} });
    const enabled = build({}, { state: state() });
    assert.equal(disabled.properties.locations, undefined);
    assert.deepEqual(enabled.properties.locations, locationExtractionSchema());
    assert.ok(!enabled.required.includes('locations'));
});
