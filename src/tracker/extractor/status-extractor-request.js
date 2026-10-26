import { startGenerationTask, awaitGenerationRequest } from '../../core/generation-cancellation.js';
import { extractMessageFromData } from '../../../../../../../script.js';
import { getContext } from '../../../../../../st-context.js';
import { applyMacros } from '../../prompts/macros.js';
import { LOG_PREFIX, debugLog, SYSTEM_PROMPT } from '../../core/constants.js';
import { describeConnection, extractJSON, safeJsonParse } from '../../core/utils.js';
import { recordUsage } from '../../core/usage.js';
import { customProfilePayload } from '../../api/api-connection-profile.js';
import { readerSchemaForConnection } from './status-extractor-schema-provider.js';

/** What a reply cost, whether it arrived as text or as already-parsed data. */
function describeAnswer(answer) {
    if (typeof answer === 'string') return answer;
    try { return JSON.stringify(answer ?? ''); } catch { return ''; }
}
/** Optional reader temperature, constrained to the supported 0–2 range. */
export function readerTemperature(trackerSettings) {
    const typed = String(trackerSettings?.extractionTemperature ?? '').trim();
    if (typed === '') return null;
    const numeric = Number(typed);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 2 ? numeric : null;
}

/**
 * Runs the request, preferring a dedicated Connection Profile.
 *
 * @returns {Promise<string|object>} Model output. A backend given a json_schema may
 * return already-parsed data rather than text, so callers must handle both.
 */

export async function requestExtraction(userPrompt, schema, trackerSettings, systemPrompt = null, { usageKind = 'extraction' } = {}) {
    const task = startGenerationTask();
    try {
        return await performExtraction(userPrompt, schema, trackerSettings, systemPrompt, usageKind, task.signal);
    } finally { task.finish(); }
}

async function performExtraction(userPrompt, schema, trackerSettings, systemPrompt, usageKind, signal) {
    signal.throwIfAborted();
    // History scans can supply a specialized prompt. Ordinary turns use the built-in.
    systemPrompt = applyMacros(systemPrompt || SYSTEM_PROMPT);
    const context = getContext();
    const profileId = trackerSettings.extractionProfileId;
    const maxTokens = Number(trackerSettings.extractionMaxTokens) || 1200;
    const temperature = readerTemperature(trackerSettings);
    // SillyTavern expects its named wrapper, then forwards value as the provider schema.
    const schemaFor = selectedProfile => schema && trackerSettings.extractionUseSchema
        ? { name: 'castward_reader', value: readerSchemaForConnection(schema, context, selectedProfile), strict: true } : null;

    debugLog(`Extraction -> ${describeConnection(profileId)}, reply budget ${maxTokens}`);

    if (profileId) {
        // Connection Manager can be disabled, and the profile may have been deleted;
        // either throws, so fall through to the main API rather than failing the sync.
        try {
            const service = context.ConnectionManagerRequestService;
            const result = await awaitGenerationRequest(service.sendRequest(
                profileId,
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                maxTokens,
                { extractData: true, includePreset: false, signal },
                {
                    // Structured output is opt-in: some backends return an empty object
                    // rather than reject a schema they dislike, which loses the update
                    // silently. The system prompt pins the shape without it.
                    ...(schema && trackerSettings.extractionUseSchema ? { json_schema: schemaFor(profileId) } : {}),
                    // Sent only when you set one. Nothing of the story preset comes with the
                    // request (includePreset is off). Without a reader or custom-profile
                    // temperature, the model's own default decides.
                    ...(temperature === null ? {} : { temperature }),
                    ...customProfilePayload(context, profileId),
                },
            ), signal);
            signal.throwIfAborted();
            const answer = typeof result === 'string' ? result : (result?.content ?? result ?? '');
            recordUsage(usageKind, { prompt: systemPrompt + userPrompt, reply: describeAnswer(answer) });
            return answer;
        } catch (err) {
            if (signal.aborted || err?.name === 'AbortError') throw signal.reason || err;
            console.warn(LOG_PREFIX, 'Selected extraction connection failed, falling back to the main API:', err);
            if (typeof toastr !== 'undefined') toastr.warning(
                `The selected ${usageKind === 'scan' ? 'history scan' : 'reader'} connection failed. `
                + 'Retrying with the main API (the same connection as chat).',
                'Castward',
            );
        }
    }

    const raw = await awaitGenerationRequest(context.generateRawData({
        prompt: userPrompt,
        systemPrompt,
        responseLength: maxTokens,
        jsonSchema: schemaFor(),
    }), signal);
    signal.throwIfAborted();
    // Without a schema, generateRawData returns the provider response. Its text may
    // be in choices, results, or content blocks rather than a top-level content field.
    // With a schema, SillyTavern has already extracted the JSON response for us.
    const answer = schema && trackerSettings.extractionUseSchema
        ? raw
        : extractMessageFromData(raw);
    recordUsage(usageKind, { prompt: systemPrompt + userPrompt, reply: describeAnswer(answer) });
    return answer;
}

/**
 * Turns whatever the backend returned into an update object.
 *
 * A structured-output backend returns parsed data; everything else returns text that
 * may be wrapped in prose or a code fence, which extractJSON/safeJsonParse handle.
 *
 * @param {string|object} raw
 * @returns {object|null}
 */
export function coerceToUpdate(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return Array.isArray(raw) ? null : raw;
    return safeJsonParse(extractJSON(String(raw)));
}
