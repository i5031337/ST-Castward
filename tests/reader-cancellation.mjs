import test from 'node:test';
import assert from 'node:assert/strict';
import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';

test('Stop remains available through host cleanup and nested requests', () => {
    const h = readerCancellationHarness();
    const reading = h.startGenerationTask(), request = h.startGenerationTask();
    h.button.style.display = 'none';
    h.refresh();
    assert.equal(h.button.style.display, 'flex');
    request.finish();
    assert.equal(h.button.style.display, 'flex');
    reading.finish();
    assert.equal(h.button.style.display, 'none');
    assert.equal(h.listeners(), 0);
});

test('finishing a reader does not hide Stop during story generation', () => {
    const h = readerCancellationHarness();
    const reading = h.startGenerationTask();
    h.setGenerating(true);
    reading.finish();
    assert.equal(h.button.style.display, 'flex');
});

for (const event of ['stop', 'chat']) {
    test(`${event} aborts all readers and releases hanging requests`, async () => {
        const h = readerCancellationHarness();
        const first = h.startGenerationTask(), second = h.startGenerationTask();
        const waiting = h.awaitGenerationRequest(new Promise(() => {}), first.signal);
        h.emit(event);
        await assert.rejects(waiting, { name: 'AbortError' });
        assert.equal(second.signal.aborted, true);
        assert.equal(h.button.style.display, 'none');
        first.finish(); second.finish();
        assert.equal(h.listeners(), 0);
        const retry = h.startGenerationTask();
        assert.equal(retry.signal.aborted, false);
        assert.equal(h.button.style.display, 'flex');
        retry.finish();
    });
}

test('dialog cancellation aborts the combined request signal and cleans up Stop', () => {
    const h = readerCancellationHarness();
    const dialog = new AbortController();
    const task = h.startGenerationTask({ signal: dialog.signal });
    assert.equal(h.button.style.display, 'flex');
    dialog.abort();
    assert.equal(task.signal.aborted, true);
    assert.equal(h.button.style.display, 'none');
    task.finish();
    assert.equal(h.listeners(), 0);
    assert.throws(() => h.startGenerationTask({ signal: dialog.signal }), { name: 'AbortError' });
});
