import { bindStatusModule } from './helpers/status-module.mjs';
import { collectionQuantityField } from '../src/core/collection-fields.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { promptText } from '../src/prompts/prompt-texts.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ') + `\n${collectionQuantityField.toString()}\n`;

test('a turn with no activated lore drops previous references and a later activation restores them', () => {
    const card = { name: 'Mira', lorebook: { world: 'Cast', uid: 1 }, statusOverrides: { HP: 7 } };
    const lore = new Function('getAllCharacters', source('../src/lore/activated-lore.js')
        + '\nreturn { noteActivatedLore, charactersFromActivatedLore };')(() => [card]);
    const settings = { enabled: true, statusTracker: { enabled: true, extractionMode: 'extract', collections: [] } };
    const deps = { committedState: { characters: [], player: { name: 'Hero', stats: {} } },
        statsInSystem: stats => stats || {} };
    bindStatusModule(new URL('../src/tracker/status-status-summary.js', import.meta.url), deps, {
        promptText, getSettings: () => settings, charactersFromActivatedLore: lore.charactersFromActivatedLore,
    });
    const prompts = new Map();
    bindStatusModule(new URL('../src/tracker/status-scene-prompt.js', import.meta.url), deps, {
        getSettings: () => settings, noteActivatedLore: lore.noteActivatedLore,
        setExtensionPrompt: (key, value) => prompts.set(key, value), extension_prompt_types: { IN_CHAT: 1 },
        extension_prompt_roles: { SYSTEM: 0 }, debugLog: error => { throw error; },
    });
    const activated = [{ world: 'Cast', uid: 1 }];
    const scene = () => prompts.get('sillynpc-status-scene');
    lore.noteActivatedLore(activated);
    deps.applyScenePrompt();
    assert.match(scene(), /Mira.*HP=7/);
    deps.onGenerationStarted('normal', {}, false);
    assert.doesNotMatch(scene(), /Mira/);
    lore.noteActivatedLore(activated);
    deps.applyScenePrompt();
    assert.match(scene(), /Mira - HP=7/);
    deps.onGenerationStarted('normal', {}, true);
    assert.match(scene(), /Mira - HP=7/);
});
