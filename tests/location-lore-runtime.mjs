import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocationLoreRuntime } from '../src/locations/location-lore.js';
import { createLocationLoreStore } from '../src/locations/location-lore-store.js';

function fixture() {
    const settings = { enabled: true, activeSystem: 'Fantasy',
        statusTracker: { enabled: true, locations: { enabled: true } } };
    const state = { locations: { currentId: 'inn', records: {
        town: { id: 'town', name: 'Ashford', description: 'A busy town.' },
        inn: { id: 'inn', name: 'Lantern Inn', description: 'A warm tavern.',
            parentId: 'town', lorebook: 'Old External Book', loreEntryId: 3 },
    } } };
    const context = { chatMetadata: { sillynpc_system: 'Fantasy', sillynpc_status_state: state },
        getCurrentChatId: () => 'adventure', user_avatar: 'hero.png', characterId: 0,
        characters: [{ avatar: 'narrator.png' }] };
    const owner = JSON.stringify(['place', null, 'narrator.png', 'adventure']);
    const external = { uid: 0, content: 'Unrelated NPC' };
    const book = { entries: { 0: external } };
    const lore = { chatLore: [external], globalLore: [], characterLore: [], personaLore: [] };
    const targets = [], syncs = [];
    const store = createLocationLoreStore({
        load: async () => book,
        save: async (_world, data) => { book.entries = structuredClone(data.entries); },
        allocate: (_world, data) => {
            const uid = Math.max(-1, ...Object.keys(data.entries).map(Number)) + 1;
            return data.entries[uid] = { uid };
        },
    });
    const deps = { getContext: () => context, getSettings: () => settings,
        getTarget: async options => { targets.push(options); return 'Chat Book'; },
        sync: async (...args) => { syncs.push(args); return store(...args); } };
    return { settings, context, state, owner, book, lore, external, targets, syncs, deps,
        update: createLocationLoreRuntime(deps) };
}

test('saved places create managed entries and migrate without adopting old external references', async () => {
    const f = fixture();
    const before = structuredClone(f.state);
    assert.equal(await f.update(f.lore), 2);
    assert.equal(f.targets[0].hasPlaces, true);
    assert.equal(f.targets[0].isCurrent(), true);
    assert.equal(f.syncs[0][0], 'Chat Book');
    assert.equal(f.syncs[0][2], f.owner);
    assert.equal(f.syncs[0][3](), true);
    assert.equal(f.syncs[0][1].locations.enabled, true, 'System enables Places in old saved state');
    assert.equal(f.lore.chatLore.length, 3);
    assert.ok(f.lore.chatLore.slice(1).every(entry => entry.constant && entry.ignoreBudget));
    assert.equal(f.book.entries[0].content, 'Unrelated NPC');
    assert.deepEqual(f.state, before, 'lore synchronization leaves tracker tree unchanged');
    assert.equal(await f.update(), 2, 'background refresh has the same sync signature without a scan');
    assert.equal(Object.keys(f.book.entries).length, 3);
});

test('an empty place store still reconciles deletion without requesting a new target', async () => {
    const f = fixture();
    await f.update(f.lore);
    f.state.locations.records = {};
    f.state.locations.currentId = '';
    assert.equal(await f.update(f.lore), 0);
    assert.equal(f.targets[1].hasPlaces, false);
    assert.equal(Object.keys(f.book.entries).length, 1);
    assert.deepEqual(f.lore.chatLore, [f.external]);
});

test('disabled feature, missing chat, and System mismatch suppress all managed scan copies', async () => {
    const mutations = [
        f => { f.settings.enabled = false; },
        f => { f.settings.statusTracker.enabled = false; },
        f => { f.settings.statusTracker.locations.enabled = false; },
        f => { f.context.chatMetadata = null; },
        f => { f.context.getCurrentChatId = () => ''; },
        f => { f.context.chatMetadata.sillynpc_system = 'Other'; },
    ];
    for (const mutate of mutations) {
        const f = fixture();
        const managed = { castwardPlace: { owner: f.owner, id: 'inn' }, content: 'Old place' };
        for (const key of ['chatLore', 'globalLore', 'characterLore', 'personaLore']) f.lore[key].push(managed);
        mutate(f);
        assert.equal(await f.update(f.lore), 0);
        assert.deepEqual(f.targets, []);
        assert.deepEqual(f.syncs, []);
        assert.deepEqual(f.lore, { chatLore: [f.external], globalLore: [], characterLore: [], personaLore: [] });
    }
});

const changes = [
    ['metadata', f => { f.context.chatMetadata = structuredClone(f.context.chatMetadata); }],
    ['chat', f => { f.context.getCurrentChatId = () => 'another'; }],
    ['persona', f => { f.context.user_avatar = 'another.png'; }],
    ['System', f => { f.settings.activeSystem = 'Other'; }],
    ['metadata System', f => { f.context.chatMetadata.sillynpc_system = 'Other'; }],
    ['extension enabled', f => { f.settings.enabled = false; }],
    ['tracker enabled', f => { f.settings.statusTracker.enabled = false; }],
    ['Places enabled', f => { f.settings.statusTracker.locations.enabled = false; }],
    ['current place', f => { f.state.locations.currentId = 'town'; }],
    ['description', f => { f.state.locations.records.inn.description = 'Changed facts.'; }],
    ['group owner', f => { f.context.groupId = 'another group'; }],
    ['character owner', f => { f.context.characters[0].avatar = 'another narrator.png'; }],
];

for (const stage of ['target', 'sync']) {
    test(`changes during the ${stage} await cancel the write and cannot append stale lore`, async () => {
        for (const [name, mutate] of changes) {
            const f = fixture();
            const key = stage === 'target' ? 'getTarget' : 'sync';
            const original = f.deps[key];
            let resume, started;
            const waiting = new Promise(resolve => { resume = resolve; });
            const entered = new Promise(resolve => { started = resolve; });
            f.deps[key] = async (...args) => { started(); await waiting; return original(...args); };
            const pending = createLocationLoreRuntime(f.deps)(f.lore);
            await entered;
            mutate(f);
            resume();
            assert.equal(await pending, 0, name);
            assert.deepEqual(f.lore.chatLore, [f.external], name);
            assert.deepEqual(f.book.entries, { 0: f.external }, name);
            if (stage === 'target') assert.deepEqual(f.syncs, [], name);
            else assert.equal(f.syncs[0][3](), false, name);
        }
    });
}

test('cancelled or unavailable lorebook targets leave ordinary lore untouched', async () => {
    const f = fixture();
    f.deps.getTarget = async () => '';
    assert.equal(await createLocationLoreRuntime(f.deps)(f.lore), 0);
    assert.deepEqual(f.syncs, []);
    assert.deepEqual(f.lore.chatLore, [f.external]);
});
