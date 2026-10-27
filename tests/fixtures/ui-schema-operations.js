/** Unsaved DOM checks: production editors with isolated runtime storage and mocked saves. */
export async function runSchemaOperationFixture(root) {
    const url = path => new URL(path, root).href;
    const [{ normalizeSystemDefinition, projectSystemTracker }, { calculateSchemaOperation, installSchemaWrites },
        { buildStatsEditor }, { buildCollectionsEditor }] = await Promise.all([
        import(url('src/core/system-schema.js')), import(url('src/tracker/schema-operation-calculation.js')),
        import(url('src/ui/system/ui-system-stats.js')), import(url('src/ui/system/ui-system-collections.js')),
    ]);
    const definition = normalizeSystemDefinition({ schemaVersion: 2, name: 'Schema fixture',
        stats: { world: [], character: [{ id: 'hp', name: 'HP', type: 'number', defaultValue: '10', targets: ['player', 'npc'] }] },
        collections: [{ id: 'gear', name: 'Gear', targets: ['player', 'npc'], fields: [
            { name: 'name', type: 'text', isPrimary: true, isStatic: true }, { name: 'kind', type: 'text', isStatic: true },
        ] }],
    });
    const tracker = { ...projectSystemTracker(definition), presets: { story: { definition } }, template: '{{HP}}' };
    const settings = { activeSystem: 'story', statusTracker: tracker, personaData: {},
        master_items: { gear: { wand: { name: 'Wand', kind: 'wood' } } } };
    const cards = [{ name: 'Mira', statusOverrides: { HP: '4' }, statusCollections: { gear: [{ name: 'Wand', kind: 'wood' }] } }];
    const host = { getCurrentChatId: () => 'fixture', chatMetadata: { sillynpc_system: 'story', sillynpc_status_state: {
        global: {}, player: { name: 'Hero', personaKey: 'hero', stats: { HP: '6' }, collections: { gear: [{ name: 'Wand', kind: 'wood' }] } },
        characters: [],
    } } };
    let accepted = true;
    let saves = 0;
    const runtimeSource = (await (await fetch(url('src/tracker/schema-operation-runtime.js'))).text())
        .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
    const runtime = new Function('getContext', 'getSettings', 'saveSettings', 'getLibraryCharacters',
        'calculateSchemaOperation', 'installSchemaWrites', `${runtimeSource}\nreturn runSchemaOperation;`)(
        () => host, () => settings, () => saves++, () => cards, calculateSchemaOperation, installSchemaWrites);
    const run = operation => runtime(operation, { peekState: () => null, personaKey: () => 'hero',
        saveState: (state, options) => {
            if (!accepted || !options.isCurrent()) return false;
            options.beforeCommit();
            host.chatMetadata.sillynpc_status_state = state;
            return true;
        } });
    const context = { getSettings: () => settings, definition: () => definition, saveSettings: () => {}, updateHUD: () => {}, bulkBars: new Map(),
        renameStat: (scopes, oldName, newName, field) => run({ type: 'stat', scopes, oldName, newName, field }),
        renameCollectionField: (collectionId, oldName, newName, field) => {
            const result = run({ type: 'collection-field', collectionId, oldName, newName, field });
            return result ? result.values : null;
        },
        renameCollectionId: (oldName, newName, definition) => {
            const result = run({ type: 'collection-id', oldName, newName, definition });
            return result ? result.values : null;
        },
    };
    const results = {};
    const container = document.createElement('div');
    container.className = 'sillynpc sillynpc-manage';
    document.body.append(container);
    const toastMethods = ['success', 'warning', 'error'];
    const savedToasts = Object.fromEntries(toastMethods.map(key => [key, toastr[key]]));
    for (const key of toastMethods) toastr[key] = () => {};
    const change = (input, value) => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); };
    try {
        const stats = buildStatsEditor('characterStats', () => {}, context);
        container.append(stats);
        change(stats.querySelector('.stat-name'), 'Health');
        results.statRename = definition.stats.character[0].name === 'Health'
            && host.chatMetadata.sillynpc_status_state.player.stats.Health === '6'
            && cards[0].statusOverrides.Health === '4';
        accepted = false;
        change(stats.querySelector('.stat-name'), 'Vitality');
        results.refusedSchema = definition.stats.character[0].name === 'Health'
            && !Object.hasOwn(host.chatMetadata.sillynpc_status_state.player.stats, 'Vitality');
        accepted = true;
        const collections = buildCollectionsEditor(() => {}, context);
        container.append(collections);
        const kind = [...collections.querySelectorAll('.f-name')].find(input => input.value === 'kind');
        change(kind, 'material');
        results.collectionField = settings.master_items.gear.wand.material === 'wood'
            && cards[0].statusCollections.gear[0].material === 'wood'
            && host.chatMetadata.sillynpc_status_state.player.collections.gear[0].material === 'wood';
        change(collections.querySelector('.col-id'), 'equipment');
        results.collectionId = tracker.collections[0].id === 'equipment'
            && !!settings.master_items.equipment && !settings.master_items.gear
            && !!host.chatMetadata.sillynpc_status_state.player.collections.equipment;

        let confirm;
        const librarySource = (await (await fetch(url('src/ui/collections/ui-item-library-sections.js'))).text())
            .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ');
        const buildItemRow = new Function('Popup', 'libraryBulk', 'renameMasterItem', 'updateMasterItem', 'deleteMasterItem', 'render',
            `${librarySource}\nreturn buildItemRow;`)(
            { show: { confirm: () => new Promise(resolve => { confirm = resolve; }) } }, null,
            (collectionId, oldName, newName, itemData, expected) => run({ type: 'library-rename', collectionId, oldName, newName, itemData, expected }),
            (collectionId, itemName, itemData, expected) => run({ type: 'library-update', collectionId, itemName, itemData, expected }),
            (collectionId, itemName, expected) => run({ type: 'library-delete', collectionId, itemName, expected }), () => {});
        const rowFor = key => buildItemRow({ root: container, search: { value: '' }, master: settings.master_items,
            colDef: tracker.collections[0], fields: tracker.collections[0].fields.filter(field => field.type === 'text'), primary: 'name', key });
        const row = rowFor('wand');
        container.append(row);
        const nameInput = row.querySelector('input');
        const materialInput = [...row.querySelectorAll('input,textarea')].find(input => input !== nameInput);
        change(materialInput, 'oak');
        change(nameInput, 'Staff');
        results.libraryEditRename = settings.master_items.equipment.staff?.material === 'oak'
            && !settings.master_items.equipment.wand;
        const deleteRow = rowFor('staff');
        container.append(deleteRow);
        deleteRow.querySelector('button').click();
        settings.master_items.equipment.staff = { name: 'Staff', material: 'new' };
        confirm(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        results.staleDelete = settings.master_items.equipment.staff?.material === 'new';
        results.unsaved = saves > 0;
        return results;
    } finally {
        container.remove();
        for (const key of toastMethods) toastr[key] = savedToasts[key];
    }
}
