import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrackerEditLocked, lockTrackerEdits } from '../src/tracker/tracker-edit-lock.js';
import { loadStatusModule } from './helpers/status-module.mjs';

test('undo cannot restore earlier state while a reader holds the edit lock', () => {
    let reads = 0;
    const { undoLastChange } = loadStatusModule(new URL('../src/tracker/status-state-storage.js', import.meta.url), {
        isTrackerEditLocked, getMetadata: () => { reads++; return {}; },
    });
    const release = lockTrackerEdits();
    try {
        assert.equal(undoLastChange(), null);
        assert.equal(reads, 0);
    } finally { release(); }
    assert.equal(undoLastChange(), null);
    assert.equal(reads, 1);
});

test('overlapping readings own independent releases and aborted work cannot unlock a newer reading', () => {
    const old = new AbortController();
    const releaseOld = lockTrackerEdits(old.signal);
    const releaseNew = lockTrackerEdits();
    try {
        old.abort();
        releaseOld();
        assert.equal(isTrackerEditLocked(), true);
    } finally { releaseNew(); releaseOld(); }
    assert.equal(isTrackerEditLocked(), false);
    const releaseAborted = lockTrackerEdits(old.signal);
    assert.equal(isTrackerEditLocked(), false);
    releaseAborted();
});
