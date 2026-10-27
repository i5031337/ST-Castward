import { npcStatsFor, proposedNpcTemplate } from '../core/npc-templates.js';
import { calculateFieldValue } from './stat-field-calculation.js';
import { findMatchingStatKey } from './stat-field-utils.js';
import { mergeStatValue, combineStatValue, getInitialStatValue } from './stat-value-utils.js';
import { groupIncomingStats } from './status-update-parser.js';
import { progressXp } from './progression.js';
import { progressionFields } from './progression-fields.js';
import { calculateCollectionUpdate } from './collection-calculation.js';
import { buildActorState, calculateActorStats } from './actor-calculation.js';

function warnClamped(warnings, owner, key, incoming, merged) {
    const wanted = String(incoming ?? '').split('/')[0].trim();
    const used = String(merged ?? '').split('/')[0].trim();
    if (wanted && Number.isFinite(Number(wanted)) && Number(wanted) !== Number(used)) {
        warnings.push(`${owner} · ${key}: "${incoming}" adjusted: exceeds the pool maximum; using "${merged}".`);
    }
}

function collectCollections(source, collectionIds) {
    const collections = { ...(source.collections || {}) };
    for (const key of Object.keys(source)) {
        const lower = key.toLowerCase();
        if (collectionIds.has(lower) && !['stats', 'collections', 'name'].includes(lower)) collections[key] = source[key];
    }
    return collections;
}

function cardLookup(cards) {
    const names = new Map(), regexes = [];
    cards.forEach((card, index) => {
        if (card.name) names.set(card.name.toLowerCase(), index);
        for (const alias of card.aliases || []) {
            if (alias.isRegex) {
                try { regexes.push({ regex: new RegExp(alias.pattern, 'i'), index }); } catch { /* invalid saved alias */ }
            } else if (alias.pattern) names.set(alias.pattern.toLowerCase(), index);
        }
    });
    return { names, regexes };
}

/** Calculate a full tracker update using captured data, without host reads or writes. */
export function calculateTrackerUpdate({ state, tracker, system = null, cards = [], itemLibrary = {},
    actorDecisions = [], castDecisions = state.castDecisions || {}, playerIdentity = {}, update,
    policy = {}, timestamp }) {
    const { preview = false, admitCharacters = false, allowReplace = false,
        verbatim = false, progressionResolved = false } = policy;
    const nextState = structuredClone(state);
    const result = { nextState, cardChanges: [], libraryChanges: [], warnings: [], collectionWarnings: [],
        refusedValues: [], offstageComparisons: [], offstageSkipped: [] };
    const workingCards = structuredClone(cards);
    const library = structuredClone(itemLibrary);
    const lookup = cardLookup(workingCards);
    const stateMap = new Map(nextState.characters.filter(actor => actor && typeof actor.name === 'string')
        .map(actor => [actor.name.toLowerCase(), actor]));
    const collectionIds = new Set(tracker.collections.map(collection => collection.id.toLowerCase()));
    const cardPatches = new Map();

    const patchCard = (index, fields) => {
        if (index === undefined) return;
        const patch = { ...cardPatches.get(index), ...structuredClone(fields) };
        cardPatches.set(index, patch);
        if (!preview) Object.assign(workingCards[index], structuredClone(fields));
    };
    const constrain = (definition, incoming, held, owner, key) => {
        const reading = calculateFieldValue(definition, incoming, held);
        result.refusedValues.push(...reading.refusedValues);
        result.warnings.push(...reading.warnings.map(warning => `${owner} · ${key}: ${warning}`));
        return reading.value;
    };
    const applyCollections = (actor, source, scope) => {
        const collections = collectCollections(source, collectionIds);
        for (const [id, reading] of Object.entries(collections)) {
            const calculated = calculateCollectionUpdate({ actor, collectionId: id, update: reading,
                tracker, system, scope,
                itemLibrary: library, allowReplace, preview });
            if (calculated.collections !== undefined) actor.collections = calculated.collections;
            result.collectionWarnings.push(...calculated.warnings);
            result.refusedValues.push(...calculated.refusedValues);
            result.libraryChanges.push(...calculated.libraryChanges);
            if (!preview) for (const change of calculated.libraryChanges) {
                library[change.collectionId] ||= {};
                library[change.collectionId][String(change.itemName).toLowerCase()] = structuredClone(change.fields);
            }
        }
        return Object.keys(collections).length > 0;
    };
    const skipActor = (actor, reason) => {
        const metadata = new Set(['name', 'stats', 'collections', 'boundto', 'offstage', 'npcTemplateId', 'profile']);
        for (const key of Object.keys(actor.stats || actor)) {
            if (!metadata.has(key) && !collectionIds.has(key.toLowerCase())) {
                result.warnings.push(`${actor.name || 'NPC'} · ${key}: skipped: ${reason}.`);
            }
        }
    };

    for (const key of Object.keys(update.global || {})) {
        const actual = Object.keys(nextState.global).find(name => name.toLowerCase() === key.toLowerCase()) || key;
        const definition = tracker.globalStats.find(stat => stat.name.toLowerCase() === actual.toLowerCase());
        if (!definition) {
            result.warnings.push(`World · ${key}: skipped: no configured stat matches this name.`);
            continue;
        }
        const merged = mergeStatValue(nextState.global[actual], update.global[key], { verbatim });
        warnClamped(result.warnings, 'World', actual, update.global[key], merged);
        nextState.global[actual] = constrain(definition, merged, nextState.global[actual], 'World', actual);
    }

    if (update.player) {
        const player = nextState.player;
        const validKeys = new Set(tracker.playerStats.map(stat => stat.name.toLowerCase()));
        const groups = groupIncomingStats(update.player.stats || update.player,
            name => {
                const matched = findMatchingStatKey(player.stats, name) || name;
                return validKeys.has(matched.toLowerCase()) ? matched : null;
            }, key => validKeys.has(key.toLowerCase()),
            key => ['name', 'stats', 'collections'].includes(key.toLowerCase()) || collectionIds.has(key.toLowerCase()),
            key => result.warnings.push(`Player · ${key}: skipped: no configured stat matches this name.`));
        const { xpName, levelName, enabled } = progressionFields(tracker, { isPlayer: true, system });
        const xpGroup = groups.get(xpName);
        const rawXp = xpGroup?.whole ?? xpGroup?.current;
        const progress = enabled && !verbatim && !progressionResolved && rawXp !== undefined
            ? progressXp(player.stats[xpName], rawXp, player.stats[levelName]) : null;
        for (const [key, group] of groups) {
            if (progress && (key === xpName || key === levelName && progress.levelsGained > 0)) continue;
            const definition = tracker.playerStats.find(stat => stat.name.toLowerCase() === key.toLowerCase());
            const merged = combineStatValue(player.stats[key], group, definition, { verbatim });
            warnClamped(result.warnings, 'Player', key, group.current ?? group.whole, merged);
            player.stats[key] = constrain(definition, merged, player.stats[key], 'Player', key);
        }
        if (progress) {
            player.stats[xpName] = progress.xp;
            if (progress.levelsGained > 0) player.stats[levelName] = progress.level;
        }
        applyCollections(player, update.player, 'player');
    }

    for (const incoming of Array.isArray(update.characters) ? update.characters : []) {
        if (!incoming.name) { skipActor(incoming, 'the NPC name is missing'); continue; }
        const captured = actorDecisions.find(decision => decision.name === incoming.name);
        const initialIndex = lookup.names.get(incoming.name.toLowerCase())
            ?? lookup.regexes.find(entry => entry.regex.test(incoming.name))?.index;
        const canonical = captured?.canonicalName ?? workingCards[initialIndex]?.name ?? String(incoming.name).trim();
        const lower = canonical.toLowerCase();
        const playerNames = [nextState.player?.name, playerIdentity.name].filter(Boolean).map(name => String(name).trim().toLowerCase());
        if (captured?.allowed === false || castDecisions[lower]
            || [incoming.name, canonical].some(name => playerNames.includes(String(name).trim().toLowerCase()))) {
            skipActor(incoming, 'this character is excluded from the NPC scene'); continue;
        }
        let actor = stateMap.get(lower);
        const index = lookup.names.get(lower) ?? lookup.regexes.find(entry => entry.regex.test(incoming.name))?.index;
        const card = workingCards[index];
        if (!actor && !admitCharacters) {
            skipActor(incoming, 'the NPC is not present in the scene'); continue;
        }
        if (!actor) {
            if (!card) {
                result.offstageSkipped.push(incoming.name);
                skipActor(incoming, 'the NPC is offstage and has no saved card'); continue;
            }
            actor = buildActorState({ name: card.name, state: nextState, tracker, system, cards: workingCards });
            const before = structuredClone(actor);
            const selected = proposedNpcTemplate(card, incoming, system);
            if (selected) actor.npcTemplateId = selected.id;
            const definitions = npcStatsFor(actor, tracker, system);
            for (const stat of definitions) if (actor.stats[stat.name] === undefined) {
                actor.stats[stat.name] = getInitialStatValue(stat.defaultValue);
            }
            const calculated = calculateActorStats({ actor, update: incoming, tracker: { ...tracker, npcStats: definitions },
                system, verbatim, progressionResolved, skipProgression: selected?.id !== card.npcTemplateId });
            actor = calculated.actor;
            result.warnings.push(...calculated.warnings);
            result.refusedValues.push(...calculated.refusedValues);
            const hasCollections = applyCollections(actor, incoming, 'npc');
            const fields = { statusOverrides: { ...(card.statusOverrides || {}), ...actor.stats } };
            if (selected) {
                fields.npcTemplateId = selected.id;
                if (!preview) {
                    nextState.npcTemplateAssignments ||= {};
                    nextState.npcTemplateAssignments[card.id || card.name.toLowerCase()] = selected.id;
                }
            }
            if (hasCollections) fields.statusCollections = structuredClone(actor.collections || {});
            patchCard(index, fields);
            result.offstageComparisons.push({ actor: structuredClone(actor), before });
            continue;
        }
        const selected = proposedNpcTemplate(actor.npcTemplateId ? actor : card || actor, incoming, system);
        const assigned = selected && actor.npcTemplateId !== selected.id;
        if (assigned) {
            actor.npcTemplateId = selected.id;
            nextState.npcTemplateAssignments ||= {};
            nextState.npcTemplateAssignments[actor.id || lower] = selected.id;
            for (const stat of npcStatsFor(actor, tracker, system)) if (actor.stats[stat.name] === undefined) {
                actor.stats[stat.name] = getInitialStatValue(stat.defaultValue);
            }
        }
        const calculated = calculateActorStats({ actor, update: incoming, tracker, system, verbatim,
            progressionResolved, skipProgression: !!assigned });
        Object.assign(actor, calculated.actor);
        result.warnings.push(...calculated.warnings);
        result.refusedValues.push(...calculated.refusedValues);
        const fields = {};
        if (card && calculated.changedStatKeys.length) {
            fields.statusOverrides = { ...(card.statusOverrides || {}) };
            for (const key of calculated.changedStatKeys) fields.statusOverrides[key] = actor.stats[key];
        }
        if (assigned && card) fields.npcTemplateId = selected.id;
        if (applyCollections(actor, incoming, 'npc') && card) fields.statusCollections = structuredClone(actor.collections || {});
        if (Object.keys(fields).length) patchCard(index, fields);
    }
    nextState.timestamp = timestamp;
    result.cardChanges = [...cardPatches].map(([cardIndex, fields]) => ({ cardIndex, fields }));
    return result;
}
