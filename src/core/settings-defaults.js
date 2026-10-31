import { defaultTrackerSettings } from './settings-tracker-defaults.js';
import { EXTENSION_VERSION, DEFAULT_PORTRAIT_SHAPE } from './constants.js';
import { defaultTtsSettings } from '../tts/tts-settings.js';
export const DEFAULT_IMAGE_NEGATIVE_PROMPT = 'speech bubbles, text, logo, watermark, username, signature, frames, panels, comic, multiple characters, crowd, busy background, character sheet, grid, reference sheet';

export const defaultSettings = {
    version: EXTENSION_VERSION,
    enabled: true,
    tts: defaultTtsSettings,
    applyColors: true,
    /** Independent font multipliers for menus/sheets and the in-chat tracker. */
    menuFontScale: 1.0,
    trackerFontScale: 1.0,
    menuStyle: 'default',
    themeOverrides: {},
    dividerStyle: 'subtle',
    avatarShape: 'rounded',
    avatarSize: 'medium',
    colorStyle: 'text',
    /** Active System name; empty means none. */
    activeSystem: '',
    /** Skip the chooser and let new chats adopt the active System. */
    useActiveSystemForNewChats: false,
    /** Local opt-in reusable NPC rosters, keyed by System name. */
    systemNpcRosters: {},
    /** Add speaker-line formatting instructions to the story prompt. */
    dialogueFormatEnabled: true,
    /** Let the narrator commission structured, chat-owned NPCs before introducing them. */
    npcCreationToolEnabled: true,
    /** 0 puts it after the newest message - the last thing read before answering. */
    dialogueFormatDepth: 0,
    /** Colour a speaker who has no card, from their name. */
    autoColorUnknownSpeakers: true,
    /** Draw a missing portrait after empty-card Fill or reader-generated NPC profiles. */
    autoPortraitOnFill: true,
    /** Skip the generation request notice after the user opts out. */
    generationNoticeDismissed: false,
    /** Draw a linked landscape image when the reader saves a new Place. */
    autoPlaceBackgrounds: false,
    autoGenerateNpcExpressions: false,
    npcExpressionsPerMessage: false,
    npcExpressionsRefreshOnImagePrompt: false,
    npcExpressionWorkflow: '',
    npcExpressionIpAdapterMode: false,
    showPresentNpcSprites: false,
    hideSpeakerNames: false,
    caseInsensitive: true,
    /** Fallback portraits; tags match speaker names. @type {Array<{ src: string, tags: string[] }>} */
    defaultImages: [],
    /** Messages of absence before a speaker starts a new fallback portrait run. */
    defaultPortraitRunGap: 12,
    /** Show advanced settings. */
    devMode: false,
    popupWidth: 80,
    popupHeight: 80,
    /** @type {'contain' | 'cover'} */
    defaultImageFit: 'contain',
    /** Crop position for portraits drawn with cover. @type {'top' | 'center' | 'bottom'} */
    portraitFraming: 'top',
    /** Vertical speech-block padding in pixels. */
    speechPadY: 6,
    /** @type {string[]} */
    scanLorebooks: [],
    /** Create a chat-bound book when profiles or memories have no selected target. */
    autoCreateLorebook: true,
    /** @type {string} */
    defaultLorebook: '',
    contextMessages: 15,
    /** Maximum story characters sent to lore generation, taking the newest messages first. */
    loreCharBudget: 40000,
    /** Allow explicit Data Bank retrieval; requires Vector Storage file indexing. */
    loreUseDataBank: false,
    /** Lore connection profile; empty uses the main API. */
    loreProfileId: '',
    /** Log resolved connections for lore, extraction, and portrait requests. */
    debugLogging: false,
    /** Reply token budget for lore generation. */
    loreMaxTokens: 2048,
    /** Composition instructions placed before the character's image description. Empty disables. */
    imgGenPromptPrefix: 'Solo, portrait',
    /** Folder name under user/images/ for generated portraits. */
    imageSaveRoute: 'sillynpc',
    /** Portrait shape from PORTRAIT_SHAPES; fixed shapes override host resolution. */
    portraitShape: DEFAULT_PORTRAIT_SHAPE,
    personaData: {},
    master_items: {},
    /**
     * @type {{
     *   id: string,
     *   name: string,
     *   imageUrl: string,
     *   color: string,
     *   category: string,
     *   imageFit: '' | 'contain' | 'cover',
     *   aliases: { pattern: string, isRegex: boolean }[],
     *   lorebook: { world: string, uid: number } | null,
     * }[]}
     */
    characters: [],
    /** Ordered category registry, including categories with no members. @type {string[]} */
    categories: [],
    /** One-hop category rename aliases used when opening scoped chats. @type {Record<string, string>} */
    categoryRenames: {},
    statusTracker: defaultTrackerSettings,
};
