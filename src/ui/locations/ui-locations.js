import { getContext } from '../../../../../../st-context.js';
import { eventSource } from '../../../../../../events.js';
import { getSettings, saveSettings } from '../../core/settings.js';
import { activeNpcSystem } from '../../core/npc-templates.js';
import { loadStateFromMetadata, saveStateToMetadata, hasOpenChat, undoLastChange, applyScenePrompt } from '../../tracker/status-logic.js';
import { readLocationStore, editLocation, deleteLocation, setCurrentLocation, backgroundImageUrl } from '../../locations/location-store.js';
import { syncPlaceBackground } from '../../locations/location-background.js';
import { generatePlaceBackground } from '../../locations/location-image.js';

function element(tag, text = '', className = '') {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
}
function button(text, action) {
    const node = element('button', text, 'menu_button');
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
}

/** Places belong to the chat, including when its active persona changes. */
export function renderLocationsView(view, { locationId = null } = {}) {
    view.replaceChildren();
    view.classList.add('sillynpc-locations');
    view.append(element('h3', 'Places', 'sillynpc-section-title'));
    const token = {};
    view.locationRenderToken = token;
    const settings = getSettings();
    const system = activeNpcSystem(settings);
    if (system) {
        const systemId = settings.activeSystem;
        const enabledLabel = element('label', '', 'sillynpc-location-enabled');
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = system.locations?.enabled !== false;
        enabled.addEventListener('change', () => {
            if (!view.isConnected || view.locationRenderToken !== token || getSettings().activeSystem !== systemId
                || activeNpcSystem(getSettings()) !== system) return;
            system.locations = { ...system.locations, enabled: enabled.checked };
            settings.statusTracker.locations = { ...system.locations };
            saveSettings();
            if (hasOpenChat()) {
                // Refresh the derived flag before rebuilding the cached scene prompt.
                loadStateFromMetadata();
                applyScenePrompt();
                if (enabled.checked && getSettings().enabled) syncPlaceBackground();
            }
        });
        enabledLabel.append(enabled, document.createTextNode(' Remember places with this System'));
        view.append(enabledLabel);
    }
    view.append(element('p', 'Place cards are saved per chat. Review new places beneath replies; turning this off keeps saved cards.', 'sillynpc-hint'));
    const tracker = settings.statusTracker;
    const readerHint = !tracker.enabled ? 'Enable Tracker to discover places.'
        : tracker.extractionMode === 'manual' ? 'Use Read latest reply to discover places.'
            : tracker.extractionMode === 'extract' ? 'Tracker discovers places in replies and opening greetings.'
                : 'Choose Automatic or Manual reading in Tracker to discover places.';
    view.append(element('p', readerHint, 'sillynpc-hint'));
    if (!hasOpenChat() || !getContext()?.chatMetadata) {
        view.append(element('p', 'Open a chat to view its places.', 'sillynpc-hint'));
        return;
    }
    const context = getContext();
    const metadata = context.chatMetadata;
    const chatId = context.getCurrentChatId();
    const current = () => hasOpenChat() && view.isConnected && view.locationRenderToken === token
        && getContext()?.chatMetadata === metadata && getContext()?.getCurrentChatId?.() === chatId;
    const store = readLocationStore(loadStateFromMetadata());
    const error = element('p', '', 'sillynpc-location-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const showError = message => { error.textContent = message; error.hidden = false; };
    const commit = (change, label) => {
        if (!current()) return;
        try {
            // Always start with current state so unrelated reader/player updates survive.
            const next = change(loadStateFromMetadata());
            if (!current()) return;
            saveStateToMetadata(next, { label });
            eventSource.emit('sillynpc-status-updated', next, { source: 'locations-editor' });
            renderLocationsView(view);
        } catch (err) { showError(err.message || 'Could not save this place.'); }
    };
    const currentRecord = store.records[store.currentId];
    const scene = element('div', '', 'sillynpc-location-current');
    scene.append(element('strong', currentRecord ? `Last confirmed place: ${currentRecord.name}` : 'Last confirmed place: not confirmed'));
    if (currentRecord) scene.append(button('Clear current place', () => commit(state => setCurrentLocation(state, ''), 'Cleared current place')));
    view.append(scene, error);
    const toolbar = element('div', '', 'sillynpc-location-toolbar');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'text_pole';
    search.placeholder = 'Search places';
    search.setAttribute('aria-label', 'Search places by name or alias');
    toolbar.append(search, button('New place', () => drawEditor(null)));
    view.append(toolbar);
    const layout = element('div', '', 'sillynpc-location-layout');
    const list = element('div', '', 'sillynpc-location-list');
    list.setAttribute('aria-label', 'Saved places');
    const editor = element('div', '', 'sillynpc-location-editor');
    layout.append(list, editor);
    view.append(layout);
    let selectedId = '';
    const expansion = view.locationExpansion;
    const sameChat = expansion?.metadata === metadata && expansion.chatId === chatId;
    const expandedIds = sameChat ? expansion.ids : new Set();
    if (!sameChat || expansion.currentId !== store.currentId) {
        for (let parentId = store.records[store.currentId]?.parentId; parentId;
            parentId = store.records[parentId]?.parentId) expandedIds.add(parentId);
    }
    view.locationExpansion = { metadata, chatId, currentId: store.currentId, ids: expandedIds };
    const searchCollapsedIds = new Set();
    function drawList() {
        list.replaceChildren();
        const query = search.value.trim().toLocaleLowerCase();
        const records = Object.values(store.records).sort((a, b) => a.name.localeCompare(b.name));
        const children = new Map();
        for (const record of records) {
            const siblings = children.get(record.parentId) || [];
            siblings.push(record);
            children.set(record.parentId, siblings);
        }
        const visible = record => !query
            || [record.name, ...record.aliases].some(value => value.toLocaleLowerCase().includes(query))
            || (children.get(record.id) || []).some(visible);
        if (!records.some(visible)) list.append(element('p', query ? 'No matching places.' : 'No places saved yet.', 'sillynpc-hint'));
        function drawRecord(record, container) {
            if (!visible(record)) return;
            const group = element('div', '', 'sillynpc-location-group');
            const header = element('div', '', 'sillynpc-location-row');
            const descendants = (children.get(record.id) || []).filter(visible);
            const expanded = query ? !searchCollapsedIds.has(record.id) : expandedIds.has(record.id);
            const row = button(record.name, () => {
                if (descendants.length) {
                    const ids = query ? searchCollapsedIds : expandedIds;
                    if (ids.has(record.id)) ids.delete(record.id);
                    else ids.add(record.id);
                }
                drawEditor(record);
            });
            row.classList.add('sillynpc-location-card');
            if (descendants.length) {
                row.classList.add('sillynpc-location-parent');
                row.setAttribute('aria-expanded', String(expanded));
            }
            row.classList.toggle('active', record.id === selectedId);
            if (!descendants.length) row.setAttribute('aria-pressed', String(record.id === selectedId));
            row.title = record.name;
            if (record.id === store.currentId) row.append(element('span', 'Confirmed', 'sillynpc-location-badge'));
            header.append(row);
            group.append(header);
            if (descendants.length && expanded) {
                const nested = element('div', '', 'sillynpc-location-children');
                for (const child of descendants) drawRecord(child, nested);
                group.append(nested);
            }
            container.append(group);
        }
        for (const record of children.get('') || []) drawRecord(record, list);
    }
    function drawEditor(record) {
        selectedId = record?.id || '';
        for (let parentId = record?.parentId; parentId; parentId = store.records[parentId]?.parentId) expandedIds.add(parentId);
        error.hidden = true;
        drawList();
        editor.replaceChildren();
        const form = document.createElement('form');
        form.className = 'sillynpc-location-form';
        form.append(element('h4', record ? `Edit ${record.name}` : 'New place', 'sillynpc-section-title'));
        const field = (labelText, tag, value, hint = '') => {
            const label = element('label', labelText);
            const input = document.createElement(tag);
            input.className = 'text_pole';
            input.value = value || '';
            label.append(input);
            if (hint) label.append(element('small', hint, 'sillynpc-hint'));
            form.append(label);
            return input;
        };
        const name = field('Name', 'input', record?.name);
        name.required = true;
        name.maxLength = 200;
        const aliases = field('Aliases', 'textarea', record?.aliases.join('\n'), 'One other name per line.');
        aliases.rows = 2;
        const description = field('Description', 'textarea', record?.description, 'Established details and lasting changes. Saved text is recalled when this place is current.');
        description.rows = 6;
        description.maxLength = 4000;
        const background = field('Background image', 'select', '', 'Choose an image already in this chat, or use the background currently visible.');
        const addBackground = (image, label) => {
            if (!image || !backgroundImageUrl(image) || [...(background.options || [])].some(option => option.value === image)) return;
            const choice = element('option', label);
            choice.value = image;
            background.append(choice);
        };
        const none = element('option', 'No linked image');
        none.value = '';
        background.append(none);
        const visibleBackground = metadata.custom_background || document.querySelector?.('#bg1')?.style.backgroundImage;
        addBackground(visibleBackground, 'Current chat background');
        for (const path of Array.isArray(metadata.chat_backgrounds) ? metadata.chat_backgrounds : []) {
            if (typeof path !== 'string') continue;
            const image = `url("${encodeURI(path).replaceAll('"', '%22')}")`;
            addBackground(image, path.split('/').pop());
        }
        addBackground(record?.backgroundImage, 'Previously linked image');
        background.value = record?.backgroundImage || '';
        const preview = document.createElement('img');
        preview.className = 'sillynpc-location-background-preview';
        preview.alt = 'Selected place background';
        let backgroundTouched = false;
        const updatePreview = () => {
            preview.hidden = !background.value;
            preview.src = backgroundImageUrl(background.value);
        };
        background.addEventListener('change', () => { backgroundTouched = true; updatePreview(); });
        updatePreview();
        form.append(preview);
        const parent = field('Inside', 'select', '');
        const option = (id, label) => {
            const node = element('option', label);
            node.value = id;
            parent.append(node);
        };
        option('', 'No parent place');
        const wouldCycle = candidate => {
            const seen = new Set();
            while (candidate) {
                if (candidate === record?.id || seen.has(candidate)) return true;
                seen.add(candidate);
                candidate = store.records[candidate]?.parentId;
            }
            return false;
        };
        for (const place of Object.values(store.records).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!wouldCycle(place.id)) option(place.id, place.name);
        }
        parent.value = record?.parentId || '';
        const actions = element('div', '', 'sillynpc-location-actions');
        const save = element('button', 'Save place', 'menu_button');
        save.type = 'submit';
        actions.append(save);
        if (record) {
            if (record.id !== store.currentId) actions.append(button('Set as current place', () => commit(state => setCurrentLocation(state, record.id), 'Changed current place')));
            const generate = button('Generate background', async () => {
                if (!current()) return;
                if (name.value !== record.name || aliases.value !== record.aliases.join('\n')
                    || description.value !== record.description || parent.value !== record.parentId
                    || backgroundTouched) {
                    showError('Save your place edits before generating its background.');
                    return;
                }
                generate.disabled = true;
                generate.textContent = 'Drawing background...';
                try {
                    await generatePlaceBackground(record.id);
                    if (current()) renderLocationsView(view, { locationId: record.id });
                } catch (err) {
                    if (current()) { showError(err.message || 'Could not draw this background.'); generate.disabled = false; generate.textContent = 'Generate background'; }
                }
            });
            actions.append(generate);
            actions.append(button('Delete place', () => {
                if (!current()) return;
                try {
                    const next = deleteLocation(loadStateFromMetadata(), record.id);
                    saveStateToMetadata(next, { label: `Deleted place: ${record.name}` });
                    eventSource.emit('sillynpc-status-updated', next, { source: 'locations-editor' });
                    renderLocationsView(view);
                    const notice = element('div', 'Place deleted. ', 'sillynpc-location-current');
                    // Tracker history retains this deletion until the next saved change.
                    const historyState = getContext().chatMetadata.sillynpc_status_state;
                    notice.append(button('Undo deletion', () => {
                        if (!hasOpenChat() || getContext()?.chatMetadata !== metadata
                            || getContext()?.getCurrentChatId?.() !== chatId
                            || getContext().chatMetadata.sillynpc_status_state !== historyState) return;
                        undoLastChange();
                        renderLocationsView(view);
                    }));
                    view.prepend(notice);
                } catch (err) { showError(err.message || 'Could not delete this place.'); }
            }));
        }
        form.append(actions);
        form.addEventListener('submit', event => {
            event.preventDefault();
            commit(state => editLocation(state, {
                ...(record ? { id: record.id } : {}), name: name.value, aliases: aliases.value.split('\n'),
                description: description.value,
                backgroundImage: backgroundTouched ? background.value
                    : readLocationStore(state).records[record?.id]?.backgroundImage || background.value,
                parentId: parent.value,
            }), record ? 'Edited place' : 'Added place');
        });
        editor.append(form);
    }
    search.addEventListener('input', () => { searchCollapsedIds.clear(); drawList(); });
    if (locationId && store.records[locationId]) drawEditor(store.records[locationId]);
    else {
        drawList();
        editor.append(element('p', 'Select a place to edit it.', 'sillynpc-hint'));
    }
}
