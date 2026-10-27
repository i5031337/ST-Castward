import { splitValue } from '../core/utils-format.js';
import { mergeStatValue, clampToCeiling } from './stat-value-utils.js';
import { allowedValues, findMatchingStatKey } from './stat-field-utils.js';
import { calculateFieldValue, calculateOptionValue, capToLength } from './stat-field-calculation.js';

export function bind(deps) {
const refused = [];

function recordRefusedValues(values) {
    refused.push(...values);
}

function takeRefusedValues() {
    return refused.splice(0);
}

function constrainToOptions(def, incoming, existing) {
    const result = calculateOptionValue(def, incoming, existing);
    recordRefusedValues(result.refusedValues);
    return result.value;
}

function constrainToDefinition(def, incoming, existing, onWarning = () => {}) {
    const result = calculateFieldValue(def, incoming, existing);
    recordRefusedValues(result.refusedValues);
    result.warnings.forEach(onWarning);
    return result.value;
}

function combineStatValue(existingValue, group, statDef, options = {}) {
    let value = existingValue;
    if (group.whole !== undefined) {
        value = mergeStatValue(value, group.whole, options);
    }
    if (group.current === undefined && group.max === undefined) return value;

    const parts = splitValue(value);
    let current = parts.current;
    /* The value's own denominator, and nothing else. The configured maximum used to stand
       in for it, which meant a stat that had been given a ceiling in play could never lose
       one: clear the "/120" and the setting handed it straight back. The setting seeds the
       first value and says nothing after that. */
    let max = parts.max || '';

    if (group.current !== undefined) current = String(group.current).trim();
    // A raised ceiling is a change like any other, so it is visible in the diff and can be
    // held for review rather than being forbidden outright - growth is legitimate, and it
    // should be something you agreed to rather than something that happened.
    if (group.max !== undefined) max = String(group.max).trim();

    return max ? clampToCeiling(`${current}/${max}`) : current;
}

Object.defineProperties(deps, {
    recordRefusedValues: { enumerable: true, configurable: true, get: () => recordRefusedValues },
    allowedValues: { enumerable: true, configurable: true, get: () => allowedValues },
    takeRefusedValues: { enumerable: true, configurable: true, get: () => takeRefusedValues },
    constrainToOptions: { enumerable: true, configurable: true, get: () => constrainToOptions },
    capToLength: { enumerable: true, configurable: true, get: () => capToLength },
    constrainToDefinition: { enumerable: true, configurable: true, get: () => constrainToDefinition },
    combineStatValue: { enumerable: true, configurable: true, get: () => combineStatValue },
    findMatchingStatKey: { enumerable: true, configurable: true, get: () => findMatchingStatKey },
});
}
