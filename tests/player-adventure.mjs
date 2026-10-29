import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerAdventureService, playerAdventureContract, validatePlayerAdventure } from '../src/characters/player-adventure.js';

function fixture() {
    const settings = { activeSystem: 'fantasy', loreProfileId: 'writer', statusTracker: {
        playerStats: [
            { id: 'health', name: 'Health', type: 'number', defaultValue: '10/10', maxStatValue: '30', purpose: 'Vitality' },
            { id: 'strength', name: 'Strength', type: 'number', defaultValue: '3', min: '1', maxStatValue: '10', locked: true },
            { id: 'level', name: 'Level', type: 'number', defaultValue: '1' },
            { id: 'xp', name: 'XP', type: 'number', defaultValue: '0/100', maxStatValue: '100' },
            { id: 'mood', name: 'Mood', type: 'text', defaultValue: 'Calm', options: ['Calm', 'Eager'] },
        ], progression: { player: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } },
        collections: [
            { id: 'gear', name: 'Equipment', targets: ['player'], guidance: 'A modest traveling kit.', fields: [
                { name: 'name', type: 'text', isPrimary: true }, { name: 'quantity', type: 'number', defaultValue: 1 },
                { name: 'description', type: 'text' },
            ], trackQuantity: true },
            { id: 'powers', name: 'Abilities', targets: ['player'], fields: [{ name: 'name', type: 'text', isPrimary: true }] },
            { id: 'secrets', targets: ['npc'], fields: [{ name: 'name', isPrimary: true }] },
        ], presets: { fantasy: { definition: { name: 'Fantasy Adventure', metadata: { description: 'A windswept frontier.' } } } },
    } };
    const persona = { avatar: 'hero.png', name: 'Hero', description: 'A novice elven healer.' };
    const card = { isPlayer: true, name: 'Hero', personaKey: 'hero.png', profile: { appearance: 'Silver hair', history: 'Village healer.' } };
    const context = { chatMetadata: {}, getCurrentChatId: () => 'new-chat', chat: [{ mes: 'Welcome to the frontier.' }] };
    let state = { global: { Weather: 'Rain' }, characters: [{ name: 'Mira', stats: { Trust: '3' } }],
        player: { name: 'Hero', personaKey: persona.avatar, stats: Object.fromEntries(settings.statusTracker.playerStats
            .map(stat => [stat.name, stat.defaultValue])), collections: { gear: [], powers: [] }, memories: [] } };
    const draft = { stats: { Health: '18/18', Strength: '4', Level: '1', XP: '0/100', Mood: 'Eager' },
        collections: { gear: [{ name: 'Travel cloak', quantity: 1, description: 'A patched wool cloak.' }], powers: [{ name: 'Minor healing' }] } };
    const calls = [], saves = [];
    let request = async () => structuredClone(draft), review = async () => true, storageAccepts = true;
    const service = createPlayerAdventureService({
        getContext: () => context, getSettings: () => settings, getPersona: () => persona, loadState: () => state,
        request: async args => { calls.push(args); return request(args); },
        review: (...args) => review(...args),
        saveState: (next, options) => { if (!storageAccepts) return false; options.beforeCommit?.(); saves.push(options); state = next; return true; },
    });
    return { settings, persona, context, card, draft, service, calls, saves, state: () => state,
        rejectStorage: () => { storageAccepts = false; }, setRequest: fn => { request = fn; }, setReview: fn => { review = fn; } };
}

test('player Fill creates a reviewed chat-owned starting sheet with locked stats and collections', async () => {
    const f = fixture();
    const before = structuredClone(f.state());
    assert.equal(f.service.audit(f.card).done, false);
    f.setReview(async draft => {
        assert.deepEqual(f.state(), before);
        assert.equal(draft.stats.Health, '18/18');
        draft.stats.Health = '999'; // Review receives a copy, not the validated commit object.
        return true;
    });
    assert.deepEqual(await f.service.initialize(f.card), { ok: true });
    assert.equal(f.state().player.stats.Health, '18/18');
    assert.equal(f.state().player.stats.Strength, '4');
    assert.equal(f.state().player.collections.powers[0].name, 'Minor healing');
    assert.deepEqual(f.state().global, before.global);
    assert.deepEqual(f.state().characters, before.characters);
    assert.deepEqual(f.card.profile, { appearance: 'Silver hair', history: 'Village healer.' });
    assert.equal(f.state().player.adventureInitialized, true);
    assert.equal(f.saves.length, 1);
    const prompt = JSON.parse(f.calls[0].userPrompt);
    assert.equal(prompt.persona, f.persona.description);
    assert.equal(prompt.profile.history, 'Village healer.');
    assert.match(prompt.system, /Fantasy Adventure/);
    assert.match(prompt.definitions.collections, /modest traveling kit/);
    assert.doesNotMatch(f.calls[0].userPrompt, /"secrets"/);
    assert.equal(f.service.audit(f.card).done, true);
    await assert.rejects(f.service.initialize(f.card), /already been created/);
    assert.equal(f.calls.length, 1);
});

test('declining a starting sheet makes no writes and leaves creation available', async () => {
    const f = fixture(), before = structuredClone(f.state());
    f.setReview(async () => false);
    assert.deepEqual(await f.service.initialize(f.card), { ok: true, skipped: true });
    assert.deepEqual(f.state(), before);
    assert.equal(f.saves.length, 0);
    assert.equal(f.service.audit(f.card).done, false);
});

for (const change of [
    f => { f.context.chat.push({ is_user: true, mes: 'I leave town.' }); },
    f => { f.state().player.stats.Health = '8/10'; },
    f => { f.state().player.collections.gear.push({ name: 'Existing staff' }); },
    f => { f.state().player.adventureInitialized = true; },
    f => { f.context.getCurrentChatId = () => undefined; },
    f => { f.card.personaKey = 'another.png'; },
]) {
    test('existing progress and invalid player ownership prevent starting-sheet generation', async () => {
        const f = fixture(); change(f);
        assert.equal(f.service.audit(f.card).done, true);
        await assert.rejects(f.service.initialize(f.card));
        assert.equal(f.calls.length, 0);
        assert.equal(f.saves.length, 0);
    });
}

for (const change of [
    f => { f.context.chatMetadata = {}; },
    f => { f.context.getCurrentChatId = () => 'another-chat'; },
    f => { f.persona.avatar = 'another.png'; },
    f => { f.persona.description = 'A different concept'; },
    f => { f.settings.activeSystem = 'another-system'; },
    f => { f.settings.statusTracker.playerStats[0].maxStatValue = '50'; },
    f => { f.state().player.stats.Health = '8/10'; },
    f => { f.context.chat[0].mes = 'Changed opening'; },
    f => { f.card.profile.appearance = 'Manually edited'; },
    f => { f.settings.master_items = { gear: { staff: { name: 'Staff' } } }; },
]) {
    test('stale starting-sheet results cannot write after generation or review', async () => {
        for (const duringReview of [false, true]) {
            const f = fixture();
            if (duringReview) f.setReview(async () => { change(f); return true; });
            else f.setRequest(async () => { change(f); return f.draft; });
            await assert.rejects(f.service.initialize(f.card), { name: 'AbortError' });
            assert.equal(f.saves.length, 0);
        }
    });
}

test('stopping and duplicate clicks do not apply or duplicate a pending starting sheet', async () => {
    const f = fixture(), controller = new AbortController();
    let finish;
    f.setRequest(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.service.initialize(f.card, controller.signal);
    await assert.rejects(f.service.initialize(f.card), /already running/);
    controller.abort(); finish(f.draft);
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(f.saves.length, 0);
    f.setRequest(async () => f.draft);
    assert.equal((await f.service.initialize(f.card)).ok, true);
});

test('starting-sheet validation enforces stats, progression, collection types, and scope', () => {
    const f = fixture(), contract = playerAdventureContract(f.settings);
    for (const [stat, reading] of [['Health', '31/31'], ['Health', '20/18'], ['Strength', '11'],
        ['Level', '0'], ['XP', '1/100'], ['XP', '0/200'], ['Mood', 'Angry'], ['Mood', ' ']]) {
        const draft = structuredClone(f.draft); draft.stats[stat] = reading;
        assert.throws(() => validatePlayerAdventure(draft, contract), undefined, `${stat}: ${reading}`);
    }
    for (const change of [
        draft => { draft.stats.Unknown = '5'; },
        draft => { delete draft.stats.Health; },
        draft => { delete draft.collections.powers; },
        draft => { draft.collections.secrets = []; },
        draft => { draft.collections.gear[0].quantity = 'many'; },
        draft => { draft.collections.gear[0].quantity = -1; },
        draft => { draft.collections.gear.push({ ...draft.collections.gear[0] }); },
    ]) {
        const draft = structuredClone(f.draft); change(draft);
        assert.throws(() => validatePlayerAdventure(draft, contract));
    }
});


test('starting equipment resolves shared definitions before review and registers new ones only on acceptance', async () => {
    for (const decision of ['accept', 'discard', 'reject storage']) {
        const f = fixture();
        f.settings.master_items = { gear: { 'travel cloak': { name: 'Travel cloak', description: 'Established green silk.' } } };
        const before = structuredClone(f.settings.master_items);
        f.setReview(async draft => {
            assert.equal(draft.collections.gear[0].description, 'Established green silk.');
            assert.equal(draft.collections.gear[0].quantity, 1);
            assert.deepEqual(f.settings.master_items, before);
            return decision !== 'discard';
        });
        if (decision === 'reject storage') {
            f.rejectStorage();
            await assert.rejects(f.service.initialize(f.card), /could not be saved/);
        } else await f.service.initialize(f.card);
        if (decision === 'accept') {
            assert.equal(f.state().player.collections.gear[0].description, 'Established green silk.');
            assert.equal(f.settings.master_items.powers['minor healing'].name, 'Minor healing');
            assert.equal(f.settings.master_items.gear['travel cloak'].quantity, undefined);
        } else assert.deepEqual(f.settings.master_items, before);
    }
});

test('invalid resolved Item Library values stop player creation before review or any write', async () => {
    for (const invalid of ['option', 'type', 'bound', 'duplicate']) {
        const f = fixture();
        const fields = f.settings.statusTracker.collections[0].fields;
        let key = 'travel cloak', entry = { name: 'Travel cloak' };
        if (invalid === 'option') {
            fields.push({ name: 'rarity', type: 'text', options: ['Common'] });
            f.draft.collections.gear[0].rarity = 'Common';
            entry.rarity = 'Retired';
        } else if (invalid === 'type') {
            fields.push({ name: 'waterproof', type: 'boolean' });
            f.draft.collections.gear[0].waterproof = false;
            entry.waterproof = 'yes';
        } else if (invalid === 'bound') {
            Object.assign(fields[0], { type: 'number', min: '1', maxStatValue: '3' });
            f.draft.collections.gear[0].name = 1;
            key = '1'; entry.name = 100;
        } else {
            f.draft.collections.gear.push({ name: 'Staff', quantity: 1 });
            entry.name = 'Staff';
        }
        f.settings.master_items = { gear: { [key]: entry } };
        const before = structuredClone({ state: f.state(), library: f.settings.master_items });
        let reviews = 0;
        f.setReview(async () => { reviews++; return true; });
        await assert.rejects(f.service.initialize(f.card), /Cannot use Item Library values/);
        assert.equal(reviews, 0, invalid);
        assert.equal(f.saves.length, 0, invalid);
        assert.deepEqual({ state: f.state(), library: f.settings.master_items }, before, invalid);
    }
});
