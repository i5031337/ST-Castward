import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { calculateCollectionEdit, commitCollectionEdit } from '../src/tracker/collection-editor-calculation.js';

function fixture({ offstage = false, noChat = false, boundSystem = 'World' } = {}) {
    const settings = { activeSystem: 'World', master_items: { inventory: { sword: { name: 'Sword', kind: 'Steel' } } },
        statusTracker: { collections: [{ id: 'inventory', fields: [
            { name: 'name', isPrimary: true, type: 'text', isStatic: true },
            { name: 'kind', type: 'text', isStatic: true },
        ] }] } };
    const definition = { id: 'canonical-world', metadata: { description: 'Rules' } };
    const card = { id: 'mira', name: 'Mira', statusCollections: { inventory: [{ name: 'Sword', kind: 'Steel' }] } };
    const state = { player: { name: 'Player', personaKey: 'alice', collections: {} },
        characters: [{ id: 'mira', name: 'Mira', collections: structuredClone(card.statusCollections) }], recently_deleted: {} };
    if (offstage) state.characters = [];
    let context = { getCurrentChatId: () => noChat ? undefined : 'chat-a', chatMetadata: { sillynpc_status_state: state, sillynpc_system: boundSystem } };
    let persona = 'alice';
    let saves = 0, reads = 0;
    let emitted = 0;
    let rejectStorage = false;
    let history;
    const globals = { getContext: () => context, getSettings: () => settings,
        getAllCharacters: () => [card], activeNpcSystem: () => definition,
        getCurrentPersonaKey: () => persona,
        loadStateFromMetadata: () => { reads++; return context.chatMetadata.sillynpc_status_state; },
        saveStateToMetadata(next, options) {
            if (rejectStorage || !options.isCurrent()) return false;
            history = structuredClone(context.chatMetadata.sillynpc_status_state);
            options.beforeCommit();
            context.chatMetadata.sillynpc_status_state = next;
            return true;
        },
        saveSettings: () => saves++, eventSource: { emit: () => emitted++ },
        calculateCollectionEdit, commitCollectionEdit };
    const source = readFileSync(new URL('../src/tracker/collection-editor.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replace('export function', 'function');
    const create = new Function(...Object.keys(globals), `${source}\nreturn createCollectionEditor;`)(...Object.values(globals));
    const editor = create({ ...card, collections: card.statusCollections }, false);
    const change = { operation: 'edit', collectionId: 'inventory', index: 0,
        item: structuredClone(card.statusCollections.inventory[0]), fieldName: 'name', value: 'Blade' };
    return { settings, definition, card, state, editor, change, get context() { return context; },
        chat: value => { context = value; }, persona: value => { persona = value; },
        reject: () => { rejectStorage = true; }, saves: () => saves, emitted: () => emitted,
        history: () => history, reads: () => reads };
}

for (const boundary of ['chat', 'metadata', 'persona', 'rules', 'canonical rules', 'System binding', 'player owner', 'storage', 'item']) {
    test(`manual item edit rejected at ${boundary} leaves related stores untouched`, () => {
        const f = fixture();
        if (boundary === 'chat') f.chat({ ...f.context, getCurrentChatId: () => 'chat-b' });
        if (boundary === 'metadata') f.chat({ ...f.context, chatMetadata: { ...f.context.chatMetadata } });
        if (boundary === 'persona') f.persona('bob');
        if (boundary === 'rules') f.settings.statusTracker.collections[0].name = 'Changed';
        if (boundary === 'canonical rules') f.definition.metadata.description = 'Changed in place';
        if (boundary === 'System binding') f.context.chatMetadata.sillynpc_system = 'Other';
        if (boundary === 'player owner') f.state.player.personaKey = 'bob';
        if (boundary === 'storage') f.reject();
        if (boundary === 'item') f.state.characters[0].collections.inventory[0] = { name: 'Shield', kind: 'Wood' };
        const before = JSON.stringify([f.settings, f.card, f.context.chatMetadata]);
        assert.equal(f.editor.commit(f.change, 'Item edited'), false);
        assert.equal(JSON.stringify([f.settings, f.card, f.context.chatMetadata]), before);
        assert.equal(f.saves(), 0);
        assert.equal(f.emitted(), 0);
        assert.equal(f.history(), undefined);
    });
}

test('accepted item rename installs scene, card and library together and preserves undo source', () => {
    const f = fixture();
    assert.equal(f.editor.commit(f.change, 'Item edited'), true);
    assert.equal(f.context.chatMetadata.sillynpc_status_state.characters[0].collections.inventory[0].name, 'Blade');
    assert.equal(f.card.statusCollections.inventory[0].name, 'Blade');
    assert.equal(f.settings.master_items.inventory.sword, undefined);
    assert.equal(f.settings.master_items.inventory.blade.name, 'Blade');
    assert.equal(f.history().characters[0].collections.inventory[0].name, 'Sword');
    assert.equal(f.state.characters[0].collections.inventory[0].name, 'Sword');
    assert.equal(f.emitted(), 1);
});

test('manual removal retains tombstone policy and explicit addition clears it', () => {
    const f = fixture();
    const change = { ...f.change, operation: 'remove' };
    assert.equal(f.editor.commit(change, 'Item dropped'), true);
    assert.equal(f.context.chatMetadata.sillynpc_status_state.recently_deleted.inventory.sword, 3);
    assert.equal(f.card.statusCollections.inventory.length, 0);
    assert.equal(f.editor.commit({ operation: 'add', collectionId: 'inventory', item: change.item }, 'Item added'), true);
    assert.equal(f.context.chatMetadata.sillynpc_status_state.recently_deleted.inventory.sword, undefined);
    assert.equal(f.card.statusCollections.inventory.length, 1);
});

test('offstage card edit works without an open chat and leaves old chat state alone', () => {
    const f = fixture({ offstage: true, noChat: true, boundSystem: 'Inactive old chat' });
    const before = JSON.stringify(f.state);
    assert.equal(f.editor.commit(f.change, 'Item edited'), true);
    assert.equal(JSON.stringify(f.state), before);
    assert.equal(f.card.statusCollections.inventory[0].name, 'Blade');
    assert.equal(f.emitted(), 0);
    assert.equal(f.reads(), 0);
});

test('an editor opened before incoming chat System restoration refuses outgoing rules', () => {
    const f = fixture({ boundSystem: 'Incoming World' });
    const before = JSON.stringify([f.settings, f.card, f.context.chatMetadata]);
    assert.equal(f.editor.commit(f.change, 'Item edited'), false);
    assert.equal(JSON.stringify([f.settings, f.card, f.context.chatMetadata]), before);
    assert.equal(f.saves(), 0);
    assert.equal(f.emitted(), 0);
    assert.equal(f.reads(), 0);
});
