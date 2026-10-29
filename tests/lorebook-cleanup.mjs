import test from 'node:test';
import assert from 'node:assert/strict';
import { createLorebookCleanup, referencedLorebooks } from '../src/lore/lorebook-cleanup.js';

const book = id => `Castward Chat ${id}`;
function fixture() {
    const names = [book('orphan'), book('saved'), book('live'), 'My lorebook'];
    const headers = [{ chat_metadata: { world_info: book('saved') } }];
    const sources = { chatMetadata: { sillynpc_npcs: [{ lorebook: { world: book('live'), uid: 0 } }] } };
    const deleted = [];
    const cleanup = createLorebookCleanup({ getNames: () => names, getSources: () => sources,
        listHeaders: async () => headers, deleteBook: async name => { deleted.push(name); return true; } });
    return { cleanup, names, headers, sources, deleted };
}

test('cleanup keeps saved chat books, live NPC links and user books', async () => {
    const f = fixture();
    assert.deepEqual(await f.cleanup.find(), [book('orphan')]);
    assert.deepEqual(await f.cleanup.remove(f.names), { deleted: 1, failed: 0, skipped: 3 });
    assert.deepEqual(f.deleted, [book('orphan')]);
});

test('all reference holders preserve books, including rosters, places, personas and extra character books', async () => {
    const holders = [
        { defaultLorebook: book('used') },
        { characters: [{ lorebook: { world: book('used'), uid: 0 } }] },
        { systemNpcRosters: { Story: { cards: [{ lorebook: { world: book('used'), uid: 3 } }] } } },
        { personaData: { avatar: { lorebook: { world: book('used'), uid: 0 } } } },
        { sillynpc_locations: { records: [{ lorebook: book('used') }] } },
        { data: { extensions: { world: book('used') } } },
        { charLore: [{ extraBooks: [book('used')] }] },
        { personas: { avatar: { lorebook: book('used') } } },
        [book('used')],
    ];
    for (const holder of holders) {
        const f = fixture();
        f.names.push(book('used'));
        f.sources.extra = holder;
        assert.deepEqual(await f.cleanup.find(), [book('orphan')]);
    }
    const cyclic = {}; cyclic.self = cyclic;
    assert.deepEqual([...referencedLorebooks(cyclic, [book('used')])], []);
});

test('deletion rescans saved and unsaved references after the preview', async () => {
    for (const saved of [true, false]) {
        const f = fixture();
        const preview = await f.cleanup.find();
        if (saved) f.headers.push({ chat_metadata: { world_info: book('orphan') } });
        else f.sources.newLink = { lorebook: { world: book('orphan') } };
        assert.deepEqual(await f.cleanup.remove(preview), { deleted: 0, failed: 0, skipped: 1 });
        assert.deepEqual(f.deleted, []);
    }
});

test('unreadable chat metadata stops cleanup without deleting', async () => {
    const f = fixture();
    f.headers.push({ file_name: 'Unreadable' });
    await assert.rejects(f.cleanup.remove([book('orphan')]), /metadata/);
    assert.deepEqual(f.deleted, []);
    const cleanup = createLorebookCleanup({ getNames: () => f.names, getSources: () => f.sources,
        listHeaders: async () => { throw new Error('HTTP 500'); }, deleteBook: async () => assert.fail('must not delete') });
    await assert.rejects(cleanup.find(), /HTTP 500/);
});

test('cleanup reports partial failures and deletes only names shown in preview', async () => {
    const deleted = [];
    const cleanup = createLorebookCleanup({
        getNames: () => [book('one'), book('two'), book('three'), book('unshown')],
        getSources: () => [], listHeaders: async () => [],
        deleteBook: async name => {
            deleted.push(name);
            if (name === book('two')) return false;
            if (name === book('three')) throw new Error('offline');
            return true;
        },
    });
    assert.deepEqual(await cleanup.remove([book('one'), book('two'), book('three'), book('one')]),
        { deleted: 1, failed: 2, skipped: 0 });
    assert.deepEqual(deleted, [book('one'), book('two'), book('three')]);
});
