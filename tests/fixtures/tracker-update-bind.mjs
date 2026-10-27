import { bindStatusModule } from '../helpers/status-module.mjs';

/** Keep production calculation imports; replace only host stores and events. */
export function bindTrackerUpdate(deps, boundaries) {
    const host = { eventSource: { emit() {} }, getAllCharacters: () => [], saveSettings() {},
        getContext: () => null, ...boundaries };
    const metadata = {};
    deps.STATE_KEY ??= 'sillynpc_status_state';
    deps.SYSTEM_KEY ??= 'sillynpc_system';
    deps.getMetadata ??= () => host.getContext()?.chatMetadata ?? metadata;
    deps.currentChatId ??= () => {
        const context = host.getContext();
        return typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : 'fixture-chat';
    };
    deps.getCurrentPersonaKey ??= () => deps.committedState?.player?.personaKey ?? 'fixture-persona';
    const loadState = deps.loadStateFromMetadata;
    deps.loadStateFromMetadata = (...args) => {
        const state = loadState.apply(deps, args);
        deps.committedState = state;
        return state;
    };
    bindStatusModule(new URL('../../src/tracker/status-apply-update.js', import.meta.url), deps, host);
}
