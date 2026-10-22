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
import { npcToolParameters, normalizedNpcName } from './npc-generation.js';
import { createNpcCreationService } from './npc-creation.js';
import { getMergedItem, saveStateToMetadata } from '../tracker/status-logic.js';
import { seedKnownNpcCollections } from './npc-collection-generation.js';

function reservedNames() {
    const context = getContext();
    const state = context.chatMetadata?.sillynpc_status_state;
    return [context.name1, context.name2, 'Narrator', 'User', 'Assistant', state?.player?.name].filter(Boolean);
}

function forbiddenNames() {
    return [...reservedNames(), ...castNames()];
}

function castNames(cards = getAllCharacters()) {
    const state = getContext().chatMetadata?.sillynpc_status_state;
    return [
        ...(state?.characters || []).map(actor => actor.name),
        ...cards.flatMap(card => [card.name, ...(card.aliases || [])
            .filter(alias => !alias.isRegex).map(alias => alias.pattern)])].filter(Boolean);
}

function knownActor(name) {
    return getContext().chatMetadata?.sillynpc_status_state?.characters
        ?.find(actor => normalizedNpcName(actor.name) === normalizedNpcName(name)) || null;
}

function buildContext(cards, request) {
    const context = getContext();
    const character = context.characters?.[context.characterId];
    return { setting: { description: String(character?.description || '').slice(0, 8000),
        scenario: String(character?.scenario || '').slice(0, 4000) },
        story: buildLoreExcerpt(context.chat || []).text,
        establishedActor: request.name ? knownActor(request.name) : null,
        namingUsedNames: castNames(cards),
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
    getForbiddenNames: forbiddenNames, getReservedNames: reservedNames, getKnownActor: knownActor, buildContext,
    requestFor: settings => generationRequestAdapter({ ...settings.statusTracker, extractionTemperature: '' }, settings.loreProfileId || '', 'npc'),
    commit: draft => {
        const held = knownActor(draft.name)?.collections || {};
        draft.statusCollections = Object.fromEntries(Object.entries(draft.statusCollections).map(([id, entries]) =>
            [id, Object.hasOwn(held, id) ? entries : entries.map(entry => getMergedItem(id, entry))]));
        const card = createCharacter(draft.name);
        Object.assign(card, draft);
        if (knownActor(card.name)) {
            const state = structuredClone(getContext().chatMetadata.sillynpc_status_state);
            if (seedKnownNpcCollections(state, card)) saveStateToMetadata(state, { label: 'NPC starting belongings' });
        }
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
    const parameters = npcToolParameters(getSettings());
    context.registerFunctionTool({
        name: 'castward_create_npc', displayName: 'Create NPC',
        description: 'Before introducing a substantial NPC without a card, commission a complete profile, initial stats and appropriate starting belongings and abilities. Choose npcTemplateId from the offered types when the System has multiple NPC templates; the generator receives only that template. Omit name for a new person with a randomized fresh name. Supply name to preserve the exact identity of a previously mentioned or canon character, and put established facts and canon constraints in requirements. Existing matching cards are returned unchanged; never use this to rename a card or change its assigned template. Supply the role, scene and optional naming culture. Wait for the result, then narrate using the returned name, facts and holdings. Prefer the existing cast for returning people; anonymous extras do not need cards. Reuse requestKey for retries of the same person; different people require different keys. Creation saves a chat-owned card but does not put them on stage. If creation fails, do not claim success or keep retrying this turn.',
        parameters,
        shouldRegister: () => {
            // The host calls this before serializing each request, including after a System edit or switch.
            Object.assign(parameters, npcToolParameters(getSettings()));
            return npcCreationService.enabled();
        },
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
