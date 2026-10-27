import assert from 'node:assert/strict';
import test from 'node:test';
import { createTrackerLifecycle } from '../src/tracker/tracker-lifecycle.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function fixture(overrides = {}) {
    const calls = [];
    let session = { chatId: 'A', metadata: {}, systemKey: 'outgoing' };
    let persona = { key: 'current.png', name: 'Current' };
    const state = { player: { personaKey: 'current.png' } };
    const lifecycle = createTrackerLifecycle({
        readSession: () => ({ ...session }),
        clearState: () => calls.push('clear'),
        restoreSystem: () => { calls.push('system'); session.systemKey = 'recorded'; },
        restoreRoster: () => calls.push('roster'),
        recordedPersona: () => 'recorded.png',
        currentPersona: () => persona,
        restorePersona: async () => { calls.push('persona'); return false; },
        loadState: () => { calls.push('load'); return state; },
        selectPersona: (target, key) => {
            calls.push('select');
            if (target.player.personaKey === key) return false;
            target.player.personaKey = key;
            return true;
        },
        saveState: () => { calls.push('save'); return true; },
        rememberPersona: () => calls.push('remember'),
        refresh: value => { assert.equal(value, state); calls.push('refresh'); },
        ...overrides,
    });
    return { lifecycle, calls, get session() { return session; }, state,
        changeSession: value => { session = value; },
        changePersona: value => { persona = value; } };
}

test('chat activation selects rules and seeds the roster before restoring the player and loading views', async () => {
    const { lifecycle, calls } = fixture();
    assert.equal(await lifecycle.activateChat(), true);
    assert.deepEqual(calls, ['clear', 'system', 'roster', 'persona', 'load', 'refresh']);
});

test('restoration-owned persona events do not load or save partially activated chat state', async () => {
    const waiting = deferred();
    const f = fixture({ restorePersona: () => waiting.promise });
    const activation = f.lifecycle.activateChat();
    f.changePersona({ key: 'recorded.png', name: 'Recorded' });
    assert.equal(f.lifecycle.activatePlayer(), false);
    assert.deepEqual(f.calls, ['clear', 'system', 'roster']);
    waiting.resolve(true);
    assert.equal(await activation, true);
    assert.deepEqual(f.calls, ['clear', 'system', 'roster', 'load', 'refresh']);
});

test('a manual persona choice during restoration owns its own save and cancels the old continuation', async () => {
    const waiting = deferred();
    const f = fixture({ restorePersona: () => waiting.promise });
    const activation = f.lifecycle.activateChat();
    f.changePersona({ key: 'chosen.png', name: 'Chosen' });
    assert.equal(f.lifecycle.activatePlayer(), true);
    assert.equal(f.state.player.personaKey, 'chosen.png');
    assert.deepEqual(f.calls, ['clear', 'system', 'roster', 'load', 'select', 'save', 'remember', 'refresh']);
    waiting.resolve(true);
    assert.equal(await activation, false);
    assert.equal(f.calls.filter(value => value === 'load').length, 1);
});

test('only the latest overlapping chat activation loads state after persona restoration', async () => {
    const first = deferred();
    const second = deferred();
    const pending = [first, second];
    const f = fixture({ restorePersona: () => pending.shift().promise });
    const oldActivation = f.lifecycle.activateChat();
    f.changeSession({ chatId: 'B', metadata: {}, systemKey: 'other' });
    const newActivation = f.lifecycle.activateChat();
    first.resolve(false);
    assert.equal(await oldActivation, false);
    second.resolve(false);
    assert.equal(await newActivation, true);
    assert.equal(f.calls.filter(value => value === 'load').length, 1);
    assert.equal(f.calls.filter(value => value === 'refresh').length, 1);
});

test('an obsolete host avatar restore cannot become a manual persona change in the next chat', async () => {
    const first = deferred();
    const second = deferred();
    let f;
    f = fixture({
        recordedPersona: () => `${f.session.chatId}.png`,
        restorePersona: async () => {
            const key = `${f.session.chatId}.png`;
            f.calls.push(`restore:${key}`);
            await (key === 'A.png' ? first.promise : second.promise);
            f.changePersona({ key, name: key });
            assert.equal(f.lifecycle.activatePlayer(), false);
            return true;
        },
    });
    const oldActivation = f.lifecycle.activateChat();
    f.changeSession({ chatId: 'B', metadata: {}, systemKey: 'other' });
    const newActivation = f.lifecycle.activateChat();
    assert.deepEqual(f.calls.filter(value => value.startsWith('restore:')), ['restore:A.png']);
    first.resolve();
    assert.equal(await oldActivation, false);
    assert.equal(f.calls.includes('load'), false);
    second.resolve();
    assert.equal(await newActivation, true);
    assert.deepEqual(f.calls.filter(value => value.startsWith('restore:')), ['restore:A.png', 'restore:B.png']);
    assert.equal(f.calls.filter(value => value === 'load').length, 1);
    assert.equal(f.calls.includes('save'), false);
    assert.equal(f.calls.includes('remember'), false);
});

test('replaced metadata or selected rules invalidate a pending activation even without another host event', async () => {
    for (const changed of [
        { chatId: 'A', metadata: {}, systemKey: 'recorded' },
        { systemKey: 'new-rules' },
    ]) {
        const waiting = deferred();
        let stillCurrent;
        const f = fixture({ restorePersona: check => { stillCurrent = check; return waiting.promise; } });
        const activation = f.lifecycle.activateChat();
        assert.equal(stillCurrent(), true);
        f.changeSession({ ...f.session, ...changed });
        assert.equal(stillCurrent(), false);
        waiting.resolve(false);
        assert.equal(await activation, false);
        assert.deepEqual(f.calls, ['clear', 'system', 'roster']);
    }
});

test('closing a chat clears its cache without restoring, loading or recording another owner', async () => {
    const f = fixture();
    f.changeSession({ chatId: undefined, metadata: f.session.metadata, systemKey: 'recorded' });
    assert.equal(await f.lifecycle.activateChat(), false);
    assert.equal(f.lifecycle.activatePlayer(), false);
    assert.deepEqual(f.calls, ['clear']);
});

test('a refused player save publishes no refresh or persona binding', () => {
    const f = fixture({ saveState: () => false });
    f.changePersona({ key: 'chosen.png', name: 'Chosen' });
    assert.equal(f.lifecycle.activatePlayer(), false);
    assert.deepEqual(f.calls, ['load', 'select']);
});
