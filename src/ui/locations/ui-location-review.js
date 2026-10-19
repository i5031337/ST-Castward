import { loadStateFromMetadata } from '../../tracker/status-logic.js';

/** Place identity and containment remain visible while only the description is edited. */
export function buildLocationReviewRow(row, rows) {
    const { change } = row;
    const record = change.location?.record || {};
    const movement = change.kind === 'location-current';
    const el = document.createElement('div');
    el.className = `sillynpc-review-row sillynpc-location-review kind-${change.kind}`;
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = row.accepted;
    toggle.className = 'sillynpc-review-toggle';
    toggle.setAttribute('aria-label', `Include ${change.label} for ${change.actor}`);
    toggle.addEventListener('change', () => { row.accepted = toggle.checked; });
    row.toggle = toggle;
    const body = document.createElement('div');
    body.className = 'sillynpc-location-review-body';
    const title = document.createElement('strong');
    title.textContent = `${change.label}: ${record.name || change.actor}`;
    body.append(title);
    const store = loadStateFromMetadata()?.locations?.records || {};
    if (movement) {
        const previous = document.createElement('span');
        previous.textContent = `${store[change.location?.currentBefore]?.name || 'Not confirmed'} → ${change.after}`;
        body.append(previous);
    } else {
        if (record.aliases?.length) {
            const aliases = document.createElement('small');
            aliases.textContent = `Also called: ${record.aliases.join(', ')}`;
            body.append(aliases);
        }
        const parent = document.createElement('small');
        const parentName = store[record.parentId]?.name
            || rows.find(entry => entry.change.location?.record?.id === record.parentId)?.change.location.record.name;
        parent.textContent = `Inside: ${parentName || (record.parentId ? 'A proposed place' : 'No parent place')}`;
        body.append(parent);
        if (change.before) {
            const previous = document.createElement('small');
            previous.textContent = `Previously: ${change.before}`;
            body.append(previous);
        }
        const description = document.createElement('textarea');
        description.className = 'sillynpc-review-to text_pole';
        description.rows = 3;
        description.maxLength = 4000;
        description.value = row.value;
        description.setAttribute('aria-label', `Proposed description for ${record.name}`);
        description.addEventListener('input', () => { row.value = description.value; });
        for (const type of ['keydown', 'keyup', 'keypress']) description.addEventListener(type, event => event.stopPropagation());
        body.append(description);
    }
    const evidence = document.createElement('small');
    evidence.className = 'sillynpc-review-why has-note';
    evidence.textContent = `Story evidence: ${change.note || ''}`;
    body.append(evidence);
    const hint = document.createElement('small');
    hint.className = 'sillynpc-hint';
    hint.textContent = change.reason || 'Accept any new parent or destination place with this change. Unresolved selected changes stay pending.';
    body.append(hint);
    el.append(toggle, body);
    return el;
}
