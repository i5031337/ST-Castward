import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { getSettings } from '../../core/settings.js';
import { normalizeTtsSettings, ttsConfigError } from '../../tts/tts-settings.js';
import { hostSpeechEndpoint } from '../../tts/openai-speech.js';
import { catalogVoices, discoverSpeechCatalog, normalizeSpeechCatalog } from '../../tts/speech-catalog.js';

const nativeAuto = () => extension_settings.tts?.enabled
    && (extension_settings.tts.auto_generation || extension_settings.tts.periodic_auto_generation);
let previewDesignDraft = 'A warm, expressive voice with a natural speaking pace.';

// Refresh mounted controls only; menu search also renders this view offscreen.
const refreshMountedSettings = event => {
    if (!event.target?.matches?.('#tts_enabled, #tts_auto_generation, #tts_periodic_auto_generation, #openai_compatible_tts_endpoint')) return;
    document.querySelectorAll('#sillynpc-tts-settings').forEach(root => {
        root.dispatchEvent(new Event('sillynpc-tts-refresh'));
    });
};
document.addEventListener('change', refreshMountedSettings);
document.addEventListener('input', refreshMountedSettings);

export function renderTtsSettings(view, { onChange = () => {}, preview = () => {},
    previewNpcDefault = () => {}, previewNpcDesign = () => {} } = {}) {
    view.replaceChildren();
    const config = getSettings().tts;
    const root = document.createElement('div');
    root.id = 'sillynpc-tts-settings'; root.className = 'sillynpc-voice-editor';
    view.append(root);
    const title = document.createElement('h3'); title.className = 'sillynpc-section-title';
    title.textContent = 'Castward speech'; root.append(title);
    const intro = document.createElement('p');
    intro.textContent = 'Choose separate models and voices for narration and NPC dialogue from your OpenAI-compatible endpoint. The custom TTS server also supports NPC voice design.';
    root.append(intro);
    const field = (key, label, control) => {
        const wrapper = document.createElement('label'); wrapper.dataset.setting = `tts.${key}`;
        const caption = document.createElement('span'); caption.className = 'sillynpc-setting-label';
        caption.textContent = label; wrapper.append(caption, control); root.append(wrapper);
        return wrapper;
    };
    const checkbox = checked => { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; return input; };
    const enabled = checkbox(config.enabled); field('enabled', 'Enable Castward speech', enabled);
    const auto = checkbox(config.autoPlay); field('autoPlay', 'Automatically play replies as lines finish', auto);
    const endpoint = document.createElement('p'); endpoint.dataset.setting = 'tts.endpoint'; root.append(endpoint);

    const choices = {};
    for (const [key, label] of [
        ['model', 'Narrator model'], ['narratorVoice', 'Narrator voice'],
        ['npcModel', 'NPC model'], ['npcVoice', 'NPC default voice'],
    ]) {
        const select = document.createElement('select'); select.className = 'text_pole';
        const manual = document.createElement('input'); manual.type = 'text'; manual.className = 'text_pole';
        manual.placeholder = `Enter ${label.toLowerCase()} ID`; manual.maxLength = 200; manual.hidden = true;
        const wrapper = field(key, label, select); wrapper.append(manual);
        choices[key] = { select, manual };
    }
    const designed = checkbox(config.npcVoiceMode === 'designed');
    field('npcVoiceMode', 'Use character voice descriptions for NPCs', designed);
    const designDraft = document.createElement('input'); designDraft.type = 'text'; designDraft.className = 'text_pole';
    designDraft.maxLength = 500; designDraft.value = previewDesignDraft;
    designDraft.addEventListener('input', () => { previewDesignDraft = designDraft.value; });
    const designDraftLabel = document.createElement('label');
    const designDraftCaption = document.createElement('span'); designDraftCaption.className = 'sillynpc-setting-label';
    designDraftCaption.textContent = 'Preview voice design instructions';
    designDraftLabel.append(designDraftCaption, designDraft); designDraftLabel.hidden = !designed.checked;
    root.append(designDraftLabel);
    const speed = document.createElement('input'); speed.type = 'number'; speed.className = 'text_pole';
    speed.min = '0.25'; speed.max = '4'; speed.step = '0.05'; speed.value = config.speed;
    field('speed', 'Speed', speed);
    const actions = document.createElement('div'); actions.className = 'sillynpc-voice-actions'; root.append(actions);
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'menu_button';
    refresh.textContent = 'Refresh available models and voices'; actions.append(refresh);
    const sample = document.createElement('button'); sample.type = 'button'; sample.className = 'menu_button';
    sample.textContent = 'Preview narrator'; actions.append(sample);
    const npcSample = document.createElement('button'); npcSample.type = 'button'; npcSample.className = 'menu_button';
    npcSample.textContent = 'Preview NPC voice'; actions.append(npcSample);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); root.append(status);

    let catalog = null, catalogEndpoint = '', catalogMessage = '', requestNumber = 0;
    const currentEndpoint = () => hostSpeechEndpoint();
    const cached = endpoint => config.catalog?.endpoint === endpoint ? config.catalog : null;
    const modelOptions = () => catalog?.profileModels?.length ? catalog.profileModels : catalog?.models || [];
    const voiceOptions = key => {
        const model = key === 'narratorVoice' ? config.model : config.npcModel || config.model;
        if (catalog) return catalogVoices(catalog, model);
        return key === 'narratorVoice' ? config.voices : config.npcVoices?.length ? config.npcVoices : config.voices;
    };
    const available = key => key === 'model' || key === 'npcModel' ? modelOptions() : voiceOptions(key);
    const persist = () => { onChange(); saveSettingsDebounced(); refreshStatus(); };
    const refreshStatus = () => {
        endpoint.textContent = `Built-in OpenAI Compatible endpoint: ${currentEndpoint() || 'not set'}`;
        const issue = ttsConfigError(config, currentEndpoint());
        status.textContent = config.enabled && config.autoPlay && nativeAuto()
            ? 'Built-in TTS automatic narration is also on. Turn it off to avoid duplicate speech.'
            : catalogMessage || issue || 'Ready to speak.';
    };
    const renderChoice = key => {
        const { select, manual } = choices[key];
        const ids = [...new Set(available(key).filter(Boolean))];
        const saved = config[key] || '';
        select.replaceChildren();
        const empty = document.createElement('option'); empty.value = '';
        empty.textContent = key === 'npcModel' ? 'Same as narrator model'
            : key === 'npcVoice' ? 'Use narrator voice' : `Choose ${key === 'model' ? 'a model' : 'a voice'}`;
        select.append(empty);
        if (saved && !ids.includes(saved)) {
            const option = document.createElement('option'); option.value = saved; option.textContent = `${saved} (saved)`;
            select.append(option);
        }
        for (const id of ids) {
            const option = document.createElement('option'); option.value = id; option.textContent = id;
            select.append(option);
        }
        const custom = document.createElement('option'); custom.value = '__custom__'; custom.textContent = 'Enter a custom ID…';
        select.append(custom); select.value = saved;
        manual.hidden = true; manual.value = saved;
    };
    const renderChoices = () => Object.keys(choices).forEach(renderChoice);
    const setChoice = (key, value) => {
        config[key] = value.trim().slice(0, 200);
        if (key === 'model' || key === 'npcModel') {
            const voiceKey = key === 'model' ? 'narratorVoice' : 'npcVoice';
            const valid = voiceOptions(voiceKey);
            if (valid.length && !valid.includes(config[voiceKey])) config[voiceKey] = valid[0];
            if (!valid.length && catalog) config[voiceKey] = '';
        }
        if (config.narratorVoice && !config.voices.includes(config.narratorVoice)) config.voices.push(config.narratorVoice);
        if (config.npcVoice && !config.npcVoices.includes(config.npcVoice)) config.npcVoices.push(config.npcVoice);
        renderChoices(); persist();
    };
    for (const [key, { select, manual }] of Object.entries(choices)) {
        select.addEventListener('change', () => {
            if (select.value === '__custom__') { manual.hidden = false; manual.value = ''; manual.focus(); return; }
            setChoice(key, select.value);
        });
        manual.addEventListener('change', () => setChoice(key, manual.value));
    }
    enabled.addEventListener('change', () => { config.enabled = enabled.checked; persist(); });
    auto.addEventListener('change', () => { config.autoPlay = auto.checked; persist(); });
    designed.addEventListener('change', () => {
        config.npcVoiceMode = designed.checked ? 'designed' : 'listed';
        designDraftLabel.hidden = !designed.checked; persist();
    });
    speed.addEventListener('change', () => {
        config.speed = normalizeTtsSettings({ speed: speed.value }).speed;
        speed.value = config.speed; persist();
    });
    let previewRequest = 0;
    const runPreview = async (label, action) => {
        const request = ++previewRequest;
        sample.disabled = npcSample.disabled = true;
        status.textContent = `Starting ${label} preview…`;
        try { await action(); if (request === previewRequest) status.textContent = `${label} preview finished.`; }
        catch (error) { if (request === previewRequest) status.textContent = `${label} preview failed: ${error?.message || error}`; }
        finally { if (request === previewRequest) sample.disabled = npcSample.disabled = false; }
    };
    sample.addEventListener('click', () => runPreview('Narrator', () => preview(config.narratorVoice)));
    npcSample.addEventListener('click', () => runPreview('NPC', () => designed.checked
        ? previewNpcDesign(designDraft.value) : previewNpcDefault()));
    const loadCatalog = async () => {
        const selectedEndpoint = currentEndpoint(), currentRequest = ++requestNumber;
        catalogEndpoint = selectedEndpoint; catalog = cached(selectedEndpoint);
        catalogMessage = selectedEndpoint ? (catalog ? 'Using saved endpoint choices; checking for updates…' : 'Loading endpoint choices…') : '';
        renderChoices(); refreshStatus();
        if (!selectedEndpoint) return;
        try {
            const result = await discoverSpeechCatalog(selectedEndpoint, fetch, AbortSignal.timeout(6000));
            if (currentRequest !== requestNumber || selectedEndpoint !== currentEndpoint()) return;
            const previous = cached(selectedEndpoint);
            if (!result.modelError || !result.voiceError || result.designModels !== null) {
                const next = normalizeSpeechCatalog({ endpoint: selectedEndpoint,
                    models: result.modelError ? previous?.models || [] : result.models,
                    voices: result.voiceError ? previous?.voices || [] : result.voices,
                    profileModels: result.profileModels ?? previous?.profileModels ?? null,
                    designModels: result.designModels ?? previous?.designModels ?? null });
                catalog = next;
                if (JSON.stringify(config.catalog) !== JSON.stringify(next)) {
                    config.catalog = next; saveSettingsDebounced();
                }
            }
            catalogMessage = result.modelError || result.voiceError
                ? catalog ? 'Using saved choices. Connect from the host machine to refresh them.'
                    : 'Endpoint choices unavailable. Enter custom IDs or connect from the host machine.'
                : `Found ${catalog.models.length} models and ${catalog.voices.length} voices. Choices saved for remote use.`;
        } catch {
            if (currentRequest !== requestNumber) return;
            catalogMessage = catalog ? 'Using saved choices. Connect from the host machine to refresh them.'
                : 'Endpoint choices unavailable. Enter custom IDs or connect from the host machine.';
        }
        renderChoices(); refreshStatus();
    };
    refresh.addEventListener('click', loadCatalog);
    root.addEventListener('sillynpc-tts-refresh', () => {
        if (catalogEndpoint !== currentEndpoint()) void loadCatalog(); else refreshStatus();
    });
    catalog = cached(currentEndpoint()); renderChoices(); refreshStatus();
    if (view.isConnected) void loadCatalog();
}

export function builtInAutoTtsEnabled() { return Boolean(nativeAuto()); }
