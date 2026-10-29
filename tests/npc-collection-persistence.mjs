import { bindStatusModule, loadStatusModule } from './helpers/status-module.mjs';
import { bindTrackerUpdate } from './fixtures/tracker-update-bind.mjs';
import { buildActorState } from '../src/tracker/actor-calculation.js';
import { activeNpcSystem } from '../src/core/npc-templates.js';
import { bindCollectionUpdates } from './fixtures/collection-updates-bind.mjs';
import { collectionQuantityField } from '../src/core/collection-fields.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionAppliesTo } from '../src/core/collection-targets.js';
import { progressionFields } from '../src/tracker/progression-fields.js';

function fixture() {
    const cards = [];
    let saves = 0;
    const settings = { statusTracker: { globalStats: [], playerStats: [], npcStats: [], collections: [
        { id: 'inventory', targets: ['player', 'npc'], fields: [{ name: 'title', isPrimary: true }] },
        { id: 'skills', targets: ['npc'], fields: [{ name: 'title', isPrimary: true }] },
    ] } };
    const globals = { buildActorState, activeNpcSystem, getSettings: () => settings, getAllCharacters: () => cards,
        saveSettings: () => saves++, getContext: () => ({ chat: [] }),
        npcStatsFor: () => [], npcTemplateFor: () => null, proposedNpcTemplate: () => null,
        collectionAppliesTo, progressionFields, debugLog() {}, LOG_PREFIX: '[test]', eventSource: { emit() {} } };
    const { syncNpcCollectionsToCards } = loadStatusModule(new URL('../src/tracker/npc-collections.js', import.meta.url), globals);
    globals.syncNpcCollectionsToCards = syncNpcCollectionsToCards;
    const deps = { committedState: { global: {}, player: { name: 'Player', stats: {},
        collections: { inventory: [{ title: 'Player sword' }] } }, characters: [
        { name: 'Mira', stats: {}, collections: {} },
    ] }, hasOpenChat: () => true, getCurrentPersonaName: () => 'Player',
    loadStateFromMetadata() { return this.committedState; },
    saveStateToMetadata(state, options = {}) {
        if (options.isCurrent && !options.isCurrent()) return false;
        options.beforeCommit?.();
        this.committedState = state; return true;
    },
    resolveCanonicalName: name => name, mayJoinScene: () => true,
    mergeDuplicateCharacters: () => false, groupIncomingStats: () => new Map(),
    constrainToDefinition: (_field, value) => value };
    bindCollectionUpdates(deps, globals);
    bindTrackerUpdate(deps, globals);
    for (const module of ['status-scene-presence']) {
        bindStatusModule(new URL(`../src/tracker/${module}.js`, import.meta.url), deps, globals);
    }
    return { cards, deps, saves: () => saves };
}

for (const exit of ['reader cast', 'grace period', 'manual removal']) {
    test(`reader collections survive ${exit} when the card is created after the reading`, () => {
        const { cards, deps } = fixture();
        deps.applyUpdate({ characters: [{ name: 'Mira', collections: {
            inventory: { add: [{ title: 'NPC ring' }] }, skills: { add: [{ title: 'Heal' }] },
        } }] });
        const expected = structuredClone(deps.committedState.characters[0].collections);
        const card = { name: 'Mira', statusCollections: {} };
        cards.push(card);
        if (exit === 'reader cast') deps.reconcileScenePresence([], 1, { authoritative: true });
        else if (exit === 'manual removal') deps.removeActiveCharacter('Mira');
        else for (let tick = 1; tick <= 4; tick++) deps.reconcileScenePresence([], tick);
        assert.equal(deps.committedState.characters.length, 0);
        assert.deepEqual(card.statusCollections, expected);
        // Read the saved card after leaving, then return through normal scene reconciliation.
        card.statusCollections = structuredClone(card.statusCollections);
        deps.reconcileScenePresence(['Mira'], 5, { authoritative: true });
        assert.deepEqual(deps.committedState.characters[0].collections, expected);
        assert.deepEqual(deps.committedState.player.collections.inventory, [{ title: 'Player sword' }]);
        assert.notEqual(deps.committedState.characters[0].collections.inventory, card.statusCollections.inventory);
    });
}

test('reader saves shared collections to existing cards and previews leave them alone', () => {
    const { cards, deps } = fixture();
    const card = { name: 'Mira', statusCollections: {} };
    cards.push(card);
    const update = { characters: [{ name: 'Mira', collections: { inventory: { add: [{ title: 'NPC ring' }] } } }] };
    deps.applyUpdate(update, { dryRun: true });
    assert.deepEqual(card.statusCollections, {});
    deps.applyUpdate(update);
    assert.deepEqual(card.statusCollections.inventory, [{ title: 'NPC ring' }]);
});
