import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtractionQueue } from '../src/tracker/extractor/status-extractor-queue.js';
import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';

function fixture() {
    const context = { chatMetadata: {}, chat: [0, 1, 2].map(id => ({ mes: `Turn ${id}`, swipe_id: 0 })) };
    const settings = { activeSystem: 'Fantasy' };
    let persona = 'player';
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const calls = [];
    const cancellation = readerCancellationHarness();
    const queue = createExtractionQueue({ getContext: () => context, getSettings: () => settings,
        getCurrentPersonaKey: () => persona, startGenerationTask: cancellation.startGenerationTask,
        extract: async (text, id, options, signal) => {
            calls.push({ text, id, signal });
            if (id === 0) await gate;
            return { applied: !signal.aborted, reason: signal.aborted ? 'cancelled' : undefined };
        } });
    return { queue, context, settings, calls, release, cancellation,
        submit: id => queue.submit(context.chat[id].mes, id),
        setPersona: value => { persona = value; } };
}

test('FIFO queue coalesces duplicate active and waiting readings and releases task listeners', async () => {
    const f = fixture();
    const first = f.submit(0);
    assert.equal(f.submit(0), first);
    const second = f.submit(1);
    assert.equal(f.submit(1), second);
    const third = f.submit(2);
    assert.deepEqual(f.calls.map(call => call.id), [0]);
    f.release();
    assert.ok((await Promise.all([first, second, third])).every(result => result.applied));
    assert.deepEqual(f.calls.map(call => call.id), [0, 1, 2]);
    assert.equal(f.cancellation.listeners(), 0);
});

for (const [name, change] of Object.entries({
    edit: f => { f.context.chat[1].mes = 'Revised'; },
    swipe: f => { f.context.chat[1].swipe_id = 1; },
    deletion: f => { f.context.chat.splice(1, 1); },
    replacement: f => { f.context.chat[1] = { ...f.context.chat[1] }; },
    chat: f => { f.context.chatMetadata = {}; },
    persona: f => f.setPersona('other'),
    System: f => { f.settings.activeSystem = 'Dating'; },
})) {
    test(`waiting reading is discarded after ${name} changes its source`, async () => {
        const f = fixture();
        const first = f.submit(0);
        const second = f.submit(1);
        change(f);
        f.release();
        await first;
        assert.equal((await second).reason, 'reply changed while waiting');
        assert.equal(f.calls.length, 1);
        assert.equal(f.cancellation.listeners(), 0);
    });
}

test('forgetting regenerated/deleted indexes cancels affected waiting readings', async () => {
    const f = fixture();
    const first = f.submit(0);
    const second = f.submit(1);
    const third = f.submit(2);
    f.queue.forgetFrom(2);
    assert.equal((await third).reason, 'cancelled');
    f.release();
    await Promise.all([first, second]);
    assert.deepEqual(f.calls.map(call => call.id), [0, 1]);
});

for (const event of ['stop', 'chat', 'clear']) {
    test(`${event} cancels pending readings and allows a fresh request`, async () => {
        const f = fixture();
        const first = f.submit(0);
        const second = f.submit(1);
        if (event === 'clear') f.queue.clear();
        else f.cancellation.emit(event);
        assert.equal((await second).reason, 'cancelled');
        f.release();
        assert.equal((await first).reason, 'cancelled');
        assert.equal(f.calls.length, 1);
        assert.equal((await f.submit(1)).applied, true);
        assert.equal(f.cancellation.listeners(), 0);
    });
}

test('a rejected reading does not strand the next queued request', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const cancellation = readerCancellationHarness();
    const context = { chat: [{ mes: 'First' }, { mes: 'Second' }] };
    const queue = createExtractionQueue({ getContext: () => context, getSettings: () => ({}),
        getCurrentPersonaKey: () => 'player', startGenerationTask: cancellation.startGenerationTask,
        extract: async (text, id) => {
            if (!id) { await gate; throw new Error('Failed reader'); }
            return { applied: true };
        } });
    const failed = assert.rejects(queue.submit('First', 0), /Failed reader/);
    const next = queue.submit('Second', 1);
    release();
    await failed;
    assert.equal((await next).applied, true);
    assert.equal(cancellation.listeners(), 0);
});


test('persona switch aborts active and queued readings without affecting a fresh persona request', async () => {
    const f = fixture();
    const first = f.submit(0), second = f.submit(1);
    f.cancellation.emit('persona');
    assert.equal(f.calls[0].signal.aborted, false);
    f.setPersona('other');
    f.cancellation.emit('persona');
    assert.equal(f.calls[0].signal.aborted, true);
    assert.equal((await second).reason, 'cancelled');
    f.release();
    assert.equal((await first).reason, 'cancelled');
    assert.equal((await f.submit(1)).applied, true);
    assert.deepEqual(f.calls.map(call => call.id), [0, 1]);
    assert.equal(f.cancellation.listeners(), 0);
});
