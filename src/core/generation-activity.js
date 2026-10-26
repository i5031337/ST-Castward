const activities = new Set();
const listeners = new Set();

function notify() {
    for (const listener of listeners) {
        try { listener(); } catch (error) { console.warn('[Castward] Activity display failed', error); }
    }
}

/** Live work is transient and never belongs in chat metadata. */
export function getGenerationActivities() {
    return [...activities];
}

export function subscribeGenerationActivity(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function clearGenerationActivities() {
    activities.clear();
    notify();
}

/** Each handle owns one entry, so overlapping requests finish independently. */
export function startActivity(activity, signal) {
    const finish = () => {
        signal?.removeEventListener('abort', finish);
        if (activities.delete(entry)) notify();
    };
    const entry = { ...activity };
    if (activity && !signal?.aborted) {
        activities.add(entry);
        signal?.addEventListener('abort', finish, { once: true });
        notify();
    }
    return { finish };
}
