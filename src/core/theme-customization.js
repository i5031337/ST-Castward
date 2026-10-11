import { SILLYNPC_THEMES, allThemeClasses, themeClassFor } from './constants-base.js';

// Only these values cross the settings/CSS boundary. Missing values retain the preset.
export const THEME_FIELDS = [
    ...[['bg-primary', 'Panel background'], ['bg-secondary', 'Secondary surface'],
        ['fg-primary', 'Text'], ['fg-secondary', 'Muted text'], ['accent', 'Accent fill'],
        ['accent-text', 'Accent text'], ['border', 'Border'], ['success', 'Success'],
        ['warning', 'Warning'], ['danger', 'Danger']]
        .map(([key, label]) => ({ key, label, group: 'Colours', type: 'color' })),
    { key: 'font-family', label: 'Font', group: 'Typography', options: {
        inherit: 'SillyTavern font', 'sans-serif': 'Sans serif', 'Georgia, serif': 'Georgia',
        'Palatino, Georgia, serif': 'Palatino', monospace: 'Monospace' } },
    { key: 'line-height', label: 'Line spacing', group: 'Typography', min: 1, max: 2, step: 0.05 },
    { key: 'rounding', label: 'Corner rounding (px)', group: 'Shape', min: 0, max: 30, step: 1 },
    { key: 'border-width', label: 'Border weight (px)', group: 'Shape', min: 0, max: 4, step: 0.5 },
    { key: 'density', label: 'Spacing', group: 'Shape', options: { compact: 'Compact', comfortable: 'Comfortable' } },
    { key: 'surface', label: 'Background treatment', group: 'Effects', options: {
        solid: 'Solid', gradient: 'Gradient', paper: 'Paper texture' } },
    { key: 'shadow', label: 'Shadow strength', group: 'Effects', min: 0, max: 1, step: 0.05 },
    { key: 'glow', label: 'Glow strength', group: 'Effects', min: 0, max: 1, step: 0.05 },
    { key: 'blur', label: 'Background blur (px)', group: 'Effects', min: 0, max: 20, step: 1 },
    { key: 'animations', label: 'Animations', group: 'Effects', options: { off: 'Off' } },
    { key: 'decorations', label: 'Decorations', group: 'Effects', options: { off: 'Off' } },
];
const colourAlphas = {"bg-secondary": [2, 6, 10, 20, 50, 80, 90], "bg-primary": [0, 1, 4, 5, 10, 12, 14, 15, 16], "accent": [8, 10, 15, 16, 18, 20, 25, 30, 40, 45, 50], "border": [5, 15, 30]};
const themeIds = ['default', ...SILLYNPC_THEMES];

export function normalizeThemeOverrides(value) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const id of themeIds) {
        const raw = Object.hasOwn(value, id) ? value[id] : null;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const fields = {};
        for (const field of THEME_FIELDS) {
            const item = raw[field.key];
            if (item === undefined || item === null || item === '') continue;
            if (field.type === 'color') {
                if (typeof item === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(item)) fields[field.key] = item;
            } else if (field.options) {
                if (typeof item === 'string' && Object.hasOwn(field.options, item)) fields[field.key] = item;
            } else if (typeof item === 'number' && Number.isFinite(item)) {
                fields[field.key] = Math.max(field.min, Math.min(field.max, item));
            }
        }
        if (Object.keys(fields).length) result[id] = fields;
    }
    return result;
}

const extraTokens = ['radius-sm', 'radius-md', 'radius-lg', 'space-xs', 'space-sm', 'space-md',
    'space-lg', 'space-xl', 'backdrop', 'custom-shadow', 'custom-glow'];

/** Apply to the actual theme root, including popup wrappers and newly created chat UI. */
export function applyThemeAppearance(root, settings) {
    if (!root) return;
    const id = themeIds.includes(settings.menuStyle) ? settings.menuStyle : 'default';
    root.classList.remove(...allThemeClasses());
    root.classList.add(themeClassFor(id));
    for (const name of [...root.style]) {
        if (name.startsWith('--sillynpc-custom-')) root.style.removeProperty(name);
    }
    for (const key of [...THEME_FIELDS.map(field => field.key), ...extraTokens]) {
        root.style.removeProperty(`--sillynpc-${key}`);
    }
    for (const key of ['rounding', 'border-width', 'surface', 'shadow', 'glow', 'blur', 'animations', 'decorations']) {
        root.removeAttribute(`data-theme-${key}`);
    }
    const overrides = normalizeThemeOverrides(settings.themeOverrides)[id] || {};
    for (const [key, value] of Object.entries(overrides)) {
        if (['rounding', 'border-width', 'surface', 'shadow', 'glow', 'blur', 'animations', 'decorations'].includes(key)) {
            root.setAttribute(`data-theme-${key}`, String(value));
        }
        if (THEME_FIELDS.find(field => field.key === key)?.type === 'color' || ['font-family', 'line-height'].includes(key)) {
            root.style.setProperty(`--sillynpc-${key}`, String(value));
            if (THEME_FIELDS.find(field => field.key === key)?.type === 'color') {
                root.style.setProperty(`--sillynpc-custom-${key}`, value);
                if (key === 'bg-primary') {
                    root.style.setProperty('--sillynpc-custom-bg-primary-light', `color-mix(in srgb, ${value}, white 8%)`);
                    root.style.setProperty('--sillynpc-custom-bg-primary-dark', `color-mix(in srgb, ${value}, black 15%)`);
                }
                for (const alpha of colourAlphas[key] || []) {
                    root.style.setProperty(`--sillynpc-custom-${key}-a${alpha}`, `color-mix(in srgb, ${value} ${alpha}%, transparent)`);
                }
            }
        }
    }
    if (overrides.rounding !== undefined) {
        for (const size of ['sm', 'md', 'lg']) root.style.setProperty(`--sillynpc-radius-${size}`, `${overrides.rounding}px`);
    }
    if (overrides['border-width'] !== undefined) root.style.setProperty('--sillynpc-border-width', `${overrides['border-width']}px`);
    if (overrides.density) {
        const scale = overrides.density === 'compact' ? 0.75 : 1;
        ['xs', 'sm', 'md', 'lg', 'xl'].forEach((size, i) => root.style.setProperty(`--sillynpc-space-${size}`, `${(i + 1) * 4 * scale}px`));
    }
    if (overrides.blur !== undefined) root.style.setProperty('--sillynpc-backdrop', `blur(${overrides.blur}px)`);
    if (overrides.shadow !== undefined) root.style.setProperty('--sillynpc-custom-shadow', overrides.shadow === 0 ? '0 0 0 transparent' : `0 4px 20px rgb(0 0 0 / ${overrides.shadow})`);
    if (overrides.glow !== undefined) root.style.setProperty('--sillynpc-custom-glow', overrides.glow === 0 ? '0 0 0 transparent' : `0 0 15px color-mix(in srgb, var(--sillynpc-accent) ${overrides.glow * 100}%, transparent)`);
}
