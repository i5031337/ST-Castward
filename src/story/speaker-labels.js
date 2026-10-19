import { getSettings } from '../core/settings.js';

/** Shared speaker exclusions for chat decoration and tracker extraction, without DOM dependencies. */

/** Configured field names and user exclusions that cannot be unknown speakers. */
export function getIgnoredSpeakerLabels() {
    const settings = getSettings();
    const tracker = settings.statusTracker || {};
    const labels = new Set();

    const add = (raw) => {
        const name = normaliseSpeakerLabel(raw);
        if (name) labels.add(name);
    };

    for (const key of ['globalStats', 'playerStats', 'npcStats']) {
        for (const stat of tracker[key] || []) add(stat?.name);
    }
    for (const collection of tracker.collections || []) {
        add(collection?.id);
        add(collection?.name);
        for (const field of collection?.fields || []) add(field?.name);
    }
    for (const word of String(settings.speakerIgnoreList || '').split(/[\n,]/)) add(word);

    return labels;
}

/** Trims a label down to what it would be called, so "Attack Difficulty: " matches "Attack Difficulty". */
export function normaliseSpeakerLabel(raw) {
    return String(raw ?? '').trim().replace(/[:：\s]+$/, '').trim().toLowerCase();
}
