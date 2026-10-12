import { BASE_EXPRESSION_PROMPT, EMOTION_LABELS, EMOTION_PROMPTS, prepareExpressionReference, expressionWorkflow } from '../../expressions/expression-prompts.js';
import { expressionGenerator, expressionJob, expressionOwner } from '../../expressions/host-expression-generation.js';
import { getSettings } from '../../core/settings.js';
import { findCharacterRecord } from '../../characters/character-repository.js';

export function buildExpressionGeneration(card, { save, onPack, onReference, onSelect }) {
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
    const actions = document.createElement('div'); actions.className = 'sillynpc-expression-actions'; root.append(actions);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); root.append(status);
    const advanced = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Prompts and workflow'; advanced.append(summary); root.append(advanced);
    const prompt = field(advanced, 'Emotion prompt', document.createElement('textarea'), 'prompt'); prompt.rows = 2;
    prompt.value = generation.prompts[emotion.value];
    emotion.addEventListener('change', () => { prompt.value = generation.prompts[emotion.value]; onSelect(emotion.value); });
    prompt.addEventListener('change', () => {
        generation.prompts[emotion.value] = prompt.value.trim() || EMOTION_PROMPTS[emotion.value];
        prompt.value = generation.prompts[emotion.value]; save();
    });
    const textField = (title, key, multiline = false) => {
        const input = document.createElement(multiline ? 'textarea' : 'input'); input.value = generation[key];
        if (multiline) input.rows = 2;
        field(advanced, title, input, key);
        input.addEventListener('change', () => {
            generation[key] = input.value.trim() || (key === 'basePrompt' ? BASE_EXPRESSION_PROMPT : '');
            input.value = generation[key]; save();
        });
        return input;
    };
    textField('Shared instructions', 'basePrompt', true);
    textField('Negative prompt', 'negativePrompt', true);
    textField('Workflow override', 'workflow').placeholder = 'Shared Expression Editing Workflow';
    const button = (title, action, handler) => {
        const element = document.createElement('button'); element.type = 'button'; element.className = 'menu_button';
        element.dataset.expressionAction = action; element.textContent = title;
        element.addEventListener('click', handler); actions.append(element); return element;
    };
    let controller;
    const run = async replace => {
        if (!card.imageUrl) { status.textContent = 'Add an NPC portrait first.'; return; }
        if (prepareExpressionReference(card)) { onReference(); save(); }
        const snapshot = JSON.stringify(config), image = card.imageUrl, owner = expressionOwner();
        const workflow = expressionWorkflow(card, getSettings());
        controller = new AbortController();
        const current = () => getSettings().enabled && expressionOwner() === owner && card.imageUrl === image
            && findCharacterRecord(card.id) === card && JSON.stringify(card.presentation.expressions) === snapshot
            && expressionWorkflow(card, getSettings()) === workflow;
        generate.disabled = regenerate.disabled = true; cancel.hidden = false;
        status.textContent = 'Generating…';
        try {
            const sprites = await expressionGenerator.generate(expressionJob(card, emotion.value, current, controller.signal), { retry: true, replace });
            if (current()) { onPack(sprites, emotion.value); status.textContent = 'Expression saved.'; }
        } catch (error) { status.textContent = error.name === 'AbortError' ? 'Cancelled.' : error.message; }
        finally { generate.disabled = regenerate.disabled = false; cancel.hidden = true; controller = null; }
    };
    const generate = button('Generate / retry', 'generate', () => run(false));
    const regenerate = button('Regenerate', 'regenerate', () => run(true));
    const cancel = button('Cancel', 'cancel', () => controller?.abort()); cancel.hidden = true;
    return root;
}
