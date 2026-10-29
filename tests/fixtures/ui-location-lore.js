// Exercise the real host scanner with a private book; never save fixture data to the host.
export async function checkLocationLore(root) {
    const [{ createLocationLoreStore }, { createLocationLoreRuntime }, host, events] = await Promise.all([
        import(root + 'src/locations/location-lore-store.js'),
        import(root + 'src/locations/location-lore.js'),
        import('/scripts/world-info.js'),
        import('/scripts/events.js'),
    ]);
    const result = {};
    const check = (name, value) => {
        if (!value) throw new Error(`Place lore check failed: ${name}`);
        result[name] = true;
    };
    const hostContext = SillyTavern.getContext();
    const originalMetadata = JSON.stringify(hostContext.chatMetadata);
    const originalChat = JSON.stringify(hostContext.chat);
    const hadTimedEffects = Object.hasOwn(hostContext.chatMetadata, 'timedWorldInfo');
    const timedEffects = structuredClone(hostContext.chatMetadata.timedWorldInfo);
    const restoreTimedEffects = () => {
        // The host scanner normalizes this field even during a dry run.
        if (hadTimedEffects) hostContext.chatMetadata.timedWorldInfo = structuredClone(timedEffects);
        else delete hostContext.chatMetadata.timedWorldInfo;
    };
    const world = 'Castward unsaved place lore check';
    let book = { entries: {} }, writes = 0;
    const context = { chatMetadata: { sillynpc_system: 'fixture', sillynpc_status_state: {
        locations: { enabled: true, currentId: 'inn', records: {
            town: { name: 'CastwardPlaceTown', description: 'Ancient granite walls.' },
            inn: { name: 'CastwardPlaceInn', parentId: 'town', description: 'A blue stone hearth.' },
            ruins: { name: 'CastwardPlaceRuins', aliases: ['CastwardPlaceAlias'], description: 'A fallen marble tower.' },
            cave: { name: 'CastwardPlaceCave', description: 'A silent limestone cavern.' },
        } },
    } }, getCurrentChatId: () => 'unsaved-place-lore' };
    const settings = { enabled: true, activeSystem: 'fixture', statusTracker: { enabled: true, locations: { enabled: true } } };
    const sync = createLocationLoreStore({
        load: async name => { check('privateReadTarget', name === world); return book; },
        save: async (name, data) => { check('privateSaveTarget', name === world); book = structuredClone(data); writes++; },
        allocate: host.createWorldInfoEntry,
    });
    const update = createLocationLoreRuntime({ getContext: () => context,
        getSettings: () => settings, getTarget: async () => world, sync });
    const event = events.event_types.WORLDINFO_ENTRIES_LOADED;
    const listeners = events.eventSource.events[event];
    // Isolate scan listeners so the installed runtime cannot perform real lore writes.
    events.eventSource.events[event] = [update];
    try {
        const sorted = (await host.getSortedEntries()).filter(entry => entry.world === world);
        check('hostScanHook', sorted.length === 4 && writes === 1);
        const held = JSON.stringify(book);
        const activated = async text => [...(await host.checkWorldInfo([text], 8192, true)).allActivatedEntries]
            .filter(entry => entry.world === world);
        const ids = entries => entries.map(entry => entry.castwardPlace.id).sort();
        check('currentAndAncestorsWithoutMention', JSON.stringify(ids(await activated('A quiet day.'))) === JSON.stringify(['inn', 'town']));
        const byName = await activated('We discuss CastwardPlaceRuins.');
        check('nameActivation', JSON.stringify(ids(byName)) === JSON.stringify(['inn', 'ruins', 'town']));
        const byAlias = await activated('We discuss CastwardPlaceAlias.');
        check('aliasActivation', byAlias.some(entry => entry.castwardPlace.id === 'ruins'));
        check('unrelatedPlaceExcluded', !byAlias.some(entry => entry.castwardPlace.id === 'cave'));
        const inn = byAlias.find(entry => entry.castwardPlace.id === 'inn');
        check('treeAndFullDescription', inn.content.includes('CastwardPlaceTown → CastwardPlaceInn')
            && inn.content.includes('A blue stone hearth.'));
        check('scanOverridesNotSaved', JSON.stringify(book) === held && writes === 1
            && Object.values(book.entries).every(entry => !entry.constant && !entry.ignoreBudget));
        context.chatMetadata.sillynpc_status_state.locations.currentId = 'ruins';
        check('movementRefreshesForcedEntries', JSON.stringify(ids(await activated('We wait.'))) === JSON.stringify(['ruins']));
        settings.statusTracker.locations.enabled = false;
        check('disabledPlacesExcluded', (await activated('CastwardPlaceInn CastwardPlaceAlias.')).length === 0);
        restoreTimedEffects();
        check('hostDataUntouched', JSON.stringify(hostContext.chatMetadata) === originalMetadata
            && JSON.stringify(hostContext.chat) === originalChat);
        return result;
    } finally {
        restoreTimedEffects();
        if (listeners === undefined) delete events.eventSource.events[event];
        else events.eventSource.events[event] = listeners;
    }
}
