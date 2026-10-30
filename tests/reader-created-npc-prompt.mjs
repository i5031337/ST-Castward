import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { makeState } from './fixtures/gemma-tracker-scenarios.mjs';

test('a card created for this reply supplies prompt holdings without joining saved scene state', async () => {
    const seed = await harness('fantasy', { global: {}, player: { stats: {} }, characters: [] });
    const state = makeState({ system: 'fantasy' }, seed.settings);
    const card = { id: 'bram', name: 'Bram', npcTemplateId: 'character',
        npcCreation: { userMessageIndex: 0, system: 'Fantasy Adventure' }, statusOverrides: {}, profile: {},
        statusCollections: { equipment: [{ name: 'Crossbow bolts', quantity: 12 }], abilities: [] } };
    const chat = [
        { is_user: true, mes: 'Go to the ferry.' },
        { is_user: false, mes: 'Bram enters with twelve crossbow bolts.' },
        { is_user: true, mes: 'Where is Bram?' },
        { is_user: false, mes: 'Bram remains elsewhere.' },
    ];
    const reader = await harness('fantasy', state, { chat, cards: [card] });
    const current = prompt => JSON.parse(prompt.match(/### CURRENT STATE\n([^\n]+)/)[1]);
    const first = reader.prompt(chat[1].mes, [], { messageId: 1 });
    assert.deepEqual(current(first).characters[0].collections.equipment,
        [{ name: 'Crossbow bolts', quantity: 12 }]);
    assert.match(first, /"characters":\[\{"name":"Bram"\}\]/);
    assert.doesNotMatch(first, /### KNOWN OFFSTAGE CHARACTERS/);
    assert.deepEqual(state.characters, []);
    const later = reader.prompt(chat[3].mes, [], { messageId: 3 });
    assert.deepEqual(current(later).characters, []);
    assert.match(later, /### KNOWN OFFSTAGE CHARACTERS/);
    assert.deepEqual(current(reader.prompt('The ferry is closed.', [], { messageId: 1 })).characters, []);
    card.npcCreation.system = 'Another System';
    assert.deepEqual(current(reader.prompt(chat[1].mes, [], { messageId: 1 })).characters, []);
});
