import { collectionQuantityField } from '../core/collection-fields.js';
import { isStaticField } from '../core/constants-profile.js';
import { validateRewardEntry } from '../core/collection-rewards.js';
import { calculateFieldValue } from './stat-field-calculation.js';
import { createCollectionLibrary } from './collection-library.js';
import { calculateCollectionOperations } from './collection-operations.js';

const primaryField = definition => definition.fields.find(field => field.isPrimary)?.name || definition.fields[0]?.name || 'name';
const itemKey = (definition, item) => String(item?.[primaryField(definition)] ?? item?.name ?? '').trim().toLowerCase();

/** Every item mutation resolves definitions, validates final values, and returns a private plan. */
export function calculateCollectionPlan({ actor = { collections: {} }, tracker = {}, itemLibrary = {},
    operation = 'update', update, collectionId, scope, system = null, allowReplace = false,
    validation = 'normalize', requiredCollections = false, preserveUnknown = true,
    acceptedHoldings = [], item, index, fieldName, value, itemName, itemData, oldName, newName } = {}) {
    const definitions = tracker.collections || [];
    const registry = createCollectionLibrary(definitions, itemLibrary);
    for (const holdings of acceptedHoldings) registry.collections(holdings, { fromHoldings: true });
    const seeded = new Set(registry.changes().map(change => JSON.stringify([change.collectionId, String(change.itemName).toLowerCase()])));
    const warnings = [], refusedValues = [];
    const normalizeField = (field, reading, previous) => {
        const constrain = reading => {
            const result = calculateFieldValue(field, reading, previous?.[field.name]);
            refusedValues.push(...result.refusedValues);
            return result.value;
        };
        let result = constrain(reading);
        if (result === undefined || result === null) {
            result = field.defaultValue !== undefined && field.defaultValue !== '' ? field.defaultValue
                : field.type === 'number' ? 0 : field.type === 'boolean' ? false : '';
        }
        return field.type === 'number' ? parseFloat(constrain(parseFloat(result) || 0)) || 0
            : field.type === 'boolean' ? result === true || result === 'true' : String(result);
    };
    const normalizeIdentity = (definition, reading, previous, strict = validation === 'strict') => {
        const primary = primaryField(definition);
        const field = definition.fields.find(field => field.name === primary);
        const normalized = strict ? reading : normalizeField(field, reading, previous);
        return typeof normalized === 'string' ? normalized.trim() : normalized;
    };
    const remember = (definition, held) => registry.resolve(definition.id, held, { fromHoldings: true });
    const processItem = (definition, incoming, previous = null, editFields = [], strict = validation === 'strict') => {
        const primary = primaryField(definition);
        incoming = { ...incoming, [primary]: normalizeIdentity(definition, incoming?.[primary] ?? incoming?.name, previous, strict) };
        const identity = itemKey(definition, incoming);
        const hadDefinition = Object.hasOwn(registry.library[definition.id] || {}, identity);
        const resolved = registry.resolve(definition.id, incoming, { register: false, editFields });
        let normalized;
        if (strict) {
            const checked = validateRewardEntry(definition, resolved);
            if (!checked.entry) {
                const reason = `${definition.id}: ${checked.errors.join(' ')}`;
                throw new Error(hadDefinition ? `Cannot use Item Library values for ${reason} Fix the library definition before continuing.` : reason);
            }
            normalized = checked.entry;
        } else {
            normalized = {};
            for (const field of definition.fields) normalized[field.name] = normalizeField(field, resolved?.[field.name], previous);
        }
        if (typeof normalized[primary] === 'string') normalized[primary] = normalized[primary].trim();
        if (itemKey(definition, normalized) !== identity) {
            throw new Error(`Cannot use Item Library values for ${definition.id}: the definition changes the item's identity. Fix the library definition before continuing.`);
        }
        registry.resolve(definition.id, normalized, { editFields });
        return normalized;
    };
    const finish = (collections, affected = []) => {
        const changed = JSON.stringify(collections) !== JSON.stringify(actor.collections);
        const changes = registry.changes().filter(change => {
            const key = JSON.stringify([change.collectionId, String(change.itemName).toLowerCase()]);
            if (!seeded.has(key)) return true;
            const definition = definitions.find(entry => entry.id === change.collectionId);
            return changed && affected.includes(change.collectionId) && collections?.[change.collectionId]?.some(entry =>
                itemKey(definition, entry) === String(change.itemName).toLowerCase());
        });
        const library = structuredClone(itemLibrary);
        installCollectionChanges({ master_items: library }, changes);
        return { collections, libraryChanges: changes, library,
            libraryChanged: changes.length > 0, warnings, refusedValues };
    };

    if (operation.startsWith('library-')) {
        const definition = definitions.find(entry => entry.id === collectionId);
        if (!definition) return null;
        const primary = primaryField(definition);
        const oldKey = String(operation === 'library-rename' ? oldName : itemName).toLowerCase();
        if (operation !== 'library-update' && !Object.hasOwn(itemLibrary[collectionId] || {}, oldKey)) return null;
        const removals = [];
        if (operation !== 'library-update') {
            delete registry.library[collectionId][oldKey];
            removals.push({ collectionId, itemName: oldKey, remove: true });
        }
        if (operation !== 'library-delete') {
            const name = operation === 'library-rename' ? newName : itemName;
            const incoming = { ...itemData, [primary]: itemData?.[primary] ?? name };
            processItem(definition, incoming, null, definition.fields.filter(isStaticField).map(field => field.name), true);
        }
        const changes = [...removals, ...registry.changes()];
        const library = structuredClone(itemLibrary);
        installCollectionChanges({ master_items: library }, changes);
        return { collections: structuredClone(actor.collections), libraryChanges: changes,
            library, libraryChanged: changes.length > 0, warnings, refusedValues };
    }

    if (operation === 'replace-all') {
        const incoming = update || {};
        const ids = new Set(definitions.map(definition => definition.id));
        if ((!preserveUnknown && Object.keys(incoming).some(id => !ids.has(id)))
            || requiredCollections && definitions.some(definition => !Object.hasOwn(incoming, definition.id))) {
            throw new Error('Incomplete or off-template collections. Include every applicable collection, using [] when empty.');
        }
        const collections = structuredClone(actor.collections || {});
        for (const [id, entries] of Object.entries(incoming)) {
            const definition = definitions.find(entry => entry.id === id);
            if (!definition) { if (preserveUnknown) collections[id] = structuredClone(entries); continue; }
            if (!Array.isArray(entries)) throw new Error(`${id}: expected a list of items.`);
            for (const held of actor.collections?.[id] || []) remember(definition, held);
            const seen = new Set();
            collections[id] = entries.map(entry => {
                const normalized = processItem(definition, entry);
                if (validation === 'strict') {
                    const key = itemKey(definition, normalized).normalize('NFKC');
                    if (seen.has(key)) throw new Error(`Cannot use Item Library values: Duplicate entry in ${id}: ${normalized[primaryField(definition)]}.`);
                    seen.add(key);
                    const quantity = collectionQuantityField(definition);
                    if (quantity && !(normalized[quantity.name] > 0)) throw new Error(`${id}: starting quantity must be positive.`);
                }
                return normalized;
            });
        }
        return finish(collections, Object.keys(incoming));
    }

    if (operation === 'edit') {
        const definition = definitions.find(entry => entry.id === collectionId);
        const held = actor.collections?.[collectionId]?.[index];
        if (!definition || !held || JSON.stringify(held) !== JSON.stringify(item)
            || !definition.fields.some(field => field.name === fieldName) || held[fieldName] === value) return null;
        remember(definition, held);
        const primary = primaryField(definition);
        if (fieldName === primary && !String(value ?? '').trim()) return null;
        const incoming = { ...held, [fieldName]: value };
        const rename = fieldName === primary && String(held[primary]).toLowerCase() !== String(value).toLowerCase();
        const collections = structuredClone(actor.collections);
        collections[collectionId][index] = processItem(definition, incoming, held, rename ? [] : [fieldName]);
        return finish(collections, [collectionId]);
    }

    if (update === undefined && item !== undefined) {
        const definition = definitions.find(entry => entry.id === collectionId);
        const held = actor.collections?.[collectionId]?.[index];
        if (operation === 'remove' && (!held || JSON.stringify(held) !== JSON.stringify(item))) return null;
        update = operation === 'remove' ? held[primaryField(definition)] : item;
    }
    const result = calculateCollectionOperations({ actor, collectionId, update, tracker, scope, system,
        allowReplace, operation, processItem, remember, normalizeIdentity });
    warnings.push(...result.warnings);
    const definition = definitions.find(entry => entry.id.toLowerCase() === collectionId?.toLowerCase());
    return finish(result.collections, definition ? [definition.id] : []);
}

/** Call only inside the feature's accepted ownership/storage boundary. */
export function installCollectionChanges(settings, changes) {
    if (!changes.length) return;
    settings.master_items ||= {};
    for (const { collectionId, itemName, fields, remove } of changes) {
        const key = String(itemName).toLowerCase();
        const entries = { ...settings.master_items[collectionId] };
        if (remove) delete entries[key];
        else Object.defineProperty(entries, key, { value: structuredClone(fields), enumerable: true, writable: true, configurable: true });
        settings.master_items[collectionId] = entries;
    }
}
