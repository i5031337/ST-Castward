/** Capture unassigned chats before the tracker records its default System. */
export function registerNewChatSystemEvents({ eventSource, types, getContext,
    offer, cancel, offerScope, onError }) {
    const unassigned = new WeakSet();
    const handled = new WeakSet();
    eventSource.makeFirst(types.CHAT_CHANGED, () => {
        cancel();
        const context = getContext();
        if (context?.getCurrentChatId?.() == null || !context.chatMetadata) return;
        if (!context.chatMetadata.sillynpc_system
            && !context.chat?.some(message => message?.is_user && !message?.is_system)) {
            unassigned.add(context.chatMetadata);
        }
    });
    const setup = async () => {
        const metadata = getContext()?.chatMetadata;
        if (!metadata || handled.has(metadata)) return;
        handled.add(metadata);
        try {
            await offer();
            if (getContext()?.chatMetadata === metadata) await offerScope();
        } catch (err) {
            onError(err);
        }
    };
    // Empty greetings and permanent assistant chats do not emit CHAT_CREATED.
    eventSource.on(types.CHAT_CHANGED, () => {
        const metadata = getContext()?.chatMetadata;
        if (!unassigned.has(metadata)) return;
        unassigned.delete(metadata);
        return setup();
    });
    for (const type of [types.CHAT_CREATED, types.GROUP_CHAT_CREATED]) {
        eventSource.on(type, setup);
    }
}
