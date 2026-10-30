import { getSettings } from '../../core/settings.js';
import { buildSettingToggle, buildSettingTextArea, buildSettingNumber } from '../shared/ui-shared.js';
import { npcCreationService } from '../../npc/npc-tool.js';

export function renderWritingRulesView(view, onReprocessMessages) {
    if (!view) return;

    view.replaceChildren();
    const reprocess = () => onReprocessMessages();
    const rerender = () => renderWritingRulesView(view, onReprocessMessages);

    const title = document.createElement('h3');
    title.className = 'sillynpc-section-title';
    title.textContent = 'Dialogue And Speaker Recognition';
    view.appendChild(title);

    const intro = document.createElement('p');
    intro.className = 'notes sillynpc-tab-intro';
    intro.textContent = 'Set up NPC creation, dialogue formatting, and speaker recognition.';
    view.appendChild(intro);

    view.append(buildSettingToggle({
        key: 'npcCreationToolEnabled',
        label: 'Let The Narrator Create NPCs',
        help: 'Offers a Create NPC tool before a new supporting character enters the story. '
            + 'Generates a profile, stats and appropriate starting belongings and abilities, then chooses a fresh name with randomized naming hints. '
            + 'An optional exact name preserves a previously mentioned or canon character; matching cards are reused. '
            + 'The narrator selects the character type when your System has multiple NPC templates. '
            + 'Requires a lorebook and a Chat Completion model with SillyTavern function calling enabled. '
            + 'Uses the Profile Connection and Profile Reply Budget under Profiles; each creation makes one generation request, with one repair if needed. '
            + 'Cards belong to this chat and remain available across swipes and regeneration. '
            + 'Uses your System’s collection guidance for starting entries; named NPCs keep already tracked stats and belongings. Missing portraits follow the automatic Fill portrait setting.',
        onChange: () => npcCreationService.invalidate(),
    }));

    const formatHeading = document.createElement('h4');
    formatHeading.className = 'sillynpc-subsection-title';
    formatHeading.textContent = 'Dialogue Formatting';
    view.append(formatHeading);

    view.append(buildSettingToggle({
        key: 'dialogueFormatEnabled',
        label: 'Ask The Model To Format Dialogue',
        help: 'Asks for each spoken line as Speaker: "dialogue". This is the format used '
            + 'for avatars, speech blocks and colours, including speakers without cards.',
        onChange: rerender,
    }));
    if (getSettings().dialogueFormatEnabled) {
        view.append(buildSettingNumber({
            key: 'dialogueFormatDepth',
            advanced: true,
            label: 'Format Reminder Depth',
            suffix: 'messages back',
            help: 'How far back from the newest message the built-in format is inserted. 0 '
                + 'puts it after the newest one, so it is the last thing the model reads '
                + 'before answering - which is where a layout rule holds best, and why it '
                + 'is the default. Raise it only if it crowds something you would rather '
                + 'have last.',
        }));
    }

    const readingHeading = document.createElement('h3');
    readingHeading.className = 'sillynpc-section-title';
    readingHeading.style.marginTop = '24px';
    readingHeading.textContent = 'Speaker Recognition';
    view.append(readingHeading);

    const readingNote = document.createElement('p');
    readingNote.className = 'notes sillynpc-tab-intro';
    readingNote.textContent = 'Choose which labels and names are recognized as speakers.';
    view.append(readingNote);

    view.append(buildSettingTextArea({
        key: 'speakerIgnoreList',
        label: 'Not Speakers',
        help: 'Labels in a Name: "dialogue" line that are not people. One per line or '
            + 'separated by commas. Everything you '
            + 'named in System Builder is already excluded, so stats and collections need '
            + 'no entry here. A character who has a card is never ignored.',
        onChange: reprocess,
    }));
    view.append(buildSettingToggle({
        key: 'caseInsensitive',
        label: 'Lenient Name Matching',
        help: 'Matches character names regardless of uppercase/lowercase letters.',
        onChange: reprocess,
    }));
}
