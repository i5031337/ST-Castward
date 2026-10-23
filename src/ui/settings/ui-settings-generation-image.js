import { buildSettingSelect, buildSettingTextArea, buildSettingToggle } from '../shared/ui-shared.js';
import { PORTRAIT_SHAPES } from '../../core/constants.js';
import { buildBackendDestinationNote } from './ui-settings-generation-helpers.js';
import { renderImageStorageSettings } from './ui-settings-generation-storage.js';
import { resetNpcExpressions } from '../../expressions/npc-expressions.js';
import { buildExpressionWorkflowSetting } from './ui-expression-workflow.js';
import { refreshSceneSprites } from '../../expressions/scene-sprites.js';
import { clearSpeechSprite } from '../../expressions/speech-sprite.js';

export function renderImageGenerationSettings(view, rerender) {
    const title = document.createElement('h3');
    title.className = 'sillynpc-section-title';
    title.textContent = 'Image Generation';
    view.append(title, buildBackendDestinationNote());

    view.append(buildSettingToggle({
        key: 'autoPortraitOnFill', label: 'Draw Portrait Automatically',
        help: 'Draw and assign a missing portrait after empty-card Fill or Generate Profiles For New NPCs. '
            + 'Uses profile fields selected for image prompts with SillyTavern Image Generation, which may be billed separately.',
    }));
    view.append(buildSettingToggle({
        key: 'autoPlaceBackgrounds', label: 'Draw New Place Backgrounds Automatically',
        help: 'Draw and link a landscape image when the Places reader saves a new place. '
            + 'Uses SillyTavern Image Generation and may be billed separately. Existing places are unchanged.',
    }));
    view.append(buildSettingToggle({
        key: 'autoGenerateNpcExpressions', label: 'Generate NPC Expressions Automatically',
        help: 'Classify NPC dialogue on new replies and generate missing expression sprites from each NPC portrait. '
            + 'Applies to all NPCs. Uses Image Edit with ComfyUI and the saved emotion prompts; requires Local, Extras or WebLLM in ST Expressions. '
            + 'Existing sprites are reused. Manual generation stays available in NPC Edit.',
        onChange: () => resetNpcExpressions(),
    }));
    view.append(buildExpressionWorkflowSetting());
    view.append(buildSettingToggle({
        key: 'npcExpressionIpAdapterMode', label: 'IP-Adapter mode',
        help: 'Prepend each NPC’s default image prompt to the selected expression prompt. '
            + 'When off, send only the expression prompt. Applies to automatic and manual expressions.',
        onChange: () => resetNpcExpressions(),
    }));
    view.append(buildSettingToggle({
        key: 'showPresentNpcSprites', label: 'Show Present NPC Sprites',
        help: 'Keep the latest full-size sprite of every NPC in the current scene beside the chat, even with TTS off. '
            + 'Uses the newest sprite in an existing pack, or the portrait when no sprite is available. Displaying sprites does not generate images.',
        onChange: () => { clearSpeechSprite(); void refreshSceneSprites(); },
    }));
    view.append(buildSettingTextArea({
        key: 'imgGenPromptPrefix', label: 'Image Prompt Prefix', rows: 2,
        help: 'Placed before the selected profile fields and carried items for every portrait. '
            + 'Use composition instructions such as Solo, profile picture to discourage duplicate characters or moodboards. '
            + 'Clear it to omit the prefix. Manual generation includes it in the editable prompt; '
            + 'SillyTavern Image Generation may also add its own prefix.',
    }));
    view.append(buildSettingSelect({
        key: 'portraitShape', label: 'Portrait Shape',
        options: Object.entries(PORTRAIT_SHAPES).map(([value, shape]) => ({ value, label: shape.label })),
        help: "Sends dimensions to SillyTavern's Image Generation extension. Choose its own resolution to leave the host setting in charge.",
        onChange: rerender,
    }));
    const storage = document.createElement('details');
    storage.className = 'sillynpc-customize';
    const summary = document.createElement('summary');
    summary.textContent = 'Portrait storage and cleanup';
    storage.append(summary);
    renderImageStorageSettings(storage);
    view.append(storage);
}
