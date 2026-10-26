import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stripImports = source => source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
const slotSource = stripImports(await readFile(new URL('../src/prompts/prompt-slot.js', import.meta.url), 'utf8'));
const dialogueSource = stripImports(await readFile(new URL('../src/prompts/dialogue-format.js', import.meta.url), 'utf8'));
let fixtureId = 0;

async function fixture(name) {
    const declarations = `
        const calls = { saves: 0, renders: [], injections: [] };
        const setExtensionPrompt = (...args) => calls.injections.push(args);
        const saveSettingsDebounced = () => calls.saves++;
        const extension_prompt_types = { IN_CHAT: 1 };
        const extension_prompt_roles = { SYSTEM: 0 };
        const INJECTION_POSITION = { ABSOLUTE: 1 };
        const main_api = 'openai';
        const promptManager = {
            activeCharacter: { id: 7 },
            serviceSettings: {
                prompts: [{ identifier: 'sillynpc_dialogue_format', name: ${JSON.stringify(name)},
                    content: 'Dialogue format', role: 'system', injection_position: 0,
                    injection_depth: 6, injection_order: 25 }],
                prompt_order: [{ character_id: 7, order: [
                    { identifier: 'main', enabled: true },
                    { identifier: 'sillynpc_dialogue_format', enabled: false },
                    { identifier: 'tail', enabled: true } ] }],
            },
            render: value => calls.renders.push(value),
        };
        const settings = { enabled: true, dialogueFormatEnabled: true,
            dialogueFormatInPromptList: true, dialogueFormatDepth: 0 };
        const getSettings = () => settings;
        const DIALOGUE_FORMAT_PROMPT = 'Dialogue format';
        const debugLog = () => {};
        const usesDesignedNpcVoices = () => false;
        export { calls, promptManager };
    `;
    return import('data:text/javascript;base64,' + Buffer.from(
        declarations + slotSource + dialogueSource + `\n// fixture ${fixtureId++}`,
    ).toString('base64'));
}

test('rebrand renames an existing default dialogue prompt once without changing placement or toggle', async () => {
    const { applyDialogueFormatPrompt, promptManager, calls } = await fixture('SillyNPC - Dialogue Format');
    const before = structuredClone(promptManager.serviceSettings);
    applyDialogueFormatPrompt();
    const expected = structuredClone(before);
    expected.prompts[0].name = 'Castward - Dialogue Format';
    assert.deepEqual(promptManager.serviceSettings, expected);
    assert.equal(calls.saves, 1);
    assert.deepEqual(calls.renders, [false]);
    assert.deepEqual(calls.injections, [['sillynpc-dialogue-format', '', 1, 0, false]]);
    applyDialogueFormatPrompt();
    assert.deepEqual(promptManager.serviceSettings, expected);
    assert.equal(calls.saves, 1);
    assert.deepEqual(calls.renders, [false]);
});

test('existing custom prompt names and placement survive application', async () => {
    const { applyDialogueFormatPrompt, promptManager, calls } = await fixture('My custom dialogue rules');
    const before = structuredClone(promptManager.serviceSettings);
    applyDialogueFormatPrompt();
    assert.deepEqual(promptManager.serviceSettings, before);
    assert.equal(calls.saves, 0);
    assert.deepEqual(calls.renders, []);
});
