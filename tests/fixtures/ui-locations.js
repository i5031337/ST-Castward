// An unsaved real-DOM fixture: all editor/review writes target isolated in-memory state.
export async function checkLocations(root) {
    const result = {};
    const check = (name, value) => {
        if (!value) throw new Error(`Location UI check failed: ${name}`);
        result[name] = true;
    };
    const store = await import(root + 'src/locations/location-store.js');
    const actual = await Promise.all([
        import(root + 'src/ui/locations/ui-locations.js'),
        import(root + 'src/ui/locations/ui-location-lore.js'),
        import(root + 'src/ui/locations/ui-location-review.js'),
        import(root + 'src/ui/tracker/ui-change-review.js'),
        import(root + 'src/tracker/status-logic.js'),
        import(root + 'src/tracker/ui/status-ui-box.js'),
        import(root + 'src/core/settings.js'),
    ]);
    check('realModuleStartup', actual.every(Boolean));
    const hostMetadata = JSON.stringify(SillyTavern.getContext().chatMetadata);
    const hostChat = JSON.stringify(SillyTavern.getContext().chat);
    const factory = async (path, bindings, exported) => {
        const response = await fetch(root + path);
        if (!response.ok) throw new Error(`Cannot read ${path}`);
        const source = (await response.text())
            .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
            .replaceAll('export function ', 'function ');
        return new Function(...Object.keys(bindings), `${source}\nreturn ${exported};`)(...Object.values(bindings));
    };
    const template = document.createElement('div');
    template.innerHTML = await (await fetch(root + 'manage.html')).text();
    check('placesNavigation', !!template.querySelector('[role=tab][data-section=places]')
        && !!template.querySelector('[data-panel=places] #sillynpc-locations-view'));
    const host = document.createElement('div');
    host.className = 'sillynpc sillynpc-manage';
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '999999', overflow: 'auto',
        background: '#222', padding: '12px', width: '100%', boxSizing: 'border-box' });
    const view = document.createElement('div');
    const reviewView = document.createElement('div');
    host.append(view, reviewView);
    document.body.append(host);
    let state = {};
    const context = { chatMetadata: {}, getCurrentChatId: () => 'locations-ui-unsaved' };
    const history = [];
    let writes = 0;
    let loreReads = 0;
    const system = { locations: { enabled: false } };
    const settings = { activeSystem: 'fixture', statusTracker: { enabled: true, extractionMode: 'extract' } };
    let settingWrites = 0;
    const load = () => ({ ...state, locations: { ...store.readLocationStore(state), enabled: system.locations.enabled } });
    const save = next => {
        history.push(state); state = next; writes++;
        context.chatMetadata.sillynpc_status_state = next;
    };
    try {
        const buildLocationLore = await factory('src/ui/locations/ui-location-lore.js', {
            document, queueMicrotask,
            listLocationLorebooks: () => ['Fixture book'],
            listLocationLoreEntries: async () => [{ uid: 0, name: 'The Lantern', content: 'A hearth of blue stone.' }],
            readLocationLoreEntry: async () => { loreReads++; return { uid: 0, content: 'A hearth of blue stone.' }; },
        }, 'buildLocationLore');
        const render = await factory('src/ui/locations/ui-locations.js', {
            document, getContext: () => context, hasOpenChat: () => true, ...store,
            getSettings: () => settings, activeNpcSystem: () => system, saveSettings: () => { settingWrites++; },
            loadStateFromMetadata: load, saveStateToMetadata: save, applyScenePrompt() {},
            eventSource: { emit() {} }, buildLocationLore,
            undoLastChange: () => { state = history.pop(); context.chatMetadata.sillynpc_status_state = state; },
        }, 'renderLocationsView');
        const button = (text, base = view) => [...base.querySelectorAll('button')]
            .find(node => node.textContent.trim() === text);
        const field = label => [...view.querySelectorAll('form > label')]
            .find(node => node.firstChild.textContent === label)?.querySelector('input,textarea,select');
        const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        const tick = () => new Promise(resolve => setTimeout(resolve, 0));
        const submit = () => fire(view.querySelector('form'), 'submit');
        render(view);
        const enabled = view.querySelector('input[type=checkbox]');
        enabled.checked = true; fire(enabled, 'change');
        check('systemOptIn', system.locations.enabled && settings.statusTracker.locations.enabled && settingWrites === 1 && writes === 0);
        button('New place').click();
        field('Name').value = '<The Lantern>';
        field('Aliases').value = 'Lantern\nBlue Hearth';
        field('Description').value = 'An old tavern.';
        const selects = view.querySelectorAll('fieldset select');
        selects[0].value = 'Fixture book'; fire(selects[0], 'change'); await tick();
        selects[1].value = '0'; fire(selects[1], 'change');
        button('Copy lore description').click(); await tick();
        check('loreCopyIsDraft', !Object.keys(load().locations.records).length
            && field('Description').value === 'A hearth of blue stone.' && loreReads === 1);
        submit();
        const id = Object.keys(state.locations.records)[0];
        check('createAndLinkUidZero', state.locations.records[id].loreEntryId === 0
            && state.locations.records[id].lorebook === 'Fixture book');
        check('nameEscaped', !view.querySelector('the') && view.textContent.includes('<The Lantern>'));
        const card = () => view.querySelector('.sillynpc-location-card');
        card().click();
        field('Name').value = 'The Copper Lantern';
        field('Description').value = 'A blue hearth and copper lamps.';
        submit();
        check('editAndRename', state.locations.records[id].name === 'The Copper Lantern'
            && state.locations.records[id].description.includes('copper lamps'));
        const search = view.querySelector('[type=search]');
        search.value = 'Blue Hearth'; fire(search, 'input');
        check('aliasSearch', view.querySelectorAll('.sillynpc-location-card').length === 1);
        search.value = 'absent place'; fire(search, 'input');
        check('emptySearch', view.querySelectorAll('.sillynpc-location-card').length === 0);
        search.value = ''; fire(search, 'input'); card().click();
        button('Set as current place').click();
        check('setCurrent', state.locations.currentId === id && view.textContent.includes('Last confirmed place: The Copper Lantern'));
        button('Clear current place').click();
        check('clearCurrent', state.locations.currentId === '');
        card().click(); button('Delete place').click();
        check('delete', !state.locations.records[id]);
        button('Undo deletion').click();
        check('undoDelete', !!state.locations.records[id]);
        card().click(); await tick();
        const layout = view.querySelector('.sillynpc-location-layout');
        check('narrowLayout', window.innerWidth <= 700
            && getComputedStyle(layout).gridTemplateColumns.split(' ').length === 1
            && view.scrollWidth <= view.clientWidth + 2);
        state = { locations: { currentId: '', records: {
            city: { id: 'city', name: 'A very long parent place name that must stay within the list column', aliases: [] },
            room: { id: 'room', name: 'Guest room', parentId: 'city', aliases: [] },
        } } };
        render(view);
        const parentButton = view.querySelector('.sillynpc-location-parent');
        check('themedHeading', !!view.querySelector('h3.sillynpc-section-title'));
        check('parentRowExpands', parentButton?.getAttribute('aria-expanded') === 'false'
            && !view.querySelector('.sillynpc-location-children')
            && (parentButton.click(), !!view.querySelector('.sillynpc-location-children')));
        view.querySelector('.sillynpc-location-edit').click();
        check('parentEditSeparate', view.querySelector('.sillynpc-location-form h4')?.textContent.includes('Edit A very long parent'));
        check('longNameContained', view.scrollWidth <= view.clientWidth + 2);
        state.locations.currentId = 'room';
        render(view);
        check('currentParentOpens', view.querySelector('.sillynpc-location-parent')?.getAttribute('aria-expanded') === 'true'
            && !!view.querySelector('.sillynpc-location-children .sillynpc-location-card'));
        view.querySelector('.sillynpc-location-parent').click();
        render(view);
        check('currentParentCanStayCollapsed', view.querySelector('.sillynpc-location-parent')?.getAttribute('aria-expanded') === 'false');
        const liveTracker = actual[6].getSettings().statusTracker;
        const wasShowingWorld = liveTracker.showGlobalStats;
        try {
            liveTracker.showGlobalStats = true;
            const trackerState = { global: {}, characters: [], locations: { enabled: true, currentId: 'room',
                records: { city: { id: 'city', name: 'A very long parent place name', parentId: '' },
                    room: { id: 'room', name: 'Guest room', parentId: 'city' } } } };
            const trackerBox = actual[5].buildTrackerBox(trackerState, { view: 'globals' });
            host.append(trackerBox);
            const place = trackerBox.querySelector('.sillynpc-status-place');
            check('trackerPlaceTrail', place?.textContent.includes('A very long parent place name')
                && place?.textContent.includes('Guest room')
                && place?.querySelector('.sillynpc-status-place-current')?.textContent === 'Guest room'
                && trackerBox.scrollWidth <= trackerBox.clientWidth + 2);
            liveTracker.showGlobalStats = false;
            check('trackerWorldToggle', !actual[5].buildTrackerBox(trackerState, { view: 'globals' })
                ?.querySelector('.sillynpc-status-place'));
            trackerBox.remove();
        } finally { liveTracker.showGlobalStats = wasShowingWorld; }
        const buildLocationReviewRow = await factory('src/ui/locations/ui-location-review.js', {
            document, loadStateFromMetadata: load,
        }, 'buildLocationReviewRow');
        const renderReview = await factory('src/ui/tracker/ui-change-review.js', {
            document, getSettings: () => ({ enabled: true }), applyThemeAppearance() {},
            acceptedByDefault: () => true, buildLocationReviewRow,
        }, 'renderReviewPanel');
        let pending = [{ kind: 'location-add', scope: 'location', actor: 'Moonlit Wharf', label: 'New place',
            before: '', after: 'A narrow wooden wharf.',
            location: { record: { id: 'wharf', name: 'Moonlit Wharf', aliases: ['The Wharf'], parentId: '', description: 'A narrow wooden wharf.' } } }];
        let accepted = [];
        renderReview(reviewView, 42, {
            getPendingChanges: () => pending,
            resolvePendingChanges: (_id, changes) => { accepted = changes; pending = []; },
        });
        check('reviewIdentityWithoutCitation', reviewView.textContent.includes('Moonlit Wharf')
            && reviewView.textContent.includes('Also called: The Wharf')
            && !reviewView.textContent.includes('Story evidence:'));
        const description = reviewView.querySelector('textarea');
        check('reviewDescriptionVisible', description.value === 'A narrow wooden wharf.');
        description.value = 'A weathered wooden wharf.'; fire(description, 'input');
        [...reviewView.querySelectorAll('button')].find(node => node.textContent.includes('Apply selected')).click();
        check('reviewEditableAndApplied', accepted[0].after === 'A weathered wooden wharf.'
            && !reviewView.querySelector('.sillynpc-review-panel'));
        check('isolatedWrites', writes >= 5 && JSON.stringify(SillyTavern.getContext().chatMetadata) === hostMetadata
            && JSON.stringify(SillyTavern.getContext().chat) === hostChat);
        return result;
    } finally {
        host.remove();
    }
}
