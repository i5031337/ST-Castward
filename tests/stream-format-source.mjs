import test from 'node:test';
import assert from 'node:assert/strict';
import { streamFormatSource, stripSpeechFences } from '../src/tts/stream-format-source.js';

test('speech-only fenced removal preserves visible boundaries and ignores misleading inner fences', () => {
    for (const marker of ['```', '````', '~~~']) {
        const source = `Before.\n${marker}text\n<status_update>Hidden</status_update>\n${marker}\nAfter.\n`;
        assert.equal(stripSpeechFences(source), 'Before.\n\nAfter.\n');
    }
    assert.equal(stripSpeechFences('Before.\n````text\n```\nHidden.\n````\nAfter.\n'), 'Before.\n\nAfter.\n');
    assert.equal(stripSpeechFences('Inline `code` remains.\n'), 'Inline `code` remains.\n');
});

test('open code fences withhold their content until the matching fence closes', () => {
    for (const marker of ['```', '````', '~~~']) {
        const prefix = 'Visible.\n';
        const block = `${marker}text\nNPC: "Hidden."\n`;
        assert.equal(streamFormatSource(prefix + block), prefix);
        assert.equal(streamFormatSource(prefix + block + `${marker}\n`), prefix + block + `${marker}\n`);
    }
    assert.equal(streamFormatSource('````text\nHidden\n```\n'), '');
});

test('incomplete dialogue quotations never turn into premature narration or repaired dialogue', () => {
    assert.equal(streamFormatSource('Narration.\nNPC: "Unfinished\n'), 'Narration.\n');
    assert.equal(streamFormatSource('NPC: “Unfinished\nmore”\n'), 'NPC: “Unfinished\nmore”\n');
    assert.equal(streamFormatSource('NPC: "Escaped \\" quote\n'), '');
    assert.equal(streamFormatSource('NPC: "Done."\n'), 'NPC: "Done."\n');
});

test('unfinished hidden HTML and excluded blocks withhold content until structurally closed', () => {
    for (const opening of ['<div hidden>', '<section data-sillynpc-hidden>', '<div style="display: none">', '<pre>']) {
        const tag = opening.match(/^<(\w+)/u)[1];
        const source = `Visible.\n${opening}\nNPC: "Hidden."\n`;
        assert.equal(streamFormatSource(source), 'Visible.\n');
        assert.equal(streamFormatSource(source + `</${tag}>\n`), source + `</${tag}>\n`);
    }
    assert.equal(streamFormatSource('<div hidden>\n<div>Hidden</div>\n'), '');
    assert.equal(streamFormatSource('<div hidden>\n<div>Hidden</div>\n</div>\n'), '<div hidden>\n<div>Hidden</div>\n</div>\n');
    assert.equal(streamFormatSource('Visible.\n<div\nhidden\n'), 'Visible.\n');
    assert.equal(streamFormatSource('<div\nhidden>\nHidden\n'), '');
    assert.equal(streamFormatSource('<div\nhidden>\nHidden\n</div>\n'), '<div\nhidden>\nHidden\n</div>\n');
});
