import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_TOOL_PARAMETERS, npcGenerationContract, validateGeneratedNpc, findNamedNpc } from '../src/npc/npc-generation.js';
import { request, generated, fixture } from './helpers/npc-creation.mjs';

test('optional exact name skips candidate generation and preserves spelling and punctuation', async () => {
    assert.ok(!NPC_TOOL_PARAMETERS.required.includes('name'));
    const f = fixture();
    const result = JSON.parse(await f.service.create({ ...request, name: '  Éowyn of Rohan  ' }));
    assert.equal(result.name, 'Éowyn of Rohan');
    assert.equal(f.cards[0].name, result.name);
    assert.equal(f.calls[0].schema.properties.nameCandidates, undefined);
    const prompt = JSON.parse(f.calls[0].userPrompt);
    assert.equal(prompt.request.name, result.name);
    assert.equal(prompt.creativeNudge, undefined);
});

test('blank optional name preserves the random naming workflow', async () => {
    const f = fixture();
    assert.equal(JSON.parse(await f.service.create({ ...request, name: '   ' })).name, 'Hessa Quill');
    assert.ok(f.calls[0].schema.properties.nameCandidates);
});

test('supplied name is owned by code and does not require unused random candidates', () => {
    const f = fixture();
    const contract = npcGenerationContract(f.settings, { name: 'Tovin Reed' });
    const raw = generated(); delete raw.nameCandidates;
    const card = validateGeneratedNpc(raw, contract, ['Tovin Reed'], () => assert.fail('No random name selection'));
    assert.equal(card.name, 'Tovin Reed');
    raw.name = 'Replacement';
    assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), /unsupported field/);
});

test('existing named and aliased cards are returned unchanged without model calls', async () => {
    const f = fixture();
    const original = { id: 'known', name: 'Gandalf', aliases: [{ pattern: 'Mithrandir', isRegex: false }],
        profile: { motive: 'An established motive.' }, statusOverrides: { Level: '20' }, statusCollections: {} };
    f.cards.push(structuredClone(original));
    f.world.push({ ...original, id: 'world', profile: { motive: 'Do not select this shadowed card.' } });
    for (const name of ['Gandalf', 'gAnDaLf', 'Mithrandir']) {
        const result = JSON.parse(await f.service.create({ ...request, name }));
        assert.equal(result.id, 'known');
        assert.equal(result.name, 'Gandalf');
        assert.equal(result.reused, true);
    }
    assert.deepEqual(f.cards[0], original);
    assert.equal(f.calls.length, 0);
    const reusable = JSON.parse(await f.service.create({ ...request, name: 'Gandalf' }));
    assert.equal(reusable.id, 'known');
});

test('an existing reusable world card is returned without creating a chat copy', async () => {
    const f = fixture(); f.world.push({ id: 'world', name: 'Gandalf', profile: {} });
    assert.equal(JSON.parse(await f.service.create({ ...request, name: 'Gandalf' })).id, 'world');
    assert.equal(f.cards.length, 0);
    assert.equal(f.calls.length, 0);
});

test('canonical names win over aliases and regex aliases only match whole names', () => {
    const cards = [
        { name: 'Another', aliases: [{ pattern: 'Gandalf', isRegex: false }] },
        { name: 'Gandalf' },
        { name: 'Mira', aliases: [{ pattern: '[', isRegex: true }, { pattern: 'Captain Mira', isRegex: true }] },
    ];
    assert.equal(findNamedNpc(cards, 'Gandalf'), cards[1]);
    assert.equal(findNamedNpc(cards, 'Captain Mira'), cards[2]);
    assert.equal(findNamedNpc(cards, 'Captain Mira the Second'), null);
});

test('name collisions with reserved identities and malformed names make no model requests', async () => {
    const f = fixture();
    for (const name of ['Player', 'narrator', '<script>', 'Name\nOther', null, 12, 'x'.repeat(81)]) {
        await assert.rejects(f.service.create({ ...request, name }));
    }
    assert.equal(f.calls.length, 0);
    assert.equal(f.cards.length, 0);
});

test('a request key cannot silently rename or return a different person', async () => {
    const f = fixture();
    const result = JSON.parse(await f.service.create(request));
    await assert.rejects(f.service.create({ ...request, name: 'Gandalf' }), /already belongs/);
    assert.equal(JSON.parse(await f.service.create({ ...request, name: result.name })).id, result.id);
    assert.equal(f.cards.length, 1);
    assert.equal(f.calls.length, 1);
});

test('concurrent fixed-name requests share one generation across different request keys', async () => {
    const f = fixture(); let finish;
    f.setGenerate(() => new Promise(resolve => { finish = resolve; }));
    const first = f.service.create({ ...request, name: 'Gandalf' });
    const second = f.service.create({ ...request, requestKey: 'another-key', name: 'gandalf' });
    await assert.rejects(f.service.create({ ...request, name: 'Legolas' }), /different NPC/);
    assert.equal(f.calls.length, 1);
    const raw = generated(); delete raw.nameCandidates; finish(raw);
    assert.equal(await first, await second);
    assert.equal(f.cards.length, 1);
    assert.equal(JSON.parse(await f.service.create({ ...request, requestKey: 'another-key', name: 'Gandalf' })).reused, true);
});

test('a matching card created during generation is reused without overwriting manual data', async () => {
    const f = fixture(); let finish;
    f.setGenerate(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.service.create({ ...request, name: 'Gandalf' });
    const manual = { id: 'manual', name: 'Gandalf', profile: { motive: 'Keep this edit.' } };
    f.cards.push(manual);
    const raw = generated(); delete raw.nameCandidates; finish(raw);
    const result = JSON.parse(await pending);
    assert.equal(result.id, 'manual');
    assert.equal(result.reused, true);
    assert.equal(result.profile.motive, 'Keep this edit.');
    assert.equal(f.cards.length, 1);
});

test('previously tracked named NPCs preserve assigned template, current stats and independent belongings', async () => {
    const f = fixture();
    f.settings.statusTracker.presets.River.definition.npcTemplates.push({ id: 'beast', name: 'Beast' });
    const actor = { name: 'Gandalf', npcTemplateId: 'human', stats: { Health: '2/30', Level: '7', XP: '75/100' },
        collections: { items: [{ name: 'Staff', quantity: 1 }] } };
    f.context.chatMetadata.sillynpc_status_state = { characters: [actor] };
    const before = structuredClone(actor);
    const result = JSON.parse(await f.service.create({ ...request, name: 'Gandalf', npcTemplateId: 'human' }));
    assert.deepEqual(f.calls[0].schema.properties.npcTemplateId.enum, ['human']);
    assert.equal(result.stats.Health, '2/30');
    assert.equal(result.stats.Level, '7');
    assert.equal(result.stats.XP, '75/100');
    assert.equal(result.stats.Strength, '6');
    assert.deepEqual(result.collections, actor.collections);
    assert.deepEqual(actor, before);
    f.cards[0].statusCollections.items[0].quantity = 2;
    assert.equal(actor.collections.items[0].quantity, 1);
});
