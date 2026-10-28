import assert from 'node:assert/strict';
import test from 'node:test';
import { registerNewChatSystemEvents } from '../src/entry/new-chat-system-events.js';

function fixture(options = {}) {
    const { chat = [], metadata = {} } = options;
    const id = Object.hasOwn(options, 'id') ? options.id : 'new';
    const events = new Map();
    const calls = [];
    const types = { CHAT_CHANGED: 'changed', CHAT_CREATED: 'created', GROUP_CHAT_CREATED: 'group' };
    const source = {
        on(type, fn) { events.set(type, [...events.get(type) || [], fn]); },
        makeFirst(type, fn) { events.set(type, [fn, ...events.get(type) || []]); },
        async emit(type) { for (const fn of events.get(type) || []) await fn(); },
    };
    let context = { chat, chatMetadata: metadata, getCurrentChatId: () => id };
    source.on(types.CHAT_CHANGED, () => {
        calls.push('tracker');
        context.chatMetadata.sillynpc_system ||= 'Default';
    });
    registerNewChatSystemEvents({ eventSource: source, types, getContext: () => context,
        offer: async () => { calls.push('offer'); }, cancel: () => calls.push('cancel'),
        offerScope: async () => { calls.push('scope'); }, onError: err => { throw err; } });
    return { calls, emit: type => source.emit(type), set context(value) { context = value; } };
}

for (const chat of [[], [{ mes: 'Greeting' }], [{ is_system: true, mes: 'Assistant note' }]]) {
    test(`unassigned chat with ${chat.length} initial messages offers after tracker initialization`, async () => {
        const f = fixture({ chat });
        await f.emit('changed');
        await f.emit('created');
        await f.emit('changed');
        assert.deepEqual(f.calls, ['cancel', 'tracker', 'offer', 'scope', 'cancel', 'tracker']);
    });
}

for (const options of [
    { metadata: { sillynpc_system: 'Existing' } },
    { chat: [{ is_user: true }] },
    { id: undefined },
    { id: null },
]) {
    test(`chat switch skips assigned, played, or absent chats: ${JSON.stringify(options)}`, async () => {
        const f = fixture(options);
        await f.emit('changed');
        assert.deepEqual(f.calls, ['cancel', 'tracker']);
    });
}

for (const type of ['created', 'group']) {
    test(`${type} still offers when the host creation event is available`, async () => {
        const f = fixture({ metadata: { sillynpc_system: 'Default' } });
        await f.emit('changed');
        await f.emit(type);
        assert.deepEqual(f.calls, ['cancel', 'tracker', 'offer', 'scope']);
    });
}
