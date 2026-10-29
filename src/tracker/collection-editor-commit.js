import { installCollectionChanges } from './collection-pipeline.js';

/** Related effects run only inside the storage acceptance boundary. */
export function commitCollectionEdit({ plan, state, actor, card, settings, isCurrent, saveState, saveSettings, emit, label }) {
    if (!plan || !isCurrent()) return false;
    const install = () => {
        if (card) card.statusCollections = structuredClone(plan.collections);
        installCollectionChanges(settings, plan.libraryChanges);
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
    if (saveState(next, { label, isCurrent, beforeCommit: install }) !== true) return false;
    if (card || plan.libraryChanged) saveSettings();
    emit(next);
    return true;
}
