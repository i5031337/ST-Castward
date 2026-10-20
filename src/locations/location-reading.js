import { readLocationStore } from './location-store.js';
import { requestLocationReading } from './location-reader.js';

/** Initial settings come from story context; later reads follow the tracker's boolean. */
export function shouldReadSceneLocation(state, locationChanged) {
    const store = readLocationStore(state);
    return store.enabled && (!store.records[store.currentId] || locationChanged === true);
}

/** Keep a failed location request independent of successful stat and inventory reading. */
export async function prepareSceneLocationReading({ state, locationChanged, isCurrent, ...request }) {
    if (!shouldReadSceneLocation(state, locationChanged) || !isCurrent()) return null;
    try {
        const result = await requestLocationReading({ ...request, state });
        return isCurrent() ? { ...result, status: 'done' } : null;
    } catch (error) {
        if (!isCurrent()) return null;
        return { status: 'failed', output: null, raw: error?.output ?? null,
            warnings: [`Location reading failed: ${error?.message || error}. Regenerate the tracker reading to retry.`] };
    }
}
