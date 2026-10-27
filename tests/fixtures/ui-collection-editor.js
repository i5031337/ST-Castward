/** Production editor and calculator with isolated stores; never saves host settings. */
export async function collectionEditorFixture(root, { settings, state, cards = [] }) {
    const { isTrackerEditLocked, trackerEditRevision } = await import(root + 'src/tracker/tracker-edit-lock.js');
    const { calculateCollectionEdit, commitCollectionEdit } = await import(root + 'src/tracker/collection-editor-calculation.js');
    const source = await (await fetch(root + 'src/tracker/collection-editor.js')).text();
    const strip = text => text.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export function ', 'function ');
    let chatId = 'collection-fixture', persona = 'fixture-player', writes = 0, events = 0;
    let metadata = { sillynpc_status_state: state };
    let handler = () => {};
    const globals = {
        getContext: () => ({ chatMetadata: metadata, getCurrentChatId: () => chatId }),
        getSettings: () => settings, getAllCharacters: () => cards,
        activeNpcSystem: () => null, getCurrentPersonaKey: () => persona,
        loadStateFromMetadata: () => state,
        saveStateToMetadata(next, options) {
            if (!options.isCurrent()) return false;
            options.beforeCommit();
            // Keep fixture render references stable while installing the calculated values.
            if (state.player && next.player) Object.assign(state.player, next.player);
            for (const actor of state.characters || []) {
                const updated = next.characters?.find(entry => entry.name === actor.name);
                if (updated) Object.assign(actor, updated);
            }
            state.recently_deleted = next.recently_deleted;
            metadata.sillynpc_status_state = state;
            writes++;
            return true;
        },
        saveSettings: () => writes++, eventSource: { emit(type, ...args) { events++; handler(...args); } },
        calculateCollectionEdit, commitCollectionEdit, isTrackerEditLocked, trackerEditRevision,
    };
    const createCollectionEditor = new Function(...Object.keys(globals), strip(source)
        + '; return createCollectionEditor;')(...Object.values(globals));
    return { createCollectionEditor, writes: () => writes, events: () => events,
        chat: value => { chatId = value; }, persona: value => { persona = value; },
        metadata: value => { metadata = value; }, onStatus: value => { handler = value; } };
}

export async function runCollectionEditorFixture(root) {
    const { bindTrackerEditor, isTrackerEditLocked } = await import(root + 'src/tracker/tracker-edit-lock.js');
    const { renderCollectionUI } = await import(root + 'src/ui/collections/ui-collection.js');
    const source = await (await fetch(root + 'src/ui/collections/ui-collection.js')).text();
    const strip = text => text.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export function ', 'function ');
    const settings = { activeSystem: 'fixture', statusTracker: { collections: [{ id: 'items', fields: [
        { name: 'name', type: 'text', isPrimary: true }, { name: 'quantity', type: 'number' },
    ] }] } };
    const actor = { name: 'Fixture', isPlayer: true, collections: { items: [{ name: 'Sword', quantity: 1 }] } };
    const state = { player: actor, characters: [], recently_deleted: {} };
    const fixture = await collectionEditorFixture(root, { settings, state });
    const { constrainNumericStat } = await import(root + 'src/tracker/numeric-stat-bounds.js');
    let confirm;
    const globals = { constrainNumericStat, bindTrackerEditor, isTrackerEditLocked, getSettings: () => settings,
        loadStateFromMetadata: () => state, createCollectionEditor: fixture.createCollectionEditor,
        Popup: { show: { confirm: () => new Promise(resolve => { confirm = resolve; }) } } };
    const attach = new Function(...Object.keys(globals), strip(source) + '; return attachCollectionListeners;')(...Object.values(globals));
    const host = document.createElement('div'); document.body.append(host);
    const draw = () => { host.innerHTML = renderCollectionUI('items', actor, settings.statusTracker); attach(host, actor, draw); return host; };
    const result = {};
    try {
        draw();
        const field = host.querySelector('[data-field="name"]');
        field.value = 'Blade'; field.dispatchEvent(new Event('change'));
        result.acceptedEdit = actor.collections.items[0].name === 'Blade' && fixture.events() === 1;
        const before = JSON.stringify([settings, state]);
        field.value = 'Late'; field.dispatchEvent(new Event('input'));
        fixture.persona('other');
        await new Promise(resolve => setTimeout(resolve, 450));
        result.staleDebounce = JSON.stringify([settings, state]) === before;
        fixture.persona('fixture-player');
        draw(); host.querySelector('.drop-item').click();
        fixture.chat('other-chat'); confirm(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        result.staleConfirmation = JSON.stringify([settings, state]) === before;
        fixture.chat('collection-fixture');
        draw(); host.querySelector('.drop-item').click(); confirm(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        result.acceptedRemoval = actor.collections.items.length === 0 && state.recently_deleted.items.blade === 3;
        host.querySelector('.sillynpc-add-item').click();
        result.acceptedAddition = actor.collections.items[0]?.name === 'New Item';
        return result;
    } finally { host.remove(); }
}
