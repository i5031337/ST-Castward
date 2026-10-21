import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { makeState } from './fixtures/gemma-tracker-scenarios.mjs';

test('Gemma harness dry run applies implied energy recovery with the real tracker rules', async () => {
    const blank = await harness('dating', {});
    const state = makeState({ system: 'dating', npc: 'June', energy: '2/10' }, blank.settings);
    const reader = await harness('dating', state);
    const text = 'You have a restful night and wake refreshed.';

    const restored = reader.normalize({ player: { stats: { 'Social Energy': '10/10' } } }, text);
    assert.equal(restored.update.player.stats['Social Energy'], '10/10');
    assert.equal(restored.effective.player.stats['Social Energy'], '10/10');
    assert.equal(state.player.stats['Social Energy'], '2/10');

    const excessive = reader.normalize({ player: { stats: { 'Social Energy': '22/10' } } }, text);
    assert.equal(excessive.effective.player.stats['Social Energy'], '10/10');
    assert.equal(state.player.stats['Social Energy'], '2/10');
});

test('Gemma harness dry run resolves earned XP through production progression', async () => {
    const blank = await harness('fantasy', {});
    const state = makeState({ system: 'fantasy', xp: '90/100' }, blank.settings);
    const reader = await harness('fantasy', state);
    const result = reader.normalize({ player: { stats: { XP: '110/100' } } }, 'Alex earns experience.');
    assert.equal(result.update.player.stats.XP, '110/100');
    assert.equal(result.effective.player.stats.XP, '10/100');
    assert.equal(result.effective.player.stats.Level, '2');
});

test('Gemma harness dry run applies a restorative NPC pool reading', async () => {
    const blank = await harness('fantasy', {});
    const state = makeState({ system: 'fantasy', npc: 'Mira' }, blank.settings);
    state.characters[0].stats.HP = '6/12';
    const reader = await harness('fantasy', state);
    const result = reader.normalize({ characters: [{ name: 'Mira', stats: { HP: '12/12' } }] },
        'Mira wakes with her cuts fully healed.');
    assert.equal(result.effective.characters.find(actor => actor.name === 'Mira').stats.HP, '12/12');
    assert.equal(state.characters[0].stats.HP, '6/12');
});

test('partial recovery preserves both owners’ remaining HP deficits', async () => {
    const blank = await harness('fantasy', {});
    const state = makeState({ system: 'fantasy', npc: 'Mira', hp: '3/12' }, blank.settings);
    state.characters[0].stats.HP = '4/12';
    const result = (await harness('fantasy', state)).normalize({
        player: { stats: { HP: '5/12' } }, characters: [{ name: 'Mira', stats: { HP: '7/12' } }],
    }, 'Both wounds ease, but neither is fully healed.');
    assert.equal(result.effective.player.stats.HP, '5/12');
    assert.equal(result.effective.characters.find(actor => actor.name === 'Mira').stats.HP, '7/12');
});
