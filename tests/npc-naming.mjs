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

test('length targets use the agreed 15/45/30/10 distribution', () => {
    const counts = {};
    for (let roll = 0; roll < 100; roll++) {
        const brief = buildNpcNamingBrief([], rolls(roll));
        counts[brief.syllables] = (counts[brief.syllables] || 0) + 1;
        assert.match(brief.length, /given or primary name/);
    }
    assert.deepEqual(counts, { 1: 15, 2: 45, 3: 30, 4: 10 });
});

test('rhythm targets use the agreed conditional emphasis distributions', () => {
    for (const [lengthRoll, expected] of [
        [15, { first: 50, last: 50 }],
        [60, { first: 40, middle: 40, last: 20 }],
        [90, { first: 25, penultimate: 50, last: 25 }],
    ]) {
        const counts = {};
        for (let rhythmRoll = 0; rhythmRoll < 100; rhythmRoll++) {
            const brief = buildNpcNamingBrief([], rolls(lengthRoll, rhythmRoll));
            const emphasis = brief.rhythm.match(/the (\w+) syllable/)[1];
            counts[emphasis] = (counts[emphasis] || 0) + 1;
        }
        assert.deepEqual(counts, expected);
    }
});

test('one-syllable names use one clear beat without a rhythm draw', () => {
    const draws = [];
    const brief = buildNpcNamingBrief([], length => { draws.push(length); return 0; });
    assert.equal(brief.rhythm, 'One clear beat.');
    assert.deepEqual(draws, [100, 26, 25, 24, 23]);
});

test('initials are distinct and prefer unused cast initials with accent normalization', () => {
    const before = ['Álvaro', '  bess ', 'Cécile', '李明'];
    const brief = buildNpcNamingBrief(before, rolls(0));
    assert.deepEqual(brief.candidateInitials, ['D', 'E', 'F', 'G']);
    assert.equal(new Set(brief.candidateInitials).size, NPC_NAME_CANDIDATE_COUNT);
    assert.deepEqual(before, ['Álvaro', '  bess ', 'Cécile', '李明']);
});

test('scarce or exhausted unused initials fall back without repeating a letter', () => {
    const used = [...'ABCDEFGHIJKLMNOPQRSTUVWX'].map(letter => `${letter}name`);
    assert.deepEqual(buildNpcNamingBrief(used, rolls(0)).candidateInitials, ['Y', 'Z', 'A', 'B']);
    used.push('Yname', 'Zname');
    assert.deepEqual(buildNpcNamingBrief(used, rolls(0)).candidateInitials, ['A', 'B', 'C', 'D']);
});

test('noninitial letters stay uniformly selectable without replacement', () => {
    assert.deepEqual(buildNpcNamingBrief([], length => length - 1).candidateInitials, ['Z', 'Y', 'X', 'W']);
});

test('the generated prompt supplies one brief and leaves cultural fit authoritative', () => {
    const contract = npcGenerationContract(settingsFixture());
    const body = JSON.parse(npcGenerationPrompt({ ...request, nameStyle: 'Traditional Chinese names' }, contract,
        { namingUsedNames: ['Zera'], story: 'A Chinese village.' }, length => length - 1));
    assert.equal(body.namingBrief.syllables, 4);
    assert.deepEqual(body.namingBrief.candidateInitials, ['Y', 'X', 'W', 'V']);
    assert.match(body.namingBrief.guidance, /take precedence/);
    assert.match(body.namingBrief.guidance, /Do not force Latin initials/);
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
    assert.match(f.calls[1].userPrompt, /No usable unused name candidates/);
});
