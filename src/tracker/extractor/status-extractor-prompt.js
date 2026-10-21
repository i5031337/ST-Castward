import { buildLocationReaderNotes } from '../../locations/location-context.js';
import { collectionQuantityField } from '../../core/collection-fields.js';
import { collectionAppliesTo } from '../../core/collection-targets.js';
import { describeNpcTemplates, npcTemplates, npcStatsFor } from '../../core/npc-templates.js';
import { promptText } from '../../prompts/prompt-texts.js';
import { getContext } from '../../../../../../st-context.js';
import { debugLog } from '../../core/constants.js';
import { describeReaderStats } from '../stat-prompt-definitions.js';
import { strangerValues } from './status-extractor-schema.js';
import { describeCollections, buildDeltaExample, describeCurrentState, describeLimits } from './status-extractor-prompt-state.js';
import { describeAbsentButNamed } from './status-extractor-prompt-offstage.js';
import { isPoolStat } from '../numeric-stat-bounds.js';
import { isReaderStat } from '../stat-update-policy.js';
import { isImageOnlyMessage } from '../ui/status-ui-placement.js';
import { getCurrentPersonaName } from '../status-logic.js';
import { progressionFields } from '../progression-fields.js';

/**
 * Extra notes for the reader, from whoever registered one.
 *
 * A registration rather than a list of things Castward knows about, so something built
 * beside the tracker - a registry of places the story has been, say - can tell the reader
 * what it needs to without Castward knowing it exists. Each provider is asked on every
 * extraction and may answer nothing.
 *
 * @type {Array<(context: { state: object, messageText: string }) => ({ heading: string, text: string }|null|undefined)>}
 */
const extractionNoteProviders = [];

/**
 * Adds a note to the reader's prompt, placed after the limits. The provider is called with
 * the state and the message being read, and returns `{ heading, text }` or nothing.
 *
 * @returns {() => void} Removes it again.
 */
export function registerExtractionNotes(provider) {
    if (typeof provider !== 'function') return () => {};
    extractionNoteProviders.push(provider);
    return () => {
        const at = extractionNoteProviders.indexOf(provider);
        if (at !== -1) extractionNoteProviders.splice(at, 1);
    };
}

/** Every registered note, as prompt sections. A provider that throws is skipped, not fatal. */
function describeExtractionNotes(state, messageText) {
    const sections = [];
    for (const provider of extractionNoteProviders) {
        try {
            const note = provider({ state, messageText });
            const heading = String(note?.heading ?? '').trim();
            const text = String(note?.text ?? '').trim();
            if (heading && text) sections.push(`\n### ${heading.toUpperCase()}\n${text}`);
        } catch (err) {
            debugLog('An extraction note could not be built', err);
        }
    }
    return sections.join('\n');
}

/** Show final recovery readings for live pools while keeping progression out of restorative effects. */
function describePoolRecovery(state, settings) {
    const owners = [
        { label: 'World', stats: state?.global, definitions: settings.globalStats || [] },
        { label: 'Player', stats: state?.player?.stats, definitions: settings.playerStats || [],
            progression: progressionFields(settings, { isPlayer: true }) },
        ...(state?.characters || []).filter(actor => actor?.name && !actor.offstage).map(actor => ({
            label: actor.name, stats: actor.stats, definitions: npcStatsFor(actor, settings),
            progression: progressionFields(settings, { actor }),
        })),
    ];
    const entries = owners.flatMap(owner => (owner.definitions || []).flatMap(stat => {
        if (!stat?.name || !isReaderStat(stat) || !['number', 'bar'].includes(stat.type)) return [];
        if ([owner.progression?.xpName, owner.progression?.levelName].includes(stat.name)
            || /^(?:xp|exp|experience(?: points?)?|level(?: bonus)?)$/i.test(stat.name)) return [];
        const reading = String(owner.stats?.[stat.name] ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
        if (!reading) return [];
        const current = Number(reading[1]), maximum = Number(reading[2]);
        if (!(maximum > current && current >= 0)) return [];
        return [`${owner.label}.${stat.name} ${current}/${maximum} can recover to ${maximum}/${maximum}.`];
    }));
    if (!entries.length) return '';
    return 'For complete recovery, report each affected pool at its existing maximum.\n'
        + 'Sound sleep followed by waking refreshed, effective healing, or recharging can establish complete recovery when field rules permit.\n'
        + 'Match recovery to the affected owner and pools.\n'
        + 'Report an intermediate final reading for partial recovery.\n'
        + 'Affected pools:\n' + entries.join('\n');
}

/** Keep narrated harm and healing aligned with a configured health pool. */
function describeInjuryConsequence(settings) {
    const health = (settings.playerStats || []).find(stat => isReaderStat(stat)
        && ['number', 'bar'].includes(stat.type) && isPoolStat(stat)
        && /\b(?:hp|health|hit points|vitality)\b/i.test(`${stat.name || ''} ${stat.purpose || ''} ${stat.guidance || ''}`));
    return health ? `Report bodily injury as a lower resulting reading in player.stats.${health.name}.\nReport effective wound care or healing as a higher resulting reading in that field.\nInclude any text condition change separately.\nEstimate a conservative improvement and report the resulting reading.` : '';
}

/** Separate the unresolved player turn from history already accounted for. */
function readerEvidence(leadUp) {
    let freshStart = leadUp.length;
    while (freshStart > 0 && String(leadUp[freshStart - 1]).startsWith('[Player (')) freshStart--;
    return {
        earlier: leadUp.slice(0, freshStart).join('\n---\n'),
        userTurn: leadUp.slice(freshStart).join('\n---\n'),
    };
}

/** Builds the reader request from state, the fresh exchange and older context. */
function readerValues(state, messageText, trackerSettings, leadUp = [], { strangers = [] } = {}) {
    const evidence = readerEvidence(leadUp);
    const exchangeText = [evidence.userTurn, messageText].filter(Boolean).join('\n');
    return {
        playerName: getCurrentPersonaName(),
        state: describeCurrentState(state, trackerSettings) || '(empty)',
        offstage: describeAbsentButNamed(state, exchangeText, trackerSettings),
        limits: describeLimits(trackerSettings, state),
        npcFields: describeReaderStats(trackerSettings, { initializeNpc: true }),
        xpProgression: progressionFields(trackerSettings, { isPlayer: true }).enabled
            || (trackerSettings.npcTemplates || []).some(template => template.progression?.enabled) ? 'on' : '',
        // Whatever else has asked to be told to the reader - see registerExtractionNotes.
        notes: [describeNpcTemplates(), describeExtractionNotes(state, messageText),
            state?.locations?.enabled ? buildLocationReaderNotes(state, messageText, leadUp) : ''].filter(Boolean).join('\n'),
        locationReminder: state?.locations?.enabled
            ? 'Include the top-level boolean "locationChanged": true for a changed scene location, false otherwise.' : '',
        poolRecovery: describePoolRecovery(state, trackerSettings),
        injuryConsequence: describeInjuryConsequence(trackerSettings),
        ...strangerValues(strangers),
        collections: describeCollections(trackerSettings),
        collectionExample: buildDeltaExample(trackerSettings),
        minimalReply: buildMinimalExample(state, trackerSettings),
        changedReply: buildChangedExample(state, trackerSettings),
        newNpcReply: buildNewNpcExample(trackerSettings, state?.locations?.enabled),
        ...evidence,
        message: messageText,
        reasons: trackerSettings.extractionReasons === false ? '' : 'on',
    };
}

export function buildUserPrompt(state, messageText, trackerSettings, leadUp = [], options = {}) {
    return promptText('reader', readerValues(state, messageText, trackerSettings, leadUp, options));
}

/**
 * Collect bounded history and the fresh player turn preceding this assistant reply.
 * Fresh user prose is retained in full, even with older context disabled. An earlier
 * assistant reply closes the exchange; its user turn must never be charged again.
 */
export function collectLeadUp(messageId, count) {
    const chat = getContext()?.chat || [];
    const index = Number(messageId);
    if (!Number.isInteger(index) || index <= 0 || index >= chat.length) return [];
    const readable = message => message && !message.is_system && !isImageOnlyMessage(message)
        && typeof message.mes === 'string' && message.mes.trim();
    let freshStart = index;
    for (let i = index - 1; i >= 0; i--) {
        const message = chat[i];
        if (!readable(message)) continue;
        if (!message.is_user) break;
        freshStart = i;
    }
    const budget = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const out = [];
    for (let i = Math.max(0, Math.min(index - budget, freshStart)); i < index; i++) {
        const message = chat[i];
        if (!readable(message)) continue;
        const who = message.is_user ? `Player (${message.name || getCurrentPersonaName()})` : 'Narrator';
        const text = i >= freshStart ? message.mes : message.mes.slice(-1200);
        out.push(`[${who}] ${text}`);
    }
    return out;
}
/**
 * A quiet reply, in the cast this setup actually has.
 *
 * Small models copy the shape of an example far more reliably than they follow a
 * description of it, and an example is only useful if it is about them: a hard-coded
 * '"Stamina": "12/20"' teaches a model about a stat that may not exist here, and invites it
 * to report one that does not.
 *
 * The no-change case is common and should have a concrete example too.
 */
// Exported for the tests, as buildUserPrompt is.
export function buildMinimalExample(state, trackerSettings = {}) {
    const present = (state?.characters || []).map(c => c?.name).filter(Boolean);
    return JSON.stringify({
        ...(trackerSettings.extractionReasons === false ? {} : { why: {} }),
        ...(state?.locations?.enabled ? { locationChanged: false } : {}),
        global: {},
        player: {},
        characters: present.map(name => ({ name })),
    });
}

/** Show a populated NPC entry even when the current scene has no cast. */
export function buildNewNpcExample(trackerSettings = {}, locationsEnabled = false) {
    const template = npcTemplates()[0];
    const stats = Object.fromEntries((template ? npcStatsFor({ npcTemplateId: template.id }, trackerSettings) : trackerSettings.npcStats || [])
        .filter(stat => stat?.name)
        .map(stat => [stat.name, '<initial reading>']));
    return JSON.stringify({
        ...(locationsEnabled ? { locationChanged: false } : {}),
        global: {},
        player: {},
        characters: [{
            name: '<exact NPC name from the story>',
            ...(npcTemplates().length > 1 ? { npcTemplateId: template.id } : {}),
            ...(Object.keys(stats).length ? { stats } : {}),
        }],
    }, null, 2);
}

/** Show a changed value only when this system has a stat to name in the example. */
function buildChangedExample(state, trackerSettings) {
    const cast = (state?.characters || []).filter(c => c?.name);
    const npc = cast[0];
    const changedStat = (definitions, values, progression) => {
        const editable = (definitions || []).filter(stat => stat?.name && isReaderStat(stat)
            && (!progression?.enabled || stat.name !== progression.levelName)
            && stat.name.toLowerCase() !== 'level bonus');
        for (const stat of editable) {
            const held = Object.entries(values || {}).find(([name]) => name.toLowerCase() === stat.name.toLowerCase())?.[1];
            const match = String(held ?? '').match(/^\s*(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?\s*$/);
            if (!match) continue;
            const current = Number(match[1]);
            const earnedXp = progression?.enabled && stat.name === progression.xpName;
            const next = earnedXp ? current + 1 : current > 0 ? current - 1 : current + 1;
            return { [stat.name]: `${Number(next.toPrecision(12))}${match[2] === undefined ? '' : `/${match[2]}`}` };
        }
        return editable.length ? { [editable[0].name]: '<new value>' } : null;
    };
    const playerStats = changedStat(trackerSettings.playerStats, state?.player?.stats,
        progressionFields(trackerSettings, { isPlayer: true }));
    const npcStats = npc && changedStat(npcStatsFor(npc, trackerSettings), npc.stats,
        progressionFields(trackerSettings, { actor: npc }));
    const collectionFor = target => (trackerSettings.collections || [])
        .find(c => c?.id && (collectionAppliesTo(c, target, target === 'npc' ? npc || {} : undefined)));
    const collectionChange = (col, verb) => {
        if (!col) return undefined;
        const primaryDef = (col.fields || []).find(f => f.isPrimary);
        const primary = primaryDef?.name || 'name';
        const identifier = primaryDef?.type === 'number' ? 1 : primaryDef?.type === 'boolean' ? true : '<item identifier>';
        const quantity = collectionQuantityField(col);
        return { [col.id]: verb === 'add'
            ? { add: [{ [primary]: identifier, ...(quantity ? { [quantity.name]: 1 } : {}) }] }
            : { remove: [quantity ? { [primary]: identifier, [quantity.name]: 1 } : identifier] } };
    };
    const player = {};
    if (playerStats) player.stats = playerStats;
    const playerCollection = collectionChange(collectionFor('player'), 'add');
    if (playerCollection) player.collections = playerCollection;
    const characters = cast.map(actor => ({ name: actor.name }));
    if (npcStats) characters[0].stats = npcStats;
    const npcCollection = collectionChange(collectionFor('npc'), 'remove');
    if (npcCollection && characters.length) characters[0].collections = npcCollection;
    if (!Object.keys(player).length && !characters.some(c => c.stats || c.collections)) return '';
    return JSON.stringify({
        ...(trackerSettings.extractionReasons === false ? {} : {
            why: playerStats ? { [`Player.${Object.keys(playerStats)[0]}`]: '<short quote from the latest message>' } : {},
        }),
        ...(state?.locations?.enabled ? { locationChanged: false } : {}),
        global: {},
        player,
        characters,
    });
}
