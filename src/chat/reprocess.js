/** Redraw callback owned by index.js. Kept dependency-free so panels can request a redraw without importing chat rendering. */

let onReprocessMessages = () => {};

/** Redraws every message, so a decision made in a panel shows in the chat at once. */
export function triggerReprocess() {
    onReprocessMessages();
}

/** @param {() => void} callback */
export function setReprocessCallback(callback) {
    onReprocessMessages = callback;
}
