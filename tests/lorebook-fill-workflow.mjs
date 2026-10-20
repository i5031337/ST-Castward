import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existingFillLorebookName, newChatLorebookName } from '../src/lore/lorebook-target.js';
import { createCastLoreActivator } from '../src/lore/cast-lore.js';

function fixture(defaultLorebook = '') {
    const names = [];
    const settings = { enabled: true, activeSystem: 'A', defaultLorebook };
    const context = { getCurrentChatId: () => 'fresh', chatMetadata: { sillynpc_system: 'A' }, saveMetadataDebounced: () => { saves++; } };
    let saves = 0;
    const created = [], classes = [];
    const source = readFileSync(new URL('../src/lore/lorebook.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export ', '');
    const deps = { world_names: names, METADATA_KEY: 'world_info', getSettings: () => settings,
        getContext: () => context, existingFillLorebookName, newChatLorebookName,
        createNewWorldInfo: async name => { created.push(name); names.push(name); return true; },
        document: { querySelector: () => ({ classList: { add: name => classes.push(name) } }) } };
    const fill = new Function(...Object.keys(deps), `${source}\nreturn ensureChatLorebookForFill;`)(...Object.values(deps));
    return { fill, context, settings, names, created, classes, saves: () => saves };
}

test('first generated profiles share one newly created chat-bound book', async () => {
    const f = fixture();
    const [first, second] = await Promise.all([f.fill(), f.fill()]);
    assert.equal(first, 'Castward Chat fresh');
    assert.equal(second, first);
    assert.deepEqual(f.created, [first]);
    assert.equal(f.context.chatMetadata.world_info, first);
    assert.equal(f.saves(), 1);
    assert.deepEqual(f.classes, ['world_set']);
    assert.equal(await f.fill(), first);
    assert.equal(f.created.length, 1);
    const native = { world: first, uid: 1, content: 'Generated profile' };
    const lore = { chatLore: [native] };
    const activate = createCastLoreActivator({ getContext: () => f.context, getSettings: () => f.settings,
        getCharacters: () => [{ name: 'Mira', lorebook: { world: first, uid: 1 } }],
        loadWorldInfo: () => { throw new Error('The already active chat book should not be loaded twice'); } });
    assert.equal(await activate(lore), 0);
    assert.deepEqual(lore.chatLore, [native]);
});

test('generated profiles in a chosen default book use the same automatic scan activation as carried cast', async () => {
    const f = fixture('Default');
    f.names.push('Default');
    assert.equal(await f.fill(), 'Default');
    assert.deepEqual(f.created, []);
    assert.equal(f.context.chatMetadata.world_info, undefined);
    const lore = { chatLore: [] };
    const activate = createCastLoreActivator({ getContext: () => f.context, getSettings: () => f.settings,
        getCharacters: () => [{ name: 'Mira', lorebook: { world: 'Default', uid: 1 } }],
        loadWorldInfo: async () => ({ entries: { 1: { uid: 1, key: ['Mira'], content: 'Generated profile' } } }) });
    assert.equal(await activate(lore), 1);
    assert.equal(lore.chatLore[0].world, 'Default');
    assert.equal(f.context.chatMetadata.world_info, undefined);
    f.names.push('Chosen chat book');
    f.context.chatMetadata.world_info = 'Chosen chat book';
    assert.equal(await f.fill(), 'Chosen chat book');
    assert.deepEqual(f.created, []);
});
