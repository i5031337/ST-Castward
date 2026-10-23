import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { portableMemories } from '../src/characters/system-roster-state.js';
import { readNpcMemories, writeNpcMemories } from '../src/tracker/npc-memories.js';
import { normalizeNpcPresentation } from '../src/core/npc-presentation.js';
import { profileStrings } from '../src/core/profile-fields.js';

function fixture() {
    const system = { memories: { enabled: false, carryOver: true } };
    const settings = { statusTracker: {} };
    const state = { characters: [], npcMemories: { 'id:source': { entries: [
        { id: 'one', text: 'A promise', sourceMessageId: '8', provenance: { systemId: 'old', sources: [
            { messageId: 8, fingerprint: 'old', swipeId: 1 },
        ] } },
    ], archive: [{ id: 'two', text: 'An older promise' }] } } };
    const context = { getCurrentChatId: () => 'current', chatMetadata: { sillynpc_status_state: state } };
    const source = readFileSync(new URL('../src/characters/character-transfer.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export ', '');
    const deps = { getSettings: () => settings, activeNpcSystem: () => system, getContext: () => context,
        isChatCharacter: id => id === 'source', profileStrings, npcTemplateFor: () => null,
        splitNpcStats: () => ({ innate: {} }), normalizeNpcPresentation, portableMemories, readNpcMemories,
        writeNpcMemories, initialiseNpcStats: () => ({}), npcStatsFor: () => [], blankActiveProfile: () => ({}) };
    const functions = new Function(...Object.keys(deps), `${source}\nreturn { serialiseCharacter, applyRecord };`)(...Object.values(deps));
    return { ...functions, system, state };
}

test('memory carryover works with automatic reading and roster reuse off', async () => {
    const { serialiseCharacter, applyRecord, state } = fixture();
    const exported = await serialiseCharacter({ id: 'source', name: 'Mira' });
    assert.equal(exported.memories.entries[0].text, 'A promise');
    assert.equal(exported.memories.archive[0].text, 'An older promise');
    assert.equal(exported.memories.entries[0].provenance, undefined);
    assert.equal(exported.memories.entries[0].sourceMessageId, undefined);
    const card = { id: 'destination' };
    applyRecord(card, exported, 'Mira', 2);
    const imported = readNpcMemories(state, card);
    assert.equal(imported.entries[0].text, 'A promise');
    assert.equal(imported.entries[0].manual, true);
    imported.entries[0].text = 'Destination change';
    writeNpcMemories(state, card, imported);
    assert.equal(exported.memories.entries[0].text, 'A promise');
});

test('new files carry memories regardless of memory reuse; older files keep their prior rule', async () => {
    const { serialiseCharacter, applyRecord, system, state } = fixture();
    const exported = await serialiseCharacter({ id: 'source', name: 'Mira' });
    system.memories.carryOver = false;
    assert.equal((await serialiseCharacter({ id: 'source', name: 'Mira' })).memories.entries[0].text, 'A promise');
    const card = { id: 'destination' };
    writeNpcMemories(state, card, { entries: ['Previous destination value'] });
    applyRecord(card, exported, 'Mira', 3);
    assert.equal(readNpcMemories(state, card).entries[0].text, 'A promise');
    applyRecord(card, exported, 'Mira', 2);
    assert.deepEqual(readNpcMemories(state, card), { entries: [], archive: [] });
    system.memories.carryOver = true;
    applyRecord(card, { name: 'Mira', profile: {} }, 'Mira', 2);
    assert.deepEqual(readNpcMemories(state, card), { entries: [], archive: [] });
});

test('reusable cards cannot borrow a same-name active chat actor memory', async () => {
    const { serialiseCharacter, state } = fixture();
    state.characters.push({ name: 'Mira', memories: ['Wrong adventure'] });
    const record = await serialiseCharacter({ id: 'world', name: 'Mira', memories: ['Reusable knowledge'] });
    assert.equal(record.memories.entries[0].text, 'Reusable knowledge');
});
