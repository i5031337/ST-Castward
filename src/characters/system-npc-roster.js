import { npcStatsFor } from '../core/npc-templates.js';
import { systemStatFields } from '../core/system-fields.js';
import { initialiseNpcStats, splitNpcStats } from '../tracker/stat-persistence.js';
import { captureRosterState, seedRosterPlaces, seedRosterMemories, removeSeededMemories, carriesNpcMemories } from './system-roster-state.js';

const CARDS = 'sillynpc_npcs';
const READS = 'sillynpc_roster_reads';
const SEEDED = 'sillynpc_roster_seeded';
const fields = ['name', 'color', 'category', 'aliases', 'profile', 'npcTemplateId',
    'imageUrl', 'images', 'imageFolder', 'imageTags', 'imageFit', 'defaultPortrait', 'presentation', 'lorebook'];

/** Local reuse preferences and saved NPCs are separate from exportable System rules. */
export function npcRoster(settings, name = settings.activeSystem) {
    return settings.systemNpcRosters?.[name];
}

export function rosterCharacters(settings) {
    return Object.values(settings.systemNpcRosters || {}).flatMap(roster => roster.cards || []);
}

export function normalizeNpcRosters(settings) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!object(settings.systemNpcRosters)) settings.systemNpcRosters = {};
    for (const [name, roster] of Object.entries(settings.systemNpcRosters)) {
        if (!object(roster)) { delete settings.systemNpcRosters[name]; continue; }
        roster.enabled = roster.enabled === true;
        roster.reusePlaces = roster.reusePlaces === true;
        const definition = settings.statusTracker?.presets?.[name]?.definition;
        if (definition && Object.hasOwn(roster, 'reuseMemories')) {
            definition.memories ||= {};
            if (!Object.hasOwn(definition.memories, 'carryOver')) {
                definition.memories.carryOver = roster.reuseMemories === true;
            }
        }
        delete roster.reuseMemories;
        roster.cards = (Array.isArray(roster.cards) ? roster.cards : [])
            .filter(card => object(card) && typeof card.id === 'string' && typeof card.name === 'string');
    }
}

function portableCard(card, settings) {
    const copy = {};
    for (const key of fields) {
        if (card[key] !== undefined) copy[key] = structuredClone(card[key]);
    }
    const system = settings.statusTracker.presets?.[settings.activeSystem]?.definition || {};
    // Preset application saves while its live projection is changing. The current
    // System's canonical fields remain authoritative for outgoing card carryover.
    const definitions = system.stats ? systemStatFields(system, 'npc', card)
        : npcStatsFor(card, settings.statusTracker, system);
    copy.statusOverrides = splitNpcStats(card.statusOverrides,
        definitions).innate;
    return copy;
}

function currentMetadata(settings, context) {
    if (context?.getCurrentChatId?.() === undefined) return null;
    const metadata = context.chatMetadata;
    return metadata?.sillynpc_system === settings.activeSystem ? metadata : null;
}

/** Publish changed portable values only; reopening an older copy must not undo newer edits. */
export function captureNpcRoster(settings, context) {
    const roster = npcRoster(settings);
    const metadata = currentMetadata(settings, context);
    if (!roster || !metadata) return false;
    if (!roster.enabled) return captureRosterState(roster, metadata);
    roster.cards ||= [];
    metadata[READS] ||= {};
    let changed = false;
    for (const card of metadata[CARDS] || []) {
        if (!card.id || !card.name?.trim()) continue;
        const portable = portableCard(card, settings);
        const signature = JSON.stringify(portable);
        if (metadata[READS][card.id] === signature) continue;
        const id = card.rosterSourceId || card.id;
        card.rosterSourceId = id;
        const at = roster.cards.findIndex(source => source.id === id);
        const source = { ...portable, id };
        if (at < 0) roster.cards.push(source);
        else roster.cards[at] = source;
        metadata[READS][card.id] = signature;
        changed = true;
    }
    return captureRosterState(roster, metadata, carriesNpcMemories(settings)) || changed;
}

/** Seed once, before play. Each chat owns its copies, deletions, memories and adventure state. */
export function seedNpcRoster(settings, context, makeId) {
    const roster = npcRoster(settings);
    const metadata = currentMetadata(settings, context);
    const name = settings.activeSystem;
    if (!metadata) return false;
    let changed = seedRosterPlaces(roster, metadata, context, name,
        settings.statusTracker.presets?.[name]?.definition?.locations?.enabled
            ?? settings.statusTracker.locations?.enabled);
    // A fresh chat may choose another System before play. Remove only automatically
    // seeded copies from the previous choice; manually created chat cards stay local.
    if (!context.chat?.some(message => message.is_user && !message.is_system)) {
        const outgoing = (metadata[CARDS] || []).filter(card => card.rosterSeedSystem && card.rosterSeedSystem !== name);
        if (outgoing.length) {
            const ids = new Set(outgoing.map(card => card.id));
            const systems = new Set(outgoing.map(card => card.rosterSeedSystem));
            metadata[CARDS] = metadata[CARDS].filter(card => !ids.has(card.id));
            metadata[SEEDED] = (metadata[SEEDED] || []).filter(system => !systems.has(system));
            for (const id of ids) if (metadata[READS]) delete metadata[READS][id];
            removeSeededMemories(metadata, ids);
            changed = true;
        }
    }
    if (!roster?.enabled || metadata[SEEDED]?.includes(name)) return changed;
    metadata[SEEDED] ||= [];
    metadata[SEEDED].push(name);
    if (context.chat?.some(message => message.is_user && !message.is_system)) return true;
    metadata[CARDS] ||= [];
    metadata[READS] ||= {};
    const system = settings.statusTracker.presets?.[name]?.definition || {};
    for (const source of roster.cards || []) {
        if (metadata[CARDS].some(card => card.rosterSourceId === source.id
            || card.name?.trim().toLowerCase() === source.name?.trim().toLowerCase())) continue;
        const card = portableCard(source, settings);
        card.id = makeId();
        card.rosterSourceId = source.id;
        card.rosterSeedSystem = name;
        card.autoLinkLorebook = false;
        card.statusOverrides = initialiseNpcStats(source.statusOverrides,
            npcStatsFor(card, settings.statusTracker, system));
        card.statusCollections = {};
        metadata[CARDS].push(card);
        seedRosterMemories(roster, metadata, card, carriesNpcMemories(settings));
        metadata[READS][card.id] = JSON.stringify(portableCard(card, settings));
    }
    return true;
}

/** Enabling adopts the current chat; disabling preserves the roster for later reuse. */
export function setNpcRosterEnabled(settings, context, name, enabled) {
    if (!settings.statusTracker.presets?.[name]) return;
    settings.systemNpcRosters ||= {};
    const roster = settings.systemNpcRosters[name] ||= { cards: [] };
    roster.enabled = enabled === true;
    if (name === settings.activeSystem) captureNpcRoster(settings, context);
}

export function setNpcRosterOption(settings, context, name, option, enabled) {
    if (option !== 'reusePlaces' || !settings.statusTracker.presets?.[name]) return;
    settings.systemNpcRosters ||= {};
    const roster = settings.systemNpcRosters[name] ||= { enabled: false, cards: [] };
    roster[option] = enabled === true;
    if (name === settings.activeSystem) captureNpcRoster(settings, context);
}
