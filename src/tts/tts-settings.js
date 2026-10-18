// Persisted voice-binding key; keep existing character voices through the rebrand.
export const NPC_TTS_PROVIDER = 'SillyNPC OpenAI Compatible';
export const defaultTtsSettings = Object.freeze({
    enabled: false,
    autoPlay: false,
    model: '',
    npcModel: '',
    npcVoices: [],
    npcVoiceMode: 'listed',
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    narratorVoice: 'alloy',
    speed: 1,
});

export const QWEN_MODEL = 'qwen3-tts';

const voiceList = values => [...new Set(values.map(voice => typeof voice === 'string' ? voice.trim() : '').filter(Boolean))].slice(0, 100);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export function normalizeTtsSettings(value) {
    const raw = object(value);
    const voices = voiceList(Array.isArray(raw.voices) ? raw.voices : defaultTtsSettings.voices);
    const speed = Number(raw.speed);
    return {
        enabled: raw.enabled === true,
        autoPlay: raw.autoPlay === true,
        model: typeof raw.model === 'string' ? raw.model.trim().slice(0, 200) : '',
        npcModel: typeof raw.npcModel === 'string' ? raw.npcModel.trim().slice(0, 200) : '',
        voices,
        npcVoices: voiceList(Array.isArray(raw.npcVoices) ? raw.npcVoices : []),
        // Preserve the previously implicit local adapter setting when loading old settings.
        npcVoiceMode: raw.npcVoiceMode === 'designed' || (raw.npcVoiceMode === undefined && raw.npcModel === QWEN_MODEL)
            ? 'designed' : 'listed',
        narratorVoice: typeof raw.narratorVoice === 'string' ? raw.narratorVoice.trim() : '',
        speed: Number.isFinite(speed) && speed >= 0.25 && speed <= 4 ? speed : 1,
    };
}

export const usesDesignedNpcVoices = config => config?.npcVoiceMode === 'designed';
export const dialogueVoices = config => config.npcVoices?.length ? config.npcVoices : config.voices;

/** The host proxy forwards voice but drops the local service's NPC fields. */
export function encodeDesignedVoice(card, text) {
    const design = card?.presentation?.voiceDesign;
    if (!design?.description || !card?.id) return '';
    const id = `sn_${String(card.id).replace(/[^A-Za-z0-9_-]/gu, '_')}_v${design.version || 1}`;
    if (id.length > 128) return '';
    const maxNewTokens = Math.min(512, Math.max(128, Math.ceil(String(text).length * 2.5)));
    const json = JSON.stringify({ npc_id: id, instructions: design.description, max_new_tokens: maxNewTokens });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `sillynpc-v1:${btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')}`;
}

export function resolveUnitSpeech(unit, config, card) {
    const narrator = { voice: config.narratorVoice, model: config.model };
    if (unit.kind !== 'dialogue' || !card) return narrator;
    const binding = card.presentation?.voices?.[NPC_TTS_PROVIDER]
        || card.presentation?.voices?.['OpenAI Compatible'];
    if (binding?.mode === 'disabled') return { voice: null, model: '' };
    if (usesDesignedNpcVoices(config)) {
        const designed = encodeDesignedVoice(card, unit.text);
        return designed ? { voice: designed, model: config.npcModel || config.model } : narrator;
    }
    if (binding?.mode !== 'voice') return narrator;
    const voice = resolveUnitVoice(unit, config, card);
    return voice ? { voice, model: config.npcModel || config.model } : { voice: null, model: '' };
}

/** Preview the same binding/fallback used in dialogue; no card means narrator preview. */
export function resolvePreviewSpeech(voice, config, card, text) {
    if (!card) {
        if (!config.voices.includes(voice)) throw new Error('Voice is not in the narrator voice list.');
        return { voice, model: config.model };
    }
    const choice = resolveUnitSpeech({ kind: 'dialogue', text }, config, card);
    if (!choice.voice) throw new Error('This NPC is silent or its selected voice is unavailable.');
    return choice;
}

export function ttsConfigError(config, endpoint) {
    if (!config.enabled) return 'Castward speech is disabled.';
    try {
        const url = new URL(endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) return 'Set an HTTP or HTTPS endpoint in built-in OpenAI Compatible TTS.';
    } catch { return 'Set an endpoint in built-in OpenAI Compatible TTS.'; }
    if (!config.model) return 'Enter a speech model.';
    if (!config.narratorVoice || !config.voices.includes(config.narratorVoice)) return 'Choose an available narrator voice.';
    return '';
}

export function resolveUnitVoice(unit, config, card) {
    if (unit.kind !== 'dialogue' || !card) return config.narratorVoice;
    const binding = card.presentation?.voices?.[NPC_TTS_PROVIDER]
        || card.presentation?.voices?.['OpenAI Compatible'];
    if (binding?.mode === 'disabled') return null;
    if (binding?.mode !== 'voice') return config.narratorVoice;
    const voices = dialogueVoices(config);
    const voice = voices.find(id => id === binding.voiceId)
        || voices.find(id => id === binding.voiceName);
    return voice || null;
}
