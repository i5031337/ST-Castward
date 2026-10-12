import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dialogueLabels } from '../src/chat/dialogue-line.js';
import { createSpeechQueue } from '../src/tts/speech-queue.js';
import { wireSpeechEvents } from '../src/tts/speech-events.js';
import { normalizeTtsSettings, resolveUnitVoice, resolveUnitSpeech, ttsConfigError, NPC_TTS_PROVIDER, resolvePreviewSpeech, dialogueVoices } from '../src/tts/tts-settings.js';

const source = readFileSync(new URL('../src/tts/speech-units.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');
const splitSpeechLine = new Function('dialogueLabels', `${source}\nreturn splitSpeechLine;`)(dialogueLabels);

test('speaker quotes and surrounding prose become ordered, separate voices', () => {
    const line = 'Mira: “Wait.” She lowers her sword. “Stay.”';
    const match = { label: { name: 'Mira' }, dialogue: { quotedText: '“Wait.” “Stay.”' } };
    assert.deepEqual(splitSpeechLine(line, match), [
        { kind: 'dialogue', text: 'Wait.' },
        { kind: 'narration', text: 'She lowers her sword.' },
        { kind: 'dialogue', text: 'Stay.' },
    ]);
    assert.deepEqual(splitSpeechLine('The door opens.', null), [{ kind: 'narration', text: 'The door opens.' }]);
    assert.deepEqual(splitSpeechLine('Mira: “Wait.”', { label: { name: 'Mira' }, dialogue: { quotedText: '“Missing.”' } }),
        [{ kind: 'narration', text: '“Wait.”' }]);
});

test('independent speech preferences keep explicit silence and missing voices', () => {
    const config = normalizeTtsSettings({ enabled: true, endpoint: 'https://stale.example/speech',
        model: 'kokoro', narratorVoice: 'alloy', voices: ['alloy', 'nova', 'nova'] });
    assert.equal(Object.hasOwn(config, 'endpoint'), false);
    assert.equal(ttsConfigError(config, 'http://localhost/v1/audio/speech'), '');
    assert.match(ttsConfigError(config, ''), /built-in OpenAI Compatible TTS/);
    assert.deepEqual(config.voices, ['alloy', 'nova']);
    const dialogue = { kind: 'dialogue' };
    assert.equal(resolveUnitVoice({ kind: 'narration' }, config, null), 'alloy');
    assert.equal(resolveUnitVoice(dialogue, config, { presentation: { voices: {
        [NPC_TTS_PROVIDER]: { mode: 'voice', voiceId: 'nova' },
    } } }), 'nova');
    assert.equal(resolveUnitVoice(dialogue, config, { presentation: { voices: {
        [NPC_TTS_PROVIDER]: { mode: 'disabled' },
    } } }), null);
    assert.equal(resolveUnitVoice(dialogue, config, { presentation: { voices: {
        [NPC_TTS_PROVIDER]: { mode: 'voice', voiceId: 'removed' },
    } } }), null);
    assert.equal(resolveUnitVoice(dialogue, config, null), 'alloy');
});

test('Kokoro narration and designed NPC speech use separate model and stable versioned identity', () => {
    const config = normalizeTtsSettings({ enabled: true, model: 'kokoro', npcModel: 'qwen3-tts',
        narratorVoice: 'af_alloy', voices: ['af_alloy'] });
    const card = { id: 'card-123', presentation: { voiceDesign: {
        description: 'A gentle voice with a bright tone.', version: 3,
    } } };
    assert.deepEqual(resolveUnitSpeech({ kind: 'narration', text: 'The door opens.' }, config, card),
        { voice: 'af_alloy', model: 'kokoro' });
    const first = resolveUnitSpeech({ kind: 'dialogue', text: 'Hello.' }, config, card);
    const second = resolveUnitSpeech({ kind: 'dialogue', text: 'Hello.' }, config, card);
    assert.equal(first.model, 'qwen3-tts');
    assert.equal(first.voice, second.voice);
    const encoded = first.voice.split(':')[1].replace(/-/gu, '+').replace(/_/gu, '/');
    const fields = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    assert.equal(fields.npc_id, 'sn_card-123_v3');
    assert.equal(fields.instructions, card.presentation.voiceDesign.description);
    assert.equal(fields.max_new_tokens, 128);
    card.presentation.voiceDesign.version++;
    assert.notEqual(resolveUnitSpeech({ kind: 'dialogue', text: 'Hello.' }, config, card).voice, first.voice);
    card.presentation.voices = { [NPC_TTS_PROVIDER]: { mode: 'disabled' } };
    assert.equal(resolveUnitSpeech({ kind: 'dialogue', text: 'Hello.' }, config, card).voice, null);
});

test('speech queue prefetches requests while keeping playback ordered and bounded', async () => {
    const calls = [];
    let finishFirst;
    const queue = createSpeechQueue({
        valid: () => true,
        synthesize: async unit => { calls.push(`synth:${unit.text}`); return unit.text; },
        playAudio: unit => { calls.push(`play:${unit}`); return unit === 'first'
            ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve(); },
    });
    const pending = queue.play(1, 'revision', [
        { text: 'first', voice: 'a' }, { text: 'second', voice: 'b' },
        { text: 'third', voice: 'c' }, { text: 'fourth', voice: 'd' },
    ]);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls.filter(call => call.startsWith('synth:')),
        ['synth:first', 'synth:second', 'synth:third']);
    assert.deepEqual(calls.filter(call => call.startsWith('play:')), ['play:first']);
    finishFirst(); await pending;
    assert.deepEqual(calls.filter(call => call.startsWith('synth:')),
        ['synth:first', 'synth:second', 'synth:third', 'synth:fourth']);
    assert.deepEqual(calls.filter(call => call.startsWith('play:')),
        ['play:first', 'play:second', 'play:third', 'play:fourth']);

    let release;
    const interrupted = createSpeechQueue({
        valid: () => true,
        synthesize: () => new Promise(resolve => { release = resolve; }),
        playAudio: () => { calls.push('stale audio'); return Promise.resolve(); },
    });
    const stale = interrupted.play(2, 'old', [{ text: 'old', voice: 'a' }]);
    await new Promise(resolve => setImmediate(resolve));
    interrupted.stop(); release('old'); await stale;
    assert.equal(calls.includes('stale audio'), false);
});

test('Stop aborts a prefetched request and prevents later playback', async () => {
    const calls = [];
    let finishFirst;
    const queue = createSpeechQueue({
        valid: () => true,
        synthesize: (unit, signal) => {
            calls.push(`synth:${unit.text}`);
            if (unit.text !== 'second') return Promise.resolve(unit.text);
            return new Promise((_, reject) => signal.addEventListener('abort',
                () => reject(new Error('aborted')), { once: true }));
        },
        playAudio: (audio, signal) => {
            calls.push(`play:${audio}`);
            return new Promise(resolve => {
                finishFirst = resolve;
                signal.addEventListener('abort', resolve, { once: true });
            });
        },
    });
    const pending = queue.play(1, 'revision', [
        { text: 'first', voice: 'a' }, { text: 'second', voice: 'b' }, { text: 'third', voice: 'c' },
    ]);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['synth:first', 'play:first', 'synth:second']);
    queue.stop();
    finishFirst();
    await pending;
    assert.deepEqual(calls.filter(call => call.startsWith('play:')), ['play:first']);
    assert.equal(calls.includes('synth:third'), false);
});

test('automatic speech waits for a changed completed reply and rejects stale source', async () => {
    const listeners = new Map();
    const events = { on: (name, handler) => listeners.set(name, handler) };
    const fire = (name, ...args) => listeners.get(name)?.(...args);
    const types = Object.fromEntries(['GENERATION_STARTED', 'GENERATION_STOPPED', 'GENERATION_ENDED',
        'CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_UPDATED']
        .map(name => [name, name]));
    let revision = 'old', token = {}, pending, stops = 0, completions = 0;
    wireSpeechEvents({ events, types, renderedEvent: 'rendered', render: () => {},
        stop: () => stops++, latestId: () => 5, revision: () => revision,
        sourceToken: () => token, defer: callback => { pending = callback; },
        complete: () => { completions++; } });
    fire('rendered'); fire(types.GENERATION_ENDED);
    assert.equal(completions, 0);
    fire(types.GENERATION_STARTED, 'normal', null, true);
    assert.equal(stops, 0);
    fire(types.GENERATION_STARTED, 'normal');
    revision = 'new';
    fire(types.MESSAGE_UPDATED); // streaming updates do not cancel the pending generation
    fire(types.GENERATION_ENDED);
    revision = 'cleaned status block'; // final DOM cleanup may revise text in the same message object
    pending(); await Promise.resolve();
    assert.equal(completions, 1);
    fire(types.GENERATION_STARTED, 'normal');
    revision = 'later'; fire(types.GENERATION_ENDED);
    token = {}; pending(); await Promise.resolve();
    assert.equal(completions, 1);
    fire(types.GENERATION_STARTED, 'normal');
    revision = 'latest'; fire(types.GENERATION_ENDED);
    fire(types.CHAT_CHANGED); pending(); await Promise.resolve();
    assert.equal(completions, 1);
    assert.equal(stops, 4);
});

test('speaker notifications follow audio start, not prefetched synthesis or play invocation', async () => {
    const states = [], starts = [], ends = [];
    const queue = createSpeechQueue({valid: () => true,
        synthesize: async unit => unit.text,
        playAudio: (blob, signal, start) => new Promise(resolve => {
            starts.push(start); ends.push(resolve); signal.addEventListener('abort', resolve, {once:true});
        }),
        onState: (state, job, unit) => { if (state === 'playing') states.push(unit.text); },
    });
    const task = queue.play(1, 'revision', [{text:'first',voice:'a'}, {text:'second',voice:'b'}]);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(states, []);
    starts[0](); assert.deepEqual(states, ['first']);
    ends[0](); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(states, ['first']);
    queue.stop(); starts[1](); await task;
    assert.deepEqual(states, ['first']);
});

test('Stop during expression preparation prevents synthesis and stale playback', async () => {
    let release; const calls = [];
    const queue = createSpeechQueue({valid: () => true,
        prepare: () => new Promise(resolve => {release=resolve;}),
        synthesize: async () => calls.push('synthesize'), playAudio: async () => calls.push('audio')});
    const task=queue.play(1,'revision',[{voice:'a',text:'hello'}]);
    queue.stop(); if (release) release(); await task;
    assert.deepEqual(calls, []);
});


test('narrator fallbacks use narrator model for cardless, default and undescribed dialogue', () => {
    const config = normalizeTtsSettings({ model: 'narration-model', npcModel: 'dialogue-model',
        voices: ['narrator'], npcVoices: ['npc-only'], narratorVoice: 'narrator' });
    const unit = { kind: 'dialogue', text: 'Hello.' };
    const narrator = { voice: 'narrator', model: 'narration-model' };
    assert.deepEqual(resolveUnitSpeech(unit, config, null), narrator);
    assert.deepEqual(resolveUnitSpeech(unit, config, { id: 'npc' }), narrator);
    const binding = { [NPC_TTS_PROVIDER]: { mode: 'voice', voiceId: 'npc-only' } };
    const card = { id: 'npc', presentation: { voices: binding } };
    assert.deepEqual(resolveUnitSpeech(unit, config, card), { voice: 'npc-only', model: 'dialogue-model' });
    assert.deepEqual(resolvePreviewSpeech('npc-only', config, card, unit.text), resolveUnitSpeech(unit, config, card));
    assert.deepEqual(resolvePreviewSpeech('', config, { id: 'npc' }, unit.text), narrator);
    assert.deepEqual(resolvePreviewSpeech('narrator', config, null, unit.text), narrator);
    assert.throws(() => resolvePreviewSpeech('npc-only', config, null, unit.text), /narrator voice list/);
    assert.deepEqual(dialogueVoices(normalizeTtsSettings({ voices: ['narrator'] })), ['narrator']);
    config.npcVoiceMode = 'designed';
    assert.deepEqual(resolveUnitSpeech(unit, config, card), narrator);
});

test('local voice design is an explicit capability independent of model identifier', () => {
    const card = { id: 'npc', presentation: { voiceDesign: { description: 'A low gentle voice.', version: 1 } } };
    const config = normalizeTtsSettings({ model: 'narration-model', npcModel: 'custom-design-model',
        npcVoiceMode: 'designed', voices: ['narrator'], narratorVoice: 'narrator' });
    const unit = { kind: 'dialogue', text: 'Hello.' };
    const designed = resolveUnitSpeech(unit, config, card);
    assert.equal(designed.model, 'custom-design-model');
    assert.match(designed.voice, /^sillynpc-v1:/u);
    assert.deepEqual(resolvePreviewSpeech('', config, card, unit.text), designed);
    const ordinaryQwen = normalizeTtsSettings({ ...config, npcModel: 'qwen3-tts', npcVoiceMode: 'listed' });
    assert.deepEqual(resolveUnitSpeech(unit, ordinaryQwen, card), { voice: 'narrator', model: 'narration-model' });
    assert.equal(normalizeTtsSettings({ npcModel: 'qwen3-tts' }).npcVoiceMode, 'designed');
});

test('expression preparation runs alongside speech and fails independently', async () => {
    const calls = []; let release;
    const queue = createSpeechQueue({ valid: () => true,
        prepare: () => new Promise((_, reject) => { release = reject; }),
        synthesize: async () => { calls.push('synthesis'); return 'audio'; },
        playAudio: async () => {
            calls.push('playback'); release(new Error('classifier unavailable'));
            await new Promise(resolve => setImmediate(resolve));
        },
        onState: state => calls.push(state),
    });
    await queue.play(1, 'revision', [{ voice: 'a', text: 'Hello.' }]);
    assert.ok(calls.includes('synthesis'));
    assert.ok(calls.includes('playback'));
    assert.ok(calls.includes('prepare-error'));
    assert.ok(!calls.includes('error'));
});


test('consumed audio can be collected while later segments are still playing', () => {
    const queueUrl = new URL('../src/tts/speech-queue.js', import.meta.url).href;
    execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        const { createSpeechQueue } = await import(${JSON.stringify(queueUrl)});
        let firstAudio, finishLast, startedLast;
        const lastPlaying = new Promise(resolve => { startedLast = resolve; });
        const queue = createSpeechQueue({ valid: () => true,
            synthesize: async unit => {
                const audio = { index: unit.text, data: new Uint8Array(1024 * 1024) };
                if (unit.text === '0') firstAudio = new WeakRef(audio);
                return audio;
            },
            playAudio: audio => {
                if (audio.index !== '5') return Promise.resolve();
                startedLast();
                return new Promise(resolve => { finishLast = resolve; });
            },
        });
        const playing = queue.play(1, 'revision', Array.from({length: 6}, (_, index) => ({
            text: String(index), voice: 'a',
        })));
        await lastPlaying;
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setImmediate(resolve));
            global.gc();
        }
        assert.equal(firstAudio.deref(), undefined, 'earlier audio retained during later playback');
        finishLast(); await playing;
    `], { stdio: 'pipe' });
});
