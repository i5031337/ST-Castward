import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogVoices, discoverSpeechCatalog, normalizeSpeechCatalog, speechCatalogUrls } from '../src/tts/speech-catalog.js';

test('catalog routes retain endpoint prefix and ignore query parameters', () => {
    assert.deepEqual(speechCatalogUrls('http://localhost:9000/proxy/v1/audio/speech?token=old'), [
        'http://localhost:9000/proxy/v1/models',
        'http://localhost:9000/proxy/v1/voices',
        'http://localhost:9000/proxy/v1/audio/voices',
        'http://localhost:9000/proxy/ui/config',
    ]);
    assert.throws(() => speechCatalogUrls('file:///v1/audio/speech'));
});

test('catalog reads served models and model-specific voices', async () => {
    const requested = [];
    const request = async url => {
        requested.push(url);
        if (url.endsWith('/ui/config')) return { ok: true, json: async () => ({ profiles: [
            { id: 'kokoro', design_model: null }, { id: 'qwen3-tts', design_model: 'qwen-design' },
        ] }) };
        const data = url.endsWith('/models') ? [{ id: 'kokoro' }, { id: 'qwen3-tts' }]
            : [{ id: 'af_heart', model: 'kokoro' }, { id: 'voice-one', model: 'qwen3-tts' }];
        return { ok: true, json: async () => ({ data }) };
    };
    const result = await discoverSpeechCatalog('http://localhost:9000/v1/audio/speech', request);
    assert.deepEqual(result.models, ['kokoro', 'qwen3-tts']);
    assert.deepEqual(result.voices, [{ id: 'af_heart', model: 'kokoro' }, { id: 'voice-one', model: 'qwen3-tts' }]);
    assert.deepEqual(result.designModels, ['qwen3-tts']);
    assert.deepEqual(result.profileModels, ['kokoro', 'qwen3-tts']);
    assert.deepEqual(requested, ['http://localhost:9000/v1/models', 'http://localhost:9000/v1/voices',
        'http://localhost:9000/ui/config']);
});

test('missing voice route retries audio/voices and preserves models', async () => {
    const request = async url => url.endsWith('/voices') && !url.endsWith('/audio/voices')
        ? { ok: false, status: 404 }
        : { ok: true, json: async () => ({ data: url.endsWith('/models') ? [{ id: 'tts-1' }] : ['alloy'] }) };
    const result = await discoverSpeechCatalog('http://localhost:9000/v1/audio/speech', request);
    assert.deepEqual(result.models, ['tts-1']);
    assert.deepEqual(result.voices, [{ id: 'alloy', model: '' }]);
    assert.equal(result.designModels, null);
    assert.equal(result.profileModels, null);
});

test('saved catalog retains model-specific choices and removes duplicate entries', () => {
    const catalog = normalizeSpeechCatalog({ endpoint: 'http://localhost:8001/v1/audio/speech',
        models: ['npc', 'narrator', 'npc'],
        voices: [{ id: 'anna', model: 'npc' }, { id: 'anna', model: 'npc' },
            { id: 'anna', model: 'narrator' }, { id: 'alba', model: 'narrator' }],
        designModels: ['npc', 'missing'], profileModels: ['npc', 'missing'] });
    assert.deepEqual(catalog.models, ['npc', 'narrator']);
    assert.deepEqual(catalog.designModels, ['npc']);
    assert.deepEqual(catalog.profileModels, ['npc']);
    assert.deepEqual(catalogVoices(catalog, 'npc'), ['anna']);
    assert.deepEqual(catalogVoices(catalog, 'narrator'), ['anna', 'alba']);
});
