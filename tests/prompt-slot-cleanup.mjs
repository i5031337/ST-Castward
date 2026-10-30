import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stripImports = source => source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
const slotSource = stripImports(await readFile(new URL('../src/prompts/prompt-slot.js', import.meta.url), 'utf8'));
const dialogueSource = stripImports(await readFile(new URL('../src/prompts/dialogue-format.js', import.meta.url), 'utf8'));
let fixtureId = 0;

async function fixture(withOldEntry) {
    const declarations = `
        const calls = { saves: 0, renders: [], injections: [] };
        const setExtensionPrompt = (...args) => calls.injections.push(args);
        const saveSettingsDebounced = () => calls.saves++;
        const extension_prompt_types = { IN_CHAT: 1 };
        const extension_prompt_roles = { SYSTEM: 0 };
        const promptManager = {
            serviceSettings: {
                prompts: [
                    { identifier: 'user_prompt', content: 'Keep me' },
                    ${withOldEntry ? "{ identifier: 'sillynpc_dialogue_format', content: 'Old format' }," : ''}
                ],
                prompt_order: [{ character_id: 7, order: [
                    { identifier: 'user_prompt', enabled: true },
                    ${withOldEntry ? "{ identifier: 'sillynpc_dialogue_format', enabled: false }," : ''}
                ] }],
            },
            render: value => calls.renders.push(value),
        };
        const settings = { enabled: true, dialogueFormatEnabled: true,
            dialogueFormatInPromptList: true, dialogueFormatDepth: 4 };
        const getSettings = () => settings;
        const DIALOGUE_FORMAT_PROMPT = 'Dialogue format';
        const debugLog = () => {};
        const usesDesignedNpcVoices = () => false;
        export { calls, promptManager, settings };
    `;
    return import('data:text/javascript;base64,' + Buffer.from(
        declarations + slotSource + dialogueSource + `\n// fixture ${fixtureId++}`,
    ).toString('base64'));
}

test('retired prompt-list entry is removed and format uses the saved depth', async () => {
    const { applyDialogueFormatPrompt, promptManager, calls } = await fixture(true);
    applyDialogueFormatPrompt();
    assert.deepEqual(promptManager.serviceSettings.prompts,
        [{ identifier: 'user_prompt', content: 'Keep me' }]);
    assert.deepEqual(promptManager.serviceSettings.prompt_order[0].order,
        [{ identifier: 'user_prompt', enabled: true }]);
    assert.deepEqual(calls.injections,
        [['sillynpc-dialogue-format', 'Dialogue format', 1, 4, false, 0]]);
    assert.equal(calls.saves, 1);
    assert.deepEqual(calls.renders, [false]);
    applyDialogueFormatPrompt();
    assert.equal(calls.saves, 1);
});

test('old list preference does not recreate a prompt-list entry', async () => {
    const { applyDialogueFormatPrompt, promptManager, calls, settings } = await fixture(false);
    applyDialogueFormatPrompt();
    assert.equal(promptManager.serviceSettings.prompts.length, 1);
    assert.equal(calls.saves, 0);
    settings.dialogueFormatEnabled = false;
    applyDialogueFormatPrompt();
    assert.deepEqual(calls.injections.at(-1),
        ['sillynpc-dialogue-format', '', 1, 4, false, 0]);
});
