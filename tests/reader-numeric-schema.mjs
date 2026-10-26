import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPromptText } from '../src/prompts/prompt-texts.js';
import { harness } from './fixtures/gemma-tracker-harness.mjs';
import { readerSchemaForConnection } from '../src/tracker/extractor/status-extractor-schema-provider.js';

const schema = { type: 'object', properties: {
    Rating: { type: 'string', pattern: '^[0-9]+$' },
    pattern: { type: 'string' }, Note: { type: 'string' },
} };

test('numeric stat patterns allow complete readings and exclude malformed strings', async () => {
    const reader = await harness('fantasy', {});
    const fields = reader.schema.properties.player.properties.stats.properties;
    const pattern = new RegExp(fields.HP.pattern);
    for (const good of ['0', '-3', '4.5', '8/12', '-1.5/12.5']) assert.ok(pattern.test(good), good);
    for (const bad of ['', ' ', ',', '+1', '>14', '{21}', '}18,{', '18 HP', '1,000', '1e3', '8/12/20'])
        assert.ok(!pattern.test(bad), bad);
    assert.equal(fields.Condition.pattern, undefined);
    assert.ok(reader.schema.properties.characters.items.properties.stats.properties.XP.pattern);
    assert.equal(reader.schema.properties.characters.items.properties.name.pattern, undefined);
    assert.equal(reader.schema.properties.player.properties.collections.properties.equipment.properties.add.items.properties.name.pattern, undefined);
});

for (const [label, context, profileId] of [
    ['native main', { mainApi: 'textgenerationwebui', textCompletionSettings: { type: 'llamacpp' } }, ''],
    ['GGUF custom main', { mainApi: 'openai', chatCompletionSettings: { chat_completion_source: 'custom', custom_model: '/models/gemma.GGUF' } }, ''],
    ['native profile', { ConnectionManagerRequestService: { getProfile: () => ({ api: 'llamacpp' }) } }, 'reader'],
    ['GGUF custom profile', { ConnectionManagerRequestService: { getProfile: () => ({ api: 'custom', model: '/models/gemma.gguf' }) } }, 'reader'],
]) {
    test(`numeric patterns remain enabled for ${label}`, () => {
        assert.equal(readerSchemaForConnection(schema, context, profileId), schema);
    });
}

for (const [label, context, profileId] of [
    ['Google main', { mainApi: 'openai', chatCompletionSettings: { chat_completion_source: 'makersuite' } }, ''],
    ['unknown custom main', { mainApi: 'openai', chatCompletionSettings: { chat_completion_source: 'custom', custom_model: 'unknown-model' } }, ''],
    ['Google profile', { ConnectionManagerRequestService: { getProfile: () => ({ api: 'google' }) } }, 'reader'],
    ['unavailable profile', { ConnectionManagerRequestService: { getProfile: () => { throw Error('Deleted'); } } }, 'reader'],
]) {
    test(`portable schema for ${label} preserves fields and leaves the original intact`, () => {
        const before = structuredClone(schema), adapted = readerSchemaForConnection(schema, context, profileId);
        assert.equal(adapted.properties.Rating.pattern, undefined);
        assert.deepEqual(adapted.properties.pattern, { type: 'string' });
        assert.deepEqual(schema, before);
    });
}

test('reader and inline XP guidance includes successful purposeful skill or spell use', () => {
    for (const id of ['reader', 'storyBlock']) {
        assert.match(defaultPromptText(id), /Award modest XP for successful, purposeful use of a skill or spell/);
        assert.doesNotMatch(defaultPromptText(id), /Rest, care, accidents/);
    }
});
