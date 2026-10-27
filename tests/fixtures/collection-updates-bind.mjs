import { bindStatusModule } from '../helpers/status-module.mjs';

export function bindCollectionUpdates(deps, { getSettings, saveSettings = () => {} }) {
    bindStatusModule(new URL('../../src/tracker/status-collection-updates.js', import.meta.url), deps,
        { getSettings, saveSettings, debugLog() {}, LOG_PREFIX: '[test]' });
}
