import { EMOTION_LABELS, EMOTION_PROMPTS, prepareExpressionReference, expressionWorkflow } from '../../expressions/expression-prompts.js';
import { expressionGenerator, expressionJob, expressionOwner } from '../../expressions/host-expression-generation.js';
import { getSettings } from '../../core/settings.js';
import { findCharacterRecord } from '../../characters/character-repository.js';

export function buildExpressionGeneration(card, { save, onPack, onReference, onSelect, hasExpression }) {
    const config = card.presentation.expressions, generation = config.generation;
    const root = document.createElement('div'); root.className = 'sillynpc-expression-generation';
    const field = (parent, title, input, key) => {
        const label = document.createElement('label'); label.textContent = title; label.append(input); parent.append(label);
        input.classList.add('text_pole'); if (key) input.dataset.expressionField = key;
        return input;
    };
    const emotion = field(root, 'Emotion', document.createElement('select'), 'emotion');
    for (const label of EMOTION_LABELS) {
        const option = document.createElement('option'); option.value = label; option.textContent = label; emotion.append(option);
    }
    emotion.value = 'neutral';
    const availability = document.createElement('p'); availability.className = 'sillynpc-expression-availability';
    availability.setAttribute('aria-live', 'polite'); root.append(availability);
    const refreshAvailability = () => {
        const exists = hasExpression(emotion.value);
        availability.dataset.missing = String(!exists);
        availability.textContent = exists ? `${emotion.value} expression available.` : `${emotion.value} expression missing.`;
    };
    const actions = document.createElement('div'); actions.className = 'sillynpc-expression-actions'; root.append(actions);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); root.append(status);
    const advanced = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Prompts and workflow'; advanced.append(summary); root.append(advanced);
    const hint = document.createElement('p'); hint.textContent = 'One of these three prompts is chosen at random for each generation.'; advanced.append(hint);
    const prompts = [0, 1, 2].map(index => {
        const prompt = field(advanced, `Emotion prompt ${index + 1}`, document.createElement('textarea'), index ? `prompt${index + 1}` : 'prompt');
        prompt.rows = 3; prompt.value = generation.prompts[emotion.value][index];
        prompt.addEventListener('change', () => {
            generation.prompts[emotion.value][index] = prompt.value.trim() || EMOTION_PROMPTS[emotion.value][index];
            prompt.value = generation.prompts[emotion.value][index]; save();
        });
        return prompt;
    });
    emotion.addEventListener('change', () => {
        prompts.forEach((prompt, index) => { prompt.value = generation.prompts[emotion.value][index]; });
        status.textContent = '';
        onSelect(emotion.value);
    });
    const textField = (title, key, multiline = false) => {
        const input = document.createElement(multiline ? 'textarea' : 'input'); input.value = generation[key];
        if (multiline) input.rows = 2;
        field(advanced, title, input, key);
        input.addEventListener('change', () => {
            generation[key] = input.value.trim();
            input.value = generation[key]; save();
        });
        return input;
    };
    textField('Negative prompt', 'negativePrompt', true);
    textField('Workflow override', 'workflow').placeholder = 'Shared Expression Editing Workflow';
    const button = (title, action, handler) => {
        const element = document.createElement('button'); element.type = 'button'; element.className = 'menu_button';
        element.dataset.expressionAction = action; element.textContent = title;
        element.addEventListener('click', handler); actions.append(element); return element;
    };
    let controller;
    const run = async () => {
        if (!card.imageUrl) { status.textContent = 'Add an NPC portrait first.'; return; }
        if (prepareExpressionReference(card)) { onReference(); save(); }
        const snapshot = JSON.stringify(config), image = card.imageUrl, owner = expressionOwner();
        const workflow = expressionWorkflow(card, getSettings());
        const ipAdapterMode = getSettings().npcExpressionIpAdapterMode;
        const portraitInputs = () => JSON.stringify([getSettings().imgGenPromptPrefix, card.profile, card.lorebook]);
        const imagePromptInputs = portraitInputs();
        controller = new AbortController();
        const current = () => getSettings().enabled && expressionOwner() === owner && card.imageUrl === image
            && findCharacterRecord(card.id) === card && JSON.stringify(card.presentation.expressions) === snapshot
            && expressionWorkflow(card, getSettings()) === workflow
            && getSettings().npcExpressionIpAdapterMode === ipAdapterMode
            && (!ipAdapterMode || portraitInputs() === imagePromptInputs);
        const label = emotion.value;
        generate.disabled = emotion.disabled = true; cancel.hidden = false;
        status.textContent = 'Generating…';
        try {
            const job = await expressionJob(card, label, current, controller.signal);
            const sprites = await expressionGenerator.generate(job, { retry: true, replace: true });
            if (current()) { onPack(sprites, label); status.textContent = 'Expression saved.'; }
        } catch (error) { status.textContent = error.name === 'AbortError' ? 'Cancelled.' : error.message; }
        finally { generate.disabled = emotion.disabled = false; cancel.hidden = true; controller = null; }
    };
    const generate = button('Generate', 'generate', run);
    const cancel = button('Cancel', 'cancel', () => controller?.abort()); cancel.hidden = true;
    return { root, refreshAvailability };
}
