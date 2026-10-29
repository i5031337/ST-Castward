import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function bind(path, name, dependencies, start) {
    let source = readFileSync(new URL(path, import.meta.url), 'utf8');
    if (start) source = source.slice(source.indexOf(start));
    source = source.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export ', '');
    return new Function(...Object.keys(dependencies), `${source}\nreturn ${name};`)(...Object.values(dependencies));
}

test('full Fill waits for a target before generation, then resumes or cancels without a write', async () => {
    for (const skip of [false, true]) {
        let select, requests = 0, writes = 0;
        const card = { name: 'Mira', profile: {} };
        const fill = bind('../src/characters/character-fill-lore.js', 'fillLore', {
            requireLorebook: () => new Promise((resolve, reject) => { select = () => skip
                ? reject(new DOMException('Skipped', 'AbortError')) : resolve('Chosen'); }),
            loadWorldInfo: async () => ({ entries: {} }), debugLog() {}, saveSettings() {},
            tryAutoSyncLorebook: async () => false,
            profileFieldsForCard: () => [{ id: 'appearance' }], profileFieldValue: profile => profile.appearance || '',
            parseLoreContent: () => null,
            createLoreEntry: async () => { card.lorebook = { world: 'Chosen', uid: 0 }; return card.lorebook; },
            generateLoreContent: async () => { requests++; return { content: 'Appearance: Blue coat' }; },
            saveLoreContent: async () => { writes++; },
        });
        const pending = fill(card);
        assert.equal(requests, 0);
        assert.equal(writes, 0);
        select();
        if (skip) await assert.rejects(pending, { name: 'AbortError' });
        else assert.equal((await pending).ok, true);
        assert.equal(requests, skip ? 0 : 1);
        assert.equal(writes, skip ? 0 : 1);
    }
});

test('saving into a replacement book allocates its own entry instead of reusing a stale UID', async () => {
    let select, allocated = 0, saved = 0;
    const card = { name: 'Mira', profile: {}, lorebook: { world: 'Deleted', uid: 77 } };
    const book = { entries: { 77: { content: 'Another person' } } };
    const save = bind('../src/api/api-lore-generate.js', 'saveLoreContent', {
        lorebookWriteGuard: guard => guard || (() => true),
        requireLorebook: () => new Promise(resolve => { select = () => resolve('Chosen'); }),
        createLoreEntry: async () => { allocated++; book.entries[3] = { content: '' }; return { world: 'Chosen', uid: 3 }; },
        loadWorldInfo: async world => { assert.equal(world, 'Chosen'); return book; },
        saveWorldInfo: async () => { saved++; }, saveSettings() {},
        profileFieldsForCard: () => [{ id: 'appearance' }],
        parseGeneratedProfileFields: () => ({ appearance: 'Blue coat' }),
        formatLoreContent: values => `Appearance: ${values.appearance}`,
        syncEntryIdentity() {}, mergeKeywords: () => [],
    }, 'export async function saveLoreContent');
    const pending = save(card, 'Deleted', 77, '', 'Appearance: Blue coat');
    assert.equal(allocated, 0);
    assert.equal(saved, 0);
    select();
    await pending;
    assert.equal(allocated, 1);
    assert.equal(saved, 1);
    assert.equal(book.entries[77].content, 'Another person');
    assert.equal(book.entries[3].content, 'Appearance: Blue coat');
    assert.deepEqual(card.lorebook, { world: 'Chosen', uid: 3 });
});
