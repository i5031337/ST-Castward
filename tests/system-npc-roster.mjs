import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { captureNpcRoster, seedNpcRoster, setNpcRosterEnabled, normalizeNpcRosters,
    rosterCharacters } from '../src/characters/system-npc-roster.js';

function fixture() {
    const settings = { activeSystem: 'A', statusTracker: { presets: { A: {}, B: {} }, npcStats: [
        { name: 'Level', defaultValue: '1', carryOver: true },
        { name: 'HP', defaultValue: '10/10', carryOver: false },
    ] } };
    const context = { getCurrentChatId: () => 'one', chat: [], chatMetadata: {
        sillynpc_system: 'A', sillynpc_npcs: [{ id: 'mira', name: 'Mira', category: 'Crew',
            profile: { appearance: 'Red hair' }, imageUrl: '/portrait.png',
            statusOverrides: { Level: '4', HP: '2/10' }, statusCollections: { bag: ['ring'] },
            memories: [{ text: 'Secret' }], lorebook: { world: 'lore', uid: 3 },
        }],
    } };
    let id = 0;
    return { settings, context, makeId: () => `copy-${++id}` };
}

test('chat ownership remains default; enabling publishes only portable values', () => {
    const { settings, context, makeId } = fixture();
    assert.equal(seedNpcRoster(settings, context, makeId), false);
    assert.equal(captureNpcRoster(settings, context), false);
    setNpcRosterEnabled(settings, context, 'A', true);
    const [source] = rosterCharacters(settings);
    assert.deepEqual(source.statusOverrides, { Level: '4' });
    assert.equal(source.statusCollections, undefined);
    assert.equal(source.memories, undefined);
    assert.equal(source.imageUrl, '/portrait.png');
    assert.equal(source.category, 'Crew');
});

test('new chats get independent copies once; defaults reset and deletions stay local', () => {
    const { settings, context, makeId } = fixture();
    setNpcRosterEnabled(settings, context, 'A', true);
    const metadata = () => ({ sillynpc_system: 'A' });
    context.chatMetadata = metadata();
    assert.equal(seedNpcRoster(settings, context, makeId), true);
    const first = context.chatMetadata.sillynpc_npcs[0];
    assert.deepEqual(first.statusOverrides, { Level: '4', HP: '10/10' });
    assert.deepEqual(first.statusCollections, {});
    assert.equal(first.memories, undefined);
    first.profile.appearance = 'Blue hair';
    assert.equal(rosterCharacters(settings)[0].profile.appearance, 'Red hair');
    context.chatMetadata = metadata();
    seedNpcRoster(settings, context, makeId);
    const second = context.chatMetadata.sillynpc_npcs[0];
    assert.notEqual(second.id, first.id);
    assert.equal(second.profile.appearance, 'Red hair');
    context.chatMetadata.sillynpc_npcs.length = 0;
    assert.equal(seedNpcRoster(settings, context, makeId), false);
    assert.equal(captureNpcRoster(settings, context), false);
    assert.equal(rosterCharacters(settings).length, 1);
});

test('older unchanged copies do not undo roster edits; changed copies publish for future chats', () => {
    const { settings, context, makeId } = fixture();
    setNpcRosterEnabled(settings, context, 'A', true);
    const old = context.chatMetadata;
    context.chatMetadata = { sillynpc_system: 'A' };
    seedNpcRoster(settings, context, makeId);
    const card = context.chatMetadata.sillynpc_npcs[0];
    card.name = 'Captain Mira';
    card.statusOverrides.Level = '5';
    assert.equal(captureNpcRoster(settings, context), true);
    context.chatMetadata = old;
    assert.equal(captureNpcRoster(settings, context), false);
    assert.equal(rosterCharacters(settings)[0].name, 'Captain Mira');
    context.chatMetadata = { sillynpc_system: 'A' };
    seedNpcRoster(settings, context, makeId);
    assert.equal(context.chatMetadata.sillynpc_npcs[0].statusOverrides.Level, '5');
});

test('reused renamed NPCs retain their gallery folder and independent portrait tags', () => {
    const { settings, context, makeId } = fixture();
    const original = context.chatMetadata.sillynpc_npcs[0];
    original.name = 'Captain Mira';
    original.imageFolder = 'Mira';
    original.images = ['/user/images/Mira/portrait.png'];
    original.imageTags = { [original.images[0]]: { Mood: 'Happy' } };
    setNpcRosterEnabled(settings, context, 'A', true);
    const [source] = rosterCharacters(settings);
    assert.equal(source.imageFolder, 'Mira');
    assert.deepEqual(source.imageTags, original.imageTags);
    original.imageTags[original.images[0]].Mood = 'Angry';
    assert.equal(source.imageTags[source.images[0]].Mood, 'Happy');

    context.chatMetadata = { sillynpc_system: 'A' };
    seedNpcRoster(settings, context, makeId);
    const copy = context.chatMetadata.sillynpc_npcs[0];
    assert.equal(copy.name, 'Captain Mira');
    assert.equal(copy.imageFolder, 'Mira');
    assert.deepEqual(copy.images, source.images);
    assert.deepEqual(copy.imageTags, source.imageTags);
    copy.imageTags[copy.images[0]].Mood = 'Sad';
    assert.equal(source.imageTags[source.images[0]].Mood, 'Happy');
});

test('rosters respect System, started chat, disabled mode and closed chat boundaries', () => {
    const { settings, context, makeId } = fixture();
    setNpcRosterEnabled(settings, context, 'A', true);
    settings.activeSystem = 'B';
    assert.equal(captureNpcRoster(settings, context), false);
    assert.equal(seedNpcRoster(settings, context, makeId), false);
    setNpcRosterEnabled(settings, context, 'B', true);
    context.chatMetadata = { sillynpc_system: 'B' };
    seedNpcRoster(settings, context, makeId);
    assert.deepEqual(context.chatMetadata.sillynpc_npcs, []);
    settings.activeSystem = 'A';
    context.chatMetadata = { sillynpc_system: 'A' };
    context.chat = [{ is_user: true }];
    seedNpcRoster(settings, context, makeId);
    assert.equal(context.chatMetadata.sillynpc_npcs, undefined);
    context.chat = [];
    assert.equal(seedNpcRoster(settings, context, makeId), false);
    setNpcRosterEnabled(settings, context, 'A', false);
    context.chatMetadata = { sillynpc_system: 'A' };
    assert.equal(seedNpcRoster(settings, context, makeId), false);
    setNpcRosterEnabled(settings, context, 'A', true);
    context.getCurrentChatId = () => undefined;
    assert.equal(seedNpcRoster(settings, context, makeId), false);
});

test('invalid imported roster shapes are repaired', () => {
    const settings = { systemNpcRosters: { A: null, B: { enabled: 'yes', cards: [null, { id: 'a', name: 'Mira' }] } } };
    normalizeNpcRosters(settings);
    assert.deepEqual(settings.systemNpcRosters, { B: { enabled: false, reusePlaces: false, cards: [{ id: 'a', name: 'Mira' }] } });
});

test('the old Manager memory option migrates once into canonical System rules', () => {
    const settings = { statusTracker: { presets: { A: { definition: { memories: { enabled: false } } } } },
        systemNpcRosters: { A: { enabled: true, reuseMemories: true, cards: [], memories: { npc: { entries: ['Saved'] } } } } };
    normalizeNpcRosters(settings);
    assert.equal(settings.statusTracker.presets.A.definition.memories.carryOver, true);
    assert.equal(Object.hasOwn(settings.systemNpcRosters.A, 'reuseMemories'), false);
    assert.equal(settings.systemNpcRosters.A.memories.npc.entries[0], 'Saved');
    settings.statusTracker.presets.A.definition.memories.carryOver = false;
    settings.systemNpcRosters.A.reuseMemories = true;
    normalizeNpcRosters(settings);
    assert.equal(settings.statusTracker.presets.A.definition.memories.carryOver, false);
});

test('choosing another System before play replaces only automatically seeded cards', () => {
    const { settings, context, makeId } = fixture();
    setNpcRosterEnabled(settings, context, 'A', true);
    context.chatMetadata = { sillynpc_system: 'A' };
    seedNpcRoster(settings, context, makeId);
    context.chatMetadata.sillynpc_npcs.push({ id: 'manual', name: 'Local' });
    settings.activeSystem = 'B';
    context.chatMetadata.sillynpc_system = 'B';
    assert.equal(seedNpcRoster(settings, context, makeId), true);
    assert.deepEqual(context.chatMetadata.sillynpc_npcs.map(card => card.name), ['Local']);
    settings.activeSystem = 'A';
    context.chatMetadata.sillynpc_system = 'A';
    seedNpcRoster(settings, context, makeId);
    assert.deepEqual(context.chatMetadata.sillynpc_npcs.map(card => card.name), ['Local', 'Mira']);
});

test('template field assignments govern carryover and clearing does not republish unchanged copies', () => {
    const { settings, context, makeId } = fixture();
    settings.statusTracker.npcStats = [
        { id: 'rank', name: 'Rank', carryOver: true, defaultValue: '1' },
        { id: 'hp', name: 'HP', carryOver: false, defaultValue: '10/10' },
        { id: 'other', name: 'Other', carryOver: true, defaultValue: '99' },
    ];
    settings.statusTracker.presets.A.definition = { npcTemplates: [{ id: 'mage' }], stats: { character: [
        { id: 'rank', name: 'Rank', carryOver: true, targets: ['template:mage'] },
        { id: 'hp', name: 'HP', targets: ['template:mage'] },
        { id: 'other', name: 'Other', carryOver: true, targets: ['template:guard'] },
    ] } };
    const card = context.chatMetadata.sillynpc_npcs[0];
    card.npcTemplateId = 'mage';
    card.statusOverrides = { Rank: '4', HP: '2/10', Other: '100' };
    setNpcRosterEnabled(settings, context, 'A', true);
    const original = context.chatMetadata;
    context.chatMetadata = { sillynpc_system: 'A' };
    seedNpcRoster(settings, context, makeId);
    assert.deepEqual(context.chatMetadata.sillynpc_npcs[0].statusOverrides, { Rank: '4', HP: '10/10' });
    settings.systemNpcRosters.A.cards = [];
    assert.equal(captureNpcRoster(settings, context), false);
    context.chatMetadata = original;
    assert.equal(captureNpcRoster(settings, context), false);
    settings.statusTracker.npcStats = [];
    assert.equal(captureNpcRoster(settings, context), false, 'a transient projection change must not publish stripped stats');
    assert.deepEqual(rosterCharacters(settings), []);
});

test('portrait cleanup protects saved rosters even when reuse is disabled', () => {
    const source = readFileSync(new URL('../src/api/api-image-files.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export ', '');
    const settings = { systemNpcRosters: { A: { enabled: false,
        cards: [{ imageUrl: '/portrait.png', images: ['/alternative.png'], defaultPortrait: '/default.png' }] } } };
    const referencedImagePaths = new Function('getSettings', 'getLibraryCharacters', 'rosterCharacters',
        `${source}\nreturn referencedImagePaths;`)(() => settings, () => [], rosterCharacters);
    assert.deepEqual(referencedImagePaths(), new Set(['/portrait.png', '/alternative.png', '/default.png']));
});
