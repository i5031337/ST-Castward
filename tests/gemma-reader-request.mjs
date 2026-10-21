import assert from 'node:assert/strict';
import test from 'node:test';
import { readerRequestBody } from './fixtures/gemma-reader-request.mjs';

const bundle = {
    settings: { extractionMaxTokens: 2400 },
    messages: [{ role: 'user', content: 'A frozen scene.' }],
    schema: { type: 'object', properties: { reading: { type: 'string' } } },
};
test('unconstrained request retains the existing inference payload', () => {
    assert.deepEqual(readerRequestBody(bundle, 'E4B'), {
        model: 'E4B', messages: bundle.messages, max_tokens: 2400, stream: false,
    });
});
test('schema mode actually sends the frozen schema in the llama.cpp response format', () => {
    const body = JSON.parse(JSON.stringify(readerRequestBody(bundle, 'E4B', { useSchema: true })));
    assert.deepEqual(body.response_format, {
        type: 'json_schema', json_schema: { name: 'castward_reader', schema: bundle.schema },
    });
    delete body.response_format;
    assert.deepEqual(body, readerRequestBody(bundle, 'E4B'));
});
test('constrained mode rejects a missing schema instead of silently running unconstrained', () => {
    assert.throws(() => readerRequestBody({ ...bundle, schema: null }, 'E4B', { useSchema: true }), /requires a frozen schema/);
});
