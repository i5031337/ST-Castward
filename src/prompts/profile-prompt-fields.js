import { hintFor } from '../core/constants-profile.js';

/** Field guidance shared by profile generation and its base-prompt estimate. */
export function loreProfileValues(fields, established = {}) {
    return {
        profileFields: fields.map(field =>
            `- ${field.label}: ${hintFor(field)}${established[field.id]
                ? ` (established: ${String(established[field.id]).trim()})` : ''}`).join('\n'),
        profileTemplate: fields.map(field => {
            const guidance = hintFor(field).trim() || 'Brief supported value.';
            const known = String(established[field.id] ?? '').replace(/\s+/g, ' ').trim();
            return `  ${field.label}: <${guidance}${known ? ` Established: ${known}` : ''}>`;
        }).join('\n'),
    };
}
