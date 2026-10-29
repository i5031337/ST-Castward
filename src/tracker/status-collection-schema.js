import { getCurrentPersonaKey } from './status-persona-state.js';
import { peekStateFromMetadata, loadStateFromMetadata, saveStateToMetadata } from './status-state-storage.js';
import { getSettings } from '../core/settings.js';
import { runSchemaOperation } from './schema-operation-runtime.js';

const run = operation => {
    try {
        return runSchemaOperation(operation, {
            peekState: peekStateFromMetadata,
            saveState: (state, options) => saveStateToMetadata(state, options),
            personaKey: () => getCurrentPersonaKey(),
        });
    } catch (error) {
        console.warn('Castward: Collection edit rejected', error);
        if (typeof toastr !== 'undefined') toastr.warning(error.message || String(error), 'Castward Item Library', { escapeHtml: true });
        return null;
    }
};
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

export { syncOverrideToActiveState, updateMasterItem, renameMasterItem, deleteMasterItem, renameCollectionId };
