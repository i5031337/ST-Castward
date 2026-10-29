import { calculateCollectionPlan, installCollectionChanges } from '../src/tracker/collection-pipeline.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { splitNpcStats, initialiseNpcStats } from '../src/tracker/stat-persistence.js';
import { normalizeNpcPresentation } from '../src/core/npc-presentation.js';
import { portableMemories } from '../src/characters/system-roster-state.js';
import { profileStrings } from '../src/core/profile-fields.js';

function source(path) {
    return readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export ', '');
}

test('character transfer carries the visible Cast collections and memories, but only opted-in stats', async () => {
    const definitions = [
        { name: 'Rank', carryOver: true, defaultValue: '0' },
        { name: 'HP', carryOver: false, defaultValue: '10/10' },
    ];
    const system = { memories: { carryOver: false } };
    const state = { characters: [{ id: 'source', name: 'Mira', stats: { Rank: '4', HP: '3/10' },
        collections: { equipment: [{ name: 'Lantern' }], conditions: [{ name: 'Bruised' }] } }] };
    const context = { getCurrentChatId: () => 'chat', chatMetadata: { sillynpc_status_state: state },
        saveMetadataDebounced: () => {} };
    const settings = { statusTracker: { npcStats: definitions, collections: [
        { id: 'equipment', fields: [{ name: 'name', isPrimary: true }, { name: 'description' }] },
        { id: 'conditions', fields: [{ name: 'name', isPrimary: true }] },
    ] }, master_items: { equipment: { lantern: { name: 'Lantern', description: 'Established brass lantern.' } } } };
    const deps = { calculateCollectionPlan, installCollectionChanges,
        getSettings: () => settings,
        activeNpcSystem: () => system, getContext: () => context,
        isChatCharacter: id => id === 'source', npcTemplateFor: () => null,
        splitNpcStats, initialiseNpcStats, npcStatsFor: () => definitions,
        profileStrings, normalizeNpcPresentation, portableMemories,
        readNpcMemories: () => ({ entries: [{ id: 'one', text: 'Saved her life' }], archive: [] }),
        writeNpcMemories: () => {}, blankActiveProfile: () => ({}),
    };
    const { serialiseCharacter, applyRecord } = new Function(...Object.keys(deps),
        `${source('../src/characters/character-transfer.js')}\nreturn { serialiseCharacter, applyRecord };`)(...Object.values(deps));
    const record = await serialiseCharacter({ id: 'source', name: 'Mira',
        profile: { appearance: 'A scarred scout' }, statusOverrides: { Rank: '1', HP: '9/10' },
        statusCollections: { equipment: [] } });
    assert.deepEqual(record.innateStats, { Rank: '4' });
    assert.equal(JSON.stringify(record).includes('3/10'), false);
    assert.deepEqual(record.collections.conditions, [{ name: 'Bruised' }]);
    assert.equal(record.memories.entries[0].text, 'Saved her life');
    assert.equal(record.profile.appearance, 'A scarred scout');

    const imported = { id: 'new', name: 'Mira (2)' };
    applyRecord(imported, record, 'Mira (2)', 3);
    assert.deepEqual(imported.statusOverrides, { Rank: '4', HP: '10/10' });
    assert.deepEqual(imported.statusCollections.equipment, [{ name: 'Lantern', description: 'Established brass lantern.' }]);
    assert.equal(settings.master_items.conditions.bruised.name, 'Bruised');
    assert.equal(imported.memories.entries[0].text, 'Saved her life');
    assert.equal(state.characters[0].stats.HP, '3/10');
});

test('portrait gallery, tags and selection survive remapping, and the expression reference is exported by index', async () => {
    const uriA = 'data:image/png;base64,YQ==';
    const uriB = 'data:image/png;base64,Yg==';
    const saved = [];
    const deps = {
        loadSpritePack: async () => [], normalizeSpriteFolder: value => value || '',
        adoptImageForCharacter: async (char, uri) => {
            const path = `/user/images/imported/${saved.length}.png`;
            saved.push([uri, path]); char.images.push(path); return path;
        },
    };
    const { captureCharacterMedia, restoreCharacterImages } = new Function(...Object.keys(deps),
        `${source('../src/characters/character-transfer-media.js')}\nreturn { captureCharacterMedia, restoreCharacterImages };`)(...Object.values(deps));
    const original = { images: [uriA, uriB], imageUrl: uriB,
        imageTags: { [uriA]: { Mood: 'Calm' } } };
    const record = await captureCharacterMedia(original, {
        presentation: { expressions: { spriteFolder: '', generation: { reference: uriA } } },
    });
    assert.deepEqual(record.images, [uriA, uriB]);
    assert.equal(record.portrait, 1);
    assert.equal(record.expressionReference, 0);
    const imported = {};
    const paths = await restoreCharacterImages(imported, record);
    assert.equal(imported.imageUrl, paths[1]);
    assert.deepEqual(imported.imageTags[paths[0]], { Mood: 'Calm' });
    assert.equal(saved.length, 2);
});

test('sprite import creates a fresh pack and preserves variant filenames', async () => {
    const uploads = [];
    const deps = {
        fetch: async (url, options) => {
            uploads.push({ url, name: options.body.get('name'), label: options.body.get('label'),
                spriteName: options.body.get('spriteName'), file: options.body.get('avatar').name });
            return { ok: true };
        },
        getRequestHeaders: () => ({}), crypto: { randomUUID: () => 'unique-pack' },
        atob, FormData, Blob,
    };
    const restore = new Function(...Object.keys(deps),
        `${source('../src/characters/character-transfer-media.js')}\nreturn restoreCharacterSprites;`)(...Object.values(deps));
    const card = { presentation: { expressions: { spriteFolder: 'Old/pack', bindingStatus: 'unresolved' } } };
    const changed = await restore(card, { sprites: [
        { name: 'joy.png', label: 'joy', image: 'data:image/png;base64,YQ==' },
        { name: 'joy-2.png', label: 'joy', image: 'data:image/png;base64,Yg==' },
    ] });
    assert.equal(changed, true);
    assert.equal(card.presentation.expressions.spriteFolder, 'Castward/unique-pack');
    assert.equal(card.presentation.expressions.bindingStatus, 'unverified');
    assert.deepEqual(uploads.map(entry => entry.spriteName), ['joy', 'joy-2']);
    assert.ok(uploads.every(entry => entry.name === 'Castward/unique-pack'
        && entry.url === '/api/sprites/upload'));
});

test('sprite export embeds every saved expression variant', async () => {
    const requested = [];
    const deps = {
        normalizeSpriteFolder: value => value,
        loadSpritePack: async () => [
            { label: 'joy', path: '/characters/Mira/joy.png?t=1' },
            { label: 'joy', path: '/characters/Mira/joy-2.png?t=2' },
        ],
        fetch: async path => {
            requested.push(path);
            return { ok: true, blob: async () => ({ type: 'image/png' }) };
        },
        FileReader: class {
            readAsDataURL() { this.result = 'data:image/png;base64,YQ=='; this.onload(); }
        },
    };
    const capture = new Function(...Object.keys(deps),
        `${source('../src/characters/character-transfer-media.js')}\nreturn captureCharacterMedia;`)(...Object.values(deps));
    const record = await capture({ images: [] }, {
        presentation: { expressions: { spriteFolder: 'Mira', generation: {} } },
    });
    assert.deepEqual(record.sprites.map(sprite => sprite.name), ['joy.png', 'joy-2.png']);
    assert.deepEqual(requested, ['/characters/Mira/joy.png?t=1', '/characters/Mira/joy-2.png?t=2']);
});


test('an import cancelled during the collision choice cannot create cards or item definitions', async () => {
    const settings = { master_items: {} };
    let current = true, created = 0;
    const deps = { getSettings: () => settings, lorebookWriteGuard: () => () => current,
        getAllCharacters: () => [{ name: 'Mira' }],
        createCharacter: () => { created++; }, normalizeSettings() {}, saveSettings() {} };
    const { importCharacters } = new Function(...Object.keys(deps),
        `${source('../src/characters/character-transfer.js')}
return { importCharacters };`)(...Object.values(deps));
    const result = await importCharacters({ characters: [{ name: 'Mira', collections: { gear: [{ name: 'Sword' }] } }] },
        { onCollision: async () => { current = false; return 'overwrite'; } });
    assert.equal(created, 0);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.overwritten, []);
    assert.deepEqual(settings.master_items, {});
});

test('invalid resolved import collections cannot alter an existing card or register earlier entries', () => {
    const settings = { statusTracker: { collections: [{ id: 'gear', fields: [
        { name: 'name', type: 'text', isPrimary: true },
        { name: 'rarity', type: 'text', options: ['Common'] },
    ] }] }, master_items: { gear: { sword: { name: 'Sword', rarity: 'Retired' } } } };
    const card = { id: 'kept', name: 'Original', statusCollections: { gear: [] }, profile: { history: 'Keep me' } };
    const before = structuredClone({ card, settings });
    const deps = { getSettings: () => settings, calculateCollectionPlan, installCollectionChanges };
    const { applyRecord } = new Function(...Object.keys(deps),
        `${source('../src/characters/character-transfer.js')}\nreturn { applyRecord };`)(...Object.values(deps));
    assert.throws(() => applyRecord(card, { name: 'Mira', collections: { gear: [
        { name: 'Shield', rarity: 'Common' }, { name: 'Sword', rarity: 'Common' },
    ] } }, 'Mira', 3), /Cannot use Item Library values/);
    assert.deepEqual({ card, settings }, before);
});

test('invalid imported equipment is skipped before creating or overwriting a card', async () => {
    for (const overwrite of [false, true]) {
        const settings = { statusTracker: { collections: [{ id: 'gear', fields: [
            { name: 'name', type: 'text', isPrimary: true },
            { name: 'rarity', type: 'text', options: ['Common'] },
        ] }] }, master_items: { gear: { sword: { name: 'Sword', rarity: 'Retired' } } } };
        const existing = { name: 'Mira', statusCollections: { gear: [] }, profile: { history: 'Keep me' } };
        let created = 0, instantiated = 0;
        const before = structuredClone({ existing, settings });
        const deps = { getSettings: () => settings, calculateCollectionPlan, installCollectionChanges,
            lorebookWriteGuard: () => () => true, getAllCharacters: () => overwrite ? [existing] : [],
            createCharacter: () => { created++; }, instantiateWorldCharacter: () => { instantiated++; },
            isChatCharacter: () => false, normalizeSettings() {}, saveSettings() {} };
        const { importCharacters } = new Function(...Object.keys(deps),
            `${source('../src/characters/character-transfer.js')}\nreturn { importCharacters };`)(...Object.values(deps));
        const result = await importCharacters({ version: 3, characters: [{ name: 'Mira', collections: { gear: [
            { name: 'Sword', rarity: 'Common' },
        ] } }] }, { onCollision: async () => 'overwrite' });
        assert.deepEqual(result.added, []);
        assert.deepEqual(result.overwritten, []);
        assert.deepEqual(result.skipped, ['Mira']);
        assert.equal(result.notes.length, 1);
        assert.equal(created, 0);
        assert.equal(instantiated, 0);
        assert.deepEqual({ existing, settings }, before);
    }
});
