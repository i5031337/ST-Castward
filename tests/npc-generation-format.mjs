import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuiltinSystem } from '../src/core/builtin-systems.js';
import { projectSystemTracker } from '../src/core/system-schema.js';
import { npcGenerationContract, npcGenerationPrompt, validateGeneratedNpc } from '../src/npc/npc-generation.js';
import { describeCollections } from '../src/tracker/collection-prompt-definitions.js';
import { request, fixture, generated, settingsFixture } from './helpers/npc-creation.mjs';

function dating() {
    const system = createBuiltinSystem('dating');
    const settings = { activeSystem: system.id, statusTracker: {
        ...projectSystemTracker(system), presets: { [system.id]: { definition: system } },
    } };
    const contract = npcGenerationContract(settings);
    const choice = contract.choices[0];
    return { settings, contract, raw: {
        nameCandidates: ['June'], npcTemplateId: choice.id,
        profile: Object.fromEntries(choice.fields.map(field => [field.id, 'An established detail.'])),
        stats: { Mood: 'Calm', Affection: 15, Trust: 10, Comfort: 20, Relationship: 'Acquaintances' },
        collections: Object.fromEntries(choice.collections.map(collection => [collection.id, []])),
    } };
}

test('Dating Sim numeric relationship readings become saved strings without a repair request', async () => {
    const { settings, raw } = dating();
    const f = fixture();
    Object.assign(f.settings, settings);
    f.setGenerate(async () => raw);
    const result = JSON.parse(await f.service.create(request));
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.cards[0].statusOverrides, { Mood: 'Calm', Affection: '15', Trust: '10', Comfort: '20', Relationship: 'Acquaintances' });
    assert.equal(raw.stats.Affection, 15); // Input remains untouched.
});

test('NPC generation shares reader recovery for fences, trailing commas, bare keys and swapped closers', () => {
    const { contract, raw } = dating();
    const text = JSON.stringify(raw);
    const withEntry = structuredClone(raw);
    withEntry.collections.clothing = [{ name: 'Blue coat' }];
    const entryText = JSON.stringify(withEntry);
    const misplaced = entryText.replace('"Blue coat"}]', '"Blue coat"]}');
    const replies = [
        'Here is the NPC:\n```json\n' + text + '\n```',
        text.slice(0, -1) + ',}',
        text.replace('"stats":', 'stats:'),
        misplaced,
    ];
    for (const reply of replies) {
        const value = validateGeneratedNpc(reply, contract, [], () => 0);
        assert.equal(value.statusOverrides.Trust, '10');
        assert.equal(value.name, 'June');
    }
    assert.equal(validateGeneratedNpc(misplaced, contract, [], () => 0).statusCollections.clothing[0].name, 'Blue coat');
});

test('recovery still rejects missing fields, structured stat values and out-of-range numbers', () => {
    const { contract, raw } = dating();
    for (const bad of [null, true, [], { value: 10 }, 101, -1, Infinity]) {
        const changed = structuredClone(raw);
        changed.stats.Affection = bad;
        assert.throws(() => validateGeneratedNpc(changed, contract, [], () => 0));
    }
    const incomplete = structuredClone(raw);
    delete incomplete.profile.appearance;
    assert.throws(() => validateGeneratedNpc(JSON.stringify(incomplete).slice(0, -1), contract, [], () => 0), /Incomplete/);
    assert.throws(() => validateGeneratedNpc('A friendly person.', contract, [], () => 0), /Malformed/);
    assert.throws(() => validateGeneratedNpc('x'.repeat(60001), contract, [], () => 0), /too large/);
});

test('model definitions retain meanings and constraints without serializing editor metadata or empty inputs', () => {
    const { settings, contract } = dating();
    const choice = contract.choices[0];
    choice.fields.find(field => field.id === 'personality').hint = 'A configured personality meaning.';
    choice.stats.find(stat => stat.name === 'Affection').purpose = 'A configured relationship meaning.';
    const body = JSON.parse(npcGenerationPrompt({ ...request, requirements: '', nameStyle: '' }, contract, {}, () => 0));
    const template = body.templates[0];
    assert.ok(template.fields.includes('personality'));
    assert.ok(template.fields.includes('A configured personality meaning.'));
    for (const value of ['Affection', 'A configured relationship meaning.', 'Default: 0', 'Minimum: 0', 'Maximum: 100']) {
        assert.ok(template.stats.includes(value), value);
    }
    assert.ok(template.collections.includes('clothing'));
    assert.ok(template.collections.includes('name'));
    assert.equal(template.progression, undefined);
    assert.equal(body.request.requirements, undefined);
    assert.equal(body.request.nameStyle, undefined);
    assert.doesNotMatch(JSON.stringify(body), /isPrimary|isStatic|isMultiline|placeholder|includeInImagePrompt|carryOver|targets|locked|color|retired/);
    // Compact descriptions preserve collection bounds, defaults, boolean types and quantity roles.
    settings.statusTracker.collections = [{ id: 'gear', name: 'Gear', targets: ['npc'], trackQuantity: true,
        fields: [{ name: 'label', type: 'text', isPrimary: true },
            { name: 'quantity', type: 'number', defaultValue: '1', min: '1', maxStatValue: '9' },
            { name: 'worn', type: 'boolean', defaultValue: false, guidance: 'Currently worn.' }] }];
    const gear = JSON.parse(npcGenerationPrompt(request, npcGenerationContract(settings), {}, () => 0)).templates[0].collections;
    for (const value of ['quantity', 'number', 'minimum 1', 'maximum 9', 'worn', 'boolean', 'false', 'Currently worn.']) {
        assert.ok(gear.includes(value), value);
    }
});

test('initial pool capacity limits and progression field names survive concise formatting', () => {
    const settings = settingsFixture();
    const contract = npcGenerationContract(settings);
    const template = JSON.parse(npcGenerationPrompt(request, contract, {}, () => 0)).templates[0];
    assert.match(template.stats, /Health[^\n]*50/);
    for (const value of ['Level', 'XP', '0/100']) assert.ok(template.progression.includes(value), value);
    assert.equal(validateGeneratedNpc({ ...generated(), stats: { ...generated().stats, Strength: 6, Level: 2 } }, contract, [], () => 0).statusOverrides.Level, '2');
});

test('collection defaults are offered for initialization without entering ordinary reader definitions', () => {
    const collections = [{ id: 'items', name: 'Items', target: 'npc', hint: 'Held items.',
        fields: [{ name: 'name', type: 'text', isPrimary: true },
            { name: 'count', type: 'number', min: '0', defaultValue: '1' }] }];
    const reader = describeCollections({ collections });
    for (const value of ['items', 'Held items.', 'name', 'count', 'minimum 0']) {
        assert.ok(reader.includes(value), value);
    }
    assert.doesNotMatch(reader, /default/);
    assert.match(describeCollections({ collections }, { initialize: true }), /default "1"/);
});
