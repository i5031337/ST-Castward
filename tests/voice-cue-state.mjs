import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { voiceCueKey } from '../src/tts/voice-cue-format.js';

const source = readFileSync(new URL('../src/tts/voice-cues.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ');
const { saveVoiceCues, voiceCueFor } = new Function('voiceCueKey', 'makeId',
    `${source}\nreturn {saveVoiceCues, voiceCueFor};`)(voiceCueKey, () => 'fresh-cue');

test('finalized streaming cues retain the identity used for their first synthesis', () => {
    let saves = 0;
    const context = { chatMetadata: {}, getCurrentChatId: () => 'chat', saveMetadataDebounced: () => saves++ };
    const cues = [{ speaker: 'Mira', description: 'Warm and low.' }];
    const provisional = new Map([['mira', { id: 'stream-designed-voice' }]]);
    assert.equal(saveVoiceCues(cues, context, provisional), 1);
    assert.deepEqual(voiceCueFor('Mira', null, context), {
        id: 'stream-designed-voice', description: 'Warm and low.', version: 1,
    });
    assert.equal(saveVoiceCues([{ speaker: 'Mira', description: 'Different.' }], context), 0);
    assert.equal(saves, 1);
    const reloaded = { ...context, chatMetadata: JSON.parse(JSON.stringify(context.chatMetadata)) };
    assert.equal(voiceCueFor('Mira', null, reloaded).id, 'stream-designed-voice');
});
