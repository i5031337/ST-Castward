import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcLoreHandoff, compactNpcToolHistory } from '../src/npc/npc-lore-handoff.js';

function fixture() {
    const settings = { enabled: true, npcCreationToolEnabled: true, activeSystem: 'A' };
    const context = { chatMetadata: {}, chat: [{ is_user: true }], getCurrentChatId: () => 'chat' };
    const card = { id: 'npc', lorebook: { world: 'Book', uid: 0 } };
    const cards = [card];
    const handoff = createNpcLoreHandoff({ getContext: () => context, getSettings: () => settings, getCards: () => cards });
    const entry = { world: 'Book', uid: 0, content: 'Unique profile', constant: false, ignoreBudget: false, useProbability: true, probability: 0 };
    return { settings, context, card, cards, handoff, entry };
}

test('immediate narration uses one scan copy of a new profile, without modifying saved policy', () => {
    const f = fixture();
    f.handoff.remember(f.card);
    for (const source of ['chatLore', 'globalLore', 'characterLore', 'personaLore']) {
        const lore = { chatLore: [], globalLore: [], characterLore: [], personaLore: [] };
        lore[source].push(f.entry);
        const originalArray = lore[source];
        f.handoff.apply(lore);
        assert.equal(lore[source], originalArray, 'host retains its original array reference');
        assert.equal(lore[source].length, 1);
        assert.equal(lore[source][0].constant, true);
        assert.equal(lore[source][0].ignoreBudget, true);
        assert.equal(lore[source][0].useProbability, false);
    }
    assert.equal(f.entry.constant, false);
    assert.equal(f.entry.ignoreBudget, false);
    const duplicate = { chatLore: [f.entry], globalLore: [{ ...f.entry }] };
    f.handoff.apply(duplicate);
    assert.equal(duplicate.chatLore.length + duplicate.globalLore.length, 1);
});

test('handoff expires across user turns, chat, System, disablement, deletion and link changes', () => {
    for (const mutate of [
        f => f.context.chat.push({ is_user: true }),
        f => { f.context.chatMetadata = {}; },
        f => { f.context.getCurrentChatId = () => 'other'; },
        f => { f.settings.activeSystem = 'B'; },
        f => { f.settings.enabled = false; },
        f => { f.settings.npcCreationToolEnabled = false; },
        f => { f.cards.length = 0; },
        f => { f.card.lorebook = { world: 'Another', uid: 0 }; },
        f => f.handoff.clear(),
    ]) {
        const f = fixture();
        f.handoff.remember(f.card);
        mutate(f);
        assert.deepEqual(f.handoff.cards(), []);
        const lore = { chatLore: [f.entry] };
        f.handoff.apply(lore);
        assert.equal(lore.chatLore[0], f.entry);
    }
});

test('intermediate assistant tool messages keep all profiles available for the continuation', () => {
    const f = fixture();
    f.handoff.remember(f.card);
    f.context.chat.push({ is_user: false, extra: { tool_invocations: [] } });
    const second = { id: 'second', lorebook: { world: 'Book', uid: 1 } };
    f.cards.push(second);
    f.handoff.remember(second);
    assert.deepEqual(f.handoff.cards(), [f.card, second]);
    const lore = { chatLore: [f.entry, { world: 'Book', uid: 1, content: 'Second' }, { world: 'Book', uid: 2, content: 'Unrelated' }] };
    f.handoff.apply(lore);
    assert.equal(lore.chatLore.filter(entry => entry.constant).length, 2);
    assert.equal(lore.chatLore[2].constant, undefined);
});

test('handoff never re-enables disabled lore', () => {
    const f = fixture();
    f.handoff.remember(f.card);
    const disabled = { ...f.entry, disable: true };
    const lore = { chatLore: [disabled] };
    f.handoff.apply(lore);
    assert.equal(lore.chatLore[0], disabled);
});

test('outgoing historical Castward tool results become receipts; other tools and failures remain intact', () => {
    const original = JSON.stringify({ ok: true, id: 'npc', name: 'Mira', profile: { appearance: 'Secret' }, stats: { HP: '2' }, collections: {} });
    const chat = [
        { role: 'assistant', tool_calls: [{ id: 'our', function: { name: 'castward_create_npc' } }, { id: 'other', function: { name: 'other' } }] },
        { role: 'tool', tool_call_id: 'our', content: original },
        { role: 'tool', tool_call_id: 'other', content: original },
        { role: 'tool', tool_call_id: 'our', content: '{"ok":false,"error":"Offline"}' },
        { role: 'tool', tool_call_id: 'our', content: 'Invalid JSON' },
    ];
    compactNpcToolHistory({ chat });
    assert.deepEqual(JSON.parse(chat[1].content), { ok: true, reused: false, id: 'npc', name: 'Mira' });
    assert.equal(chat[2].content, original);
    assert.equal(JSON.parse(chat[3].content).error, 'Offline');
    assert.equal(chat[4].content, 'Invalid JSON');
});
