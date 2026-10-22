import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createInitialSettings } from '../src/core/settings-initial.js';
import { defaultSettings } from '../src/core/settings-defaults.js';
import { normalizeSystemDefinition, projectSystemTracker, SYSTEM_SCHEMA_VERSION } from '../src/core/system-schema.js';
import { systemStatFields } from '../src/core/system-fields.js';
import { captureNpcRoster } from '../src/characters/system-npc-roster.js';

function library() {
    const settings = createInitialSettings();
    const key = 'Fantasy Adventure';
    settings.activeSystem = key;
    const context = { getCurrentChatId: () => 'library-fixture',
        chatMetadata: { sillynpc_system: key, sillynpc_npcs: [{ id: 'mira', name: 'Mira', profile: { age: '25' } }] } };
    let saves = 0;
    const noop = () => {};
    const inputs = {
        getSettings: () => settings,
        saveSettings: () => { saves++; captureNpcRoster(settings, context); },
        defaultSettings, normaliseStatDefs: noop, normaliseNpcPersistence: noop,
        normaliseStatUpdatePolicies: noop, normalizeTrackerProgression: noop,
        normalizeSystemDefinition, projectSystemTracker, SYSTEM_SCHEMA_VERSION, systemStatFields, debugLog: noop,
    };
    const source = readFileSync(new URL('../src/tracker/status-system-presets.js', import.meta.url), 'utf8')
        .replace(/^import[\s\S]*?;\s*/gm, '').replace('export function bind(deps)', 'function bind(deps)');
    const deps = { chatHasStarted: () => true, getChatSystem: () => context.chatMetadata.sillynpc_system };
    new Function(...Object.keys(inputs), `${source}\nreturn bind;`)(...Object.values(inputs))(deps);
    return { settings, context, key, deps, saves: () => saves };
}

test('renaming preserves chat/roster ownership, canonical ID, capture and restoration', () => {
    const { settings, context, key, deps } = library();
    settings.systemNpcRosters = { [key]: { enabled: true, cards: [] } };
    const id = settings.statusTracker.presets[key].definition.id;
    assert.equal(deps.editSystemDetails(key, '  My Adventure  ', '  Explore the coast  '), true);
    assert.equal(settings.activeSystem, key);
    assert.equal(context.chatMetadata.sillynpc_system, key);
    deps.saveSystemPreset(key, settings.statusTracker.presets[key].metadata.description);
    const saved = settings.statusTracker.presets[key];
    assert.equal(saved.metadata.name, 'My Adventure');
    assert.equal(saved.definition.name, 'My Adventure');
    assert.equal(saved.definition.id, id);
    assert.equal(saved.definition.metadata.description, 'Explore the coast');
    assert.equal(saved.metadata.description, 'Explore the coast');
    assert.equal(settings.systemNpcRosters[key].cards[0].name, 'Mira');
    const migrated = deps.migratePreset(key, saved);
    assert.equal(migrated.metadata.name, 'My Adventure');
    assert.equal(migrated.definition.name, 'My Adventure');
    const exported = deps.importSystemPreset(JSON.stringify(saved.definition));
    assert.equal(exported.metadata.name, 'My Adventure (2)');
    settings.activeSystem = 'elsewhere';
    assert.equal(deps.setActiveSystem(context.chatMetadata.sillynpc_system), true);
    assert.equal(settings.activeSystem, key);
    assert.equal(settings.statusTracker.presets[key].definition.name, 'My Adventure');
    assert.equal(deps.editSystemDetails(key, 'My Adventure', ''), true);
    assert.equal(settings.statusTracker.presets[key].definition.metadata.description, '');
});

test('invalid names cannot overwrite a saved key or another display name', () => {
    const { settings, key, deps, saves } = library();
    const other = deps.importSystemPreset(JSON.stringify(normalizeSystemDefinition({ name: 'Other' })));
    const count = saves();
    for (const name of ['', '   ', 'Other']) assert.equal(deps.editSystemDetails(key, name, 'changed'), false);
    assert.equal(saves(), count);
    assert.equal(settings.statusTracker.presets.Other, other);
    assert.equal(deps.editSystemDetails('Other', 'Renamed', ''), true);
    assert.equal(deps.editSystemDetails(key, 'Renamed', ''), false);
    assert.equal(deps.editSystemDetails(key, 'Other', ''), false);
    deps.chatHasStarted = () => false;
    assert.equal(deps.createSystem('Renamed'), false);
});

test('active duplication captures current controls and independently copies NPCs, Places and memories', () => {
    const { settings, context, key, deps } = library();
    const source = settings.statusTracker.presets[key];
    source.definition.memories.carryOver = true;
    context.chatMetadata.sillynpc_status_state = { npcMemories: { 'id:mira': {
        entries: [{ id: 'remember', text: 'A friend' }], archive: [],
    } } };
    settings.systemNpcRosters = { [key]: { enabled: true, reusePlaces: true, cards: [],
        memories: { mira: { entries: [{ id: 'remember', text: 'A friend' }], archive: [] } },
        places: { harbor: { id: 'harbor', name: 'Harbor' } } } };
    settings.statusTracker.hudLayout = 'pips';
    const beforeChat = structuredClone(context.chatMetadata);
    const copy = deps.duplicateSystem(key);
    const name = copy.metadata.name;
    assert.equal(name, 'Fantasy Adventure (copy)');
    assert.notEqual(copy.definition.id, source.definition.id);
    assert.equal(copy.definition.hud.layout, 'pips');
    assert.deepEqual(copy.definition.stats, source.definition.stats);
    assert.equal(settings.activeSystem, key);
    assert.equal(context.chatMetadata.sillynpc_system, beforeChat.sillynpc_system);
    assert.equal(settings.systemNpcRosters[name].cards[0].name, 'Mira');
    assert.deepEqual(settings.systemNpcRosters[name], settings.systemNpcRosters[key]);
    settings.systemNpcRosters[name].cards[0].profile.age = '30';
    settings.systemNpcRosters[name].places.harbor.name = 'New harbor';
    settings.systemNpcRosters[name].memories.mira.entries[0].text = 'Changed';
    copy.definition.stats.character[0].name = 'Changed';
    assert.equal(settings.systemNpcRosters[key].cards[0].profile.age, '25');
    assert.equal(settings.systemNpcRosters[key].places.harbor.name, 'Harbor');
    assert.equal(settings.systemNpcRosters[key].memories.mira.entries[0].text, 'A friend');
    assert.notEqual(source.definition.stats.character[0].name, 'Changed');
    assert.equal(deps.duplicateSystem(key).metadata.name, 'Fantasy Adventure (copy) 2');
    assert.equal(deps.duplicateSystem('missing'), null);
});

test('inactive duplication retains its own settings and supports Places carryover alone', () => {
    const { settings, key, deps } = library();
    settings.systemNpcRosters = { [key]: { enabled: false, reusePlaces: true, cards: [],
        places: { harbor: { id: 'harbor', name: 'Harbor' } } } };
    settings.activeSystem = 'another';
    settings.statusTracker.hudLayout = 'pips';
    const before = structuredClone(settings.statusTracker.presets[key]);
    const copy = deps.duplicateSystem(key);
    assert.equal(copy.definition.hud.layout, before.definition.hud.layout);
    assert.deepEqual(copy.config, before.config);
    assert.deepEqual(settings.systemNpcRosters[copy.metadata.name], settings.systemNpcRosters[key]);
    assert.equal(settings.activeSystem, 'another');
    assert.deepEqual(settings.statusTracker.presets[key], before);
});
