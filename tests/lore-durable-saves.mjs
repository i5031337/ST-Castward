import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocationLoreStore } from '../src/locations/location-lore-store.js';
import { createLocationLoreRuntime } from '../src/locations/location-lore.js';
import { createLoreEntryStore } from '../src/lore/lore-entry-store.js';

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
