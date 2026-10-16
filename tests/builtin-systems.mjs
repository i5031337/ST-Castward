import assert from 'node:assert/strict';
import test from 'node:test';
import { builtinSystemChoices, createBuiltinSystem } from '../src/core/builtin-systems.js';
import { validateDefinition } from '../src/generation/validate-definition.js';
import { systemStatFields, systemProfileFields } from '../src/core/system-fields.js';
import { projectSystemTracker } from '../src/core/system-schema.js';
import { statGrowthBounds, constrainNumericStat } from '../src/tracker/numeric-stat-bounds.js';
import { boostStat } from '../src/tracker/progression.js';
import { pointOptions } from '../src/tracker/level-stat-points.js';
import { isReaderStat } from '../src/tracker/stat-update-policy.js';
import { describeReaderStats } from '../src/tracker/stat-prompt-definitions.js';
import { guidedRewardLevels, collectionRewardAppliesTo } from '../src/core/collection-rewards.js';
import { imageItemsFromCollections } from '../src/api/api-image-items.js';

test('shipped Systems validate and remain independent editable copies', () => {
    assert.deepEqual(builtinSystemChoices.map(choice => choice.id), ['fantasy', 'dating', 'creature']);
    for (const choice of builtinSystemChoices) {
        const definition = createBuiltinSystem(choice.id);
        assert.deepEqual(validateDefinition(definition), [], choice.name);
        assert.deepEqual(validateDefinition(structuredClone(definition)), []);
        assert.ok(projectSystemTracker(definition).collections.length > 0);
        assert.ok(definition.npcTemplates.length >= 1);
        assert.equal(definition.metadata.author, 'SillyNPC');
        definition.name = 'Edited';
        assert.equal(createBuiltinSystem(choice.id).name, choice.name);
    }
    assert.equal(createBuiltinSystem('missing'), null);
});

test('fantasy starter gives people and beasts the same prose-described stats', () => {
    const system = createBuiltinSystem('fantasy');
    const player = systemStatFields(system, 'player');
    const character = systemStatFields(system, 'npc', { npcTemplateId: 'character' });
    assert.deepEqual(system.npcTemplates.map(template => template.id), ['character']);
    assert.deepEqual(character.map(field => field.id), player.map(field => field.id));
    assert.ok(player.some(field => field.id === 'strength'));
    assert.ok(character.some(field => field.id === 'hp'));
    assert.deepEqual(system.collections.map(collection => collection.id), ['equipment', 'abilities']);
    const abilities = system.collections.find(collection => collection.id === 'abilities');
    const uses = abilities
        .fields.find(field => field.id === 'uses');
    assert.equal(uses.defaultValue, '');
    assert.equal(uses.isStatic, false);
    assert.equal(abilities.levelUpRewards.mode, 'guided');
    assert.deepEqual(guidedRewardLevels(abilities, [2, 3]), [2, 3]);
    assert.equal(collectionRewardAppliesTo(abilities, 'player'), true);
    assert.equal(collectionRewardAppliesTo(abilities, 'npc', 'character'), true);
    assert.deepEqual(system.progression.player.statIds, ['hp']);
    assert.ok(systemProfileFields(system, 'npc', { npcTemplateId: 'character' })
        .some(field => field.id === 'ancestry'));
    for (const stat of [...system.stats.world, ...character]) {
        assert.ok(stat.purpose.length > 35, `${stat.name} needs a usable prose description`);
    }
    for (const id of ['armor', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']) {
        assert.equal(isReaderStat(character.find(field => field.id === id)), true, id);
    }
    const prompt = describeReaderStats(projectSystemTracker(system));
    assert.match(prompt, /NPC\.Strength: number; Physical power used to lift/);
    assert.match(prompt, /NPC\.Armor: number; Protection from worn gear/);
    assert.doesNotMatch(JSON.stringify(system), /external rules|rules pipeline|rules engine/i);
    assert.equal(system.progression.player.enabled, true);
    assert.equal(system.npcTemplates[0].progression.enabled, true);
});

test('dating starter uses one cast template, outfit and item collections, and memories', () => {
    const system = createBuiltinSystem('dating');
    const character = systemStatFields(system, 'npc', { npcTemplateId: 'character' });
    assert.deepEqual(system.npcTemplates.map(template => template.id), ['character']);
    assert.ok(character.some(field => field.id === 'affection'));
    assert.ok(character.some(field => field.id === 'trust'));
    assert.ok(systemProfileFields(system, 'npc', { npcTemplateId: 'character' })
        .some(field => field.id === 'boundaries'));
    assert.deepEqual(system.collections.map(collection => collection.id), ['clothing', 'items']);
    assert.equal(system.collections[0].trackQuantity, false);
    assert.equal(system.collections[1].trackQuantity, true);
    assert.equal(imageItemsFromCollections({ clothing: [{ name: 'Red coat' }],
        items: [{ name: 'Wrapped gift' }] }, system.collections, true), 'Red coat');
    assert.equal(system.memories.enabled, true);
    assert.equal(system.progression.player.enabled, false);
    assert.ok(system.npcTemplates.every(template => !template.progression.enabled));
});

test('creature starter has one growing HP pool and bounded combat ratings', () => {
    const system = createBuiltinSystem('creature');
    assert.deepEqual(system.collections.map(collection => collection.id), ['team', 'moves', 'items']);
    const team = system.collections.find(collection => collection.id === 'team');
    assert.deepEqual(team.fields.map(field => field.id), ['name', 'species']);
    const items = system.collections.find(collection => collection.id === 'items');
    assert.deepEqual(items.targets, ['player', 'template:trainer']);
    assert.deepEqual(items.fields.map(field => field.id), ['name', 'quantity', 'description']);
    assert.equal(items.trackQuantity, true);
    assert.equal(items.includeInImagePrompt, false);
    const stats = systemStatFields(system, 'npc', { npcTemplateId: 'creature' });
    const hp = stats.find(field => field.id === 'hp');
    const progression = system.npcTemplates.find(template => template.id === 'creature').progression;
    assert.equal(stats.filter(field => field.id.includes('hp')).length, 1);
    assert.equal(hp.defaultValue, '10/10');
    assert.equal(hp.maxStatValue, '255');
    assert.deepEqual(statGrowthBounds(hp, '10/10'), { growMaximum: true, fixedMaximum: 255 });
    assert.equal(boostStat('10/10', '10/10', 2, statGrowthBounds(hp, '10/10')), '12/12');
    assert.equal(boostStat('254/254', '254/254', 2, statGrowthBounds(hp, '254/254')), '255/255');
    assert.equal(constrainNumericStat(hp, '12/12', '10/10'), '12/12');
    assert.deepEqual(progression.statIds,
        ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed']);
    assert.equal(progression.enabled, true);
    const values = Object.fromEntries(stats.map(field => [field.name, field.defaultValue]));
    assert.deepEqual(pointOptions(stats, progression, values, 2).map(option => option.id),
        progression.statIds);
    for (const id of progression.statIds.filter(id => id !== 'hp')) {
        const field = stats.find(stat => stat.id === id);
        assert.equal(field.maxStatValue, '255');
        assert.equal(field.locked, true);
    }
});
