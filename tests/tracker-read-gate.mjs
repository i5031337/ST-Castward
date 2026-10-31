import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerReadGate, shouldWaitForTrackerRead } from '../src/tracker/tracker-read-gate.js';

test('tracker wait applies only to image-prompt refresh with an automatic reader', () => {
    const settings = { npcExpressionsRefreshOnImagePrompt: true,
        statusTracker: { enabled: true, extractionMode: 'extract' } };
    assert.equal(shouldWaitForTrackerRead(settings, true), true);
    assert.equal(shouldWaitForTrackerRead({ ...settings, npcExpressionsRefreshOnImagePrompt: false }, true), false);
    assert.equal(shouldWaitForTrackerRead(settings, false), false);
    assert.equal(shouldWaitForTrackerRead({ ...settings, statusTracker: { enabled: true, extractionMode: 'inline' } }, true), true);
    assert.equal(shouldWaitForTrackerRead({ ...settings, statusTracker: { enabled: true, extractionMode: 'manual' } }, true), false);
});

test('expression work waits for the reply reader to commit, then uses the live state', async () => {
    const gate = createTrackerReadGate();
    const message = {}, state = { clothing: 'old' };
    let finishReading, observed = '';
    const reading = new Promise(resolve => { finishReading = resolve; });
    const waiting = gate.wait(message).then(() => { observed = state.clothing; });
    gate.register(message, reading);
    await Promise.resolve();
    assert.equal(observed, '');
    state.clothing = 'new';
    finishReading();
    await waiting;
    assert.equal(observed, 'new');
    await gate.wait(message);
});

test('failed readings release the gate and cancelled expression work stops waiting', async () => {
    const gate = createTrackerReadGate();
    const failed = {}, cancelled = {};
    gate.register(failed, Promise.reject(new Error('reader failed')));
    await gate.wait(failed);
    const controller = new AbortController();
    const pending = gate.wait(cancelled, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
});

test('a replaced reply cannot release the next tracker gate', async () => {
    const gate = createTrackerReadGate();
    const message = {};
    let finishOld, finishNew, ready = false;
    gate.register(message, new Promise(resolve => { finishOld = resolve; }));
    gate.forget(message);
    gate.register(message, new Promise(resolve => { finishNew = resolve; }));
    const waiting = gate.wait(message).then(() => { ready = true; });
    finishOld(); await Promise.resolve(); await Promise.resolve();
    assert.equal(ready, false);
    finishNew(); await waiting;
    assert.equal(ready, true);
});
