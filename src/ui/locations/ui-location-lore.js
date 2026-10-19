import { listLocationLorebooks, listLocationLoreEntries, readLocationLoreEntry } from '../../locations/location-lore.js';

/** Lore is a reference. Copying text edits only this unsaved chat card. */
export function buildLocationLore(record, description, isCurrent, showError) {
    const box = document.createElement('fieldset');
    box.className = 'sillynpc-location-lore';
    const legend = document.createElement('legend');
    legend.textContent = 'Lore reference';
    const hint = document.createElement('p');
    hint.className = 'sillynpc-hint';
    hint.textContent = 'Optional reference. Copying an entry fills the description above; save to keep it in this chat.';
    box.append(legend, hint);
    const field = (text, select) => {
        const label = document.createElement('label');
        label.textContent = text;
        label.append(select);
        box.append(label);
    };
    const option = (select, value, text) => {
        const el = document.createElement('option');
        el.value = value;
        el.textContent = text;
        select.append(el);
    };
    const book = document.createElement('select');
    book.className = 'text_pole';
    option(book, '', 'No lorebook');
    const names = listLocationLorebooks();
    if (record.lorebook && !names.includes(record.lorebook)) names.push(record.lorebook);
    for (const name of names) option(book, name, name);
    book.value = record.lorebook || '';
    field('Lorebook', book);
    const entry = document.createElement('select');
    entry.className = 'text_pole';
    field('Entry', entry);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'menu_button';
    copy.textContent = 'Copy lore description';
    copy.disabled = true;
    box.append(copy);
    let revision = 0;
    const fresh = version => isCurrent() && box.isConnected && revision === version;
    async function load(selected = '') {
        const version = ++revision;
        entry.replaceChildren();
        option(entry, '', 'No entry');
        if (selected !== '') {
            option(entry, String(selected), 'Linked entry (loading)');
            entry.value = String(selected);
        }
        entry.disabled = true;
        copy.disabled = true;
        if (!book.value) return;
        try {
            const entries = await listLocationLoreEntries(book.value);
            if (!fresh(version)) return;
            entry.replaceChildren();
            option(entry, '', 'No entry');
            for (const row of entries) option(entry, String(row.uid), row.name);
            if (selected !== '' && !entries.some(row => String(row.uid) === String(selected))) {
                option(entry, String(selected), 'Linked entry unavailable');
            }
            entry.value = String(selected);
            entry.disabled = false;
            copy.disabled = !entries.some(row => String(row.uid) === entry.value);
        } catch (error) {
            if (fresh(version)) showError(error.message || 'Could not load lore entries.');
        }
    }
    book.addEventListener('change', () => load());
    entry.addEventListener('change', () => { copy.disabled = !entry.value; });
    copy.addEventListener('click', async () => {
        const version = revision;
        const world = book.value;
        const uid = entry.value;
        copy.disabled = true;
        try {
            const row = await readLocationLoreEntry(world, uid);
            if (!fresh(version) || book.value !== world || entry.value !== uid) return;
            if (!row) throw new Error('This lore entry is unavailable.');
            description.value = row.content;
            description.focus();
        } catch (error) {
            if (fresh(version)) showError(error.message || 'Could not read lore entry.');
        } finally {
            if (fresh(version)) copy.disabled = !entry.value;
        }
    });
    // The caller attaches the form before asynchronous results are displayed.
    queueMicrotask(() => load(record.loreEntryId ?? ''));
    return { element: box, value: () => ({ lorebook: book.value, loreEntryId: entry.value === '' ? null : Number(entry.value) }) };
}
