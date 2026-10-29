import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../../../../popup.js';
import { eventSource, event_types } from '../../../../../../events.js';

/** Wait for a target so any pending lorebook write can resume in place. */
export async function chooseChatLorebook({ names, proposedName, onChoose, isCurrent, signal, purpose = 'Save lore', skipLabel = 'Skip this write', attachment = 'this chat' }) {
    if (!isCurrent() || signal?.aborted) return '';
    const content = document.createElement('div');
    content.className = 'sillynpc-chat-lorebook-picker';
    const heading = document.createElement('h3');
    heading.textContent = 'Choose a lorebook to continue';
    const note = document.createElement('p');
    note.textContent = `${purpose} is waiting for a lorebook. Select an existing book or create one, then resume. `
        + `The book will be used for ${attachment}. Your automatic creation setting will stay unchanged.`;
    const label = document.createElement('label');
    label.textContent = 'Lorebook';
    const select = document.createElement('select');
    select.className = 'text_pole';
    const create = document.createElement('option');
    create.value = '';
    create.textContent = `Create ${proposedName}`;
    select.append(create);
    for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.append(option);
    }
    label.append(select);
    const error = document.createElement('p');
    error.className = 'notes sillynpc-lorebook-choice-error';
    error.setAttribute('role', 'alert');
    content.append(heading, note, label, error);
    let selected = '', busy = false, cancelled = false;
    const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Create and resume', cancelButton: skipLabel,
        onClosing: async dialog => {
            if (dialog.result !== POPUP_RESULT.AFFIRMATIVE) { cancelled = true; return true; }
            if (busy) return false;
            if (!isCurrent() || signal?.aborted) return true;
            busy = true;
            select.disabled = true;
            dialog.okButton.classList.add('disabled');
            error.textContent = '';
            try {
                const name = await onChoose(select.value, () => !cancelled && isCurrent() && !signal?.aborted);
                if (!cancelled && isCurrent() && !signal?.aborted) {
                    if (!name) throw new Error('Could not select a lorebook. Please try again.');
                    selected = name;
                }
                // A cancellation may already be closing the dialog while the save finishes.
                return !cancelled;
            } catch (err) {
                error.textContent = err.message || String(err);
                return false;
            } finally {
                busy = false;
                select.disabled = false;
                dialog.okButton.classList.remove('disabled');
            }
        },
    });
    select.addEventListener('change', () => {
        popup.okButton.textContent = select.value ? 'Use and resume' : 'Create and resume';
    });
    const cancel = () => { cancelled = true; void popup.completeCancelled(); };
    const events = [event_types.CHAT_CHANGED, event_types.PERSONA_CHANGED, event_types.GENERATION_STOPPED];
    events.forEach(event => eventSource.on(event, cancel));
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        await popup.show();
        return !cancelled && isCurrent() && !signal?.aborted ? selected : '';
    } finally {
        events.forEach(event => eventSource.removeListener(event, cancel));
        signal?.removeEventListener('abort', cancel);
    }
}
