import { getContext } from '../../../../../st-context.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { makeId } from '../core/utils.js';
import { seedNpcRoster } from './system-npc-roster.js';

export function restoreNpcRoster() {
    if (seedNpcRoster(getSettings(), getContext(), makeId)) {
        saveSettings();
        getContext()?.saveMetadataDebounced?.();
    }
}
