import { startActivity } from '../../src/core/generation-activity.js';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/core/generation-cancellation.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export ', '');

export function readerCancellationHarness() {
    const listeners = new Map();
    let generating = false, observe;
    const button = { style: { display: 'none' } };
    const eventSource = {
        on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
        removeListener(type, fn) { listeners.get(type)?.delete(fn); },
    };
    const api = new Function('startActivity', 'eventSource', 'event_types', 'isGenerating', 'document', 'MutationObserver',
        `${source}\nreturn { startGenerationTask, awaitGenerationRequest };`)(startActivity, eventSource,
        { GENERATION_STOPPED: 'stop', CHAT_CHANGED: 'chat' }, () => generating,
        { getElementById: () => button }, class {
            constructor(callback) { observe = callback; }
            observe() {}
            disconnect() { observe = undefined; }
        });
    return { ...api, button, emit: type => { for (const fn of listeners.get(type) || []) fn(); },
        setGenerating: value => { generating = value; }, refresh: () => observe?.(),
        listeners: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0) };
}
