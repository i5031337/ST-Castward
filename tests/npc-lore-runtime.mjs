import test from 'node:test';
import assert from 'node:assert/strict';
import { newChatLorebookName } from '../src/lore/lorebook-target.js';
import { readFileSync } from 'node:fs';

function fixture() {
    const source = ['../src/lore/lorebook-write-target.js', '../src/npc/npc-lore-runtime.js']
        .map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export ', '');
    const f = { target: '', names: ['Book'], book: { entries: {} }, synchronized: 0, remembered: [], choices: 0, saves: 0, settingsSaves: 0, settings: { activeSystem: 'A', autoCreateLorebook: false },
        context: { chatMetadata: {}, getCurrentChatId: () => 'chat', saveMetadataDebounced: () => { f.saves++; } } };
    const deps = {
        getContext: () => f.context, user_avatar: 'persona', METADATA_KEY: 'world_info', newChatLorebookName,
        document: { querySelector: () => null },
        chooseChatLorebook: async options => { f.choices++; return f.choose ? f.choose(options) : ''; }, getSettings: () => f.settings, saveSettings: () => { f.settingsSaves++; }, createNewWorldInfo: async name => { f.names.push(name); return true; }, getAllCharacters: () => [],
        world_names: f.names, loadWorldInfo: async () => { f.onLoad?.(); return f.book; },
        ensureChatLorebookForFill: async options => {
            if (options?.allowCreate) { f.target = 'Book'; f.context.chatMetadata.world_info = 'Book'; }
            return f.context.chatMetadata?.world_info || f.settings.defaultLorebook || f.target;
        },
        createNpcLoreHandoff: () => ({ remember: card => f.remembered.push(card) }),
        syncProfileToLore: async card => {
            f.synchronized++;
            card.lorebook ||= { world: 'Book', uid: 0 };
        },
    };
    Object.assign(f, new Function(...Object.keys(deps), source + '\nreturn { requireLorebook, prepareNpcLore };')(...Object.values(deps)));
    return f;
}

test('no target asks for a lorebook; a selected target and existing valid links are accepted', async () => {
    const f = fixture();
    await assert.rejects(f.requireLorebook(), error => error.name === 'AbortError');
    assert.equal(f.synchronized, 0);
    assert.equal(await f.requireLorebook({ lorebook: { world: 'Book' } }), 'Book');
    f.target = 'Book';
    assert.equal(await f.requireLorebook(), 'Book');
    f.book = null;
    await assert.rejects(f.requireLorebook(), /Could not read/);
});

test('only a saved, enabled, nonempty entry is handed to the narrator', async () => {
    for (const entry of [undefined, { content: '' }, { content: 'Profile', disable: true }]) {
        const f = fixture(); f.target = 'Book';
        f.book.entries[0] = entry;
        await assert.rejects(f.prepareNpcLore({ name: 'Mira' }, () => true), /Enable and fill/);
        assert.deepEqual(f.remembered, []);
    }
    const f = fixture(); f.target = 'Book';
    f.book.entries[0] = { content: 'Saved profile' };
    const card = { name: 'Mira' };
    await f.prepareNpcLore(card, () => true);
    assert.deepEqual(f.remembered, [card]);
    assert.equal(f.synchronized, 1);
});

test('cancelled synchronization cannot queue profile lore for another continuation', async () => {
    const f = fixture(); f.target = 'Book';
    await assert.rejects(f.prepareNpcLore({ name: 'Mira' }, () => false), { name: 'AbortError' });
    assert.equal(f.synchronized, 0);
    assert.deepEqual(f.remembered, []);
});

test('a chat change during the final lore read cannot register another chat’s handoff', async () => {
    const f = fixture(); f.target = 'Book';
    f.book.entries[0] = { content: 'Saved profile' };
    let current = true;
    f.onLoad = () => { if (f.synchronized) current = false; };
    await f.prepareNpcLore({ name: 'Mira' }, () => current);
    assert.deepEqual(f.remembered, []);
});

test('selecting an existing book attaches it and resumes the waiting request', async () => {
    const f = fixture();
    let choose;
    f.choose = options => new Promise(resolve => { choose = () => resolve(options.onChoose('Book')); });
    const pending = f.requireLorebook();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.choices, 1);
    assert.equal(f.saves, 0);
    choose();
    assert.equal(await pending, 'Book');
    assert.equal(f.context.chatMetadata.world_info, 'Book');
    assert.equal(f.saves, 1);
});

test('explicit creation from the picker works without changing the automatic preference', async () => {
    const f = fixture();
    f.choose = options => options.onChoose('');
    assert.equal(await f.requireLorebook(), 'Book');
    assert.equal(f.context.chatMetadata.world_info, 'Book');
});

test('concurrent NPC requests share a chooser and all resume with the selected book', async () => {
    const f = fixture();
    let release;
    f.choose = options => new Promise(resolve => { release = () => resolve(options.onChoose('Book')); });
    const first = f.requireLorebook(), second = f.requireLorebook();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.choices, 1);
    release();
    assert.deepEqual(await Promise.all([first, second]), ['Book', 'Book']);
    assert.equal(f.saves, 1);
});

test('cancellation during selection does not attach a book to the stale chat', async () => {
    const f = fixture();
    let current = true, release;
    f.choose = options => new Promise(resolve => { release = () => resolve(options.onChoose('Book')); });
    const pending = f.requireLorebook(null, { isCurrent: () => current });
    await new Promise(resolve => setImmediate(resolve));
    current = false; release();
    await assert.rejects(pending, error => error.name === 'AbortError');
    assert.equal(f.saves, 0);
    assert.equal(f.context.chatMetadata.world_info, undefined);
});

test('closing the chooser during a pending selection cannot save its target afterward', async () => {
    const f = fixture();
    f.choose = options => options.onChoose('Book', () => false);
    await assert.rejects(f.requireLorebook(), error => error.name === 'AbortError');
    assert.equal(f.saves, 0);
    assert.equal(f.context.chatMetadata.world_info, undefined);
});

test('without an open chat the chooser can select a default target for library writes', async () => {
    const f = fixture();
    f.context.getCurrentChatId = () => undefined;
    f.choose = options => options.onChoose('Book');
    assert.equal(await f.requireLorebook(), 'Book');
    assert.equal(f.settings.defaultLorebook, 'Book');
    assert.equal(f.settingsSaves, 1);
    assert.equal(f.saves, 0);
    assert.equal(f.settings.autoCreateLorebook, false);
});

test('without an open chat explicit creation provides a new library lorebook', async () => {
    const f = fixture();
    f.context.getCurrentChatId = () => undefined;
    f.choose = options => options.onChoose('');
    const name = await f.requireLorebook();
    assert.equal(f.settings.defaultLorebook, name);
    assert.ok(f.names.includes(name));
    assert.equal(f.settings.autoCreateLorebook, false);
});

test('System changes while choosing cannot resume an old write', async () => {
    const f = fixture();
    let release;
    f.choose = options => new Promise(resolve => { release = () => resolve(options.onChoose('Book')); });
    const pending = f.requireLorebook();
    await new Promise(resolve => setImmediate(resolve));
    f.settings.activeSystem = 'B'; release();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(f.saves, 0);
});
