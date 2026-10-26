import { getGenerationActivities } from '../src/core/generation-activity.js';
import { defaultTrackerSettings } from '../src/core/settings-tracker-defaults.js';
import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';
import { readerSchemaForConnection } from '../src/tracker/extractor/status-extractor-schema-provider.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { customProfilePayload, profileContext } from './helpers/connection-profile.mjs';

const source = (await readFile(new URL('../src/tracker/extractor/status-extractor-request.js', import.meta.url), 'utf8'))
    .replace(/^import .*;$/gm, '').replace(/export (async )?function/g, '$1function');
function build(context) {
    profileContext(context);
    const events = [], usage = [];
    const cancellation = readerCancellationHarness();
    const request = new Function('getContext', 'applyMacros', 'LOG_PREFIX', 'debugLog', 'SYSTEM_PROMPT',
        'describeConnection', 'extractJSON', 'safeJsonParse', 'recordUsage', 'extractMessageFromData', 'toastr', 'console', 'customProfilePayload', 'startGenerationTask', 'awaitGenerationRequest', 'readerSchemaForConnection',
        `${source}\nreturn requestExtraction;`)(
        () => context, value => value, '[Castward]', () => {}, 'System', () => 'Connection',
        value => value, JSON.parse, (...args) => usage.push(args), raw => raw.choices[0].message.content,
        { warning: (...args) => events.push(['warning', ...args]) }, { warn: () => {} }, customProfilePayload, cancellation.startGenerationTask, cancellation.awaitGenerationRequest, readerSchemaForConnection);
    return { request, events, usage, cancellation };
}
const schema = { type: 'object' };
const namedSchema = { name: 'castward_reader', value: schema, strict: true };
const rawReply = { choices: [{ message: { content: '{"player":{}}' } }] };

test('extraction forwards assigned preset YAML alongside reader temperature and schema', async () => {
    let received;
    const { request } = build({ ConnectionManagerRequestService: {
        getProfile: id => { assert.equal(id, 'custom'); return { api: 'custom', preset: 'Model preset' }; },
        sendRequest: async (...args) => { received = args; return { content: { player: {} } }; },
    }, presets: { 'Model preset': { custom_include_body: 'temperature: 0.9\nmax_tokens: 800',
            custom_exclude_body: '- temperature', custom_include_headers: 'X-Model: {{model}}' } }, generateRawData: () => assert.fail('No fallback') });
    await request('Prompt', schema, { extractionProfileId: 'custom', extractionTemperature: '0.2',
        extractionUseSchema: true, extractionMaxTokens: 400 }, 'System');
    assert.equal(received[2], 400);
    assert.deepEqual(received[4], { temperature: 0.2, json_schema: namedSchema,
        custom_include_body: 'temperature: 0.9\nmax_tokens: 800', custom_exclude_body: '- temperature',
        custom_include_headers: 'X-Model: fixture-model' });
});

test('main API without a selected profile does not warn', async () => {
    let calls = 0;
    const { request, events, usage } = build({ generateRawData: async () => { calls++; return rawReply; } });
    assert.equal(await request('Prompt', schema, { extractionFallbackToMain: false }), '{"player":{}}');
    assert.equal(calls, 1);
    assert.deepEqual(events, []);
    assert.equal(usage.length, 1);
});

test('successful selected connection preserves its configuration without warning or fallback', async () => {
    let received;
    const { request, events, usage } = build({
        ConnectionManagerRequestService: { sendRequest: async (...args) => { received = args; return { content: { player: {} } }; } },
        generateRawData: () => assert.fail('Successful selected requests must not fall back'),
    });
    assert.deepEqual(await request('Prompt', schema, { extractionProfileId: 'reader', extractionUseSchema: true,
        extractionTemperature: '0.2', extractionMaxTokens: 500 }), { player: {} });
    assert.equal(received[0], 'reader');
    assert.equal(received[2], 500);
    assert.ok(received[3].signal instanceof AbortSignal);
    assert.deepEqual({ ...received[3], signal: undefined }, { extractData: true, includePreset: false, signal: undefined });
    assert.deepEqual(received[4], { json_schema: namedSchema, temperature: 0.2 });
    assert.deepEqual(events, []);
    assert.equal(usage.length, 1);
});

test('selected reader failure warns before retrying through the main API', async () => {
    const failure = new Error('Connection unavailable');
    const context = { ConnectionManagerRequestService: { sendRequest: async () => { throw failure; } } };
    const { request, events, usage } = build(context);
    context.generateRawData = async () => { events.push(['main']); return rawReply; };
    assert.equal(await request('Prompt', schema, { extractionProfileId: 'reader', extractionFallbackToMain: true }), '{"player":{}}');
    assert.equal(events.length, 2);
    assert.equal(events[0][0], 'warning');
    assert.deepEqual(events[1], ['main']);
    assert.equal(usage.length, 1);
});

test('disabled manager warns and preserves scan usage on fallback', async () => {
    const context = {};
    const { request, events, usage } = build(context);
    context.generateRawData = async () => { events.push(['main']); return { player: {} }; };
    assert.deepEqual(await request('Prompt', schema, { extractionProfileId: 'scan', extractionUseSchema: true, extractionFallbackToMain: true },
        'Scan system', { usageKind: 'scan' }), { player: {} });
    assert.equal(events[0][0], 'warning');
    assert.deepEqual(events[1], ['main']);
    assert.equal(usage[0][0], 'scan');
});

test('a failing main API still propagates its error after the fallback warning', async () => {
    const { request, events, usage } = build({
        ConnectionManagerRequestService: { sendRequest: async () => { throw new Error('Profile failed'); } },
        generateRawData: async () => { throw new Error('Main API failed'); },
    });
    await assert.rejects(request('Prompt', schema, { extractionProfileId: 'reader', extractionFallbackToMain: true }), /Main API failed/);
    assert.equal(events.length, 1);
    assert.equal(usage.length, 0);
});

for (const enabled of [false, true]) {
    test(`schema toggle ${enabled} forwards the host wrapper consistently through profile and main API`, async () => {
        let profilePayload, mainPayload;
        const { request } = build({
            ConnectionManagerRequestService: {
                sendRequest: async (...args) => { profilePayload = args[4]; return { content: { player: {} } }; },
            },
            generateRawData: async payload => { mainPayload = payload; return enabled ? { player: {} } : rawReply; },
        });
        const settings = { extractionUseSchema: enabled };
        await request('Prompt', schema, { ...settings, extractionProfileId: 'reader' });
        await request('Prompt', schema, settings);
        assert.deepEqual(profilePayload.json_schema, enabled ? namedSchema : undefined);
        assert.deepEqual(mainPayload.jsonSchema, enabled ? namedSchema : null);
        assert.deepEqual(schema, { type: 'object' });
    });
}

test('selected connection fallback preserves the wrapped schema', async () => {
    let received;
    const { request } = build({
        ConnectionManagerRequestService: { sendRequest: async () => { throw Error('Unavailable'); } },
        generateRawData: async payload => { received = payload; return { player: {} }; },
    });
    await request('Prompt', schema, { extractionProfileId: 'reader', extractionUseSchema: true, extractionFallbackToMain: true });
    assert.deepEqual(received.jsonSchema, namedSchema);
});

for (const profileId of ['', 'reader']) {
    test(`schema toggle without a schema sends no wrapper via ${profileId || 'main API'}`, async () => {
        let payload;
        const { request } = build({
            ConnectionManagerRequestService: { sendRequest: async (...args) => { payload = args[4]; return { content: '{}' }; } },
            generateRawData: async value => { payload = value; return rawReply; },
        });
        await request('Prompt', null, { extractionProfileId: profileId, extractionUseSchema: true });
        assert.equal(payload.json_schema, undefined);
        if (!profileId) assert.equal(payload.jsonSchema, null);
    });
}

for (const profile of [false, true]) {
    test(`Stop cancels ${profile ? 'profile' : 'main API'} request without fallback or late usage`, async () => {
        let complete, signal, calls = 0;
        const pending = new Promise(resolve => { complete = resolve; });
        const { request, events, usage, cancellation } = build({
            ConnectionManagerRequestService: { sendRequest: (...args) => { signal = args[3].signal; return pending; } },
            generateRawData: () => { calls++; return pending; },
        });
        const result = request('Prompt', null, profile ? { extractionProfileId: 'reader', extractionFallbackToMain: true } : {});
        assert.equal(cancellation.button.style.display, 'flex');
        cancellation.emit('stop');
        await assert.rejects(result, { name: 'AbortError' });
        if (profile) assert.equal(signal.aborted, true);
        complete(rawReply);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls, profile ? 0 : 1);
        assert.deepEqual(events, []);
        assert.deepEqual(usage, []);
        assert.equal(cancellation.listeners(), 0);
        assert.equal(cancellation.button.style.display, 'none');
    });
}

for (const profileSupportsPatterns of [true, false]) {
    test(`fallback chooses numeric pattern support per destination (profile=${profileSupportsPatterns})`, async () => {
        let profileSchema, mainSchema;
        const patterned = { type: 'object', properties: { Rating: { type: 'string', pattern: '^[0-9]+$' } } };
        const { request } = build({
            mainApi: profileSupportsPatterns ? 'openai' : 'textgenerationwebui',
            chatCompletionSettings: { chat_completion_source: 'makersuite' },
            textCompletionSettings: { type: 'llamacpp' },
            ConnectionManagerRequestService: {
                getProfile: () => ({ api: profileSupportsPatterns ? 'llamacpp' : 'google' }),
                sendRequest: async (...args) => { profileSchema = args[4].json_schema.value; throw Error('Unavailable'); },
            },
            generateRawData: async args => { mainSchema = args.jsonSchema.value; return { player: {} }; },
        });
        await request('Prompt', patterned, { extractionProfileId: 'reader', extractionUseSchema: true, extractionFallbackToMain: true });
        assert.equal(Boolean(profileSchema.properties.Rating.pattern), profileSupportsPatterns);
        assert.equal(Boolean(mainSchema.properties.Rating.pattern), !profileSupportsPatterns);
        assert.equal(patterned.properties.Rating.pattern, '^[0-9]+$');
    });
}
test('reader fallback is off by default', () => {
    assert.equal(defaultTrackerSettings.extractionFallbackToMain, false);
});

for (const fallback of [false, undefined]) {
    for (const missingManager of [false, true]) {
        test(`selected connection fails without fallback (setting=${fallback}, missing manager=${missingManager})`, async () => {
            const failure = new Error('Selected connection unavailable');
            const context = {
                generateRawData: () => assert.fail('Main API must not be called'),
                ...(missingManager ? {} : { ConnectionManagerRequestService: {
                    sendRequest: async () => { throw failure; },
                } }),
            };
            const { request, events, usage, cancellation } = build(context);
            await assert.rejects(request('Prompt', schema, {
                extractionProfileId: 'reader', extractionFallbackToMain: fallback,
            }, 'System'), missingManager ? { name: 'TypeError' } : failure);
            assert.deepEqual(events, []);
            assert.deepEqual(usage, []);
            assert.equal(cancellation.listeners(), 0);
            assert.equal(cancellation.button.style.display, 'none');
        });
    }
}

test('an AbortError never falls back even when retry is enabled', async () => {
    const { request, events, usage } = build({
        ConnectionManagerRequestService: { sendRequest: async () => {
            throw new DOMException('Cancelled', 'AbortError');
        } },
        generateRawData: () => assert.fail('Cancellation must not retry'),
    });
    await assert.rejects(request('Prompt', schema, {
        extractionProfileId: 'reader', extractionFallbackToMain: true,
    }), { name: 'AbortError' });
    assert.deepEqual(events, []);
    assert.deepEqual(usage, []);
});


for (const [usageKind, kind] of [
    ['extraction', 'tracker'],
    ['location', 'location'],
    ['fill', 'profile'],
]) {
    test(`${usageKind} exposes its live activity until the request finishes`, async () => {
        let complete;
        const pending = new Promise(resolve => { complete = resolve; });
        const { request } = build({ generateRawData: () => pending });
        const result = request('Prompt', null, {}, null, {
            usageKind, activityName: 'Mira',
        });
        assert.deepEqual(getGenerationActivities().map(activity => activity.kind), [kind]);
        complete(rawReply);
        await result;
        assert.deepEqual(getGenerationActivities(), []);
    });
}
