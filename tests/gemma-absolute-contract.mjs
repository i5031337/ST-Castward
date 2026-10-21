import assert from 'node:assert/strict';
import test from 'node:test';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { makeState } from './fixtures/gemma-tracker-scenarios.mjs';
import { roleplayScenarios, makeRoleplayState } from './fixtures/gemma-tracker-roleplay-scenarios.mjs';

async function fixture(overrides = {}) {
    const blank = await harness('fantasy', {});
    const state = makeState({ system: 'fantasy', npc: 'Mira', xp: '90/100', ...overrides }, blank.settings);
    return { state, reader: await harness('fantasy', state) };
}

test('production absolute contract removes competing stat contracts from all twenty complete requests', async () => {
    for (const scenario of roleplayScenarios) {
        const blank = await harness(scenario.system, {});
        const state = makeRoleplayState(scenario, blank.settings);
        const reader = await harness(scenario.system, state);
        const prompt = reader.prompt(scenario.text, scenario.earlier);
        assert.ok(prompt.includes(scenario.text));
        assert.ok(prompt.includes(scenario.user));
        assert.match(prompt, /Report the resulting absolute value/);
        assert.doesNotMatch(prompt, /player\.deltas|characters\[\]\.deltas|globalDeltas|"deltas"|positive delta|ELIGIBLE NUMERIC DELTAS/);
        assert.doesNotMatch(prompt, /needs \+\d+|report the full missing amount/);
        const example = JSON.parse(prompt.split('Changed-reply example (illustrative changes):\n')[1].split('\n')[0]);
        for (const owner of [example.player, ...example.characters]) {
            for (const value of Object.values(owner.stats || {})) assert.equal(typeof value, 'string');
        }
    }
});

test('absolute schema keeps XP and stat readings as strings while collection quantities stay numeric', async () => {
    const { reader } = await fixture();
    const props = reader.schema.properties;
    assert.equal(props.globalDeltas, undefined);
    assert.equal(props.player.properties.deltas, undefined);
    assert.equal(props.characters.items.properties.deltas, undefined);
    assert.equal(props.player.properties.stats.properties.XP.type, 'string');
    assert.equal(props.player.properties.stats.properties.Level, undefined);
    for (const field of Object.values(props.player.properties.stats.properties)) assert.equal(field.type, 'string');
    assert.equal(props.player.properties.collections.properties.equipment.properties.add.items.properties.quantity.type, 'number');
});

test('absolute readings replace values rather than being added to held readings', async () => {
    const { reader } = await fixture();
    const result = reader.normalize({ global: {}, player: { stats: { HP: '9/12', Mana: '7/10', Currency: '17' } },
        characters: [{ name: 'Mira', stats: { HP: '8/12' } }] });
    assert.equal(result.effective.player.stats.HP, '9/12');
    assert.equal(result.effective.player.stats.Mana, '7/10');
    assert.equal(result.effective.player.stats.Currency, '17');
    assert.equal(result.effective.characters[0].stats.HP, '8/12');
});

test('XP totals cross one or several thresholds through existing production progression', async () => {
    const { reader } = await fixture();
    for (const [incoming, xp, level] of [['110/100', '10/100', '2'], ['270/100', '70/100', '3']]) {
        const result = reader.normalize({ player: { stats: { XP: incoming } }, characters: [] });
        assert.equal(result.update.player.stats.XP, incoming);
        assert.equal(result.effective.player.stats.XP, xp);
        assert.equal(result.effective.player.stats.Level, level);
    }
});

test('NPC XP uses the same total convention and cannot overwrite the managed level', async () => {
    const { state } = await fixture();
    state.characters[0].stats.XP = '90/100';
    const reader = await harness('fantasy', state);
    const result = reader.normalize({ player: {}, characters: [{ name: 'Mira', stats: { XP: '110/100', Level: '99' } }] });
    assert.equal(result.effective.characters[0].stats.XP, '10/100');
    assert.equal(result.effective.characters[0].stats.Level, '2');
});

test('production absolute contract ignores stray delta objects rather than rewarding a mixed reply', async () => {
    const { reader } = await fixture();
    const result = reader.normalize({ globalDeltas: { Time: 1 }, player: { stats: { HP: '9/12' }, deltas: { HP: -2 } },
        characters: [{ name: 'Mira', deltas: { HP: -3 } }] });
    assert.equal(result.effective.player.stats.HP, '9/12');
    assert.equal(result.effective.characters[0].stats.HP, '12/12');
    assert.equal(result.warnings.filter(warning => warning.includes('absolute')).length, 3);
});

test('absolute normalization tolerates scalar JSON numbers, but a quoted negative value is still absolute', async () => {
    const { reader } = await fixture();
    const result = reader.normalize({ player: { stats: { HP: 9, Currency: '17' } }, characters: [] });
    assert.equal(result.effective.player.stats.HP, '9/12');
    assert.equal(result.effective.player.stats.Currency, '17');
    const negative = reader.normalize({ player: { stats: { HP: '-3' } }, characters: [] });
    assert.equal(negative.effective.player.stats.HP, '0/12');
});

test('absolute sanitation retains held maxima and new NPC pool initialization', async () => {
    const { reader } = await fixture();
    const result = reader.normalize({ player: { stats: { HP: '9/99' } },
        characters: [{ name: 'Rowan', stats: { HP: '18/18', XP: '0/100', Level: '1' } }] });
    assert.equal(result.effective.player.stats.HP, '9/12');
    assert.equal(result.update.characters.find(actor => actor.name === 'Rowan').stats.HP, '18/18');
});

test('new NPC initial XP above its threshold does not award historical levels', async () => {
    const { state } = await fixture();
    state.characters.push({ name: 'New', stats: {}, collections: {} });
    const reader = await harness('fantasy', state);
    const result = reader.normalize({ characters: [{ name: 'New', npcTemplateId: 'character',
        stats: { HP: '18/18', XP: '220/100', Level: '3' } }] });
    const actor = result.effective.characters.find(actor => actor.name === 'New');
    assert.equal(actor.stats.Level, '3');
    assert.equal(actor.stats.XP, '100/100');
});

test('same XP current with an altered threshold is corrected and warned', async () => {
    const { reader } = await fixture();
    const result = reader.normalize({ player: { stats: { XP: '90/999' } } });
    assert.equal(result.effective.player.stats.XP, '90/100');
    assert.ok(result.warnings.some(warning => /XP/.test(warning) && /maximum/i.test(warning)));
});
