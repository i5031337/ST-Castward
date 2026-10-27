import { calculateCollectionUpdate } from './collection-calculation.js';
import { isStaticField } from '../core/constants.js';

/** Calculate an authoritative sheet edit and its related library changes. */
export function calculateCollectionEdit({ actor, collectionId, operation, item, index, fieldName, value,
    tracker, system, scope, tombstones, itemLibrary = {} }) {
    const definition = tracker.collections?.find(collection => collection.id === collectionId);
    if (!definition) return null;
    const primary = definition.fields.find(field => field.isPrimary)?.name || 'name';
    const current = actor.collections?.[collectionId]?.[index];
    if (operation !== 'add' && (!current || JSON.stringify(current) !== JSON.stringify(item))) return null;
    if (operation === 'edit') {
        if (!definition.fields.some(field => field.name === fieldName) || current[fieldName] === value) return null;
        const collections = structuredClone(actor.collections);
        const edited = collections[collectionId][index];
        edited[fieldName] = value;
        const library = structuredClone(itemLibrary);
        const oldName = current[primary];
        const newName = edited[primary];
        const rename = fieldName === primary && oldName !== newName;
        const staticEdit = isStaticField(definition.fields.find(field => field.name === fieldName));
        const libraryChanged = rename ? !!library[collectionId] : staticEdit;
        if (libraryChanged) {
            library[collectionId] ||= {};
            if (rename) delete library[collectionId][String(oldName).toLowerCase()];
            library[collectionId][String(newName).toLowerCase()] = Object.fromEntries(definition.fields
                .filter(field => isStaticField(field) && edited[field.name] !== undefined)
                .map(field => [field.name, structuredClone(edited[field.name])]));
        }
        return { collections, tombstones: structuredClone(tombstones), library,
            libraryChanged };
    }
    const result = calculateCollectionUpdate({ actor, collectionId, tracker, system, scope, tombstones,
        itemLibrary, operation, update: operation === 'add' ? item : current[primary],
        isManual: scope !== 'offstage' });
    const library = structuredClone(itemLibrary);
    for (const change of result.libraryChanges) {
        library[change.collectionId] ||= {};
        library[change.collectionId][String(change.itemName).toLowerCase()] = change.fields;
    }
    return { collections: result.collections, tombstones: result.tombstones,
        library, libraryChanged: result.libraryChanges.length > 0 };
}

/** Related effects run only inside the storage acceptance boundary. */
export function commitCollectionEdit({ plan, state, actor, card, settings, isCurrent, saveState, saveSettings, emit, label }) {
    if (!plan || !isCurrent()) return false;
    const install = () => {
        if (card) card.statusCollections = structuredClone(plan.collections);
        if (plan.libraryChanged) settings.master_items = plan.library;
    };
    if (!state) {
        install();
        saveSettings();
        return true;
    }
    const next = structuredClone(state);
    const target = actor === state.player ? next.player : next.characters[state.characters.indexOf(actor)];
    if (!target) return false;
    target.collections = plan.collections;
    if (plan.tombstones) next.recently_deleted = plan.tombstones;
    if (saveState(next, { label, isCurrent, beforeCommit: install }) !== true) return false;
    if (card || plan.libraryChanged) saveSettings();
    emit(next);
    return true;
}
