const root = new URL('../../', import.meta.url);
const host = new URL('../../../', root);
const result = {};
let popup;
try {
    const { chooseChatLorebook } = await import(new URL('src/ui/story/ui-chat-lorebook.js', root));
    const { Popup } = await import(new URL('popup.js', host));
    const { getContext } = await import(new URL('st-context.js', host));
    const { fixture, request } = await import(new URL('tests/helpers/npc-creation.mjs', root));
    const metadata = JSON.stringify(getContext().chatMetadata);
    const pause = () => new Promise(resolve => setTimeout(resolve, 20));
    const opened = async () => {
        for (let n = 0; n < 150; n++) {
            popup = Popup.util.popups.find(candidate => candidate.content.querySelector('.sillynpc-chat-lorebook-picker'));
            if (popup) return popup;
            await pause();
        }
        throw new Error('Lorebook chooser did not open');
    };
    for (const existing of [true, false]) {
        let chosen;
        const f = fixture({ beforeCreate: async ({ isCurrent, signal }) => {
            const name = await chooseChatLorebook({ names: ['Existing book'], proposedName: 'Castward Chat test', isCurrent, signal,
                onChoose: async value => {
                    chosen = value;
                    const name = value || 'Castward Chat test';
                    f.context.chatMetadata.world_info = name;
                    return name;
                } });
            if (!name) throw new Error('Selection cancelled');
        } });
        const first = f.service.create(request);
        const second = f.service.create(request);
        await opened();
        if (f.calls.length || f.cards.length) throw new Error('Generation started before selection');
        const select = popup.content.querySelector('select');
        select.value = existing ? 'Existing book' : '';
        select.dispatchEvent(new Event('change'));
        if (popup.okButton.textContent !== (existing ? 'Use and resume' : 'Create and resume')) throw new Error('Incorrect action label');
        popup.okButton.click();
        const receipts = await Promise.all([first, second]);
        if (f.calls.length !== 1 || f.cards.length !== 1 || receipts[0] !== receipts[1]) throw new Error('Pending call did not resume once');
        if (chosen !== (existing ? 'Existing book' : '')) throw new Error('Incorrect selection');
        result[existing ? 'selectAndResume' : 'createAndResume'] = true;
        popup = null;
    }
    let attempts = 0;
    const retry = chooseChatLorebook({ names: [], proposedName: 'Castward Chat test', isCurrent: () => true,
        onChoose: async () => { if (++attempts === 1) throw new Error('Temporary save failure'); return 'Created'; } });
    await opened();
    popup.okButton.click();
    for (let n = 0; n < 100 && !popup.content.querySelector('[role=alert]').textContent; n++) await pause();
    if (!popup.dlg.open || !popup.content.textContent.includes('Temporary save failure')) throw new Error('Save failure closed the chooser');
    popup.okButton.click();
    if (await retry !== 'Created' || attempts !== 2) throw new Error('Retry failed');
    result.retryAfterFailure = true;
    popup = null;

    const skip = chooseChatLorebook({ names: [], proposedName: 'Castward Chat test', isCurrent: () => true,
        onChoose: () => { throw new Error('Skip must not create a book'); } });
    await opened();
    popup.cancelButton.click();
    if (await skip !== '') throw new Error('Skip unexpectedly selected a book');
    result.explicitSkip = true;
    popup = null;

    const controller = new AbortController();
    const abort = chooseChatLorebook({ names: [], proposedName: 'Castward Chat test', isCurrent: () => true, signal: controller.signal,
        onChoose: () => { throw new Error('Stopped generation must not create a book'); } });
    await opened();
    controller.abort();
    if (await abort !== '') throw new Error('Stopped generation returned a book');
    result.stopClosesChooser = true;
    popup = null;
    // Run the tracker and synchronization functions with the real shared chooser,
    // replacing host persistence and model generation with local in-memory services.
    const sources = await Promise.all(['src/lore/lorebook-write-target.js', 'src/lore/lore-sync.js',
        'src/tracker/extractor/status-npc-profiles.js'].map(async path => {
        const response = await fetch(new URL(path, root));
        return (await response.text()).replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export ', '');
    }));
    const { newChatLorebookName } = await import(new URL('src/lore/lorebook-target.js', root));
    for (const skip of [false, true]) {
        const state = { player: { name: 'Player' }, characters: [{ name: 'Mira', stats: {}, collections: {} }] };
        const local = { chatMetadata: {}, getCurrentChatId: () => 'unsaved-tracker', saveMetadataDebounced() {} };
        const settings = { activeSystem: 'A', statusTracker: { autoGenerateNpcProfiles: true }, autoPortraitOnFill: false };
        const cards = [], book = { entries: {} }, names = ['Existing book'];
        let requests = 0, writes = 0;
        const deps = {
            getContext: () => local, getSettings: () => settings, saveSettings() {}, user_avatar: 'fixture-persona',
            world_names: names, METADATA_KEY: 'world_info', newChatLorebookName, chooseChatLorebook,
            loadWorldInfo: async () => book, saveWorldInfo: async () => { writes++; },
            createNewWorldInfo: () => { throw new Error('Unexpected real book creation'); },
            ensureChatLorebookForFill: async () => local.chatMetadata.world_info || '',
            document: { querySelector: () => null }, LOG_PREFIX: '[test]',
            profileFieldValue: (profile, field) => profile[field.id] || '',
            profileFieldsForCard: () => [{ id: 'appearance', label: 'Appearance' }],
            createCharacter: name => { const card = { id: 'fixture-card', name, profile: {} }; cards.push(card); return card; },
            findCharacterRecord: id => cards.find(card => card.id === id),
            findCardForName: name => cards.find(card => card.name === name),
            loadStateFromMetadata: () => state, mayJoinScene: () => true, resolveCanonicalName: name => name,
            generateLoreContent: async () => { requests++; return { content: 'Appearance: A blue coat' }; },
            parseGeneratedProfileFields: () => ({ appearance: 'A blue coat' }),
            triggerReprocess() {}, normalizeMemoryStore: () => ({ entries: [] }),
            createLoreEntry: async (card, world) => {
                card.lorebook = { world, uid: 0 }; book.entries[0] = { content: '' }; return card.lorebook;
            },
            formatLoreContent: values => 'Appearance: ' + values.appearance,
            parseLoreContent: () => ({}), mergeLoreValues: (content, values) => values,
            syncEntryIdentity: () => false,
        };
        const run = new Function(...Object.keys(deps), sources.join('\n') + '\nreturn generateNewNpcProfiles;')(...Object.values(deps));
        const pending = run(['Mira'], () => true);
        await opened();
        if (cards.length || requests || writes) throw new Error('Tracker started writing before selection');
        if (!popup.content.textContent.includes('Automatic NPC profiles')) throw new Error('Tracker purpose is missing');
        if (skip) popup.cancelButton.click();
        else {
            popup.content.querySelector('select').value = 'Existing book';
            popup.okButton.click();
        }
        const outcome = await pending;
        if (skip) {
            if (cards.length || requests || writes || outcome.generated) throw new Error('Skipped tracker write was not cancelled');
        } else if (requests !== 1 || writes !== 1 || outcome.generated !== 1
            || book.entries[0]?.content !== 'Appearance: A blue coat') throw new Error('Tracker did not resume its profile write: ' + JSON.stringify({requests,writes,outcome,entry:book.entries[0],cards}));
        result[skip ? 'trackerSkip' : 'trackerSelectAndWrite'] = true;
        popup = null;
    }
    result.hostMetadataUnchanged = JSON.stringify(getContext().chatMetadata) === metadata;
} catch (error) {
    result.error = String(error) + '\n' + (error.stack || '');
} finally {
    if (popup) await popup.completeCancelled();
    document.body.setAttribute('data-npc-lorebook-picker-result', JSON.stringify(result));
}
