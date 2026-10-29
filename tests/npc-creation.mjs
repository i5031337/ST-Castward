import test from 'node:test';
import assert from 'node:assert/strict';
import { npcGenerationContract, validateGeneratedNpc, randomIndex } from '../src/npc/npc-generation.js';
import { request, settingsFixture, generated, fixture } from './helpers/npc-creation.mjs';
import { setProfileSettingsProvider } from '../src/core/profile-fields.js';

test('creation returns only a receipt while saving the complete profile and sheet', async () => {
    const f = fixture();
    const result = JSON.parse(await f.service.create(request));
    assert.deepEqual(Object.keys(result).sort(), ['id', 'name', 'ok', 'reused']);
    assert.equal(result.name, 'Hessa Quill');
    assert.equal(result.name, f.cards[0].name);
    assert.equal(f.cards[0].statusOverrides.Level, '2');
    assert.equal(f.cards[0].statusOverrides.XP, '0/100');
    assert.deepEqual(f.cards[0].statusCollections, {});
    assert.equal(f.cards[0].npcCreation.requestKey, request.requestKey);
    assert.equal(f.calls.length, 1);
    assert.doesNotMatch(f.calls[0].userPrompt, /player-only/);
});

test('contract excludes player fields and validates the selected template', () => {
    const contract = npcGenerationContract(settingsFixture());
    assert.equal(contract.schema.properties.profile.properties['player-only'], undefined);
    const raw = generated(); raw.profile['player-only'] = 'Invented';
    assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), /unsupported field/);
    raw.profile = { appearance: 'A person.' };
    assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), /Incomplete/);
    raw.npcTemplateId = 'unknown';
    assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), /unsupported value/);
});

test('the candidate choice varies independently of the model ordering', () => {
    const contract = npcGenerationContract(settingsFixture());
    assert.equal(validateGeneratedNpc(generated(), contract, [], () => 0).name, 'Tovin Reed');
    assert.equal(validateGeneratedNpc(generated(), contract, [], () => 3).name, 'Hessa Quill');
    assert.throws(() => randomIndex(0));
});

test('duplicate, normalized, conflicting and unusable names cannot crowd out fresh candidates', () => {
    const contract = npcGenerationContract(settingsFixture());
    const raw = generated(); raw.nameCandidates = [' Tovin Reed ', 'tovin reed', 'Ｔｏｖｉｎ Reed', 'Nessa Marr'];
    assert.equal(validateGeneratedNpc(raw, contract, ['Tovin Reed', 'Narrator'], () => 0).name, 'Nessa Marr');
    assert.throws(() => validateGeneratedNpc(raw, contract, ['Tovin Reed', 'Narrator', 'Nessa Marr'], () => 0), /No usable/);
});

test('initial pools, ratings, level, XP and options are enforced before persistence', () => {
    const contract = npcGenerationContract(settingsFixture());
    for (const [stat, reading] of [['Health', '13/12'], ['Health', '51/51'], ['Health', '0/0'], ['Health', '12'],
        ['Strength', '11'], ['Strength', '5/10'], ['Level', '1.5'], ['XP', '20/100'], ['XP', '0/200'], ['Mood', 'Furious']]) {
        const raw = generated(); raw.stats[stat] = reading;
        assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), undefined, `${stat}: ${reading}`);
    }
    const raw = generated(); raw.stats.Health = 12;
    assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), /Invalid pool/);
});

test('pool defaults do not cap individual NPC capacity without an explicit growth ceiling', () => {
    const settings = settingsFixture();
    settings.statusTracker.npcStats[0].maxStatValue = '';
    const contract = npcGenerationContract(settings);
    const raw = generated(); raw.stats.Health = '80/80';
    assert.equal(validateGeneratedNpc(raw, contract, [], () => 0).statusOverrides.Health, '80/80');
});

test('template choice limits both generated profile fields and stats', () => {
    const settings = settingsFixture();
    const definition = settings.statusTracker.presets.River.definition;
    definition.npcTemplates.push({ id: 'beast', name: 'Beast' });
    definition.profiles.push({ id: 'instinct', label: 'Instinct', targets: ['template:beast'] });
    const contract = npcGenerationContract(settings);
    const raw = generated();
    raw.profile.instinct = 'Protect the nest.';
    assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), /off-template/);
    raw.npcTemplateId = 'beast';
    assert.equal(validateGeneratedNpc(raw, contract, [], () => 0).profile.instinct, 'Protect the nest.');
    delete raw.profile.instinct;
    assert.throws(() => validateGeneratedNpc(raw, contract, [], () => 0), /Incomplete/);
});

test('explicit settings without a System never inherit the live settings provider', () => {
    setProfileSettingsProvider(settingsFixture);
    try {
        const contract = npcGenerationContract({ statusTracker: { npcStats: [] } });
        assert.equal(contract.choices[0].id, '');
        assert.ok(contract.choices[0].fields.some(field => field.id === 'speech'));
        assert.equal(contract.choices[0].stats.length, 0);
    } finally { setProfileSettingsProvider(() => null); }
});

test('repeated and concurrent requests reuse the same saved card', async () => {
    const f = fixture();
    let finish;
    f.setGenerate(() => new Promise(resolve => { finish = resolve; }));
    const first = f.service.create(request), second = f.service.create(request);
    assert.equal(f.calls.length, 1);
    finish(generated());
    assert.deepEqual(await first, await second);
    assert.equal(JSON.parse(await f.service.create(request)).reused, true);
    assert.equal(f.cards.length, 1);
    assert.equal(f.calls.length, 1);
});

test('one bounded repair handles malformed output without saving partial cards', async () => {
    const f = fixture();
    f.setGenerate(async () => f.calls.length === 1 ? '{truncated' : generated());
    assert.equal(JSON.parse(await f.service.create(request)).ok, true);
    assert.equal(f.calls.length, 2);
    assert.equal(f.cards.length, 1);
});

test('persistent validation failures and connection errors leave no cards and allow explicit retry', async () => {
    const f = fixture();
    f.setGenerate(async () => ({}));
    await assert.rejects(f.service.create(request));
    assert.equal(f.calls.length, 2);
    assert.equal(f.cards.length, 0);
    f.setGenerate(async () => { throw new Error('Offline'); });
    await assert.rejects(f.service.create(request), /Offline/);
    assert.equal(f.calls.length, 3);
    f.setGenerate(async () => generated());
    await f.service.create(request);
    assert.equal(f.cards.length, 1);
});

test('chat switches, cancellation, reply edits, System edits and disabling cannot commit stale results', async () => {
    for (const change of [f => f.switchChat(), f => f.service.invalidate(), f => { f.context.chat[0].mes = 'Changed'; },
        f => { f.context.chat.push({ is_user: true, mes: 'A new turn.' }); },
        f => { f.settings.activeSystem = 'Other'; }, f => { f.settings.loreProfileId = 'Other'; },
        f => { f.settings.statusTracker.npcStats[0].maxStatValue = '20'; },
        f => { f.settings.npcCreationToolEnabled = false; }, f => { f.settings.enabled = false; }]) {
        const f = fixture(); let finish;
        f.setGenerate(() => new Promise(resolve => { finish = resolve; }));
        const pending = f.service.create(request);
        change(f); finish(generated());
        await assert.rejects(pending, /cancelled/);
        assert.equal(f.cards.length, 0);
    }
});

test('newly claimed names are excluded at commit time', async () => {
    const f = fixture(); let finish;
    f.setGenerate(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.service.create(request);
    f.cards.push({ name: 'Hessa Quill' }); finish(generated());
    assert.equal(JSON.parse(await pending).name, 'Daro Rusk');
});

test('lore failure cannot report success and retry prepares the saved card without regenerating', async () => {
    const f = fixture();
    f.setAfterCommit(async () => { throw new Error('Lorebook offline'); });
    await assert.rejects(f.service.create(request), /Lorebook offline/);
    assert.equal(f.cards.length, 1);
    await assert.rejects(f.service.create(request), /Lorebook offline/);
    f.setAfterCommit(async () => {});
    const result = JSON.parse(await f.service.create(request));
    assert.equal(result.ok, true);
    assert.equal(result.reused, true);
    assert.equal(f.calls.length, 1);
});

test('disabled creation and malformed tool arguments make no requests', async () => {
    const f = fixture(); f.settings.npcCreationToolEnabled = false;
    await assert.rejects(f.service.create(request), /disabled/);
    f.settings.npcCreationToolEnabled = true;
    await assert.rejects(f.service.create({ ...request, requestKey: '' }));
    await assert.rejects(f.service.create({ ...request, unknown: 'field' }));
    assert.equal(f.calls.length, 0);
});

test('a System without templates uses default NPC fields and no invented template', () => {
    const settings = { statusTracker: { npcStats: [] } };
    const contract = npcGenerationContract(settings);
    assert.deepEqual(contract.schema.properties.npcTemplateId.enum, ['']);
    assert.ok(contract.choices[0].fields.some(field => field.id === 'speech'));
    const raw = { nameCandidates: generated().nameCandidates, npcTemplateId: '',
        profile: Object.fromEntries(contract.choices[0].fields.map(field => [field.id, 'A useful detail.'])), stats: {}, collections: {} };
    assert.equal(validateGeneratedNpc(raw, contract, [], () => 1).name, 'Beska Venn');
});

test('missing lorebook stops creation before any model request or card commit', async () => {
    const f = fixture({ beforeCreate: async () => { throw new Error('Select or create a lorebook'); } });
    await assert.rejects(f.service.create(request), /lorebook/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.cards.length, 0);
});

test('chat switches while selecting a lorebook cannot start NPC generation', async () => {
    let release;
    const f = fixture({ beforeCreate: () => new Promise(resolve => { release = resolve; }) });
    const creating = f.service.create(request);
    f.switchChat(); release();
    await assert.rejects(creating, /cancelled/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.cards.length, 0);
});

test('cancelling an existing-card lore preparation cannot return a stale success receipt', async () => {
    const f = fixture();
    f.cards.push({ id: 'existing', name: 'Mira' });
    let release;
    f.setAfterCommit(() => new Promise(resolve => { release = resolve; }));
    const delivery = f.service.create({ ...request, name: 'Mira' });
    f.service.invalidate(); release();
    await assert.rejects(delivery, /cancelled/);
    assert.equal(f.calls.length, 0);
});
