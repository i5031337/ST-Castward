/** Resolve the installed folder name, including renamed extension folders. */
const _scriptUrl = import.meta.url;
const _match = _scriptUrl.match(/extensions\/(?:third-party\/)?([^/]+)\//);
export const extensionName = _match 
    ? (_scriptUrl.includes('third-party') ? `third-party/${_match[1]}` : _match[1]) 
    : 'third-party/SillyNPC';

export const LOG_PREFIX = '[Castward]';

/** Maximum dimension for images stored inline in extension settings. */
export const IMAGE_MAX_DIMENSION = 256;

/** Maximum dimension for disk portraits and image-generation references. */
export const IMAGE_PORTRAIT_MAX_DIMENSION = 1536;
export const IMAGE_JPEG_QUALITY = 0.85;

// Last-resort avatar used when neither the character nor the user's default
// image is available. Inline SVG keeps the extension self-contained.
export const BUILT_IN_DEFAULT_AVATAR = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120" preserveAspectRatio="xMidYMid slice">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#3a3a48"/>' +
            '<stop offset="100%" stop-color="#1c1c25"/>' +
        '</linearGradient></defs>' +
        '<rect width="90" height="120" fill="url(#g)"/>' +
        '<circle cx="45" cy="45" r="20" fill="#7a7a8c" opacity="0.75"/>' +
        '<path d="M5 120 Q15 75 45 75 Q75 75 85 120 Z" fill="#7a7a8c" opacity="0.75"/>' +
    '</svg>',
);

/** Informational version; keep in sync with manifest.json. */
export const EXTENSION_VERSION = '0.10.0';

/** Built-in theme IDs; other IDs use native theme classes. @type {readonly string[]} */
export const SILLYNPC_THEMES = Object.freeze([
    'terminal',
    'cyberpunk',
    'monochrome',
    'modern-dark',
    'fantasy-hud',
    'tabletop-parchment',
    'analog-horror',
    'rosewater',
]);

/** Native SillyTavern theme classes we also toggle, used only for cleanup. */
export const NATIVE_THEME_CLASSES = Object.freeze([
    'theme-default', 'theme-compact', 'theme-glass', 'theme-bold',
]);

/**
 * Every theme class this extension may have applied — used to clear stale ones
 * before applying the current theme.
 * @returns {string[]}
 */
export function allThemeClasses() {
    return SILLYNPC_THEMES.map(t => `sillynpc-theme-${t}`).concat(NATIVE_THEME_CLASSES, 'sillynpc-theme-default');
}

/**
 * Resolves a theme id to the class that should be applied.
 * @param {string} theme
 * @returns {string}
 */
export function themeClassFor(theme) {
    // The native-looking default uses extension CSS but is listed separately in the picker.
    if (theme === 'default') return 'sillynpc-theme-default';
    return SILLYNPC_THEMES.includes(theme) ? `sillynpc-theme-${theme}` : `theme-${theme}`;
}

/** HUD layouts and their meter renderers.
 * @type {ReadonlyArray<{id: string, label: string, meters: 'bar'|'pips'|'ring', note: string}>}
 */
export const HUD_LAYOUTS = Object.freeze([
    { id: 'plate', label: 'Bracket Plate', meters: 'bar',
      note: 'A panel with the portrait held at its corners. The closest to how the HUD has always looked.' },
    { id: 'underline', label: 'Underlines', meters: 'bar',
      note: 'Each stat named, with its meter as a rule beneath it. The only layout where the names are always readable.' },
    { id: 'pips', label: 'Pip Rows', meters: 'pips',
      note: 'Notches rather than a fill, so a small change is a whole cell instead of a pixel.' },
    { id: 'splitring', label: 'Split Ring', meters: 'ring',
      note: 'One ring around the portrait, divided into a segment per stat. Compact enough for a corner.' },
]);

/** Retired layout choices map to the closest of the four supported styles. */
const LEGACY_HUD_LAYOUTS = Object.freeze({
    blades: 'plate', dock: 'plate', fan: 'underline', brackets: 'underline',
});

export function normalizeHudLayoutId(id) {
    const resolved = LEGACY_HUD_LAYOUTS[id] || id;
    return HUD_LAYOUTS.some(layout => layout.id === resolved) ? resolved : 'plate';
}

/** The chosen layout, or its supported successor. */
export function hudLayoutFor(id) {
    return HUD_LAYOUTS.find(layout => layout.id === normalizeHudLayoutId(id));
}

/** Every layout class, so switching layouts can clear the one before it. */
export function allHudLayoutClasses() {
    return HUD_LAYOUTS.map(l => `sillynpc-hud-${l.id}`);
}

/** Request/update diagnostics, enabled by settings or window.SILLYNPC_DEBUG. */
export function debugLog(...args) {
    if (globalThis.SILLYNPC_DEBUG) console.log(LOG_PREFIX, ...args);
}

/** Share the setting with the DevTools logging flag. */
export function setDebugLogging(enabled) {
    globalThis.SILLYNPC_DEBUG = !!enabled;
}

/** Portrait dimensions sent to SillyTavern Image Generation; null keeps its resolution. */
export const PORTRAIT_SHAPES = Object.freeze({
    '3:4': { label: '3:4 - matches avatar frames', pixels: { width: 576, height: 768 } },
    '1:1': { label: '1:1 - square', pixels: { width: 512, height: 512 } },
    '2:3': { label: '2:3 - tall portrait', pixels: { width: 512, height: 768 } },
    '9:16': { label: '9:16 - full length', pixels: { width: 576, height: 1024 } },
    st: { label: "Use SillyTavern's resolution", pixels: null },
});

/** Fallback shape: what the avatar frames and character cards are built around. */
export const DEFAULT_PORTRAIT_SHAPE = '3:4';
