import { getCurrentPersonaKey } from './status-persona-state.js';
import { peekStateFromMetadata, saveStateToMetadata } from './status-state-storage.js';
import { statsInSystem } from './status-stat-filter.js';
import { runSchemaOperation } from './schema-operation-runtime.js';

const run = operation => runSchemaOperation(operation, {
    peekState: peekStateFromMetadata,
    saveState: (state, options) => saveStateToMetadata(state, options),
    personaKey: () => getCurrentPersonaKey(),
});
function renameStat(scopes, oldName, newName, field) {
    return run({ type: 'stat', scopes, oldName, newName, field });
}
function renameCollectionField(collectionId, oldName, newName, field) {
    const result = run({ type: 'collection-field', collectionId, oldName, newName, field });
    return result ? result.values : null;
}

export { statsInSystem, renameStat, renameCollectionField };
