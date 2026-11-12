import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DIALOGUE_PORTRAITS_KEY, readLinePortrait, writeLinePortrait } from '../src/expressions/dialogue-portrait-state.js';

const moduleUrl = new URL('../src/expressions/dialogue-portraits.js', import.meta.url);
const source = (await readFile(moduleUrl, 'utf8'))
    .replace(/^import .* from '(?!\.\/).*;\n/gm, '')
    .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, moduleUrl).href}'`);
let fixtureId = 0;
async function fixture(chat) {
    let saves = 0;
    const context = { chat };
    globalThis.portraitPackFixture = {
        getContext: () => context,
        dialogueRevision: (ctx, id) => JSON.stringify([id, ctx.chat[id]?.swipe_id, ctx.chat[id]?.mes]),
        saveChatSoon: () => saves++,
    };
    try {
        const declarations = 'const { getContext, dialogueRevision, saveChatSoon } = globalThis.portraitPackFixture;\n';
        const adapter = await import('data:text/javascript;base64,' + Buffer.from(declarations + source + `\n// ${fixtureId++}`).toString('base64'));
        return { ...adapter, saves: () => saves };
    } finally { delete globalThis.portraitPackFixture; }
}
const card = { id: 'bianca', presentation: { expressions: { spriteFolder: 'Bianca/Expressions' } } };
const line = { npcId: card.id, lineIndex: 0 };
const message = () => ({ mes: 'Bianca: "Hello."', swipe_id: 0, extra: { native: 'keep' }, swipe_info: [{ extra: { nativeSwipe: true } }] });
const picture = { label: 'joy', path: '/characters/Bianca/Expressions/joy.jpg?t=old', fallback: 'neutral',
    fallbackPath: '/characters/Bianca/Expressions/neutral.jpg?t=old' };
const pack = [
    { label: 'joy', path: '/characters/Bianca/Expressions/joy.png?t=new' },
    { label: 'neutral', path: '/characters/Bianca/Expressions/neutral.webp?t=new' },
];

test('pack refresh updates renamed images throughout saved history with no DOM or classifier cache', async () => {
    const chat = [message(), message()];
    for (const entry of chat) writeLinePortrait(entry, line, picture);
    // Use a reloaded chat so no runtime job, DOM record, or shared in-memory swipe object is required.
    const reloaded = JSON.parse(JSON.stringify(chat));
    const runtime = await fixture(reloaded);
    runtime.refreshDialoguePortraitPack(card, pack);
    for (const entry of reloaded) {
        assert.deepEqual(readLinePortrait(entry, line), {
            label: 'joy', path: pack[0].path, fallback: 'neutral', fallbackPath: pack[1].path,
        });
        assert.deepEqual(entry.swipe_info[0].extra[DIALOGUE_PORTRAITS_KEY], entry.extra[DIALOGUE_PORTRAITS_KEY]);
        assert.equal(entry.extra.native, 'keep');
        assert.equal(entry.swipe_info[0].extra.nativeSwipe, true);
    }
    assert.equal(runtime.saves(), 2);
    runtime.refreshDialoguePortraitPack(card, pack);
    assert.equal(runtime.saves(), 2, 'an unchanged pack does not save again');
});

test('a newly available emotion replaces saved fallback portraits without changing their labels', async () => {
    const entry = message();
    writeLinePortrait(entry, line, { ...picture, label: 'fear', path: picture.fallbackPath });
    const adapter = await fixture([entry]);
    adapter.refreshDialoguePortraitPack(card, [...pack, { label: 'fear', path: '/characters/Bianca/Expressions/fear.png?t=new' }]);
    assert.deepEqual(readLinePortrait(entry, line), {
        label: 'fear', path: '/characters/Bianca/Expressions/fear.png?t=new', fallback: 'neutral', fallbackPath: pack[1].path,
    });
});

test('refresh rejects unrelated NPCs, folders, edited records and switched swipes without writes', async () => {
    const chat = Array.from({ length: 7 }, message);
    writeLinePortrait(chat[0], { ...line, npcId: 'other' }, picture);
    writeLinePortrait(chat[1], line, { ...picture, path: '/characters/Bianca/Other/joy.jpg' });
    writeLinePortrait(chat[2], line, { ...picture, path: '/characters/Bianca/Expressions-extra/joy.jpg' });
    writeLinePortrait(chat[3], line, { ...picture, path: '/characters/Bianca/Expressions/Nested/joy.jpg' });
    for (const entry of chat.slice(4)) writeLinePortrait(entry, line, picture);
    chat[4].mes += ' Edited.';
    chat[5].swipe_id = 1;
    chat[6].extra.display_text = 'Changed display';
    const before = structuredClone(chat), adapter = await fixture(chat);
    adapter.refreshDialoguePortraitPack(card, pack);
    assert.deepEqual(chat, before);
    assert.equal(adapter.saves(), 0);
});

test('missing replacement sprites preserve selections and other swipe snapshots remain untouched', async () => {
    const entry = message();
    writeLinePortrait(entry, line, picture);
    entry.swipe_info.push({ extra: { native: 'other swipe', [DIALOGUE_PORTRAITS_KEY]: { other: true } } });
    const inactive = structuredClone(entry.swipe_info[1]);
    const adapter = await fixture([entry]);
    adapter.refreshDialoguePortraitPack(card, []);
    assert.deepEqual(readLinePortrait(entry, line), picture);
    assert.equal(adapter.saves(), 0);
    adapter.refreshDialoguePortraitPack(card, pack);
    assert.deepEqual(entry.swipe_info[1], inactive);
});

test('encoded folder paths refresh while malformed escapes cannot escape the folder boundary', async () => {
    const entry = message();
    writeLinePortrait(entry, line, { ...picture, path: '/characters/Bianca%20Pack/joy.jpg?t=old' });
    const adapter = await fixture([entry]);
    const spacedCard = { ...card, presentation: { expressions: { spriteFolder: 'Bianca Pack' } } };
    const sprites = [{ label: 'joy', path: '/characters/Bianca Pack/joy.png?t=new' }];
    adapter.refreshDialoguePortraitPack(spacedCard, sprites);
    assert.equal(readLinePortrait(entry, line).path, sprites[0].path);
    writeLinePortrait(entry, line, { ...picture, path: '/characters/Bianca%ZZPack/joy.jpg' });
    const before = structuredClone(entry), saves = adapter.saves();
    adapter.refreshDialoguePortraitPack(spacedCard, sprites);
    assert.deepEqual(entry, before);
    assert.equal(adapter.saves(), saves);
});
