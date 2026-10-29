import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocationLoreStore } from '../src/locations/location-lore-store.js';
import { createLoreEntryStore } from '../src/lore/lore-entry-store.js';
import { applyLocationLore } from '../src/locations/location-lore-scan.js';

const place = (id, name, extra = {}) => ({ id, name, aliases: [], description: `About ${name}`, parentId: '', ...extra });
const state = () => ({ locations: { enabled: true, currentId: 'inn', records: {
    town: place('town', 'Ashford'),
    inn: place('inn', 'Silver Lantern', { parentId: 'town', aliases: ['the Lantern'] }),
} } });

function fixture() {
    const book = { entries: {
        0: { uid: 0, content: 'External place', key: ['Silver Lantern'] },
        1: { uid: 1, content: 'NPC profile', sillynpcOwner: 'npc owner' },
        2: { uid: 2, content: 'Another chat', castwardPlace: { owner: 'chat B', id: 'inn' } },
    } };
    let saves = 0;
    const dependencies = {
        load: async () => book,
        save: async (_world, data) => { book.entries = structuredClone(data.entries); saves++; },
        allocate: (_world, data) => {
            const uid = Math.max(-1, ...Object.keys(data.entries).map(Number)) + 1;
            return data.entries[uid] = { uid, position: 0, depth: 4 };
        },
    };
    return { book, dependencies, sync: createLocationLoreStore(dependencies), saves: () => saves };
}

test('managed places preserve external/NPC lore and write full descriptions, keys, and ancestry', async () => {
    const f = fixture();
    const current = state();
    current.locations.records.inn.description = 'Detailed history. '.repeat(200);
    current.locations.records.inn.lorebook = 'External';
    current.locations.records.inn.loreEntryId = 0;
    const original = structuredClone(f.book.entries);
    const entries = await f.sync('Chat', current, 'chat A');
    assert.equal(entries.length, 2);
    for (const uid of [0, 1, 2]) assert.deepEqual(f.book.entries[uid], original[uid]);
    const inn = entries.find(entry => entry.castwardPlace.id === 'inn');
    assert.equal(inn.world, 'Chat');
    assert.deepEqual(inn.key, ['Silver Lantern', 'the Lantern']);
    assert.ok(inn.content.includes('Location: Ashford → Silver Lantern'));
    assert.ok(inn.content.endsWith(current.locations.records.inn.description.trim()));
    assert.equal(inn.excludeRecursion, true);
    assert.equal(inn.preventRecursion, true);
    inn.content = 'Mutated returned copy';
    assert.notEqual(f.book.entries[inn.uid].content, inn.content);
    assert.equal(f.saves(), 1);
    await f.sync('Chat', current, 'chat A');
    assert.equal(f.saves(), 1);
});

test('rename, aliases, reparenting, and deletion update owned lore without changing IDs or entry controls', async () => {
    const f = fixture();
    const current = state();
    const before = await f.sync('Chat', current, 'chat A');
    const innUid = before.find(entry => entry.castwardPlace.id === 'inn').uid;
    f.book.entries[innUid].disable = true;
    f.book.entries[innUid].depth = 7;
    current.locations.records.town.name = 'New Ashford';
    current.locations.records.inn.name = 'Golden Lantern';
    current.locations.records.inn.aliases = ['the Gold'];
    const renamed = await f.sync('Chat', current, 'chat A');
    const inn = renamed.find(entry => entry.castwardPlace.id === 'inn');
    assert.equal(inn.uid, innUid);
    assert.equal(inn.disable, true);
    assert.equal(inn.depth, 7);
    assert.deepEqual(inn.key, ['Golden Lantern', 'the Gold']);
    assert.ok(inn.content.includes('Location: New Ashford → Golden Lantern'));
    delete current.locations.records.town;
    current.locations.records.inn.parentId = '';
    const removed = await f.sync('Chat', current, 'chat A');
    assert.equal(removed.length, 1);
    assert.ok(removed[0].content.includes('Location: Golden Lantern'));
    assert.ok(!removed[0].content.includes('Ashford'));
    assert.equal(Object.values(f.book.entries).filter(entry => entry.castwardPlace?.owner === 'chat A').length, 1);
    assert.ok(f.book.entries[2], 'other chat remains untouched');
});

test('stale reads and stale queued work do not mutate host cache or save', async () => {
    const f = fixture();
    let current = true;
    const before = structuredClone(f.book);
    const sync = createLocationLoreStore({ ...f.dependencies,
        load: async () => { current = false; return f.book; },
    });
    assert.deepEqual(await sync('Chat', state(), 'chat A', () => current), []);
    assert.deepEqual(f.book, before);
    assert.equal(f.saves(), 0);
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const first = createLocationLoreStore({ ...f.dependencies, load: async () => { await wait; return f.book; } });
    const firstWork = first('Chat', state(), 'chat A');
    current = true;
    const staleWork = f.sync('Chat', state(), 'chat B', () => current);
    current = false;
    release();
    await firstWork;
    assert.deepEqual(await staleWork, []);
    assert.equal(f.saves(), 1);
});

test('concurrent place reconciliations share one allocation and retain both owners', async () => {
    const f = fixture();
    const syncAgain = createLocationLoreStore(f.dependencies);
    const results = await Promise.all([
        f.sync('Chat', state(), 'chat A'), syncAgain('Chat', state(), 'chat A'),
        syncAgain('Chat', state(), 'chat C'),
    ]);
    assert.deepEqual(results[0].map(entry => entry.uid), results[1].map(entry => entry.uid));
    assert.equal(f.saves(), 2);
    assert.equal(Object.values(f.book.entries).filter(entry => entry.castwardPlace?.owner === 'chat A').length, 2);
    assert.equal(Object.values(f.book.entries).filter(entry => entry.castwardPlace?.owner === 'chat C').length, 2);
});

test('disabled places still reconcile deletions and missing books fail without writing', async () => {
    const f = fixture();
    const current = state();
    await f.sync('Chat', current, 'chat A');
    current.locations.enabled = false;
    current.locations.records = {};
    assert.deepEqual(await f.sync('Chat', current, 'chat A'), []);
    assert.equal(Object.values(f.book.entries).filter(entry => entry.castwardPlace?.owner === 'chat A').length, 0);
    const bad = createLocationLoreStore({ ...f.dependencies, load: async () => null });
    await assert.rejects(() => bad('Missing', state(), 'chat A'), /Could not load lorebook/);
});

test('scan replaces stale copies, excludes foreign chats, and forces only the current ancestor chain', async () => {
    const f = fixture();
    const current = state();
    current.locations.records.ruins = place('ruins', 'Old Ruins');
    const entries = await f.sync('Chat', current, 'chat A');
    const inn = entries.find(entry => entry.castwardPlace.id === 'inn');
    Object.assign(inn, { disable: true, useProbability: true, group: 'Places', delay: 4,
        cooldown: 2, sticky: 3, delayUntilRecursion: 1 });
    const before = structuredClone(entries);
    const external = { uid: 80, world: 'Shared', content: 'NPC lore' };
    const stale = { uid: 8, world: 'Chat', content: 'Old location', castwardPlace: { owner: 'chat A', id: 'deleted' } };
    const foreign = structuredClone(f.book.entries[2]);
    const lore = { chatLore: [stale, foreign], personaLore: [inn],
        characterLore: [entries[0], external], globalLore: [inn] };
    const supplied = [...entries, inn, foreign, stale];
    assert.equal(applyLocationLore(lore, supplied, current, 'chat A'), 3);
    assert.equal(lore.chatLore.length, 3);
    assert.deepEqual(lore.personaLore, []);
    assert.deepEqual(lore.globalLore, []);
    assert.deepEqual(lore.characterLore, [external]);
    for (const entry of lore.chatLore) {
        if (entry.castwardPlace.id === 'ruins') {
            assert.equal(entry.constant, false);
            assert.notEqual(entry.ignoreBudget, true);
        } else {
            assert.equal(entry.constant, true);
            assert.equal(entry.ignoreBudget, true);
            assert.equal(entry.useProbability, false);
            assert.equal(entry.group, '');
            assert.equal(entry.delay, 0);
            assert.equal(entry.cooldown, 0);
            assert.equal(entry.sticky, 0);
            assert.equal(entry.delayUntilRecursion, false);
        }
    }
    assert.equal(lore.chatLore.find(entry => entry.castwardPlace.id === 'inn').disable, true);
    assert.deepEqual(entries, before, 'scan policy never changes stored entry copies');
    assert.equal(applyLocationLore(lore, supplied, current, 'chat A'), 3);
    assert.equal(lore.chatLore.length, 3, 'repeated scan has no duplicates');
});

test('disabled Places strip all managed lore while preserving ordinary lore', async () => {
    const f = fixture();
    const current = state();
    const entries = await f.sync('Chat', current, 'chat A');
    current.locations.enabled = false;
    const external = { uid: 99, content: 'Ordinary lore' };
    const lore = { chatLore: [...entries, external], globalLore: [f.book.entries[2]] };
    assert.equal(applyLocationLore(lore, entries, current, 'chat A'), 0);
    assert.deepEqual(lore, { chatLore: [external], globalLore: [] });
});


test('concurrent NPC allocation and place synchronization retain both writes in one book', async () => {
    let book = { entries: {} };
    const storage = {
        load: async () => structuredClone(book),
        save: async (_world, data) => { book = structuredClone(data); },
        allocate: (_world, data) => {
            const uid = Math.max(-1, ...Object.keys(data.entries).map(Number)) + 1;
            return data.entries[uid] = { uid };
        },
    };
    const places = createLocationLoreStore(storage);
    const profiles = createLoreEntryStore({ ...storage,
        identify: (card, entry) => { entry.key = [card.name]; }, persist: () => {},
    });
    const npc = { name: 'Mira' };
    await Promise.all([
        places('Shared', state(), 'chat A'),
        profiles(npc, 'Shared', npc.name, 'npc A'),
    ]);
    assert.equal(Object.keys(book.entries).length, 3);
    assert.equal(book.entries[npc.lorebook.uid].sillynpcOwner, 'npc A');
    assert.equal(Object.values(book.entries).filter(entry => entry.castwardPlace?.owner === 'chat A').length, 2);
});
