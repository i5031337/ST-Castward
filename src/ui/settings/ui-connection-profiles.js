import { getSettings, saveSettings } from '../../core/settings.js';
import { getContext } from '../../../../../../st-context.js';
import { appendSettingHelp } from './ui-setting-help.js';

/**
 * Which connection answers which request.
 *
 * Shared rather than owned by a tab: the tracker's pickers and the lore tab's picker are
 * the same control over different settings, and the one time they were not, choosing a
 * Scan Connection silently changed the extraction connection instead.
 */

function profileStore(scope) {
    return scope === 'root' ? getSettings() : getSettings().statusTracker;
}

/** The profile currently chosen for one setting. */
export function readProfileSetting(scope, key) {
    return profileStore(scope)[key] || '';
}

/**
 * Records the profile chosen for one setting, and only that one.
 *
 * The picker used to read and write `extractionProfileId` whatever key it was handed, so
 * choosing a **Scan Connection** silently changed the extraction connection instead, both
 * dropdowns showed the same value, and `scanProfileId` could never be set at all - even
 * though the scan reads it (`src/history-scan.js`).
 */
export function writeProfileSetting(scope, key, value) {
    profileStore(scope)[key] = value;
    saveSettings();
}

/**
 * A "which connection runs this" dropdown.
 *
 * @param {Function} onChange
 * @param {{ key?: string, scope?: 'tracker'|'root', labelText?: string,
 *           fallbackLabel?: string, noteText?: string, unavailableText?: string }} options
 */
export function buildConnectionProfilePicker(onChange, options = {}) {
    const {
        key = 'extractionProfileId',
        scope = 'tracker',
        labelText = 'Extraction Connection',
        fallbackLabel = 'Main API (same as chat)',
        noteText = 'Which connection runs the extraction. A small fast model is usually '
            + 'enough, and keeps this off the budget of your main model.',
        unavailableText = 'Connection Manager is not available. Enable it to use a selected '
            + 'reader connection. Requests through a selected connection will fail unless '
            + 'Fall Back To Main API is enabled. With no connection selected, the reader '
            + 'uses the main API.',
    } = options;

    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-setting';
    wrap.dataset.setting = scope === 'root' ? key : `statusTracker.${key}`;

    const row = document.createElement('div');
    row.className = 'sillynpc-setting-row';
    const label = document.createElement('label');
    label.className = 'sillynpc-setting-label';
    label.textContent = labelText;

    let profiles = null;
    try {
        profiles = getContext().ConnectionManagerRequestService.getSupportedProfiles();
    } catch (err) {
        debugLogSafe('Connection Manager unavailable for the extraction picker', err);
    }

    if (!profiles) {
        row.append(label);
        wrap.append(row);
        appendSettingHelp(wrap, unavailableText);
        return wrap;
    }

    const select = document.createElement('select');
    select.className = 'text_pole';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = fallbackLabel;
    select.append(none);
    for (const profile of profiles) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name || profile.id;
        select.append(option);
    }
    select.value = readProfileSetting(scope, key);
    select.addEventListener('change', () => {
        writeProfileSetting(scope, key, select.value);
        onChange?.();
    });

    row.append(label, select);
    wrap.append(row);
    appendSettingHelp(wrap, noteText);
    return wrap;
}

/** Console noise from an optional integration is not worth a hard failure. */
function debugLogSafe(message, err) {
    try { console.debug('[Castward]', message, err); } catch { /* ignore */ }
}
