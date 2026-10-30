import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCues, withoutVoiceCueLines } from '../src/tts/voice-cue-format.js';

const line = '[[NPC_VOICE speaker="Mira" description="adult feminine voice, low and warm"]]';
const positionalSpeaker = '[[NPC_VOICE Ian description="18, rapid-fire staccato, nervous and tripping over words"]]';
const records = [{ speakerLabel: 'Mira', text: 'Wait.', isPersona: false }];

test('accepts only a complete first cue for a recognized NPC in the reply', () => {
    assert.deepEqual(parseVoiceCues(`${line}\n\nMira: "Wait."\n${line}`, records),
        [{ speaker: 'Mira', description: 'adult feminine voice, low and warm' }]);
    assert.deepEqual(parseVoiceCues(line, []), []);
    assert.deepEqual(parseVoiceCues(line, [{ ...records[0], isPersona: true }]), []);
    assert.deepEqual(parseVoiceCues(line.replace('Mira', 'Other'), records), []);
});

test('rejects malformed, fenced, and multiline cue text', () => {
    assert.deepEqual(parseVoiceCues(`\`\`\`text\n${line}\n\`\`\``, records), []);
    assert.deepEqual(parseVoiceCues(`~~~text\n${line}\n~~~`, records), []);
    assert.deepEqual(parseVoiceCues(`\`\`\`\`text\n\`\`\`\n${line}\n\`\`\`\``, records), []);
    assert.deepEqual(parseVoiceCues(`Narration ${line}`, records), []);
    assert.deepEqual(parseVoiceCues(line.replace('voice, low', 'voice"\nmore, low'), records), []);
});

test('accepts and removes a voice cue with a positional single-word speaker', () => {
    const source = `He swallows hard.\n\n${positionalSpeaker}\n\nIan: "Oh! Uh, hi!"`;
    assert.deepEqual(parseVoiceCues(source, [{ speakerLabel: 'Ian', text: 'Oh! Uh, hi!', isPersona: false }]),
        [{ speaker: 'Ian', description: '18, rapid-fire staccato, nervous and tripping over words' }]);
    assert.equal(withoutVoiceCueLines(source, ['Ian']), 'He swallows hard.\n\nIan: "Oh! Uh, hi!"');
    assert.deepEqual(parseVoiceCues(source.replace('NPC_VOICE Ian', 'NPC_VOICE speaker=Ian'),
        [{ speakerLabel: 'Ian', text: 'Oh! Uh, hi!', isPersona: false }]),
        [{ speaker: 'Ian', description: '18, rapid-fire staccato, nervous and tripping over words' }]);
});

test('removes only recognized complete cue lines outside code fences', () => {
    const source = `${line}\n\nMira: "Wait."\n[[NPC_VOICE speaker="Other" description="Unknown"]]\n\n`
        + `\`\`\`text\n${line}\n\`\`\`\n${line}\nMira: "Go."`;
    assert.equal(withoutVoiceCueLines(source, ['Mira']), 'Mira: "Wait."\n'
        + '[[NPC_VOICE speaker="Other" description="Unknown"]]\n\n'
        + `\`\`\`text\n${line}\n\`\`\`\nMira: "Go."`);
    assert.equal(withoutVoiceCueLines(line, ['Mira']), '');
});
