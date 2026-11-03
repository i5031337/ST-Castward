import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stripImports = source => source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
const planner = (await readFile(new URL('../src/prompts/history-window.js', import.meta.url), 'utf8'))
    .replace(/^export /gm, '');
const entry = stripImports(await readFile(new URL('../src/entry/entry-history-notes.js', import.meta.url), 'utf8'));

test('narrator window trims only the prompt copy and saves the boundary once per batch', async () => {
    const fixture = `
        const settings = { enabled: true, narratorHistoryLimitEnabled: true,
            narratorHistoryMinTokens: 400, narratorHistoryMaxTokens: 600,
            statusTracker: { enabled: false } };
        const saves = [];
        const source = Array.from({ length: 9 }, (_, index) => ({
            index, is_user: index % 2 === 1, mes: 'x'.repeat(100),
        }));
        const context = { chat: source, chatMetadata: {}, chatId: 'chat-a',
            getCurrentChatId: () => context.chatId,
            saveMetadataDebounced: () => saves.push(1) };
        const getContext = () => context;
        const getSettings = () => settings;
        const getTokenCountAsync = text => text.length;
        const noteHistory = () => 0, noteFieldNames = () => [], stripWorldNote = () => null;
        const promptText = () => '', debugLog = () => {}, LOG_PREFIX = '';
        ${planner}
        ${entry}
        export { context, settings, saves, source };
        export const intercept = globalThis.sillyNpcHistoryNotes;
    `;
    const module = await import('data:text/javascript;base64,' + Buffer.from(fixture).toString('base64'));
    const { context, settings, saves, source, intercept } = module;
    const original = structuredClone(source);
    const firstPrompt = structuredClone(source);
    await intercept(firstPrompt, 1000);
    assert.equal(firstPrompt[0].index, 5);
    assert.deepEqual(source, original);
    assert.deepEqual(context.chatMetadata.sillynpc_narrator_history_window,
        { first: 5, min: 400, max: 600 });
    assert.equal(saves.length, 1);

    source.push({ index: 9, is_user: true, mes: 'x'.repeat(50) },
        { index: 10, is_user: false, mes: 'x'.repeat(50) });
    const secondPrompt = structuredClone(source);
    // A smaller host budget must not change the user-selected limits or cutoff.
    await intercept(secondPrompt, 500);
    assert.equal(secondPrompt[0].index, 5);
    assert.equal(saves.length, 1);

    const firstMetadata = context.chatMetadata;
    context.chatMetadata = {};
    context.chatId = 'chat-b';
    context.chat = original;
    const otherPrompt = structuredClone(original);
    await intercept(otherPrompt, 1000);
    assert.equal(otherPrompt[0].index, 5);
    assert.equal(context.chatMetadata.sillynpc_narrator_history_window.first, 5);
    assert.equal(firstMetadata.sillynpc_narrator_history_window.first, 5);
    assert.equal(saves.length, 2);

    context.chatMetadata = firstMetadata;
    context.chatId = 'chat-a';
    context.chat = source;
    const resumedPrompt = structuredClone(source);
    await intercept(resumedPrompt, 1000);
    assert.equal(resumedPrompt[0].index, 5);
    assert.equal(saves.length, 2);

    const impersonationPrompt = structuredClone(source);
    await intercept(impersonationPrompt, 1000, null, 'impersonate');
    assert.equal(impersonationPrompt[0].index, 0);
    assert.equal(saves.length, 2);

    settings.narratorHistoryLimitEnabled = false;
    const disabledPrompt = structuredClone(source);
    await intercept(disabledPrompt, 1000);
    assert.equal(disabledPrompt[0].index, 0);
    assert.equal(saves.length, 2);
});
