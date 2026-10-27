import { Popup } from '../../../../../../popup.js';
import { buildBulkCheckbox } from '../shared/ui-bulk-select.js';
import { loadStateFromMetadata, updateMasterItem, renameMasterItem, deleteMasterItem } from '../../tracker/status-logic.js';
import { getItemRules, clearItemRule, PLAYER_ACTOR } from '../../tracker/status-review.js';
import { render, itemId, libraryBulk } from './ui-item-library.js';

export function buildItemRow({ root, search, master, colDef, fields, primary, key }) {
    const data = master[colDef.id][key] || {};
    const owner = { library: master, definition: colDef, collectionId: colDef.id };

    const card = document.createElement('div');
    card.className = 'sillynpc-item-card';
    card.style.cssText = 'margin-bottom:8px; padding:10px; border:1px solid var(--sillynpc-border); border-radius:6px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';

    // Primary field doubles as the storage key, so editing it is a rename.
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'text_pole';
    nameInput.style.cssText = 'flex:1; min-width:160px; font-weight:bold;';
    nameInput.value = data[primary] ?? key;
    nameInput.addEventListener('change', () => {
        const newName = nameInput.value.trim();
        if (!newName || newName.toLowerCase() === key) return;
        const current = master[colDef.id]?.[key];
        if (!current) return;
        const updated = { ...current, [primary]: newName };
        renameMasterItem(colDef.id, key, newName, updated, { ...owner, item: current, itemKey: key });
        render(root, search.value);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'menu_button';
    del.style.color = 'var(--sillynpc-danger)';
    del.innerHTML = '<i class="fa-solid fa-trash"></i>';
    del.title = 'Forget this entry';
    del.addEventListener('click', async () => {
        const expected = { ...owner, item: master[colDef.id]?.[key], itemKey: key };
        const ok = await Popup.show.confirm('Forget entry?', `"${data[primary] ?? key}" will no longer be remembered.`);
        if (!ok) return;
        deleteMasterItem(colDef.id, key, expected);
        render(root, search.value);
    });

    // In bulk mode the per-item trash goes: two ways to delete on one row, one of them
    // asking a different question, is how somebody means to tick and instead deletes.
    if (libraryBulk?.isActive()) {
        header.append(buildBulkCheckbox(libraryBulk, itemId(colDef.id, key)), nameInput);
    } else {
        header.append(nameInput, del);
    }
    card.appendChild(header);

    // Remaining static fields.
    for (const field of fields) {
        if (field.name === primary) continue;
        const wrap = document.createElement('div');
        wrap.style.marginTop = '6px';

        const label = document.createElement('div');
        label.className = 'field-label';
        label.textContent = field.label || field.name;
        wrap.appendChild(label);

        const input = field.isMultiline
            ? document.createElement('textarea')
            : document.createElement('input');
        input.className = 'text_pole';
        input.style.width = '100%';
        if (field.isMultiline) {
            input.rows = Math.min(8, Math.max(2, String(data[field.name] ?? '').split('\n').length));
            input.style.resize = 'vertical';
        } else {
            input.type = 'text';
        }
        input.value = data[field.name] ?? '';
        input.addEventListener('change', () => {
            const current = master[colDef.id]?.[key];
            if (!current) return;
            const merged = { ...current, [primary]: nameInput.value.trim(), [field.name]: input.value };
            updateMasterItem(colDef.id, nameInput.value.trim() || key, merged, { ...owner, item: current, itemKey: key });
        });

        wrap.appendChild(input);
        card.appendChild(wrap);
    }

    return card;
}

/** Display explicit item review decisions and let the user reverse them. */
export function buildRuleSection(root, search, key, { title, note: noteText, undo }) {
    const section = document.createElement('div');
    section.style.marginTop = '20px';

    const playerName = (() => {
        try { return loadStateFromMetadata()?.player?.name || 'Player'; } catch { return 'Player'; }
    })();

    const entries = Object.entries(getItemRules(key))
        .flatMap(([slot, collections]) => Object.entries(collections || {})
            .flatMap(([colId, names]) => (names || []).map(name => ({
                slot, colId, name,
                who: slot === PLAYER_ACTOR ? playerName : slot,
            }))))
        .filter(e => !search
            || `${e.name} ${e.colId} ${e.who}`.toLowerCase().includes(search.toLowerCase()));

    const heading = document.createElement('h3');
    heading.className = 'sillynpc-section-title';
    heading.textContent = `${title} (${entries.length})`;
    section.appendChild(heading);

    const note = document.createElement('small');
    note.className = 'notes';
    note.style.cssText = 'display:block; margin-bottom:10px;';
    note.textContent = noteText;
    section.appendChild(note);

    if (entries.length === 0) {
        const none = document.createElement('p');
        none.className = 'notes';
        none.style.opacity = '0.6';
        none.textContent = 'Nothing on this list.';
        section.appendChild(none);
        return section;
    }

    for (const { slot, colId, name, who } of entries) {
        const row = document.createElement('div');
        row.className = 'flex-container';
        row.style.cssText = 'margin:4px 0; gap:10px;';

        const label = document.createElement('span');
        label.style.flex = '1';
        label.textContent = `${name}  (${who} - ${colId})`;

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'menu_button';
        clear.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
        clear.title = undo;
        clear.addEventListener('click', () => {
            clearItemRule(key, slot, colId, name);
            render(root, search);
        });

        row.append(label, clear);
        section.appendChild(row);
    }

    return section;
}
