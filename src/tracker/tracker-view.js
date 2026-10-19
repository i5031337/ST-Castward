/**
 * Session-only tracker visibility, independent of statusTracker.enabled.
 * This dependency-free module is shared by settings, tracker UI, and chat code.
 */

/** Full box, header only, nothing - in the order the eye cycles through them. */
export const TRACKER_VIEWS = ['full', 'globals', 'hidden'];

let current = 'full';

/**
 * @returns {'full'|'globals'|'hidden'}
 */
export function getTrackerView() {
    return current;
}

/**
 * @param {string} view Anything unrecognised falls back to the full box.
 */
export function setTrackerView(view) {
    current = TRACKER_VIEWS.includes(view) ? view : 'full';
}

/**
 * The next state in the cycle.
 *
 * Unrecognized states cycle to 'full'.
 *
 * @param {string} view
 * @returns {'full'|'globals'|'hidden'}
 */
export function nextTrackerView(view) {
    const at = TRACKER_VIEWS.indexOf(view);
    return TRACKER_VIEWS[(at + 1) % TRACKER_VIEWS.length];
}
