import { startActivity, getGenerationActivities } from '../src/core/generation-activity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/api/api-image-generate.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export ', '');
function fixture() {
    const metadata = {};
    let context = { chatMetadata: metadata, getCurrentChatId: () => 'chat-a' };
    const calls = [], pending = [];
    const dependencies = { startActivity,
        applyMacros: value => value,
        executeSlashCommandsWithOptions: (command, options) => {
            calls.push({ command, options });
            return new Promise((resolve, reject) => pending.push({ resolve, reject }));
        },
        getContext: () => context,
        debugLog() {}, recordUsage() {},
        DEFAULT_IMAGE_NEGATIVE_PROMPT: '',
    };
    const generate = new Function(...Object.keys(dependencies), `${source}\nreturn generateImage;`)(...Object.values(dependencies));
    return { calls, pending, generate: prompt => generate(prompt, { shape: {} }),
        changeChat: () => { context = { chatMetadata: {}, getCurrentChatId: () => 'chat-b' }; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('overlapping images run sequentially and each retains its result', async () => {
    const f = fixture();
    const first = f.generate('First landscape');
    const second = f.generate('Second landscape');
    await flush();
    assert.equal(f.calls.length, 1);
    assert.equal(getGenerationActivities().filter(activity => activity.kind === 'image').length, 1);
    f.pending[0].resolve({ pipe: '/first.png' });
    assert.equal(await first, '/first.png');
    await flush();
    assert.equal(f.calls.length, 2);
    f.pending[1].resolve({ pipe: '/second.png' });
    assert.equal(await second, '/second.png');
    assert.deepEqual(getGenerationActivities(), []);
});

test('a failed command reports its error and releases the next image', async () => {
    const f = fixture();
    const first = f.generate('First');
    const failed = assert.rejects(first, /fixture provider error/);
    const second = f.generate('Second');
    await flush();
    f.pending[0].resolve({ isError: true, errorMessage: 'fixture provider error' });
    await failed;
    await flush();
    assert.equal(f.calls.length, 2);
    f.pending[1].resolve({ pipe: '/second.png' });
    assert.equal(await second, '/second.png');
});

test('queued images do not start in a different chat', async () => {
    const f = fixture();
    const first = f.generate('First');
    const second = f.generate('Second');
    const canceled = assert.rejects(second, /Chat changed before image generation/);
    await flush();
    f.changeChat();
    f.pending[0].resolve({ pipe: '/first.png' });
    await first;
    await canceled;
    assert.equal(f.calls.length, 1);
});
