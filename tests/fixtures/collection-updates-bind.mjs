import { calculateCollectionUpdate } from '../../src/tracker/collection-calculation.js';
import { activeNpcSystem } from '../../src/core/npc-templates.js';

/** Adapt pure collection results to the mutable holders used by tracker fixtures. */
export function bindCollectionUpdates(deps, { getSettings, saveSettings = () => {} }) {
    const calculate = (actor, collectionId, update, { allowReplace = false, dryRun = false, operation = 'update' } = {}) => {
        const settings = getSettings();
        const result = calculateCollectionUpdate({ actor, collectionId, update,
            tracker: settings.statusTracker, system: activeNpcSystem(settings) ?? null,
            scope: actor.name === deps.getCurrentPersonaName?.() ? 'player' : 'npc',
            itemLibrary: settings.master_items || {}, allowReplace, preview: dryRun, operation });
        if (result.collections !== undefined) actor.collections = result.collections;
        if (!dryRun && result.libraryChanges.length) {
            settings.master_items ||= {};
            for (const change of result.libraryChanges) {
                settings.master_items[change.collectionId] ||= {};
                settings.master_items[change.collectionId][String(change.itemName).toLowerCase()] = change.fields;
            }
            saveSettings();
        }
        return result;
    };
    deps.applyCollectionUpdate = calculate;
    deps.addItem = (actor, collectionId, item, options) => calculate(actor, collectionId, item, { ...options, operation: 'add' });
    deps.removeItem = (actor, collectionId, name) => calculate(actor, collectionId, name, { operation: 'remove' });
}
