import { startGenerationTask, awaitGenerationRequest } from '../core/generation-cancellation.js';
import { getContext } from '../../../../../st-context.js';
import { extractMessageFromData } from '../../../../../../script.js';
import { customProfilePayload } from '../api/api-connection-profile.js';
/** Capture connection preferences once; never fall back to another connection. */
export function generationRequestAdapter(tracker, profileId = tracker.extractionProfileId || '') {
    const useSchema = tracker.extractionUseSchema === true;
    const typed = String(tracker.extractionTemperature ?? '').trim();
    const temperature = typed !== '' && Number.isFinite(Number(typed)) ? Number(typed) : null;
    return async ({ systemPrompt, userPrompt, schema, maxTokens, signal }) => {
        if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');
        const task = startGenerationTask({ signal });
        signal = task.signal;
        try {
            const context = getContext();
            let answer;
            if (profileId) {
                if (!context.ConnectionManagerRequestService) throw new Error('Selected connection is unavailable. Choose another connection explicitly.');
                const result = await awaitGenerationRequest(context.ConnectionManagerRequestService.sendRequest(profileId,
                    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], maxTokens,
                    { extractData: true, includePreset: false, signal }, { ...(useSchema ? { json_schema: schema } : {}),
                        ...(temperature === null ? {} : { temperature }), ...customProfilePayload(context, profileId) }), signal);
                answer = typeof result === 'string' ? result : result?.content ?? result;
            } else {
                const raw = await awaitGenerationRequest(context.generateRawData({ prompt: userPrompt, systemPrompt,
                    responseLength: maxTokens, jsonSchema: useSchema ? schema : null, signal }), signal);
                answer = useSchema ? raw : extractMessageFromData(raw);
            }
            signal.throwIfAborted();
            return answer;
        } finally { task.finish(); }
    };
}
