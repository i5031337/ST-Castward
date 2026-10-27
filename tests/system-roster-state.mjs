import { bindStatusModule } from './helpers/status-module.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { captureNpcRoster, seedNpcRoster, setNpcRosterEnabled, setNpcRosterOption } from '../src/characters/system-npc-roster.js';
import { applyRosterStateSeed, clearRosterState } from '../src/characters/system-roster-state.js';
import { readNpcMemories, writeNpcMemories } from '../src/tracker/npc-memories.js';
import { invalidateMemoryStore } from '../src/core/profile-memories.js';
import { readLocationStore } from '../src/locations/location-store.js';

function fixture() {
    const settings = { activeSystem: 'A', statusTracker: { presets: { A: { definition: { memories: { carryOver: false } } }, B: {} }, npcStats: [] } };
    const card = { id: 'mira', name: 'Mira', profile: {} };
    const state = { player: { memories: ['Player secret'] }, locations: { enabled: true, currentId: 'inn', records: {
        town: { name: 'Town', aliases: ['Home'], description: 'A quiet town', parentId: '' },
        inn: { name: 'Inn', parentId: 'town', description: 'Warm hearth', lorebook: 'World', loreEntryId: 4 },
    } }, npcMemories: { 'id:mira': { entries: [{ id: 'remember', text: 'Met the player',
        sourceMessageId: '10', provenance: { chatId: 'old', systemId: 'A', sources: [
            { messageId: 10, fingerprint: 'old-reply', swipeId: 2 },
        ] } }], archive: [{ id: 'past', text: 'Old adventure' }] } } };
    const context = { getCurrentChatId: () => 'old', chat: [{ is_user: true }], chatMetadata: {
        sillynpc_system: 'A', sillynpc_npcs: [card], sillynpc_status_state: state,
    } };
    let number = 0;
    const makeId = () => `copy-${++number}`;
    const enable = () => {
        setNpcRosterEnabled(settings, context, 'A', true);
        setNpcRosterOption(settings, context, 'A', 'reusePlaces', true);
        settings.statusTracker.presets.A.definition.memories.carryOver = true;
        captureNpcRoster(settings, context);
    };
    const fresh = (name = 'A') => {
        settings.activeSystem = name;
        context.chat = [];
        context.chatMetadata = { sillynpc_system: name };
        seedNpcRoster(settings, context, makeId);
        const result = { global: {}, characters: [], player: { stats: { HP: '10' } } };
        applyRosterStateSeed(result, context.chatMetadata);
        context.chatMetadata.sillynpc_status_state = result;
        return result;
    };
    return { settings, context, card, state, makeId, enable, fresh };
}

test('Places and NPC memories are excluded by default, independently of NPC reuse', () => {
    const { settings, context, fresh } = fixture();
    setNpcRosterEnabled(settings, context, 'A', true);
    const state = fresh();
    assert.equal(state.locations, undefined);
    assert.equal(state.npcMemories, undefined);
    assert.equal(settings.systemNpcRosters.A.places, undefined);
    assert.equal(settings.systemNpcRosters.A.memories, undefined);
});

test('Places copy their graph and lore references independently while the current place resets', () => {
    const { settings, context, enable, fresh } = fixture();
    enable();
    const result = fresh();
    assert.equal(result.locations.currentId, '');
    assert.equal(result.locations.records.inn.parentId, 'town');
    assert.deepEqual(result.locations.records.town.aliases, ['Home']);
    assert.equal(result.locations.records.inn.loreEntryId, 4);
    result.locations.records.inn.description = 'Different hearth';
    assert.equal(settings.systemNpcRosters.A.places.inn.description, 'Warm hearth');
    assert.equal(captureNpcRoster(settings, context), true);
    assert.equal(fresh().locations.records.inn.description, 'Different hearth');
});

test('copied active and archived memories use the fresh NPC identity and survive old-source invalidation', () => {
    const { settings, context, enable, fresh } = fixture();
    enable();
    const result = fresh();
    const copy = context.chatMetadata.sillynpc_npcs[0];
    assert.notEqual(copy.id, 'mira');
    const memories = readNpcMemories(result, copy);
    assert.equal(memories.entries[0].text, 'Met the player');
    assert.equal(memories.archive[0].text, 'Old adventure');
    assert.equal(memories.entries[0].sourceMessageId, undefined);
    assert.equal(memories.entries[0].provenance, undefined);
    assert.equal(memories.entries[0].manual, true);
    assert.equal(invalidateMemoryStore(memories, [], 'A').removed.length, 0);
    assert.equal(result.player.memories, undefined);
    assert.equal(result.npcMemories['id:mira'], undefined);
    memories.entries[0].text = 'Edited in this chat';
    writeNpcMemories(result, copy, memories);
    assert.equal(settings.systemNpcRosters.A.memories.mira.entries[0].text, 'Met the player');
    captureNpcRoster(settings, context);
    const next = fresh();
    assert.equal(readNpcMemories(next, context.chatMetadata.sillynpc_npcs[0]).entries[0].text, 'Edited in this chat');
});

test('Places work without NPC reuse; memory reuse requires NPC reuse and honors both opt-outs', () => {
    const { settings, context, fresh } = fixture();
    setNpcRosterOption(settings, context, 'A', 'reusePlaces', true);
    const placesOnly = fresh();
    assert.equal(context.chatMetadata.sillynpc_npcs, undefined);
    assert.equal(Object.keys(placesOnly.locations.records).length, 2);
    assert.equal(placesOnly.npcMemories, undefined);
    setNpcRosterOption(settings, context, 'A', 'reusePlaces', false);
    assert.equal(fresh().locations, undefined);
    setNpcRosterEnabled(settings, context, 'A', true);
    settings.statusTracker.presets.A.definition.memories.carryOver = false;
    assert.equal(fresh().npcMemories, undefined);
});

test('unchanged older chats cannot overwrite newer map or memory edits', () => {
    const { settings, context, enable, fresh } = fixture();
    enable();
    const old = context.chatMetadata;
    const result = fresh();
    result.locations.records.inn.description = 'New map';
    const copy = context.chatMetadata.sillynpc_npcs[0];
    writeNpcMemories(result, copy, { entries: ['New memory'] });
    captureNpcRoster(settings, context);
    context.chatMetadata = old;
    assert.equal(captureNpcRoster(settings, context), false);
    assert.equal(settings.systemNpcRosters.A.places.inn.description, 'New map');
    assert.equal(settings.systemNpcRosters.A.memories.mira.entries[0].text, 'New memory');
});

test('started chats and user-created maps remain intact, and seeding never repeats', () => {
    const { settings, context, enable, fresh, makeId } = fixture();
    enable();
    context.chatMetadata = { sillynpc_system: 'A' };
    seedNpcRoster(settings, context, makeId);
    assert.equal(context.chatMetadata.sillynpc_roster_state_seed, undefined);
    context.chat = [];
    seedNpcRoster(settings, context, makeId);
    assert.equal(context.chatMetadata.sillynpc_roster_state_seed, undefined);
    const result = fresh();
    result.locations.records = {};
    seedNpcRoster(settings, context, makeId);
    assert.deepEqual(result.locations.records, {});
    context.chatMetadata = { sillynpc_system: 'A', sillynpc_status_state: {
        locations: { records: { user: { name: 'User place' } } },
    } };
    seedNpcRoster(settings, context, makeId);
    assert.deepEqual(Object.keys(context.chatMetadata.sillynpc_status_state.locations.records), ['user']);
});

test('System changes before play remove only seeded Places and NPC memories', () => {
    const { settings, context, enable, fresh, makeId } = fixture();
    enable();
    const result = fresh();
    const copy = context.chatMetadata.sillynpc_npcs[0];
    result.locations.records.local = { name: 'Local', parentId: 'town' };
    result.npcMemories['id:local'] = { entries: ['Local memory'] };
    settings.activeSystem = 'B';
    context.chatMetadata.sillynpc_system = 'B';
    seedNpcRoster(settings, context, makeId);
    assert.deepEqual(Object.keys(readLocationStore(result).records), ['local']);
    assert.equal(result.locations.records.local.parentId, '');
    assert.equal(result.npcMemories[`id:${copy.id}`], undefined);
    assert.equal(result.npcMemories['id:local'].entries[0], 'Local memory');
    assert.equal(settings.systemNpcRosters.B, undefined);
});

test('clear saved roster clears map and memories without republishing unchanged chat state', () => {
    const { settings, context, enable } = fixture();
    enable();
    clearRosterState(settings.systemNpcRosters.A);
    settings.systemNpcRosters.A.cards = [];
    assert.equal(captureNpcRoster(settings, context), false);
    assert.equal(settings.systemNpcRosters.A.places, undefined);
    assert.deepEqual(settings.systemNpcRosters.A.memories, {});
});

test('tracker-only saves publish Places and memory edits through the production storage boundary', () => {
    const { settings, context, enable, state, card } = fixture();
    enable();
    let saves = 0;
    const deps = { getMetadata: () => context.chatMetadata, hasOpenChat: () => true,
        currentChatId: () => 'old', stateOrigin: new WeakMap(), STATE_KEY: 'sillynpc_status_state' };
    bindStatusModule(new URL('../src/tracker/status-state-storage.js', import.meta.url), deps, { getSettings: () => settings, getContext: () => context, captureNpcRoster, saveSettings: () => { saves++; } });
    const updated = structuredClone(state);
    updated.locations.records.inn.description = 'Changed by tracker';
    writeNpcMemories(updated, card, { entries: ['Changed by memory reader'] });
    deps.saveStateToMetadata(updated, { recordHistory: false });
    assert.equal(saves, 1);
    assert.equal(settings.systemNpcRosters.A.places.inn.description, 'Changed by tracker');
    assert.equal(settings.systemNpcRosters.A.memories.mira.entries[0].text, 'Changed by memory reader');
    context.chatMetadata.sillynpc_system = 'B';
    deps.saveStateToMetadata(updated, { recordHistory: false });
    assert.equal(saves, 1, 'mismatched Systems cannot publish into the active roster');
});
