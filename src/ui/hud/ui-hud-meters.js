import { resolveMaxValue } from '../../tracker/status-logic.js';
import { allHudLayoutClasses } from '../../core/constants.js';
import { splitValue, applyStatFormat, portraitRendition } from '../../core/utils.js';

export function portraitSizeFor(meterCount, style) {
    const ROW = 22;   // one meter row plus its gap
    const MIN = 72;
    const MAX = 120;
    // Rings wrap the portrait rather than stacking beside it, so they add no height.
    const rows = style === 'ring' ? 0 : meterCount;
    // Keep the portrait slightly taller than the meter column.
    return Math.max(MIN, Math.min(MAX, rows * ROW + 26));
}

/**
 * Request a rendition sized to the rendered frame and device pixel ratio.
 * Show the full image while it loads; discard results if the source changed.
 *
 * @param {HTMLImageElement} face
 * @param {string} src
 */
export function showPortraitAtSize(face, src) {
    // The frame's larger side: the picture is cropped to cover it (object-fit: cover), so its
    // shorter side must reach across whichever way the frame is longer.
    const frame = face.parentElement?.getBoundingClientRect();
    const across = Math.max(frame?.width || 0, frame?.height || 0);
    const wanted = Math.ceil(across * (window.devicePixelRatio || 1));
    if (!wanted) return;

    portraitRendition(src, wanted).then(ready => {
        if (ready && ready !== face.getAttribute('src') && face.dataset.sillynpcSource === src) {
            face.src = ready;
        }
    }).catch(() => { /* the full picture is already on screen */ });
}

/** Apply layout and portrait size without clearing classes owned by other HUD settings. */
export function applyHudProportions(container, meterCount, layout) {
    container.classList.remove(...allHudLayoutClasses());
    container.classList.add(`sillynpc-hud-${layout.id}`);

    // Rings need room outside the portrait, and no reserved column beside it. Kept as its
    // own class rather than folded into the layout class because the geometry rules -
    // padding against the ring overhang - are about the meter shape, not the frame.
    container.classList.toggle('meter-ring', layout.meters === 'ring');

    const size = portraitSizeFor(meterCount, layout.meters);
    container.style.setProperty('--sillynpc-hud-portrait-size', `${size}px`);
}

/**
 * Use the stat's configured meter colour, with the theme accent as fallback.
 *
 * @param {object} statDef
 * @returns {string}
 */
function meterColour(statDef) {
    return statDef.color || 'var(--sillynpc-accent-text, var(--sillynpc-accent))';
}

/**
 * Build one meter row; values without a numeric range render as text.
 *
 * @param {object} statDef
 * @param {string} rawValue
 * @param {{ percent: number, numeric: boolean }} bar
 * @param {string} style The chosen layout's meter style, or 'underline'.
 * @returns {HTMLElement}
 */
export function buildMeterRow(statDef, rawValue, bar, style) {
    const row = document.createElement('div');
    row.className = 'sillynpc-hud-stat-row';
    row.title = `${statDef.name}: ${rawValue}`;
    // The stat's own colour, on the row, so a layout can reach it from CSS without every
    // piece inside having to be painted individually.
    row.style.setProperty('--sillynpc-hud-stat-colour', meterColour(statDef));

    const label = applyStatFormat(statDef.format, {
        value: rawValue,
        name: statDef.name,
        // The ceiling being shown, not the one this stat started with.
        max: String(splitValue(rawValue).max ?? '') || resolveMaxValue(statDef) || '',
    });

    // Written by every layout and shown by the ones that want it. Underlines is built
    // around the names being readable; the rest hide it in CSS and let the colour say
    // which stat is which.
    const name = document.createElement('div');
    name.className = 'sillynpc-hud-stat-name';
    name.textContent = statDef.name;
    row.append(name);

    if (!bar.numeric) {
        const text = document.createElement('div');
        text.className = 'sillynpc-hud-stat-text';
        text.style.color = meterColour(statDef);
        text.textContent = style === 'underline' ? rawValue : label;
        row.append(text);
        return row;
    }

    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-hud-bar-wrap';

    if (style === 'pips') {
        // Ten notches, filled from the left. Small changes are easier to see than on a
        // smooth fill, which is the point of asking for it.
        const SEGMENTS = 10;
        const lit = Math.round((bar.percent / 100) * SEGMENTS);
        wrap.classList.add('segmented');
        for (let i = 0; i < SEGMENTS; i++) {
            const cell = document.createElement('div');
            cell.className = 'sillynpc-hud-segment';
            if (i < lit) cell.style.background = meterColour(statDef);
            wrap.append(cell);
        }
    } else {
        const fill = document.createElement('div');
        fill.className = 'sillynpc-hud-bar';
        fill.style.width = `${bar.percent}%`;
        fill.style.background = meterColour(statDef);
        wrap.append(fill);
    }

    const text = document.createElement('div');
    text.className = 'sillynpc-hud-bar-text';
    // Underlines already prints the stat name above its rule. Repeating the formatted
    // "Energy: 10/10" here places a second "Energy" over that heading.
    text.textContent = style === 'underline' ? rawValue : label;
    if (style !== 'underline') wrap.append(text);

    row.append(wrap);
    if (style === 'underline') row.append(text);
    return row;
}

/** Gap between the portrait border and rings, in pixels. */
const RING_GAP = 1;

/** Portrait border width; keep in sync with `.sillynpc-hud-portrait`. */
const PORTRAIT_BORDER = 1;

/**
 * Ring overhang in pixels, including the portrait border and gaps.
 *
 * @param {number} count How many rings will be drawn.
 * @param {number} thickness Ring thickness in pixels.
 * @returns {number}
 */
export function ringOverhang(count, thickness) {
    if (count <= 0) return 0;
    return PORTRAIT_BORDER + count * (thickness + RING_GAP);
}

/**
 * Centre-line radius of ring `index`, in pixels.
 *
 * @param {number} size Portrait size in pixels.
 * @param {number} thickness Ring thickness in pixels.
 * @param {number} index
 * @returns {number}
 */
export function ringRadius(size, thickness, index) {
    return size / 2 + PORTRAIT_BORDER + RING_GAP + thickness / 2 + index * (thickness + RING_GAP);
}

/**
 * Draw one ring split into stat segments around the portrait.
 * `pathLength="100"` makes dash lengths percentages for both circles and squares.
 *
 * @param {HTMLElement} portrait
 * @param {Array<{ statDef: object, rawValue: string, bar: object }>} meters
 * @param {object} options
 * @param {boolean} options.square Whether the portrait is square.
 * @param {number} options.size Portrait size in pixels.
 * @param {number} options.thickness Ring thickness in pixels.
 */
export function paintSplitRing(portrait, meters, { square, size, thickness }) {
    portrait.querySelectorAll('.sillynpc-hud-rings').forEach(el => el.remove());
    if (!meters.length) return;

    const overhang = ringOverhang(1, thickness);
    const radius = ringRadius(size, thickness, 0);
    const box = size + overhang * 2;
    const centre = box / 2;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'sillynpc-hud-rings');
    svg.setAttribute('viewBox', `0 0 ${box} ${box}`);

    const outline = () => {
        if (!square) {
            const circle = document.createElementNS(NS, 'circle');
            circle.setAttribute('cx', String(centre));
            circle.setAttribute('cy', String(centre));
            circle.setAttribute('r', String(radius));
            return circle;
        }
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(centre - radius));
        rect.setAttribute('y', String(centre - radius));
        rect.setAttribute('width', String(radius * 2));
        rect.setAttribute('height', String(radius * 2));
        // Leave square ring corners unrounded.
        return rect;
    };

    // Round caps extend into the segment gap by one stroke width in total.
    // Convert that width to path units; square rings use butt caps.
    const perimeter = square ? 8 * radius : 2 * Math.PI * radius;
    const capUnits = (square ? 0 : thickness) / perimeter * 100;
    const slice = 100 / meters.length;
    // Never more than half the slice, or six stats would be more gap than meter.
    const gap = Math.min(slice * 0.5, Math.max(4, capUnits + 2));
    const span = slice - gap;

    meters.forEach((meter, index) => {
        const offset = -index * slice;
        const filled = Math.max(0, Math.min(100, meter.bar.percent));

        const track = outline();
        track.setAttribute('class', 'sillynpc-hud-ring-track');
        track.setAttribute('stroke-width', String(thickness));
        track.setAttribute('pathLength', '100');
        track.setAttribute('stroke-dasharray', `${span} ${100 - span}`);
        track.setAttribute('stroke-dashoffset', String(offset));

        const lit = span * filled / 100;
        const arc = outline();
        arc.setAttribute('class', 'sillynpc-hud-ring-arc');
        arc.setAttribute('stroke-width', String(thickness));
        arc.setAttribute('pathLength', '100');
        arc.setAttribute('stroke', meterColour(meter.statDef));
        arc.setAttribute('stroke-dasharray', `${lit} ${100 - lit}`);
        arc.setAttribute('stroke-dashoffset', String(offset));

        const title = document.createElementNS(NS, 'title');
        title.textContent = `${meter.statDef.name}: ${meter.rawValue}`;
        arc.append(title);

        svg.append(track, arc);
    });

    // On the container, not the portrait: custom properties inherit downward, and the
    // panel's padding rule sits above this element rather than below it.
    const container = portrait.closest('.sillynpc-hud-container');
    (container || portrait).style.setProperty('--sillynpc-hud-ring-overhang', `${overhang}px`);
    portrait.append(svg);
}

/**
 * Apply portrait shape, side and border colour.
 *
 * @param {HTMLElement} container
 * @param {object} settings The tracker settings.
 */
export function applyHudAppearance(container, settings) {
    container.classList.toggle('portrait-square', settings.hudPortraitShape === 'square');

    const width = Number(settings.hudMeterWidth) || 92;
    const height = Number(settings.hudMeterHeight) || 14;
    container.style.setProperty('--sillynpc-hud-meter-width', `${width}px`);
    container.style.setProperty('--sillynpc-hud-meter-height', `${height}px`);

    const side = settings.hudPortraitSide || 'auto';
    container.classList.toggle('portrait-left', side === 'left');
    container.classList.toggle('portrait-right', side === 'right');

    // An empty setting has to clear the property, not write an empty value: the CSS falls
    // back to the theme accent only when the variable is absent.
    if (settings.hudPortraitBorder) {
        container.style.setProperty('--sillynpc-hud-portrait-border', settings.hudPortraitBorder);
    } else {
        container.style.removeProperty('--sillynpc-hud-portrait-border');
    }
}
