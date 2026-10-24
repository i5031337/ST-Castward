import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';

const source = readFileSync(new URL('../src/api/api-lore-generate.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('export async function requestLore'),
    source.indexOf('/**\n * Generates lore tags')).replace('export async function', 'async function');

for (const profile of [false, true]) {
    for (const event of ['stop', 'chat']) {
        test(`${event} cancels ${profile ? 'profile' : 'main API'} lore without fallback or late usage`, async () => {
            const cancellation = readerCancellationHarness();
            let finish, calls = 0, signal;
            const usage = [];
            const pending = new Promise(resolve => { finish = resolve; });
            const deps = {
                ...cancellation,
                getContext: () => ({
                    ConnectionManagerRequestService: { sendRequest: (...args) => {
                        calls++; signal = args[3].signal; return pending;
                    } },
                    generateRawData: () => { calls++; return pending; },
                }),
                getSettings: () => ({ loreProfileId: profile ? 'selected' : '' }),
                debugLog() {}, describeConnection: () => 'Fixture', promptText: () => 'System',
                customProfilePayload: () => ({}), extractMessageFromData: () => 'Late reply',
                recordUsage: (...args) => usage.push(args), loreReplyWasTruncated: () => false,
                LOG_PREFIX: 'test',
            };
            const request = new Function(...Object.keys(deps), `let lastLoreConnection; ${body}\nreturn requestLore;`)(...Object.values(deps));
            const response = request('Fixture');
            assert.equal(cancellation.button.style.display, 'flex');
            cancellation.emit(event);
            await assert.rejects(response, { name: 'AbortError' });
            if (profile) assert.equal(signal.aborted, true);
            finish({ content: 'Late reply' });
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(calls, 1);
            assert.deepEqual(usage, []);
            assert.equal(cancellation.listeners(), 0);
            assert.equal(cancellation.button.style.display, 'none');
        });
    }
}
