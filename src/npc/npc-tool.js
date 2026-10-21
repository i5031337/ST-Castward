import { getContext } from '../../../../../st-context.js';
import { eventSource, event_types } from '../../../../../events.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getAllCharacters, getChatCharacters } from '../characters/character-repository.js';
import { createCharacter } from '../characters/characters.js';
import { buildLoreExcerpt } from '../api/api-lore-generate.js';
import { generationRequestAdapter } from '../generation/request.js';
import { syncProfileToLore } from '../lore/lore-sync.js';
import { triggerReprocess } from '../chat/reprocess.js';
import { generateCharacterImageLogic } from '../api/api-image-generate.js';
import { LOG_PREFIX } from '../core/constants.js';
import { NPC_TOOL_PARAMETERS } from './npc-generation.js';
import { createNpcCreationService } from './npc-creation.js';

function forbiddenNames() {
    const context = getContext();
    const state = context.chatMetadata?.sillynpc_status_state;
    return [context.name1, context.name2, 'Narrator', 'User', 'Assistant', state?.player?.name,
        ...(state?.characters || []).map(actor => actor.name),
        ...getAllCharacters().flatMap(card => [card.name, ...(card.aliases || [])
            .filter(alias => !alias.isRegex).map(alias => alias.pattern)])].filter(Boolean);
}

function buildContext(cards) {
    const context = getContext();
    const character = context.characters?.[context.characterId];
    return { setting: { description: String(character?.description || '').slice(0, 8000),
        scenario: String(character?.scenario || '').slice(0, 4000) },
        story: buildLoreExcerpt(context.chat || []).text,
        unavailableNames: forbiddenNames(),
        recentCast: cards.slice(-20).map(card => ({ name: card.name,
            profile: Object.fromEntries(Object.entries(card.profile || {}).map(([id, value]) => [id, String(value).slice(0, 400)])) })) };
}

/** Portraits are optional background work; a failed portrait never blocks the scene. */
async function portrait(card, isCurrent) {
    if (!isCurrent() || getSettings().autoPortraitOnFill === false || card.imageUrl) return;
    try {
        const imageUrl = await generateCharacterImageLogic(card);
        if (!isCurrent() || getSettings().autoPortraitOnFill === false || card.imageUrl) return;
        card.images ||= [];
        if (!card.images.includes(imageUrl)) card.images.push(imageUrl);
        card.imageUrl = imageUrl;
        saveSettings();
        triggerReprocess();
    } catch (error) { console.warn(LOG_PREFIX, `NPC saved; portrait generation failed for ${card.name}`, error); }
}

export const npcCreationService = createNpcCreationService({
    getContext, getSettings, getCards: getAllCharacters, getChatCards: getChatCharacters,
    getForbiddenNames: forbiddenNames, buildContext,
    requestFor: settings => generationRequestAdapter({ ...settings.statusTracker, extractionTemperature: '' }, settings.loreProfileId || '', 'npc'),
    commit: draft => {
        const card = createCharacter(draft.name);
        Object.assign(card, draft);
        saveSettings();
        triggerReprocess();
        return card;
    },
    afterCommit: async (card, isCurrent) => {
        try { await syncProfileToLore(card, undefined, { isCurrent }); }
        finally { void portrait(card, isCurrent); }
    },
});

let initialized = false;
export function initNpcCreationTool() {
    if (initialized) return;
    const context = getContext();
    if (!context.registerFunctionTool) return;
    context.registerFunctionTool({
        name: 'castward_create_npc', displayName: 'Create NPC',
        description: 'Before introducing a substantial NEW NPC, commission a complete character with a randomized fresh name, profile and initial stats. Supply the role, scene, established constraints and optional naming culture. Wait for the result, then narrate using the returned name and facts. Use existing cast for returning people; do not call this to record or rename an existing character or for anonymous extras. Reuse requestKey for retries of the same person; different people require different keys. Creation saves a chat-owned card but does not put them on stage. If creation fails, do not claim success or keep retrying this turn.',
        parameters: NPC_TOOL_PARAMETERS,
        shouldRegister: npcCreationService.enabled,
        action: async request => {
            try { return await npcCreationService.create(request); }
            catch (error) {
                console.warn(LOG_PREFIX, 'NPC creation tool failed', error);
                return JSON.stringify({ ok: false, error: error.message || String(error),
                    instruction: 'Do not claim an NPC was created. Do not retry automatically this turn.' });
            }
        },
        formatMessage: () => 'Creating a new NPC…',
        stealth: false,
    });
    for (const event of [event_types.CHAT_CHANGED, event_types.GENERATION_STOPPED, event_types.PERSONA_CHANGED]) {
        eventSource.on(event, npcCreationService.invalidate);
    }
    initialized = true;
}
