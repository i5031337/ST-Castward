import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as store from '../src/locations/location-store.js';

class Element {
    constructor(tag) {
        this.tag = tag;
        this.children = [];
        this.listeners = {};
        this.attributes = {};
        this.value = '';
        this.isConnected = true;
        this.classList = { add() {}, toggle() {} };
    }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
}
const document = { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) };
function find(node, predicate) {
    if (predicate(node)) return node;
    for (const child of node.children || []) {
        const found = find(child, predicate);
        if (found) return found;
    }
}
function load(file, bindings, result) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export function ', 'function ');
    return new Function(...Object.keys(bindings), `${source}\nreturn ${result};`)(...Object.values(bindings));
}
function fixture(open = true) {
    const context = { chatMetadata: {}, getCurrentChatId: () => 'chat-a' };
    let state = { marker: 'original' };
    let loads = 0;
    const saves = [];
    let settingSaves = 0;
    const promptedFlags = [];
    const system = { locations: { enabled: true } };
    const settings = { activeSystem: 'fantasy', statusTracker: { enabled: true, extractionMode: 'extract' } };
    const render = load('ui/locations/ui-locations.js', {
        document, getContext: () => context, hasOpenChat: () => open,
        getSettings: () => settings, activeNpcSystem: () => system,
        saveSettings: () => { settingSaves++; },
        ...store,
        loadStateFromMetadata: () => {
            loads++;
            state.locations ||= { records: {}, currentId: '' };
            state.locations.enabled = system.locations.enabled;
            return state;
        },
        applyScenePrompt: () => promptedFlags.push(state.locations.enabled),
        saveStateToMetadata: next => { state = next; saves.push(next); },
        eventSource: { emit() {} }, undoLastChange() {},
        buildLocationLore: () => ({ element: new Element('fieldset'), value: () => ({ lorebook: '', loreEntryId: null }) }),
    }, 'renderLocationsView');
    const view = new Element('div');
    render(view);
    return { view, render: () => render(view), context, saves, settings, system, promptedFlags, get state() { return state; }, get settingSaves() { return settingSaves; }, get loads() { return loads; }, setState: next => { state = next; } };
}

test('parent places collapse independently and search reveals matching children', () => {
    const f = fixture();
    f.setState({ locations: { records: {
        city: { id: 'city', name: 'City', aliases: [] },
        inn: { id: 'inn', name: 'Inn', aliases: [], parentId: 'city' },
        room: { id: 'room', name: 'Room', aliases: [], parentId: 'inn' },
        forest: { id: 'forest', name: 'Forest', aliases: [] },
        clearing: { id: 'clearing', name: 'Clearing', aliases: [], parentId: 'forest' },
    }, currentId: '' } });
    f.render();
    const cards = () => [...find(f.view, el => el.className === 'sillynpc-location-list').children]
        .flatMap(function walk(node) { return [node, ...(node.children || []).flatMap(walk)]; })
        .filter(node => node.className === 'menu_button' && node.textContent);
    assert.ok(cards().some(node => node.textContent === 'City'));
    assert.ok(!cards().some(node => node.textContent === 'Inn'));
    find(f.view, el => el.textContent === 'City' && el.attributes?.['aria-expanded'] === 'false').listeners.click();
    assert.ok(find(f.view, el => el.textContent === 'Edit City' && el.tag === 'h4'));
    assert.ok(!cards().some(node => node.textContent === 'Edit'));
    assert.ok(cards().some(node => node.textContent === 'Inn'));
    assert.ok(!cards().some(node => node.textContent === 'Room'));
    assert.ok(!cards().some(node => node.textContent === 'Clearing'));
    f.render();
    assert.ok(cards().some(node => node.textContent === 'Inn'), 'expanded groups survive a same-chat refresh');
    find(f.view, el => el.textContent === 'City' && el.attributes?.['aria-expanded'] === 'true').listeners.click();
    assert.ok(!cards().some(node => node.textContent === 'Inn'));
    const search = find(f.view, el => el.type === 'search');
    search.value = 'Room'; search.listeners.input();
    assert.ok(cards().some(node => node.textContent === 'Room'));
    assert.ok(!cards().some(node => node.textContent === 'Clearing'));
    find(f.view, el => el.textContent === 'City' && el.attributes?.['aria-expanded'] === 'true').listeners.click();
    assert.ok(find(f.view, el => el.textContent === 'Edit City' && el.tag === 'h4'));
});

test('current place opens its ancestor groups without reopening a manually collapsed group', () => {
    const f = fixture();
    const records = {
        city: { id: 'city', name: 'City', parentId: '' },
        inn: { id: 'inn', name: 'Inn', parentId: 'city' },
        room: { id: 'room', name: 'Room', parentId: 'inn' },
        forest: { id: 'forest', name: 'Forest', parentId: '' },
        clearing: { id: 'clearing', name: 'Clearing', parentId: 'forest' },
    };
    f.setState({ locations: { records, currentId: 'room' } });
    f.render();
    const expanded = name => find(f.view, el => el.textContent === name && el.attributes?.['aria-expanded'] !== undefined)
        ?.attributes['aria-expanded'];
    assert.equal(expanded('City'), 'true');
    assert.equal(expanded('Inn'), 'true');
    assert.equal(expanded('Forest'), 'false');
    find(f.view, el => el.textContent === 'City' && el.attributes?.['aria-expanded'] === 'true').listeners.click();
    f.render();
    assert.equal(expanded('City'), 'false', 'same-chat refresh respects the manual collapse');
    f.setState({ locations: { records, currentId: 'clearing' } });
    f.render();
    assert.equal(expanded('Forest'), 'true', 'new current place opens its parent');
    assert.equal(expanded('City'), 'false');
});

test('Places never loads the previous chat state with no chat open', () => {
    const f = fixture(false);
    assert.equal(f.loads, 0);
    assert.ok(find(f.view, el => /Open a chat/.test(el.textContent || '')));
});

for (const boundary of ['metadata', 'chat ID', 're-render']) {
    test(`place draft cannot save after ${boundary} changes`, () => {
        const f = fixture();
        find(f.view, el => el.textContent === 'New place').listeners.click();
        const form = find(f.view, el => el.tag === 'form');
        find(form, el => el.required).value = 'Old place';
        if (boundary === 'metadata') f.context.chatMetadata = {};
        if (boundary === 'chat ID') f.context.getCurrentChatId = () => 'chat-b';
        if (boundary === 're-render') f.view.locationRenderToken = {};
        form.listeners.submit({ preventDefault() {} });
        assert.equal(f.saves.length, 0);
    });
}

test('place draft uses fresh state and survives a persona change within its chat', () => {
    const f = fixture();
    find(f.view, el => el.textContent === 'New place').listeners.click();
    const form = find(f.view, el => el.tag === 'form');
    find(form, el => el.required).value = '<The Lantern>';
    f.context.personaId = 'different-persona';
    f.setState({ marker: 'updated by reader' });
    form.listeners.submit({ preventDefault() {} });
    assert.equal(f.saves.length, 1);
    assert.equal(f.saves[0].marker, 'updated by reader');
    assert.equal(Object.values(f.saves[0].locations.records)[0].name, '<The Lantern>');
});

test('lore selection is retained while loading and async copy cannot enter a stale draft', async () => {
    let resolveEntries;
    let resolveRead;
    let current = true;
    const build = load('ui/locations/ui-location-lore.js', {
        document, queueMicrotask,
        listLocationLorebooks: () => ['World'],
        listLocationLoreEntries: () => new Promise(resolve => { resolveEntries = resolve; }),
        readLocationLoreEntry: () => new Promise(resolve => { resolveRead = resolve; }),
    }, 'buildLocationLore');
    const description = new Element('textarea');
    description.value = 'Chat-owned description';
    const lore = build({ lorebook: 'World', loreEntryId: 0 }, description, () => current, assert.fail);
    await Promise.resolve();
    assert.equal(lore.value().loreEntryId, 0);
    resolveEntries([{ uid: 0, name: 'Tavern', content: 'Lore description' }]);
    await Promise.resolve();
    const copy = find(lore.element, el => el.tag === 'button');
    const pending = copy.listeners.click();
    current = false;
    resolveRead({ uid: 0, content: 'Lore description' });
    await pending;
    assert.equal(description.value, 'Chat-owned description');
});

test('management refresh preserves blurred place drafts and redraws the list without an editor', () => {
    const source = readFileSync(new URL('../src/ui/manage/ui-manage.js', import.meta.url), 'utf8');
    const refreshSource = source.slice(source.indexOf('for (const type of [event_types.CHAT_CHANGED'),
        source.indexOf('export async function openManagePopup')).replace('export function ', 'function ');
    let editorOpen = true;
    let renders = 0;
    const handlers = {};
    const manageState = { activeTab: 'places', manageRoot: {
        contains: () => true,
        querySelector: () => editorOpen ? {} : null,
    } };
    const refresh = new Function('manageState', 'eventSource', 'event_types', 'setTimeout', 'document', 'renderManageView',
        `${refreshSource}\nreturn refreshManageOnStatusUpdate;`)(
        manageState, { on: (type, callback) => { handlers[type] = callback; } },
        { CHAT_CHANGED: 'chat', PERSONA_CHANGED: 'persona' }, callback => callback(),
        { activeElement: { matches: () => false } }, () => { renders++; });
    refresh({}, { source: 'background-reader' });
    assert.equal(renders, 0, 'blurred place drafts survive background updates');
    handlers.persona();
    assert.equal(renders, 0, 'persona changes preserve chat-owned drafts');
    handlers.chat();
    assert.equal(renders, 1, 'chat changes discard the old chat draft');
    editorOpen = false;
    refresh({}, { source: 'background-reader' });
    assert.equal(renders, 2, 'the ordinary place list reflects background updates');
    manageState.activeTab = 'player';
    handlers.persona();
    assert.equal(renders, 3, 'player views continue to follow persona changes');
});

for (const open of [true, false]) {
    test(`Remember places saves to System without changing chat records (chat open: ${open})`, () => {
        const f = fixture(open);
        const checkbox = find(f.view, el => el.type === 'checkbox');
        assert.equal(checkbox.checked, true);
        checkbox.checked = false;
        checkbox.listeners.change();
        assert.deepEqual(f.system.locations, { enabled: false });
        assert.deepEqual(f.settings.statusTracker.locations, { enabled: false });
        assert.equal(f.settingSaves, 1);
        assert.equal(f.saves.length, 0);
    });
}

test('an old Places toggle cannot change a different active System or a stale view', () => {
    for (const boundary of ['system', 'view']) {
        const f = fixture();
        const checkbox = find(f.view, el => el.type === 'checkbox');
        checkbox.checked = false;
        if (boundary === 'system') f.settings.activeSystem = 'dating';
        else f.view.locationRenderToken = {};
        checkbox.listeners.change();
        assert.equal(f.system.locations.enabled, true);
        assert.equal(f.settingSaves, 0);
    }
});

test('System place toggle refreshes open-chat recall immediately and retains its records', () => {
    const f = fixture();
    f.state.locations.records.lantern = { id: 'lantern', name: 'Copper Lantern' };
    f.state.locations.currentId = 'lantern';
    const checkbox = find(f.view, el => el.type === 'checkbox');
    checkbox.checked = false;
    checkbox.listeners.change();
    assert.equal(f.state.locations.enabled, false);
    checkbox.checked = true;
    checkbox.listeners.change();
    assert.equal(f.state.locations.enabled, true);
    assert.deepEqual(f.promptedFlags, [false, true]);
    assert.equal(f.state.locations.records.lantern.name, 'Copper Lantern');
    assert.equal(f.state.locations.currentId, 'lantern');
    assert.equal(f.saves.length, 0);
});

test('System place toggle never loads chat state or injects recall without an open chat', () => {
    const f = fixture(false);
    const checkbox = find(f.view, el => el.type === 'checkbox');
    checkbox.checked = false;
    checkbox.listeners.change();
    assert.equal(f.loads, 0);
    assert.deepEqual(f.promptedFlags, []);
});
