import { readFileSync } from 'node:fs';
import { progressionFields } from '../../src/tracker/progression-fields.js';
import { npcStatsFor, proposedNpcTemplate } from '../../src/core/npc-templates.js';
import { configuredNumericMaximum, keepNumericMaximum, isPoolStat } from '../../src/tracker/numeric-stat-bounds.js';
import * as statValues from '../../src/tracker/stat-value-utils.js';
import * as statFields from '../../src/tracker/stat-field-utils.js';
import { ceilingFromValue } from '../../src/core/utils-format.js';
import { sameStatReading } from '../../src/tracker/stat-reading-equality.js';

// The browser-facing module is loaded with only the dependencies this path uses.
const source = readFileSync(new URL('../../src/tracker/status-stat-values.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export function bind', 'function bind');
const imports = { npcStatsFor, proposedNpcTemplate, keepNumericMaximum, configuredNumericMaximum,
    progressionFields, isPoolStat, ceilingFromValue, sameStatReading, ...statValues, ...statFields };
const bindModelValues = new Function(...Object.keys(imports), `${source}\nreturn bind;`)(...Object.values(imports));
export function bind(deps) {
    Object.assign(deps, statValues);
    bindModelValues(deps);
}
