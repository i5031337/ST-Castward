import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocationLoreStore } from '../src/locations/location-lore-store.js';
import { createLocationLoreRuntime } from '../src/locations/location-lore.js';
import { createLoreEntryStore } from '../src/lore/lore-entry-store.js';
import { inOrder } from '../src/lore/lore-write-queue.js';

function bind(path, result, dependencies) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export ', '');
    return new Function(...Object.keys(dependencies), `${source}\nreturn ${result};`)(...Object.values(dependencies));
}

function storage() {
    const cache = new Map(['A', 'B'].map(name => [name, { entries: {} }]));
    const disk = new Map();
    let pending;
    return {
        cache, disk,
        loadWorldInfo: async name => cache.get(name),
        async saveWorldInfo(name, data, immediately = false) {
            cache.set(name, data);
            // The host has one debounce shared by all books, cancelled by immediate saves.
            pending = immediately ? undefined : () => disk.set(name, structuredClone(data));
            if (immediately) disk.set(name, structuredClone(data));
        },
        createWorldInfoEntry(_name, data) {
            const uid = Math.max(-1, ...Object.keys(data.entries).map(Number)) + 1;
            return data.entries[uid] = { uid };
        },
        flush() { pending?.(); pending = undefined; },
    };
}

test('place runtime persists successive chat books before the shared host debounce can drop one', async () => {
    const host = storage();
    const settings = { enabled: true, activeSystem: 'Fantasy', statusTracker: { enabled: true, locations: { enabled: true } } };
    let context;
    const activate = bind('../src/locations/location-lore-runtime.js', 'activateLocationLore', {
        ...host, createLocationLoreStore, createLocationLoreRuntime,
        getContext: () => context, getSettings: () => settings, user_avatar: 'hero.png',
        requireLorebook: async () => context.book,
    });
    for (const book of ['A', 'B']) {
        context = { book, chatMetadata: { sillynpc_status_state: { locations: { records: { inn: { name: 'Inn' } } } } },
            getCurrentChatId: () => book, characterId: 0, characters: [{ avatar: 'narrator.png' }] };
        await activate();
    }
    host.flush();
    for (const book of ['A', 'B']) assert.equal(Object.keys(host.disk.get(book)?.entries || {}).length, 1, book);
});

test('entry allocation persists each target before returning its link', async () => {
    const host = storage();
    const create = bind('../src/lore/lore-entries.js', 'createLoreEntry', {
        ...host, createLoreEntryStore, saveSettings() {}, syncEntryIdentity() {},
        lorebookWriteGuard: guard => guard || (() => true), requireLorebook: async (_card, options) => options.world,
        isChatCharacter: () => false,
    });
    for (const world of ['A', 'B']) {
        const link = await create({ id: world, name: world }, world);
        assert.equal(host.disk.get(world)?.entries[link.uid]?.sillynpcOwner, JSON.stringify(['npc', null, world]));
    }
    host.flush();
    assert.equal(host.disk.size, 2);
});

test('entry edits, deletion, and identity repair wait for place transactions and preserve their entries', async () => {
    for (const operation of ['updateLorebookEntry', 'deleteLorebookEntry', 'renameLorebookEntry', 'syncLorebookScope', 'repairEntryIdentities']) {
        const host = storage();
        const card = { name: 'Mira', lorebook: { world: 'A', uid: 0 } };
        host.cache.get('A').entries[0] = { uid: 0, comment: 'Old', content: 'Old profile', disable: false };
        const methods = bind('../src/lore/lorebook.js', `({ ${operation} })`, {
            ...host, inOrder, debugLog() {}, getAllCharacters: () => [card], getActiveCharacters: () => [card],
            getChatCast: () => [], isCharacterInChat: () => false,
            deleteWorldInfoEntry: async (data, uid) => { delete data.entries[uid]; return true; },
        });
        let release;
        const held = new Promise(resolve => { release = resolve; });
        let started;
        const entered = new Promise(resolve => { started = resolve; });
        const places = createLocationLoreStore({
            load: async name => { const data = await host.loadWorldInfo(name); started(); await held; return data; },
            save: (name, data) => host.saveWorldInfo(name, data, true), allocate: host.createWorldInfoEntry,
        });
        const placeWrite = places('A', { locations: { records: { inn: { name: 'Inn' } } } }, 'owner');
        await entered;
        const edit = operation === 'updateLorebookEntry' ? methods[operation]('A', 0, { content: 'Edited' })
            : operation === 'deleteLorebookEntry' ? methods[operation]('A', 0)
                : operation === 'renameLorebookEntry' ? methods[operation](card) : methods[operation]();
        release();
        await Promise.all([placeWrite, edit]);
        const entries = host.disk.get('A')?.entries;
        assert.equal(Object.values(entries || {}).filter(entry => entry.castwardPlace).length, 1, operation);
        if (operation === 'deleteLorebookEntry') assert.equal(entries[0], undefined);
        else if (operation === 'updateLorebookEntry') assert.equal(entries[0].content, 'Edited');
        else if (operation === 'syncLorebookScope') assert.equal(entries[0].disable, true);
        else assert.equal(entries[0].comment, 'Mira');
    }
});
