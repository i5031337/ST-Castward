import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { npcProfileFollowupSummary } from '../src/tracker/extractor/status-profile-followups.js';
import { buildReportBreakdown } from '../src/tracker/extractor/status-report-counts.js';

const source = readFileSync(new URL('../src/tracker/extractor/status-extraction-report.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replaceAll('export function ', 'function ');

function harness() {
    const context = { chat: [{ swipe_id: 0, extra: {} }] };
    let saves = 0;
    const api = new Function('getContext', 'saveChatSoon', 'appliedChangesForCurrentSwipe', 'buildReportBreakdown', 'getSettings', 'npcProfileFollowupSummary', `${source}\nreturn {
        getExtractionReport, startExtractionReport, finishExtractionReport,
        clearExtractionReport, extractionSwipe,
    };`)(() => context, () => saves++, id => context.chat[id]?.extra?.sillynpc_applied || [], buildReportBreakdown,
        () => ({ statusTracker: {} }), npcProfileFollowupSummary);
    return { context, api, saves: () => saves };
}

test('reader status stays with the reply and survives a redraw', () => {
    const { context, api, saves } = harness();
    const message = api.startExtractionReport(0);
    assert.deepEqual(api.getExtractionReport(0), { status: 'running' });

    const report = { swipe: 0, status: 'done', summary: '1 applied', output: { why: { HP: 'Hit' } } };
    context.chat[0].extra.sillynpc_applied = [{}];
    api.finishExtractionReport(0, message, report);
    assert.deepEqual(api.getExtractionReport(0), { ...report, breakdown: buildReportBreakdown([{}]) });
    assert.equal(saves(), 1);

    context.chat[0].swipe_id = 1;
    assert.equal(api.getExtractionReport(0), null);
    context.chat[0].swipe_id = 0;
    assert.deepEqual(api.getExtractionReport(0), { ...report, breakdown: buildReportBreakdown([{}]) });
    api.clearExtractionReport(0);
    assert.equal(api.getExtractionReport(0), null);
});

test('review counts follow live rows after apply and reload while diagnostics survive', () => {
    const { context, api } = harness();
    const message = api.startExtractionReport(0);
    message.extra.sillynpc_pending = Array.from({ length: 106 }, () => ({}));
    api.finishExtractionReport(0, message, { swipe: 0, status: 'done',
        summary: '0 applied · 106 awaiting review · 2 warnings · 1 NPC profile(s) generated', warnings: ['Kept'], output: {} });
    assert.match(api.getExtractionReport(0).summary, /^0 applied · 106 awaiting review/);
    message.extra.sillynpc_applied = message.extra.sillynpc_pending;
    delete message.extra.sillynpc_pending;
    assert.match(api.getExtractionReport(0).summary, /^106 applied · 0 awaiting review/);
    context.chat[0] = JSON.parse(JSON.stringify(message));
    assert.match(api.getExtractionReport(0).summary, /0 awaiting review · 2 warnings · 1 NPC profile/);
    assert.deepEqual(api.getExtractionReport(0).warnings, ['Kept']);
    context.chat[0].extra.sillynpc_applied = [];
    context.chat[0].extra.sillynpc_reader_report.reviewedMemories = 2;
    assert.match(api.getExtractionReport(0).summary, /^2 applied · 0 awaiting review/);
});

test('late reader result cannot attach to a replacement message or swipe', () => {
    const { context, api, saves } = harness();
    const oldMessage = api.startExtractionReport(0);
    context.chat[0] = { swipe_id: 0, extra: {} };
    api.finishExtractionReport(0, oldMessage,
        { swipe: 0, status: 'done', summary: 'old', output: {} });
    assert.equal(api.getExtractionReport(0), null);
    assert.equal(saves(), 0);

    const current = api.startExtractionReport(0);
    context.chat[0].swipe_id = 1;
    api.finishExtractionReport(0, current,
        { swipe: 0, status: 'done', summary: 'old swipe', output: {} });
    assert.equal(api.getExtractionReport(0), null);
    assert.equal(saves(), 0);
});

test('breakdown separates change types and actors, then follows review and reload', () => {
    const { context, api } = harness();
    const message = context.chat[0];
    message.extra.sillynpc_applied = [
        { scope: 'player', kind: 'stat' },
        { scope: 'player', kind: 'stat-max' },
        { scope: 'global', kind: 'stat' },
        { scope: 'character', actor: 'Mira', kind: 'item-change' },
        { scope: 'character', actor: 'Mira', kind: 'item-change' },
    ];
    const reward = { scope: 'player', kind: 'item-add', grant: { id: 'reward' } };
    message.extra.sillynpc_pending = [reward,
        { scope: 'character', actor: 'Mira', kind: 'memory-add' },
        { scope: 'character', actor: 'Mira', kind: 'item-remove' }];
    api.finishExtractionReport(0, message, { swipe: 0, status: 'done', summary: '5 applied · 3 awaiting review' });
    let breakdown = api.getExtractionReport(0).breakdown;
    assert.equal(breakdown.applied, '2 stats, 2 item fields');
    assert.equal(breakdown.pending, '1 item removed, 1 memory, 1 level reward change');
    assert.deepEqual(breakdown.rows, [
        { target: 'Player', applied: '1 stat', pending: '1 level reward change' },
        { target: 'World', applied: '1 stat', pending: 'None' },
        { target: 'NPC: Mira', applied: '2 item fields', pending: '1 item removed, 1 memory' },
    ]);
    message.extra.sillynpc_applied.push(reward);
    message.extra.sillynpc_pending = [];
    message.extra.sillynpc_reader_report.reviewedMemories = 1;
    context.chat[0] = JSON.parse(JSON.stringify(message));
    breakdown = api.getExtractionReport(0).breakdown;
    assert.equal(breakdown.pending, 'None');
    assert.equal(breakdown.applied, '2 stats, 2 item fields, 1 memory, 1 level reward change');
    assert.deepEqual(breakdown.rows.at(-1), { target: 'Reviewed memories', applied: '1 memory', pending: 'None' });
});

test('earned XP and level-ups are explicit, including configured field names', () => {
    const transition = { xpName: 'Experience', levelName: 'Rank', oldLevel: 4, newLevel: 5 };
    const rows = [
        { scope: 'character', actor: 'Mudkip', kind: 'stat', label: 'Experience', before: '9', after: '0', transition },
        { scope: 'character', actor: 'Mudkip', kind: 'stat', label: 'Rank', before: '4', after: '5', transition },
    ];
    const breakdown = buildReportBreakdown(rows);
    assert.equal(breakdown.applied, '1 XP update, 1 level-up');
    assert.equal(breakdown.rows[0].applied, '1 XP update, 1 level-up (Rank: 4 → 5)');
    assert.equal(buildReportBreakdown([], rows).rows[0].pending, '1 XP update, 1 level-up (Rank: 4 → 5)');
    assert.equal(buildReportBreakdown([{ ...rows[1], before: '5', after: '4' }]).applied, '1 level change');
});

test('initial NPC XP and Level are stats rather than progression, including saved review rows', () => {
    for (const before of ['', undefined, null, '(none)']) {
        const rows = ['XP', 'Level'].map(label => ({
            scope: 'character', actor: 'Mira', kind: 'stat', label, before,
            after: label === 'XP' ? '0' : '5',
        }));
        const breakdown = buildReportBreakdown(rows, rows);
        assert.equal(breakdown.applied, '2 stats');
        assert.equal(breakdown.pending, '2 stats');
        assert.deepEqual(breakdown.rows, [{ target: 'NPC: Mira', applied: '2 stats', pending: '2 stats' }]);
        assert.deepEqual(buildReportBreakdown(JSON.parse(JSON.stringify(rows))), buildReportBreakdown(rows));
    }
    const transition = { xpName: 'Experience', levelName: 'Rank' };
    assert.equal(buildReportBreakdown(['Experience', 'Rank'].map(label => ({
        scope: 'character', actor: 'Mira', kind: 'stat', label, before: '', after: '5', transition,
    }))).applied, '2 stats');
    assert.equal(buildReportBreakdown([
        { scope: 'character', actor: 'Mira', kind: 'stat', label: 'XP', before: '0', after: '1' },
        { scope: 'character', actor: 'Mira', kind: 'stat', label: 'Level', before: '0', after: '1' },
    ]).applied, '1 XP update, 1 level-up');
});

test('profile follow-up status is shown separately from the changing review counts', () => {
    const { context, api } = harness();
    const message = context.chat[0];
    message.extra.sillynpc_pending = [{}, {}];
    const report = { swipe: 0, status: 'done', summary: '0 applied · 2 awaiting review',
        npcProfiles: { status: 'waiting', names: ['Mira'] } };
    api.finishExtractionReport(0, message, report);
    assert.match(api.getExtractionReport(0).summary, /2 awaiting review · NPC profiles waiting for review/);
    message.extra.sillynpc_pending = [];
    report.npcProfiles = { status: 'done', generated: 1, failed: 0 };
    assert.match(api.getExtractionReport(0).summary, /0 awaiting review · 1 NPC profile/);
    assert.doesNotMatch(report.summary, /profile/);
});
