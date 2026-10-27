import { fieldAppliesTo } from '../core/system-fields.js';
import { isStaticField } from '../core/constants-profile.js';

const SCOPES = ['globalStats', 'playerStats', 'npcStats'];
const escapePattern = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rename a stored key, preserving position and an occupied destination. */
function renamed(holder, oldName, newName) {
    if (!holder || !Object.hasOwn(holder, oldName)) return null;
    const occupied = holder[newName] !== undefined && holder[newName] !== '' && holder[newName] !== null;
    const out = {};
    for (const [key, value] of Object.entries(holder)) {
        if (key === oldName || key === newName) {
            if (!Object.hasOwn(out, newName)) out[newName] = occupied ? holder[newName] : holder[oldName];
        } else out[key] = value;
    }
    return out;
}

/** Calculate schema/library effects without changing any supplied object or consulting storage. */
export function calculateSchemaOperation({ tracker, system, state, personaData = {}, cards = [], itemLibrary = {}, operation }) {
    const writes = [];
    let nextState = state && !operation.type.startsWith('library-') ? structuredClone(state) : null;
    const result = { values: 0, templateUpdated: false, cssMentions: false };
    const { type, oldName, newName, collectionId, field } = operation;
    const put = (target, key, value, remove = false) => {
        if (!target) return;
        const prior = writes.find(write => write.target === target && write.key === key);
        if (prior) Object.assign(prior, { value, remove });
        else writes.push({ target, key, value, remove });
    };
    const move = (target, key) => {
        const value = renamed(target?.[key], oldName, newName);
        if (value) { put(target, key, value); result.values++; }
    };
    const moveState = (target, key) => {
        const value = renamed(target?.[key], oldName, newName);
        if (value) { target[key] = value; result.values++; }
    };
    const actors = [nextState?.player, ...(nextState?.characters || [])].filter(Boolean);
    const renameDefinition = (target, key) => {
        if (target && target[key] !== oldName) return false;
        if (target) put(target, key, newName);
        return true;
    };
    if (type === 'stat') {
        const scopes = (Array.isArray(operation.scopes) ? operation.scopes : [operation.scopes]).filter(scope => SCOPES.includes(scope));
        if (!oldName || !newName || oldName === newName || !scopes.length && !field || !renameDefinition(field, 'name')) return null;
        if (!scopes.length) nextState = null;
        for (const scope of scopes) {
            if (scope === 'globalStats') moveState(nextState, 'global');
            if (scope === 'playerStats') {
                moveState(nextState?.player, 'stats');
                for (const player of Object.values(nextState?.players || {})) moveState(player, 'stats');
                for (const persona of Object.values(personaData)) move(persona, 'stats');
            }
            if (scope === 'npcStats') {
                const applies = actor => !field || fieldAppliesTo(field, 'npc', actor, system);
                for (const actor of nextState?.characters || []) if (applies(actor)) moveState(actor, 'stats');
                for (const card of cards) if (applies(card)) move(card, 'statusOverrides');
            }
        }
        const sameField = stat => field && (stat === field || field.id && stat.id === field.id);
        const stillUsed = SCOPES.some(scope => (tracker[scope] || []).some(stat =>
            stat.name === oldName && !sameField(stat) && (field || !scopes.includes(scope))));
        if (field) for (const scope of SCOPES) for (const stat of tracker[scope] || []) {
            if (sameField(stat)) put(stat, 'name', newName);
        }
        if (scopes.length && !stillUsed && typeof tracker.template === 'string') {
            const word = '\\p{L}\\p{N}_';
            const labelled = new RegExp(`(?<![${word}])${escapePattern(oldName)}(?![${word}])([^{}]{0,4}?)\\{\\{([#^/]?)${escapePattern(oldName)}\\}\\}`, 'gu');
            const reference = new RegExp(`\\{\\{([#^/]?)${escapePattern(oldName)}\\}\\}`, 'g');
            const template = tracker.template.replace(labelled, `${newName}$1{{$2${newName}}}`).replace(reference, `{{$1${newName}}}`);
            if (template !== tracker.template) { put(tracker, 'template', template); result.templateUpdated = true; }
        }
        result.cssMentions = !!scopes.length && !stillUsed && String(tracker.customCSS || '').toLowerCase().includes(oldName.toLowerCase());
    } else if (type === 'collection-field') {
        if (!collectionId || !oldName || !newName || oldName === newName || !renameDefinition(field, 'name')) return null;
        const renameItem = item => {
            const value = renamed(item, oldName, newName);
            if (value) result.values++;
            return value || item;
        };
        const renameList = list => Array.isArray(list) ? list.map(renameItem) : list;
        for (const [key, item] of Object.entries(itemLibrary[collectionId] || {})) put(itemLibrary[collectionId], key, renameItem(item));
        for (const persona of Object.values(personaData)) if (persona?.collections?.[collectionId]) put(persona.collections, collectionId, renameList(persona.collections[collectionId]));
        for (const card of cards) if (card?.statusCollections?.[collectionId]) put(card.statusCollections, collectionId, renameList(card.statusCollections[collectionId]));
        for (const actor of actors) if (actor.collections?.[collectionId]) actor.collections[collectionId] = renameList(actor.collections[collectionId]);
    } else if (type === 'collection-id') {
        if (!oldName || !newName || oldName === newName || !renameDefinition(operation.definition, 'id')) return null;
        if (itemLibrary[oldName]) {
            put(itemLibrary, newName, { ...itemLibrary[newName], ...itemLibrary[oldName] });
            result.values += Object.keys(itemLibrary[oldName]).length;
            put(itemLibrary, oldName, undefined, true);
        }
        const moveCollection = (cols, local = false) => {
            if (!cols || cols[oldName] === undefined) return;
            result.values += (cols[oldName] || []).length;
            if (local) { cols[newName] = cols[oldName]; delete cols[oldName]; }
            else { put(cols, newName, cols[oldName]); put(cols, oldName, undefined, true); }
        };
        for (const persona of Object.values(personaData)) moveCollection(persona?.collections);
        for (const card of cards) moveCollection(card?.statusCollections);
        for (const actor of actors) moveCollection(actor.collections, true);
        if (nextState?.recently_deleted?.[oldName] !== undefined) {
            nextState.recently_deleted[newName] = nextState.recently_deleted[oldName];
            delete nextState.recently_deleted[oldName];
        }
    } else if (['library-update', 'library-rename', 'library-delete'].includes(type)) {
        const definition = (tracker.collections || []).find(col => col.id === collectionId);
        if (!definition) return null;
        if (type === 'library-rename' && !itemLibrary[collectionId]) return null;
        if (type === 'library-delete' && !Object.hasOwn(itemLibrary[collectionId] || {}, String(operation.itemName).toLowerCase())) return null;
        const library = { ...itemLibrary, [collectionId]: { ...itemLibrary[collectionId] } };
        if (type === 'library-delete') delete library[collectionId][String(operation.itemName).toLowerCase()];
        else {
            if (type === 'library-rename') delete library[collectionId][String(oldName).toLowerCase()];
            const fields = {};
            for (const field of definition.fields) if (isStaticField(field) && operation.itemData[field.name] !== undefined) fields[field.name] = operation.itemData[field.name];
            library[collectionId][String(type === 'library-rename' ? newName : operation.itemName).toLowerCase()] = fields;
        }
        return { writes, nextState: null, itemLibrary: library, result };
    } else return null;
    return { writes, nextState, result };
}

/** Targets are checked again by the host boundary before these assignments become visible. */
export function installSchemaWrites(writes) {
    for (const { target, key, value, remove } of writes) {
        if (remove) delete target[key];
        else target[key] = value;
    }
}
