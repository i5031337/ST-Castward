import test from 'node:test';
import assert from 'node:assert/strict';
import { DIALOGUE_PORTRAITS_KEY, readLinePortrait, writeLinePortrait } from '../src/expressions/dialogue-portrait-state.js';

const line = { npcId: 'bianca', lineIndex: 2 };
const picture = { label: 'joy', path: '/characters/Bianca/joy.png', fallback: 'neutral', fallbackPath: '/characters/Bianca/neutral.png' };
const message = () => ({ mes: 'Bianca: "Hello."', swipe_id: 0, extra: { existing: 'keep' }, swipe_info: [{ extra: { native: true } }] });

test('a sprite selection survives chat serialization without replacing other metadata', () => {
    const chatMessage = message();
    assert.equal(writeLinePortrait(chatMessage, line, picture), true);
    const reloaded = JSON.parse(JSON.stringify(chatMessage));
    assert.deepEqual(readLinePortrait(reloaded, line), picture);
    assert.equal(reloaded.extra.existing, 'keep');
    assert.equal(writeLinePortrait(chatMessage, line, picture), false);
});

test('each NPC line keeps its own expression and late image results update its path', () => {
    const chatMessage = message();
    writeLinePortrait(chatMessage, line, picture);
    const other = { npcId: 'felicity', lineIndex: 3 };
    writeLinePortrait(chatMessage, other, { ...picture, label: 'anger', path: '/characters/Felicity/anger.png' });
    assert.equal(readLinePortrait(chatMessage, line).label, 'joy');
    assert.equal(readLinePortrait(chatMessage, other).label, 'anger');
    writeLinePortrait(chatMessage, line, { ...picture, path: '/characters/Bianca/joy-new.png' });
    assert.equal(readLinePortrait(chatMessage, line).path, '/characters/Bianca/joy-new.png');
});

test('message edits, display edits, different speakers and swipes reject stale selections', () => {
    for (const mutate of [m => { m.mes += ' Edited.'; }, m => { m.extra.display_text = 'Edited'; }, m => { m.swipe_id = 1; }]) {
        const chatMessage = message(); writeLinePortrait(chatMessage, line, picture); mutate(chatMessage);
        assert.equal(readLinePortrait(chatMessage, line), null);
    }
    const chatMessage = message(); writeLinePortrait(chatMessage, line, picture);
    assert.equal(readLinePortrait(chatMessage, { ...line, npcId: 'different' }), null);
    assert.equal(readLinePortrait(chatMessage, { ...line, lineIndex: 1 }), null);
});

test('selections travel with native swipe extras and do not overwrite other swipe fields', () => {
    const chatMessage = message(); writeLinePortrait(chatMessage, line, picture);
    const firstExtra = structuredClone(chatMessage.swipe_info[0].extra);
    assert.equal(firstExtra.native, true);
    chatMessage.swipe_id = 1; chatMessage.mes = 'Bianca: "Oh!"'; chatMessage.extra = {};
    chatMessage.swipe_info.push({ extra: { second: true } });
    writeLinePortrait(chatMessage, line, { ...picture, label: 'surprise' });
    assert.equal(chatMessage.swipe_info[1].extra.second, true);
    assert.equal(chatMessage.swipe_info[0].extra[DIALOGUE_PORTRAITS_KEY].lines[2].label, 'joy');
    chatMessage.swipe_id = 0; chatMessage.mes = 'Bianca: "Hello."'; chatMessage.extra = firstExtra;
    assert.equal(readLinePortrait(chatMessage, line).label, 'joy');
});
