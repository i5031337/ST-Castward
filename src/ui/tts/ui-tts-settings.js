import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { getSettings } from '../../core/settings.js';
import { normalizeTtsSettings, ttsConfigError } from '../../tts/tts-settings.js';
import { hostSpeechEndpoint } from '../../tts/openai-speech.js';

const nativeAuto = () => extension_settings.tts?.enabled
    && (extension_settings.tts.auto_generation || extension_settings.tts.periodic_auto_generation);

// Refresh mounted controls only; menu redraws and offscreen search indexing create new views.
const refreshMountedSettings = event => {
    if (!event.target?.matches?.('#tts_enabled, #tts_auto_generation, #tts_periodic_auto_generation, #openai_compatible_tts_endpoint')) return;
    document.querySelectorAll('#sillynpc-tts-settings').forEach(root => {
        root.dispatchEvent(new Event('sillynpc-tts-refresh'));
    });
};
document.addEventListener('change', refreshMountedSettings);
document.addEventListener('input', refreshMountedSettings);

export function renderTtsSettings(view, { onChange = () => {}, preview = () => {} } = {}) {
    view.replaceChildren();
    const root = document.createElement('fieldset');
    root.id = 'sillynpc-tts-settings'; root.className = 'sillynpc-voice-editor';
    const legend = document.createElement('legend'); legend.textContent = 'SillyNPC speech';
    const intro = document.createElement('p');
    intro.textContent = 'One voice for narration, individual voices for NPC dialogue. Uses the built-in OpenAI Compatible endpoint and API key. Set each NPC voice in Cast → Characters.';
    root.append(legend, intro); view.append(root);
    const config = getSettings().tts;
    const field = (key, label, input) => {
        const wrapper = document.createElement('label'); wrapper.dataset.setting = `tts.${key}`;
        const caption = document.createElement('span'); caption.className = 'sillynpc-setting-label';
        caption.textContent = label; wrapper.append(caption);
        wrapper.append(input); root.append(wrapper); return input;
    };
    const input = (type, value) => {
        const element = document.createElement('input'); element.type = type;
        if (type !== 'checkbox') element.className = 'text_pole';
        if (type === 'checkbox') element.checked = value; else element.value = value;
        return element;
    };
    const enabled = field('enabled', 'Enable SillyNPC speech', input('checkbox', config.enabled));
    const auto = field('autoPlay', 'Automatically play replies as lines finish', input('checkbox', config.autoPlay));
    const endpoint = field('endpoint', 'Built-in OpenAI Compatible endpoint', input('url', hostSpeechEndpoint()));
    endpoint.readOnly = true;
    const model = field('model', 'Narrator model', input('text', config.model));
    const npcModel = field('npcModel', 'NPC dialogue model (blank uses narrator model)', input('text', config.npcModel || ''));
    const voices = field('voices', 'Narrator voices (comma separated)', input('text', config.voices.join(', ')));
    const npcVoices = field('npcVoices', 'NPC voices (comma separated; blank uses narrator voices)', input('text', (config.npcVoices || []).join(', ')));
    const npcVoiceMode = document.createElement('select'); npcVoiceMode.className = 'text_pole';
    for (const [value, label] of [['listed', 'Listed voices (OpenAI compatible)'],
        ['designed', 'Designed voices (local SillyNPC voice-design protocol)']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = label; npcVoiceMode.append(option);
    }
    npcVoiceMode.value = config.npcVoiceMode;
    field('npcVoiceMode', 'NPC voice support', npcVoiceMode);
    const compatibility = document.createElement('p');
    compatibility.textContent = 'Use model and voice IDs supported by your endpoint. Both models use this endpoint and API key. Designed voices require the local service’s SillyNPC protocol; ordinary OpenAI compatible models use listed voices.';
    root.append(compatibility);
    const narrator = document.createElement('select'); narrator.className = 'text_pole';
    field('narratorVoice', 'Narrator voice', narrator);
    const speed = field('speed', 'Speed', input('number', config.speed)); speed.min = '0.25'; speed.max = '4'; speed.step = '0.05';
    const actions = document.createElement('div'); actions.className = 'sillynpc-voice-actions'; root.append(actions);
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'menu_button';
    copy.textContent = 'Copy built-in model and voices'; actions.append(copy);
    const sample = document.createElement('button'); sample.type = 'button'; sample.className = 'menu_button';
    sample.textContent = 'Preview narrator'; actions.append(sample);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); root.append(status);
    const refreshNarrator = () => {
        narrator.replaceChildren();
        for (const voice of config.voices) {
            const option = document.createElement('option'); option.value = voice; option.textContent = voice;
            narrator.append(option);
        }
        narrator.value = config.narratorVoice;
    };
    const refreshStatus = () => {
        endpoint.value = hostSpeechEndpoint();
        const issue = ttsConfigError(config, endpoint.value);
        status.textContent = config.enabled && config.autoPlay && nativeAuto()
            ? 'Built-in TTS automatic narration is also on. Turn it off to avoid duplicate speech.'
            : issue || 'SillyNPC uses the built-in OpenAI Compatible endpoint and API key.';
    };
    const persist = () => { onChange(); saveSettingsDebounced(); refreshStatus(); };
    enabled.addEventListener('change', () => { config.enabled = enabled.checked; persist(); });
    auto.addEventListener('change', () => { config.autoPlay = auto.checked; persist(); });
    model.addEventListener('change', () => { config.model = model.value.trim(); persist(); });
    npcModel.addEventListener('change', () => { config.npcModel = npcModel.value.trim(); persist(); });
    npcVoiceMode.addEventListener('change', () => { config.npcVoiceMode = npcVoiceMode.value; persist(); });
    npcVoices.addEventListener('change', () => {
        config.npcVoices = normalizeTtsSettings({ npcVoices: npcVoices.value.split(',') }).npcVoices; persist();
    });
    voices.addEventListener('change', () => {
        config.voices = [...new Set(voices.value.split(',').map(value => value.trim()).filter(Boolean))].slice(0, 100);
        refreshNarrator(); persist();
    });
    narrator.addEventListener('change', () => { config.narratorVoice = narrator.value; persist(); });
    speed.addEventListener('change', () => { config.speed = normalizeTtsSettings({ speed: speed.value }).speed; speed.value = config.speed; persist(); });
    copy.addEventListener('click', () => {
        const source = extension_settings.tts?.['OpenAI Compatible'];
        if (!source?.provider_endpoint) { status.textContent = 'No built-in OpenAI Compatible setup to copy.'; return; }
        config.model = source.model || '';
        const listed = Array.isArray(source.available_voices) ? source.available_voices
            : String(source.available_voices || '').split(',');
        config.voices = [...new Set(listed.map(value => String(value).trim()).filter(Boolean))];
        config.narratorVoice = config.voices.includes(config.narratorVoice) ? config.narratorVoice : config.voices[0] || '';
        model.value = config.model; voices.value = config.voices.join(', ');
        refreshNarrator(); persist();
    });
    sample.addEventListener('click', async () => {
        sample.disabled = true; status.textContent = 'Starting narrator preview…';
        try { await preview(config.narratorVoice); status.textContent = 'Narrator preview finished.'; }
        catch (error) { status.textContent = `Narrator preview failed: ${error?.message || error}`; }
        sample.disabled = false;
    });
    root.addEventListener('sillynpc-tts-refresh', refreshStatus);
    refreshNarrator(); refreshStatus();
}

export function builtInAutoTtsEnabled() { return Boolean(nativeAuto()); }
