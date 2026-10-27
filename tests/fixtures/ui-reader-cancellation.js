// Reversible mocked LLM requests; cancelled replies never reach their consumers.
const root = new URL('../../', import.meta.url).href;
const { requestExtraction } = await import(root + 'src/tracker/extractor/status-extractor-request.js');
const { requestLore } = await import(root + 'src/api/api-lore-generate.js');
const { generationRequestAdapter } = await import(root + 'src/generation/request.js');
const { startGenerationTask } = await import(root + 'src/core/generation-cancellation.js');
const { getSettings } = await import(root + 'src/core/settings.js');
const settings = getSettings();
const savedLoreProfile = settings.loreProfileId;
const service = SillyTavern.getContext().ConnectionManagerRequestService;
const original = { sendRequest: service.sendRequest, getProfile: service.getProfile, validateProfile: service.validateProfile };
const stop = document.getElementById('mes_stop');
const display = stop.style.display;
const result = {};
let active;
try {
    settings.loreProfileId = 'fixture';
    service.getProfile = () => ({ id: 'fixture' });
    service.validateProfile = () => ({ source: 'openai', selected: 'openai' });
    const generate = generationRequestAdapter({}, 'fixture');
    const paths = {
        reader: () => requestExtraction('Fixture', null, { extractionProfileId: 'fixture' }),
        lore: () => requestLore('Fixture'),
        systemNpc: () => generate({ systemPrompt: 'System', userPrompt: 'Fixture', maxTokens: 10 }),
    };
    for (const [label, request] of Object.entries(paths)) {
        let calls = 0;
        for (let attempt = 0; attempt < 2; attempt++) {
            let finish, signal;
            service.sendRequest = (...args) => {
                calls++; signal = args[3].signal;
                return new Promise(resolve => { finish = resolve; });
            };
            active = startGenerationTask();
            const caught = request().then(() => 'resolved', error => error.name);
            result[`${label}${attempt}Visible`] = getComputedStyle(stop).display !== 'none';
            stop.style.display = 'none';
            await new Promise(resolve => setTimeout(resolve, 30));
            result[`${label}${attempt}SurvivesCleanup`] = getComputedStyle(stop).display !== 'none';
            stop.click();
            result[`${label}${attempt}Cancelled`] = await caught === 'AbortError';
            result[`${label}${attempt}Aborted`] = signal.aborted && active.signal.aborted;
            active.finish(); active = null;
            finish({ content: '{}' });
            await new Promise(resolve => setTimeout(resolve, 30));
            result[`${label}${attempt}Hidden`] = getComputedStyle(stop).display === 'none';
        }
        result[`${label}RetryWithoutFallback`] = calls === 2;
    }
} catch (error) {
    result.error = String(error) + '\n' + (error.stack || '');
} finally {
    active?.finish();
    Object.assign(service, original);
    settings.loreProfileId = savedLoreProfile;
    stop.style.display = display;
    document.documentElement.setAttribute('data-reader-cancellation', JSON.stringify(result));
}
