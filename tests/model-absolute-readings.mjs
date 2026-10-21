import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeModelReadings } from '../src/tracker/extractor/status-extractor-readings.js';

function fixture() {
    const stats = [{ id: 'xp', name: 'Experience', type: 'number' }, { id: 'level', name: 'Rank', type: 'number' }];
    const settings = { globalStats: [], playerStats: stats, npcStats: stats,
        progression: { player: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } },
        npcTemplates: [{ id: 'fighter', statIds: ['xp', 'level'], progression: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } }] };
    const state = { player: { stats: { Experience: '90/100', Rank: '2' } },
        characters: [{ name: 'Mira', npcTemplateId: 'fighter', stats: { Experience: '40/100', Rank: '3' } }] };
    const cards = [{ name: 'Mira', npcTemplateId: 'fighter', aliases: [{ pattern: 'Healer' }], statusOverrides: { Experience: '70/100', Rank: '3' } }];
    const run = update => {
        const warnings = [];
        normalizeModelReadings(update, state, settings, { cards, warnings });
        return warnings;
    };
    return { state, settings, cards, run };
}

test('reader earned-only guard rejects lower absolute XP in nested, flat and current-fragment forms', () => {
    const { run, state } = fixture();
    for (const values of [{ Experience: '89/100' }, { experience: '89' }, { Experience_current: '89' }, { Experience_now: '-1' }]) {
        for (const player of [{ stats: { ...values } }, { ...values }]) {
            const before = structuredClone(state);
            assert.equal(run({ player }).length, 1);
            assert.deepEqual(player.stats || player, {});
            assert.deepEqual(state, before);
        }
    }
});

test('higher custom XP totals remain absolute and exact echoes are silent', () => {
    const { run } = fixture();
    const earned = { player: { stats: { Experience: '119/100' } } };
    assert.deepEqual(run(earned), []);
    assert.equal(earned.player.stats.Experience, '119/100');
    const echo = { player: { stats: { Experience: '90.0/100.0' } } };
    assert.deepEqual(run(echo), []);
    assert.deepEqual(echo.player.stats, {});
});

test('NPC baseline uses chat first and card only for blank or absent chat XP, including aliases', () => {
    const { run, state } = fixture();
    const live = { characters: [{ name: 'Mira', stats: { Experience: '50/100' } }] };
    assert.deepEqual(run(live), []);
    state.characters[0].stats.Experience = '';
    for (const name of ['Mira', 'Healer']) {
        const reply = { characters: [{ name, stats: { Experience: '60/100' } }] };
        assert.equal(run(reply).length, 1);
        assert.deepEqual(reply.characters[0].stats, {});
    }
    state.characters = [];
    const echo = { characters: [{ name: 'Healer', stats: { Experience: '70/100' } }] };
    assert.deepEqual(run(echo), []);
    assert.deepEqual(echo.characters[0].stats, {});
});

test('new NPC XP can initialize while blank or invalid existing player XP cannot be invented', () => {
    const { state, run } = fixture();
    const fresh = { characters: [{ name: 'New', npcTemplateId: 'fighter', stats: { Experience: '20/100', Rank: '3' } }] };
    assert.deepEqual(run(fresh), []);
    assert.equal(fresh.characters[0].stats.Experience, '20/100');
    for (const existing of ['', 'unknown']) {
        state.player.stats.Experience = existing;
        const update = { player: { stats: { Experience: '20/100' } } };
        assert.equal(run(update).length, 1);
        assert.deepEqual(update.player.stats, {});
    }
});

test('malformed stored NPC XP is refused rather than treated as blank initialization', () => {
    const { state, run } = fixture();
    state.characters[0].stats.Experience = 'unknown';
    const update = { characters: [{ name: 'Mira', stats: { Experience: '80/100' } }] };
    assert.equal(run(update).length, 1);
    assert.deepEqual(update.characters[0].stats, {});
});

test('disabled progression permits ordinary XP edits and empty legacy delta objects are quiet', () => {
    const { state, settings } = fixture();
    settings.progression.player.enabled = false;
    const update = { globalDeltas: {}, player: { deltas: {}, stats: { Experience: '3/100' } } };
    const warnings = [];
    normalizeModelReadings(update, state, settings, { warnings });
    assert.deepEqual(warnings, []);
    assert.deepEqual(update, { player: { stats: { Experience: '3/100' } } });
});
