import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcStreaming } from '../src/tts/npc-streaming.js';

function fixture() {
    const spoken = [], classified = [], published = [];
    let cancelled = 0, finalized = 0, valid = true;
    const stream = createNpcStreaming({
        read: source => {
            const units = source.split('\n').filter(Boolean).map((text, index) => ({
                kind: 'dialogue', npcId: 'npc', speakerLabel: 'NPC', text, dialogueLineIndex: index,
            }));
            return { units, records: units.map((unit, lineIndex) => ({ ...unit, lineIndex })) };
        },
        publish: job => published.push(job.records.map(line => line.text)),
        enqueue: (_job, units) => spoken.push(...units.map(unit => unit.text)),
        classify: (_job, lines) => classified.push(...lines.map(line => line.text)),
        cancel: () => cancelled++, finalize: () => finalized++,
    });
    stream.begin({ messageId: 3, current: () => valid });
    return { stream, spoken, classified, published, cancelCount: () => cancelled,
        finalCount: () => finalized, invalidate: () => { valid = false; } };
}

test('streams complete lines before final generation and classifies each only once', () => {
    const f = fixture();
    f.stream.push('first partial');
    assert.deepEqual(f.spoken, []);
    f.stream.push('first\nsecond partial');
    assert.deepEqual(f.spoken, ['first']);
    f.stream.push('first\nsecond partial');
    assert.deepEqual(f.classified, ['first']);
    f.stream.push('first\nsecond\nthird', { final: true });
    assert.deepEqual(f.spoken, ['first', 'second', 'third']);
    assert.deepEqual(f.classified, ['first', 'second', 'third']);
    assert.equal(f.finalCount(), 1);
    assert.equal(f.stream.push('first\nsecond\nthird', { final: true }), false);
    assert.equal(f.stream.handled(3), true);
    assert.equal(f.stream.handled(4), false);
});

test('repeated dialogue stays distinct and committed rewrites cancel rather than replay', () => {
    const f = fixture();
    f.stream.push('Same\nSame\n');
    assert.deepEqual(f.spoken, ['Same', 'Same']);
    assert.deepEqual(f.classified, ['Same', 'Same']);
    f.stream.push('Other\nSame\n');
    assert.equal(f.cancelCount(), 1);
    assert.equal(f.stream.current().cancelled, true);
    assert.equal(f.stream.push('Same\nSame\nMore\n'), false);
    assert.deepEqual(f.spoken, ['Same', 'Same']);
});

test('Stop and context replacement prevent pending tail flush and later enqueue', () => {
    const stopped = fixture();
    stopped.stream.push('first\ntail');
    stopped.stream.stop();
    assert.equal(stopped.stream.push('first\ntail', { final: true }), false);
    assert.deepEqual(stopped.spoken, ['first']);
    assert.equal(stopped.finalCount(), 0);
    const changed = fixture();
    changed.stream.push('first\ntail');
    changed.invalidate();
    assert.equal(changed.stream.push('first\ntail', { final: true }), false);
    assert.deepEqual(changed.spoken, ['first']);
});

test('formatted prefix revision rejects units already queued even when raw source appends', () => {
    let cancelCount = 0, calls = 0;
    const stream = createNpcStreaming({
        read: () => ({ records: [], units: [{ kind: 'narration', text: ++calls === 1 ? 'old' : 'changed' }] }),
        publish: () => {}, enqueue: () => {}, classify: () => {}, finalize: () => {}, cancel: () => cancelCount++,
    });
    stream.begin({ messageId: 1, current: () => true });
    stream.push('old\n');
    stream.push('old\nnew\n');
    assert.equal(cancelCount, 1);
    assert.equal(stream.current().cancelled, true);
});

test('producer exposes only committed source to provisional cue consumers until final flush', () => {
    const prefixes = [];
    const stream = createNpcStreaming({
        read: () => ({ records: [], units: [] }), publish: () => {}, classify: () => {},
        enqueue: state => prefixes.push(state.committed), finalize: () => {}, cancel: () => {},
    });
    stream.begin({ messageId: 1, current: () => true });
    const dialogue = 'Mira: "Hello."\n';
    const low = '[[NPC_VOICE speaker="Mira" description="Low voice."]]';
    const high = '[[NPC_VOICE speaker="Mira" description="High voice."]]';
    stream.push(dialogue + low);
    assert.deepEqual(prefixes, [dialogue]);
    stream.push(dialogue + high);
    assert.deepEqual(prefixes, [dialogue], 'mutable cue revisions do not become committed work');
    stream.push(dialogue + high, { final: true });
    assert.deepEqual(prefixes, [dialogue, dialogue + high]);
    assert.equal(stream.current().cancelled, false);
});
