import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechQueue } from '../src/tts/speech-queue.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const unit = text => ({ text, voice: 'a' });

test('stream queue remains open between lines and closes without replay', async () => {
    const calls = [];
    const queue = createSpeechQueue({ valid: () => true,
        synthesize: async item => { calls.push(`synth:${item.text}`); return item.text; },
        playAudio: async audio => { calls.push(`play:${audio}`); },
    });
    const session = queue.start(1, 'generation');
    session.append([unit('first'), { text: 'silent', voice: null }]);
    await tick();
    assert.equal(queue.current(), session);
    assert.deepEqual(calls, ['synth:first', 'play:first']);
    session.append([unit('second')]);
    await tick();
    assert.deepEqual(calls, ['synth:first', 'play:first', 'synth:second', 'play:second']);
    session.close(); await session.done;
    assert.equal(queue.current(), null);
    assert.equal(session.append([unit('late')]), false);
});

test('stream queue preserves bounded serial prefetch across appends', async () => {
    const synthesized = [], played = [];
    let release;
    const queue = createSpeechQueue({ valid: () => true,
        synthesize: async item => { synthesized.push(item.text); return item.text; },
        playAudio: audio => {
            played.push(audio);
            return audio === '1' ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
        },
    });
    const session = queue.start(1, 'generation');
    session.append([unit('1')]); await tick();
    session.append([unit('2'), unit('3'), unit('4')]); await tick();
    assert.deepEqual(synthesized, ['1', '2', '3']);
    assert.deepEqual(played, ['1']);
    release(); session.close(); await session.done;
    assert.deepEqual(played, ['1', '2', '3', '4']);
});

test('stopping an empty open queue settles it and rejects further appends', async () => {
    const states = [];
    const queue = createSpeechQueue({ valid: () => true,
        synthesize: async () => assert.fail('unexpected synthesis'),
        playAudio: async () => assert.fail('unexpected playback'),
        onState: state => states.push(state),
    });
    const old = queue.start(1, 'old');
    queue.stop(); await old.done;
    assert.equal(old.append([unit('stale')]), false);
    assert.deepEqual(states, ['working', 'idle']);
    const next = queue.start(1, 'new');
    next.close(); await next.done;
    assert.equal(queue.current(), null);
});
