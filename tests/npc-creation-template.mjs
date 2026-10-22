import test from 'node:test';
import assert from 'node:assert/strict';
import { npcToolParameters } from '../src/npc/npc-generation.js';
import { fixture, request, generated, settingsFixture } from './helpers/npc-creation.mjs';

function setup() {
    const f = fixture();
    const system = f.settings.statusTracker.presets.River.definition;
    system.npcTemplates[0].description = 'People and other humanoid citizens.';
    system.npcTemplates.push({ id: 'beast', name: 'Beast', description: 'Animals and wild creatures.' });
    system.profiles.push({ id: 'instinct', label: 'Instinct', targets: ['template:beast'], guidance: 'An instinctive priority.' });
    const hunger = { id: 'hunger', name: 'Hunger', type: 'number', min: '0', maxStatValue: '10', targets: ['template:beast'] };
    f.settings.statusTracker.npcStats.push(hunger);
    f.settings.statusTracker.collections = [
        { id: 'clothes', name: 'Clothes', targets: ['template:human'], fields: [{ name: 'name', type: 'text', isPrimary: true }] },
        { id: 'moves', name: 'Moves', targets: ['template:beast'], fields: [{ name: 'name', type: 'text', isPrimary: true }] },
    ];
    f.setGenerate(async options => {
        const raw = generated();
        if (!options.schema.properties.nameCandidates) delete raw.nameCandidates;
        raw.npcTemplateId = options.schema.properties.npcTemplateId.enum[0];
        raw.collections = raw.npcTemplateId === 'human' ? { clothes: [] } : { moves: [{ name: 'Bite' }] };
        if (raw.npcTemplateId === 'beast') {
            raw.profile.instinct = 'Protect its den.';
            raw.stats.Hunger = '3';
        }
        return raw;
    });
    return f;
}

test('multiple templates are offered as required IDs with names and assignment guidance only', () => {
    const f = setup();
    const schema = npcToolParameters(f.settings);
    assert.ok(schema.required.includes('npcTemplateId'));
    assert.deepEqual(schema.properties.npcTemplateId.enum, ['human', 'beast']);
    assert.match(schema.properties.npcTemplateId.description, /human \(Human\): People and other humanoid citizens/);
    assert.match(schema.properties.npcTemplateId.description, /beast \(Beast\): Animals and wild creatures/);
    assert.doesNotMatch(schema.properties.npcTemplateId.description, /Hunger|Instinct|clothes|moves/);
});

test('a missing or unknown template is rejected before requesting generation', async () => {
    const f = setup();
    await assert.rejects(f.service.create(request), /npcTemplateId: required/);
    await assert.rejects(f.service.create({ ...request, npcTemplateId: 'unknown' }), /unsupported value/);
    await assert.rejects(f.service.create({ ...request, npcTemplateId: '' }), /unsupported value/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.cards.length, 0);
});

test('a selected template limits the generation prompt and response schema for unnamed NPCs', async () => {
    const f = setup();
    const result = JSON.parse(await f.service.create({ ...request, npcTemplateId: 'human' }));
    assert.equal(result.npcTemplateId, 'human');
    const body = JSON.parse(f.calls[0].userPrompt);
    assert.equal(body.request.npcTemplateId, 'human');
    assert.deepEqual(body.templates.map(template => template.id), ['human']);
    assert.deepEqual(f.calls[0].schema.properties.npcTemplateId.enum, ['human']);
    assert.doesNotMatch(f.calls[0].userPrompt, /beast|Hunger|Instinct|"instinct"|"moves"/);
    assert.match(f.calls[0].systemPrompt, /Use the selected NPC template/);
    assert.equal(f.cards[0].npcTemplateId, 'human');
});

test('a selected creature template includes its fields and holdings without humanoid collections', async () => {
    const f = setup();
    const result = JSON.parse(await f.service.create({ ...request, npcTemplateId: 'beast' }));
    assert.equal(result.npcTemplateId, 'beast');
    assert.equal(result.profile.instinct, 'Protect its den.');
    assert.equal(result.stats.Hunger, '3');
    assert.deepEqual(result.collections.moves, [{ name: 'Bite' }]);
    assert.doesNotMatch(f.calls[0].userPrompt, /"human"|humanoid citizens|"clothes"/);
});

test('generation cannot choose a different template from the narrator request', async () => {
    const f = setup();
    f.setGenerate(async () => ({ ...generated(), npcTemplateId: 'beast', collections: { clothes: [] } }));
    await assert.rejects(f.service.create({ ...request, npcTemplateId: 'human' }), /unsupported value/);
    assert.equal(f.calls.length, 2);
    assert.equal(f.cards.length, 0);
});

test('single-template and template-free Systems remain automatic without a required argument', async () => {
    const f = fixture();
    assert.ok(!npcToolParameters(f.settings).required.includes('npcTemplateId'));
    const result = JSON.parse(await f.service.create(request));
    assert.equal(result.npcTemplateId, 'human');
    assert.equal(JSON.parse(f.calls[0].userPrompt).request.npcTemplateId, 'human');
    const empty = { statusTracker: { npcStats: [] } };
    assert.deepEqual(npcToolParameters(empty).properties.npcTemplateId.enum, ['']);
    assert.ok(!npcToolParameters(empty).required.includes('npcTemplateId'));
});

test('tool schemas reflect System changes without mutating earlier schemas', () => {
    const settings = settingsFixture();
    const first = npcToolParameters(settings);
    settings.statusTracker.presets.Other = { definition: { npcTemplates: [{ id: 'creature', name: 'Creature', description: 'New type.' }] } };
    settings.activeSystem = 'Other';
    const second = npcToolParameters(settings);
    assert.deepEqual(first.properties.npcTemplateId.enum, ['human']);
    assert.deepEqual(second.properties.npcTemplateId.enum, ['creature']);
    settings.statusTracker.presets.Other.definition.npcTemplates.push({ id: 'trainer', name: 'Trainer' });
    assert.ok(npcToolParameters(settings).required.includes('npcTemplateId'));
    assert.ok(!second.required.includes('npcTemplateId'));
});

test('known cards and tracker assignments cannot be retyped by creation', async () => {
    for (const existing of ['card', 'tracker']) {
        const f = setup();
        if (existing === 'card') f.cards.push({ id: 'known', name: 'Gandalf', npcTemplateId: 'human' });
        else f.context.chatMetadata.sillynpc_status_state = { characters: [{ name: 'Gandalf', npcTemplateId: 'human' }] };
        await assert.rejects(f.service.create({ ...request, name: 'Gandalf', npcTemplateId: 'beast' }), /cannot change their assignment/);
        assert.equal(f.calls.length, 0);
        if (existing === 'card') {
            const result = JSON.parse(await f.service.create({ ...request, name: 'Gandalf', npcTemplateId: 'human' }));
            assert.equal(result.reused, true);
            assert.equal(result.id, 'known');
        }
    }
});

test('concurrent requests for the same identity cannot change its pending template', async () => {
    const f = setup(); let finish;
    f.setGenerate(() => new Promise(resolve => { finish = resolve; }));
    const first = f.service.create({ ...request, name: 'Gandalf', npcTemplateId: 'human' });
    await assert.rejects(f.service.create({ ...request, name: 'Gandalf', npcTemplateId: 'beast' }), /cannot change their assignment/);
    await assert.rejects(f.service.create({ ...request, requestKey: 'another-key', name: 'Gandalf', npcTemplateId: 'beast' }), /cannot change their assignment/);
    const raw = generated(); delete raw.nameCandidates; raw.collections = { clothes: [] };
    finish(raw);
    assert.equal(JSON.parse(await first).npcTemplateId, 'human');
    assert.equal(f.calls.length, 1);
    assert.equal(f.cards.length, 1);
});
