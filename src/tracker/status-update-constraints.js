import { combineStatValue } from './stat-value-utils.js';
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
