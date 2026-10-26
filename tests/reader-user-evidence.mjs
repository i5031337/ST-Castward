import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './fixtures/gemma-tracker-harness.mjs';

const state = () => ({ global: {}, player: { stats: {}, collections: {} }, characters: [] });
const user = mes => ({ is_user: true, name: 'Alex', mes });
const narrator = mes => ({ is_user: false, mes });
const playerSection = prompt => prompt.split('### FRESH PLAYER TURN (not yet reflected in state)\n')[1]
    ?.split('### LATEST ASSISTANT REPLY')[0];

test('fresh player actions remain evidence with older context set to zero', async () => {
    const action = 'I pay three coins. ' + 'I wait quietly. '.repeat(100) + 'I stay by the gate.';
    const chat = [narrator('Earlier scene.'), user(action), narrator('Rowan marks his ledger.')];
    const reader = await harness('fantasy', state(), { chat });
    const leadUp = reader.collectLeadUp(2, 0);
    const prompt = reader.prompt(chat[2].mes, leadUp);
    assert.ok(playerSection(prompt).includes(action));
    assert.ok(!prompt.includes('Earlier scene.'));
    assert.ok(!prompt.includes('### EARLIER MESSAGES'));
});

test('older player actions stay in accounted history when a new exchange starts', async () => {
    const chat = [user('I paid for the room.'), narrator('The room is yours.'),
        user('I give Mira one coin.'), narrator('Mira thanks you.')];
    const reader = await harness('fantasy', state(), { chat });
    const prompt = reader.prompt(chat[3].mes, reader.collectLeadUp(3, 3));
    const earlier = prompt.split('### EARLIER MESSAGES (already reflected in state)')[1]
        .split('### FRESH PLAYER TURN')[0];
    assert.ok(earlier.includes('I paid for the room.'));
    assert.ok(!earlier.includes('I give Mira one coin.'));
    assert.ok(playerSection(prompt).includes('I give Mira one coin.'));
    assert.ok(!playerSection(prompt).includes('I paid for the room.'));
});

test('an assistant continuation never treats an already-resolved user turn as fresh', async () => {
    const chat = [user('I drink the potion.'), narrator('You recover.'), narrator('Mira opens the door.')];
    const reader = await harness('fantasy', state(), { chat });
    const prompt = reader.prompt(chat[2].mes, reader.collectLeadUp(2, 2));
    assert.equal(playerSection(prompt), undefined);
    assert.ok(prompt.includes('### EARLIER MESSAGES (already reflected in state)'));
});

test('consecutive player messages are read together across system notes and image-only messages', async () => {
    const chat = [narrator('Earlier resolved turn.'), user('I take off my scarf.'),
        { is_system: true, mes: 'System note should not be evidence.' },
        user('I put it into my bag.'), { mes: 'Image-only prose should not be evidence.',
            extra: { inline_image: false, media: [{}] } }, narrator('June clears a chair.')];
    const reader = await harness('dating', state(), { chat });
    const prompt = reader.prompt(chat[5].mes, reader.collectLeadUp(5, 0));
    assert.ok(playerSection(prompt).includes('I take off my scarf.'));
    assert.ok(playerSection(prompt).includes('I put it into my bag.'));
    assert.ok(!prompt.includes('should not be evidence'));
    chat[3].mes = 'I leave the scarf on the chair.';
    const edited = reader.prompt(chat[5].mes, reader.collectLeadUp(5, 0));
    assert.ok(playerSection(edited).includes(chat[3].mes));
    assert.ok(!playerSection(edited).includes('I put it into my bag.'));
});

test('opening replies and invalid indexes have no fresh player turn', async () => {
    const reader = await harness('fantasy', state(), { chat: [narrator('Welcome.')] });
    assert.deepEqual(reader.collectLeadUp(0, 2), []);
    assert.deepEqual(reader.collectLeadUp(-1, 2), []);
    assert.deepEqual(reader.collectLeadUp(3, 2), []);
    const prompt = reader.prompt('Welcome.');
    assert.equal(playerSection(prompt), undefined);
});
