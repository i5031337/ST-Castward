import { readFileSync } from 'node:fs';
import { activeNpcSystem } from '../../src/core/npc-templates.js';
import { collectionAppliesTo } from '../../src/core/collection-targets.js';
import { collectionQuantityField } from '../../src/core/collection-fields.js';
import { calculateCollectionUpdate } from '../../src/tracker/collection-calculation.js';
import { bind as bindConstraints } from '../../src/tracker/status-update-constraints.js';

// Replace host storage only; collection calculation uses its real module imports.
const source = readFileSync(new URL('../../src/tracker/status-collection-updates.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export function bind', 'function bind');
const load = new Function('getSettings', 'saveSettings', 'activeNpcSystem', 'calculateCollectionUpdate',
    'collectionAppliesTo', 'collectionQuantityField', 'debugLog', 'LOG_PREFIX', `${source}\nreturn bind;`);

export function bindCollectionUpdates(deps, { getSettings, saveSettings = () => {} }) {
    if (!deps.recordRefusedValues) bindConstraints(deps);
    load(getSettings, saveSettings, activeNpcSystem, calculateCollectionUpdate, collectionAppliesTo, collectionQuantityField, () => {}, '[test]')(deps);
}
