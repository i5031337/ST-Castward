import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcProfileFollowups } from '../src/tracker/extractor/status-profile-followups.js';

function fixture() {
    const report = { status: 'done', summary: '1 applied · 2 awaiting review' };
    const message = { mes: 'Mira arrives.', swipe_id: 0, extra: { sillynpc_reader_report: report } };
    const f = { settings: { enabled: true, activeSystem: 'A', statusTracker: { enabled: true, autoGenerateNpcProfiles: true } },
        context: { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'chat' },
        report, message, persona: 'one', rules: 'original', pending: [{}, {}],
        sheet: { stats: { HP: '10/10' }, collections: { gear: [] } }, calls: [], commits: [], statuses: [], latest: 0 };
    f.generate = async (names, current) => {
        f.calls.push({ names, sheet: structuredClone(f.sheet) });
        await f.pause?.();
        if (current()) f.commits.push(structuredClone(f.sheet));
        return { generated: current() ? 1 : 0, failed: 0 };
    };
    f.dependencies = { getContext: () => f.context, getSettings: () => f.settings, getPersona: () => f.persona,
        latestIndex: () => f.latest, ruleSignature: () => f.rules, pendingChanges: () => f.pending,
        generate: (...args) => f.generate(...args), onChange: () => f.statuses.push(f.report.npcProfiles?.status) };
    f.queue = createNpcProfileFollowups(f.dependencies);
    f.schedule = () => f.queue.schedule(0, ['Mira']);
    return f;
}

test('pending and partial review defer all profile work; final acceptance uses the reviewed sheet', async () => {
    const f = fixture();
    assert.deepEqual(await f.schedule(), { deferred: true });
    assert.deepEqual(f.calls, []);
    assert.equal(f.report.npcProfiles.status, 'waiting');
    f.sheet.stats.HP = '7/10'; f.pending.pop();
    assert.deepEqual(await f.queue.resume(0), { deferred: true });
    assert.deepEqual(f.calls, []);
    f.sheet.collections.gear.push({ name: 'Accepted lantern' }); f.pending = [];
    assert.deepEqual(await f.queue.resume(0), { generated: 1, failed: 0 });
    assert.deepEqual(f.calls[0].sheet, f.sheet);
    assert.deepEqual(f.calls[0].names, ['Mira']);
    assert.equal(f.report.npcProfiles.generated, 1);
    assert.equal(f.report.npcProfiles.status, 'done');
    await f.queue.resume(0);
    assert.equal(f.calls.length, 1);
});

test('rejecting all proposed changes fills from unchanged held state', async () => {
    const f = fixture();
    await f.schedule();
    f.pending = [];
    await f.queue.resume(0);
    assert.deepEqual(f.calls[0].sheet, { stats: { HP: '10/10' }, collections: { gear: [] } });
});

test('no pending review fills immediately and duplicate review events share one operation', async () => {
    const f = fixture(); f.pending = [];
    let finish;
    f.pause = () => new Promise(resolve => { finish = resolve; });
    const first = f.schedule();
    const second = f.queue.resume(0);
    await Promise.resolve();
    assert.equal(f.calls.length, 1);
    assert.equal(f.report.npcProfiles.status, 'running');
    finish();
    await Promise.all([first, second]);
    assert.equal(f.commits.length, 1);
});

test('disabled opt-in never creates a deferred operation', async () => {
    const f = fixture(); f.settings.statusTracker.autoGenerateNpcProfiles = false;
    await f.schedule();
    assert.equal(f.report.npcProfiles, undefined);
    assert.deepEqual(f.calls, []);
});

test('reply, swipe, chat, persona, System, rule, setting and latest-turn changes cancel stale work', async () => {
    const mutations = [
        f => { f.message.mes = 'Edited'; }, f => { f.message.swipe_id = 1; },
        f => { f.context.chat[0] = { ...f.message }; }, f => { f.context.chatMetadata = {}; },
        f => { f.context.getCurrentChatId = () => 'other'; }, f => { f.persona = 'two'; },
        f => { f.settings.activeSystem = 'B'; }, f => { f.rules = 'changed'; },
        f => { f.settings.enabled = false; }, f => { f.settings.statusTracker.enabled = false; },
        f => { f.settings.statusTracker.autoGenerateNpcProfiles = false; }, f => { f.latest = 1; },
    ];
    for (const mutate of mutations) {
        const f = fixture(); await f.schedule();
        mutate(f); f.pending = [];
        await f.queue.resume(0);
        assert.deepEqual(f.calls, []);
    }
});

test('Stop and reply invalidation cancel waiting and running follow-ups', async () => {
    for (const running of [false, true]) {
        const f = fixture();
        if (running) f.pending = [];
        let finish;
        f.pause = () => new Promise(resolve => { finish = resolve; });
        const pending = f.schedule();
        await Promise.resolve();
        f.queue.clear(0);
        finish?.();
        await pending;
        f.pending = []; await f.queue.resume(0);
        assert.equal(f.report.npcProfiles.status, 'cancelled');
        assert.deepEqual(f.commits, []);
    }
});

test('a replacement reading can start its own follow-up while a cancelled backend is still finishing', async () => {
    const f = fixture(); f.pending = [];
    let finish;
    f.pause = () => new Promise(resolve => { finish = resolve; });
    const first = f.schedule(); await Promise.resolve();
    f.queue.clear(); f.pause = undefined;
    const second = f.schedule();
    await second; finish(); await first;
    assert.equal(f.report.npcProfiles.status, 'done');
    assert.equal(f.calls.length, 2);
    assert.equal(f.commits.length, 1);
});

test('a saved waiting record can resume after review without storing a proposed sheet', async () => {
    const f = fixture(); await f.schedule();
    f.report.npcProfiles = JSON.parse(JSON.stringify(f.report.npcProfiles));
    const queue = createNpcProfileFollowups(f.dependencies);
    f.pending = []; f.sheet.stats.HP = '3/10';
    await queue.resume(0);
    assert.equal(f.calls[0].sheet.stats.HP, '3/10');
    assert.equal(f.report.npcProfiles.stats, undefined);
    assert.equal(f.report.npcProfiles.collections, undefined);
});
