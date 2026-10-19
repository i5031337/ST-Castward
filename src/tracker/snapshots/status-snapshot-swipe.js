import { debugLog } from '../../core/constants.js';
import { getContext } from '../../../../../../st-context.js';
import { loadStateFromMetadata, saveStateToMetadata, getSwipeBase, swipeBaseRecord, getProfileBase, restoreProfiles, snapshotProfiles } from '../status-logic.js';
import { getAppliedChanges, appliedChangesForCurrentSwipe } from './status-snapshot-records.js';
import { applyRows } from './status-row-replay.js';
import { diffTurnValues, applyTurnValues, turnEffectStatus } from './status-turn-delta.js';
import { syncRebasedLore } from './status-rebase-lore.js';

/** Preview a replacement reading without changing live state while its request runs. */
export function replacementReadingState(messageId) {
    const record = swipeBaseRecord();
    if (!record || record.messageId !== String(messageId)) return null;
    if (!record.applied) return getSwipeBase(messageId);
    const current = loadStateFromMetadata();
    const state = applyTurnValues(structuredClone(record.state),
        diffTurnValues(record.applied.state, current));
    preserveEditedPlaces(state, record.applied.state, current);
    return state;
}

/** A manual edit adopts a discovered place even if another reply omits it. */
function preserveEditedPlaces(state, applied, current) {
    const previous = applied?.locations?.records || {};
    const records = current?.locations?.records || {};
    const kept = [];
    for (const [id, place] of Object.entries(records)) {
        if (state.locations?.records?.[id] || !previous[id]
            || JSON.stringify(place) === JSON.stringify(previous[id])) continue;
        state.locations ||= { enabled: current.locations.enabled, currentId: '', records: {} };
        state.locations.records ||= {};
        state.locations.records[id] = structuredClone(place);
        kept.push(id);
    }
    // A corrected child does not adopt its otherwise untouched discovered parent.
    for (const id of kept) {
        const place = state.locations.records[id];
        if (place.parentId && !state.locations.records[place.parentId]) place.parentId = '';
    }
}

/** Rebuilds the chosen reply and carries corrections made after the outgoing one. */
function rebaseRecordedTurn(messageId, { removed = false } = {}) {
    const record = swipeBaseRecord();
    if (!record || record.messageId !== String(messageId) || !record.applied) return null;
    const current = loadStateFromMetadata();
    const profilesNow = snapshotProfiles();
    const manualState = diffTurnValues(record.applied.state, current);
    const manualProfiles = diffTurnValues(record.applied.profiles, profilesNow);
    const message = getContext()?.chat?.[Number(messageId)];
    const effects = removed ? null : message?.extra?.sillynpc_turn_effects;
    const effectStatus = turnEffectStatus(effects, message);
    if (effectStatus === 'mismatch') return { rebased: false, reason: 'reply changed' };
    const valid = effectStatus === 'valid';

    let replyState = structuredClone(record.state);
    let replyProfiles = structuredClone(record.profiles);
    if (valid) {
        replyState = applyTurnValues(replyState, effects.state);
        replyProfiles = applyTurnValues(replyProfiles, effects.profiles);
    } else if (!removed) {
        // Saved replies written before turn effects still have stat/item rows.
        applyRows(replyState, appliedChangesForCurrentSwipe(messageId) || []);
    }
    const state = applyTurnValues(replyState, manualState);
    preserveEditedPlaces(state, record.applied.state, current);
    const profiles = applyTurnValues(replyProfiles, manualProfiles);
    const changedProfiles = restoreProfiles(profiles);
    saveStateToMetadata(state, { recordHistory: false });
    syncRebasedLore(current, state, changedProfiles);
    record.applied = { state: replyState, profiles: replyProfiles };
    return removed
        ? { reverted: true, reason: 'back to the base' }
        : { rebased: true, reason: valid ? 'restored' : 'back to the base' };
}

/**
 * Carry manual corrections into legacy swipe bases for values the reply did not touch.
 * Touched values retain their original base so switching replies still undoes them.
 * This uses recorded rows because some editors mutate live state in place.
 * @returns {number} How many values were brought up to date.
 */
export function alignSwipeBaseToNow() {
    const record = swipeBaseRecord();
    if (!record?.state) return 0;
    // New turn records track corrections as the difference from the applied reply.
    if (record.applied) return 0;

    const base = record.state;
    const now = loadStateFromMetadata();
    if (!now) return 0;

    /* Two questions, and they have different answers.

       Is there a record at all? An absent one means the message predates this feature, or
       Record What Each Message Changed is off - and then there is no way to tell what the
       reply did from what somebody corrected afterwards. Aligning on that guess would fold
       the reply's own changes into the base and stop the swipe undoing anything, which is a
       far worse bug than the one this fixes. So: refuse.

       And what did the reply now on screen do? A record stamped for another reply answers
       that with nothing, and nothing is the truth: a rebase has just put the state back to
       the base, so the on-screen reply has changed nothing yet and everything that differs
       from the base is a correction. An empty array is the same answer for a message that
       genuinely changed nothing. */
    if (getAppliedChanges(record.messageId) === null) return 0;
    const rows = appliedChangesForCurrentSwipe(record.messageId) ?? [];

    // What the message changed, and therefore what the base must go on saying.
    const touched = new Set();
    for (const row of rows) {
        const who = `${row.scope}|${String(row.actor ?? '').toLowerCase()}`;
        touched.add(row.collectionId
            ? `${who}|col|${row.collectionId}`
            : `${who}|stat|${row.label}`);
    }

    let moved = 0;

    // Effectless legacy replies could not own place changes. Carry later manual
    // place edits into their base, just like the existing actor corrections.
    if (JSON.stringify(base.locations) !== JSON.stringify(now.locations)) {
        if (now.locations === undefined) delete base.locations;
        else base.locations = structuredClone(now.locations);
        moved += 1;
    }

    const alignStats = (who, from, to) => {
        const source = from || {};
        for (const [name, value] of Object.entries(source)) {
            if (touched.has(`${who}|stat|${name}`) || to[name] === value) continue;
            to[name] = value;
            moved += 1;
        }
        // A stat deleted by hand goes from the base too, or the swipe brings it back.
        for (const name of Object.keys(to)) {
            if (name in source || touched.has(`${who}|stat|${name}`)) continue;
            delete to[name];
            moved += 1;
        }
    };

    const alignCollections = (who, from, to) => {
        for (const [id, list] of Object.entries(from || {})) {
            if (touched.has(`${who}|col|${id}`)) continue;
            // Compared as text: these are small lists of plain objects, and the alternative
            // is a deep-equality helper that exists nowhere else in this file.
            if (JSON.stringify(to[id]) === JSON.stringify(list)) continue;
            to[id] = structuredClone(list);
            moved += 1;
        }
    };

    base.global ||= {};
    alignStats('global|', now.global, base.global);

    if (now.player) {
        base.player ||= { name: now.player.name, stats: {}, collections: {} };
        base.player.stats ||= {};
        base.player.collections ||= {};
        alignStats('player|', now.player.stats, base.player.stats);
        alignCollections('player|', now.player.collections, base.player.collections);
    }

    base.characters ||= [];
    for (const char of now.characters || []) {
        const key = String(char?.name ?? '').trim().toLowerCase();
        if (!key) continue;

        let target = base.characters.find(c => String(c?.name ?? '').toLowerCase() === key);
        if (!target) {
            /* Somebody the message introduced has rows of their own, and putting them in
               the base would mean a swipe could no longer remove them. Only somebody who
               arrived by hand belongs here. */
            const fromThisMessage = [...touched].some(k => k.startsWith(`character|${key}|`));
            if (fromThisMessage) continue;
            target = { name: char.name, stats: {}, collections: {} };
            base.characters.push(target);
            moved += 1;
        }
        target.stats ||= {};
        target.collections ||= {};
        alignStats(`character|${key}`, char.stats, target.stats);
        alignCollections(`character|${key}`, char.collections, target.collections);
    }

    if (moved) debugLog(`Swipe base kept in step with ${moved} change(s) made outside a reply`);
    return moved;
}

/**
 * Rebuild from the pre-turn base and replay the selected swipe's recorded changes.
 * A swipe without a record leaves the base ready for extraction.
 * @param {string|number} messageId
 * @returns {{ rebased: boolean, reason: string }}
 */
export function rebaseToSwipe(messageId) {
    const recorded = rebaseRecordedTurn(messageId);
    if (recorded) return recorded;
    const base = getSwipeBase(messageId);
    if (!base) {
        // Missing after a reload, or for a message written before this existed. Applying
        // the chosen swipe's changes on top of the state as it stands would double-count
        // the swipe already in it, which is the fault this exists to prevent.
        return { rebased: false, reason: 'no base' };
    }

    // Profiles first: they live on the card rather than in the state, so the clone below
    // cannot carry them and a rewritten personality would otherwise outlive the reply that
    // wrote it. Deliberately not part of applyRows - that also builds the read-only history
    // view, and writing to settings from there would rewrite every card on a scroll.
    const previous = loadStateFromMetadata();
    const changedProfiles = restoreProfiles(getProfileBase(messageId));

    const rows = appliedChangesForCurrentSwipe(messageId) || [];
    const state = structuredClone(base);
    applyRows(state, rows);

    saveStateToMetadata(state, { recordHistory: false });
    syncRebasedLore(previous, state, changedProfiles);
    debugLog(`Rebased onto swipe of message ${messageId}: ${rows.length} change(s)`);
    return { rebased: true, reason: rows.length ? 'restored' : 'back to the base' };
}

/**
 * Restore the base without replaying rows when a message is removed or regenerated.
 * Keep the base: a regenerated reply reuses the removed message's index.
 * @param {string|number} messageId
 * @returns {{ reverted: boolean, reason: string }}
 */
export function revertToBase(messageId) {
    const recorded = rebaseRecordedTurn(messageId, { removed: true });
    if (recorded) return recorded;
    const base = getSwipeBase(messageId);
    // Same refusal as rebaseToSwipe: without a known starting point the only alternative is
    // to invent one, and a wrong revert throws away state silently.
    if (!base) return { reverted: false, reason: 'no base' };

    const previous = loadStateFromMetadata();
    const changedProfiles = restoreProfiles(getProfileBase(messageId));
    saveStateToMetadata(base, { recordHistory: false });
    syncRebasedLore(previous, base, changedProfiles);
    debugLog(`Reverted to the state before message ${messageId}`);
    return { reverted: true, reason: 'back to the base' };
}
