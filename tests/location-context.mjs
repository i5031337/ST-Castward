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

test('reader asks for a boolean movement flag and delegates unknown opening locations', () => {
    const notes = buildLocationReaderNotes({ locations: { enabled: true, currentId: '', records: {} } });
    assert.match(notes, /"locationChanged" at the top level as a JSON boolean/);
    assert.match(notes, /Use false when the recorded location is unknown/);
    assert.match(notes, /Recorded location .*: null/);
    assert.doesNotMatch(notes, /"places"|"current"|description|parent|location agent/);
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

test('reader receives only current location identities and containment context', () => {
    const current = state();
    current.locations.records.inn.description = 'x'.repeat(4000);
    const before = structuredClone(current);
    const notes = buildLocationReaderNotes(current, 'We enter the Old Ruins.');
    const path = JSON.parse(notes.split('Recorded location (current place first, then containing places): ')[1]);
    assert.deepEqual(path, [{ name: 'Rusty Lantern', aliases: ['the Lantern'] }, { name: 'Ashford' }]);
    assert.doesNotMatch(notes, /Old Ruins|Unmentioned Cave|xxxx|"id"|"parentId"/);
    assert.deepEqual(current, before);
});

test('narrator context remains bounded under large saved records', () => {
    const current = state();
    for (const place of Object.values(current.locations.records)) {
        place.description = 'x'.repeat(4000);
        place.aliases = Array.from({ length: 30 }, (_, i) => `${place.id} ${i} ${'a'.repeat(180)}`);
    }
    assert.ok(buildLocationSceneContext(current, ['Old Ruins Unmentioned Cave']).length < 14500);
});

test('schema allows uncited place discoveries and field omission for updates', () => {
    const schema = locationExtractionSchema();
    assert.deepEqual(schema.properties.places.items.required, ['name']);
    assert.equal(schema.required, undefined);
    assert.equal(schema.properties.places.items.properties.evidence, undefined);
    assert.equal(schema.properties.currentEvidence, undefined);
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

test('reader schema requires a movement boolean only when Places are enabled', () => {
    const build = new Function('progressionFields', 'configuredXpName', 'numericDeltaNames', 'npcTemplates',
        'locationExtractionSchema', sourceWithoutImports('../src/tracker/extractor/status-extractor-schema.js')
        + '\nreturn buildExtractionSchema;')(() => ({ enabled: false }), () => '', () => [], () => [], locationExtractionSchema);
    const disabled = build({}, { state: {} });
    const enabled = build({}, { state: state() });
    assert.equal(disabled.properties.locations, undefined);
    assert.equal(enabled.properties.locations, undefined);
    assert.equal(disabled.properties.locationChanged, undefined);
    assert.deepEqual(enabled.properties.locationChanged, { type: 'boolean' });
    assert.ok(enabled.required.includes('locationChanged'));
    assert.ok(!disabled.required.includes('locationChanged'));
});

test('movement instructions distinguish actual changes from mentioned destinations', () => {
    const notes = buildLocationReaderNotes(state());
    assert.match(notes, /Use true when the player finishes elsewhere or leaves/);
    assert.match(notes, /Use false when the player finishes in the recorded place, even if another character travels/);
    assert.match(notes, /Entering a different room counts as changing place/);
    assert.match(notes, /Plans, invitations, rumours, and mentions/);
    assert.doesNotMatch(notes, /UUID|temporary ref|parentRef|currentRef|"locations"/);
});
