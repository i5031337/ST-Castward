import test from 'node:test';
import assert from 'node:assert/strict';
import { applyThemeAppearance, normalizeThemeOverrides } from '../src/core/theme-customization.js';

function rootFixture() {
    const properties = new Map();
    const attributes = new Map();
    const classes = new Set(['sillynpc-manage', 'sillynpc-theme-terminal']);
    return {
        properties, attributes, classes,
        style: { [Symbol.iterator]: () => properties.keys(),
            setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
        classList: { add: (...items) => items.forEach(item => classes.add(item)),
            remove: (...items) => items.forEach(item => classes.delete(item)) },
        setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key),
    };
}

test('import repair rejects CSS injection and malformed overrides, retaining zero and transparency', () => {
    const repaired = normalizeThemeOverrides({ terminal: {
        'bg-primary': '#10203080', rounding: 0, blur: 99, glow: -2,
        shadow: '0.5', surface: 'url(https://example.com)', 'font-family': 'bad; color:red',
        'fg-primary': '#fff;display:none', animations: 'off', unknown: 'value',
    }, unknown: { rounding: 10 }, rosewater: [] });
    assert.deepEqual(repaired, { terminal: {
        'bg-primary': '#10203080', rounding: 0, blur: 20, glow: 0, animations: 'off',
    } });
    assert.deepEqual(normalizeThemeOverrides(repaired), repaired);
});

test('switching presets and resetting remove stale inline effects without changing component classes', () => {
    const root = rootFixture();
    const themeOverrides = {
        terminal: { 'bg-primary': '#123456', density: 'compact', rounding: 0, animations: 'off', shadow: 0 },
        rosewater: { 'fg-primary': '#654321' },
    };
    applyThemeAppearance(root, { menuStyle: 'terminal', themeOverrides });
    assert.equal(root.properties.get('--sillynpc-bg-primary'), '#123456');
    assert.equal(root.properties.get('--sillynpc-radius-md'), '0px');
    assert.equal(root.properties.get('--sillynpc-space-md'), '9px');
    assert.equal(root.properties.get('--sillynpc-custom-shadow'), '0 0 0 transparent');
    applyThemeAppearance(root, { menuStyle: 'rosewater', themeOverrides });
    assert.equal(root.properties.get('--sillynpc-fg-primary'), '#654321');
    assert.equal(root.properties.has('--sillynpc-bg-primary'), false);
    assert.equal(root.properties.has('--sillynpc-custom-bg-primary'), false);
    assert.equal(root.attributes.has('data-theme-animations'), false);
    assert.equal(root.classes.has('sillynpc-theme-terminal'), false);
    assert.equal(root.classes.has('sillynpc-manage'), true);
    applyThemeAppearance(root, { menuStyle: 'rosewater', themeOverrides: {} });
    assert.equal(root.properties.size, 0);
    assert.equal(root.attributes.size, 0);
});
