/** Keep tool-created profiles in lore for the immediate continuation, never in tool history. */
export function createNpcLoreHandoff({ getContext, getSettings, getCards }) {
    let pending = new WeakMap();
    const latestUser = context => context.chat?.findLast(message => message.is_user);
    function records() {
        const context = getContext();
        const settings = getSettings();
        if (!settings.enabled || !settings.npcCreationToolEnabled || !context?.chatMetadata) return [];
        return [...(pending.get(context.chatMetadata)?.values() || [])].filter(record =>
            record.chatId === context.getCurrentChatId?.() && record.system === settings.activeSystem
            && record.user === latestUser(context) && getCards().includes(record.card)
            && record.world === record.card.lorebook?.world && record.uid === record.card.lorebook?.uid);
    }
    return {
        remember(card) {
            const context = getContext();
            let entries = pending.get(context.chatMetadata);
            if (!entries) { entries = new Map(); pending.set(context.chatMetadata, entries); }
            entries.set(card.id, { card, world: card.lorebook.world, uid: card.lorebook.uid,
                chatId: context.getCurrentChatId(), system: getSettings().activeSystem, user: latestUser(context) });
        },
        cards: () => records().map(record => record.card),
        apply(lore) {
            const wanted = records();
            const seen = new Set();
            for (const key of ['chatLore', 'personaLore', 'characterLore', 'globalLore']) {
                if (!Array.isArray(lore[key])) continue;
                const entries = lore[key].flatMap(entry => {
                    const record = wanted.find(record => record.world === entry.world && String(record.uid) === String(entry.uid));
                    if (!record || entry.disable) return [entry];
                    if (seen.has(record)) return [];
                    seen.add(record);
                    // These are scan copies. Saved entry policy resumes on the next user turn.
                    return [{ ...entry, constant: true, ignoreBudget: true, useProbability: false,
                        group: '', delay: 0, cooldown: 0, sticky: 0, delayUntilRecursion: false }];
                });
                lore[key].splice(0, lore[key].length, ...entries);
            }
        },
        clear() { pending = new WeakMap(); },
    };
}

/** Compact old Castward results in the outgoing prompt without rewriting saved chat history. */
export function compactNpcToolHistory({ chat }) {
    const ids = new Set((chat || []).flatMap(message => message.tool_calls || [])
        .filter(call => call.function?.name === 'castward_create_npc').map(call => call.id));
    for (const message of chat || []) {
        if (message.role !== 'tool' || !ids.has(message.tool_call_id)) continue;
        try {
            const result = JSON.parse(message.content);
            if (result.ok === true) {
                message.content = JSON.stringify({ ok: true, reused: result.reused === true, id: result.id, name: result.name });
            }
        } catch { /* Leave malformed or non-JSON tool results intact. */ }
    }
}
