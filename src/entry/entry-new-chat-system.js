import { getContext } from '../../../../../st-context.js';
import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../../../popup.js';
import { getSettings, saveSettings, defaultSettings } from '../core/settings.js';
import { createBuiltinSystem } from '../core/builtin-systems.js';
import { setActiveSystem, importSystemPreset } from '../tracker/status-system-presets.js';
import { buildNewChatSystemChooser } from '../ui/system/ui-new-chat-system.js';
import { updateAllExtensionThemes, updateExtensionTheme } from '../ui/shared/ui-shared.js';
import { refreshMemoryButton } from '../ui/tracker/ui-memory-button.js';
import { triggerReprocess } from '../chat/chat.js';

/** Called only by host creation events, never by reopening an existing chat. */
export function createNewChatSystemOffer({ getContext, getSettings, saveSettings, choose,
    importStarter, activate, refresh }) {
    const offered = new WeakSet();
    return async function offer() {
        const context = getContext();
        const metadata = context?.chatMetadata;
        const chatId = context?.getCurrentChatId?.();
        const settings = getSettings();
        const started = () => getContext()?.chat?.some(message => message?.is_user && !message?.is_system);
        if (!settings.enabled || !metadata || chatId === undefined || started() || offered.has(metadata)) return;
        offered.add(metadata);
        const ownerSystem = settings.activeSystem;
        const current = () => getSettings().enabled && getContext()?.chatMetadata === metadata
            && getContext()?.getCurrentChatId?.() === chatId && !started()
            && getSettings().activeSystem === ownerSystem;
        const saved = settings.newChatSystem;
        const result = saved && Object.hasOwn(settings.statusTracker.presets, saved)
            ? { selection: { key: saved }, reuse: true } : await choose(settings);
        if (!current() || !result) return;
        const selection = result.selection;
        if (!selection) return;
        let key = selection.key;
        if (selection.starter) key = importStarter(selection.id);
        if (!key || !Object.hasOwn(getSettings().statusTracker.presets, key)) return;
        if (key !== ownerSystem && !activate(key)) return;
        // Remember the created copy, so reuse never adds another starter copy.
        getSettings().newChatSystem = result.reuse ? key : '';
        saveSettings();
        refresh();
    };
}

let activePopup;
export function cancelNewChatSystemOffer() {
    return activePopup?.complete(POPUP_RESULT.CANCELLED);
}

export const offerNewChatSystem = createNewChatSystemOffer({
    getContext, getSettings, saveSettings,
    choose: async settings => {
        const view = buildNewChatSystemChooser(settings);
        const popup = new Popup(view.element, POPUP_TYPE.CONFIRM, '', {
            okButton: 'Use System', cancelButton: 'Keep current',
            onOpen: popup => updateExtensionTheme(view.element, popup),
        });
        activePopup = popup;
        try {
            const result = await popup.show();
            return result === POPUP_RESULT.AFFIRMATIVE
                ? { selection: view.selection(), reuse: view.reuse() } : null;
        } finally {
            if (activePopup === popup) activePopup = null;
        }
    },
    importStarter: id => {
        const definition = createBuiltinSystem(id);
        if (!definition) return null;
        return importSystemPreset(JSON.stringify({ definition,
            metadata: { name: definition.name, ...definition.metadata }, config: defaultSettings,
        })).metadata.name;
    },
    activate: setActiveSystem,
    refresh: () => {
        updateAllExtensionThemes();
        refreshMemoryButton();
        triggerReprocess();
    },
});
