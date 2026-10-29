import { activeNpcSystem } from '../core/npc-templates.js';
import { resolveProgressionConfig } from '../core/progression-config.js';
import { getInitialStatValue } from '../tracker/stat-value-utils.js';
import { validateShape } from '../generation/validate-shape.js';
import { startingCollections, npcCollectionsSchema, validateNpcStartingCollections,
    NPC_COLLECTION_INSTRUCTIONS } from '../npc/npc-collection-generation.js';
import { parseNpcResponse, describeNpcGenerationTemplate } from '../npc/npc-generation-format.js';
import { validateStartingStats } from './starting-stats.js';
import { playerCreationSystemContext } from '../prompts/player-creation.js';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export function playerAdventureContract(settings) {
    const system = activeNpcSystem(settings);
    const stats = (settings.statusTracker?.playerStats || []).filter(stat => stat.name && !stat.retired);
    const collections = startingCollections(settings, 'player', undefined, system);
    const choice = { id: 'player', name: 'Player', fields: [], stats, collections,
        progression: resolveProgressionConfig(settings.statusTracker, { isPlayer: true }) };
    const collectionSchema = npcCollectionsSchema([choice]);
    collectionSchema.required = collections.map(collection => collection.id);
    return { ...choice, schema: object({
        stats: object(Object.fromEntries(stats.map(stat => [stat.name, { type: 'string', maxLength: 300 }]))),
        collections: collectionSchema,
    }) };
}

/** Initialization is offered only before play, while the sheet still holds defaults. */
export function playerAdventureAvailability(context, state, contract, personaKey) {
    if (context?.getCurrentChatId?.() === undefined || !context.chatMetadata) return 'Open a new chat to create a starting sheet.';
    const actor = state?.player;
    if (!actor || actor.personaKey !== personaKey) return 'The active player persona has changed.';
    if (actor.adventureInitialized) return 'Starting stats and collections have already been created.';
    if (context.chat?.some(message => message.is_user && !message.is_system)) return 'The adventure has started; current progress is kept.';
    if (Object.values(actor.collections || {}).some(entries => Array.isArray(entries) && entries.length)
        || contract.stats.some(stat => String(actor.stats?.[stat.name] ?? '').trim()
            && String(actor.stats[stat.name]).trim() !== String(getInitialStatValue(stat.defaultValue)))) {
        return 'The player sheet has existing stats or belongings; current progress is kept.';
    }
    return contract.stats.length || contract.collections.length ? '' : 'This System has no player stats or collections.';
}

export function validatePlayerAdventure(raw, contract) {
    const value = parseNpcResponse(raw, { choices: [contract] });
    const errors = validateShape(value, contract.schema);
    if (errors.length) throw new Error(errors.slice(0, 4).join('; '));
    return { stats: validateStartingStats(value.stats, contract.stats, contract.progression),
        collections: validateNpcStartingCollections(value.collections, contract.collections) };
}

export const PLAYER_ADVENTURE_INSTRUCTIONS = `Create a starting sheet for the player's new adventure.
Use their persona, completed profile, opening story and System guidance. Preserve established facts and choose a small, coherent starting loadout fitting this character.
Return only JSON matching responseSchema. Include every configured stat and collection, with [] for an empty collection.
Write absolute stat readings as JSON strings, using configured bounds and allowed values. Use current/maximum for resource pools and plain numbers for ratings.
Initialize progression Level as a positive integer and XP at zero with its configured capacity. This is starting character creation, not earned XP or a level-up award.
Do not change the profile, invent extra stats or collections, or advance the story.

${NPC_COLLECTION_INSTRUCTIONS}`;

/** Generate and review a draft before one chat-owned save; stale results never commit. */
export function createPlayerAdventureService({ getContext, getSettings, getPersona, loadState,
    request, review, saveState, afterSave = () => {} }) {
    let pending = false;
    return {
        audit(card) {
            const reason = playerAdventureAvailability(getContext(), loadState(), playerAdventureContract(getSettings()), card.personaKey);
            return { done: Boolean(reason), summary: reason || 'Create starting stats, equipment and abilities for this adventure, then review before applying.' };
        },
        async initialize(card, signal) {
            if (pending) throw new Error('Starting sheet creation is already running.');
            const context = getContext(), settings = getSettings(), persona = getPersona();
            const contract = playerAdventureContract(settings);
            const reason = playerAdventureAvailability(context, loadState(), contract, card.personaKey);
            if (reason) throw new Error(reason);
            if (persona.avatar !== card.personaKey) throw new Error('The active player persona has changed.');
            const metadata = context.chatMetadata, chatId = context.getCurrentChatId();
            const signature = () => JSON.stringify({ system: getSettings().activeSystem,
                setting: playerCreationSystemContext(getSettings()),
                contract: playerAdventureContract(getSettings()), connection: getSettings().loreProfileId,
                persona: getPersona(), profile: card.profile, player: loadState()?.player,
                story: getContext()?.chat?.map(message => [message.mes, message.swipe_id]) });
            const original = signature();
            const assertCurrent = () => {
                signal?.throwIfAborted();
                if (getContext()?.chatMetadata !== metadata || getContext()?.getCurrentChatId?.() !== chatId
                    || signature() !== original) throw new DOMException('Starting sheet cancelled because the chat, persona, System or player sheet changed.', 'AbortError');
            };
            pending = true;
            try {
                const raw = await request({ systemPrompt: PLAYER_ADVENTURE_INSTRUCTIONS,
                    userPrompt: JSON.stringify({ name: card.name, persona: persona.description || '', profile: card.profile,
                        system: playerCreationSystemContext(settings),
                        story: (context.chat || []).slice(-8).map(message => String(message.mes || '').slice(-2400)),
                        definitions: describeNpcGenerationTemplate(contract), responseSchema: contract.schema }),
                    schema: contract.schema, maxTokens: settings.loreMaxTokens || 2048, signal });
                assertCurrent();
                const draft = validatePlayerAdventure(raw, contract);
                const accepted = await review(structuredClone(draft), contract);
                assertCurrent();
                if (!accepted) return { ok: true, skipped: true };
                const state = structuredClone(loadState());
                state.player.stats = { ...state.player.stats, ...draft.stats };
                state.player.collections = { ...state.player.collections, ...draft.collections };
                state.player.adventureInitialized = true;
                if (saveState(state, { label: 'Created player starting sheet' }) === false) {
                    throw new Error('The starting sheet could not be saved in this chat.');
                }
                afterSave(state);
                return { ok: true };
            } finally { pending = false; }
        },
    };
}
