import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inOrder } from '../src/lore/lore-write-queue.js';
import { createLocationLoreStore } from '../src/locations/location-lore-store.js';

function bindSave(dependencies) {
    const source = readFileSync(new URL('../src/api/api-lore-generate.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export async function saveLoreContent')).replace('export ', '');
    const deps = {
        inOrder, lorebookWriteGuard: guard => guard || (() => true),
        requireLorebook: async (_card, { world }) => world,
        profileFieldsForCard: () => [], syncEntryIdentity() {}, mergeKeywords: () => [], saveSettings() {},
        ...dependencies,
    };
    return new Function(...Object.keys(deps), `${body}\nreturn saveLoreContent;`)(...Object.values(deps));
}

function gate() {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
}

test('profile content waits for a concurrent place write and retains its newly allocated entry', async () => {
    let book = { entries: { 0: { uid: 0, content: 'Old profile' } } };
    const entered = gate(), resume = gate();
    const places = createLocationLoreStore({
        load: async () => { const captured = book; entered.release(); await resume.promise; return captured; },
        save: async (_world, data) => { book = data; },
        allocate: (_world, data) => (data.entries[1] = { uid: 1 }),
    });
    const placeWrite = places('Shared content', { locations: { enabled: true,
        records: { inn: { name: 'Silver Lantern', description: 'A warm tavern.' } } } }, 'chat');
    await entered.promise;
    let reads = 0;
    const save = bindSave({
        loadWorldInfo: async () => { reads++; return book; },
        saveWorldInfo: async (_world, data, immediately) => { assert.equal(immediately, true); book = data; },
    });
    const profileWrite = save({ name: 'Mira', profile: {} }, 'Shared content', 0, '', 'New profile');
    await new Promise(resolve => setImmediate(resolve));
    const readsWhilePlacePending = reads;
    resume.release();
    await Promise.all([placeWrite, profileWrite]);
    assert.equal(readsWhilePlacePending, 0, 'profile reads the book only after the place write completes');
    assert.equal(book.entries[0].content, 'New profile');
    assert.equal(book.entries[1].castwardPlace.id, 'inn');
    assert.match(book.entries[1].content, /A warm tavern/);
});

for (const stage of ['queue', 'load']) {
    test(`profile write cancelled during ${stage} does not alter cached lore or the card`, async () => {
        const book = { entries: { 0: { uid: 0, content: 'Old profile', key: ['Mira'] } } };
        const card = { name: 'Mira', profile: {}, lorebook: { world: `Cancelled ${stage}`, uid: 0 } };
        const before = structuredClone({ book, card });
        let current = true, saves = 0;
        const entered = gate(), resume = gate();
        const blocker = stage === 'queue' ? inOrder(card.lorebook.world, async () => {
            entered.release(); await resume.promise;
        }) : Promise.resolve();
        const save = bindSave({
            loadWorldInfo: async () => {
                if (stage === 'load') { entered.release(); await resume.promise; }
                return book;
            },
            saveWorldInfo: async () => { saves++; },
        });
        const pending = save(card, card.lorebook.world, 0, '', 'New profile', { isCurrent: () => current });
        await entered.promise;
        current = false;
        resume.release();
        await assert.rejects(pending, { name: 'AbortError' });
        await blocker;
        assert.equal(saves, 0);
        assert.deepEqual({ book, card }, before);
    });
}
