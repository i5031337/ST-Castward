import { getContext } from '../../../../../st-context.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { getLibraryCharacters } from '../characters/character-repository.js';
import { calculateSchemaOperation, installSchemaWrites } from './schema-operation-calculation.js';

/** Schema edits can run without a chat; an existing chat state must keep its owner. */
export function runSchemaOperation(operation, { peekState, saveState, personaKey }) {
    const read = () => {
        const settings = getSettings();
        const context = getContext();
        const chatId = context?.getCurrentChatId?.();
        const metadata = context?.chatMetadata;
        return { settings, tracker: settings.statusTracker, systemKey: settings.activeSystem,
            system: settings.statusTracker.presets?.[settings.activeSystem]?.definition,
            metadata, chatId, boundSystemKey: metadata?.sillynpc_system, personaKey: personaKey(),
            state: chatId === undefined ? null : metadata?.sillynpc_status_state ?? peekState(chatId),
            cards: getLibraryCharacters(), personaData: settings.personaData, itemLibrary: settings.master_items };
    };
    const source = read();
    const expected = operation.expected;
    if (expected && (expected.library !== source.itemLibrary
        || !source.tracker.collections?.includes(expected.definition)
        || expected.collectionId !== undefined && expected.collectionId !== operation.collectionId
        || Object.hasOwn(expected, 'itemKey') && source.itemLibrary?.[operation.collectionId]?.[expected.itemKey] !== expected.item)) return null;
    if (!operation.type.startsWith('library-') && source.state && source.boundSystemKey
        && source.boundSystemKey !== source.systemKey) return null;
    const field = operation.field;
    if (field && !(operation.type === 'stat'
        ? [...(source.system?.stats?.world || []), ...(source.system?.stats?.character || []),
            ...(source.tracker.globalStats || []), ...(source.tracker.playerStats || []), ...(source.tracker.npcStats || [])].includes(field)
        : source.tracker.collections?.find(col => col.id === operation.collectionId)?.fields.includes(field))) return null;
    if (operation.definition && !source.tracker.collections?.includes(operation.definition)) return null;
    const revision = value => JSON.stringify(value);
    const readings = ['tracker', 'system', 'state', 'cards', 'personaData', 'itemLibrary'];
    const revisions = Object.fromEntries(readings.map(key => [key, revision(source[key])]));
    const isCurrent = () => {
        const current = read();
        return ['settings', 'tracker', 'systemKey', 'system', 'metadata', 'chatId', 'boundSystemKey', 'personaKey', 'state', 'personaData', 'itemLibrary']
            .every(key => current[key] === source[key])
            && current.cards.length === source.cards.length && current.cards.every((card, i) => card === source.cards[i])
            && readings.every(key => revision(current[key]) === revisions[key]);
    };
    const calculated = calculateSchemaOperation({ tracker: source.tracker, system: source.system,
        state: source.state, cards: source.cards, personaData: source.personaData,
        itemLibrary: source.itemLibrary, operation });
    if (!calculated || !isCurrent()) return null;
    const install = () => {
        installSchemaWrites(calculated.writes);
        if (calculated.itemLibrary) {
            if (source.itemLibrary) source.itemLibrary[operation.collectionId] = calculated.itemLibrary[operation.collectionId];
            else source.settings.master_items = calculated.itemLibrary;
        }
    };
    if (calculated.nextState) {
        // Schema migration is not a tracker correction: history must use the new keys too.
        const beforeCommit = () => { Object.assign(source.state, calculated.nextState); install(); };
        if (saveState(source.state, { label: 'Schema edited', isCurrent, beforeCommit }) !== true) return null;
    } else install();
    saveSettings();
    return calculated.result;
}
