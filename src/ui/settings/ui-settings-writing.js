import { getSettings } from '../../core/settings.js';
import { buildSettingToggle, buildSettingTextArea, buildSettingNumber } from '../shared/ui-shared.js';
import { npcCreationService } from '../../npc/npc-tool.js';
import { DEFAULT_DIALOGUE_TEMPLATE, parseDialogueTemplate } from '../../chat/dialogue-template.js';
import { applyDialogueFormatPrompt } from '../../prompts/dialogue-format.js';

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

    const formatField = buildSettingTextArea({
        key: 'dialogueRecognitionFormat',
        label: 'Recognized Dialogue Format',
        rows: 2,
        builtIn: DEFAULT_DIALOGUE_TEMPLATE,
        help: 'Use {name} for the speaker and {dialogue} for their words, once each on one line. '
            + 'Examples: {name}: "{dialogue}", [{name}]: "{dialogue}", or {name} — {dialogue}. '
            + 'Match the visible text after Markdown formatting. Without quotation marks, the entire rest of the line is spoken. '
            + 'Leave empty to restore the default. This also sets the model’s format reminder below.',
    });
    const formatInput = formatField.querySelector('textarea');
    const formatError = document.createElement('p');
    formatError.className = 'notes';
    formatError.setAttribute('role', 'status');
    const validateFormat = () => {
        const valid = !formatInput.value.trim() || parseDialogueTemplate(formatInput.value);
        formatInput.setAttribute('aria-invalid', String(!valid));
        formatError.textContent = valid ? '' : 'Use one {name}, a separator, then one {dialogue}, all on one line. The default format is used until this is valid.';
    };
    formatInput.addEventListener('input', () => {
        validateFormat();
        applyDialogueFormatPrompt();
        reprocess();
    });
    formatField.append(formatError);
    view.append(formatField);
    formatInput.setAttribute('aria-label', 'Recognized Dialogue Format');
    validateFormat();

    view.append(buildSettingToggle({
        key: 'dialogueFormatEnabled',
        label: 'Ask The Model To Format Dialogue',
        help: 'Asks for each spoken line in the recognized format above, used for avatars, speech blocks, colours and voices, including speakers without cards. Disable this if your preset already supplies formatting instructions.',
        onChange: () => { applyDialogueFormatPrompt(); rerender(); },
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

    const historyHeading = document.createElement('h4');
    historyHeading.className = 'sillynpc-subsection-title';
    historyHeading.textContent = 'Narrator History';
    view.append(historyHeading);
    view.append(buildSettingToggle({
        key: 'narratorHistoryLimitEnabled',
        label: 'History Trimming',
        help: 'Limit recent chat history sent to the narrator. When the limit is reached, remove older turns from its next prompt in one batch. Older messages remain in your chat and available to Castward memory readings. Leave disabled if another extension manages your context. These limits cover chat history; allow room for other prompts and the reply in your model context.',
        onChange: rerender,
    }));
    if (getSettings().narratorHistoryLimitEnabled) {
        view.append(buildSettingNumber({
            key: 'narratorHistoryMinTokens', label: 'History After Trimming', suffix: 'tokens',
            min: 100, help: 'After the limit is reached, keep roughly this many tokens of recent chat history. Complete player turns stay together.',
        }));
        view.append(buildSettingNumber({
            key: 'narratorHistoryMaxTokens', label: 'History Limit', suffix: 'tokens',
            min: 200, help: 'Trim when visible chat history reaches this size. Keep this above History After Trimming.',
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
        help: 'Speaker labels in the recognized dialogue format that are not people. One per line or '
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
