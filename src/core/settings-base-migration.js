import { PORTRAIT_SHAPES, DEFAULT_PORTRAIT_SHAPE } from './constants.js';
import { defaultSettings } from './settings-defaults.js';
import { resolveImageFolder } from './utils.js';
import { saveSettings } from './settings.js';

export function normaliseBaseSettings(settings) {
    // Retire the old opt-in flag; autoPortraitOnFill defaults to enabled.
    delete settings.autoFillPortrait;
    // Rename before defaults fill portraitShape; unsupported ratios use the default.
    if (settings.geminiImageAspectRatio !== undefined) {
        if (settings.portraitShape === undefined
            && Object.hasOwn(PORTRAIT_SHAPES, settings.geminiImageAspectRatio)) {
            settings.portraitShape = settings.geminiImageAspectRatio;
        }
        delete settings.geminiImageAspectRatio;
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = structuredClone(value);
        }
    }

    for (const key of ['dialogueFormatPrompt', 'narratorRulesPrompt', 'generationPrompt',
        'imgGenPrompt', 'imgGenNegativePrompt', 'imgGenContextMessages', 'promptTexts',
        'banListEnabled', 'banList', 'banScanDepth', 'usage']) delete settings[key];
    for (const key of ['extractionPrompt', 'systemRules']) delete settings.statusTracker[key];
    // Old exports may contain the removed direct Gemini backend settings.
    for (const key of ['imageBackend', 'geminiImageModel', 'imageProfileId', 'imgGenReferencePreamble']) {
        delete settings[key];
    }

    if (typeof settings.imgGenPromptPrefix !== 'string') {
        settings.imgGenPromptPrefix = defaultSettings.imgGenPromptPrefix;
    }

    if (!Object.hasOwn(PORTRAIT_SHAPES, settings.portraitShape)) {
        settings.portraitShape = DEFAULT_PORTRAIT_SHAPE;
    }

    // Free-entry limits may be blank, nonnumeric, or zero.
    for (const key of ['loreCharBudget', 'loreMaxTokens']) {
        const value = Number(settings[key]);
        if (!Number.isFinite(value) || value <= 0) settings[key] = defaultSettings[key];
        else settings[key] = Math.floor(value);
    }
    if (typeof settings.popupWidth !== 'number' || settings.popupWidth < 20) settings.popupWidth = 80;
    if (typeof settings.popupHeight !== 'number' || settings.popupHeight < 20) settings.popupHeight = 80;

    if (settings.keywords) {
        delete settings.keywords;
        saveSettings();
    }
    
    // Store the same folder segment the upload endpoint uses.
    settings.imageSaveRoute = resolveImageFolder(settings.imageSaveRoute);

}
