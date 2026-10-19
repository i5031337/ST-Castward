import { readLocationStore, editLocation, setCurrentLocation, createLocationId } from './location-store.js';

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = value => typeof value === 'string' ? value.trim() : '';
const own = (value, key) => Object.hasOwn(value || {}, key);
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
function sourceEvidence(quote, source) {
    const wanted = text(quote);
    if (!wanted || typeof source !== 'string') return '';
    const lowerAscii = value => value.replace(/[A-Z]/g, letter => letter.toLowerCase());
    const exact = source.indexOf(wanted);
    const at = exact >= 0 ? exact : lowerAscii(source).indexOf(lowerAscii(wanted));
    return at < 0 ? '' : source.slice(at, at + wanted.length);
}
function rowFor(kind, record, before, provenance, evidence, currentBefore, currentBeforeName) {
    const current = kind === 'location-current';
    return { id: createLocationId(), kind, scope: 'location', actor: record.name,
        label: current ? 'Current place' : kind === 'location-create' ? 'New place' : 'Place details',
        before: current ? currentBeforeName || 'Unknown' : before?.description || '',
        after: current ? record.name : record.description, risk: current ? 'safe' : 'risky', note: text(evidence),
        location: freeze({ id: record.id, record: clone(record), before: clone(before),
            provenance: clone(provenance), ...(current ? { currentBefore } : {}) }) };
}

/** Evidence-bearing discoveries use the tracker's review policy after validation. */
export function buildLocationProposals(state, input, { provenance, sourceText = '', makeId = createLocationId } = {}) {
    const original = readLocationStore(state);
    const rows = [], warnings = [];
    if (!original.enabled || !input || typeof input !== 'object') return { rows, warnings };
    const refs = new Map(Object.keys(original.records).map(id => [id, id]));
    const candidates = [];
    const submittedPlaces = Array.isArray(input.places) ? input.places : [];
    const places = submittedPlaces.slice(0, 40);
    if (submittedPlaces.length > places.length) warnings.push('Only the first 40 proposed places were considered.');
    const refCounts = new Map();
    for (const place of places) {
        const ref = text(place?.ref);
        refCounts.set(ref, (refCounts.get(ref) || 0) + 1);
    }
    for (const place of places) {
        const ref = text(place?.ref);
        if (!ref || refCounts.get(ref) > 1) {
            warnings.push('Ignored a place with a missing or repeated reference.'); continue;
        }
        const evidence = sourceEvidence(place.evidence, sourceText);
        if (!evidence) {
            warnings.push(`Ignored ${text(place.name) || ref}: evidence must quote the latest message.`); continue;
        }
        if (!refs.has(ref)) {
            const id = makeId();
            if ([...refs.values()].includes(id)) { warnings.push(`Ignored ${text(place.name) || ref}: place ID collision.`); continue; }
            refs.set(ref, id);
        }
        candidates.push({ ref, place, id: refs.get(ref), evidence });
    }
    let working = { ...state, locations: original };
    let waiting = candidates;
    const failedRefs = new Set();
    while (waiting.length) {
        let progress = false;
        const next = [];
        for (const candidate of waiting) {
            const { ref, place, id, evidence } = candidate;
            const parentRef = text(place.parentRef);
            if (parentRef && refs.has(parentRef) && !failedRefs.has(parentRef)
                && !own(working.locations.records, refs.get(parentRef))) { next.push(candidate); continue; }
            try {
                // Models commonly use null for an absent optional parent. Treat it as
                // omitted, while an empty string still explicitly clears a parent.
                if (own(place, 'parentRef') && place.parentRef !== null && typeof place.parentRef !== 'string') throw new Error('The parent reference must be text.');
                if (own(place, 'parentRef') && parentRef && (!refs.has(parentRef) || failedRefs.has(parentRef))) {
                    warnings.push(`Ignored the unknown parent for ${text(place.name) || ref}.`);
                }
                const before = own(original.records, id) ? original.records[id] : null;
                const recordInput = { ...(before ? { id } : {}) };
                for (const field of ['name', 'aliases', 'description']) {
                    if (own(place, field)) recordInput[field] = place[field];
                }
                if (own(place, 'parentRef') && place.parentRef !== null
                    && (!parentRef || (refs.has(parentRef) && !failedRefs.has(parentRef)))) {
                    recordInput.parentId = refs.get(parentRef) || '';
                }
                const updated = editLocation(working, recordInput, { makeId: () => id });
                const record = updated.locations.records[id];
                working = updated;
                if (!same(before, record)) rows.push(rowFor(before ? 'location-update' : 'location-create',
                    record, before, provenance, evidence));
                progress = true;
            } catch (error) { failedRefs.add(ref); warnings.push(`Ignored ${text(place.name) || ref}: ${error.message}`); progress = true; }
        }
        if (!progress) { warnings.push('Ignored places with missing or cyclic parent dependencies.'); break; }
        waiting = next;
    }
    const currentRef = text(input.currentRef);
    if (currentRef && refs.has(currentRef) && own(working.locations.records, refs.get(currentRef))) {
        const record = working.locations.records[refs.get(currentRef)];
        if (record.id !== original.currentId) {
            const evidence = sourceEvidence(input.currentEvidence, sourceText);
            if (evidence) rows.push(rowFor('location-current', record,
                original.records[record.id] || null, provenance, evidence, original.currentId,
                original.records[original.currentId]?.name));
            else warnings.push('Ignored the current place: evidence must be one continuous exact quote from the latest message.');
        }
    } else if (currentRef) warnings.push('Ignored the current place: its reference does not exist.');
    else if (own(input, 'currentRef') && input.currentRef === '' && original.currentId) {
        const evidence = sourceEvidence(input.currentEvidence, sourceText);
        if (evidence) rows.push(rowFor('location-current',
            { id: '', name: 'Unknown' }, null, provenance, evidence, original.currentId,
            original.records[original.currentId]?.name));
        else warnings.push('Ignored clearing the current place: evidence must be one continuous exact quote from the latest message.');
    }
    return { rows, warnings };
}

/** Accepted rows select stored payloads. UI edits may change only a place's description. */
export function applyLocationReview(state, pending, accepted, { isSourceCurrent } = {}) {
    const appliedRows = [], warnings = [];
    let result = { ...state, locations: readLocationStore(state) };
    const selected = new Map((accepted || []).filter(row => row?.scope === 'location').map(row => [row.id, row]));
    let waiting = (pending || []).filter(row => row?.scope === 'location' && selected.has(row.id));
    if (!result.locations.enabled) {
        if (waiting.length) warnings.push('Places are disabled for this chat.');
        return { state: result, appliedRows, warnings, remainingRows: waiting };
    }
    const seen = new Set();
    while (waiting.length) {
        let progress = false;
        const next = [];
        for (const row of waiting) {
            if (seen.has(row.id)) continue;
            const payload = row.location;
            const chosen = selected.get(row.id);
            let appliedAfter = row.after;
            try {
                if (!payload || !['location-create', 'location-update', 'location-current'].includes(row.kind)) {
                    throw new Error('Invalid stored place proposal.');
                }
                if (isSourceCurrent && !isSourceCurrent(payload.provenance, row)) throw new Error('The source message changed.');
                const store = readLocationStore(result);
                const existing = own(store.records, payload.id) ? store.records[payload.id] : null;
                if (row.kind === 'location-current') {
                    if (!existing && waiting.some(other => other.kind === 'location-create' && other.location?.id === payload.id)) {
                        next.push(row); continue;
                    }
                    if (store.currentId !== payload.currentBefore) throw new Error('The current place changed since extraction.');
                    if (payload.id && !existing) throw new Error('Accept the new place before making it current.');
                    result = setCurrentLocation(result, payload.id);
                } else {
                    if (!same(existing, payload.before)) throw new Error('The place changed since extraction.');
                    const record = clone(payload.record);
                    if (!record || record.id !== payload.id) throw new Error('Invalid stored place record.');
                    if (record.parentId && !store.records[record.parentId]
                        && waiting.some(other => other.kind === 'location-create' && other.location?.id === record.parentId)) {
                        next.push(row); continue;
                    }
                    if (own(chosen, 'after') && chosen.after !== row.after) {
                        if (typeof chosen.after !== 'string' || chosen.after.trim().length > 4000) throw new Error('Invalid edited description.');
                        record.description = chosen.after.trim();
                    }
                    appliedAfter = record.description;
                    const input = row.kind === 'location-create' ? { ...record, id: undefined } : record;
                    result = editLocation(result, input, { makeId: () => payload.id });
                }
                appliedRows.push({ ...row, after: appliedAfter });
            } catch (error) { warnings.push(`${row.actor || 'Place'}: ${error.message}`); }
            seen.add(row.id);
            progress = true;
        }
        if (!progress) { warnings.push('Place proposals have unresolved parent dependencies.'); break; }
        waiting = next;
    }
    const appliedIds = new Set(appliedRows.map(row => row.id));
    const remainingRows = (pending || []).filter(row => selected.has(row.id) && !appliedIds.has(row.id));
    return { state: result, appliedRows, warnings, remainingRows };
}
