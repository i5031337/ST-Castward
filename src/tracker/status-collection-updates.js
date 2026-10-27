import { getSettings } from '../core/settings.js';
import { saveSettings } from '../core/settings.js';
import { activeNpcSystem } from '../core/npc-templates.js';
import { collectionAppliesTo } from '../core/collection-targets.js';
import { collectionQuantityField } from '../core/collection-fields.js';
import { LOG_PREFIX, debugLog } from '../core/constants.js';
import { calculateCollectionUpdate } from './collection-calculation.js';

export function bind(deps) {
    // The existing reader drains preview diagnostics around its disposable update.
    const warnings = [];
    function recordCollectionWarnings(values) {
        warnings.push(...values);
    }
    function takeCollectionWarnings() {
        return [...new Set(warnings.splice(0))];
    }

    function calculate(actor, collectionId, update, { allowReplace = false, dryRun = false,
        operation = 'update', isManual = false } = {}) {
        const settings = getSettings();
        const tracker = settings.statusTracker;
        const system = activeNpcSystem(settings) ?? null;
        const scope = actor.name === deps.getCurrentPersonaName() ? 'player' : 'npc';
        const definition = tracker.collections.find(col => operation === 'update'
            ? col.id.toLowerCase() === collectionId.toLowerCase() : col.id === collectionId);
        const primary = definition?.fields.find(field => field.isPrimary)?.name || 'name';
        const hasIdentifier = item => {
            const name = item?.[primary] ?? item?.name;
            return name !== undefined && name !== null && !!String(name).trim();
        };
        const quantity = collectionQuantityField(definition);
        const amount = quantity ? update?.[quantity.name] ?? 1 : null;
        const validAddition = hasIdentifier(update) && (!quantity
            || typeof amount === 'number' && Number.isFinite(amount) && amount > 0);
        const rows = Array.isArray(update) ? update : Array.isArray(update?.replace) ? update.replace
            : update?.clear === true ? [] : update?.add || [];
        // Only additions/replacements consult tombstones. Remove/update/clear-only
        // operations, including offstage edits, must not load or repair chat state.
        const needsState = operation === 'remove'
            ? isManual && !!actor.collections?.[collectionId] && update !== undefined && update !== null
            : !!definition && (operation === 'add' ? validAddition
                : collectionAppliesTo(definition, scope, actor, system) && Array.isArray(rows) && rows.some(hasIdentifier));
        // Read committed tombstones, not applyUpdate's already-aged state clone.
        const state = needsState ? deps.committedState || deps.loadStateFromMetadata() : null;
        const result = calculateCollectionUpdate({ actor, collectionId, update,
            tracker, system, scope,
            tombstones: state?.recently_deleted ?? null, itemLibrary: settings.master_items || {},
            allowReplace, preview: dryRun, operation, isManual });
        if (result.collections !== undefined) actor.collections = result.collections;
        if (operation === 'update' && !definition) {
            console.warn(LOG_PREFIX, `Attempted to update non-existent collection: ${collectionId}`);
        }
        if (dryRun) warnings.push(...result.warnings);
        result.warnings.forEach(message => debugLog(message));
        deps.recordRefusedValues(result.refusedValues);
        if (!dryRun) {
            if (state && result.tombstones) state.recently_deleted = result.tombstones;
            if (result.libraryChanges.length) {
                settings.master_items ||= {};
                for (const change of result.libraryChanges) {
                    settings.master_items[change.collectionId] ||= {};
                    settings.master_items[change.collectionId][String(change.itemName).toLowerCase()] = change.fields;
                }
                saveSettings();
            }
        }
    }

    function applyCollectionUpdate(actor, collectionId, update, options) {
        calculate(actor, collectionId, update, options);
    }

    function addItem(actor, collectionId, itemData, options) {
        calculate(actor, collectionId, itemData, { ...options, operation: 'add' });
    }

    function removeItem(actor, collectionId, itemName, isManual = false) {
        calculate(actor, collectionId, itemName, { operation: 'remove', isManual });
    }

    Object.defineProperties(deps, {
        recordCollectionWarnings: { enumerable: true, configurable: true, get: () => recordCollectionWarnings },
        takeCollectionWarnings: { enumerable: true, configurable: true, get: () => takeCollectionWarnings },
        applyCollectionUpdate: { enumerable: true, configurable: true, get: () => applyCollectionUpdate },
        addItem: { enumerable: true, configurable: true, get: () => addItem },
        removeItem: { enumerable: true, configurable: true, get: () => removeItem },
    });
}
