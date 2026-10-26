import { applyRosterStateSeed } from '../src/characters/system-roster-state.js';
import { captureNpcRoster } from '../src/characters/system-npc-roster.js';
import { profileFieldValue } from '../src/core/profile-fields.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleCharacters, canAutoLinkLorebook } from '../src/characters/character-scope.js';
import { chatNpcSources, chatNpcImagePaths } from '../src/chat/chat-npc-sources.js';
import { collectionAppliesTo } from '../src/core/collection-targets.js';
import { readFileSync } from 'node:fs';

test('two chats can resolve the same speaker to independent local cards', () => {
    const world = [{ id: 'world', name: 'Mira' }, { id: 'other', name: 'Jon' }];
    const first = [{ id: 'first', name: 'Mira' }];
    const second = [{ id: 'second', name: 'Mira' }];
    assert.deepEqual(visibleCharacters(first, world).map(card => card.id), ['first', 'other']);
    assert.deepEqual(visibleCharacters(second, world).map(card => card.id), ['second', 'other']);
    assert.deepEqual(world.map(card => card.id), ['world', 'other']);
});

test('a fresh chat profile cannot silently adopt a same-name lore entry', () => {
    const fresh = { name: 'Mira', autoLinkLorebook: false };
    assert.equal(canAutoLinkLorebook(fresh), false);
    assert.equal(canAutoLinkLorebook(fresh, true), true);
    assert.equal(canAutoLinkLorebook({ name: 'Mira' }), true);
});

test('world export includes independent NPCs from every assigned chat', () => {
    const headers = [
        { file_id: 'first', avatar: 'a.png', chat_metadata: {
            sillynpc_system: 'A', sillynpc_npcs: [{ id: 'one', name: 'Mira' }],
        } },
        { file_id: 'second', avatar: 'a.png', chat_metadata: {
            sillynpc_system: 'A', sillynpc_npcs: [{ id: 'one', name: 'Mira' }, { id: 'two', name: 'Jon' }],
        } },
        { file_id: 'third', avatar: 'a.png', chat_metadata: {
            sillynpc_system: 'B', sillynpc_npcs: [{ id: 'three', name: 'Elsewhere' }],
        } },
    ];
    const sources = chatNpcSources(headers, 'A');
    assert.deepEqual(sources.map(({ char, sourceChat }) => [char.name, sourceChat]), [
        ['Mira', ':a.png:first'], ['Mira', ':a.png:second'], ['Jon', ':a.png:second'],
    ]);
});

test('portrait references in closed chats remain protected', () => {
    const headers = [{ chat_metadata: { sillynpc_npcs: [
        { imageUrl: '/user/images/a.png', images: ['/user/images/b.png'] },
    ] } }];
    assert.deepEqual(chatNpcImagePaths(headers), new Set([
        '/user/images/a.png', '/user/images/b.png',
    ]));
});

function bindFrom(file, names, values) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replace('export function bind', 'function bind');
    return new Function(...names, `${source}\nreturn bind;`)(...values);
}

const settings = {
    statusTracker: {
        playerStats: [{ name: 'HP', defaultValue: '10' }],
        collections: [
            { id: 'inventory', targets: ['player', 'template:human'], fields: [{ name: 'name', isPrimary: true }] },
            { id: 'moves', targets: ['template:pokemon'], fields: [{ name: 'name', isPrimary: true }] },
        ],
    },
    personaData: {
        'Rhea.png': {
            name: 'Rhea', imageUrl: 'portrait.png', profile: { appearance: 'Tall' },
            lorebook: { uid: 7 }, stats: { HP: '3' },
            collections: { inventory: [{ name: 'old sword' }] },
        },
    },
};
let saves = 0;
const deps = { getInitialStatValue: value => value };
bindFrom('../src/tracker/status-persona-state.js',
    ['collectionAppliesTo', 'getContext', 'power_user', 'user_avatar', 'getSettings', 'saveSettings', 'debugLog', 'resolveProfileFields', 'profileFieldValue'],
    [collectionAppliesTo, () => ({}), { personas: { 'Rhea.png': 'Rhea' } }, 'Rhea.png',
        () => settings, () => { saves++; }, () => {}, () => [], profileFieldValue])(deps);

test('fresh chat and persona values start at System defaults, without old global inventory', () => {
    const chatA = { player: { name: 'Rhea', personaKey: 'Rhea.png', ...deps.createChatPlayerSeed() } };
    assert.deepEqual(chatA.player.stats, { HP: '10' });
    assert.deepEqual(chatA.player.collections, { inventory: [] });
    chatA.player.stats.HP = '2';
    chatA.player.collections.inventory.push({ name: 'chat A ring' });
    chatA.player.memories = [{ text: 'A secret' }];
    const chatB = { player: { name: 'Rhea', personaKey: 'Rhea.png', ...deps.createChatPlayerSeed() } };
    assert.equal(chatB.player.stats.HP, '10');
    assert.deepEqual(chatB.player.collections.inventory, []);
    assert.equal(settings.personaData['Rhea.png'].stats.HP, '3');
    assert.equal(settings.personaData['Rhea.png'].imageUrl, 'portrait.png');
    assert.equal(deps.getPlayerCard().imageUrl, 'portrait.png');
    assert.deepEqual(deps.getPlayerCard().lorebook, { uid: 7 });
    assert.equal(saves, 0);

    deps.activatePersona(chatA, 'Other.png', 'Other');
    deps.activatePersona(chatA, 'Rhea.png', 'Rhea');
    assert.equal(chatA.player.stats.HP, '2');
    assert.deepEqual(chatA.player.collections.inventory, [{ name: 'chat A ring' }]);
    assert.deepEqual(chatA.player.memories, [{ text: 'A secret' }]);
});

test('storage loads legacy tracker player from master, but fresh chats use defaults', () => {
    const metadata = { sillynpc_status_state: { global: {}, characters: [] } };
    const storage = {
        STATE_KEY: 'sillynpc_status_state', HISTORY_KEY: 'sillynpc_status_history',
        committedState: null, committedChatId: null, currentChatId: () => 'chat A',
        stateOrigin: new WeakMap(), getMetadata: () => metadata, hasOpenChat: () => true,
        getCurrentPersonaKey: () => 'Rhea.png', getCurrentPersonaName: () => 'Rhea',
        activatePersona: deps.activatePersona, createChatPlayerSeed: deps.createChatPlayerSeed,
        migrateLegacyPlayer: deps.migrateLegacyPlayer,
        createInitialState: () => ({ global: {}, characters: [], player: {} }),
        getInitialStatValue: value => value, clampToCeiling: value => value,
    };
    bindFrom('../src/tracker/status-state-storage.js',
        ['getSettings', 'getContext', 'eventSource', 'debugLog', 'LOG_PREFIX', 'applyRosterStateSeed', 'captureNpcRoster', 'saveSettings'],
        [() => settings, () => ({ saveMetadataDebounced() {} }), { emit() {} }, () => {}, '[test]', applyRosterStateSeed, captureNpcRoster, () => {}])(storage);
    assert.equal(storage.loadStateFromMetadata().player.stats.HP, '3');
    assert.deepEqual(storage.loadStateFromMetadata().player.collections.inventory, [{ name: 'old sword' }]);
    const loaded = storage.loadStateFromMetadata();
    loaded.locations = { enabled: false, currentId: 'inn', records: { inn: { name: 'Inn' } } };
    settings.statusTracker.locations = { enabled: true };
    assert.equal(storage.loadStateFromMetadata().locations.enabled, true);
    settings.statusTracker.locations.enabled = false;
    assert.deepEqual(storage.loadStateFromMetadata().locations,
        { enabled: false, currentId: 'inn', records: { inn: { name: 'Inn' } } });
    delete settings.statusTracker.locations;

    delete metadata.sillynpc_status_state;
    storage.committedState = null;
    storage.committedChatId = null;
    metadata.sillynpc_roster_state_seed = {
        locations: { enabled: true, currentId: '', records: { inn: { id: 'inn', name: 'Inn' } } },
        npcMemories: { 'id:copied': { entries: [{ id: 'one', text: 'Carried memory', manual: true }], archive: [] } },
    };
    assert.equal(storage.loadStateFromMetadata().player.stats.HP, '10');
    assert.deepEqual(storage.loadStateFromMetadata().player.collections.inventory, []);
    assert.equal(metadata.sillynpc_roster_state_seed, undefined);
    assert.equal(metadata.sillynpc_status_state.locations.records.inn.name, 'Inn');
    assert.equal(metadata.sillynpc_status_state.npcMemories['id:copied'].entries[0].text, 'Carried memory');
});

test('saved player items survive repeated state loads with default and custom identifiers', () => {
    for (const identifier of ['name', 'title']) {
        const items = [
            { [identifier]: 'New Item', description: 'First row' },
            { [identifier]: 'New Item 2', description: 'Second row', quantity: 3 },
            { [identifier]: 'new item 12', description: 'Custom saved item' },
            { [identifier]: 'Sword', description: 'Ordinary item' },
        ];
        const metadata = { state: { global: {}, characters: [], recently_deleted: {},
            player: { name: 'Rhea', stats: {}, collections: { inventory: structuredClone(items) } } } };
        const localSettings = { statusTracker: { collections: [
            { id: 'inventory', fields: [{ name: identifier, isPrimary: true }] },
        ] } };
        const storage = {
            STATE_KEY: 'state', HISTORY_KEY: 'history',
            currentChatId: () => 'chat', stateOrigin: new WeakMap(),
            getMetadata: () => metadata, hasOpenChat: () => true,
            getCurrentPersonaKey: () => 'Rhea.png', getCurrentPersonaName: () => 'Rhea',
            activatePersona() {},
        };
        bindFrom('../src/tracker/status-state-storage.js',
            ['getSettings', 'getContext', 'eventSource', 'debugLog', 'LOG_PREFIX', 'applyRosterStateSeed', 'captureNpcRoster', 'saveSettings'],
            [() => localSettings, () => ({ saveMetadataDebounced() {} }), { emit() {} }, () => {}, '[test]', applyRosterStateSeed, captureNpcRoster, () => {}])(storage);
        for (let reload = 0; reload < 2; reload++) {
            const loaded = storage.loadStateFromMetadata();
            assert.deepEqual(loaded.player.collections.inventory, items);
            assert.deepEqual(storage.loadStateFromMetadata().player.collections.inventory, items);
            storage.saveStateToMetadata(loaded, { recordHistory: false });
            metadata.state = JSON.parse(JSON.stringify(metadata.state));
            storage.committedState = null;
        }
    }
});
