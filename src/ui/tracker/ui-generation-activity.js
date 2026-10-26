import { eventSource, event_types } from '../../../../../../events.js';
import { getSettings } from '../../core/settings.js';
import { getGenerationActivities, subscribeGenerationActivity, clearGenerationActivities } from '../../core/generation-activity.js';

const icons = { tracker: 'fa-list-check', location: 'fa-map-location-dot', profile: 'fa-address-card', image: 'fa-palette' };
let initialized = false;

/** A compact row above the composer names work that otherwise shares the same Stop button. */
export function refreshGenerationActivity() {
    document.getElementById('sillynpc-generation-activity')?.remove();
    const active = getGenerationActivities();
    if (!active.length || !getSettings().enabled) return;
    const form = document.getElementById('send_form');
    if (!form) return;
    const row = document.createElement('div');
    row.id = 'sillynpc-generation-activity';
    row.setAttribute('role', 'status');
    row.setAttribute('aria-live', 'polite');
    const brand = document.createElement('span');
    brand.className = 'sillynpc-activity-brand';
    brand.textContent = 'Castward';
    row.append(brand);
    for (const activity of active) {
        const chip = document.createElement('span');
        chip.className = 'sillynpc-activity-chip';
        chip.dataset.kind = activity.kind;
        const icon = document.createElement('i');
        icon.className = `fa-solid ${icons[activity.kind] || 'fa-spinner'}`;
        icon.setAttribute('aria-hidden', 'true');
        chip.append(icon, document.createTextNode(activity.label));
        row.append(chip);
    }
    form.before(row);
}

export function initGenerationActivity() {
    if (initialized) return;
    initialized = true;
    subscribeGenerationActivity(refreshGenerationActivity);
    eventSource.on(event_types.CHAT_CHANGED, clearGenerationActivities);
}
