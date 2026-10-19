import { BUILT_IN_DEFAULT_AVATAR } from '../../core/constants.js';
import { whyHidden } from '../shared/css-origin.js';

/**
 * Ensure the portrait image exists on every draw.
 *
 * @param {HTMLElement} portrait The frame.
 * @returns {HTMLImageElement|null}
 */
export function ensurePortraitImage(portrait) {
    if (!portrait) return null;
    const existing = portrait.querySelector('.sillynpc-hud-portrait-img');
    if (existing) return existing;

    const face = document.createElement('img');
    face.className = 'sillynpc-hud-portrait-img';
    face.alt = '';
    /* On image error, try the full source, then the built-in avatar. */
    face.addEventListener('error', () => {
        const full = face.dataset.sillynpcSource;
        if (full && face.getAttribute('src') !== full) face.src = full;
        else if (face.getAttribute('src') !== BUILT_IN_DEFAULT_AVATAR) {
            face.src = BUILT_IN_DEFAULT_AVATAR;
        }
    });
    portrait.prepend(face);
    return face;
}

/**
 * Record image loading and visibility diagnostics on the portrait frame.
 *
 * @param {HTMLElement} portrait The frame.
 * @param {HTMLImageElement|null} face
 * @param {string} src What it was last asked to show.
 */
export function recordFaceState(portrait, face, src) {
    if (!portrait) return;

    let state;
    if (!face) state = 'none';
    else if (!face.hasAttribute('src')) state = 'nosrc';
    else if (face.getAttribute('src') === '') state = 'empty';
    else if (!face.complete) state = 'loading';
    else if (face.naturalWidth === 0) state = 'broken';
    else state = `ok:${face.naturalWidth}`;

    portrait.dataset.face = state;
    /* The tail only. It separates a file path from a data: URL, which is the distinction
       that matters, without putting a whole base64 image into an attribute. */
    portrait.dataset.faceTail = String(src ?? '').slice(-40);

    /* Record rendered image and frame dimensions to distinguish loading from layout failures. */
    if (face) {
        const box = face.getBoundingClientRect();
        const frame = portrait.getBoundingClientRect();
        const css = getComputedStyle(face);
        portrait.dataset.faceBox = `${Math.round(box.width)}x${Math.round(box.height)}`
            + ` ${css.display}/${css.visibility}/${css.opacity}`
            + ` frame:${Math.round(frame.width)}x${Math.round(frame.height)}`;

        // Only when it is actually hidden. See whyHidden.
        const invisible = css.display === 'none' || css.visibility === 'hidden'
            || Number(css.opacity) === 0 || box.width === 0 || box.height === 0;
        if (invisible) {
            const by = portrait.dataset.faceHiddenBy;
            portrait.dataset.faceWhy = by ? `${whyHidden(face)} << ${by}` : whyHidden(face);
        }
        else delete portrait.dataset.faceWhy;
    } else {
        portrait.dataset.faceBox = 'no element';
        delete portrait.dataset.faceWhy;
    }
}
