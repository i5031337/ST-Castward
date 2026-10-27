import { bindStatusModule } from '../helpers/status-module.mjs';
import * as statValues from '../../src/tracker/stat-value-utils.js';

export function bind(deps) {
    Object.assign(deps, statValues);
    bindStatusModule(new URL('../../src/tracker/status-stat-values.js', import.meta.url), deps);
}
