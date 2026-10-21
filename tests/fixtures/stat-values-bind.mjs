import { readFileSync } from 'node:fs';
import { progressionFields } from '../../src/tracker/progression-fields.js';
import { npcStatsFor, proposedNpcTemplate } from '../../src/core/npc-templates.js';
import { configuredNumericMaximum, keepNumericMaximum, isPoolStat } from '../../src/tracker/numeric-stat-bounds.js';
import { isReaderStat } from '../../src/tracker/stat-update-policy.js';
import { sameStatReading } from '../../src/tracker/stat-reading-equality.js';

// The browser-facing module is loaded with only the dependencies this path uses.
const source = readFileSync(new URL('../../src/tracker/status-stat-values.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export function bind', 'function bind');
export const bind = new Function('npcStatsFor', 'proposedNpcTemplate', 'keepNumericMaximum', 'configuredNumericMaximum',
    'isReaderStat', 'progressionFields', 'isPoolStat',
    'ceilingFromValue', 'splitValue', 'sameStatReading',
    `${source}\nreturn bind;`)(npcStatsFor, proposedNpcTemplate, keepNumericMaximum, configuredNumericMaximum,
    isReaderStat, progressionFields, isPoolStat,
    value => { const cap = String(value ?? '').split('/')[1]; return cap && Number.isFinite(Number(cap)) ? Number(cap) : null; },
    value => { const [current, max] = String(value ?? '').split('/'); return { current, max }; }, sameStatReading);
