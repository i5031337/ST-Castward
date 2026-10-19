let cancelDrag = null;
let nextHandleId = 0;
const handleIds = new WeakMap();
const rows = new WeakMap();

/** Move by object identity so edited labels and nested lists cannot change the destination. */
export function reorderItem(items, item, target, after = false, minIndex = 0) {
    const from = items.indexOf(item), to = items.indexOf(target);
    if (from < minIndex || to < 0 || item === target) return false;
    const destination = to + Number(after) - Number(from < to);
    if (destination < minIndex || destination === from) return false;
    items.splice(destination, 0, items.splice(from, 1)[0]);
    return true;
}

function scrollParent(row) {
    for (let parent = row.parentElement; parent; parent = parent.parentElement) {
        if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
    }
    return document.scrollingElement;
}

/** Pointer dragging keeps editable fields out of the browser's native text/file drop flow. */
function startDrag(event, row, handle, config, onChange) {
    if (event.button !== 0 || !config.canMove(config.item)) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDrag?.();
    const origin = { x: event.clientX, y: event.clientY };
    let point = origin, started = false, target = null, after = false, frame;
    const scroll = scrollParent(row);
    const clearTarget = () => {
        target?.classList.remove('sillynpc-drop-before', 'sillynpc-drop-after');
        target = null;
    };
    const paintTarget = () => {
        clearTarget();
        const hit = document.elementFromPoint(point.x, point.y)?.closest('.sillynpc-reorder-row');
        const destination = rows.get(hit);
        if (!destination || hit === row || destination.items !== config.items) return;
        const rect = hit.getBoundingClientRect();
        after = point.y >= rect.top + rect.height / 2;
        const index = config.items.indexOf(destination.item);
        if (index < config.minIndex && !(after && index === config.minIndex - 1)) return;
        target = hit;
        target.classList.add(after ? 'sillynpc-drop-after' : 'sillynpc-drop-before');
    };
    const tick = () => {
        if (!row.isConnected) { finish(); return; }
        const rect = scroll === document.scrollingElement
            ? { top: 0, bottom: window.innerHeight } : scroll.getBoundingClientRect();
        const edge = Math.min(48, (rect.bottom - rect.top) / 4);
        const speed = point.y < rect.top + edge ? -Math.min(16, (rect.top + edge - point.y) / 3)
            : point.y > rect.bottom - edge ? Math.min(16, (point.y - rect.bottom + edge) / 3) : 0;
        if (speed) scroll.scrollTop += speed;
        paintTarget();
        frame = requestAnimationFrame(tick);
    };
    const move = next => {
        if (next.pointerId !== event.pointerId) return;
        next.preventDefault();
        next.stopPropagation();
        point = { x: next.clientX, y: next.clientY };
        if (!started && Math.hypot(point.x - origin.x, point.y - origin.y) >= 5) {
            started = true;
            row.classList.add('sillynpc-reorder-dragging');
            document.body.classList.add('sillynpc-reordering');
            frame = requestAnimationFrame(tick);
        }
        if (started) paintTarget();
    };
    const finish = () => {
        cancelAnimationFrame(frame);
        clearTarget();
        row.classList.remove('sillynpc-reorder-dragging');
        document.body.classList.remove('sillynpc-reordering');
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', release, true);
        document.removeEventListener('pointercancel', cancel, true);
        document.removeEventListener('keydown', keydown, true);
        window.removeEventListener('blur', finish);
        cancelDrag = null;
    };
    const release = next => {
        if (next.pointerId !== event.pointerId) return;
        next.preventDefault();
        next.stopPropagation();
        point = { x: next.clientX, y: next.clientY };
        if (started) paintTarget();
        const changed = started && target && reorderItem(config.items, config.item, rows.get(target).item, after, config.minIndex);
        finish();
        if (changed) onChange();
        document.getElementById(handle.id)?.focus({ preventScroll: true });
    };
    const cancel = next => { if (next.pointerId === event.pointerId) finish(); };
    const keydown = next => {
        if (next.key !== 'Escape') return;
        next.preventDefault(); next.stopPropagation(); finish();
    };
    cancelDrag = finish;
    document.addEventListener('pointermove', move, { capture: true, passive: false });
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', finish);
}

/** Only handles initiate reordering. Each row belongs to one list, including nested fields. */
export function attachReorder(row, header, items, item, onChange, {
    canMove = () => true, minIndex = 0,
} = {}) {
    const config = { items, item, canMove, minIndex };
    rows.set(row, config);
    row.classList.add('sillynpc-reorder-row');
    if (items.indexOf(item) < minIndex || !canMove(item)) return null;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'menu_button sillynpc-drag-handle';
    handle.title = 'Drag to reorder. Use Arrow Up or Arrow Down when focused.';
    handle.setAttribute('aria-label', `Reorder ${item.label || item.name || 'item'}`);
    handle.innerHTML = '<i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>';
    if (!handleIds.has(item)) handleIds.set(item, `sillynpc-reorder-${++nextHandleId}`);
    handle.id = handleIds.get(item);
    header.prepend(handle);
    handle.addEventListener('click', event => event.stopPropagation());
    handle.addEventListener('dragstart', event => event.preventDefault());
    handle.addEventListener('pointerdown', event => startDrag(event, row, handle, config, onChange));
    handle.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const eligible = items.filter((entry, index) => index >= minIndex && canMove(entry));
        const after = event.key === 'ArrowDown';
        const target = eligible[eligible.indexOf(item) + (after ? 1 : -1)];
        if (target && reorderItem(items, item, target, after, minIndex)) {
            onChange();
            document.getElementById(handle.id)?.focus();
        }
    });
    return handle;
}
