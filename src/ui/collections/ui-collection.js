import { constrainNumericStat } from '../../tracker/numeric-stat-bounds.js';
import { choiceOptionsHtml, isChoiceField } from '../shared/ui-choice.js';
import { getSettings } from '../../core/settings.js';
import { loadStateFromMetadata } from '../../tracker/status-logic.js';
import { createCollectionEditor } from '../../tracker/collection-editor.js';
import { escapeHtml } from '../../core/utils.js';
import { Popup } from '../../../../../../popup.js';
import { bindTrackerEditor, isTrackerEditLocked } from '../../tracker/tracker-edit-lock.js';

export function renderCollectionUI(tabId, actor, settings, options = {}) {
    const colDef = settings.collections.find(c => c.id === tabId);
    if (!colDef) return '';

    const items = (actor.collections && actor.collections[tabId]) || [];
    const isEditMode = options.isEditMode !== false; // default true
    return `
        <div class="sillynpc-collection-container">
            <div class="sillynpc-collection-actions" style="display:flex; gap:10px; margin-bottom: 10px;">
                ${isEditMode ? `<button type="button" class="menu_button sillynpc-add-item" data-col="${escapeHtml(tabId)}" style="white-space: nowrap; width: auto; min-width: max-content;">Add New Item</button>` : ''}
            </div>
            <div class="sillynpc-collection-list">
                ${items.map((item, idx) => `
                    <div class="sillynpc-item-card ${isEditMode ? '' : 'readonly-mode'}" data-idx="${idx}" data-col="${escapeHtml(tabId)}">
                        <div class="item-header" style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap;">
                            ${colDef.fields.filter(f => !f.isMultiline).map(f => {
                                const val = item[f.name] !== undefined ? item[f.name] : (f.defaultValue !== undefined ? f.defaultValue : (f.type === 'number' ? 0 : ''));
                                if (!isEditMode) {
                                    const width = f.isPrimary ? 'flex:1; min-width:150px;' : 'width:auto; min-width:80px;';
                                    return `
                                        <div class="readonly-field" style="${width}">
                                            <div class="field-label">${escapeHtml(f.label || f.name)}</div>
                                            <div class="field-value">${f.type === 'boolean' ? (val ? 'Yes' : 'No') : escapeHtml(String(val))}</div>
                                        </div>
                                    `;
                                } else {
                                    if (isChoiceField(f)) {
                                        const width = f.isPrimary ? 'flex:1; min-width:150px;' : 'width:110px;';
                                        return `<select class="text_pole item-field-input"
                                                        data-field="${escapeHtml(f.name)}"
                                                        style="${width}">${choiceOptionsHtml(f.options, val)}</select>`;
                                    }
                                    if (f.type === 'boolean') {
                                        return `
                                            <label style="display:flex; align-items:center; gap:5px;">
                                                <input type="checkbox" class="item-field-input" data-field="${escapeHtml(f.name)}" ${val ? 'checked' : ''}>
                                                <small>${escapeHtml(f.label || f.name)}</small>
                                            </label>
                                        `;
                                    }
                                    const width = f.isPrimary ? 'flex:1; min-width:150px;' : 'width:80px;';
                                    return `<input type="${f.type === 'number' ? 'number' : 'text'}"
                                                   ${f.type === 'number' ? `step="any" min="${escapeHtml(f.min ?? '')}" max="${escapeHtml(f.maxStatValue ?? '')}"` : ''}
                                                   class="text_pole item-field-input" 
                                                   data-field="${escapeHtml(f.name)}" 
                                                   value="${escapeHtml(String(val))}" 
                                                   placeholder="${escapeHtml(f.label || f.name)}" 
                                                   style="${width}">`;
                                }
                            }).join('')}
                            ${isEditMode ? `
                            <div class="item-actions" style="margin-left:auto;">
                                <button type="button" class="menu_button drop-item" title="Delete entry"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>
                            </div>
                            ` : ''}
                        </div>
                        ${colDef.fields.filter(f => f.isMultiline).map(f => {
                            const val = item[f.name] || '';
                            if (!isEditMode) {
                                return `
                                    <div class="readonly-field multiline" style="width: 100%; margin-top: 8px;">
                                        <div class="field-label">${escapeHtml(f.label || f.name)}</div>
                                        <div class="field-value">${escapeHtml(val)}</div>
                                    </div>
                                `;
                            } else {
                                return `<textarea class="text_pole item-field-input" 
                                                 data-field="${escapeHtml(f.name)}" 
                                                 placeholder="${escapeHtml(f.label || f.name)}" 
                                                 style="width: 100%; margin-top: 8px; resize: vertical; min-height: 40px;">${escapeHtml(val)}</textarea>`;
                            }
                        }).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Attaches event listeners for collection UI.
 * @param {HTMLElement} dom Container element
 * @param {Object} actor Actor object to update
 * @param {Function} onRefresh Refreshes the UI; may return its replacement container.
 */
export function attachCollectionListeners(dom, actor, onRefresh) {
    bindTrackerEditor(dom, '.item-field-input, .sillynpc-add-item, .drop-item', onRefresh);
    const isPlayer = actor.isPlayer ?? (actor === loadStateFromMetadata().player);

    const editor = createCollectionEditor(actor, isPlayer);
    const renderedItems = new Map([...dom.querySelectorAll('.sillynpc-item-card')].map(row => [row,
        structuredClone(actor.collections?.[row.dataset.col]?.[Number(row.dataset.idx)])]));

    // Collection Actions
    dom.querySelectorAll('.sillynpc-add-item').forEach(btn => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', () => {
            if (isTrackerEditLocked()) return;
            const colId = btn.dataset.col;
            const settings = getSettings().statusTracker;
            const colDef = settings.collections.find(c => c.id === colId);
            if (!colDef) return;
            const primaryField = colDef.fields.find(f => f.isPrimary) || { name: 'name' };
            const where = editor.current();
            if (!where?.target) return;

            // Adds require a name; use a unique placeholder so repeated clicks create rows.
            const items = where.target.collections?.[colId] || [];
            const newIndex = items.length;
            const names = new Set(items.map(item => String(item[primaryField.name]).toLowerCase()));
            let newItemName = 'New Item';
            for (let suffix = 2; names.has(newItemName.toLowerCase()); suffix++) {
                newItemName = `New Item ${suffix}`;
            }
            if (!editor.commit({ operation: 'add', collectionId: colId,
                item: { [primaryField.name]: newItemName } }, 'Item added')) return;
            const refreshedDom = onRefresh?.() || dom;
            const addedCard = [...refreshedDom.querySelectorAll('.sillynpc-item-card')]
                .find(card => card.dataset.col === colId && Number(card.dataset.idx) === newIndex);
            const nameInput = [...(addedCard?.querySelectorAll('.item-field-input') || [])]
                .find(input => input.dataset.field === primaryField.name);
            nameInput?.focus();
            nameInput?.select?.();
        });
        btn.dataset.listenerAttached = 'true';
    });

    // Commit settled values once; keep the original rendered item through delayed work.
    const COMMIT_DELAY_MS = 400;

    const commitField = (input) => {
        if (isTrackerEditLocked()) return;
        const card = input.closest('.sillynpc-item-card');
        if (!card) return;
        const colId = card.dataset.col;
        const idx = parseInt(card.dataset.idx);
        const fieldName = input.dataset.field;

        const settings = getSettings().statusTracker;
        const colDef = settings.collections.find(c => c.id === colId);
        const fieldDef = colDef ? colDef.fields.find(f => f.name === fieldName) : null;

        const where = editor.current();
        const items = where?.target?.collections?.[colId];
        if (!items || !items[idx]) return;

        let value = input.value;
        if (input.type === 'checkbox') value = input.checked;
        else if (input.type === 'number') {
            const bounded = constrainNumericStat(fieldDef, input.value === '' ? 0 : input.value, items[idx][fieldName]);
            value = parseFloat(bounded) || 0;
            input.value = String(value);
        }

        // Nothing settled since the last commit - skip the whole write.
        if (items[idx][fieldName] === value) return;

        const item = renderedItems.get(card);
        if (!editor.commit({ operation: 'edit', collectionId: colId, index: idx, item,
            fieldName, value }, 'Item edited')) return;
        const saved = editor.current()?.target.collections?.[colId]?.[idx];
        if (!saved) return;
        renderedItems.set(card, structuredClone(saved));
        for (const control of card.querySelectorAll('.item-field-input')) {
            const key = control.dataset.field;
            if (key !== fieldName && saved[key] === item[key]) continue;
            if (control.type === 'checkbox') control.checked = !!saved[key];
            else control.value = String(saved[key] ?? '');
        }
    };

    dom.querySelectorAll('.item-field-input').forEach(input => {
        if (input.dataset.listenerAttached) return;

        let timer = null;
        const flush = () => {
            if (timer) { clearTimeout(timer); timer = null; }
            commitField(input);
        };

        input.addEventListener('input', () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, COMMIT_DELAY_MS);
        });
        // Blur, Enter, and checkbox/select toggles commit immediately.
        input.addEventListener('change', flush);
        input.addEventListener('blur', flush);

        input.dataset.listenerAttached = 'true';
    });

    dom.querySelectorAll('.drop-item').forEach(btn => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (isTrackerEditLocked()) return;
            const card = btn.closest('.sillynpc-item-card');
            const colId = card.dataset.col;
            const idx = parseInt(card.dataset.idx);

            const where = editor.current();
            const items = where?.target?.collections?.[colId];

            if (items && items[idx] && JSON.stringify(items[idx]) === JSON.stringify(renderedItems.get(card))) {
                const item = structuredClone(renderedItems.get(card));
                const settings = getSettings().statusTracker;
                const colDef = settings.collections.find(c => c.id === colId);
                const primaryField = colDef?.fields.find(f => f.isPrimary) || { name: 'name' };
                const itemName = item[primaryField.name] || 'Item';

                if (await Popup.show.confirm('Delete item', `Delete "${itemName}"?`)) {
                    if (!editor.commit({ operation: 'remove', collectionId: colId, index: idx,
                        item }, 'Item dropped')) return;
                    onRefresh?.();
                }
            }
        });
        btn.dataset.listenerAttached = 'true';
    });
}
