import { collectionQuantityField } from '../core/collection-fields.js';
import { collectionAppliesTo } from '../core/collection-targets.js';

/** Collection arithmetic only; the pipeline supplies definition resolution and validation. */
export function calculateCollectionOperations({ actor, collectionId, update, tracker, system = null, scope,
    allowReplace = false, operation = 'update', processItem, remember, normalizeIdentity }) {
    const result = { collections: structuredClone(actor.collections),
        warnings: [] };
    const definitions = tracker.collections || [];
    const colDef = definitions.find(col => col.id.trim().toLowerCase() === collectionId?.trim().toLowerCase());
    const warn = reason => result.warnings.push(`Collection "${collectionId}" for ${actor.name || 'unnamed actor'} skipped: ${reason}`);
    const primary = colDef?.fields.find(field => field.isPrimary)?.name || 'name';
    const quantity = collectionQuantityField(colDef);
    const identifier = item => {
        const value = item?.[primary] ?? item?.name;
        if (value === undefined || value === null || !String(value).trim()) {
            warn(`entry requires primary field "${primary}".`);
            return undefined;
        }
        const normalized = normalizeIdentity(colDef, value);
        if (!String(normalized ?? '').trim()) { warn(`invalid primary field \"${primary}\".`); return undefined; }
        return normalized;
    };
    const normalize = (item, previous = null) => processItem(colDef, item, previous);
    const remove = name => {
        if (!result.collections?.[collectionId] || name === undefined || name === null) return;
        const lower = String(name).trim().toLowerCase();
        result.collections[collectionId] = result.collections[collectionId]
            .filter(item => String(item[primary]).trim().toLowerCase() !== lower);
    };
    const add = item => {
        const name = identifier(item);
        if (name === undefined) return;
        const amount = quantity ? item[quantity.name] ?? 1 : null;
        if (quantity && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
            warn('addition requires a positive quantity.');
            return;
        }
        const lower = String(name).trim().toLowerCase();
        const filtered = { [primary]: name };
        for (const field of colDef.fields) if (Object.hasOwn(item, field.name)) filtered[field.name] = item[field.name];
        const index = result.collections[collectionId].findIndex(entry => String(entry[primary]).trim().toLowerCase() === lower);
        if (index >= 0) {
            const previous = result.collections[collectionId][index];
            remember(colDef, previous);
            const merged = { ...previous, ...filtered };
            if (quantity) merged[quantity.name] = (Number(previous[quantity.name] ?? 1) || 0) + amount;
            result.collections[collectionId][index] = normalize(merged, previous);
        } else {
            result.collections[collectionId].push(normalize(quantity ? { ...filtered, [quantity.name]: amount } : filtered));
        }
    };
    if (!colDef) {
        warn(`unknown collection ID. Expected one of: ${definitions.map(col => `"${col.id}"`).join(', ') || '(none configured)'}.`);
        return result;
    }
    collectionId = colDef.id;
    if (operation === 'remove') {
        remove(update);
        return result;
    }
    if (scope && !collectionAppliesTo(colDef, scope === 'offstage' ? 'npc' : scope, actor, system)) {
        warn(`does not apply to ${scope === 'player' ? 'the player' : `NPC template "${actor.npcTemplateId || '(unassigned)'}"`}. Check the collection's targets.`);
        return result;
    }
    if (operation === 'add') {
        result.collections ||= {};
        result.collections[collectionId] ||= [];
        add(update);
        return result;
    }
    result.collections ||= {};
    if (update && !Array.isArray(update) && Array.isArray(update.replace)) {
        update = update.replace;
        allowReplace = true;
    }
    if (Array.isArray(update) && !allowReplace) update = { add: update };
    if (Array.isArray(update)) {
        for (const held of result.collections[collectionId] || []) remember(colDef, held);
        result.collections[collectionId] = [];
        for (const item of update) {
            if (identifier(item) === undefined) continue;
            result.collections[collectionId].push(normalize(item));
        }
        return result;
    }
    result.collections[collectionId] ||= [];
    if (update?.clear === true) {
        if (allowReplace) result.collections[collectionId] = [];
        return result;
    }
    for (const item of Array.isArray(update?.add) ? update.add : []) {
        const name = identifier(item);
        if (name !== undefined) add(item);
    }
    for (const removal of Array.isArray(update?.remove) ? update.remove : []) {
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
        const item = result.collections[collectionId].find(entry => String(entry[primary]).trim().toLowerCase() === String(name).trim().toLowerCase());
        if (!item) continue;
        const remaining = Math.max(0, (Number(item[quantity.name] ?? 1) || 0) - amount);
        if (remaining === 0) remove(name);
        else {
            remember(colDef, item);
            Object.assign(item, processItem(colDef, item, item));
            item[quantity.name] = remaining;
        }
    }
    for (const incoming of Array.isArray(update?.update) ? update.update : []) {
        const name = identifier(incoming);
        if (name === undefined) continue;
        const index = result.collections[collectionId].findIndex(entry => String(entry[primary]).trim().toLowerCase() === String(name).trim().toLowerCase());
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
        remember(colDef, previous);
        const merged = { ...previous };
        for (const field of colDef.fields) if (Object.hasOwn(incoming, field.name)) merged[field.name] = incoming[field.name];
        result.collections[collectionId][index] = normalize(merged, previous);
    }
    return result;
}
