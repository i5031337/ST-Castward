import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNpcNamingBrief, NPC_NAME_CANDIDATE_COUNT } from '../src/npc/npc-naming.js';
import { npcGenerationContract, npcGenerationPrompt, validateGeneratedNpc } from '../src/npc/npc-generation.js';
import { request, settingsFixture, generated, fixture } from './helpers/npc-creation.mjs';

function rolls(...values) {
    return length => {
        const value = values.shift() ?? 0;
        assert.ok(value >= 0 && value < length);
        return value;
    };
}

test('initials are distinct and prefer unused cast initials with accent normalization', () => {
    const before = ['Álvaro', '  bess ', 'Cécile', '李明'];
    const brief = buildNpcNamingBrief(before, rolls(0));
    assert.ok(brief.candidateInitials.every(letter => !['A', 'B', 'C'].includes(letter)));
    assert.equal(new Set(brief.candidateInitials).size, NPC_NAME_CANDIDATE_COUNT);
    assert.deepEqual(before, ['Álvaro', '  bess ', 'Cécile', '李明']);
});

test('scarce or exhausted unused initials fall back without repeating a letter', () => {
    const used = [...'ABCDEFGHIJKLMNOPQRSTUVWX'].map(letter => `${letter}name`);
    const scarce = buildNpcNamingBrief(used, rolls(0)).candidateInitials;
    assert.ok(scarce.includes('Y') && scarce.includes('Z'));
    assert.equal(new Set(scarce).size, NPC_NAME_CANDIDATE_COUNT);
    used.push('Yname', 'Zname');
    const exhausted = buildNpcNamingBrief(used, rolls(0)).candidateInitials;
    assert.equal(new Set(exhausted).size, NPC_NAME_CANDIDATE_COUNT);
    assert.ok(exhausted.every(letter => /^[A-Z]$/.test(letter)));
});

test('the generated prompt supplies naming preferences and story context', () => {
    const contract = npcGenerationContract(settingsFixture());
    const body = JSON.parse(npcGenerationPrompt({ ...request, nameStyle: 'Traditional Chinese names' }, contract,
        { namingUsedNames: ['Zera'], story: 'A Chinese village.' }, length => length - 1));
    assert.equal(body.namingBrief.candidateInitials.length, NPC_NAME_CANDIDATE_COUNT);
    assert.ok(body.namingBrief.candidateInitials.every(letter => letter !== 'Z'));
    assert.equal(body.request.nameStyle, 'Traditional Chinese names');
    assert.equal(body.context.story, 'A Chinese village.');
    assert.equal(body.context.namingUsedNames, undefined);
});

test('fixed names bypass every naming and creative random draw', () => {
    const contract = npcGenerationContract(settingsFixture(), { name: 'Éowyn' });
    const body = JSON.parse(npcGenerationPrompt({ ...request, name: 'Éowyn' }, contract, {},
        () => assert.fail('An exact name must not use randomness')));
    assert.equal(body.namingBrief, undefined);
    assert.equal(contract.schema.properties.nameCandidates, undefined);
});

test('at most four candidates are accepted, and a single usable candidate needs no repair', async () => {
    const f = fixture();
    f.setGenerate(async () => ({ ...generated(), nameCandidates: ['Tovin Reed', 'tovin reed', 'Ｔｏｖｉｎ Reed', '李明'] }));
    const result = JSON.parse(await f.service.create(request));
    assert.equal(result.name, '李明'); // Brief length, stress and Latin initials are not validation rules.
    assert.equal(f.calls.length, 1);
    const contract = npcGenerationContract(settingsFixture());
    assert.equal(contract.schema.properties.nameCandidates.maxItems, 4);
    assert.equal(validateGeneratedNpc({ ...generated(), nameCandidates: ['One Name'] }, contract, [], () => 0).name, 'One Name');
    assert.throws(() => validateGeneratedNpc({ ...generated(), nameCandidates: ['A', 'B', 'C', 'D', 'E'] }, contract, [], () => 0), /too many/);
});

test('an exhausted candidate list gets one repair with the same naming brief', async () => {
    const f = fixture();
    f.setGenerate(async () => f.calls.length === 1
        ? { ...generated(), nameCandidates: Array(4).fill('Tovin Reed') } : generated());
    assert.equal(JSON.parse(await f.service.create(request)).name, 'Hessa Quill');
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls[1].userPrompt.startsWith(f.calls[0].userPrompt));
});

test('generator context includes creative inputs and relevant state while leaving bookkeeping to code', () => {
    const settings = settingsFixture();
    settings.statusTracker.collections = [{ id: 'clothes', name: 'Clothes', targets: ['npc'],
        fields: [{ name: 'piece', type: 'text', isPrimary: true }] }];
    const context = {
        story: 'A river crossing.', namingUsedNames: ['Zera'], unavailableNames: ['Zera'],
        recentCast: [{ name: 'Zera', profile: { motive: 'Collects tolls.' } }],
        establishedActor: { name: 'Éowyn', npcTemplateId: 'human', offstage: true,
            stats: { Health: '8/12', 'Unrelated stat': 'secret' },
            collections: { clothes: [], otherTemplateCollection: [{ name: 'Unrelated item' }] } },
    };
    const before = structuredClone(context);
    const named = JSON.parse(npcGenerationPrompt({ ...request, name: 'Éowyn' },
        npcGenerationContract(settings, { name: 'Éowyn' }), context));
    assert.equal(named.request.requestKey, undefined);
    assert.equal(named.request.nameStyle, undefined);
    assert.equal(named.request.requirements, request.requirements);
    assert.equal(named.context.recentCast, undefined);
    assert.equal(named.context.unavailableNames, undefined);
    assert.deepEqual(named.context.establishedActor, {
        name: 'Éowyn', stats: { Health: '8/12' }, collections: { clothes: [] },
    });
    const unnamed = JSON.parse(npcGenerationPrompt(request, npcGenerationContract(settings),
        { ...context, establishedActor: undefined }, () => 0));
    assert.equal(unnamed.context.recentCast, undefined);
    assert.doesNotMatch(JSON.stringify(unnamed), /Collects tolls/);
    assert.deepEqual(unnamed.context.unavailableNames, ['Zera']);
    assert.equal(unnamed.request.nameStyle, request.nameStyle);
    assert.equal(unnamed.request.requestKey, undefined);
    assert.deepEqual(context, before);
});
