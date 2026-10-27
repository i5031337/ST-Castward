import { combineStatValue } from './stat-value-utils.js';
import { allowedValues, findMatchingStatKey } from './stat-field-utils.js';
import { calculateFieldValue, calculateOptionValue, capToLength } from './stat-field-calculation.js';

function constrainToOptions(def, incoming, existing, onRefused = () => {}) {
    const result = calculateOptionValue(def, incoming, existing);
    result.refusedValues.forEach(onRefused);
    return result.value;
}

function constrainToDefinition(def, incoming, existing, onWarning = () => {}, onRefused = () => {}) {
    const result = calculateFieldValue(def, incoming, existing);
    result.refusedValues.forEach(onRefused);
    result.warnings.forEach(onWarning);
    return result.value;
}

export { allowedValues, constrainToOptions, capToLength, constrainToDefinition, combineStatValue, findMatchingStatKey };
