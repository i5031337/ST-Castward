import { getContext } from '../../../../../st-context.js';
import { eventSource } from '../../../../../events.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { activeNpcSystem } from '../core/npc-templates.js';
import { LOG_PREFIX } from '../core/constants.js';
import { calculateTrackerUpdate } from './tracker-update-calculation.js';
import { captureTrackerOwner, trackerOwnerIsCurrent, commitTrackerUpdate } from './tracker-update-commit.js';

export function bind(deps) {
    function readSnapshot(messageId) {
        const settings = getSettings();
        const metadata = deps.getMetadata();
        const message = messageId === undefined ? null : getContext()?.chat?.[Number(messageId)];
        return { chatId: deps.hasOpenChat() ? deps.currentChatId() : undefined, metadata,
            personaKey: deps.getCurrentPersonaKey(), systemKey: settings.activeSystem,
            boundSystemKey: metadata?.[deps.SYSTEM_KEY], system: activeNpcSystem(settings) ?? null,
            tracker: settings.statusTracker, storedState: metadata?.[deps.STATE_KEY],
            state: metadata?.[deps.STATE_KEY] ?? deps.committedState,
            sourceMessage: messageId === undefined ? null : { index: Number(messageId), message,
                text: message?.mes, swipeId: message?.swipe_id } };
    }
    function applyUpdate(update, options = {}) {
        const { dryRun = false, label = 'AI update', admitCharacters = false, allowReplace = false,
            partOfMessage = false, verbatim = false, progressionResolved = false, warnings, messageId } = options;
        // Refuse a missing chat before any card, library, or metadata writes.
        if (!dryRun && !deps.hasOpenChat()) {
            console.warn(LOG_PREFIX, 'Refused to apply a tracker update with no chat open.');
            return null;
        }
        if (messageId !== undefined && !getContext()?.chat?.[Number(messageId)]) return null;
        // The loader invalidates caches whose chat or metadata owner changed.
        const source = deps.loadStateFromMetadata({ preferCache: true });
        const owner = dryRun ? null : captureTrackerOwner(readSnapshot(messageId));
        if (!dryRun && (owner.state !== source || !trackerOwnerIsCurrent(owner, readSnapshot(messageId)))) return null;
        const settings = getSettings();
        const cards = getAllCharacters();
        const actorDecisions = (Array.isArray(update.characters) ? update.characters : []).filter(actor => actor.name)
            .map(actor => {
                const canonicalName = deps.resolveCanonicalName(actor.name);
                return { name: actor.name, canonicalName, allowed: deps.mayJoinScene(canonicalName) };
            });
        const calculated = calculateTrackerUpdate({ state: source, tracker: settings.statusTracker,
            system: activeNpcSystem(settings) ?? null, cards, itemLibrary: settings.master_items || {},
            actorDecisions, playerIdentity: { name: deps.getCurrentPersonaName() }, update,
            policy: { preview: dryRun, admitCharacters, allowReplace, verbatim, progressionResolved },
            timestamp: Date.now() });
        warnings?.push(...calculated.warnings);
        deps.recordRefusedValues(calculated.refusedValues);
        if (dryRun) deps.recordCollectionWarnings(calculated.collectionWarnings);
        const state = calculated.nextState;
        if (calculated.offstageSkipped.length) {
            Object.defineProperty(state, 'offstageSkipped', {
                value: calculated.offstageSkipped, enumerable: false, configurable: true,
            });
        }
        if (dryRun) {
            // Comparison-only sheets never enter the calculator's actual scene state.
            for (const { actor, before } of calculated.offstageComparisons) {
                Object.defineProperty(actor, 'comparisonBase', { value: before });
                state.characters.push(actor);
            }
            return state;
        }
        return commitTrackerUpdate({ owner, calculated, cards, settings,
            readCurrent: () => readSnapshot(messageId),
            saveState: (next, saveOptions) => deps.saveStateToMetadata(next, saveOptions),
            saveSettings, emit: next => eventSource.emit('sillynpc-status-updated', next),
            options: { label, partOfMessage } });
    }

    Object.defineProperties(deps, {
        applyUpdate: { enumerable: true, configurable: true, get: () => applyUpdate },
    });
}
