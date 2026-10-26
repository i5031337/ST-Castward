/** Numeric patterns are supported by llama.cpp and GGUF-backed custom connections. */
function supportsNumericPatterns(context, profileId) {
    if (profileId) {
        try {
            const profile = context.ConnectionManagerRequestService.getProfile(profileId);
            return profile?.api === 'llamacpp' || ggufCustom(profile?.api, profile?.model);
        } catch { return false; }
    }
    return context.mainApi === 'textgenerationwebui' && context.textCompletionSettings?.type === 'llamacpp'
        || context.mainApi === 'openai' && ggufCustom(context.chatCompletionSettings?.chat_completion_source,
            context.chatCompletionSettings?.custom_model);
}

function ggufCustom(source, model) {
    return source === 'custom' && /\.gguf$/i.test(String(model || '').trim());
}

/** Adapt each request independently, including a selected connection's main-API fallback. */
export function readerSchemaForConnection(schema, context, profileId = '') {
    if (!schema || supportsNumericPatterns(context, profileId)) return schema;
    const portable = structuredClone(schema);
    const stripPatterns = node => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.pattern === 'string') delete node.pattern;
        Object.values(node).forEach(stripPatterns);
    };
    stripPatterns(portable);
    return portable;
}
