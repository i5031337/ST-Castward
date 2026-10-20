import { getContext } from '../../../../../st-context.js';
import { buildLocationSceneContext, recentLocationMessages } from '../locations/location-context.js';
import { collectionQuantityField } from '../core/collection-fields.js';
import { progressionFields } from './progression-fields.js';
import { collectionAppliesTo, collectionTargetLabel } from '../core/collection-targets.js';
import { promptText } from '../prompts/prompt-texts.js';
import { isReaderStat } from './stat-update-policy.js';
import { describeStatDefinitions } from './stat-prompt-definitions.js';
import { setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../../../script.js';
import { applyMacros } from '../prompts/macros.js';
import { getSettings } from '../core/settings.js';
import { DEFAULT_INLINE_RULES } from '../core/settings-tracker-defaults.js';
import { debugLog } from '../core/constants.js';
import { noteActivatedLore } from '../lore/activated-lore.js';

export function bind(deps) {
/**
 * Builds the system instruction for the AI
 */
// Exported for the tests: the prompt texts are checked to send exactly what they did.
function getStatusInstructions() {
    const settings = getSettings().statusTracker;
    const currentState = deps.committedState || deps.loadStateFromMetadata();

    const statDefinitions = describeStatDefinitions(settings);

    // Add field definitions for collections to guide the AI
    let schemas = '';
    if (settings.collections && settings.collections.length > 0) {
        // Filter collections to only those relevant to current actors
        const hasPlayer = !!currentState.player;
        const actors = currentState.characters || [];

        const relevantCollections = settings.collections.filter(col => {
            return (hasPlayer && collectionAppliesTo(col, 'player'))
                || actors.some(actor => collectionAppliesTo(col, 'npc', actor));
        });

        schemas = relevantCollections.map(col => {
            const fieldInfo = col.fields.map(f => `${f.name} (${f.type}${f.isMultiline ? ', multiline' : ''})`).join(', ');
            const quantity = collectionQuantityField(col);
            return `- ${col.id} (${col.name}) for ${collectionTargetLabel(col)}: ${fieldInfo}`
                + (quantity ? ` Quantity enabled: ${quantity.name} carries amounts gained/spent.` : ' Uncounted entries.');
        }).join('\n');
    }

    // One text, 'storyBlock' in prompt-texts.js, from the heading to the format line.
    const places = currentState?.locations?.enabled
        ? buildLocationSceneContext(currentState, recentLocationMessages(getContext()?.chat)) : '';
    return '\n' + promptText('storyBlock', {
        status: deps.formatCompactStatus(currentState, true, places),
        rules: applyMacros(DEFAULT_INLINE_RULES),
        statDefinitions,
        npcFields: deps.describeNpcStatFields(settings),
        schemas,
        xpProgression: progressionFields(settings, { isPlayer: true }).enabled
            || (settings.npcTemplates || []).some(template => template.progression?.enabled) ? 'on' : '',
    }) + '\n';
}

/**
 * Builds a fake assistant response to prime the AI with the correct format
 */
// Exported for the tests, as getStatusInstructions is.
function getStatusExample() {
    // Use configured fields so the example does not invent stats or imply a genre.
    const settings = getSettings().statusTracker;
    const state = deps.committedState || deps.loadStateFromMetadata();
    const first = (list) => (list || []).map(s => s?.name).filter(Boolean)[0];

    const statExample = (definitions, values, progression) => {
        const stat = (definitions || []).find(def => def?.name && isReaderStat(def)
            && (!progression.enabled || def.name !== progression.levelName));
        if (!stat) return {};
        if (progression.enabled && stat.name === progression.xpName) return { deltas: { [stat.name]: 1 } };
        const numeric = ['number', 'bar'].includes(stat.type);
        return numeric && String(values?.[stat.name] ?? '').trim()
            ? { deltas: { [stat.name]: -1 } } : { stats: { [stat.name]: '<new value>' } };
    };
    const player = statExample(settings.playerStats, state.player?.stats,
        progressionFields(settings, { isPlayer: true }));
    const sampleCollection = (target, verb) => {
        const col = (settings.collections || []).find(c => c?.id
            && (collectionAppliesTo(c, target, target === 'npc' ? state?.characters?.[0] || {} : undefined)));
        if (!col) return undefined;
        const primaryDef = (col.fields || []).find(f => f.isPrimary);
        const primary = primaryDef?.name || 'name';
        const identifier = primaryDef?.type === 'number' ? 1 : primaryDef?.type === 'boolean' ? true : '<item identifier>';
        const item = { [primary]: identifier };
        for (const field of col.fields || []) {
            if (field.name !== primary && field.type === 'number') item[field.name] = 1;
        }
        const quantity = collectionQuantityField(col);
        return { [col.id]: verb === 'add' ? { add: [item] }
            : { remove: [quantity ? { [primary]: identifier, [quantity.name]: 1 } : identifier] } };
    };
    const playerCollection = sampleCollection('player', 'add');
    if (playerCollection) player.collections = playerCollection;

    const npc = state?.characters?.[0];
    const character = { name: first(state?.characters) || '<someone present>',
        ...statExample(settings.npcStats, npc?.stats, progressionFields(settings, { actor: npc })) };
    const npcCollection = sampleCollection('npc', 'remove');
    if (npcCollection) character.collections = npcCollection;

    return promptText('storyExample', { update: JSON.stringify({ global: {}, player, characters: [character] }) });
}

/**
 * Refresh mode-specific prompts at generation start and after WORLD_INFO_ACTIVATED.
 * Lore activation identifies scene characters before SillyTavern reads IN_CHAT prompts.
 * Reusing the same keys and depths replaces the earlier injection.
 */
function applyScenePrompt() {
    const settings = getSettings().statusTracker;

    const clear = (key) => setExtensionPrompt(key, '', extension_prompt_types.IN_CHAT, 0, false);

    if (!getSettings().enabled || !settings.enabled) {
        clear('sillynpc-status-instructions');
        clear('sillynpc-status-example');
        clear('sillynpc-status-scene');
        return;
    }

    if (settings.extractionMode === 'extract' || settings.extractionMode === 'manual') {
        // A separate pass does the bookkeeping, so the narrative prompt must not demand
        // a status block - that demand is what conflicts with character cards forbidding
        // numbers or status output in their prose.
        clear('sillynpc-status-instructions');
        clear('sillynpc-status-example');

        // It does still need to KNOW the state, or it invents HP and inventory. This is
        // plain fact, with no instruction to emit anything: a few hundred tokens against
        // the ~6,800 the instruction block used to cost.
        const scene = buildSceneContext();
        setExtensionPrompt(
            'sillynpc-status-scene',
            scene,
            extension_prompt_types.IN_CHAT,
            Number(settings.sceneInjectionDepth ?? 1),
            false,
            extension_prompt_roles.SYSTEM,
        );
        return;
    }

    clear('sillynpc-status-scene');

    setExtensionPrompt(
        'sillynpc-status-instructions',
        getStatusInstructions(),
        extension_prompt_types.IN_CHAT,
        0,
        false,
        extension_prompt_roles.USER,
    );

    setExtensionPrompt(
        'sillynpc-status-example',
        getStatusExample(),
        extension_prompt_types.IN_CHAT,
        1,
        false,
        extension_prompt_roles.ASSISTANT,
    );
}

function onGenerationStarted(type, data, dryRun) {
    if (dryRun) return;
    // No activation event is emitted when nothing fires, so discard the previous turn.
    noteActivatedLore([]);
    // A first pass, before any lorebook entry has fired. The WORLD_INFO_ACTIVATED handler
    // writes it again once it knows who did, and if nothing fires - SillyTavern does not
    // emit the event at all then - this is what stands.
    applyScenePrompt();
}

/**
 * The read-only scene block injected while extraction mode is on.
 *
 * Deliberately contains no schema, no example and no imperative - the narrative model is
 * being told what is true, not asked to maintain it.
 */
function buildSceneContext(given = null) {
    try {
        // The state is a parameter so this function can be tested at all, and that matters
        // more than it looks: the fault below was never in the renderer, which could always
        // produce full detail. It was in which argument this passed. A test that called the
        // renderer directly would have gone on passing throughout - and did, until it was
        // pointed here instead.
        const state = given || deps.committedState || deps.loadStateFromMetadata();
        if (!state) return '';
        /* Full detail, which this asked for and did not get for a long time.

           The parameter used to be called forPrompt, and both callers build prompts, so the
           name distinguished nothing and hid which of them was which. Inline mode passed
           true and was told what every item is; this passed false and got a list of names.
           So on the default setting the narrator saw "Spells: Snap-Ignite, Fire Aura" - no
           cost, no element, no description - and invented the rest every time one was cast.

           Nothing to do with the reader's own trimming: that lives in status-extractor.js
           behind a different function, and the two have never shared a renderer. The reader
           is sent less because it cannot change an item's description; the narrator needs it
           precisely because it is writing the scene. */
        const places = state.locations?.enabled
            ? buildLocationSceneContext(state, recentLocationMessages(getContext()?.chat)) : '';
        return deps.formatCompactStatus(state, true, places).trim();
    } catch (err) {
        debugLog('Could not build the scene context', err);
        return '';
    }
}

/**
 * Parses a message for status updates.
 */

Object.defineProperties(deps, {
    getStatusInstructions: { enumerable: true, configurable: true, get: () => getStatusInstructions },
    getStatusExample: { enumerable: true, configurable: true, get: () => getStatusExample },
    applyScenePrompt: { enumerable: true, configurable: true, get: () => applyScenePrompt },
    onGenerationStarted: { enumerable: true, configurable: true, get: () => onGenerationStarted },
    buildSceneContext: { enumerable: true, configurable: true, get: () => buildSceneContext },
});
}
