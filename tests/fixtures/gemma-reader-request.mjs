/** Direct llama.cpp request; schema enforcement is fixed when inputs are frozen. */
export function readerRequestBody(bundle, model, { useSchema = false } = {}) {
    if (useSchema && !bundle.schema) throw Error('Schema-constrained evaluation requires a frozen schema.');
    return {
        model,
        messages: bundle.messages,
        max_tokens: bundle.settings.extractionMaxTokens || 1200,
        stream: false,
        ...(useSchema ? { response_format: {
            type: 'json_schema', json_schema: { name: 'castward_reader', schema: bundle.schema },
        } } : {}),
    };
}
