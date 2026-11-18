import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStatusModule } from './helpers/status-module.mjs';
import { hasPendingImageCollection } from '../src/expressions/expression-source-policy.js';
import { createExpressionCompletion, deferExpressionCompletion } from '../src/expressions/expression-events.js';

function fixture() {
    let player = { id: 'player:one.png', personaKey: 'one.png', isPlayer: true };
    const settings = { enabled: true, playerExpressions: true, autoGenerateNpcExpressions: false };
    const context = { chat: [{ is_user: true, mes: 'I am happy.', force_avatar: 'one.png' }] };
    const api = loadStatusModule(new URL('../src/expressions/expression-actors.js', import.meta.url), {
        getContext: () => context, getSettings: () => settings,
        getPlayerCard: () => player, getCurrentPersonaKey: () => player.personaKey,
        getActiveCharacters: () => [{ id: 'npc', name: 'One' }],
        personaFileFromAvatar: value => value || '', dialogueRevision: () => 'revision',
        dialogueLineCurrent: () => true, readDialogueRecords: () => [
            { isPersona: true, npcId: null, text: 'Hello.' }, { npcId: 'npc', text: 'Hi.' }],
    });
    return { api, settings, context, switchPersona() {
        player = { id: 'player:two.png', personaKey: 'two.png', isPlayer: true };
    } };
}

test('player expressions use persona identity independently of NPC automation', () => {
    const { api, settings } = fixture();
    const mapped = api.expressionLine({ npcId: null, isPersona: true });
    assert.equal(mapped.npcId, 'player:one.png');
    assert.equal(api.expressionCardFor(mapped.npcId).isPlayer, true);
    assert.equal(api.expressionsEnabled(mapped), true);
    assert.equal(api.expressionsEnabled({ npcId: 'npc' }), false);
    settings.playerExpressions = false;
    settings.autoGenerateNpcExpressions = true;
    assert.equal(api.expressionsEnabled(mapped), false);
    assert.equal(api.expressionsEnabled({ npcId: 'npc' }), true);
});

test('user messages are classified whole and another persona’s messages are excluded', () => {
    const { api, context, switchPersona } = fixture();
    const element = { getAttribute: () => '0' };
    const [line] = api.readExpressionLines(element);
    assert.equal(line.text, 'I am happy.');
    assert.equal(line.npcId, 'player:one.png');
    assert.equal(line.lineIndex, 0);
    assert.equal(api.expressionLineCurrent(line), true);
    switchPersona();
    assert.equal(api.expressionLineCurrent(line), false);
    assert.equal(api.expressionCardFor(line.npcId), null);
    assert.equal(api.expressionLine(line).npcId, 'player:one.png');
    assert.deepEqual(api.readExpressionLines(element), []);
    context.chat[0].is_system = true;
    assert.deepEqual(api.readExpressionLines(element), []);
});

test('recognized player dialogue shares the expression pipeline without changing NPC routing', () => {
    const { api, context } = fixture();
    context.chat[0].is_user = false;
    const lines = api.readExpressionLines({ getAttribute: () => '0' });
    assert.deepEqual(lines.map(line => line.npcId), ['player:one.png', 'npc']);
});

test('player regeneration waits only for player image collections awaiting review', () => {
    const card = { isPlayer: true, name: 'One' };
    const definitions = [{ id: 'outfit', targets: ['player'], includeInImagePrompt: true }];
    const row = { scope: 'player', collectionId: 'outfit', kind: 'item-add' };
    assert.equal(hasPendingImageCollection([row], card, definitions), true);
    assert.equal(hasPendingImageCollection([{ ...row, scope: 'npc', actor: 'One' }], card, definitions), false);
    assert.equal(hasPendingImageCollection([{ ...row, collectionId: 'secret' }], card, definitions), false);
});

for (const change of ['cancel', 'replace', 'none']) {
    test(`player completion preserves foreground ownership after ${change}`, async () => {
        const context = { chat: [{ is_user: true }, { mes: 'Reply' }] };
        let epoch = 0, finishPlayer;
        const calls = [];
        const complete = createExpressionCompletion({ getContext: () => context, version: () => epoch,
            playerEnabled: () => true, complete: id => {
                calls.push(id);
                if (id === 0) return new Promise(resolve => { finishPlayer = resolve; });
            } });
        const pending = complete(1);
        assert.deepEqual(calls, [0]);
        if (change === 'cancel') epoch++;
        if (change === 'replace') context.chat = [{ is_user: true }, { mes: 'Another chat' }];
        finishPlayer();
        await pending;
        assert.deepEqual(calls, change === 'none' ? [0, 1] : [0]);
    });
}

test('queued user completion ignores cancelled and replaced messages', () => {
    for (const change of ['cancel', 'replace', 'none']) {
        const context = { chat: [{ is_user: true }] };
        let epoch = 0, frame;
        const calls = [];
        deferExpressionCompletion(0, { getContext: () => context, version: () => epoch,
            defer: callback => { frame = callback; }, complete: id => calls.push(id) });
        if (change === 'cancel') epoch++;
        if (change === 'replace') context.chat[0] = { is_user: true };
        frame();
        assert.deepEqual(calls, change === 'none' ? [0] : []);
    }
});
