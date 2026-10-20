import { portableMemories } from '../src/characters/system-roster-state.js';
import { readNpcMemories } from '../src/tracker/npc-memories.js';
import { npcRoster } from '../src/characters/system-npc-roster.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { chatNpcSources, CHAT_NPCS_KEY } from '../src/chat/chat-npc-sources.js';
import { npcTemplateFor } from '../src/core/npc-templates.js';
import { splitNpcStats, normaliseNpcPersistence } from '../src/tracker/stat-persistence.js';
import { normaliseStatUpdatePolicies } from '../src/tracker/stat-update-policy.js';
import { profileStrings } from '../src/core/profile-fields.js';
import { normalizeNpcPresentation } from '../src/core/npc-presentation.js';

function hostIndependentSource(path) {
    return readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export ', '');
}

const transferSource = hostIndependentSource('../src/characters/character-transfer.js');
const exportSource = hostIndependentSource('../src/characters/world-character-export.js');

test('inactive System exports shared cards, its saved roster and chat NPCs using its own rules', async () => {
    const activeDefinition = { npcTemplates: [{ id: 'active' }], legacyNpcTemplateId: 'active' };
    const selectedDefinition = { npcTemplates: [{ id: 'scout' }], legacyNpcTemplateId: 'scout',
        memories: { carryOver: true }, stats: { npc: [{ name: 'Rank', type: 'number', locked: true, carryOver: true }] } };
    const settings = { activeSystem: 'Active', statusTracker: {
        npcStats: [{ name: 'Other', locked: true }],
        presets: { Active: { definition: activeDefinition }, Inactive: { definition: selectedDefinition } },
    } };
    settings.systemNpcRosters = {
        Inactive: { enabled: true, memories: { roster: { entries: ['Saved roster knowledge'] } }, cards: [{ id: 'roster', name: 'Jon', statusOverrides: { Rank: '4' } }] },
        Active: { enabled: true, cards: [{ id: 'unrelated', name: 'Elsewhere' }] },
    };
    const cards = [{ id: 'shared', name: 'Mira', statusOverrides: { Rank: '3', Other: '9' } }];
    const headers = [{ file_id: 'story', chat_metadata: { sillynpc_system: 'Inactive',
        [CHAT_NPCS_KEY]: [{ id: 'chat', name: 'Tess', statusOverrides: { Rank: '2' } }],
        sillynpc_status_state: { npcMemories: { 'id:chat': { entries: ['Closed chat knowledge'] } } },
    } }];
    const serialiseCharacter = new Function('getSettings', 'activeNpcSystem', 'npcTemplateFor',
        'splitNpcStats', 'profileStrings', 'loadWorldInfo', 'debugLog', 'normalizeNpcPresentation', 'portableMemories', 'readNpcMemories',
        `${transferSource}\nreturn serialiseCharacter;`)(
        () => settings, () => activeDefinition, npcTemplateFor, splitNpcStats,
        profileStrings, async () => null, () => {}, normalizeNpcPresentation, portableMemories, readNpcMemories);
    const exportWorldCharacters = new Function('getSettings', 'getWorldCharacters',
        'getChatCharacters', 'getContext', 'listChatHeaders', 'chatNpcSources', 'CHAT_NPCS_KEY',
        'serialiseCharacter', 'TRANSFER_FORMAT', 'TRANSFER_VERSION',
        'normaliseStatUpdatePolicies', 'normaliseNpcPersistence', 'npcRoster',
        `${exportSource}\nreturn exportWorldCharacters;`)(
        () => settings, () => cards, () => [], () => ({}), async () => headers,
        chatNpcSources, CHAT_NPCS_KEY, serialiseCharacter, 'sillynpc-characters', 2,
        normaliseStatUpdatePolicies, normaliseNpcPersistence, npcRoster);

    const payload = await exportWorldCharacters('Inactive');
    assert.deepEqual(payload.characters.map(card => card.name), ['Mira', 'Jon', 'Tess']);
    assert.deepEqual(payload.characters.map(card => card.npcTemplateId), ['scout', 'scout', 'scout']);
    assert.deepEqual(payload.characters[0].innateStats, { Rank: '3' });
    assert.deepEqual(payload.characters[1].innateStats, { Rank: '4' });
    assert.deepEqual(payload.characters[2].innateStats, { Rank: '2' });
    assert.equal(payload.characters[0].source.kind, 'world');
    assert.equal(payload.characters[2].source.kind, 'chat');
    assert.equal(payload.characters[0].memories.entries.length, 0);
    assert.equal(payload.characters[1].memories.entries[0].text, 'Saved roster knowledge');
    assert.equal(payload.characters[2].memories.entries[0].text, 'Closed chat knowledge');
});
