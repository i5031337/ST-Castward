import { getContext } from '../../../../../../st-context.js';
import { Popup } from '../../../../../../popup.js';
import { getSettings, saveSettings } from '../../core/settings.js';
import { npcRoster, setNpcRosterEnabled, setNpcRosterOption } from '../../characters/system-npc-roster.js';
import { clearRosterState } from '../../characters/system-roster-state.js';
import { restoreNpcRoster } from '../../characters/system-npc-roster-runtime.js';
import { triggerReprocess } from '../../chat/reprocess.js';
import { escapeHtml } from '../../core/utils.js';

/** Local starting-cast preferences remain separate from exportable System rules. */
export function buildSystemReuseControls(name, onRefresh) {
    const settings = getSettings();
    const displayName = settings.statusTracker.presets?.[name]?.metadata?.name || name;
    const roster = npcRoster(settings, name);
    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-system-reuse';
    const refresh = () => {
        if (name === settings.activeSystem) restoreNpcRoster();
        saveSettings();
        onRefresh();
        triggerReprocess();
    };
    const checkbox = (text, checked, title, change, disabled = false) => {
        const label = document.createElement('label');
        label.title = title;
        const input = document.createElement('input');
        input.type = 'checkbox'; input.checked = checked; input.disabled = disabled;
        input.setAttribute('aria-label', `${text} with ${displayName}`);
        input.addEventListener('change', () => { change(input.checked); refresh(); });
        label.append(input, document.createTextNode(text));
        wrap.append(label);
    };
    checkbox('Reuse NPCs', roster?.enabled === true,
        'Save NPC creations and edits for future chats. Each new chat owns its copies. Adventure stats and inventory reset. Linked lorebook entries remain shared references. Local reuse settings and saved data stay out of System rules exports.',
        enabled => setNpcRosterEnabled(settings, getContext(), name, enabled));
    checkbox('Reuse Places', roster?.reusePlaces === true,
        'Save known Places, descriptions, aliases, parent relationships and lore references for new chats. The current location resets. Works independently of NPC reuse.',
        enabled => setNpcRosterOption(settings, getContext(), name, 'reusePlaces', enabled));
    const places = Object.keys(roster?.places || {}).length;
    if (roster?.enabled || roster?.reusePlaces || roster?.cards?.length || places) {
        const note = document.createElement('small');
        note.className = 'sillynpc-system-reuse-note';
        note.textContent = `${roster.cards?.length || 0} NPCs, ${places} places saved.`;
        note.title = 'New chats receive independent copies.';
        const clear = document.createElement('button');
        clear.type = 'button'; clear.className = 'menu_button'; clear.textContent = 'Clear roster';
        clear.title = 'Clear saved NPCs, places and NPC memories for this System.';
        clear.disabled = !roster.cards?.length && !places && !Object.keys(roster.memories || {}).length;
        clear.addEventListener('click', async () => {
            if (!await Popup.show.confirm('Clear saved roster',
                `Clear saved NPCs, Places and NPC memories for "${escapeHtml(displayName)}"? Existing chat data stays in its chats. Later creations and edits can populate the saved data again while carryover is enabled.`)) return;
            roster.cards = [];
            clearRosterState(roster);
            saveSettings();
            onRefresh();
        });
        wrap.append(clear, note);
    }
    return wrap;
}
