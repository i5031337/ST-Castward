import { buildSettingSelect, buildSettingToggle, buildSettingNumber } from '../shared/ui-shared.js';
import { world_names } from '../../../../../../world-info.js';
import { buildConnectionProfilePicker } from './ui-connection-profiles.js';
import { buildLastLoreConnectionNote, updateExcerptReadout, buildWorldInfoScannerSettings } from './ui-settings-generation-helpers.js';
import { renderImageGenerationSettings } from './ui-settings-generation-image.js';
import { getSettings } from '../../core/settings.js';
import { buildMemoryControls } from '../system/ui-system-memories.js';

export function renderImageSettingsView(view) {
    if (!view) return;
    view.replaceChildren();
    renderImageGenerationSettings(view, () => renderImageSettingsView(view));
}

export function renderProfileSettingsView(view, openProfileFields) {
    if (!view) return;
    view.replaceChildren();
    const title = document.createElement('h3');
    title.className = 'sillynpc-section-title';
    title.textContent = 'Profiles';
    view.appendChild(title);

    view.append(buildSettingToggle({
        key: 'statusTracker.autoGenerateNpcProfiles',
        label: 'Generate Profiles For New NPCs',
        help: 'When the tracker reader identifies an NPC without a character card, creates a '
            + 'card in this chat and writes its configured profile fields to lore. '
            + 'Works with separate-pass and manual tracker readings. Uses the Profile Connection '
            + 'and context settings below, with one extra request per new NPC. Unsupported '
            + 'details may stay blank. Existing cards are left as they are.',
    }));
    view.append(buildSettingToggle({
        key: 'autoPortraitOnFill', label: 'Draw Portrait Automatically',
        help: 'Draw and assign a missing portrait after empty-card Fill or Generate Profiles For New NPCs. '
            + 'Uses profile fields selected for image prompts with SillyTavern Image Generation, '
            + 'which may be billed separately. Configure portrait appearance and image services under Images.',
    }));

    view.append(buildConnectionProfilePicker(null, {
        key: 'loreProfileId',
        scope: 'root',
        labelText: 'Profile Connection',
        fallbackLabel: 'Main API (same as chat)',
        noteText: 'Which connection fills profiles and creates NPCs for the narrator. Separate from the tracker\'s: a '
            + 'small model chosen for returning JSON is not the one you want writing prose.',
        unavailableText: 'Connection Manager is not available, so profiles are written by your '
            + 'main API. Enable the Connection Manager extension to choose another model.',
    }));
    view.append(buildLastLoreConnectionNote());
    view.append(buildSettingSelect({
        key: 'contextMessages',
        label: 'Chat To Read',
        options: [
            { value: 5, label: 'Last 5 messages' },
            { value: 10, label: 'Last 10 messages' },
            { value: 15, label: 'Last 15 messages' },
            { value: 30, label: 'Last 30 messages' },
            { value: 50, label: 'Last 50 messages' },
            { value: 100, label: 'Last 100 messages' },
            { value: 200, label: 'Last 200 messages' },
            { value: 0, label: 'Whole chat' },
        ],
        help: 'How much of the story the profile writer sees. Whichever you pick, the excerpt '
            + 'is capped below - whole messages, newest first - so a long story is trimmed '
            + 'rather than making a request no model can take.',
    }));
    const excerptReadout = document.createElement('small');
    excerptReadout.className = 'notes';
    excerptReadout.style.cssText = 'display:block; margin:-2px 0 10px;';
    view.append(buildSettingNumber({
        key: 'loreCharBudget',
        advanced: true,
        label: 'Story Excerpt',
        suffix: 'characters',
        help: 'How much of the story is copied into the lore prompt, counted in characters - '
            + 'roughly four per token. Whole messages, newest first, until the next one will '
            + 'not fit. This is a single request and cannot be split into passes the way the '
            + 'history scan is, so the figure below is what one lore generation costs.',
        onChange: () => updateExcerptReadout(excerptReadout),
    }));
    updateExcerptReadout(excerptReadout);
    view.append(excerptReadout);
    view.append(buildSettingToggle({
        key: 'loreUseDataBank',
        label: 'Search the Data Bank',
        help: 'Look the character up in your Data Bank before writing, and give the writer '
            + 'what it finds. Needs SillyTavern\'s Vector Storage with Data Bank files '
            + 'enabled; its own chunk-count setting decides how much comes back. Searched '
            + 'by name. SillyTavern skips vectors for background requests like this one, '
            + 'so without this the writer never sees your Data Bank at all.',
    }));
    view.append(buildSettingNumber({ key: 'loreMaxTokens', advanced: true, label: 'Profile Reply Budget',
        suffix: 'tokens', step: 256, help: 'Maximum tokens the profile writer may reply with.' }));

    const settings = getSettings();
    const name = settings.statusTracker.presets?.[settings.activeSystem]?.metadata?.name || settings.activeSystem;
    if (openProfileFields) {
        const editFields = document.createElement('button');
        editFields.type = 'button';
        editFields.className = 'menu_button sillynpc-edit-profile-fields';
        editFields.textContent = 'Edit this System’s profile fields';
        editFields.addEventListener('click', openProfileFields);
        view.append(editFields);
    }
    const memories = document.createElement('details');
    memories.className = 'sillynpc-customize';
    memories.dataset.setting = 'system.memories';
    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.className = 'sillynpc-setting-label';
    label.textContent = name ? `NPC memories — ${name}` : 'NPC memories';
    summary.append(label);
    const note = document.createElement('p');
    note.className = 'notes';
    note.textContent = 'Memory settings apply to this System.';
    memories.append(summary, note, buildMemoryControls());
    view.append(memories);

    const lorebooks = document.createElement('details');
    lorebooks.className = 'sillynpc-customize';
    const linking = document.createElement('summary');
    linking.textContent = 'Lorebook linking';
    lorebooks.append(linking, buildWorldInfoScannerSettings(), buildSettingSelect({
        key: 'defaultLorebook', label: 'Default Target Lorebook',
        options: [{ value: '', label: '-- current --' }, ...(Array.isArray(world_names) ? world_names : []).map(w => ({ value: w, label: w }))],
    }));
    view.append(lorebooks);
}
