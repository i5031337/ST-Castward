import { getSettings } from '../../core/settings.js';
import { editSystemDetails, duplicateSystem } from '../../tracker/status-logic.js';

/** Save each field on commit without rebuilding the row or interrupting focus. */
export function buildSystemDetailFields(key) {
    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-system-details';
    const metadata = () => getSettings().statusTracker.presets[key]?.metadata || {};
    for (const [property, label, tag] of [['name', 'System name', 'input'], ['description', 'Subtitle', 'textarea']]) {
        const input = document.createElement(tag);
        input.className = `text_pole sillynpc-system-${property}`;
        if (tag === 'input') input.type = 'text';
        else input.rows = 1;
        const savedValue = () => metadata()[property] || (property === 'name' ? key : '');
        input.value = savedValue();
        input.placeholder = property === 'description' ? 'reusable rules' : label;
        input.setAttribute('aria-label', label);
        input.title = `${label}: edits save when you leave the field.`;
        input.addEventListener('change', () => {
            const current = metadata();
            const name = property === 'name' ? input.value : current.name || key;
            const subtitle = property === 'description' ? input.value : current.description || '';
            if (!editSystemDetails(key, name, subtitle)) {
                toastr.warning('Enter a name that is not used by another System.', 'Castward');
            }
            input.value = savedValue();
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                input.value = savedValue();
                input.blur();
            } else if (event.key === 'Enter' && (tag === 'input' || event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.stopPropagation();
                input.blur();
            }
        });
        wrap.append(input);
    }
    return wrap;
}

export function buildSystemDetailActions(key, onRefresh) {
    const duplicate = document.createElement('button');
    duplicate.type = 'button';
    duplicate.className = 'menu_button';
    duplicate.innerHTML = '<i class="fa-solid fa-copy" aria-hidden="true"></i>';
    duplicate.setAttribute('aria-label', 'Duplicate System');
    duplicate.title = 'Duplicate this System’s rules and saved NPCs, places and memories as an independent copy. Your current System stays selected.';
    duplicate.addEventListener('click', () => {
        const copy = duplicateSystem(key);
        if (!copy) return;
        onRefresh();
        toastr.success(`Created “${copy.metadata.name}”.`, 'Castward');
    });
    return duplicate;
}
