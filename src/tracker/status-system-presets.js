import { chatHasStarted, getChatSystem, hasOpenChat, rememberChatSystem, resetUnplayedChatState } from './status-session-context.js';
import { normalizeTrackerProgression } from '../core/progression-config.js';
import { getSettings, saveSettings, defaultSettings, normaliseStatDefs } from '../core/settings.js';
import { normaliseStatUpdatePolicies } from './stat-update-policy.js';
import { systemStatFields } from '../core/system-fields.js';
import { debugLog } from '../core/constants.js';
import { normalizeSystemDefinition, projectSystemTracker, SYSTEM_SCHEMA_VERSION } from '../core/system-schema.js';

const SYSTEM_EXCLUDED_ROOT = new Set([
    // Characters, persona records, and items are not System rules.
    'characters', 'personaData', 'master_items', 'systemNpcRosters',
    // The library itself, and which system is open.
    'statusTracker', 'activeSystem', 'useActiveSystemForNewChats', 'newChatSystem', 'version', 'enabled',
    // User-level image settings, including retired backend keys from old exports.
    'imageBackend', 'geminiImageModel', 'imageSaveRoute',
    'loreProfileId', 'imageProfileId',
    // Your window, not your world.
    'popupWidth', 'popupHeight', 'menuFontScale',
]);

const PROJECTED_TRACKER_KEYS = new Set(['globalStats', 'characterStats', 'playerStats', 'npcStats', 'collections', 'progression', 'npcTemplates', 'locations',
    'hudLayout', 'showGlobalStats', 'showNpcPortraits']);

const SYSTEM_EXCLUDED_TRACKER = new Set([
    // The library lives inside statusTracker; a system must never contain itself.
    'presets',
    // Which connection reads, what it is capable of, and what it is allowed to spend.
    'extractionProfileId', 'scanProfileId',
    // Ignore retired checkpoint settings in old exported profiles.
    'systemAutoSaveMinutes', 'systemCheckpointsKept',
    'extractionMaxTokens', 'scanMaxTokens', 'extractionUseSchema',
    // Whether the tracker runs at all is not a property of a ruleset.
    'enabled',
]);

/** A deep copy of everything except the named keys. */
function copyExcept(source, excluded) {
    const out = {};
    for (const [key, value] of Object.entries(source || {})) {
        if (excluded.has(key)) continue;
        out[key] = structuredClone(value);
    }
    return out;
}

/** Writes a captured block back, skipping anything that block is not allowed to set. */
function assignExcept(target, source, excluded) {
    for (const [key, value] of Object.entries(source || {})) {
        if (excluded.has(key)) continue;
        target[key] = structuredClone(value);
    }
}

/** Convert a saved/imported profile at one boundary; discard embedded world data. */
function migratePreset(name, preset) {
    if (!preset || typeof preset !== 'object') return preset;
    const clean = { ...preset };
    delete clean.world;
    clean.metadata = clean.metadata || {
        name: name || clean.name || 'System', description: '', author: 'User',
    };
    const displayName = clean.metadata.name || name;
    clean.metadata = { ...clean.metadata, name: displayName };
    if (clean.config) {
        clean.config = copyExcept(clean.config, new Set(['characters', 'personaData', 'master_items', 'systemWorldArchive', 'systemNpcRosters']));
        if (clean.config.statusTracker) clean.config.statusTracker = copyExcept(clean.config.statusTracker, SYSTEM_EXCLUDED_TRACKER);
    }
    clean.definition = normalizeSystemDefinition(preset.definition || preset, { name: displayName });
    clean.config ||= {};
    if (clean.config.statusTracker) clean.config.statusTracker = copyExcept(clean.config.statusTracker, PROJECTED_TRACKER_KEYS);
    else clean.config = copyExcept(clean.config, PROJECTED_TRACKER_KEYS);
    return clean;
}

function migrateSavedPresets(settings) {
    const presets = settings.statusTracker?.presets || {};
    let changed = false;
    let activeMigrated = false;
    for (const [name, preset] of Object.entries(presets)) {
        if (!preset || (preset.definition?.schemaVersion === SYSTEM_SCHEMA_VERSION && Array.isArray(preset.definition?.npcTemplates) && preset.definition?.progression?.player?.assignment && typeof preset.definition?.locations?.enabled === 'boolean' && typeof preset.definition?.memories?.carryOver === 'boolean' && !preset.world
            && ![...PROJECTED_TRACKER_KEYS].some(key => Object.hasOwn(preset.config?.statusTracker || preset.config || {}, key))
            && !['characters', 'personaData', 'master_items', 'systemWorldArchive', 'systemNpcRosters']
                .some(key => Object.hasOwn(preset.config || {}, key)))) continue;
        presets[name] = migratePreset(name, preset);
        activeMigrated ||= name === settings.activeSystem;
        changed = true;
    }
    const active = presets[settings.activeSystem]?.definition;
    if (active) {
        if (activeMigrated) Object.assign(settings.statusTracker, projectSystemTracker(active));
        settings.statusTracker.progression ||= structuredClone(active.progression);
        settings.statusTracker.npcTemplates = active.npcTemplates;
        settings.statusTracker.locations = structuredClone(active.locations);
        for (const stat of settings.statusTracker.npcStats || []) {
            if (!stat.id) stat.id = systemStatFields(active, 'npc').find(field => field.name === stat.name)?.id;
        }
    }
    if (changed) saveSettings();
    return changed;
}

/** Writes the active system back to its slot. Always called before switching away. */
function captureActiveSystem() {
    const settings = getSettings();
    const active = settings.activeSystem;
    const existing = settings.statusTracker.presets?.[active];
    if (!active || !existing) return false;
    saveSystemPreset(active,
        existing.metadata?.description ?? '', existing.metadata?.author ?? 'User');
    return true;
}

/** The system currently in use. */
function getActiveSystem() {
    return getSettings().activeSystem || '';
}

/** What makes one configuration recognisably the same system as another. */
function systemSignature(source) {
    // Either shape: a profile saved since systems carried everything nests its tracker
    // settings, one saved before that holds them flat.
    const config = source?.config || source;
    const tracker = source?.definition ? projectSystemTracker(source.definition) : config?.statusTracker || config || {};
    return JSON.stringify([
        (tracker.globalStats || []).map(s => s?.name),
        (tracker.npcStats || []).map(s => s?.name),
        (tracker.playerStats || []).map(s => s?.name),
        (tracker.collections || []).map(c => c?.id),
    ]);
}

function unusedSystemName(base) {
    if (!systemNameTaken(base)) return base;
    for (let i = 2; ; i++) if (!systemNameTaken(`${base} ${i}`)) return `${base} ${i}`;
}

function systemNameTaken(name, exceptKey) {
    return Object.hasOwn(Object.prototype, name)
        || Object.entries(getSettings().statusTracker.presets || {}).some(([key, profile]) =>
            key !== exceptKey && (key === name || profile?.metadata?.name === name));
}

/** Library keys remain stable so existing chats and local rosters keep their owner. */
function editSystemDetails(key, name, subtitle) {
    name = String(name || '').trim();
    migrateSavedPresets(getSettings());
    const profile = getSettings().statusTracker.presets?.[key];
    if (!profile || !name || systemNameTaken(name, key)) return false;
    profile.metadata = { ...profile.metadata, name, description: String(subtitle || '').trim() };
    profile.definition.name = name;
    profile.definition.metadata = { ...profile.definition.metadata, description: profile.metadata.description };
    saveSettings();
    return true;
}

/** Copy rules, including unsaved active controls, without selecting another System. */
function duplicateSystem(key) {
    const settings = getSettings();
    if (!settings.statusTracker.presets?.[key]) return null;
    if (key === settings.activeSystem) captureActiveSystem();
    const source = settings.statusTracker.presets[key];
    const name = unusedSystemName(`${source.metadata?.name || key} (copy)`);
    const copy = migratePreset(name, structuredClone(source));
    copy.metadata.name = name;
    copy.definition.name = name;
    copy.definition.id = crypto.randomUUID();
    settings.statusTracker.presets[name] = copy;
    const roster = settings.systemNpcRosters?.[key];
    if (roster) settings.systemNpcRosters[name] = structuredClone(roster);
    saveSettings();
    return copy;
}

/**
 * Gives the configuration already in use a system to belong to.
 *
 * Runs once, when nothing is marked active. The configuration you are working in is
 * matched against the saved systems by which stats and collections it defines - a
 * configuration built from "Energy RPG" is still recognisably that system.
 * With no match, the live configuration becomes a system of its own.
 *
 * @returns {boolean} Whether a migration happened.
 */
function migrateToActiveSystem() {
    const settings = getSettings();
    migrateSavedPresets(settings);
    if (settings.activeSystem) return false;

    const st = settings.statusTracker;
    const presets = st.presets || {};
    const live = systemSignature(st);
    const matches = Object.keys(presets)
        .filter(name => systemSignature(presets[name] || {}) === live);

    // Two systems that define the same stats cannot be told apart, so neither is claimed.
    const name = matches.length === 1
        ? matches[0]
        : unusedSystemName('Default System');

    const existing = presets[name];
    saveSystemPreset(name,
        existing?.metadata?.description ?? '', existing?.metadata?.author ?? 'User');
    settings.activeSystem = name;
    rememberChatSystem();
    saveSettings();
    debugLog(`Configuration adopted by system: ${name}`);
    return true;
}

/**
 * Makes a system the one in use.
 *
 * @returns {boolean} False when there is no such system, or it is already active.
 */
function setActiveSystem(name) {
    const settings = getSettings();
    migrateSavedPresets(settings);
    const target = settings.statusTracker.presets?.[name];
    if (!target || settings.activeSystem === name) return false;
    // A chat adopts its first System on open. Restoring that recorded System is allowed;
    // selecting another one here would reinterpret live values without a field mapping.
    if (chatHasStarted() && getChatSystem() !== name) return false;

    captureActiveSystem();
    applySystemPreset(target);
    settings.activeSystem = name;
    if (hasOpenChat() && !chatHasStarted()
        && getChatSystem() !== name) resetUnplayedChatState();
    rememberChatSystem();
    saveSettings();
    debugLog(`Active system: ${name}`);
    return true;
}

/**
 * Starts a new system from the shipped defaults, with nobody in it.
 *
 * The old flow was "save current as", which asks you to remember to do it and leaves no
 * way to begin from a clean sheet - a new ruleset always started as a copy of the last.
 *
 * @returns {boolean} False when the name is missing or already taken.
 */
function createSystem(name) {
    const settings = getSettings();
    const st = settings.statusTracker;
    if (!name || systemNameTaken(name)) return false;
    if (chatHasStarted()) return false;

    captureActiveSystem();

    // Reset by the same rule the capture uses, so a new system starts from the defaults in
    // everything it owns. Resetting a named handful meant prompts and review
    // thresholds quietly carried over from whichever system you happened to be in.
    const defaults = structuredClone(defaultSettings);
    assignExcept(st, defaults.statusTracker, SYSTEM_EXCLUDED_TRACKER);
    assignExcept(settings, defaults, SYSTEM_EXCLUDED_ROOT);

    saveSystemPreset(name);
    st.presets[name].definition.npcTemplates = [];
    delete st.presets[name].definition.legacyNpcTemplateId;
    settings.activeSystem = name;
    if (hasOpenChat() && !chatHasStarted()
        && getChatSystem() !== name) resetUnplayedChatState();
    rememberChatSystem();
    saveSettings();
    return true;
}

/**
 * Saves the current status tracker configuration as a preset.
 */
function saveSystemPreset(name, description = '', author = 'User') {
    if (!name) return;
    const settings = getSettings();
    migrateSavedPresets(settings);
    const st = settings.statusTracker;
    
    const previous = st.presets?.[name];
    const displayName = previous?.metadata?.name || name;
    const profile = {
        version: '3.0.0',
        metadata: {
            name: displayName,
            description,
            author
        },
        config: {
            ...copyExcept(settings, SYSTEM_EXCLUDED_ROOT),
            statusTracker: copyExcept(st, SYSTEM_EXCLUDED_TRACKER),
        },
    };
    const liveDefinition = previous?.definition || normalizeSystemDefinition(profile, { name });
    // Stat/profile editors own canonical fields; collection and HUD controls still edit tracker projections.
    profile.definition = normalizeSystemDefinition({ ...liveDefinition,
        collections: st.collections ?? liveDefinition.collections,
        hud: { ...liveDefinition.hud,
            layout: st.hudLayout ?? liveDefinition.hud.layout,
            showWorld: st.showGlobalStats ?? liveDefinition.hud.showWorld,
            showNpcPortraits: st.showNpcPortraits ?? liveDefinition.hud.showNpcPortraits,
        },
        metadata: { description, author },
    }, { name: displayName });

    profile.config.statusTracker = copyExcept(profile.config.statusTracker, PROJECTED_TRACKER_KEYS);
    if (!st.presets) st.presets = {};
    st.presets[name] = profile;
    saveSettings();
}

/**
 * Applies a system preset to the current configuration.
 */
function applySystemPreset(profile) {
    if (!profile || !profile.config) return;
    const st = getSettings().statusTracker;
    const cfg = profile.config;
    
    const settings = getSettings();

    // Two shapes. A profile saved since systems carried everything keeps its tracker
    // settings under `statusTracker`; one saved before that, or exported to share a
    // ruleset, holds a flat handful of tracker keys directly. Both load, and neither
    // touches a setting it does not define.
    if (cfg.statusTracker) {
        assignExcept(st, cfg.statusTracker, SYSTEM_EXCLUDED_TRACKER);
        assignExcept(settings, cfg, new Set([...SYSTEM_EXCLUDED_ROOT, 'displayStyle']));
    } else {
        assignExcept(st, cfg, new Set([...SYSTEM_EXCLUDED_TRACKER, 'displayStyle']));
    }

    if (profile.definition) {
        const projected = projectSystemTracker(normalizeSystemDefinition(profile.definition));
        Object.assign(st, projected);
    }

    // A stat list from an older profile may predate either field.
    for (const stat of st.playerStats || []) {
        if (stat.format === undefined) stat.format = '{{value}}';
        if (stat.maxStatValue === undefined) stat.maxStatValue = '100';
    }

    /* The other door a schema comes through. normalizeSettings runs on load and never sees
       this one, so a system saved before Meter was renamed to Number would arrive holding
       'bar' - and only the systems somebody had saved would misbehave, which is the kind of
       half-migration that takes weeks to be reported. */
    for (const listName of ['globalStats', 'npcStats', 'playerStats']) {
        normaliseStatDefs(st[listName]);
    }
    normaliseStatUpdatePolicies(st);
    normalizeTrackerProgression(st, profile.definition);
    for (const stat of st.npcStats || []) {
        if (!stat.id) stat.id = systemStatFields(profile.definition, 'npc').find(field => field.name === stat.name)?.id;
    }

    // The theme was called displayStyle and lived in config; it is menuStyle at the root
    // now, and carried like anything else. Old profiles still name the old one.
    if (cfg.displayStyle !== undefined) {
        const legacyThemeMap = {
            'modern': 'modern-dark',
            'minimal': 'default',
            'compact': 'default'
        };
        settings.menuStyle = legacyThemeMap[cfg.displayStyle] || cfg.displayStyle;
    }

    saveSettings();
}

function deleteSystemPreset(name) {
    if (!name) return;
    const settings = getSettings();
    if (!settings.statusTracker.presets?.[name]) return;
    delete settings.statusTracker.presets[name];
    if (settings.systemNpcRosters) delete settings.systemNpcRosters[name];
    saveSettings();
}

function importSystemPreset(jsonText) {
    const profile = JSON.parse(jsonText);
    if (!profile || typeof profile !== 'object'
        || (!profile.config && ![1, SYSTEM_SCHEMA_VERSION].includes(profile.schemaVersion) && !profile.definition)
        || !(profile.metadata?.name || profile.name)) {
        throw new Error('Invalid System Profile format.');
    }
    const settings = getSettings();
    if (!settings.statusTracker.presets) settings.statusTracker.presets = {};
    const requested = profile.metadata?.name || profile.name;
    let name = requested;
    for (let number = 2; systemNameTaken(name); number++) name = `${requested} (${number})`;
    settings.statusTracker.presets[name] = migratePreset(name, {
        ...profile, metadata: { ...profile.metadata, name },
    });
    saveSettings();
    return settings.statusTracker.presets[name];
}

export { SYSTEM_EXCLUDED_ROOT, SYSTEM_EXCLUDED_TRACKER, copyExcept, migratePreset, getActiveSystem, migrateToActiveSystem, setActiveSystem, createSystem, editSystemDetails, duplicateSystem, saveSystemPreset, applySystemPreset, deleteSystemPreset, importSystemPreset };
