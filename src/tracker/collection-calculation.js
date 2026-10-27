import { collectionQuantityField } from '../core/collection-fields.js';
import { collectionAppliesTo } from '../core/collection-targets.js';
import { isStaticField } from '../core/constants.js';
import { calculateFieldValue } from './stat-field-calculation.js';

/** Calculate collection changes from captured data; never read or write live stores.
 * operation is update, add, or remove; direct add/remove retain manual-editor semantics.
 * Newly planned library entries supply defaults to later rows within the calculation.
 */
export function calculateCollectionUpdate({ actor, collectionId, update, tracker, system = null, scope,
    itemLibrary = {}, allowReplace = false,
    operation = 'update' }) {
    const result = { collections: structuredClone(actor.collections),
        libraryChanges: [], warnings: [], refusedValues: [] };
    const definitions = tracker.collections || [];
    const colDef = definitions.find(col => operation === 'update'
        ? col.id.toLowerCase() === collectionId.toLowerCase() : col.id === collectionId);
    const warn = reason => result.warnings.push(`Collection "${collectionId}" for ${actor.name || 'unnamed actor'} skipped: ${reason}`);
    const primary = colDef?.fields.find(field => field.isPrimary)?.name || 'name';
    const quantity = collectionQuantityField(colDef);
    const identifier = item => {
        const value = item?.[primary] ?? item?.name;
        if (value === undefined || value === null || !String(value).trim()) {
            warn(`entry requires primary field "${primary}".`);
            return undefined;
        }
        return value;
    };
    const normalize = (item, previous = null) => {
        const normalized = {};
        const constrain = (field, value) => {
            const reading = calculateFieldValue(field, value, previous?.[field.name]);
            result.refusedValues.push(...reading.refusedValues);
            return reading.value;
        };
        for (const field of colDef.fields) {
            let value = constrain(field, item?.[field.name]);
            if (value === undefined || value === null) {
                value = field.defaultValue !== undefined && field.defaultValue !== '' ? field.defaultValue
                    : field.type === 'number' ? 0 : field.type === 'boolean' ? false : '';
            }
            normalized[field.name] = field.type === 'number' ? parseFloat(constrain(field, parseFloat(value) || 0)) || 0
                : field.type === 'boolean' ? value === true || value === 'true' : String(value);
        }
        return normalized;
    };
    const remove = name => {
        if (!result.collections?.[collectionId] || name === undefined || name === null) return;
        const lower = String(name).toLowerCase();
        result.collections[collectionId] = result.collections[collectionId]
            .filter(item => String(item[primary]).toLowerCase() !== lower);
    };
    const add = item => {
        const name = identifier(item);
        if (name === undefined) return;
        const amount = quantity ? item[quantity.name] ?? 1 : null;
        if (quantity && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
            warn('addition requires a positive quantity.');
            return;
        }
        const lower = String(name).toLowerCase();
        const filtered = { [primary]: name };
        for (const field of colDef.fields) if (Object.hasOwn(item, field.name)) filtered[field.name] = item[field.name];
        const index = result.collections[collectionId].findIndex(entry => String(entry[primary]).toLowerCase() === lower);
        if (index >= 0) {
            const previous = result.collections[collectionId][index];
            const merged = { ...previous, ...filtered };
            if (quantity) merged[quantity.name] = (Number(previous[quantity.name] ?? 1) || 0) + amount;
            result.collections[collectionId][index] = normalize(merged, previous);
        } else {
            result.collections[collectionId].push(normalize(quantity ? { ...filtered, [quantity.name]: amount } : filtered));
        }
    };
    if (operation === 'remove') {
        remove(update);
        return result;
    }
    if (operation === 'add') {
        result.collections ||= {};
        result.collections[collectionId] ||= [];
        if (colDef) add(update);
        return result;
    }
    if (!colDef) {
        warn(`unknown collection ID. Expected one of: ${definitions.map(col => `"${col.id}"`).join(', ') || '(none configured)'}.`);
        return result;
    }
    if (!collectionAppliesTo(colDef, scope, actor, system)) {
        warn(`does not apply to ${scope === 'player' ? 'the player' : `NPC template "${actor.npcTemplateId || '(unassigned)'}"`}. Check the collection's targets.`);
        return result;
    }
    collectionId = colDef.id;
    result.collections ||= {};
    if (update && !Array.isArray(update) && Array.isArray(update.replace)) {
        update = update.replace;
        allowReplace = true;
    }
    if (Array.isArray(update) && !allowReplace) update = { add: update };
    if (Array.isArray(update)) {
        result.collections[collectionId] = [];
        const library = structuredClone(itemLibrary);
        for (const item of update) {
            const name = identifier(item);
            if (name === undefined) continue;
            // Library lookup historically uses a truthy primary value, unlike item identity.
            const libraryName = item[primary] || item.name;
            const lower = libraryName && String(libraryName).toLowerCase();
            const entry = lower && library[collectionId]?.[lower];
            let merged = item;
            if (entry) {
                merged = { ...item };
                for (const field of colDef.fields) {
                    if (isStaticField(field) && entry[field.name] !== undefined) merged[field.name] = entry[field.name];
                }
            } else if (lower) {
                const fields = {};
                for (const field of colDef.fields) {
                    if (isStaticField(field) && item[field.name] !== undefined) fields[field.name] = item[field.name];
                }
                result.libraryChanges.push({ collectionId, itemName: libraryName, fields: structuredClone(fields) });
                library[collectionId] ||= {};
                library[collectionId][lower] = fields;
            }
            result.collections[collectionId].push(normalize(merged));
        }
        return result;
    }
    result.collections[collectionId] ||= [];
    if (update.clear === true) {
        if (allowReplace) result.collections[collectionId] = [];
        return result;
    }
    for (const item of Array.isArray(update.add) ? update.add : []) {
        const name = identifier(item);
        if (name !== undefined) add(item);
    }
    for (const removal of Array.isArray(update.remove) ? update.remove : []) {
        const structured = removal && typeof removal === 'object';
        const name = structured ? identifier(removal) : removal;
        if (name === undefined) continue;
        if (!quantity || structured && removal.all === true) {
            remove(name);
            continue;
        }
        const amount = structured ? removal[quantity.name] ?? 1 : 1;
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
            warn('removal requires a positive quantity.');
            continue;
        }
        const item = result.collections[collectionId].find(entry => String(entry[primary]).toLowerCase() === String(name).toLowerCase());
        if (!item) continue;
        const remaining = Math.max(0, (Number(item[quantity.name] ?? 1) || 0) - amount);
        if (remaining === 0) remove(name);
        else item[quantity.name] = remaining;
    }
    for (const incoming of Array.isArray(update.update) ? update.update : []) {
        const name = identifier(incoming);
        if (name === undefined) continue;
        const index = result.collections[collectionId].findIndex(entry => String(entry[primary]).toLowerCase() === String(name).toLowerCase());
        if (index < 0) continue;
        if (quantity && Object.hasOwn(incoming, quantity.name)) {
            const amount = incoming[quantity.name];
            if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
                warn('update requires a nonnegative quantity.');
                continue;
            }
            if (amount === 0) {
                remove(name);
                continue;
            }
        }
        const previous = result.collections[collectionId][index];
        const merged = { ...previous };
        for (const field of colDef.fields) if (Object.hasOwn(incoming, field.name)) merged[field.name] = incoming[field.name];
        result.collections[collectionId][index] = normalize(merged, previous);
    }
    return result;
}
