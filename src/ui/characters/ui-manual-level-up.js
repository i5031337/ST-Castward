import { manualLevelUps } from '../../tracker/manual-level-ups.js';
import { renderReviewPanel } from '../tracker/ui-change-review.js';
import { bindTrackerEditor, isTrackerEditLocked } from '../../tracker/tracker-edit-lock.js';

const LEVEL_UP_HELP = 'Advance one level, keep current XP, and review configured skill points and collection rewards.';

/** Card-owned controls; rewards stay with their chat rather than a story reply. */
export function buildManualLevelUpSection(card, { onChange = () => {}, service = manualLevelUps } = {}) {
    const section = document.createElement('section'); section.className = 'sillynpc-manual-level-up';
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'menu_button sillynpc-trigger-level-up'; button.textContent = 'Trigger Level-up';
    const info = service.info(card.id);
    button.disabled = !info.enabled || service.isBusy(card.id);
    button.title = info.reason || LEVEL_UP_HELP;
    const retryButtons = [];
    const refreshControls = () => {
        const info = service.info(card.id);
        button.disabled = isTrackerEditLocked() || !info.enabled || service.isBusy(card.id);
        if (!isTrackerEditLocked()) button.title = info.reason || LEVEL_UP_HELP;
        for (const retry of retryButtons) retry.disabled = isTrackerEditLocked() || service.isBusy(card.id);
    };
    const run = async action => {
        if (isTrackerEditLocked()) return;
        button.disabled = true;
        try { await action(); onChange(); }
        catch (error) { globalThis.toastr?.warning(error.message || String(error), 'Castward'); }
        finally { if (button.isConnected) refreshControls(); }
    };
    button.addEventListener('click', () => run(async () => {
        const record = await service.trigger(card.id);
        globalThis.toastr?.success(`${card.name} is now level ${record.newLevel}.`
            + (record.pending.length || record.failures.length ? ' Review the rewards below.' : ''), 'Castward');
    }));
    section.append(button);
    if (!info.enabled) {
        const reason = document.createElement('small'); reason.className = 'notes'; reason.textContent = info.reason;
        section.append(reason);
    }
    for (const record of service.records(card.id)) {
        const group = document.createElement('div'); group.className = 'sillynpc-manual-level-up-review';
        const heading = document.createElement('strong'); heading.textContent = `Level ${record.oldLevel} → ${record.newLevel}`;
        group.append(heading);
        renderReviewPanel(group, record.id, {
            getPendingChanges: () => service.records(card.id).find(current => current.id === record.id)?.pending || [],
            resolvePendingChanges: (_id, accepted, _dismissed, options) => {
                const result = service.resolve(card.id, record.id, accepted, options); onChange(); return result;
            },
        });
        if (record.failures.length) {
            const note = document.createElement('small'); note.textContent = 'Some collection rewards could not be selected.';
            const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'menu_button sillynpc-manual-level-up-retry';
            retryButtons.push(retry);
            retry.textContent = 'Retry missing rewards'; retry.disabled = service.isBusy(card.id);
            retry.addEventListener('click', async () => {
                if (isTrackerEditLocked()) return;
                retry.disabled = true;
                await run(() => service.retry(card.id, record.id));
                if (retry.isConnected) refreshControls();
            });
            group.append(note, retry);
        }
        section.append(group);
    }
    bindTrackerEditor(section, '.sillynpc-trigger-level-up, .sillynpc-manual-level-up-retry', refreshControls);
    return section;
}
