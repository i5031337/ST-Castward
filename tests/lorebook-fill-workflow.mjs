import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existingFillLorebookName, newChatLorebookName } from '../src/lore/lorebook-target.js';
import { defaultSettings } from '../src/core/settings-defaults.js';
import { createCastLoreActivator } from '../src/lore/cast-lore.js';

function fixture(defaultLorebook = '') {
    const names = [];
    const settings = { enabled: true, activeSystem: 'A', autoCreateLorebook: defaultSettings.autoCreateLorebook, defaultLorebook };
    const context = { getCurrentChatId: () => 'fresh', chatMetadata: { sillynpc_system: 'A' }, saveMetadataDebounced: () => { saves++; } };
    let saves = 0;
    const created = [], classes = [], notifications = [];
    const source = readFileSync(new URL('../src/lore/lorebook.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export ', '');
    const deps = { world_names: names, METADATA_KEY: 'world_info', getSettings: () => settings,
        toastr: { info: (...args) => notifications.push(args) },
        getContext: () => context, existingFillLorebookName, newChatLorebookName,
        createNewWorldInfo: async name => { created.push(name); names.push(name); return true; },
        document: { querySelector: () => ({ classList: { add: name => classes.push(name) } }) } };
    const fill = new Function(...Object.keys(deps), `${source}\nreturn ensureChatLorebookForFill;`)(...Object.values(deps));
    return { fill, context, settings, names, created, classes, notifications, saves: () => saves };
}

test('first generated profiles share one newly created chat-bound book', async () => {
    const f = fixture();
    const [first, second] = await Promise.all([f.fill(), f.fill()]);
    assert.equal(typeof first, 'string');
    assert.ok(first.length > 0);
    assert.equal(second, first);
    assert.deepEqual(f.created, [first]);
    assert.equal(f.context.chatMetadata.world_info, first);
    assert.equal(f.saves(), 1);
    assert.equal(await f.fill(), first);
    assert.equal(f.created.length, 1);
    assert.equal(f.notifications.length, 1);
    assert.ok(f.notifications[0][0].includes(first));
    assert.equal(f.notifications[0][2].escapeHtml, true);
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
    assert.deepEqual(f.notifications, []);
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
    assert.deepEqual(f.notifications, []);
});

test('disabling automatic creation leaves chosen books usable', async () => {
    for (const value of [undefined, false]) {
        const f = fixture();
        f.settings.autoCreateLorebook = value;
        assert.equal(await f.fill(), '');
        assert.deepEqual(f.created, []);
        assert.deepEqual(f.notifications, []);
        assert.equal(f.saves(), 0);
        f.names.push('Chosen');
        f.settings.defaultLorebook = 'Chosen';
        assert.equal(await f.fill(), 'Chosen');
        f.names.push('Chat');
        f.context.chatMetadata.world_info = 'Chat';
        assert.equal(await f.fill(), 'Chat');
    }
});

test('explicit one-time creation leaves automatic creation disabled', async () => {
    const f = fixture();
    f.settings.autoCreateLorebook = false;
    const name = await f.fill({ allowCreate: true });
    assert.ok(name);
    assert.equal(f.context.chatMetadata.world_info, name);
    assert.equal(f.settings.autoCreateLorebook, false);
    assert.equal(f.created.length, 1);
});

test('cancelled explicit creation cannot attach to its old chat', async () => {
    const f = fixture();
    let current = true;
    const pending = f.fill({ allowCreate: true, isCurrent: () => current });
    current = false;
    assert.equal(await pending, '');
    assert.equal(f.context.chatMetadata.world_info, undefined);
    assert.equal(f.saves(), 0);
});
