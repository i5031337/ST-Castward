import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVoiceCues, standaloneVoiceCues, voiceCueKey, withoutVoiceCueLines } from '../src/tts/voice-cue-format.js';

const source = readFileSync(new URL('../src/tts/voice-cues.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ');
let cards = [];
let textElement = null;
let strips = 0;
const { saveVoiceCues, voiceCueFor, retainVoiceCues } = new Function(
    'voiceCueKey', 'parseVoiceCues', 'standaloneVoiceCues', 'withoutVoiceCueLines',
    'makeId', 'getActiveCharacters', 'NPC_TTS_PROVIDER', 'document', 'stripVoiceCueNodes',
    `${source}\nreturn {saveVoiceCues, voiceCueFor, retainVoiceCues};`,
)(voiceCueKey, parseVoiceCues, standaloneVoiceCues, withoutVoiceCueLines,
    () => 'fresh-cue', () => cards, 'SillyNPC OpenAI Compatible',
    { querySelector: () => textElement }, text => { if (text) { strips++; text.cue = false; } });

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

test('captured cue is removed from persisted message and current swipe only', () => {
    cards = [];
    const tag = '[[NPC_VOICE speaker="Mira" description="Warm and low."]]';
    const original = `${tag}\n\nMira: "Wait."`;
    const message = { mes: original, swipe_id: 1, swipes: ['Older reply.', original],
        extra: { display_text: original }, swipe_info: [{}, { extra: { display_text: original } }] };
    let saves = 0;
    const context = { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'chat',
        saveMetadataDebounced: () => {}, saveChat: () => saves++ };
    const records = [{ speakerLabel: 'Mira', text: 'Wait.', isPersona: false }];
    assert.equal(retainVoiceCues(0, records, context), 1);
    assert.equal(message.mes, 'Mira: "Wait."');
    assert.equal(message.swipes[1], message.mes);
    assert.equal(message.swipes[0], 'Older reply.');
    assert.equal(message.extra.display_text, message.mes);
    assert.equal(message.swipe_info[1].extra.display_text, message.mes);
    assert.equal(voiceCueFor('Mira', null, context).description, 'Warm and low.');
    assert.equal(saves, 1);
    assert.equal(retainVoiceCues(0, records, context), 0);
    assert.equal(saves, 1);
});

test('cue cleanup keeps existing message decorations in place', () => {
    cards = [];
    strips = 0;
    textElement = { cue: true, portrait: 'Mira portrait' };
    const message = { mes: '[[NPC_VOICE Mira description="Warm and low."]]\nMira: "Wait."' };
    const context = { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'chat',
        saveMetadataDebounced: () => {}, saveChat: () => {},
        updateMessageBlock: () => { throw new Error('Message rerender erased decorations'); } };
    assert.equal(retainVoiceCues(0, [{ speakerLabel: 'Mira', text: 'Wait.' }], context), 1);
    assert.equal(message.mes, 'Mira: "Wait."');
    assert.equal(strips, 1);
    assert.deepEqual(textElement, { cue: false, portrait: 'Mira portrait' });
    textElement = null;
});

test('existing card preset ignores a repeated cue and leaves an unknown speaker alone', () => {
    cards = [{ id: 'mira', name: 'Mira', presentation: { voices: {
        'SillyNPC OpenAI Compatible': { mode: 'voice', voiceId: 'nova' },
    } } }];
    const tag = '[[NPC_VOICE Mira description="A different voice"]]';
    const unknown = '[[NPC_VOICE speaker="Unknown" description="A new voice"]]';
    const message = { mes: `${tag}\n${unknown}\nMira: "Wait."` };
    const context = { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'chat',
        saveMetadataDebounced: () => {}, saveChat: () => {} };
    const records = [{ speakerLabel: 'Mira', npcId: 'mira', text: 'Wait.', isPersona: false }];
    assert.equal(retainVoiceCues(0, records, context), 0);
    assert.equal(message.mes, `${unknown}\nMira: "Wait."`);
    assert.equal(context.chatMetadata.sillynpc_voice_cues, undefined);
    cards[0].presentation.voices['SillyNPC OpenAI Compatible'] = { mode: 'disabled' };
    message.mes = `${tag}\nMira: "Wait."`;
    assert.equal(retainVoiceCues(0, records, context), 0);
    assert.equal(message.mes, 'Mira: "Wait."');
    cards = [];
});

test('a new voice cue stays in source if chat metadata cannot retain it', () => {
    cards = [];
    const tag = '[[NPC_VOICE speaker="Mira" description="Warm and low."]]';
    const message = { mes: `${tag}\nMira: "Wait."` };
    let saves = 0;
    const context = { chat: [message], saveChat: () => saves++ };
    const records = [{ speakerLabel: 'Mira', text: 'Wait.', isPersona: false }];
    assert.equal(retainVoiceCues(0, records, context), 0);
    assert.equal(message.mes, `${tag}\nMira: "Wait."`);
    assert.equal(saves, 0);
});

test('standalone tag for an already voiced card alias is removed without dialogue', () => {
    cards = [{ id: 'mira', name: 'Mira', aliases: [{ pattern: 'The Guard' }],
        presentation: { voiceDesign: { description: 'Steady and low.', version: 1 } } }];
    const tag = '[[NPC_VOICE speaker="The Guard" description="A different voice"]]';
    const message = { mes: `${tag}\n\nThe hall is quiet.` };
    let saves = 0;
    const context = { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'chat',
        saveMetadataDebounced: () => {}, saveChat: () => saves++ };
    assert.equal(retainVoiceCues(0, [], context), 0);
    assert.equal(message.mes, 'The hall is quiet.');
    assert.equal(saves, 1);
    assert.equal(context.chatMetadata.sillynpc_voice_cues, undefined);
    cards = [];
});

test('standalone tag without an existing voice remains available for later capture', () => {
    cards = [{ id: 'mira', name: 'Mira', presentation: { voices: {} } }];
    const tag = '[[NPC_VOICE speaker="Mira" description="Steady and low."]]';
    const message = { mes: `${tag}\n\nThe hall is quiet.` };
    const context = { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'chat',
        saveMetadataDebounced: () => {}, saveChat: () => { throw new Error('Unexpected save'); } };
    assert.equal(retainVoiceCues(0, [], context), 0);
    assert.equal(message.mes, `${tag}\n\nThe hall is quiet.`);
    cards = [];
});

test('standalone tag for a saved chat voice is removed without dialogue', () => {
    cards = [];
    const tag = '[[NPC_VOICE speaker="Mira" description="A different voice"]]';
    const message = { mes: `${tag}\nThe hall is quiet.` };
    const context = { chat: [message], chatMetadata: { sillynpc_voice_cues: {
        mira: { id: 'saved-voice', description: 'Steady and low.', version: 1 },
    } }, getCurrentChatId: () => 'chat', saveChat: () => {} };
    assert.equal(retainVoiceCues(0, [], context), 0);
    assert.equal(message.mes, 'The hall is quiet.');
    assert.equal(voiceCueFor('Mira', null, context).description, 'Steady and low.');
});
