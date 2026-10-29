import { isStaticField } from '../core/constants-profile.js';

/** Plan shared definitions on a private library; callers install changes only on acceptance. */
export function createCollectionLibrary(definitions = [], source = {}) {
    const library = structuredClone(source);
    const changes = new Map();
    const resolve = (collectionId, item, { editFields = [], register = true, fromHoldings = false } = {}) => {
        const definition = definitions.find(collection => collection.id === collectionId);
        if (!definition || !item || typeof item !== 'object') return structuredClone(item);
        const primary = definition.fields.find(field => field.isPrimary)?.name || 'name';
        const value = item[primary] ?? item.name;
        const name = typeof value === 'string' ? value.trim() : value;
        if (name === undefined || name === null || !String(name).trim()) return structuredClone(item);
        const key = String(name).toLowerCase();
        const existing = Object.hasOwn(library[collectionId] || {}, key) ? library[collectionId][key] : undefined;
        const fields = existing ? structuredClone(existing) : {};
        const resolved = { ...structuredClone(item), [primary]: name };
        for (const field of definition.fields.filter(isStaticField)) {
            // Accepted holdings may complete a partial definition; proposals cannot.
            if (!existing || editFields.includes(field.name) || fromHoldings && !Object.hasOwn(existing, field.name)) {
                if (resolved[field.name] !== undefined) fields[field.name] = structuredClone(resolved[field.name]);
            }
            if (Object.hasOwn(fields, field.name)) resolved[field.name] = structuredClone(fields[field.name]);
            else if (existing && field.name !== primary) delete resolved[field.name];
        }
        if (register && (!existing || JSON.stringify(fields) !== JSON.stringify(existing))) {
            library[collectionId] = { ...library[collectionId], [key]: fields };
            changes.set(JSON.stringify([collectionId, key]), { collectionId, itemName: name, fields });
        }
        return resolved;
    };
    const collections = (holdings, options) => Object.fromEntries(Object.entries(holdings || {}).map(([id, entries]) =>
        [id, Array.isArray(entries) ? entries.map(item => resolve(id, item, options)) : structuredClone(entries)]));
    return { resolve, collections, library, changes: () => [...changes.values()] };
}
