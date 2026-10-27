import { builtinSystemChoices } from '../../core/builtin-systems.js';

/** Saved entries use library keys; starters are fresh editable copies. */
export function buildNewChatSystemChooser(settings) {
    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-manage sillynpc-new-chat-system';
    const heading = document.createElement('h3');
    heading.className = 'sillynpc-section-title';
    heading.textContent = 'Choose a System for this story';
    const help = document.createElement('p');
    help.textContent = 'Your System decides what Castward tracks. You can edit its rules later in System Builder.';
    const select = document.createElement('select');
    select.className = 'text_pole';
    select.setAttribute('aria-label', 'System for this new chat');
    const choices = [];
    const addGroup = (label, entries) => {
        const group = document.createElement('optgroup');
        group.label = label;
        for (const entry of entries) {
            const option = document.createElement('option');
            option.value = String(choices.length);
            option.textContent = entry.name;
            choices.push(entry);
            group.append(option);
        }
        select.append(group);
    };
    addGroup('Saved Systems', Object.entries(settings.statusTracker.presets || {}).map(([key, profile]) => ({
        key, name: profile.metadata?.name || key,
        description: profile.metadata?.description || profile.definition?.metadata?.description || '',
    })));
    addGroup('Starter Systems — create an editable copy', builtinSystemChoices.map(choice => ({ ...choice, starter: true })));
    // Set after insertion so the browser can resolve the selected option.
    select.value = String(Math.max(0, choices.findIndex(choice => choice.key === settings.activeSystem)));
    const description = document.createElement('p');
    description.className = 'notes';
    const describe = () => { description.textContent = choices[Number(select.value)]?.description || 'Your saved custom System.'; };
    select.addEventListener('change', describe);
    describe();
    const label = document.createElement('label');
    label.className = 'checkbox_label';
    const reuse = document.createElement('input');
    reuse.type = 'checkbox';
    const reuseText = document.createElement('span');
    reuseText.textContent = 'Automatically use this System for future new chats';
    label.append(reuse, reuseText);
    const note = document.createElement('p');
    note.className = 'notes';
    note.textContent = 'Turn automatic reuse off in System → Manager to choose again. Your choice becomes fixed after your first player message.';
    wrap.append(heading, help, select, description, label, note);
    return { element: wrap, selection: () => choices[Number(select.value)], reuse: () => reuse.checked };
}
