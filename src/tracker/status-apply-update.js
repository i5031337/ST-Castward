import { eventSource } from '../../../../../events.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { activeNpcSystem } from '../core/npc-templates.js';
import { LOG_PREFIX } from '../core/constants.js';
import { calculateTrackerUpdate } from './tracker-update-calculation.js';

export function bind(deps) {
    function applyUpdate(update, options = {}) {
        const { dryRun = false, label = 'AI update', admitCharacters = false, allowReplace = false,
            partOfMessage = false, verbatim = false, progressionResolved = false, warnings } = options;
        // Refuse a missing chat before any card, library, or metadata writes.
        if (!dryRun && !deps.hasOpenChat()) {
            console.warn(LOG_PREFIX, 'Refused to apply a tracker update with no chat open.');
            return null;
        }
        const source = deps.committedState || deps.loadStateFromMetadata();
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
        if (!deps.hasOpenChat()) return null;
        for (const { cardIndex, fields } of calculated.cardChanges) Object.assign(cards[cardIndex], fields);
        if (calculated.libraryChanges.length) {
            settings.master_items ||= {};
            for (const change of calculated.libraryChanges) {
                settings.master_items[change.collectionId] ||= {};
                settings.master_items[change.collectionId][String(change.itemName).toLowerCase()] = change.fields;
            }
        }
        if (calculated.cardChanges.length || calculated.libraryChanges.length) saveSettings();
        deps.saveStateToMetadata(state, { label, partOfMessage });
        eventSource.emit('sillynpc-status-updated', state);
        return state;
    }

    Object.defineProperties(deps, {
        applyUpdate: { enumerable: true, configurable: true, get: () => applyUpdate },
    });
}
