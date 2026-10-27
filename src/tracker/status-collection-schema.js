import { getCurrentPersonaKey } from './status-persona-state.js';
import { peekStateFromMetadata, loadStateFromMetadata, saveStateToMetadata } from './status-state-storage.js';
import { getSettings } from '../core/settings.js';
import { runSchemaOperation } from './schema-operation-runtime.js';
import { isStaticField } from '../core/constants.js';

const run = operation => runSchemaOperation(operation, {
    peekState: peekStateFromMetadata,
    saveState: (state, options) => saveStateToMetadata(state, options),
    personaKey: () => getCurrentPersonaKey(),
});
function syncOverrideToActiveState(charName, statName, newValue) {
    if (!charName || !statName) return false;
    
    // Attempt to load current state; if we don't have one, we can't sync.
    const state = loadStateFromMetadata();
    if (!state) return false;
    
    const existingChar = state.characters.find(c => c.name.toLowerCase() === charName.toLowerCase());
    if (existingChar) {
        if (newValue === '') {
            const settings = getSettings().statusTracker;
            const statDef = settings.npcStats.find(s => s.name === statName);
            existingChar.stats[statName] = statDef ? (statDef.defaultValue || '') : '';
        } else {
            existingChar.stats[statName] = newValue;
        }
        
        state.timestamp = Date.now();
        saveStateToMetadata(state);
        return true;
    }
    
    return false;
}

/**
 * Merges an AI-provided item with its Master Database entry if it exists.
 * If not, adds the item to the Master Database.
 */
function getMergedItem(collectionId, aiItem, { dryRun = false } = {}) {
    const settings = getSettings();
    const colDef = settings.statusTracker.collections.find(c => c.id === collectionId);
    if (!colDef) return aiItem;

    const primaryField = colDef.fields.find(f => f.isPrimary) || { name: 'name' };
    const itemName = aiItem[primaryField.name] || aiItem.name;
    if (!itemName) return aiItem;

    const masterDb = settings.master_items || {};
    
    const lowerName = String(itemName).toLowerCase();
    const masterEntry = masterDb[collectionId]?.[lowerName];

    if (masterEntry) {
        const mergedItem = { ...aiItem };
        colDef.fields.forEach(field => {
            // Static fields come from Master DB if available
            if (isStaticField(field) && masterEntry[field.name] !== undefined) {
                mergedItem[field.name] = masterEntry[field.name];
            }
        });
        return mergedItem;
    } else {
        // Not found, add to master
        if (!dryRun) updateMasterItem(collectionId, itemName, aiItem);
        return aiItem;
    }
}

/** Library operations calculate their complete write before accepting it. */
function updateMasterItem(collectionId, itemName, itemData, expected) {
    return run({ type: 'library-update', collectionId, itemName, itemData, expected });
}
function renameMasterItem(collectionId, oldName, newName, itemData, expected) {
    return run({ type: 'library-rename', collectionId, oldName, newName, itemData, expected });
}
function deleteMasterItem(collectionId, itemName, expected) {
    return run({ type: 'library-delete', collectionId, itemName, expected });
}
function renameCollectionId(oldName, newName, definition) {
    const result = run({ type: 'collection-id', oldName, newName, definition });
    return result ? result.values : null;
}

export { syncOverrideToActiveState, getMergedItem, updateMasterItem, renameMasterItem, deleteMasterItem, renameCollectionId };
