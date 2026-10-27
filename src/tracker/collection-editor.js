import { getContext } from '../../../../../st-context.js';
import { eventSource } from '../../../../../events.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { activeNpcSystem } from '../core/npc-templates.js';
import { getCurrentPersonaKey } from './status-persona-state.js';
import { loadStateFromMetadata, saveStateToMetadata } from './status-state-storage.js';
import { calculateCollectionEdit, commitCollectionEdit } from './collection-editor-calculation.js';
import { isTrackerEditLocked, trackerEditRevision } from './tracker-edit-lock.js';

/** Keep the editor bound to the chat, persona, rules and card it displayed. */
export function createCollectionEditor(actor, isPlayer) {
    const editRevision = trackerEditRevision();
    const context = getContext();
    const settings = getSettings();
    const owner = { chatId: context?.getCurrentChatId?.(), metadata: context?.chatMetadata,
        persona: getCurrentPersonaKey(), system: settings.activeSystem, tracker: settings.statusTracker,
        rules: JSON.stringify(settings.statusTracker), definition: activeNpcSystem(settings),
        boundSystem: context?.chatMetadata?.sillynpc_system };
    owner.definitionRevision = JSON.stringify(owner.definition);
    const cards = getAllCharacters();
    const card = isPlayer ? null : cards.find(card => actor.id && card.id === actor.id)
        || cards.find(card => card.name?.toLowerCase() === actor.name?.toLowerCase());
    const owned = () => {
        const current = getContext();
        return current?.getCurrentChatId?.() === owner.chatId && current?.chatMetadata === owner.metadata
            && getCurrentPersonaKey() === owner.persona && getSettings() === settings
            && settings.activeSystem === owner.system && settings.statusTracker === owner.tracker
            && JSON.stringify(settings.statusTracker) === owner.rules
            && activeNpcSystem(settings) === owner.definition
            && JSON.stringify(activeNpcSystem(settings)) === owner.definitionRevision
            && current?.chatMetadata?.sillynpc_system === owner.boundSystem
            && (owner.chatId === undefined || !owner.boundSystem || owner.boundSystem === owner.system)
            && (!card || getAllCharacters().includes(card));
    };
    const resolve = () => {
        if (!owned()) return null;
        const storedPlayer = owner.metadata?.sillynpc_status_state?.player;
        if (owner.chatId !== undefined && storedPlayer?.personaKey && storedPlayer.personaKey !== owner.persona) return null;
        const state = owner.chatId === undefined ? null : loadStateFromMetadata({ preferCache: true });
        const target = isPlayer ? state?.player : state?.characters?.find(entry => actor.id && entry.id === actor.id)
            || state?.characters?.find(entry => entry.name?.toLowerCase() === actor.name?.toLowerCase());
        if (target) return { state, target };
        if (isPlayer || !card) return null;
        return { state: null, target: { ...card, collections: card.statusCollections || {} } };
    };
    return {
        current: resolve,
        commit(change, label) {
            if (isTrackerEditLocked() || trackerEditRevision() !== editRevision) return false;
            const where = resolve();
            if (!where) return false;
            const { state, target } = where;
            const revision = JSON.stringify(state);
            const cardRevision = JSON.stringify(card?.statusCollections);
            const libraryRevision = JSON.stringify(settings.master_items);
            const stored = getContext()?.chatMetadata?.sillynpc_status_state;
            const isCurrent = () => owned()
                && (!state?.player?.personaKey || state.player.personaKey === owner.persona)
                && getContext()?.chatMetadata?.sillynpc_status_state === stored
                && JSON.stringify(state) === revision && JSON.stringify(card?.statusCollections) === cardRevision
                && JSON.stringify(settings.master_items) === libraryRevision;
            const plan = calculateCollectionEdit({ actor: target, tracker: settings.statusTracker,
                system: owner.definition, scope: state ? isPlayer ? 'player' : 'npc' : 'offstage',
                tombstones: state?.recently_deleted ?? null, itemLibrary: settings.master_items || {}, ...change });
            return commitCollectionEdit({ plan, state, actor: target, card, settings, isCurrent,
                saveState: saveStateToMetadata, saveSettings, label,
                emit: next => eventSource.emit('sillynpc-status-updated', next, { source: 'collection-editor' }) });
        },
    };
}
