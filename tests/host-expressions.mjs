import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Host exports are substituted so these tests exercise the adapter without booting SillyTavern.
const source = (await readFile(new URL('../src/expressions/host-expressions.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '')
    .replace("await import('../../../../../extensions/expressions/index.js')", 'globalThis.expressionHostFixture.host');
let fixtureId = 0;
async function adapter(fixture) {
    globalThis.expressionHostFixture = fixture;
    const declarations = `const { extension_settings, doExtrasFetch, getApiUrl, modules, getRequestHeaders, substituteParams,
        trimToEndSentence, trimToStartSentence, normalizeSpriteFolder } = globalThis.expressionHostFixture;\n`;
    return import('data:text/javascript;base64,' + Buffer.from(declarations + source + `\n// fixture ${fixtureId++}`).toString('base64'));
}
const fixtures = overrides => ({ extension_settings: {}, modules: ['classify'], getApiUrl: () => 'http://extras.test:5100/',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json' }), substituteParams: text => text,
    trimToEndSentence: text => text, trimToStartSentence: text => text, normalizeSpriteFolder: text => text,
    ...overrides });
const input = api => ({ line: { text: '"Hello."' }, config: { api, fallback: 'neutral' }, sprites: [{ label: 'joy' }] });

test('local and Extras classifiers forward request cancellation and use the selected backend', async () => {
    const originalFetch = globalThis.fetch, calls = [];
    const fetch = async (url, options) => { calls.push([String(url), options]); return new Response('{"classification":[{"label":"joy"}]}'); };
    try {
        globalThis.fetch = fetch;
        const host = await adapter(fixtures({ doExtrasFetch: fetch }));
        const controller = new AbortController();
        assert.equal(await host.classifyDialogue({ ...input(0), signal: controller.signal }), 'joy');
        assert.equal(await host.classifyDialogue({ ...input(1), signal: controller.signal }), 'joy');
        assert.deepEqual(calls.map(call => call[0]), ['/api/extra/classify', 'http://extras.test:5100/api/classify']);
        assert.equal(calls.every(call => call[1].signal === controller.signal), true);
        assert.equal(JSON.parse(calls[0][1].body).text, 'Hello.');
        controller.abort();
        await assert.rejects(host.classifyDialogue({ ...input(0), signal: controller.signal }), { name: 'AbortError' });
        assert.equal(calls.length, 2);
    } finally { globalThis.fetch = originalFetch; delete globalThis.expressionHostFixture; }
});

test('uncancellable WebLLM keeps its native lock after caller cancellation without blocking fallback', async () => {
    let finish, requests = 0;
    try {
        const host = await adapter(fixtures({ host: { getExpressionLabel: () => {
            requests++; return new Promise(resolve => { finish = resolve; });
        } } }));
        const controller = new AbortController();
        const first = host.classifyDialogue({ ...input(3), signal: controller.signal });
        await Promise.resolve(); controller.abort();
        assert.equal(await host.classifyDialogue(input(3)), 'neutral');
        assert.equal(requests, 1);
        finish('joy'); assert.equal(await first, 'joy');
        const next = host.classifyDialogue(input(3)); await Promise.resolve();
        assert.equal(requests, 2); finish('joy'); await next;
    } finally { delete globalThis.expressionHostFixture; }
});
