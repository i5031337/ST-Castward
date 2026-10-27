const readings = new Set();
const editors = new WeakMap();
const controls = new WeakMap();
const editorAttribute = 'data-sillynpc-tracker-editor';
const message = 'Editing available when reading finishes.';
let revision = 0;

export function isTrackerEditLocked() { return readings.size > 0; }
export function trackerEditRevision() { return revision; }

function updateEditor(container, refresh = false) {
    const editor = editors.get(container);
    if (!editor) return;
    const locked = isTrackerEditLocked();
    editor.note.hidden = !locked;
    for (const control of container.querySelectorAll(editor.selector)) {
        if (locked && !controls.has(control)) {
            controls.set(control, { disabled: control.disabled,
                editable: control.getAttribute('contenteditable'), aria: control.getAttribute('aria-disabled'),
                title: control.getAttribute('title') });
            if ('disabled' in control) control.disabled = true;
            if (control.hasAttribute('contenteditable')) control.setAttribute('contenteditable', 'false');
            control.setAttribute('aria-disabled', 'true');
            control.setAttribute('title', message);
        } else if (!locked && controls.has(control)) {
            const saved = controls.get(control);
            if ('disabled' in control) control.disabled = saved.disabled;
            for (const [attr, value] of [['contenteditable', saved.editable], ['aria-disabled', saved.aria], ['title', saved.title]]) {
                if (value === null) control.removeAttribute(attr);
                else control.setAttribute(attr, value);
            }
            controls.delete(control);
        }
    }
    if (!locked && refresh) editor.refresh?.();
}

function updateEditors(refresh = false) {
    for (const container of globalThis.document?.querySelectorAll(`[${editorAttribute}]`) || []) {
        try { updateEditor(container, refresh); }
        catch (error) { console.warn('[Castward] Could not refresh tracker editor', error); }
    }
}

/** Bind newly drawn controls too; detached editors are held only by weak references. */
export function bindTrackerEditor(container, selector, refresh) {
    let editor = editors.get(container);
    if (!editor) {
        const note = container.ownerDocument.createElement('small');
        note.className = 'notes';
        note.textContent = message;
        note.setAttribute('role', 'status');
        container.appendChild(note);
        editor = { note };
        editors.set(container, editor);
    }
    Object.assign(editor, { selector, refresh });
    if (editor.note.parentNode !== container) container.appendChild(editor.note);
    container.setAttribute(editorAttribute, '');
    updateEditor(container);
}

/** Settle a focused edit before capturing prompt state; every reading owns its release. */
export function lockTrackerEdits(signal) {
    if (signal?.aborted) return () => {};
    const focused = globalThis.document?.activeElement;
    if (!isTrackerEditLocked() && focused?.closest(`[${editorAttribute}]`)) focused.blur();
    if (signal?.aborted) return () => {};
    const token = {};
    readings.add(token);
    revision++;
    updateEditors();
    const release = () => {
        signal?.removeEventListener('abort', release);
        if (readings.delete(token) && !isTrackerEditLocked()) updateEditors(true);
    };
    signal?.addEventListener('abort', release, { once: true });
    return release;
}
