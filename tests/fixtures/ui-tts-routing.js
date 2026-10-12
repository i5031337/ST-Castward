const result = {};
let settings, saved, context, originalFetch, originalPlay, nativeTts, savedNative, element, editor, panel, speech, chatLength;
try {
    const entry = [...document.scripts].find(script => script.src.includes('/SillyNPC-XP/index.js'));
    const root = new URL('.', entry.src).href;
    const { getSettings } = await import(root + 'src/core/settings.js');
    speech = await import(root + 'src/tts/npc-tts.js');
    const { normalizeTtsSettings, NPC_TTS_PROVIDER } = await import(root + 'src/tts/tts-settings.js');
    const { buildVoicesSection } = await import(root + 'src/ui/characters/ui-voices.js');
    const { renderTtsSettings } = await import(root + 'src/ui/tts/ui-tts-settings.js');
    const { dialogueFormatText } = await import(root + 'src/prompts/dialogue-format.js');
    settings = getSettings(); context = SillyTavern.getContext();
    saved = { tts: settings.tts, characters: settings.characters, enabled: settings.enabled,
        autoGenerateNpcExpressions: settings.autoGenerateNpcExpressions };
    nativeTts = context.extensionSettings.tts;
    savedNative = { enabled: nativeTts.enabled, auto_generation: nativeTts.auto_generation,
        periodic_auto_generation: nativeTts.periodic_auto_generation, 'OpenAI Compatible': nativeTts['OpenAI Compatible'] };
    nativeTts.enabled = false;
    nativeTts['OpenAI Compatible'] = { ...nativeTts['OpenAI Compatible'], provider_endpoint: 'http://fixture.invalid/v1/audio/speech' };
    settings.enabled = true; settings.autoGenerateNpcExpressions = false;
    settings.tts = normalizeTtsSettings({ enabled: true, model: 'arbitrary-narrator', npcModel: 'arbitrary-dialogue',
        voices: ['narrator-only'], npcVoices: ['dialogue-only'], narratorVoice: 'narrator-only', npcVoiceMode: 'listed' });
    const card = { id: 'tts-routing-fixture', name: 'Routing NPC', aliases: [],
        presentation: { voices: { [NPC_TTS_PROVIDER]: { mode: 'voice', voiceId: 'dialogue-only', voiceName: 'dialogue-only' } } } };
    settings.characters = [card];
    const silence = await (await fetch('/sounds/silence.mp3')).blob();
    const calls = [], starts = [], requestTimes = [];
    originalFetch = window.fetch;
    window.fetch = async (url, options) => {
        if (String(url).includes('/api/openai/custom/generate-voice')) {
            calls.push(JSON.parse(options.body)); requestTimes.push(performance.now());
            return new Response(silence, { headers: { 'Content-Type': 'audio/mpeg' } });
        }
        return originalFetch(url, options);
    };
    originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
        this.addEventListener('playing', () => starts.push(performance.now()), { once: true });
        return originalPlay.apply(this, args);
    };
    editor = buildVoicesSection(card, { save: () => {} }); document.body.append(editor);
    result.independentVoices = [...editor.querySelector('select').options].some(option => option.value === 'voice:dialogue-only')
        && ![...editor.querySelector('select').options].some(option => option.value === 'voice:narrator-only');
    await speech.previewNpcVoice('dialogue-only', card);
    result.npcPreview = calls.at(-1).model === 'arbitrary-dialogue' && calls.at(-1).voice === 'dialogue-only';
    await speech.previewNpcVoice('narrator-only');
    result.narratorPreview = calls.at(-1).model === 'arbitrary-narrator';
    const before = calls.length;
    chatLength = context.chat.length;
    context.chat.push({ mes: 'The hall falls quiet.\nRouting NPC: "Wait."\nThe door closes.', is_user: false, swipe_id: 0 });
    element = document.createElement('div'); element.className = 'mes'; element.setAttribute('mesid', chatLength);
    element.innerHTML = '<div class="mes_text"><p>The hall falls quiet.</p><p>Routing NPC: "Wait."</p><p>The door closes.</p></div>';
    document.querySelector('#chat').append(element);
    await speech.playNpcMessage(chatLength);
    result.playbackModels = calls.slice(before).map(call => call.model).join(',') === 'arbitrary-narrator,arbitrary-dialogue,arbitrary-narrator';
    result.playbackVoices = calls.slice(before).map(call => call.voice).join(',') === 'narrator-only,dialogue-only,narrator-only';
    result.prefetch = requestTimes[before + 2] < starts[before + 1];
    panel = document.createElement('div'); renderTtsSettings(panel); document.body.append(panel);
    result.genericControls = Boolean(panel.querySelector('[data-setting="tts.npcVoices"]') && panel.querySelector('[data-setting="tts.npcVoiceMode"]'));
    settings.tts.npcVoiceMode = 'designed'; settings.tts.npcModel = 'arbitrary-design-adapter';
    card.presentation.voiceDesign = { description: 'A warm low voice.', version: 1 };
    await speech.previewNpcVoice('', card);
    result.explicitDesign = calls.at(-1).model === 'arbitrary-design-adapter' && calls.at(-1).voice.startsWith('sillynpc-v1:');
    result.designCuePrompt = dialogueFormatText().includes('NPC_VOICE');
    settings.tts.npcVoiceMode = 'listed';
    result.listedCuePrompt = !dialogueFormatText().includes('NPC_VOICE');
} catch (error) { result.error = String(error.stack || error); }
finally {
    speech?.stopNpcTts();
    if (originalFetch) window.fetch = originalFetch;
    if (originalPlay) HTMLMediaElement.prototype.play = originalPlay;
    if (nativeTts && savedNative) Object.assign(nativeTts, savedNative);
    if (context && chatLength !== undefined) context.chat.splice(chatLength);
    if (settings && saved) Object.assign(settings, saved);
    element?.remove(); editor?.remove(); panel?.remove();
}
document.documentElement.setAttribute('data-tts-routing-fixture', JSON.stringify(result));
