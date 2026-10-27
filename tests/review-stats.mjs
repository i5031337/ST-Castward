import { bindStatusModule } from './helpers/status-module.mjs';
import { bindTrackerUpdate } from './fixtures/tracker-update-bind.mjs';
import { bindCollectionUpdates } from './fixtures/collection-updates-bind.mjs';
import { buildActorState } from '../src/tracker/actor-calculation.js';
import * as constraints from '../src/tracker/status-update-constraints.js';
const bindConstraints = deps => Object.assign(deps, constraints);
import * as statValues from '../src/tracker/stat-value-utils.js';
import * as statFields from '../src/tracker/stat-field-utils.js';
import { groupIncomingStats } from '../src/tracker/status-update-parser.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as grants from '../src/tracker/level-grant-review.js';
import { mergePendingMemoryRows } from '../src/memory/memory-review.js';
import * as numeric from '../src/tracker/numeric-stat-bounds.js';
import { progressionFields } from '../src/tracker/progression-fields.js';
import { progressXp } from '../src/tracker/progression.js';
import { activeNpcSystem, npcStatsFor, npcTemplateFor, proposedNpcTemplate } from '../src/core/npc-templates.js';
import { sameStatReading } from '../src/tracker/stat-reading-equality.js';

import { normalizeModelReadings } from '../src/tracker/extractor/status-extractor-readings.js';
import { collectLevelTransitions } from '../src/tracker/extractor/status-level-grants.js';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');
const utils = readFileSync(new URL('../src/core/utils-format.js', import.meta.url), 'utf8');
const splitValue = new Function(`${utils.match(/export function splitValue\(value\) \{[\s\S]*?\n\}/)[0].replace('export ', '')}; return splitValue;`)();
const load = (path, names, deps) => names === 'bind' ? { bind: state => bindStatusModule(new URL(`../src/${path}`, import.meta.url), state, deps) } : new Function(...Object.keys(deps), source(path) + `\nreturn {${names}};`)(...Object.values(deps));

function harness({ state, cards = [], settings, openChat = true }) {
    let live = state;
    const message = { swipe_id: 0, extra: { sillynpc_applied: [], sillynpc_level_reading: {},
        sillynpc_reader_report: { swipe: 0, status: 'done', summary: '0 applied · 0 awaiting review' } } };
    const context = { chat: [message] };
    const globals = { buildActorState, activeNpcSystem, ...numeric, ...statValues, ...statFields, npcStatsFor, npcTemplateFor, proposedNpcTemplate, progressionFields, progressXp, sameStatReading,
        splitValue, ceilingFromValue: value => { const max = splitValue(value).max; return max && Number.isFinite(Number(max)) ? Number(max) : null; },
        getSettings: () => ({ statusTracker: settings }), getAllCharacters: () => cards,
        getContext: () => context, debugLog() {}, saveSettings() {}, LOG_PREFIX: '[test]', eventSource: { emit() {} } };
    const deps = { ...statValues, groupIncomingStats, loadStateFromMetadata: () => live,
        saveStateToMetadata: (state, options = {}) => {
            if (options.isCurrent && !options.isCurrent()) return false;
            options.beforeCommit?.();
            live = state; deps.committedState = state; return true;
        }, hasOpenChat: () => openChat,
        resolveCanonicalName: name => name, mayJoinScene: () => true, getCurrentPersonaName: () => live.player?.name || 'Player' };
    bindConstraints(deps);
    bindCollectionUpdates(deps, globals);
    bindTrackerUpdate(deps, globals);
    for (const path of ['status-stat-values', 'status-scene-presence']) {
        load(`tracker/${path}.js`, 'bind', globals).bind(deps);
    }
    const { buildUpdateFromChanges } = load('tracker/status-diff-review.js', 'buildUpdateFromChanges', {
        splitValue, debugLog() {}, primaryFieldName: () => 'name', itemKey: item => item.name });
    const { failedReviewedStats } = load('tracker/review-stat-outcomes.js', 'failedReviewedStats', { splitValue });
    const { resolvePendingChanges } = load('tracker/status-review.js', 'resolvePendingChanges', {
        ...globals, ...deps, ...grants, mergePendingMemoryRows, failedReviewedStats, buildUpdateFromChanges,
        getCurrentPersonaKey: () => 'player', activeNpcSystem: () => null, saveChatSoon() {},
        appliedChangesForCurrentSwipe: () => message.extra.sillynpc_applied,
        recordAppliedChanges: (_id, rows) => message.extra.sillynpc_applied.push(...rows) });
    return { message, state: () => live, preview: raw => {
        const update = structuredClone(raw);
        const warnings = [];
        normalizeModelReadings(update, live, settings, { cards, warnings });
        deps.sanitizeModelUpdate(update, live, settings, { warnings });
        const transitions = collectLevelTransitions(update, live, settings, { personaId: 'player' });
        const after = deps.applyUpdate(update, { dryRun: true });
        const { computeStateDiff } = load('tracker/status-diff-compare.js', 'computeStateDiff', { activeNpcSystem, npcTemplateFor, splitValue });
        const rows = computeStateDiff(live, after, settings);
        grants.prepareGrantReview([], rows, transitions);
        return { rows, after, warnings };
    }, apply: rows => {
        message.extra.sillynpc_pending = rows;
        // Match the inline review panel's submitted payload, including absent destinations.
        const accepted = rows.map(row => ({ ...row, after: String(row.after ?? ''),
            actor: row.actor ?? null, collectionId: row.collectionId ?? null }));
        return resolvePendingChanges(0, accepted);
    }, resolvePendingChanges };
}
const settings = { globalStats: [{ name: 'Heat', type: 'number' }], playerStats: [
    { name: 'HP', type: 'number', defaultValue: '' }, { name: 'Mood', options: ['Happy'] }],
    npcStats: [{ name: 'HP', type: 'number', defaultValue: '' }], collections: [] };
const blank = () => ({ global: { Heat: '1' }, player: { stats: { HP: '', Mood: 'Happy' }, collections: {} }, characters: [] });
const row = (kind, after, extra = {}) => ({ scope: 'player', actor: null, label: 'HP', kind, after, ...extra });

test('review initializes player and NPC pools regardless of current/maximum row order', () => {
    for (const scope of ['player', 'character']) for (const reverse of [false, true]) {
        const state = blank();
        if (scope === 'character') state.characters.push({ name: 'Ada', stats: { HP: '' }, collections: {} });
        const h = harness({ state, settings });
        const rows = [row('stat-max', '120', { scope, actor: scope === 'character' ? 'Ada' : null }),
            row('stat', '80', { scope, actor: scope === 'character' ? 'Ada' : null })];
        if (reverse) rows.reverse();
        assert.equal(h.apply(rows).applied, 2);
        assert.equal((scope === 'player' ? h.state().player : h.state().characters[0]).stats.HP, '80/120');
        assert.equal(h.message.extra.sillynpc_pending, undefined);
    }
});

test('review keeps the other half for a single acceptance and can explicitly remove a maximum', () => {
    const state = blank(); state.player.stats.HP = '5/10';
    const h = harness({ state, settings });
    assert.equal(h.apply([row('stat', '6')]).applied, 1);
    assert.equal(h.state().player.stats.HP, '6/10');
    assert.equal(h.apply([row('stat-max', '20')]).applied, 1);
    assert.equal(h.state().player.stats.HP, '6/20');
    assert.equal(h.apply([row('stat-max', '(none)')]).applied, 1);
    assert.equal(h.state().player.stats.HP, '6');
});

test('offstage reviewed stats apply to the saved card without admitting it to the scene', () => {
    const card = { id: 'ada', name: 'Ada', statusOverrides: { HP: '5/10' } };
    const h = harness({ state: blank(), settings, cards: [card] });
    assert.equal(h.apply([row('stat', '7', { scope: 'character', actor: 'Ada' })]).applied, 1);
    assert.equal(card.statusOverrides.HP, '7/10');
    assert.deepEqual(h.state().characters, []);
});

test('refused or skipped stat rows remain pending while valid rows apply', () => {
    for (const bad of [row('stat', 'Tense', { label: 'Mood' }), row('stat', 'oops'),
        row('stat', '7', { label: 'Removed field' }), row('stat-max', '120'),
        row('stat', '7', { scope: 'character', actor: 'Missing card' })]) {
        const h = harness({ state: blank(), settings });
        const result = h.apply([bad, row('stat', '2', { scope: 'global', label: 'Heat' })]);
        assert.equal(result.applied, 1);
        assert.equal(result.remaining, 1);
        assert.deepEqual(h.message.extra.sillynpc_pending, [{ ...bad, collectionId: null }]);
        assert.equal(h.state().global.Heat, '2');
        assert.ok(h.message.extra.sillynpc_reader_report.warnings.some(line => line.includes('awaiting review')));
        h.resolvePendingChanges(0, [], [], { discardAll: true });
        assert.equal(h.message.extra.sillynpc_pending, undefined);
    }
});

test('a refused state write retains the accepted stat for retry', () => {
    const h = harness({ state: blank(), settings, openChat: false });
    const result = h.apply([row('stat', '7')]);
    assert.equal(result.applied, 0);
    assert.equal(result.remaining, 1);
    assert.equal(h.message.extra.sillynpc_applied.length, 0);
});

test('a story stat followed by level growth is still recorded as successfully reviewed', () => {
    const levelSettings = { ...settings, playerStats: [...settings.playerStats,
        { id: 'xp', name: 'XP', type: 'number' }, { id: 'level', name: 'Level', type: 'number' }],
        progression: { player: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level',
            pointsPerLevel: 1, statIds: ['HP'] } } };
    levelSettings.playerStats = levelSettings.playerStats.map(stat => ({ ...stat, id: stat.id || stat.name }));
    const state = blank(); Object.assign(state.player.stats, { HP: '5/10', XP: '0/100', Level: '2' });
    const h = harness({ state, settings: levelSettings });
    const transition = { id: 't' };
    h.message.extra.sillynpc_applied.push({ transition });
    const reward = row('stat', '1', { grant: { id: 'g', transitionId: 't', actorId: 'player:player',
        xpName: 'XP', levelName: 'Level', newLevel: 2, gain: 1 } });
    const result = h.apply([row('stat', '6'), reward]);
    assert.equal(h.state().player.stats.HP, '7/11');
    assert.equal(result.remaining, 0);
    assert.equal(result.applied, 3);
});


test('absolute XP119 becomes reviewed Level2 and XP19 exactly once; rejection preserves baseline', () => {
    const xpSettings = { ...settings, playerStats: [
        { id: 'xp', name: 'XP', type: 'number' }, { id: 'level', name: 'Level', type: 'number', locked: true }],
        progression: { player: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } } };
    for (const accept of [true, false]) {
        const state = blank(); state.player.stats = { XP: '99/100', Level: '1' };
        const h = harness({ state, settings: xpSettings });
        const proposed = h.preview({ player: { stats: { XP: '119/100' } } });
        assert.deepEqual(proposed.warnings, []);
        assert.deepEqual(proposed.after.player.stats, { XP: '19/100', Level: '2' });
        assert.deepEqual(h.state().player.stats, { XP: '99/100', Level: '1' });
        assert.ok(proposed.rows.every(row => row.transition));
        h.message.extra.sillynpc_pending = proposed.rows;
        const accepted = accept ? proposed.rows : [];
        h.resolvePendingChanges(0, accepted);
        const expected = accept ? { XP: '19/100', Level: '2' } : { XP: '99/100', Level: '1' };
        assert.deepEqual(h.state().player.stats, expected);
        const recorded = h.message.extra.sillynpc_applied.length;
        h.resolvePendingChanges(0, proposed.rows);
        assert.deepEqual(h.state().player.stats, expected);
        assert.equal(h.message.extra.sillynpc_applied.length, recorded);
    }
});
