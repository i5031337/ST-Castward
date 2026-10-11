import { getSettings, saveSettings } from '../../core/settings.js';
import { THEME_FIELDS, normalizeThemeOverrides, applyThemeAppearance } from '../../core/theme-customization.js';
import { updateAllExtensionThemes } from '../shared/ui-theme.js';

function presetColours(id) {
    const root = document.createElement('div');
    root.className = 'sillynpc-manage';
    root.style.display = 'none';
    applyThemeAppearance(root, { menuStyle: id });
    document.body.append(root);
    const probe = document.createElement('span');
    root.append(probe);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    const colours = {};
    try {
        for (const field of THEME_FIELDS.filter(field => field.type === 'color')) {
            probe.style.color = `var(--sillynpc-${field.key}, var(--sillynpc-accent))`;
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = getComputedStyle(probe).color;
            context.fillRect(0, 0, 1, 1);
            const bytes = [...context.getImageData(0, 0, 1, 1).data];
            colours[field.key] = '#' + bytes.map(value => value.toString(16).padStart(2, '0')).join('');
        }
    } finally { root.remove(); }
    return colours;
}

export function renderThemeCustomization(parent, opened, store = { get: getSettings, save: saveSettings }) {
    const details = document.createElement('details');
    details.className = 'sillynpc-customize sillynpc-theme-editor';
    details.open = opened.has('Customize theme');
    const summary = document.createElement('summary');
    summary.textContent = 'Customize theme';
    const note = document.createElement('p');
    note.textContent = 'Changes apply immediately and are saved separately for each preset. Empty fields use the preset. Colours accept #RRGGBB or #RRGGBBAA for transparency.';
    details.append(summary, note);
    const settings = store.get();
    const id = settings.menuStyle || 'default';
    settings.themeOverrides = normalizeThemeOverrides(settings.themeOverrides);
    const colours = presetColours(id);
    const values = () => settings.themeOverrides[id] || {};
    const commit = (key, value) => {
        const draft = { ...values() };
        if (value === '') delete draft[key];
        else draft[key] = value;
        settings.themeOverrides = normalizeThemeOverrides({ ...settings.themeOverrides, [id]: draft });
        store.save();
        updateAllExtensionThemes();
    };
    const refreshers = [];
    let group;
    for (const field of THEME_FIELDS) {
        if (group !== field.group) {
            group = field.group;
            const heading = document.createElement('h4');
            heading.textContent = group;
            details.append(heading);
        }
        const row = document.createElement('div');
        row.className = 'sillynpc-setting sillynpc-theme-field';
        row.dataset.themeField = field.key;
        const label = document.createElement('label');
        label.textContent = field.label;
        const input = document.createElement(field.options ? 'select' : 'input');
        input.id = `sillynpc-theme-${field.key}`;
        input.className = 'text_pole';
        label.htmlFor = input.id;
        if (field.options) {
            for (const [value, text] of [['', 'Use preset'], ...Object.entries(field.options)]) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = text;
                input.append(option);
            }
        } else if (field.type === 'color') {
            input.type = 'text';
            input.placeholder = colours[field.key];
            input.pattern = '#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?';
            input.maxLength = 9;
        } else {
            input.type = 'number';
            input.min = field.min;
            input.max = field.max;
            input.step = field.step;
            input.placeholder = 'Preset';
        }
        const controls = document.createElement('div');
        controls.className = 'sillynpc-theme-controls';
        let picker;
        if (field.type === 'color') {
            picker = document.createElement('input');
            picker.type = 'color';
            picker.setAttribute('aria-label', `${field.label} colour picker`);
            picker.addEventListener('input', () => {
                const alpha = (values()[field.key] || colours[field.key]).slice(7);
                input.value = picker.value + alpha;
                commit(field.key, input.value);
            });
            controls.append(picker);
        }
        const refresh = () => {
            input.value = values()[field.key] ?? '';
            input.setCustomValidity('');
            if (picker) picker.value = (values()[field.key] || colours[field.key]).slice(0, 7);
        };
        refreshers.push(refresh);
        refresh();
        input.addEventListener('input', () => {
            if (field.type === 'color' && input.value && !/^#[\da-f]{6}([\da-f]{2})?$/i.test(input.value)) {
                input.setCustomValidity('Use six or eight hexadecimal digits after #.');
                return;
            }
            input.setCustomValidity('');
            if (!input.checkValidity()) return;
            commit(field.key, !field.options && field.type !== 'color' && input.value !== '' ? Number(input.value) : input.value);
            if (picker) picker.value = (values()[field.key] || colours[field.key]).slice(0, 7);
        });
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'menu_button';
        reset.textContent = 'Reset';
        reset.setAttribute('aria-label', `Reset ${field.label.toLowerCase()} to preset`);
        reset.addEventListener('click', () => { commit(field.key, ''); refresh(); });
        controls.append(input, reset);
        row.append(label, controls);
        details.append(row);
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'menu_button sillynpc-theme-reset';
    reset.textContent = 'Reset theme to preset';
    reset.addEventListener('click', () => {
        delete settings.themeOverrides[id];
        store.save();
        updateAllExtensionThemes();
        refreshers.forEach(refresh => refresh());
    });
    details.append(reset);
    parent.append(details);
}
