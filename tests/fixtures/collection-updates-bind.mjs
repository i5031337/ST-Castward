import { calculateCollectionPlan, installCollectionChanges } from '../../src/tracker/collection-pipeline.js';
import { activeNpcSystem } from '../../src/core/npc-templates.js';

/** Adapt pure collection results to the mutable holders used by tracker fixtures. */
export function bindCollectionUpdates(deps, { getSettings, saveSettings = () => {} }) {
    const calculate = (actor, collectionId, update, { allowReplace = false, dryRun = false, operation = 'update' } = {}) => {
        const settings = getSettings();
        const result = calculateCollectionPlan({ actor, collectionId, update,
            tracker: settings.statusTracker, system: activeNpcSystem(settings) ?? null,
            scope: actor.name === deps.getCurrentPersonaName?.() ? 'player' : 'npc',
            itemLibrary: settings.master_items || {}, allowReplace, preview: dryRun, operation });
        if (result.collections !== undefined) actor.collections = result.collections;
        if (!dryRun && result.libraryChanges.length) {
            installCollectionChanges(settings, result.libraryChanges);
            saveSettings();
        }
        return result;
    };
    deps.applyCollectionUpdate = calculate;
    deps.addItem = (actor, collectionId, item, options) => calculate(actor, collectionId, item, { ...options, operation: 'add' });
    deps.removeItem = (actor, collectionId, name) => calculate(actor, collectionId, name, { operation: 'remove' });
}
