import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createBuiltinSystem, builtinSystemChoices } from '../src/core/builtin-systems.js';
import { defaultSettings } from '../src/core/settings-defaults.js';

class Element {
    constructor(tag) {
        this.tag = tag;
        this.children = [];
        this.style = {};
        this.listeners = {};
    }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    addEventListener(event, callback) { this.listeners[event] = callback; }
    setAttribute(name, value) { this[name] = value; }
    querySelector() { return null; }
}

function manager(deps) {
    const source = readFileSync(new URL('../src/ui/system/ui-system-manager.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replace('export function buildSystemManager', 'function buildSystemManager');
    const names = Object.keys(deps);
    return new Function(...names, `${source}\nreturn buildSystemManager;`)(...Object.values(deps));
}

function find(root, predicate) {
    if (predicate(root)) return root;
    for (const child of root.children || []) {
        const match = find(child, predicate);
        if (match) return match;
    }
    return null;
}

test('starter picker imports and activates a fresh System before a chat starts', () => {
    const events = [];
    const build = manager({
        document: { createElement: tag => new Element(tag) },
        getSettings: () => ({ statusTracker: { presets: {} } }),
        getActiveSystem: () => '', getChatSystem: () => '', chatHasStarted: () => false,
        builtinSystemChoices, createBuiltinSystem, defaultSettings,
        importSystemPreset: text => {
            const payload = JSON.parse(text);
            events.push(['import', payload]);
            return { metadata: { name: payload.metadata.name } };
        },
        setActiveSystem: name => { events.push(['activate', name]); return true; },
        updateAllExtensionThemes: () => events.push(['theme']),
        refreshMemoryButton: () => events.push(['memory']),
        triggerReprocess: () => events.push(['reprocess']),
        buildSystemGeneration: () => {}, offerDownload: () => {},
        deleteSystemPreset: () => {}, createSystem: () => {},
        openItemLibrary: () => {}, exportWorldCharacters: () => {},
        carriesNpcStat: () => {}, normalizeSystemDefinition: () => {}, escapeHtml: value => value,
        Popup: { show: {} }, toastr: { error: message => { throw new Error(message); } },
    });
    let refreshes = 0;
    const root = build(() => refreshes++);
    const select = find(root, element => element.tag === 'select');
    const button = find(root, element => element.textContent === 'Start from template');
    assert.equal(button.disabled, false);
    select.value = 'creature';
    button.listeners.click();
    assert.equal(events[0][0], 'import');
    assert.equal(events[0][1].definition.id, 'creature-trainer');
    assert.equal(events[0][1].config.statusTracker.extractionMode,
        defaultSettings.statusTracker.extractionMode);
    assert.deepEqual(events.slice(1), [['activate', 'Creature Trainer'], ['theme'], ['memory'], ['reprocess']]);
    assert.equal(refreshes, 1);
});

test('starter activation is disabled after a chat has selected its System', () => {
    const build = manager({
        document: { createElement: tag => new Element(tag) },
        getSettings: () => ({ statusTracker: { presets: {} } }),
        getActiveSystem: () => 'Existing', getChatSystem: () => 'Existing',
        chatHasStarted: () => true, builtinSystemChoices, createBuiltinSystem, defaultSettings,
    });
    const button = find(build(() => {}), element => element.textContent === 'Start from template');
    assert.equal(button.disabled, true);
});
