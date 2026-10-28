import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/entry/entry-new-chat-system.js', import.meta.url), 'utf8');
const createOffer = new Function(source.slice(source.indexOf('export function createNewChatSystemOffer'),
    source.indexOf('\nlet activePopup')).replace('export ', '') + '\nreturn createNewChatSystemOffer;')();

function fixture() {
    const settings = { enabled: true, activeSystem: 'A', useActiveSystemForNewChats: false,
        statusTracker: { presets: { A: {}, B: {} } } };
    let context = { chat: [{ mes: 'Welcome' }], chatMetadata: {}, getCurrentChatId: () => 'chat' };
    const calls = [];
    let answer = { selection: { key: 'A' }, reuse: false };
    const offer = createOffer({
        getSettings: () => settings, getContext: () => context,
        saveSettings: () => calls.push('save'),
        choose: async () => { calls.push('choose'); return typeof answer === 'function' ? answer() : answer; },
        importStarter: id => { calls.push(['import', id]); settings.statusTracker.presets.Copy = {}; return 'Copy'; },
        activate: key => { calls.push(['activate', key]); settings.activeSystem = key; return true; },
        refresh: () => calls.push('refresh'),
    });
    return { settings, calls, offer, get context() { return context; },
        set context(value) { context = value; }, set answer(value) { answer = value; } };
}

test('new chat keeps current choice and is offered only once', async () => {
    const f = fixture();
    await f.offer(); await f.offer();
    assert.deepEqual(f.calls, ['choose', 'save', 'refresh']);
});

test('skipping the picker follows the active System after switching Systems', async () => {
    const f = fixture();
    f.answer = { selection: { key: 'B' }, reuse: true };
    await f.offer();
    assert.equal(f.settings.useActiveSystemForNewChats, true);
    assert.deepEqual(f.calls, ['choose', ['activate', 'B'], 'save', 'refresh']);
    f.context = { ...f.context, chatMetadata: {} };
    f.settings.activeSystem = 'A';
    f.calls.length = 0;
    await f.offer();
    assert.deepEqual(f.calls, []);
    assert.equal(f.settings.activeSystem, 'A');
});

test('starter makes one editable copy and future chats keep the active System', async () => {
    const f = fixture();
    f.answer = { selection: { starter: true, id: 'dating' }, reuse: true };
    await f.offer();
    assert.equal(f.settings.useActiveSystemForNewChats, true);
    f.context = { ...f.context, chatMetadata: {} };
    await f.offer();
    assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'import').length, 1);
    assert.equal(f.calls.filter(call => call === 'choose').length, 1);
});

test('turning off active-System reuse offers choices again', async () => {
    const f = fixture();
    f.settings.useActiveSystemForNewChats = true;
    await f.offer();
    assert.deepEqual(f.calls, []);
    f.settings.useActiveSystemForNewChats = false;
    f.context = { ...f.context, chatMetadata: {} };
    await f.offer();
    assert.equal(f.calls[0], 'choose');
    assert.equal(f.settings.useActiveSystemForNewChats, false);
});

test('cancel keeps current rules and does not repeat the offer', async () => {
    const f = fixture(); f.answer = null;
    await f.offer(); await f.offer();
    assert.deepEqual(f.calls, ['choose']);
});

for (const boundary of ['disabled', 'started', 'no chat']) {
    test(`${boundary} never offers or changes rules`, async () => {
        const f = fixture();
        if (boundary === 'disabled') f.settings.enabled = false;
        if (boundary === 'started') f.context.chat.push({ is_user: true });
        if (boundary === 'no chat') f.context.getCurrentChatId = () => undefined;
        await f.offer();
        assert.deepEqual(f.calls, []);
    });
}

for (const change of ['chat', 'chat ID', 'first turn', 'disabled', 'System']) {
    test(`pending selection is discarded after ${change} changes`, async () => {
        const f = fixture();
        let resolve;
        f.answer = () => new Promise(done => { resolve = done; });
        const pending = f.offer();
        if (change === 'chat') f.context = { ...f.context, chatMetadata: {} };
        if (change === 'chat ID') f.context.getCurrentChatId = () => 'other';
        if (change === 'first turn') f.context.chat.push({ is_user: true });
        if (change === 'disabled') f.settings.enabled = false;
        if (change === 'System') f.settings.activeSystem = 'B';
        resolve({ selection: { starter: true, id: 'dating' }, reuse: true });
        await pending;
        assert.deepEqual(f.calls, ['choose']);
    });
}
