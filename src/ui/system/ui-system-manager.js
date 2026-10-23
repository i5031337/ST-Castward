import { buildSystemGeneration } from './ui-system-generation.js';
import { buildSystemDetailActions, buildSystemDetailFields } from './ui-system-details.js';
import { getSettings, defaultSettings } from '../../core/settings.js';
import { buildSystemReuseControls } from './ui-system-reuse.js';
import { offerDownload } from '../../core/utils.js';
import { updateAllExtensionThemes } from '../shared/ui-shared.js';
import { deleteSystemPreset, importSystemPreset, getActiveSystem, getChatSystem, chatHasStarted, setActiveSystem, createSystem } from '../../tracker/status-logic.js';
import { Popup } from '../../../../../../popup.js';
import { triggerReprocess } from '../../chat/chat.js';
import { escapeHtml } from '../../core/utils.js';
import { openItemLibrary } from '../collections/ui-item-library.js';
import { exportWorldCharacters } from '../../characters/world-character-export.js';
import { carriesNpcStat } from '../../tracker/stat-persistence.js';
import { normalizeSystemDefinition } from '../../core/system-schema.js';
import { builtinSystemChoices, createBuiltinSystem } from '../../core/builtin-systems.js';
import { refreshMemoryButton } from '../tracker/ui-memory-button.js';

/**
 * System Manager: importing, exporting, and switching reusable Systems.
 *
 * Split out of status-settings.js. What a System is made of is System Builder's job.
 */

function exportSystem(name) {
    const settings = getSettings();
    const profile = settings.statusTracker.presets?.[name];
    if (!profile) return;
    
    offerDownload(profile.definition || normalizeSystemDefinition(profile, { name }),
        `${(profile.metadata?.name || name).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_system.json`);
}

export function buildSystemManager(onRefresh) {
    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-system-manager';
    const settings = getSettings();
    const presets = settings.statusTracker.presets || {};
    const presetNames = Object.keys(presets);
    const chatSystem = chatHasStarted() ? (getChatSystem() || getActiveSystem()) : null;

    const listWrap = document.createElement('div');
    listWrap.className = 'sillynpc-system-list';

    if (presetNames.length === 0) {
        listWrap.innerHTML = `<div style="padding:15px; text-align:center; opacity:0.5;">No systems in library.</div>`;
    } else {
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        
        presetNames.forEach(name => {
            const profile = presets[name];
            const displayName = profile.metadata?.name || name;
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.style.padding = '8px';
            nameCell.append(buildSystemDetailFields(name));
            const reuseControls = buildSystemReuseControls(name, onRefresh);
            
            const actionsCell = document.createElement('td');
            actionsCell.className = 'sillynpc-system-actions-cell';
            
            // Which system you are in used to be unknowable: the library listed four and
            // marked none. The radio both shows it and is how you change it.
            const activeCell = document.createElement('td');
            activeCell.style.cssText = 'padding:8px; width:1%;';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'sillynpc-active-system';
            radio.checked = name === getActiveSystem();
            radio.disabled = Boolean(chatSystem && chatSystem !== name);
            radio.title = radio.disabled ? `This chat belongs to "${presets[chatSystem]?.metadata?.name || chatSystem}"`
                : radio.checked ? 'In use' : `Switch to "${displayName}"`;
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                // Save the active rules before selecting another System.
                if (!setActiveSystem(name)) {
                    onRefresh();
                    return;
                }
                updateAllExtensionThemes();
                refreshMemoryButton();
                onRefresh();
                triggerReprocess();
            });
            activeCell.append(radio);

            const expBtn = document.createElement('button');
            expBtn.className = 'menu_button';
            expBtn.title = 'Export this System’s rules to a JSON file for backup or sharing.';
            expBtn.setAttribute('aria-label', 'Export System');
            expBtn.innerHTML = '<i class="fa-solid fa-file-export" aria-hidden="true"></i>';
            expBtn.addEventListener('click', () => exportSystem(name));

            const charsBtn = document.createElement('button');
            charsBtn.className = 'menu_button';
            charsBtn.textContent = 'Export roster';
            charsBtn.title = 'Export reusable cards and NPCs in every chat assigned to this System.';
            charsBtn.addEventListener('click', async () => {
                const displayName = presets[name]?.metadata?.name || name;
                charsBtn.disabled = true;
                try {
                    const payload = await exportWorldCharacters(name);
                    if (!payload.characters.length) {
                        toastr.info(`No characters found for "${displayName}".`, 'Castward');
                        return;
                    }
                    const defs = name === getActiveSystem()
                        ? getSettings().statusTracker.npcStats
                        : (profile.config?.statusTracker?.npcStats || profile.config?.npcStats || []);
                    const innate = (defs || []).filter(carriesNpcStat)
                        .map(stat => stat.name);
                    const confirmed = await Popup.show.confirm('Export World Characters',
                        `${payload.characters.length} characters from reusable cards and assigned chats. `
                        + `Carryover fields carried: ${innate.join(', ') || 'none'}. `
                        + 'Portraits, expressions, collections, memories, profile, and lore are included. '
                        + 'Other stats reset to destination defaults. Export this file?');
                    if (!confirmed) return;
                    offerDownload(payload,
                        `${displayName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_characters.json`);
                    toastr.success(`Exported ${payload.characters.length} characters.`, 'Castward');
                } catch (err) {
                    toastr.error(String(err?.message || err), 'Castward');
                } finally {
                    charsBtn.disabled = false;
                }
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'menu_button';
            delBtn.title = 'Delete this System and its saved carryover roster from the library. Switch to another System first if this one is selected.';
            delBtn.setAttribute('aria-label', 'Delete System');
            delBtn.style.color = 'var(--red)';
            delBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
            delBtn.addEventListener('click', async () => {
                const displayName = presets[name]?.metadata?.name || name;
                // The active configuration still needs its System.
                if (name === getActiveSystem()) {
                    toastr.info('Switch to another system before deleting this one.', 'Castward');
                    return;
                }
                if (await Popup.show.confirm('Delete system', `Delete the saved system "${escapeHtml(displayName)}"?`)) {
                    deleteSystemPreset(name);
                    onRefresh();
                }
            });

            const tools = document.createElement('div');
            tools.className = 'sillynpc-system-tools';
            tools.append(buildSystemDetailActions(name, onRefresh), expBtn, delBtn);
            reuseControls.insertBefore(charsBtn, reuseControls.querySelector('button'));
            actionsCell.append(tools);
            row.append(activeCell, nameCell, actionsCell);
            const reuseRow = document.createElement('tr');
            reuseRow.style.borderBottom = '1px solid var(--sillynpc-border)';
            const reuseCell = document.createElement('td');
            reuseCell.colSpan = 3;
            reuseCell.className = 'sillynpc-system-reuse-cell';
            reuseCell.append(reuseControls);
            reuseRow.append(reuseCell);
            table.append(row, reuseRow);
        });
        listWrap.appendChild(table);
    }

    // Global Actions
    const globalActions = document.createElement('div');
    globalActions.style.display = 'flex';
    globalActions.style.gap = '10px';
    globalActions.style.flexWrap = 'wrap';

    // "Save current as new" asked you to remember to do it, and every new ruleset began
    // as a copy of the last one. Switching now captures on the way out, so this is only
    // about starting something genuinely new.
    const newBtn = document.createElement('button');
    newBtn.className = 'menu_button';
    newBtn.style.flex = '1';
    newBtn.innerHTML = '<i class="fa-solid fa-plus"></i> New System';
    newBtn.disabled = Boolean(chatSystem);
    newBtn.title = chatSystem ? 'Open a new chat before choosing a different System.'
        : 'Start a new System from the defaults.';
    newBtn.addEventListener('click', async () => {
        const name = (await Popup.show.input('New system', 'Name for this system:'))?.trim();
        if (!name) return;
        if (!createSystem(name)) {
            toastr.error(`A system called "${name}" already exists.`, 'Castward');
            return;
        }
        updateAllExtensionThemes();
        refreshMemoryButton();
        onRefresh();
        triggerReprocess();
    });

    const starterSelect = document.createElement('select');
    starterSelect.className = 'text_pole';
    starterSelect.setAttribute('aria-label', 'Starter System');
    starterSelect.title = 'Choose an editable System to start from.';
    for (const choice of builtinSystemChoices) {
        const option = document.createElement('option');
        option.value = choice.id;
        option.textContent = choice.name;
        option.title = choice.description;
        starterSelect.append(option);
    }

    const starterBtn = document.createElement('button');
    starterBtn.type = 'button';
    starterBtn.className = 'menu_button';
    starterBtn.textContent = 'Start from template';
    starterBtn.disabled = Boolean(chatSystem);
    starterBtn.title = chatSystem ? 'Open a new chat before choosing a different System.'
        : 'Add a fresh, editable copy of the selected System and use it in this chat.';
    starterBtn.addEventListener('click', () => {
        const definition = createBuiltinSystem(starterSelect.value);
        if (!definition) return;
        const profile = importSystemPreset(JSON.stringify({
            metadata: { name: definition.name, ...definition.metadata },
            definition,
            config: defaultSettings,
        }));
        if (!setActiveSystem(profile.metadata.name)) {
            toastr.error('Could not activate the starter System.', 'Castward');
            onRefresh();
            return;
        }
        updateAllExtensionThemes();
        refreshMemoryButton();
        onRefresh();
        triggerReprocess();
    });

    const importBtn = document.createElement('button');
    importBtn.className = 'menu_button';
    importBtn.style.flex = '1';
    importBtn.innerHTML = '<i class="fa-solid fa-file-import"></i> Import JSON';
    importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const text = await file.text();
                    importSystemPreset(text);
                    refreshMemoryButton();
                    onRefresh();
                } catch (err) {
                    toastr.error(`Failed to import system: ${err.message}`, 'Castward');
                }
            }
        };
        input.click();
    });

    const libraryBtn = document.createElement('button');
    libraryBtn.className = 'menu_button';
    libraryBtn.style.flex = '1';
    libraryBtn.innerHTML = '<i class="fa-solid fa-book"></i> Entry Library';
    libraryBtn.title = 'View and clean up what the extension remembers between chats - items, skills, spells, whatever your collections hold';
    libraryBtn.addEventListener('click', () => openItemLibrary());

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button'; generateBtn.className = 'menu_button';
    generateBtn.textContent = 'Generate from premise';
    generateBtn.addEventListener('click', () => {
        if (wrap.querySelector('.sillynpc-system-generation')) return;
        wrap.append(buildSystemGeneration(name => {
            toastr.success(`Saved “${name}” as a new System.`, 'Castward');
            refreshMemoryButton();
            onRefresh();
        }));
    });
    globalActions.append(newBtn, starterSelect, starterBtn, generateBtn, importBtn, libraryBtn);
    wrap.append(listWrap, globalActions);
    return wrap;
}
