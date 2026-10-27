/** Coordinate host activation without letting an old restore write into a newer chat. */
export function createTrackerLifecycle({ readSession, clearState, restoreSystem, restoreRoster,
    restorePersona, recordedPersona, currentPersona, loadState, selectPersona, saveState,
    rememberPersona, refresh }) {
    let revision = 0;
    let restoring = null;
    let restoreTail = null;
    const sameChat = owner => {
        const live = readSession();
        return live.chatId === owner.chatId && live.metadata === owner.metadata;
    };
    const sameOwner = owner => sameChat(owner) && readSession().systemKey === owner.systemKey;

    async function activateChat() {
        const run = ++revision;
        clearState();
        const initial = readSession();
        if (initial.chatId === undefined || !initial.metadata) return false;

        // Rules and roster must be ready before any player values are loaded.
        restoreSystem();
        if (run !== revision || !sameChat(initial)) return false;
        restoreRoster();
        if (run !== revision || !sameChat(initial)) return false;
        const owner = readSession();
        const isCurrent = () => run === revision && sameOwner(owner);
        const previous = restoreTail;
        let restore;
        // Host avatar changes cannot be cancelled once started. Keep their owner until
        // completion, and let the next chat restore its persona after that work ends.
        const pending = (async () => {
            if (previous) await previous.catch(() => {});
            if (!isCurrent()) return false;
            restore = { owner, personaKey: recordedPersona() };
            restoring = restore;
            try {
                return await restorePersona(isCurrent);
            } finally {
                if (restoring === restore) restoring = null;
            }
        })();
        restoreTail = pending;
        let restored;
        try {
            restored = await pending;
        } finally {
            if (restoreTail === pending) restoreTail = null;
        }
        if (!isCurrent() || restored && currentPersona().key !== restore.personaKey) return false;
        const state = loadState();
        if (!isCurrent()) return false;
        refresh(state);
        return true;
    }

    function activatePlayer() {
        const owner = readSession();
        if (owner.chatId === undefined || !owner.metadata) return false;
        const persona = currentPersona();
        // setUserAvatar emits PERSONA_CHANGED while the chat restore is still pending.
        // The activation above owns the subsequent load and redraw.
        if (restoring && restoring.personaKey === persona.key) return false;
        ++revision;
        const state = loadState();
        const changed = selectPersona(state, persona.key, persona.name);
        if (!sameOwner(owner)) return false;
        if (changed && saveState(state, { label: 'Persona changed' }) !== true) return false;
        rememberPersona();
        if (changed) refresh(state);
        return changed;
    }

    return { activateChat, activatePlayer };
}
