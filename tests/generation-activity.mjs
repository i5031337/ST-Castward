import test from 'node:test';
import assert from 'node:assert/strict';
import { startActivity, getGenerationActivities, clearGenerationActivities, subscribeGenerationActivity } from '../src/core/generation-activity.js';
import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';

test('overlapping activities have independent lifetimes, even with identical labels', () => {
    clearGenerationActivities();
    const first = startActivity({ kind: 'profile', label: 'Mira' });
    const second = startActivity({ kind: 'profile', label: 'Mira' });
    first.finish();
    assert.equal(getGenerationActivities().length, 1);
    first.finish();
    assert.equal(getGenerationActivities().length, 1);
    second.finish();
    assert.deepEqual(getGenerationActivities(), []);
});

test('clearing a chat makes old finish callbacks harmless to new activity', () => {
    const old = startActivity({ label: 'Old chat' });
    clearGenerationActivities();
    const current = startActivity({ label: 'New chat' });
    old.finish();
    assert.equal(getGenerationActivities()[0].label, 'New chat');
    current.finish();
});

for (const event of ['stop', 'chat']) {
    test(`${event} clears cancelled work immediately, before the backend settles`, () => {
        const h = readerCancellationHarness();
        const task = h.startGenerationTask({ activity: { kind: 'tracker', label: 'Reading stats…' } });
        assert.equal(getGenerationActivities().length, 1);
        h.emit(event);
        assert.deepEqual(getGenerationActivities(), []);
        task.finish();
        assert.equal(h.listeners(), 0);
    });
}

test('activity subscriptions stop notifying after unsubscribe and aborted work stays hidden', () => {
    let changes = 0;
    const unsubscribe = subscribeGenerationActivity(() => changes++);
    const controller = new AbortController();
    controller.abort();
    startActivity({ label: 'Cancelled' }, controller.signal).finish();
    assert.equal(changes, 0);
    const current = startActivity({ label: 'Current' });
    assert.equal(changes, 1);
    unsubscribe();
    current.finish();
    assert.equal(changes, 1);
});
