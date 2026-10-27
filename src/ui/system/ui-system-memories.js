import { liveSystemContext, saveSystemEditor } from './ui-system-context.js';

function control(tag, className, value) {
    const element = document.createElement(tag);
    element.className = `text_pole ${className}`;
    if (value !== undefined) element.value = value;
    return element;
}

export function buildMemoryControls(context = liveSystemContext) {
    const definition = context.definition();
    const saveSettings = () => saveSystemEditor(context);
    const refreshMemoryButton = context.refreshMemoryButton;
    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-system-memory-controls';
    if (!definition) {
        wrap.textContent = 'Select a System to configure NPC memories.';
        return wrap;
    }
    definition.memories ??= { enabled: false, carryOver: false, guidance: '', interval: 8, maxEntriesPerCharacter: 50 };
    const memories = definition.memories;
    const title = document.createElement('h4');
    title.textContent = 'NPC memories';
    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'sillynpc-check-group';
    enabledLabel.title = 'A separate reader occasionally finds durable events and knowledge for NPCs. Ask Before Applying controls whether new memories are saved or reviewed. Manual editing is always available.';
    const enabled = document.createElement('input');
    enabled.className = 'profile-memory-enabled';
    enabled.type = 'checkbox';
    enabled.checked = memories.enabled === true;
    enabled.addEventListener('change', () => { memories.enabled = enabled.checked; saveSettings(); refreshMemoryButton?.(); });
    enabledLabel.append(enabled, ' Read NPC memories automatically');
    const carryLabel = document.createElement('label');
    carryLabel.className = 'sillynpc-check-group';
    carryLabel.title = 'Preserve active and archived memories during NPC export/import and reuse in new chats. Independent of automatic memory reading; old message references are removed from copied memories.';
    const carry = document.createElement('input');
    carry.className = 'profile-memory-carryover';
    carry.type = 'checkbox';
    carry.checked = memories.carryOver === true;
    carry.setAttribute('aria-label', 'Carry over NPC memories');
    carry.addEventListener('change', () => { memories.carryOver = carry.checked; saveSettings(); });
    carryLabel.append(carry, ' Carry over NPC memories');
    const guidance = control('textarea', 'profile-memory-guidance', memories.guidance || '');
    guidance.rows = 3;
    guidance.maxLength = 4000;
    guidance.placeholder = 'Optional genre guidance: remember significant battles, promises, rivalries, or personally discovered clues. Skip routine activity.';
    guidance.setAttribute('aria-label', 'Memorable-event guidance');
    guidance.addEventListener('input', () => { memories.guidance = guidance.value; saveSettings(); });
    wrap.append(title, enabledLabel, carryLabel, guidance);
    for (const [key, label, fallback, max, className] of [
        ['interval', 'Read every N assistant replies: ', 8, 100, 'profile-memory-interval'],
        ['maxEntriesPerCharacter', 'Active memory entries per character: ', 50, 500, 'profile-memory-limit'],
    ]) {
        const numericLabel = document.createElement('label');
        numericLabel.textContent = label;
        const input = control('input', className, memories[key] ?? fallback);
        input.type = 'number';
        input.min = '1';
        input.max = String(max);
        input.step = '1';
        input.style.width = '6em';
        input.setAttribute('aria-label', label.trim().replace(/:$/, ''));
        input.addEventListener('change', () => {
            const value = Number(input.value);
            if (!Number.isSafeInteger(value) || value < 1 || value > max) {
                input.value = memories[key] ?? fallback;
                return;
            }
            memories[key] = value;
            saveSettings();
        });
        numericLabel.appendChild(input);
        wrap.appendChild(numericLabel);
    }
    return wrap;
}
