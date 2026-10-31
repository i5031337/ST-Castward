import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isImageOnlyMessage } from '../src/tracker/ui/status-ui-placement.js';

function fixture(message, enabled = true, reading = { applied: true }) {
    const context = { chat: [message], chatMetadata: {} };
    const calls = [];
    const memories = [];
    const source = readFileSync(new URL('../src/entry/entry-message-events.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replaceAll('export ', '');
    const deps = {
        getSettings: () => ({ enabled }), getContext: () => context,
        isImageOnlyMessage, LOG_PREFIX: 'test', debugLog() {},
        extractStateFromMessage: (...args) => {
            calls.push(args);
            return Promise.resolve(reading);
        },
        scheduleMemoryRead: id => memories.push(id),
        trackerReadGate: { register() {} },
    };
    const onMessageForExtraction = new Function(...Object.keys(deps),
        `${source}\nreturn onMessageForExtraction;`)(...Object.values(deps));
    return { calls, memories, onMessageForExtraction };
}

test('the host opening greeting event enters the standard tracker reader once', async () => {
    // SillyTavern getChatResult emits CHAT_CHANGED followed by this event when length is 1.
    const opening = { mes: 'You are in the Copper Lantern, a tavern with a blue hearth.' };
    const f = fixture(opening);
    f.onMessageForExtraction(0, 'first_message');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.calls, [[opening.mes, 0]]);
    assert.deepEqual(f.memories, [0]);
});

for (const [name, message] of [
    ['user turn', { mes: 'I enter the tavern.', is_user: true }],
    ['system note', { mes: 'Copper Lantern', is_system: true }],
    ['image only', { mes: 'Copper Lantern', extra: { inline_image: false, media: [{}] } }],
]) {
    test(`opening event never sends ${name} to the reader`, () => {
        const f = fixture(message);
        f.onMessageForExtraction(0, 'first_message');
        assert.equal(f.calls.length, 0);
    });
}

test('disabled Castward does not read an opening greeting', () => {
    const f = fixture({ mes: 'You are in the Copper Lantern.' }, false);
    f.onMessageForExtraction(0, 'first_message');
    assert.equal(f.calls.length, 0);
});

for (const reading of [{ applied: false, reason: 'cancelled' }, { applied: true, cancelled: true }]) {
    test(`cancelled ${reading.applied ? 'follow-up' : 'tracker'} does not schedule an automatic memory call`, async () => {
        const f = fixture({ mes: 'A new story reply.' }, true, reading);
        f.onMessageForExtraction(0);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.calls.length, 1);
        assert.deepEqual(f.memories, []);
    });
}
