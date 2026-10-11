import { getSettings } from '../../core/settings.js';
import { updateHUD } from '../hud/ui-hud.js';
import { applyThemeAppearance } from '../../core/theme-customization.js';

const PORTRAIT_FRAMINGS = ['top', 'center', 'bottom'];

/**
 * Publishes the chosen portrait framing for the stylesheet to read.
 *
 * One write on the document element, rather than a rule per portrait: the HUD circle and
 * the tracker box's NPC portraits both read `--sillynpc-portrait-focus`, and anything round
 * added later gets it for free.
 *
 * An unrecognised stored value becomes `top` rather than reaching the stylesheet, where an
 * invalid position is silently dropped and the portrait quietly reverts to whatever the
 * browser defaults to.
 *
 * @returns {string} The framing actually applied.
 */
/**
 * Writes the speech-block padding to the document root.
 *
 * A root variable rather than a class, because two rules read it - the plain block and the
 * coloured-background variant - and they have to move together.
 *
 * @returns {number} The applied value, after clamping.
 */
export function applySpeechPadding() {
    const raw = Number(getSettings().speechPadY);
    // Clamped rather than trusted: a negative padding is valid CSS and pulls neighbouring
    // blocks into each other, which looks like a rendering fault rather than a setting.
    const padding = Number.isFinite(raw) ? Math.max(0, Math.min(40, Math.round(raw))) : 6;
    document.documentElement?.style?.setProperty('--sillynpc-speech-pad-y', `${padding}px`);
    return padding;
}

export function applyPortraitFraming() {
    const stored = String(getSettings().portraitFraming ?? '').trim().toLowerCase();
    const framing = PORTRAIT_FRAMINGS.includes(stored) ? stored : 'top';
    document.documentElement?.style?.setProperty('--sillynpc-portrait-focus', framing);
    return framing;
}

/**
 * Updates the extension theme classes on all open extension windows.
 */
export function updateAllExtensionThemes() {
    document.querySelectorAll('.sillynpc-manage, .sillynpc-status-tracker-container, .sillynpc-status-box, .sillynpc-reader-report, .sillynpc-review-panel')
        .forEach(root => updateExtensionTheme(root));

    // Update the HUD
    updateHUD();
}

/**
 * Updates the extension theme classes on the given root and its parent popup.
 * @param {HTMLElement} root The root element of the extension UI
 * @param {Popup} [popupInstance] Optional popup instance to target
 */
export function updateExtensionTheme(root, popupInstance = null) {
    if (!root) return;
    // The main menu passes its unstyled template wrapper; theme the visible panel.
    const container = root.classList.contains('sillynpc-manage')
        ? root : root.querySelector('.sillynpc-manage') || root;
    applyThemeAppearance(container, getSettings());

    // Text size, as a multiplier of whatever the theme sets rather than a size of its own,
    // so a theme that ships larger type stays proportionally itself. Set here because this
    // is the one function every menu and sheet goes through to be themed.
    const menuScale = Number(getSettings().menuFontScale);
    container.style.setProperty('--sillynpc-font-scale',
        String(Number.isFinite(menuScale) && menuScale > 0 ? menuScale : 1));
    
    // Target the actual SillyTavern Popup dialog element
    const dlg = popupInstance?.dlg || container.closest('.popup, #dialogue_popup');
    if (dlg) {
        applyThemeAppearance(dlg, getSettings());
        // Force theme inheritance on the popup dialog wrapper
        dlg.style.setProperty('color', 'var(--sillynpc-fg-primary)', 'important');
        dlg.style.setProperty('font-family', 'var(--sillynpc-font-family)', 'important');
    }
}

/**
 * Repositions SillyTavern's default close button inside our visual container.
 * Solves the issue where the "X" button floats far away on customized layouts.
 *
 * It **moves the node**, rather than styling it where it sits. So `visualContent` must be
 * an element the panel never replaces the children of: the Entry Library handed in its own
 * scrolling root and redrew it on every delete, keystroke and rename, which destroyed the
 * only visible way out of the popup. Give this a wrapper and redraw a child of it.
 *
 * Safe to call again - appendChild on a child already there just moves it - and calling it
 * again is how a button that has been wiped comes back, since popupInstance.closeButton
 * still references the detached node.
 */
export function repositionCloseButton(popupInstance, visualContent) {
    if (!popupInstance || !popupInstance.dlg || !visualContent) return;

    // SillyTavern's close control is '.popup-button-close', and Popup exposes it as
    // .closeButton (popup.js:256). The previous selector list - '.popup_close,
    // #dialogue_popup_close, .close_button' - matched none of them, so this function
    // silently did nothing and the X floated outside the styled panel.
    const closeBtn = popupInstance.closeButton
        || popupInstance.dlg.querySelector('.popup-button-close');
    if (!closeBtn) return;

    visualContent.style.position = 'relative';
    visualContent.appendChild(closeBtn);
    closeBtn.style.cssText = 'position: absolute; top: var(--sillynpc-space-md); '
        + 'right: var(--sillynpc-space-md); cursor: pointer; '
        + 'z-index: var(--sillynpc-z-modal); margin: 0;';
}
