import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileFieldValue } from '../src/core/profile-fields.js';

const source = readFileSync(new URL('../src/characters/character-fill-lore.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export async function ', 'async function ');

test('player profile Fill discards generation after ownership changes or manual edits', async () => {
    for (const editProfile of [false, true]) {
        const card = { name: 'Hero', isPlayer: true, profile: {}, lorebook: { world: 'Chat', uid: 0 } };
        let current = true, saves = 0;
        const dependencies = {
            loadWorldInfo: async () => ({ entries: { 0: { content: '' } } }), debugLog() {}, saveSettings() {},
            profileFieldValue, profileFieldsForCard: () => [{ id: 'appearance', label: 'Appearance' }],
            parseGeneratedProfileFields: content => content ? { appearance: 'Generated hair' } : null,
            parseLoreContent: () => null,
            generateLoreContent: async () => {
                if (editProfile) card.profile.appearance = 'Manually chosen hair';
                else current = false;
                return { content: 'Appearance: Generated hair', tags: 'Hero' };
            },
            saveLoreContent: async () => { saves++; },
        };
        const fill = new Function(...Object.keys(dependencies), `${source}\nreturn fillLore;`)(...Object.values(dependencies));
        await assert.rejects(fill(card, { isCurrent: () => current }), { name: 'AbortError' });
        assert.equal(saves, 0);
        if (editProfile) assert.equal(card.profile.appearance, 'Manually chosen hair');
        else assert.deepEqual(card.profile, {});
    }
});
