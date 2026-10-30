import { Popup, POPUP_TYPE } from '../../../../../../popup.js';
import { getSettings, saveSettings } from '../../core/settings.js';

/** Explain profile and image requests before Fill or automatic NPC creation. */
export async function confirmGenerationNotice(action) {
    const settings = getSettings();
    if (settings.generationNoticeDismissed) return true;

    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-generation-notice';
    const message = document.createElement('p');
    message.textContent = `${action} may send an LLM request and an image generation request. `
        + 'Each may incur charges. Turn off automatic portraits under Profiles → Draw Portrait Automatically.';
    const label = document.createElement('label');
    label.className = 'sillynpc-generation-notice-choice';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    label.append(checkbox, document.createTextNode(' Don’t show this again'));
    wrap.append(message, label);

    const continued = await new Popup(wrap, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Continue', cancelButton: 'Cancel',
    }).show();
    if (!continued) return false;
    if (checkbox.checked) {
        settings.generationNoticeDismissed = true;
        saveSettings();
    }
    return true;
}
