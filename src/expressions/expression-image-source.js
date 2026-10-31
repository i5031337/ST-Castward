import { getSettings } from '../core/settings.js';
import { profileFieldsForCard } from '../core/profile-fields.js';
import { liveFactsFor } from '../api/api-lore-facts.js';
import { captureExpressionImageSource } from './expression-source-policy.js';

/** Snapshot only the requested visual sources; a missing snapshot means unknown origin. */
export function expressionImageSource(card) {
    const settings = getSettings();
    return captureExpressionImageSource(card, profileFieldsForCard(card), liveFactsFor(card).collections,
        settings.statusTracker.collections || [], settings.imgGenPromptPrefix || '');
}
