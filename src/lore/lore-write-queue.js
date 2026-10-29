const pending = new Map();

/** Place and profile writes share a queue so concurrent saves cannot overwrite each other. */
export function inOrder(world, work) {
    const next = (pending.get(world) || Promise.resolve()).catch(() => {}).then(work);
    pending.set(world, next);
    const clear = () => { if (pending.get(world) === next) pending.delete(world); };
    next.then(clear, clear);
    return next;
}
