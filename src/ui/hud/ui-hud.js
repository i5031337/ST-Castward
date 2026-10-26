import { eventSource } from '../../../../../../events.js';
import { getSettings, saveSettings } from '../../core/settings.js';
import { openPlayerSheet } from '../characters/ui-player-sheet.js';
import { trapInlineDisplay, shortenStack } from '../shared/css-origin.js';
import { makeActivatable } from '../../core/utils.js';
import { ensurePortraitImage } from './ui-hud-portrait.js';
import { renderHUD } from './ui-hud-render.js';
export { portraitSizeFor, ringOverhang, ringRadius } from './ui-hud-meters.js';

let hudContainer = null;
let isDragging = false;
let suppressPortraitClick = false;
let activePointerId = null;

/** Keep at least this much of the HUD on screen so it can never be dragged out of reach. */
const HUD_VIEWPORT_MARGIN = 48;

/** Clear only corner classes; theme, portrait and meter classes share this element. */
const HUD_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** How far the pointer must travel before a press on the portrait counts as a drag. */
const DRAG_THRESHOLD = 5;

/**
 * Distinguish portrait clicks from drags.
 *
 * @param {number} dx
 * @param {number} dy
 * @returns {boolean}
 */
export function passedDragThreshold(dx, dy) {
    return Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
}

/**
 * Clamp the rendered HUD to the viewport; oversized HUDs start at zero.
 *
 * @param {number} x
 * @param {number} y
 * @param {{width: number, height: number}} box The box as seen, zoom included.
 * @param {{width: number, height: number}} viewport
 * @returns {{x: number, y: number}}
 */
export function clampHudPosition(x, y, box, viewport) {
    const maxX = Math.max(0, viewport.width - box.width);
    const maxY = Math.max(0, viewport.height - box.height);
    return {
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
    };
}

/** Clamp using the rendered box, which already includes zoom. */
function clampToViewport(x, y) {
    const rect = hudContainer?.getBoundingClientRect();
    return clampHudPosition(
        x, y,
        {
            width: rect?.width || HUD_VIEWPORT_MARGIN,
            height: rect?.height || HUD_VIEWPORT_MARGIN,
        },
        { width: window.innerWidth, height: window.innerHeight },
    );
}

/** HUD Scale, as the zoom it is applied with. */
function hudZoom() {
    const zoom = Number(getSettings().statusTracker.hudScale);
    return zoom > 0 ? zoom : 1;
}

/** Use zoom for sharp portraits. Divide position and translation coordinates by zoom. */
function applyHudZoom() {
    const zoom = hudZoom();
    hudContainer.style.transform = '';
    hudContainer.style.transformOrigin = '';
    hudContainer.style.zoom = String(zoom);
    hudContainer.style.setProperty('--sillynpc-hud-zoom', String(zoom));
}

/** Puts the HUD's top-left corner at x, y in screen pixels. See applyHudZoom. */
function placeHud(x, y) {
    const zoom = hudZoom();
    hudContainer.style.left = `${x / zoom}px`;
    hudContainer.style.top = `${y / zoom}px`;
}

/** Re-clamps a dragged HUD after the window changes size. */
function keepHudOnScreen() {
    const settings = getSettings().statusTracker;
    const pos = settings.hud?.position;
    // A corner-anchored HUD is positioned by CSS and needs no help; only a dragged one
    // can end up outside a window that has since been made smaller.
    if (!hudContainer || pos?.x === null || pos?.x === undefined || pos?.y === null || pos?.y === undefined) return;
    const { x, y } = clampToViewport(pos.x, pos.y);
    settings.hud.position.x = x;
    settings.hud.position.y = y;
    placeHud(x, y);
    saveSettings();
}

export function initHUD() {
    if (hudContainer) return;

    const settings = getSettings().statusTracker;
    const parent = document.body;

    hudContainer = document.getElementById('sillynpc-hud');
    if (!hudContainer) {
        hudContainer = document.createElement('div');
        hudContainer.id = 'sillynpc-hud';
        parent.append(hudContainer);
        window.addEventListener('resize', keepHudOnScreen);
    }
    
    hudContainer.classList.add('sillynpc-hud-container');
    hudContainer.classList.remove(...HUD_CORNERS);
    hudContainer.classList.add(settings.hudPosition);
    hudContainer.style.position = 'fixed';
    // CSS keeps the HUD above chat and below SillyTavern panels.
    applyHudZoom();

    // Restore position
    if (settings.hud?.position?.x !== null && settings.hud?.position?.y !== null) {
        const { x, y } = clampToViewport(settings.hud.position.x, settings.hud.position.y);
        placeHud(x, y);
        hudContainer.style.right = 'auto';
        hudContainer.style.bottom = 'auto';
    }
    
    hudContainer.innerHTML = '';
    
    // Drag handle / Mini-portrait
    const portrait = document.createElement('div');
    portrait.className = 'sillynpc-hud-portrait';

    /* Keep the image inside the frame so it can crop independently of external corner marks. */
    ensurePortraitImage(portrait);
    /* Record the caller when JavaScript hides the portrait inline; preserve the assigned value. */
    const trapped = portrait.querySelector('.sillynpc-hud-portrait-img');
    if (trapped) {
        trapInlineDisplay(trapped, (value, stack) => {
            if (value !== 'none') return;
            const by = shortenStack(stack);
            portrait.dataset.faceHiddenBy = by;
            /* Record immediately because the next draw replaces the frame. */
            portrait.dataset.faceWhy = `inline:none << ${by}`;
        });
    }
    portrait.addEventListener('pointerdown', startDrag);
    makeActivatable(portrait, { label: 'Open your character sheet' });
    portrait.addEventListener('click', (e) => {
        if (e.detail !== 0 && suppressPortraitClick) return;
        openPlayerSheet();
    });
    
    const statsContainer = document.createElement('div');
    statsContainer.className = 'sillynpc-hud-stats';
    
    hudContainer.append(portrait, statsContainer);
    
    updateHUD();

    eventSource.on('sillynpc-status-updated', (state) => updateHUD(state));
}

/**
 * Drops any manually dragged position so the HUD snaps back to its configured corner.
 */
export function resetHudPosition() {
    const st = getSettings().statusTracker;
    if (!st.hud) st.hud = { position: { x: null, y: null } };
    st.hud.position.x = null;
    st.hud.position.y = null;
    saveSettings();
    if (hudContainer) {
        hudContainer.style.removeProperty('left');
        hudContainer.style.removeProperty('top');
        hudContainer.style.removeProperty('right');
        hudContainer.style.removeProperty('bottom');
        hudContainer.style.removeProperty('margin');
    }
    updateHUD();
}

export function forgetPortrait() {
    const face = hudContainer?.querySelector('.sillynpc-hud-portrait-img');
    if (face) face.dataset.sillynpcSource = '';
}

export function updateHUD(updatedState = null) {
    renderHUD(hudContainer, updatedState, { isDragging, applyHudZoom, clampToViewport, placeHud });
}

function pinHudAt(rect) {
    placeHud(rect.left, rect.top);
    hudContainer.style.right = 'auto';
    hudContainer.style.bottom = 'auto';
    hudContainer.style.margin = '0';
    hudContainer.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
}

function startDrag(e) {
    if (e.button !== 0 || !e.isPrimary || activePointerId !== null) return;
    suppressPortraitClick = false;
    const startX = e.clientX;
    const startY = e.clientY;

    const rect = hudContainer?.getBoundingClientRect();
    if (!rect) return;
    // Against the visible box, which is what pinHudAt makes left/top mean.
    const dragOffset = { x: startX - rect.left, y: startY - rect.top };
    const handle = e.currentTarget;
    activePointerId = e.pointerId;
    handle.setPointerCapture(e.pointerId);

    /* Use translate while dragging to avoid layout; disable blur until release. */
    let offsetX = 0;
    let offsetY = 0;
    const zoom = hudZoom();

    const onPointerMove = (moveEvent) => {
        if (moveEvent.pointerId !== activePointerId) return;
        if (!isDragging) {
            if (!passedDragThreshold(moveEvent.clientX - startX, moveEvent.clientY - startY)) return;
            isDragging = true;
            suppressPortraitClick = true;
            // Only once it is really a drag. A press that turns out to be a click has to
            // leave the HUD anchored to its corner: pinning it on pointerdown would strand
            // it at inline coordinates that the corner setting can no longer override.
            pinHudAt(rect);
            hudContainer.classList.add('is-dragging');
        }

        offsetX = moveEvent.clientX - startX;
        offsetY = moveEvent.clientY - startY;
        // Zoom also scales translate coordinates.
        hudContainer.style.translate = `${offsetX / zoom}px ${offsetY / zoom}px`;
    };

    const finishDrag = (upEvent) => {
        if (upEvent.pointerId !== activePointerId) return;
        activePointerId = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', finishDrag);
        document.removeEventListener('pointercancel', finishDrag);
        handle.removeEventListener('lostpointercapture', finishDrag);
        if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
        if (!isDragging) return;

        const settings = getSettings().statusTracker;
        if (!settings.hud) settings.hud = { position: { x: null, y: null } };

        // Where it was let go, from the pointer - not measured, and with the translate gone.
        const released = upEvent.type === 'pointerup';
        const dropX = (released ? upEvent.clientX : startX + offsetX) - dragOffset.x;
        const dropY = (released ? upEvent.clientY : startY + offsetY) - dragOffset.y;
        hudContainer.style.translate = '';
        hudContainer.classList.remove('is-dragging');
        // The origin is top-left by now, so the visible box and left/top are the same
        // coordinates and the clamp can compare them without converting anything.
        const { x, y } = clampToViewport(dropX, dropY);
        settings.hud.position.x = x;
        settings.hud.position.y = y;
        placeHud(x, y);
        saveSettings();
        isDragging = false;
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finishDrag);
    document.addEventListener('pointercancel', finishDrag);
    handle.addEventListener('lostpointercapture', finishDrag);
}
