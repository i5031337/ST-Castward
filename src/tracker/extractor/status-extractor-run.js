import { startGenerationTask, awaitGenerationRequest } from '../../core/generation-cancellation.js';
import { createExtractionQueue } from './status-extractor-queue.js';
import { prepareSceneLocationReading } from '../../locations/location-reading.js';
import { getAllCharacters } from '../../characters/character-repository.js';
import { getContext } from '../../../../../../st-context.js';
import { getSettings } from '../../core/settings.js';
import { LOG_PREFIX, debugLog } from '../../core/constants.js';
import { loadStateFromMetadata, getCurrentPersonaKey, getCurrentPersonaName, rememberSwipeBase, refreshTurnBase, sanitizeModelUpdate, reconcileScenePresence, applyUpdate } from '../status-logic.js';
import { computeStateDiff, partitionChanges, buildUpdateFromChanges, attachReasons } from '../status-diff.js';
import { setPendingChanges, isItemDecided } from '../status-review.js';
import { recordAppliedChanges } from '../snapshots/status-snapshots.js';
import { setStrangerKinds } from '../../characters/default-portraits.js';
import { triggerReprocess } from '../../chat/reprocess.js';
import { buildExtractionSchema, strangersToClassify } from './status-extractor-schema.js';
import { buildUserPrompt, collectLeadUp } from './status-extractor-prompt.js';
import { requestExtraction, coerceToUpdate } from './status-extractor-request.js';
import { normalizeModelReadings } from './status-extractor-readings.js';
import { prepareGrantReview, validateReviewedTransitions } from '../level-grant-review.js';
import { prepareLevelReading, saveLevelReading, retryLevelReading, LEVEL_READING_KEY } from './status-level-reading.js';
import { startExtractionReport, finishExtractionReport, extractionSwipe } from './status-extraction-report.js';
import { renderExtractionReport } from '../ui/status-ui-report.js';
import { normalizeCollectionUpdates } from './status-collection-normalize.js';
import { replacementReadingState, revertToBase } from '../snapshots/status-snapshot-swipe.js';
import { trackerMessageIndex } from '../ui/status-ui-placement.js';
import { generateNewNpcProfiles } from './status-npc-profiles.js';
import { locationProposalsForReading, partitionLocationRows, resolveLocationRows } from '../../locations/location-runtime.js';

/** The reading currently applying state. */
let activeExtraction = null;
const extractionQueue = createExtractionQueue({
    getContext, getSettings, getCurrentPersonaKey, startGenerationTask, extract: performExtraction,
});

export function isExtractionRunning() { return activeExtraction !== null; }

/** Message ids already extracted, so a re-render does not re-run the request. */
const extractedMessages = new Set();

export function resetExtractionState() {
    extractionQueue.clear();
    activeExtraction?.abort();
    activeExtraction = null;
    extractedMessages.clear();
}

/**
 * Clear extraction guards from an index onward. Message IDs are positions reused by
 * regenerated replies, which must be extracted even if the old reply was already read.
 * @param {string|number} index
 * @returns {number} How many were forgotten.
 */
export function forgetExtractionsFrom(index) {
    const from = Number(index);
    if (!Number.isFinite(from)) return 0;
    extractionQueue.forgetFrom(from);

    let forgotten = 0;
    for (const key of [...extractedMessages]) {
        if (Number(String(key).split(':')[0]) >= from && extractedMessages.delete(key)) {
            forgotten += 1;
        }
    }
    if (forgotten) debugLog(`Forgot ${forgotten} extraction(s) from message ${from} on`);
    return forgotten;
}
/** Report request or parse failures, suppressing repeated warnings until success. */
let lastReportedProblem = '';
function reportExtractionProblem(message) {
    if (message === lastReportedProblem) return;
    lastReportedProblem = message;
    if (typeof toastr !== 'undefined') toastr.warning(message, 'Castward');
}

export function extractStateFromMessage(messageText, messageId, options = {}) {
    return extractionQueue.submit(messageText, messageId, options);
}

async function performExtraction(messageText, messageId, options, signal) {
    if (!getSettings().enabled) return { applied: false, reason: 'extension disabled' };
    const trackerSettings = getSettings().statusTracker;
    if (!trackerSettings.enabled) return { applied: false, reason: 'tracker disabled' };
    if (!options.force && trackerSettings.extractionMode !== 'extract'
        && !(options.manual && trackerSettings.extractionMode === 'manual')) {
        return { applied: false, reason: 'extraction disabled' };
    }
    if (!messageText || !String(messageText).trim()) return { applied: false, reason: 'empty message' };
    if (!options.regenerate && getContext()?.chat?.[Number(messageId)]?.extra?.[LEVEL_READING_KEY]?.failures?.length) {
        return retryLevelReading(messageId);
    }

    // Read each swipe independently.
    const swipeId = getContext()?.chat?.[Number(messageId)]?.swipe_id ?? 0;
    const key = `${messageId}:${swipeId}`;
    const savedReading = getContext()?.chat?.[Number(messageId)]?.extra?.[LEVEL_READING_KEY];
    if (!options.regenerate && savedReading?.swipe === Number(swipeId)
        && savedReading.sourceText === getContext()?.chat?.[Number(messageId)]?.mes) {
        return { applied: false, reason: 'already extracted' };
    }
    if (!options.force && !options.regenerate && extractedMessages.has(key)) return { applied: false, reason: 'already extracted' };

    const canReplace = () => Number(messageId) === trackerMessageIndex(getContext()?.chat || [])
        && replacementReadingState(messageId) !== null;
    if (options.regenerate && !canReplace()) return { applied: false, reason: 'no latest-turn base' };
    const run = startGenerationTask({ signal });
    activeExtraction = run;
    const reportMessage = startExtractionReport(messageId);
    const sourceText = reportMessage?.mes;
    const sourceMetadata = getContext()?.chatMetadata;
    const swipe = extractionSwipe(reportMessage);
    const sourcePersona = getCurrentPersonaKey();
    const sourceSystem = getSettings().activeSystem;
    const sourceIsCurrent = () => getSettings().enabled && getSettings().statusTracker.enabled
        && !run.signal.aborted && activeExtraction === run && getContext()?.chatMetadata === sourceMetadata
        && getContext()?.chat?.[Number(messageId)] === reportMessage
        && reportMessage?.mes === sourceText && extractionSwipe(reportMessage) === swipe
        && getCurrentPersonaKey() === sourcePersona && getSettings().activeSystem === sourceSystem;
    const staleResult = () => ({ applied: false, reason: run.signal.aborted ? 'cancelled' : !getSettings().enabled
        || !getSettings().statusTracker.enabled || activeExtraction !== run
        ? 'extension disabled' : 'reply changed while reading' });
    let report = { swipe, status: 'failed', summary: 'The request did not complete', output: null };
    const refreshReport = () => {
        try {
            const mesEl = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
            if (mesEl) renderExtractionReport(mesEl, messageId);
        } catch (err) {
            console.warn(LOG_PREFIX, 'Could not draw the reader report.', err);
        }
    };
    refreshReport();
    try {
        const state = options.regenerate ? replacementReadingState(messageId) : loadStateFromMetadata();
        const locationBase = state.locations?.enabled ? { locations: structuredClone(state.locations) } : null;
        // Before anything is applied. A later swipe of this message rebuilds from here
        // rather than from what this one leaves behind.
        rememberSwipeBase(messageId, state);
        const strangers = strangersToClassify(messageId);
        const schema = buildExtractionSchema(trackerSettings, { strangers, state, cards: getAllCharacters() });
        const leadUp = collectLeadUp(messageId, Number(trackerSettings.extractionContextMessages ?? 2));
        const userPrompt = buildUserPrompt(state, String(messageText), trackerSettings, leadUp, { strangers });

        debugLog('Extraction request for message', key);
        const raw = await requestExtraction(userPrompt, schema, trackerSettings);
        if (!sourceIsCurrent()) return staleResult();

        const parsed = coerceToUpdate(raw);
        if (!parsed || typeof parsed !== 'object') {
            report = { swipe, status: 'failed', summary: 'The reply could not be read', output: raw ?? null };
            console.warn(LOG_PREFIX, 'Extraction returned nothing usable; state left unchanged.', raw);
            // Distinguish a failed reading from a story turn that changed nothing.
            reportExtractionProblem(
                'The reader replied with something that could not be read, so nothing was '
                + 'changed. A smaller or faster model is the usual cause; expand the tracker '
                + 'reading under this reply to see the full output.',
            );
            return { applied: false, reason: 'unparseable' };
        }
        // Keep the reader's complete answer before sanitizing it or adding level bonuses.
        // Those steps change the object in place, and the original is what explains the
        // reader's decisions, including values the tracker later refuses.
        const readerOutput = structuredClone(parsed);
        const locationReading = await prepareSceneLocationReading({
            state: locationBase, locationChanged: parsed.locationChanged,
            messageText: String(messageText), earlier: leadUp, trackerSettings,
            playerName: state.player?.name || getCurrentPersonaName(),
            isCurrent: () => sourceIsCurrent() && Number(messageId) === trackerMessageIndex(getContext()?.chat || [])
                && loadStateFromMetadata().locations?.enabled === true,
        });
        if (!sourceIsCurrent()) return staleResult();
        const liveState = options.regenerate ? replacementReadingState(messageId) : loadStateFromMetadata();
        if (!liveState || (options.regenerate && !canReplace())) return { applied: false, reason: 'reply changed while reading' };
        const warnings = [...(locationReading?.warnings || []),
            ...normalizeCollectionUpdates(parsed, trackerSettings, liveState, getAllCharacters())];
        normalizeModelReadings(parsed, liveState, trackerSettings, { cards: getAllCharacters(), warnings });
        // No ceilings the stats do not have, and nothing for a locked stat. See
        // sanitizeModelUpdate.
        sanitizeModelUpdate(parsed, liveState, trackerSettings, { warnings });
        const grants = await prepareLevelReading(parsed, liveState, trackerSettings,
            String(messageText), leadUp, reportMessage, messageId, options);
        run.signal.throwIfAborted();
        if (!sourceIsCurrent() || grants.reading.personaId !== getCurrentPersonaKey()
            || (options.manual && Number(messageId) !== trackerMessageIndex(getContext()?.chat || []))) {
            return { applied: false, reason: 'reply changed while reading' };
        }

        const freshState = options.regenerate ? replacementReadingState(messageId) : loadStateFromMetadata();
        const freshness = validateReviewedTransitions(grants.transitions.map(transition => ({
            scope: transition.scope, actor: transition.actor, transition,
        })), freshState, getSettings().statusTracker, getAllCharacters(), getCurrentPersonaKey());
        if (freshness.invalid.size) return { applied: false, reason: 'progression changed while reading' };

        if (options.regenerate) {
            if (!canReplace()) return { applied: false, reason: 'reply changed while reading' };
            if (!revertToBase(messageId).reverted) throw new Error('The previous tracker state is unavailable');
            // Applied rows append during review; a replacement starts a fresh record.
            delete reportMessage.extra.sillynpc_applied;
        }
        refreshTurnBase(messageId);
        // Presence first: applyUpdate refuses to introduce characters in speakers mode,
        // so anyone the extraction reports must be admitted to the scene before their
        // stats can land.
        if (Array.isArray(parsed.characters)) {
            const names = parsed.characters.filter(c => !c?.offstage).map(c => c?.name).filter(Boolean);
            // The prompt asks for everyone present, not just whoever changed, so this
            // list is complete and absence means departure.
            reconcileScenePresence(names, messageId, { authoritative: true });
        }

        // Classify newly encountered NPCs before redrawing their portraits.
        if (strangers.length && setStrangerKinds(parsed.strangers, strangers)) {
            debugLog('Strangers\' kinds', parsed.strangers);
            triggerReprocess();
        }

        // Propose, then decide. A dry run says what the update would do, so additions,
        // removals and implausible jumps can be held back for a look rather than
        // becoming fact.
        const currentState = loadStateFromMetadata();
        const diagnostics = { refusedValues: [], collectionWarnings: [] };
        const wouldBe = applyUpdate(parsed, { dryRun: true, admitCharacters: true, warnings, diagnostics, messageId });
        if (!wouldBe) return staleResult();
        warnings.push(...diagnostics.collectionWarnings);
        const refused = diagnostics.refusedValues.map(({ field, wanted, allowed, kept }) =>
            `${field}: "${wanted}" is not one of ${allowed.join(', ')} - kept "${kept}"`);
        if (refused.length) debugLog('Values refused by their allowed lists', refused);
        const proposed = computeStateDiff(currentState, wouldBe, trackerSettings);
        // Standing item decisions constrain both automatic and reviewed changes.
        const changes = proposed.filter(change => !isItemDecided(change));
        const blocked = proposed.length - changes.length;

        // The reader's own account of what it did, put on the rows it explains. Never part
        // of the state: applyUpdate reads only the keys it knows, so "why" is inert there,
        // and it is read here instead.
        const unmatched = attachReasons(changes, parsed.why);
        if (parsed.why && Object.keys(parsed.why).length) {
            debugLog('Why the reader changed things', parsed.why);
        }

        const { auto, pending } = partitionChanges(changes, trackerSettings);
        prepareGrantReview(auto, pending, grants.transitions);
        pending.push(...grants.rows.filter(change => !isItemDecided(change)));
        let automaticPlaces = [];
        if (locationReading?.output && currentState.locations?.enabled) {
            const places = locationProposalsForReading(locationBase, locationReading.output, messageId);
            const placeReview = partitionLocationRows(places.rows, trackerSettings);
            automaticPlaces = placeReview.auto;
            pending.push(...placeReview.pending);
            warnings.push(...places.warnings);
        }

        // Rebuild surviving rows when review or standing decisions filter the update.
        if (pending.length === 0 && blocked === 0) {
            if (!applyUpdate(parsed, { partOfMessage: true, admitCharacters: true, messageId })) return staleResult();
        } else if (auto.length > 0) {
            // Apply the uncontroversial part now so the tracker stays current while the
            // rest waits.
            if (!applyUpdate(buildUpdateFromChanges(auto, currentState, trackerSettings),
                { partOfMessage: true, progressionResolved: true, admitCharacters: true, messageId })) return staleResult();
        }

        // Record quiet readings too, distinguishing them from unread replies.
        const applied = pending.length === 0 ? changes : auto;
        recordAppliedChanges(messageId, applied);
        const placeResult = automaticPlaces.length
            ? resolveLocationRows(messageId, automaticPlaces, automaticPlaces, { automatic: true, discardAll: true })
            : { applied: 0, warnings: [] };
        warnings.push(...placeResult.warnings);

        saveLevelReading(reportMessage, grants.reading);
        setPendingChanges(messageId, pending, unmatched, refused);
        if (pending.length > 0) {
            debugLog(`${pending.length} change(s) awaiting review on message ${key}`);
        }

        extractedMessages.add(key);
        const appliedCount = auto.length + placeResult.applied;
        const parts = [
            `${appliedCount} applied`,
            `${pending.length} awaiting review`,
        ];
        if (warnings.length) parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
        if (grants.failures.length) parts.push(`${grants.failures.length} level-up choices failed; retry rewards`);
        if (blocked) parts.push(`${blocked} blocked by standing decisions`);
        report = { swipe, status: 'done', summary: parts.join(' · '), output: readerOutput, warnings, ...(locationReading ? { locationReading } : {}) };
        // Save the reading before the additional lore requests, so changing chats or
        // replies during profile generation cannot lose applied rows or review proposals.
        const profiles = await awaitGenerationRequest(generateNewNpcProfiles(
            (parsed.characters || []).map(character => character?.name).filter(Boolean),
            () => getSettings().enabled && !run.signal.aborted && activeExtraction === run
                && getContext()?.chatMetadata === sourceMetadata
                && getContext()?.chat?.[Number(messageId)] === reportMessage
                && reportMessage?.mes === sourceText
                && extractionSwipe(reportMessage) === swipe
                && Number(messageId) === trackerMessageIndex(getContext()?.chat || []), run.signal,
        ), run.signal);
        if (profiles.generated) parts.push(`${profiles.generated} NPC profile(s) generated`);
        if (profiles.failed) parts.push(`${profiles.failed} NPC profile(s) failed`);
        report.summary = parts.join(' · ');
        // Cleared on success so a later failure is announced rather than swallowed as a
        // repeat of one the user has already dealt with.
        lastReportedProblem = '';
        debugLog('Extraction applied for message', key);
        return { applied: true, pending: pending.length };
    } catch (err) {
        if (run.signal.aborted || err?.name === 'AbortError') {
            if (report.status === 'done') {
                report.summary += ' · Follow-up generation cancelled';
                return { applied: true, cancelled: true };
            }
            report = { ...report, status: 'cancelled', summary: 'Cancelled' };
            return { applied: false, reason: 'cancelled' };
        }
        report = { ...report, status: 'failed', summary: String(err?.message || err),
            output: err?.output ?? report.output };
        console.error(LOG_PREFIX, 'Extraction failed; state left unchanged.', err);
        reportExtractionProblem(`The tracker could not read this message: ${err?.message || err}`);
        return { applied: false, reason: String(err?.message || err) };
    } finally {
        if (run.signal.aborted && report.status !== 'done') {
            report = { ...report, status: 'cancelled', summary: 'Cancelled' };
        }
        run.finish();
        finishExtractionReport(messageId, reportMessage, report);
        if (activeExtraction === run) activeExtraction = null;
        refreshReport();
    }
}
