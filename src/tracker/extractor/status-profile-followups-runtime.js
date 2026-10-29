import { getContext } from '../../../../../../st-context.js';
import { getSettings } from '../../core/settings.js';
import { startGenerationTask, awaitGenerationRequest } from '../../core/generation-cancellation.js';
import { getCurrentPersonaKey } from '../status-logic.js';
import { getPendingChanges } from '../status-review.js';
import { saveChatSoon } from '../snapshots/status-snapshot-records.js';
import { trackerMessageIndex } from '../ui/status-ui-placement.js';
import { renderExtractionReport } from '../ui/status-ui-report.js';
import { lockTrackerEdits } from '../tracker-edit-lock.js';
import { readerRuleSignature } from './status-extractor-rules.js';
import { generateNewNpcProfiles } from './status-npc-profiles.js';
import { createNpcProfileFollowups } from './status-profile-followups.js';

export const npcProfileFollowups = createNpcProfileFollowups({
    getContext, getSettings, getPersona: getCurrentPersonaKey, latestIndex: trackerMessageIndex,
    ruleSignature: readerRuleSignature, pendingChanges: getPendingChanges,
    async generate(names, isCurrent, signal) {
        const task = startGenerationTask({ signal, getPersonaKey: getCurrentPersonaKey });
        const unlock = lockTrackerEdits(task.signal);
        try {
            return await awaitGenerationRequest(generateNewNpcProfiles(names,
                () => !task.signal.aborted && isCurrent(), task.signal), task.signal);
        } finally { unlock(); task.finish(); }
    },
    onChange(messageId) {
        saveChatSoon();
        const element = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        try { if (element) renderExtractionReport(element, messageId); }
        catch (error) { console.warn('Castward: Could not refresh profile follow-up status', error); }
    },
});
