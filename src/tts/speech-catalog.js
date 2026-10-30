/** Discovery routes alongside an OpenAI-compatible audio/speech endpoint. */
export function speechCatalogUrls(endpoint) {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Speech endpoint must use HTTP or HTTPS.');
    const path = url.pathname.replace(/\/+$/u, '');
    const base = path.replace(/\/audio\/speech$/u, '').replace(/\/speech$/u, '');
    if (base === path) throw new Error('Speech endpoint must end in /audio/speech.');
    url.search = ''; url.hash = '';
    const urls = ['models', 'voices', 'audio/voices'].map(route => {
        const target = new URL(url);
        target.pathname = `${base}/${route}`;
        return target.href;
    });
    const studio = new URL(url);
    studio.pathname = `${base.replace(/\/v1$/u, '')}/ui/config`;
    return [...urls, studio.href];
}

const entries = payload => Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
const id = entry => typeof entry === 'string' ? entry : entry?.id;
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];

/** Keep only small, usable choices in extension settings; never store API responses wholesale. */
export function normalizeSpeechCatalog(value) {
    if (!value || typeof value !== 'object' || typeof value.endpoint !== 'string') return null;
    const models = unique(Array.isArray(value.models) ? value.models : []).filter(id => id.length <= 200).slice(0, 200);
    const voices = [], seen = new Set();
    for (const entry of Array.isArray(value.voices) ? value.voices : []) {
        const voice = typeof entry?.id === 'string' ? entry.id.trim() : '';
        const model = typeof entry?.model === 'string' ? entry.model.trim() : '';
        const key = `${model}\0${voice}`;
        if (!voice || voice.length > 200 || model.length > 200 || seen.has(key)) continue;
        seen.add(key); voices.push({ id: voice, model });
        if (voices.length === 500) break;
    }
    return {
        endpoint: value.endpoint.trim().slice(0, 1000), models, voices,
        profileModels: Array.isArray(value.profileModels)
            ? unique(value.profileModels).filter(id => models.includes(id)) : null,
        designModels: Array.isArray(value.designModels)
            ? unique(value.designModels).filter(id => models.includes(id)) : null,
    };
}

export const catalogVoices = (catalog, model) => unique((catalog?.voices || [])
    .filter(voice => !voice.model || voice.model === model).map(voice => voice.id));

export async function discoverSpeechCatalog(endpoint, request = fetch, signal) {
    const [modelsUrl, voicesUrl, alternateVoicesUrl, studioUrl] = speechCatalogUrls(endpoint);
    const read = async url => {
        const response = await request(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return entries(await response.json());
    };
    const [models, voices, studio] = await Promise.allSettled([
        read(modelsUrl),
        read(voicesUrl).catch(() => read(alternateVoicesUrl)),
        request(studioUrl, { signal }).then(response => response.ok ? response.json() : null),
    ]);
    return {
        models: models.status === 'fulfilled' ? unique(models.value.map(id)) : [],
        voices: voices.status === 'fulfilled' ? voices.value.filter(entry => id(entry)).map(entry => ({
            id: String(id(entry)), model: typeof entry?.model === 'string' ? entry.model : '',
        })) : [],
        profileModels: studio.status === 'fulfilled' && Array.isArray(studio.value?.profiles)
            ? unique(studio.value.profiles.map(profile => profile.id)) : null,
        designModels: studio.status === 'fulfilled' && Array.isArray(studio.value?.profiles)
            ? unique(studio.value.profiles.filter(profile => profile.design_model).map(profile => profile.id)) : null,
        modelError: models.status === 'rejected' ? models.reason : null,
        voiceError: voices.status === 'rejected' ? voices.reason : null,
    };
}
