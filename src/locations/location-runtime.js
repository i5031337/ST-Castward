import { getContext } from '../../../../../st-context.js';
import { eventSource } from '../../../../../events.js';
import { loadStateFromMetadata, saveStateToMetadata, refreshTurnBase } from '../tracker/status-logic.js';
import { recordAppliedChanges } from '../tracker/snapshots/status-snapshot-records.js';
import { trackerMessageIndex } from '../tracker/ui/status-ui-placement.js';
import { partitionChanges } from '../tracker/status-diff-review.js';
import { buildLocationProposals, applyLocationReview } from './location-proposals.js';

/** Keep movement behind any new destination card awaiting review. */
export function partitionLocationRows(rows, settings) {
    const { auto, pending } = partitionChanges(rows, settings);
    const newPendingIds = new Set(pending.filter(row => row.kind === 'location-create').map(row => row.location.id));
    const dependent = auto.filter(row => row.kind === 'location-current' && newPendingIds.has(row.location.id));
    return { auto: auto.filter(row => !dependent.includes(row)), pending: [...pending, ...dependent] };
}

/** Keep source identities internal; the reader supplies only place facts. */
export function locationProposalsForReading(state, output, messageId) {
    const context = getContext();
    const message = context?.chat?.[Number(messageId)];
    return buildLocationProposals(state, output, {
        provenance: {
            chatId: String(context?.getCurrentChatId?.() ?? ''),
            messageId: Number(messageId),
            swipe: Number(message?.swipe_id ?? 0),
            text: String(message?.mes ?? ''),
        },
    });
}

/** Reviewed discoveries can be saved later; movement must still describe today's scene. */
export function resolveLocationRows(messageId, pending, accepted, { discardAll = false, automatic = false } = {}) {
    const context = getContext();
    const current = Number(messageId) === trackerMessageIndex(context?.chat || []);
    const result = applyLocationReview(loadStateFromMetadata(), pending, accepted, {
        isSourceCurrent: (source, row) => {
            const message = context?.chat?.[source?.messageId];
            return source?.chatId === String(context?.getCurrentChatId?.() ?? '')
                && source?.messageId === Number(messageId)
                && message && source.text === String(message.mes ?? '')
                && source.swipe === Number(message.swipe_id ?? 0)
                && (row.kind !== 'location-current' || current);
        },
    });
    if (result.appliedRows.length) {
        // Historical discoveries are manual corrections. The latest reply's accepted
        // places instead participate in its existing replacement/undo machinery.
        if (current) refreshTurnBase(messageId);
        saveStateToMetadata(result.state, { label: automatic ? 'Recognized places' : 'Reviewed places', partOfMessage: current });
        if (current) recordAppliedChanges(messageId, result.appliedRows);
        eventSource.emit('sillynpc-status-updated', result.state);
    }
    const attempted = new Set((accepted || []).map(row => row.id));
    const applied = new Set(result.appliedRows.map(row => row.id));
    const remaining = discardAll ? [] : pending.filter(row => row.scope === 'location'
        && attempted.has(row.id) && !applied.has(row.id));
    for (const row of remaining) {
        row.reason = result.warnings.find(warning => warning.startsWith(`${row.actor}:`))
            || 'Still pending: accept required places and check whether the source or saved details changed.';
    }
    return {
        applied: result.appliedRows.length,
        warnings: result.warnings,
        remaining,
    };
}
