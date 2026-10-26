import assert from 'node:assert/strict';
import test from 'node:test';
import { createCastLoreActivator } from '../src/lore/cast-lore.js';

function fixture() {
    const settings = { enabled: true, activeSystem: 'A' };
    const context = { getCurrentChatId: () => 'new chat', chatMetadata: { sillynpc_system: 'A', world_info: 'Existing book' } };
    let cards = [
        { id: 'new', name: 'Mira', rosterSourceId: 'original', lorebook: { world: 'Old chat book', uid: 1 } },
        { id: 'second', name: 'Jon', rosterSourceId: 'other', lorebook: { world: 'Another book', uid: 1 } },
    ];
    const books = {
        'Old chat book': { entries: {
            1: { uid: 1, key: ['Mira', 'Captain'], content: 'Mira profile', disable: false, order: 80, probability: 75 },
            2: { uid: 2, key: ['Unrelated'], content: 'Other adventure', constant: true },
        } },
        'Another book': { entries: { 1: { uid: 1, key: ['Jon'], content: 'Jon profile', disable: true } } },
    };
    const loads = [], errors = [];
    const deps = { getSettings: () => settings, getContext: () => context, getCharacters: () => cards,
        loadWorldInfo: async name => { loads.push(name); return books[name]; },
        onError: (...args) => errors.push(args) };
    const lore = { globalLore: [], characterLore: [], chatLore: [{ world: 'Existing book', uid: 5, content: 'Existing lore' }], personaLore: [] };
    return { settings, context, books, loads, errors, deps, lore,
        setCards: value => { cards = value; }, cards, activate: createCastLoreActivator(deps) };
}

test('carried cast links supply their profiles from multiple books without activating unrelated entries or replacing selections', async () => {
    const { activate, lore, context, books, loads } = fixture();
    assert.equal(await activate(lore), 2);
    assert.deepEqual(loads, ['Old chat book', 'Another book']);
    assert.deepEqual(lore.chatLore.map(entry => entry.content), ['Existing lore', 'Mira profile', 'Jon profile']);
    assert.equal(lore.chatLore[1].world, 'Old chat book');
    assert.equal(lore.chatLore[1].probability, 75);
    assert.equal(lore.chatLore[2].disable, true, 'honor native disabled-entry policy');
    assert.equal(context.chatMetadata.world_info, 'Existing book');
    lore.chatLore[1].key.push('Mutation');
    assert.deepEqual(books['Old chat book'].entries[1].key, ['Mira', 'Captain']);
});

test('native chat, global, character and persona entries are never duplicated or overridden', async () => {
    for (const kind of ['globalLore', 'characterLore', 'chatLore', 'personaLore']) {
        const { activate, lore, cards, loads } = fixture();
        cards.splice(1);
        const native = { world: 'Old chat book', uid: '1', disable: true, content: 'Native entry' };
        lore[kind].push(native);
        assert.equal(await activate(lore), 0);
        assert.deepEqual(loads, []);
        assert.equal(lore[kind].at(-1), native);
        assert.equal(native.disable, true);
    }
});

test('missing lorebooks and deleted entries leave normal host lore intact', async () => {
    const { deps, lore, cards, errors } = fixture();
    cards[0].lorebook.uid = 999;
    deps.loadWorldInfo = async name => {
        if (name === 'Another book') throw new Error('Missing book');
        return { entries: {} };
    };
    assert.equal(await createCastLoreActivator(deps)(lore), 0);
    assert.equal(errors.length, 1);
    assert.equal(lore.chatLore.length, 1);
});

test('extension, closed chat and System boundaries prevent activation', async () => {
    const { settings, context, activate, lore, loads } = fixture();
    settings.enabled = false;
    assert.equal(await activate(lore), 0);
    settings.enabled = true;
    context.chatMetadata.sillynpc_system = 'B';
    assert.equal(await activate(lore), 0);
    context.chatMetadata.sillynpc_system = 'A';
    context.getCurrentChatId = () => undefined;
    assert.equal(await activate(lore), 0);
    assert.deepEqual(loads, []);
});

test('chat or System switches, disablement, scope exclusions and changed links during loading cannot inject stale lore', async () => {
    const mutations = [
        f => { f.context.chatMetadata = {}; },
        f => { f.context.getCurrentChatId = () => 'another'; },
        f => { f.settings.activeSystem = 'B'; },
        f => { f.settings.enabled = false; },
        f => { f.setCards([]); },
        f => { f.cards.forEach(card => { card.lorebook = null; }); },
    ];
    for (const mutate of mutations) {
        const f = fixture();
        let release;
        const wait = new Promise(resolve => { release = resolve; });
        f.deps.loadWorldInfo = async name => { await wait; return f.books[name]; };
        const pending = createCastLoreActivator(f.deps)(f.lore);
        mutate(f);
        release();
        assert.equal(await pending, 0);
        assert.equal(f.lore.chatLore.length, 1);
    }
});
