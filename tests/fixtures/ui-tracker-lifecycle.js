/** Exercise production event wiring with a separate host emitter and unsaved stores. */
export async function runTrackerLifecycleFixture(root) {
    const moduleUrl = root + 'src/tracker/status-chat-session.js';
    const { event_types } = await import(new URL('../../../../../events.js', moduleUrl).href);
    const { EventEmitter } = await import(new URL('../../../../../../lib/eventemitter.js', moduleUrl).href);
    const { createTrackerLifecycle } = await import(root + 'src/tracker/tracker-lifecycle.js');
    const eventSource = new EventEmitter([]);
    const calls = [];
    let chatId = 'A', persona = 'outgoing.png', releaseFirst;
    const gate = new Promise(resolve => { releaseFirst = resolve; });
    const sessions = Object.fromEntries(['A', 'B'].map(key => [key, {
        sillynpc_system: key, sillynpc_persona: key + '.png',
        sillynpc_status_state: { player: { personaKey: key + '.png' } },
    }]));
    const settings = { activeSystem: 'outgoing', statusTracker: { presets: { A: {}, B: {} } } };
    const globals = {
        PERSONA_KEY: 'sillynpc_persona', SYSTEM_KEY: 'sillynpc_system', sessionCache: {},
        currentChatId: () => chatId, getMetadata: () => sessions[chatId], hasOpenChat: () => true,
        getChatSystem: () => sessions[chatId].sillynpc_system,
        getActiveSystem: () => settings.activeSystem, getSettings: () => settings,
        setActiveSystem(key) { settings.activeSystem = key; calls.push('system:' + key); return true; },
        restoreNpcRoster: () => calls.push('roster:' + chatId),
        getCurrentPersonaKey: () => persona, getCurrentPersonaName: () => persona,
        resolvePersonaAvatarAndName: () => ({ avatar: persona, name: persona }),
        getContext: () => ({ chatMetadata: sessions[chatId], saveMetadataDebounced() { calls.push('binding'); } }),
        async setUserAvatar(key) {
            persona = key;
            calls.push('avatar:' + key);
            if (key === 'A.png') await gate;
            await eventSource.emit(event_types.PERSONA_CHANGED);
        },
        loadStateFromMetadata() { calls.push('load:' + chatId); return sessions[chatId].sillynpc_status_state; },
        activatePersona() { calls.push('select'); return false; },
        saveStateToMetadata() { calls.push('save'); return true; },
        migrateToActiveSystem() {}, debugLog() {}, LOG_PREFIX: 'fixture',
        createTrackerLifecycle, eventSource, event_types,
    };
    const source = (await (await fetch(moduleUrl)).text())
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replace(/^export\s+\{[^}]+\};?\s*/gm, '');
    const { initStatusLogic } = new Function(...Object.keys(globals), source + '; return {initStatusLogic};')(...Object.values(globals));
    let generation = 0;
    initStatusLogic({ refreshPrompts: () => calls.push('refresh:' + chatId), onGenerationStarted: () => generation++ });
    const first = eventSource.emit(event_types.CHAT_CHANGED);
    chatId = 'B';
    const second = eventSource.emit(event_types.CHAT_CHANGED);
    releaseFirst();
    await Promise.all([first, second]);
    await eventSource.emit(event_types.GENERATION_STARTED);
    return {
        latestChatLoaded: calls.filter(call => call.startsWith('load:')).join() === 'load:B',
        latestChatRefreshed: calls.filter(call => call.startsWith('refresh:')).join() === 'refresh:B',
        restorationEventsDoNotSave: !calls.includes('save') && !calls.includes('binding'),
        rulesBeforePersona: calls.indexOf('system:B') < calls.indexOf('avatar:B.png'),
        latestPersona: persona === 'B.png',
        generationHook: generation === 1,
    };
}
