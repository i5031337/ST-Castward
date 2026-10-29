import { installCollectionChanges } from './collection-pipeline.js';

/** Capture identity and readings used by a calculation without retaining mutable revisions. */
export function captureTrackerOwner(snapshot) {
    return { ...snapshot, stateRevision: JSON.stringify(snapshot.state),
        trackerRevision: JSON.stringify(snapshot.tracker), systemRevision: JSON.stringify(snapshot.system),
        sourceMessage: snapshot.sourceMessage ? { ...snapshot.sourceMessage } : null };
}

/** A calculated plan belongs only to the same live chat, persona, rules and source. */
export function trackerOwnerIsCurrent(owner, current) {
    if (owner.chatId === undefined || !owner.metadata || !owner.state
        || current.chatId !== owner.chatId || current.metadata !== owner.metadata
        || current.personaKey !== owner.personaKey || current.systemKey !== owner.systemKey
        || current.system !== owner.system || current.tracker !== owner.tracker
        || current.state !== owner.state || current.storedState !== owner.storedState
        || JSON.stringify(current.state) !== owner.stateRevision
        || JSON.stringify(current.tracker) !== owner.trackerRevision
        || JSON.stringify(current.system) !== owner.systemRevision) return false;
    if (owner.state.player?.personaKey && owner.state.player.personaKey !== owner.personaKey) return false;
    if (owner.boundSystemKey && owner.boundSystemKey !== owner.systemKey) return false;
    if (current.boundSystemKey !== owner.boundSystemKey) return false;
    const source = owner.sourceMessage;
    if (!source) return current.sourceMessage == null;
    const live = current.sourceMessage;
    return !!source.message && !!live && live.index === source.index && live.message === source.message
        && live.text === source.text && live.swipeId === source.swipeId;
}

/** Install related effects only after storage accepts the owner; host saves remain separate. */
export function commitTrackerUpdate({ owner, calculated, cards, settings, readCurrent,
    saveState, saveSettings, emit, options = {} }) {
    const isCurrent = () => trackerOwnerIsCurrent(owner, readCurrent());
    if (!isCurrent()) return null;
    const accepted = saveState(calculated.nextState, { ...options, isCurrent, beforeCommit: () => {
        for (const { cardIndex, fields } of calculated.cardChanges) Object.assign(cards[cardIndex], fields);
        installCollectionChanges(settings, calculated.libraryChanges);
    } });
    if (accepted !== true) return null;
    if (calculated.cardChanges.length || calculated.libraryChanges.length) saveSettings();
    emit(calculated.nextState);
    return calculated.nextState;
}
