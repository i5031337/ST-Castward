import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readLocationStore } from '../src/locations/location-store.js';

const state = () => ({ locations: { enabled: true, currentId: 'inn', records: {
    inn: { id: 'inn', name: 'Copper Lantern', aliases: [], description: '', parentId: '' },
} } });

function fixture(request = async () => ({ output: { current: 'Old Ruins' }, raw: '{"current":"Old Ruins"}', warnings: [] })) {
    const source = readFileSync(new URL('../src/locations/location-reading.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replace(/^export\s+(?=(?:async\s+)?function|const|let|class)/gm, '');
    const requests = [];
    const api = new Function('readLocationStore', 'requestLocationReading',
        `${source}\nreturn { shouldReadSceneLocation, prepareSceneLocationReading };`)(
        readLocationStore, async args => { requests.push(args); return request(args); });
    return { ...api, requests };
}

const args = overrides => ({ state: state(), locationChanged: true, isCurrent: () => true,
    messageText: 'We enter the Old Ruins.', earlier: ['We leave the inn.'],
    trackerSettings: { extractionProfileId: 'local-gemma' }, playerName: 'Alex', ...overrides });

test('Places must be enabled for initialization and movement requests', async () => {
    const f = fixture();
    for (const current of [undefined, {}, { locations: { enabled: false, records: {} } },
        { locations: { ...state().locations, enabled: false } }]) {
        for (const locationChanged of [true, false, undefined]) {
            assert.equal(f.shouldReadSceneLocation(current, locationChanged), false);
            assert.equal(await f.prepareSceneLocationReading(args({ state: current, locationChanged })), null);
        }
    }
    assert.deepEqual(f.requests, []);
});

test('unknown or invalid current places initialize independently of the movement flag', async () => {
    const f = fixture();
    for (const currentId of ['', 'deleted-place']) {
        for (const locationChanged of [false, undefined, 'true']) {
            const current = state(); current.locations.currentId = currentId;
            assert.equal(f.shouldReadSceneLocation(current, locationChanged), true);
            const result = await f.prepareSceneLocationReading(args({ state: current, locationChanged }));
            assert.equal(result.status, 'done');
        }
    }
    assert.equal(f.requests.length, 6);
});

test('known locations trigger only for the literal true boolean', async () => {
    const f = fixture();
    for (const locationChanged of [false, undefined, null, 'true', 'false', 1, {}]) {
        assert.equal(f.shouldReadSceneLocation(state(), locationChanged), false);
        assert.equal(await f.prepareSceneLocationReading(args({ locationChanged })), null);
    }
    assert.equal(f.shouldReadSceneLocation(state(), true), true);
    assert.equal((await f.prepareSceneLocationReading(args())).status, 'done');
    assert.equal(f.requests.length, 1);
});

test('location preparation forwards evidence, connection settings and state without control flags', async () => {
    const reply = { output: { current: '' }, raw: { current: '' }, warnings: ['Reader note.'] };
    const f = fixture(async () => reply);
    const input = args();
    const before = structuredClone({ ...input, isCurrent: undefined });
    const result = await f.prepareSceneLocationReading(input);
    const { locationChanged, isCurrent, ...expected } = input;
    assert.deepEqual(f.requests, [expected]);
    assert.equal(f.requests[0].state, input.state);
    assert.equal(f.requests[0].trackerSettings, input.trackerSettings);
    assert.deepEqual(result, { ...reply, status: 'done' });
    assert.deepEqual({ ...input, isCurrent: undefined }, before);
    assert.equal(Object.hasOwn(reply, 'status'), false);
});

test('a stale source before the request produces no request or result', async () => {
    const f = fixture();
    assert.equal(await f.prepareSceneLocationReading(args({ isCurrent: () => false })), null);
    assert.deepEqual(f.requests, []);
});

test('a source changing during a successful request discards output and warnings', async () => {
    let current = true;
    const f = fixture(async () => {
        current = false;
        return { output: { current: 'Old Ruins' }, raw: 'old result', warnings: ['Old warning.'] };
    });
    assert.equal(await f.prepareSceneLocationReading(args({ isCurrent: () => current })), null);
    assert.equal(f.requests.length, 1);
});

test('a source changing during a failed request suppresses the obsolete failure', async () => {
    let current = true;
    const f = fixture(async () => { current = false; throw new Error('Old failure'); });
    assert.equal(await f.prepareSceneLocationReading(args({ isCurrent: () => current })), null);
    assert.equal(f.requests.length, 1);
});

test('request failures return a warning and preserve successful tracker work', async () => {
    const error = Object.assign(new Error('Connection unavailable'), { output: 'partial reply' });
    const f = fixture(async () => { throw error; });
    const result = await f.prepareSceneLocationReading(args());
    assert.equal(result.status, 'failed');
    assert.equal(result.output, null);
    assert.equal(result.raw, 'partial reply');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Location reading failed: Connection unavailable/);
    assert.match(result.warnings[0], /Regenerate.*retry/);
});

test('valid no-change replies remain completed readings without an invented proposal', async () => {
    const reply = { output: null, raw: '{}', warnings: [] };
    const result = await fixture(async () => reply).prepareSceneLocationReading(args());
    assert.deepEqual(result, { ...reply, status: 'done' });
});
