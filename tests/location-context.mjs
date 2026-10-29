import { bindStatusModule } from './helpers/status-module.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildLocationSceneContext, buildLocationReaderNotes,
    mentionsLocation, locationExtractionSchema } from '../src/locations/location-context.js';

const record = (id, name, extra = {}) => ({ id, name, aliases: [], description: `Facts about ${name}`, parentId: '', ...extra });
const state = () => ({ locations: { enabled: true, currentId: 'inn', records: {
    inn: record('inn', 'Rusty Lantern', { aliases: ['the Lantern'], parentId: 'town' }),
    town: record('town', 'Ashford'), ruins: record('ruins', 'Old Ruins'),
    other: record('other', 'Unmentioned Cave'),
} } });

test('narrator marker preserves the current place tree without duplicating lore descriptions', () => {
    const current = state();
    const before = structuredClone(current);
    const context = buildLocationSceneContext(current);
    assert.ok(context.includes('Ashford') && context.includes('Rusty Lantern'));
    assert.ok(context.indexOf('Ashford') < context.indexOf('Rusty Lantern'));
    assert.doesNotMatch(context, /Facts about|the Lantern|Old Ruins|Unmentioned Cave|"id"|"parentId"/);
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

test('place mentions cannot infer a current destination', () => {
    const current = state(); current.locations.currentId = '';
    assert.equal(buildLocationSceneContext(current, ['We enter the Old Ruins.']), '');
    assert.equal(current.locations.currentId, '');
});

test('disabled locations contribute no narrator or reader context', () => {
    const current = state(); current.locations.enabled = false;
    assert.equal(buildLocationSceneContext(current, ['Old Ruins']), '');
    assert.equal(buildLocationReaderNotes(current, 'We arrive.'), '');
    assert.equal(buildLocationSceneContext({}), '');
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

test('schema allows uncited place discoveries and field omission for updates', () => {
    const schema = locationExtractionSchema();
    assert.deepEqual(schema.properties.places.items.required, ['name']);
    assert.equal(schema.required, undefined);
});

const sourceWithoutImports = path => readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');

test('scene and inline narrator prompts include the current location marker', () => {
    const current = state();
    const deps = {
        committedState: current, formatCompactStatus: (_state, _detail, places) => ['Character facts.', places].filter(Boolean).join('\n'),
        describeNpcStatFields: () => '',
    };
    const settings = { collections: [], npcTemplates: [] };
    bindStatusModule(new URL('../src/tracker/status-scene-prompt.js', import.meta.url), deps, {
        getSettings: () => ({ statusTracker: settings }), getContext: () => ({ chat: [{ is_user: true, mes: 'Old Ruins' }] }),
        buildLocationSceneContext, describeStatDefinitions: () => '',
        promptText: (_id, values) => `Inline instructions.\n${values.status}`,
        applyMacros: text => text, DEFAULT_INLINE_RULES: '', progressionFields: () => ({ enabled: false }),
    });
    for (const context of [deps.buildSceneContext(), deps.getStatusInstructions()]) {
        assert.match(context, /Rusty Lantern/);
        assert.match(context, /Ashford/);
        assert.doesNotMatch(context, /Old Ruins|Facts about/);
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
