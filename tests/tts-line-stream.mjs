import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompletedLineStream } from '../src/tts/line-stream.js';

test('commits real newline boundaries and flushes the final unfinished line once', () => {
    const stream = createCompletedLineStream();
    assert.equal(stream.push('Mira: "Hel').committed, '');
    assert.equal(stream.push('Mira: "Hello."').committed, '');
    const first = stream.push('Mira: "Hello."\nThe wind');
    assert.equal(first.committed, 'Mira: "Hello."\n');
    assert.deepEqual(first.lines, [{ id: 0, index: 0, start: 0, end: 15,
        text: 'Mira: "Hello."', appendedText: 'Mira: "Hello."\n' }]);
    assert.deepEqual(stream.push('Mira: "Hello."\nThe wind').lines, []);
    const last = stream.push('Mira: "Hello."\nThe wind blows.', { final: true });
    assert.equal(last.lines[0].id, 1);
    assert.equal(last.lines[0].text, 'The wind blows.');
    assert.equal(last.closed, true);
    assert.deepEqual(stream.push(last.source, { final: true }).lines, []);
});

test('repeated identical lines have separate stable identities, including blank and CRLF lines', () => {
    const stream = createCompletedLineStream();
    const result = stream.push('Wait.\r\n\nWait.\r\n');
    assert.deepEqual(result.lines.map(line => [line.id, line.text]), [[0, 'Wait.'], [1, ''], [2, 'Wait.']]);
    assert.equal(result.committed, result.source);
    assert.deepEqual(stream.push(result.source).lines, []);
    assert.deepEqual(stream.push(result.source, { final: true }).lines, []);
});

test('permits unfinished-tail revisions but permanently invalidates revisions to committed speech', () => {
    const stream = createCompletedLineStream();
    stream.push('First.\nSecond dra');
    const revised = stream.push('First.\nDifferent.\n');
    assert.equal(revised.invalidated, false);
    assert.equal(revised.lines[0].text, 'Different.');
    const invalid = stream.push('Changed first.\nDifferent.\n');
    assert.equal(invalid.invalidated, true);
    assert.deepEqual(invalid.lines, []);
    assert.deepEqual(stream.push('First.\nDifferent.\nMore.\n').lines, []);
});

test('continue baselines preserve formatting context without emitting old complete lines', () => {
    const baseline = '```text\nHidden old line\n```\nMira: "Hel';
    const stream = createCompletedLineStream({ baseline });
    assert.equal(stream.push('lo.').committed, baseline);
    const result = stream.push('lo."\nAnother line\n');
    assert.equal(result.source, baseline + 'lo."\nAnother line\n');
    assert.deepEqual(result.lines.map(line => line.text), ['Mira: "Hello."', 'Another line']);
    assert.equal(result.lines[0].appendedText, 'lo."\n');
    assert.equal(result.lines[0].start, baseline.lastIndexOf('\n') + 1);
    // The coordinator can conservatively omit speech intersecting an old unfinished line.
    assert.deepEqual(result.lines.filter(line => line.start >= baseline.length).map(line => line.text), ['Another line']);
});

test('empty final response closes cleanly and continuation after a newline emits only new lines', () => {
    assert.equal(createCompletedLineStream().push('', { final: true }).closed, true);
    const stream = createCompletedLineStream({ baseline: 'Old.\n' });
    const result = stream.push('New.\n');
    assert.equal(result.lines[0].text, 'New.');
    assert.equal(result.lines[0].start, 5);
    assert.equal(result.committed, 'Old.\nNew.\n');
});

test('fences and hidden markup remain raw context for downstream host formatting and exclusions', () => {
    const stream = createCompletedLineStream();
    const source = '```text\nMira: "Hidden."\n```\n<div hidden>Hidden</div>\nMira: "Spoken."';
    const result = stream.push(source);
    assert.equal(result.committed, source.slice(0, source.lastIndexOf('\n') + 1));
    assert.deepEqual(result.lines.map(line => line.text), ['```text', 'Mira: "Hidden."', '```', '<div hidden>Hidden</div>']);
    assert.equal(stream.push(source, { final: true }).lines[0].text, 'Mira: "Spoken."');
});
