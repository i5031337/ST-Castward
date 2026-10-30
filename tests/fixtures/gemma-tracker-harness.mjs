import { bindCollectionUpdates } from './collection-updates-bind.mjs';
import { bindStatusModule } from '../helpers/status-module.mjs';
import * as statValueUtils from '../../src/tracker/stat-value-utils.js';
import { groupIncomingStats } from '../../src/tracker/status-update-parser.js';
import { readFileSync } from 'node:fs';
import { createBuiltinSystem } from '../../src/core/builtin-systems.js';
import { projectSystemTracker } from '../../src/core/system-schema.js';
import { defaultTrackerSettings } from '../../src/core/settings-tracker-defaults.js';
import * as templates from '../../src/core/npc-templates.js';
import * as profiles from '../../src/core/profile-fields.js';
import * as constants from '../../src/core/constants.js';
import * as bounds from '../../src/tracker/numeric-stat-bounds.js';
import { progressXp } from '../../src/tracker/progression.js';
import { buildLocationProposals } from '../../src/locations/location-proposals.js';
import { normalizeCollectionUpdates } from '../../src/tracker/extractor/status-collection-normalize.js';
import { normalizeModelReadings } from '../../src/tracker/extractor/status-extractor-readings.js';

// Host boundaries only: fixtures may supply chat cards, but have no lore, persona profile or chat UI.
// Production prompt/schema, numeric normalization, sanitation and place review are exercised.
export async function harness(systemId, state, { chat = [], cards = [] } = {}) {
    const system = createBuiltinSystem(systemId);
    const settings = { ...structuredClone(defaultTrackerSettings), ...projectSystemTracker(system) };
    const root = { activeSystem: system.name, statusTracker: { ...settings, presets: { [system.name]: { definition: system } } } };
    profiles.setProfileSettingsProvider(() => root);
    const status = { getCurrentPersonaName: () => 'Alex', getPlayerCard: () => null,
        findCardForName: name => cards.find(card => card.name.toLowerCase() === String(name).toLowerCase()) || null,
        statsInSystem: (values, scope, actor) => Object.fromEntries(Object.entries(values || {})
            .filter(([name]) => (scope === 'npcStats' ? templates.npcStatsFor(actor, settings) : settings[scope]).some(stat => stat.name === name))) };
    const cache = new Map();
    async function load(path) {
        const url = new URL(path, import.meta.url);
        if (cache.has(url.href)) return cache.get(url.href);
        const filename = url.pathname;
        if (filename.endsWith('/status-logic.js')) return status;
        if (filename.endsWith('/st-context.js')) return { getContext: () => ({ chat }) };
        if (filename.endsWith('/core/settings.js')) return { getSettings: () => root, saveSettings() {} };
        if (filename.endsWith('/events.js')) return { eventSource: { emit() {} } };
        if (filename.endsWith('/characters/character-repository.js')) return { getAllCharacters: () => cards, getChatCharacters: () => cards.filter(card => card.npcCreation) };
        if (filename.endsWith('/default-portraits.js')) return { poolTags: () => [], strangerKind: () => undefined };
        if (filename.endsWith('/chat/chat.js')) return { charactersMentionedIn: (text, candidates = cards) => candidates.filter(card =>
            String(text).toLowerCase().includes(card.name.toLowerCase())) };
        if (filename.endsWith('/activated-lore.js')) return { charactersFromActivatedLore: () => [] };
        if (filename.endsWith('/api/api.js')) return { liveFactsFor: card => ({ stats: card.statusOverrides, collections: card.statusCollections }) };
        if (filename.endsWith('/core/utils.js')) return load('../../src/core/utils-format.js');
        let source = readFileSync(url, 'utf8');
        const dependencies = {};
        const imports = [...source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*/gm)];
        for (const match of imports) {
            const dependency = await load(new URL(match[2], url).href);
            for (const binding of match[1].split(',')) {
                const [original, local] = binding.trim().split(/\s+as\s+/);
                dependencies[local || original] = dependency[original];
            }
        }
        source = source.replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];\s*/gm, '');
        const exported = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(match => match[1]);
        if (/export \*/.test(source)) {
            // Shared constants are pure and need no replacement.
            if (filename.endsWith('/constants.js')) return constants;
            throw new Error(`Unsupported reexport: ${filename}`);
        }
        source = source.replaceAll('export ', '');
        const result = new Function(...Object.keys(dependencies), `${source}\nreturn {${exported.join(',')}};`)(...Object.values(dependencies));
        cache.set(url.href, result);
        return result;
    }
    // Keep template/profile singleton providers shared with directly imported normalizers.
    cache.set(new URL('../../src/core/npc-templates.js', import.meta.url).href, templates);
    cache.set(new URL('../../src/core/profile-fields.js', import.meta.url).href, profiles);
    const prompt = await load('../../src/tracker/extractor/status-extractor-prompt.js');
    const schema = await load('../../src/tracker/extractor/status-extractor-schema.js');
    const deps = { ...statValueUtils, findCardForName: status.findCardForName, allowedValues: def => def.options || [],
        findMatchingStatKey: (values, name) => Object.keys(values).find(key => key.toLowerCase() === name.toLowerCase()) };
    const host = { ...templates, ...profiles, ...constants, ...bounds, ...statValueUtils,
        getSettings: () => root, saveSettings() {}, getAllCharacters: () => cards,
        getContext: () => ({ chat }), eventSource: { emit() {} } };
    const bind = file => bindStatusModule(new URL(`../../src/tracker/${file}.js`, import.meta.url), deps, host);
    bind('status-stat-values');
    bind('status-update-constraints');
    deps.groupIncomingStats = groupIncomingStats;
    Object.assign(deps, { committedState: {}, getCurrentPersonaName: () => 'Alex' });
    bindCollectionUpdates(deps, host);
    Object.assign(deps, {
        resolveCanonicalName: name => name,
        mayJoinScene: () => true,
        loadStateFromMetadata: () => deps.committedState,
        hasOpenChat: () => true,
        saveStateToMetadata() {},
    });
    bind('status-apply-update');
    return { settings, system, basePrompt: () => prompt.buildReaderBasePrompt(settings), collectLeadUp: prompt.collectLeadUp,
        prompt: (text, earlier = [], options = {}) => prompt.buildUserPrompt(state, text, settings, earlier, options),
        schema: schema.buildExtractionSchema(settings, { state }),
        normalize(raw, text) {
            const update = structuredClone(raw);
            const warnings = normalizeCollectionUpdates(update, settings, state);
            normalizeModelReadings(update, state, settings, { warnings });
            deps.sanitizeModelUpdate(update, state, settings, { warnings });
            const places = buildLocationProposals(state, update.locations, { provenance: { messageId: 1 } });
            // This is the same dry run used by review. It applies configured stat rules,
            // XP progression and collection updates to a disposable state copy.
            deps.committedState = structuredClone(state);
            deps.committedState.player.name ||= 'Alex';
            const diagnostics = {};
            const effective = deps.applyUpdate(update, { dryRun: true, admitCharacters: true, warnings, diagnostics });
            const collectionWarnings = [...diagnostics.collectionWarnings];
            const holdings = { player: { ...structuredClone(state.player), name: 'Alex' }, characters: structuredClone(state.characters) };
            for (const [owner, proposed] of [[holdings.player, update.player], ...(update.characters || []).map(actor => {
                let held = holdings.characters.find(entry => entry.name.toLowerCase() === actor.name.toLowerCase());
                if (!held) { held = { name: actor.name, npcTemplateId: actor.npcTemplateId || 'character', collections: {} }; holdings.characters.push(held); }
                return [held, actor];
            })]) {
                for (const [id, change] of Object.entries(proposed?.collections || {})) {
                    const result = deps.applyCollectionUpdate(owner, id, change, { dryRun: true });
                    collectionWarnings.push(...result.warnings);
                }
            }
            const playerXp = update.player?.stats?.XP ?? update.player?.XP;
            const progression = playerXp === undefined ? null : progressXp(state.player.stats.XP, playerXp, state.player.stats.Level);
            return { update, effective, progression, holdings,
                warnings: [...warnings, ...places.warnings, ...new Set(collectionWarnings)], places: places.rows };
        } };
}
export { constants, bounds };
