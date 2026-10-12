import { fnv1a } from '../core/hash.js';

export const EMOTION_PROMPTS = Object.freeze({
    admiration: 'Admiring expression, bright attentive eyes, gentle smile.',
    amusement: 'Amused expression, playful smile, slightly raised eyebrows.',
    anger: 'Angry expression, furrowed brows, intense eyes, tense mouth.',
    annoyance: 'Annoyed expression, narrowed eyes, pressed lips.',
    approval: 'Approving expression, warm confident smile.',
    caring: 'Caring expression, soft concerned eyes, reassuring smile.',
    confusion: 'Confused expression, uneven raised brows, slightly parted lips.',
    curiosity: 'Curious expression, alert eyes, raised eyebrows.',
    desire: 'Longing expression, intent gaze, subtle inviting smile.',
    disappointment: 'Disappointed expression, lowered brows, downturned mouth.',
    disapproval: 'Disapproving expression, stern eyes, pursed lips.',
    disgust: 'Disgusted expression, wrinkled nose, recoiling mouth.',
    embarrassment: 'Embarrassed expression, flushed cheeks, shy uneasy smile.',
    excitement: 'Excited expression, sparkling wide eyes, broad smile.',
    fear: 'Fearful expression, wide eyes, raised tense brows, parted lips.',
    gratitude: 'Grateful expression, warm eyes, heartfelt smile.',
    grief: 'Grieving expression, tearful eyes, trembling downturned lips.',
    joy: 'Joyful expression, cheerful eyes, happy open smile.',
    love: 'Loving expression, tender eyes, affectionate smile.',
    nervousness: 'Nervous expression, worried brows, uneasy small smile.',
    optimism: 'Optimistic expression, hopeful bright eyes, upbeat smile.',
    pride: 'Proud expression, confident smile, slightly lifted chin.',
    realization: 'Expression of realization, widened eyes, raised brows, slightly open mouth.',
    relief: 'Relieved expression, relaxed brows, soft exhaling smile.',
    remorse: 'Remorseful expression, lowered gaze, regretful downturned mouth.',
    sadness: 'Sad expression, sorrowful eyes, lowered brows, downturned lips.',
    surprise: 'Surprised expression, wide eyes, lifted eyebrows, open mouth.',
    neutral: 'Neutral expression, relaxed face, calm eyes, closed mouth.',
});
export const EMOTION_LABELS = Object.freeze(Object.keys(EMOTION_PROMPTS));
export const BASE_EXPRESSION_PROMPT = 'Use the reference image. Preserve the same character identity, hairstyle, outfit, art style, body proportions, framing and background. Change the facial expression only.';

export function expressionWorkflow(card, settings) {
    return card?.presentation?.expressions?.generation?.workflow?.trim()
        || settings.npcExpressionWorkflow?.trim() || '';
}

export function normalizeExpressionGeneration(raw = {}) {
    const text = value => typeof value === 'string' ? value.trim() : '';
    const prompts = {};
    for (const label of EMOTION_LABELS) prompts[label] = text(raw?.prompts?.[label]) || EMOTION_PROMPTS[label];
    return { reference: text(raw?.reference), workflow: text(raw?.workflow),
        basePrompt: text(raw?.basePrompt) || BASE_EXPRESSION_PROMPT, negativePrompt: text(raw?.negativePrompt), prompts };
}

/** Each approved portrait has its own pack, including across chat-owned NPC copies. */
export function expressionFolder(card, reference) {
    const id = String(card.id).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80);
    return `SillyNPC/${id}_${fnv1a(String(card.id) + reference).toString(16)}`;
}

/** Opting into generation is enough to use an existing profile portrait. */
export function prepareExpressionReference(card) {
    const config = card.presentation?.expressions;
    if (!config?.generation || !card.imageUrl) return false;
    let changed = false;
    if (config.generation.reference && config.generation.reference !== card.imageUrl) {
        config.generation.reference = card.imageUrl;
        config.spriteFolder = expressionFolder(card, card.imageUrl);
        config.bindingStatus = 'unverified'; changed = true;
    }
    if (!config.generation.reference) { config.generation.reference = card.imageUrl; changed = true; }
    if (!config.spriteFolder) {
        config.spriteFolder = expressionFolder(card, config.generation.reference);
        config.bindingStatus = 'unverified'; changed = true;
    }
    return changed;
}
