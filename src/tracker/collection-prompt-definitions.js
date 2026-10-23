import { collectionQuantityField } from '../core/collection-fields.js';
import { collectionTargetLabel } from '../core/collection-targets.js';
import { isStaticField } from '../core/constants-profile.js';

/** A note, ending in a full stop, however the person who wrote it left it. */
function endsSentence(text) {
    const trimmed = String(text ?? '').trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function describeCollections(trackerSettings, { initialize = false } = {}) {
    const lines = [];
    for (const col of trackerSettings.collections || []) {
        const fields = (col.fields || []).map((f) => {
            const type = f.type && f.type !== 'text' ? ` (${f.type})` : '';
            const choices = f.type !== 'number' && (f.options || []).length ? ` [one of ${f.options.join(', ')}]` : '';
            const range = f.type === 'number' ? [
                String(f.min ?? '').trim() ? `minimum ${f.min}` : '',
                String(f.maxStatValue ?? '').trim() ? `maximum ${f.maxStatValue}` : '',
            ].filter(Boolean).join(', ') : '';
            const library = !f.isPrimary && f.isMultiline && isStaticField(f)
                ? ' [include when adding]' : '';
            const says = String((initialize ? f.guidance || f.hint : f.hint) ?? '').trim();
            const initial = initialize && f.defaultValue !== undefined && f.defaultValue !== ''
                ? ` [default ${JSON.stringify(f.defaultValue)}]` : '';
            return `${f.name}${type}${choices}${range ? ` [${range}]` : ''}`
                + `${f.isPrimary ? ' [identifies the item]' : ''}${library}${initial}`
                + `${says ? ` - ${endsSentence(says)}` : ''}`;
        }).join(', ');

        const label = String(col.name ?? '').trim();
        const title = label && label.toLowerCase() !== String(col.id).toLowerCase()
            ? `"${col.id}" (${label})` : `"${col.id}"`;
        const note = String((initialize ? col.guidance || col.hint : col.hint) ?? '').trim();

        lines.push(`- ${title}${initialize ? '' : ` for ${collectionTargetLabel(col)}`}`
            + `${note ? ` - ${endsSentence(note)}` : ''}`
            + ` Fields: ${fields || 'name'}`
            + (collectionQuantityField(col) ? ` Quantity field: ${collectionQuantityField(col).name}.` : ''));
    }
    return lines.join('\n');
}

