import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { wireExpressionEvents } from '../src/expressions/expression-events.js';
import { wireSpeechEvents } from '../src/tts/speech-events.js';

const types = Object.fromEntries(['GENERATION_STARTED', 'GENERATION_STOPPED', 'GENERATION_ENDED',
    'CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED'].map(name => [name, name]));

function fixture(wire) {
    const events = new EventEmitter(), messages = [{ text: 'user' }, { text: 'old reply' }];
    const deferred = [], completed = [], resets = [];
    wire({ events, types, renderedEvent: 'rendered', render: () => {},
        reset: options => resets.push(options), stop: () => {},
        latestId: () => messages.length - 1,
        revision: id => JSON.stringify([id, messages[id]?.text]), sourceToken: id => messages[id],
        defer: callback => deferred.push(callback), complete: id => completed.push(id) });
    const removeOutgoing = () => { messages.pop(); events.emit(types.MESSAGE_DELETED, messages.length); };
    const finish = () => { events.emit(types.GENERATION_ENDED); deferred.splice(0).forEach(callback => callback()); };
    return { events, messages, deferred, completed, resets, removeOutgoing, finish };
}

for (const [name, wire] of [['expressions', wireExpressionEvents], ['speech', wireSpeechEvents]]) {
    test(`${name}: only changed foreground generations authorize completion`, () => {
        for (const type of ['normal', 'swipe', 'regenerate', 'continue', 'quiet', 'impersonate']) {
            for (const dryRun of [false, true]) {
                const f = fixture(wire);
                f.finish(); // Loading history cannot authorize automatic presentation.
                f.events.emit(types.GENERATION_STARTED, type, {}, dryRun);
                f.messages[1].text = 'new reply';
                f.finish(); f.finish();
                const allowed = !dryRun && ['normal', 'swipe', 'regenerate', 'continue'].includes(type);
                assert.deepEqual(f.completed, allowed ? [1] : []);
            }
        }
        const unchanged = fixture(wire);
        unchanged.events.emit(types.GENERATION_STARTED, 'normal'); unchanged.finish();
        assert.deepEqual(unchanged.completed, []);
    });

    test(`${name}: regeneration survives the host's outgoing-reply deletion`, () => {
        for (const text of ['new reply', 'old reply']) {
            const f = fixture(wire);
            f.events.emit(types.GENERATION_STARTED, 'regenerate');
            f.removeOutgoing();
            f.messages.push({ text });
            f.finish();
            assert.deepEqual(f.completed, [1]);
        }
    });

    test(`${name}: only one matching regeneration deletion is allowed`, () => {
        for (const change of ['unexpected length', 'second deletion', 'normal deletion']) {
            const f = fixture(wire);
            f.events.emit(types.GENERATION_STARTED, change === 'normal deletion' ? 'normal' : 'regenerate');
            if (change === 'unexpected length') {
                f.messages.pop(); f.events.emit(types.MESSAGE_DELETED, 99);
            } else {
                f.removeOutgoing();
                if (change === 'second deletion') f.removeOutgoing();
            }
            f.messages.push({ text: 'new reply' });
            f.finish();
            assert.deepEqual(f.completed, []);
        }
    });

    test(`${name}: chat changes, edits, swipes and Stop still cancel a regeneration`, () => {
        for (const event of [types.CHAT_CHANGED, types.MESSAGE_EDITED, types.MESSAGE_SWIPED, types.GENERATION_STOPPED]) {
            const f = fixture(wire);
            f.events.emit(types.GENERATION_STARTED, 'regenerate');
            f.removeOutgoing(); f.events.emit(event);
            f.messages.push({ text: 'new reply' }); f.finish();
            assert.deepEqual(f.completed, []);
        }
    });

    test(`${name}: deferred regenerated completions reject later deletions and replacement objects`, () => {
        for (const change of ['delete', 'replace']) {
            const f = fixture(wire);
            f.events.emit(types.GENERATION_STARTED, 'regenerate');
            f.removeOutgoing(); f.messages.push({ text: 'new reply' });
            f.events.emit(types.GENERATION_ENDED);
            if (change === 'delete') f.removeOutgoing();
            else f.messages[1] = { text: 'new reply' };
            f.deferred.forEach(callback => callback());
            assert.deepEqual(f.completed, []);
        }
    });
}

test('expression cancellation clears displayed state only on chat changes', () => {
    const f = fixture(wireExpressionEvents);
    f.events.emit(types.GENERATION_STARTED, 'regenerate');
    f.removeOutgoing();
    assert.deepEqual(f.resets, [{ clear: false }, { clear: false }]);
    for (const event of [types.GENERATION_STOPPED, types.MESSAGE_SWIPED, types.MESSAGE_EDITED, types.MESSAGE_DELETED]) {
        f.events.emit(event);
        assert.deepEqual(f.resets.at(-1), { clear: false });
    }
    f.events.emit(types.CHAT_CHANGED);
    assert.deepEqual(f.resets.at(-1), { clear: true });
});
