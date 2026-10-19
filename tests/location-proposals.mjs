import test from 'node:test';
import assert from 'node:assert/strict';
import { editLocation, setLocationsEnabled, setCurrentLocation } from '../src/locations/location-store.js';
import { buildLocationProposals, applyLocationReview } from '../src/locations/location-proposals.js';

const enabled = () => setLocationsEnabled({}, true);
const options = () => { let id = 0; return { provenance: { messageId: 3, hash: 'original' },
    sourceText: 'You enter the Lantern in Town. Its roof has burned.', makeId: () => `p${++id}` }; };
const discovery = { places: [
    { ref: 'inn', name: 'Lantern', description: 'An inn in Town.', parentRef: 'town', evidence: 'the Lantern in Town' },
    { ref: 'town', name: 'Town', description: 'A town.', evidence: 'in Town' },
], currentRef: 'inn', currentEvidence: 'You enter the Lantern' };

test('location discovery requires opt-in and exact evidence from the source message', () => {
    assert.equal(buildLocationProposals({}, discovery, options()).rows.length, 0);
    const result = buildLocationProposals(enabled(), { places: [
        { ref: 'x', name: 'Invented', evidence: 'an invented place' },
    ], currentRef: 'x', currentEvidence: 'You enter' }, options());
    assert.equal(result.rows.length, 0);
    assert.ok(result.warnings.length);
});

test('a spliced arrival quote cannot move the current marker', () => {
    const sourceText = 'She leads you down a short, quiet hallway. She opens a door at the end and gestures for you to enter. Her office is small and smells of vanilla and old paper.';
    const result = buildLocationProposals(enabled(), { places: [
        { ref: 'office', name: 'Penelope\'s Office', evidence: 'Her office is small and smells of vanilla and old paper.' },
    ], currentRef: 'office', currentEvidence: 'She leads you down a short, quiet hallway... gestures for you to enter.' },
    { ...options(), sourceText });
    assert.deepEqual(result.rows.map(row => row.kind), ['location-create']);
    assert.match(result.warnings[0], /one continuous exact quote/);
});

test('new parent dependencies and current place apply in any review order', () => {
    const state = enabled();
    const { rows } = buildLocationProposals(state, discovery, options());
    assert.equal(rows.length, 3);
    assert.ok(Object.isFrozen(rows[0].location.record));
    const result = applyLocationReview(state, [...rows].reverse(), rows);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.appliedRows.length, 3);
    assert.equal(result.state.locations.currentId, 'p1');
    assert.equal(result.state.locations.records.p1.parentId, 'p2');
    assert.deepEqual(state.locations.records, {});
});

test('rejecting a parent or a new current target cannot create dangling links', () => {
    const state = enabled();
    const { rows } = buildLocationProposals(state, discovery, options());
    const childAndCurrent = rows.filter(row => row.location.id === 'p1');
    const result = applyLocationReview(state, rows, childAndCurrent);
    assert.equal(result.appliedRows.length, 0);
    assert.equal(result.remainingRows.length, 2);
    assert.deepEqual(result.state.locations.records, {});
    assert.ok(result.warnings.length);
});

test('reviews trust stored payloads, accept description edits and reject stale sources', () => {
    const state = enabled();
    const { rows } = buildLocationProposals(state, discovery, options());
    const town = rows.find(row => row.location.id === 'p2');
    const forged = { ...town, location: { id: 'forged' }, after: 'A quiet town.' };
    const result = applyLocationReview(state, rows, [forged]);
    assert.equal(result.state.locations.records.p2.description, 'A quiet town.');
    assert.equal(result.state.locations.records.forged, undefined);
    const stale = applyLocationReview(state, rows, rows, { isSourceCurrent: provenance => provenance.hash !== 'original' });
    assert.equal(stale.appliedRows.length, 0);
    assert.ok(stale.warnings.some(warning => /source message changed/.test(warning)));
});

test('updates preserve omitted fields and fail safely after manual edits', () => {
    let state = editLocation(enabled(), { name: 'Lantern', aliases: ['Inn'], description: 'An inn.', lorebook: 'World', loreEntryId: 4 }, { makeId: () => 'inn' });
    const { rows } = buildLocationProposals(state, { places: [
        { ref: 'inn', description: 'An inn with a burned roof.', evidence: 'Its roof has burned.' },
    ] }, options());
    const applied = applyLocationReview(state, rows, rows);
    assert.equal(applied.state.locations.records.inn.description, 'An inn with a burned roof.');
    assert.equal(applied.state.locations.records.inn.loreEntryId, 4);
    assert.deepEqual(applied.state.locations.records.inn.aliases, ['Inn']);
    state = editLocation(state, { id: 'inn', description: 'Manual description.' });
    assert.equal(applyLocationReview(state, rows, rows).appliedRows.length, 0);
});

test('null optional parent from a reader preserves existing containment', () => {
    let state = editLocation(enabled(), { name: 'Town' }, { makeId: () => 'town' });
    state = editLocation(state, { name: 'Lantern', parentId: 'town', description: 'An inn.' }, { makeId: () => 'inn' });
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { ref: 'inn', description: 'An inn with a burned roof.', parentRef: null, evidence: 'Its roof has burned.' },
    ] }, options());
    assert.deepEqual(warnings, []);
    assert.equal(rows.length, 1);
    const result = applyLocationReview(state, rows, rows);
    assert.equal(result.state.locations.records.inn.parentId, 'town');
    assert.equal(result.state.locations.records.inn.description, 'An inn with a burned roof.');
});

test('unknown parent reference does not discard an evidenced place or invent containment', () => {
    const state = enabled();
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { ref: 'mill', name: 'Old Mill', parentRef: 'not-a-known-id', evidence: 'inside the Old Mill' },
    ], currentRef: 'mill', currentEvidence: 'You arrive inside the Old Mill' },
    { ...options(), sourceText: 'You arrive inside the Old Mill.' });
    assert.deepEqual(rows.map(row => row.kind), ['location-create', 'location-current']);
    assert.equal(rows[0].location.record.parentId, '');
    assert.ok(warnings.some(warning => /unknown parent/.test(warning)));
});

test('rejected duplicate parent proposal cannot strand a new evidenced place', () => {
    const state = editLocation(enabled(), { name: 'Moonbeam Café' }, { makeId: () => 'home' });
    const sourceText = 'Alex and June leave Moonbeam Café and arrive inside the Glasshouse.';
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { ref: 'glass', name: 'Glasshouse', parentRef: 'cafe', evidence: 'arrive inside the Glasshouse' },
        { ref: 'cafe', name: 'Moonbeam Café', evidence: 'leave Moonbeam Café' },
    ], currentRef: 'glass', currentEvidence: sourceText },
    { ...options(), sourceText });
    assert.deepEqual(rows.map(row => row.kind), ['location-create', 'location-current']);
    assert.equal(rows[0].location.record.parentId, '');
    assert.ok(warnings.some(warning => /already belongs/.test(warning)));
    assert.ok(warnings.some(warning => /unknown parent/.test(warning)));
});

test('case-only evidence drift displays the exact source excerpt in review', () => {
    const { rows } = buildLocationProposals(enabled(), { places: [
        { ref: 'mill', name: 'Old Mill', evidence: 'Arrive inside the Old Mill' },
    ], currentRef: 'mill', currentEvidence: 'Arrive inside the Old Mill' },
    { ...options(), sourceText: 'You arrive inside the Old Mill.' });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].note, 'arrive inside the Old Mill');
    assert.equal(rows[1].note, 'arrive inside the Old Mill');
});

test('current-place proposals cannot overwrite a later manual scene change', () => {
    let state = editLocation(enabled(), { name: 'Lantern' }, { makeId: () => 'inn' });
    const { rows } = buildLocationProposals(state, { currentRef: 'inn', currentEvidence: 'You enter the Lantern' }, options());
    state = editLocation(state, { name: 'Town' }, { makeId: () => 'town' });
    state = setCurrentLocation(state, 'town');
    assert.equal(applyLocationReview(state, rows, rows).appliedRows.length, 0);
});

test('clearing current place requires an explicit empty reference and source evidence', () => {
    const state = setCurrentLocation(editLocation(enabled(), { name: 'Lantern' }, { makeId: () => 'inn' }), 'inn');
    assert.equal(buildLocationProposals(state, { currentRef: '' }, options()).rows.length, 0);
    assert.equal(buildLocationProposals(state, {}, options()).rows.length, 0);
    const { rows } = buildLocationProposals(state, { currentRef: '', currentEvidence: 'You enter' }, options());
    const result = applyLocationReview(state, rows, rows);
    assert.equal(result.appliedRows.length, 1);
    assert.equal(result.state.locations.currentId, '');
});

test('cyclic and ambiguous reader discoveries are held out of the store', () => {
    const cycle = buildLocationProposals(enabled(), { places: [
        { ref: 'a', name: 'A', parentRef: 'b', evidence: 'Town' },
        { ref: 'b', name: 'B', parentRef: 'a', evidence: 'Town' },
    ] }, options());
    assert.equal(cycle.rows.length, 0);
    assert.ok(cycle.warnings.length);
    const duplicate = buildLocationProposals(enabled(), { places: [
        { ref: 'a', name: 'Inn', evidence: 'Town' },
        { ref: 'b', name: 'Other', aliases: ['inn'], evidence: 'Town' },
    ] }, options());
    assert.equal(duplicate.rows.length, 1);
});

test('malformed supplied fields cannot erase saved fields, and repeated refs are never resolved arbitrarily', () => {
    const state = editLocation(enabled(), { name: 'Lantern', aliases: ['Inn'], description: 'A familiar inn.' }, { makeId: () => 'inn' });
    for (const patch of [{ aliases: null }, { aliases: 'Other' }, { description: null }, { parentRef: 3 }]) {
        const result = buildLocationProposals(state, { places: [{ ref: 'inn', evidence: 'Town', ...patch }] }, options());
        assert.equal(result.rows.length, 0);
        assert.ok(result.warnings.length);
    }
    const result = buildLocationProposals(state, { places: [
        { ref: 'inn', name: 'First guess', evidence: 'Town' },
        { ref: 'inn', name: 'Second guess', evidence: 'Town' },
    ] }, options());
    assert.equal(result.rows.length, 0);
    assert.equal(state.locations.records.inn.name, 'Lantern');
});

test('allocated stable IDs cannot overwrite existing places or collide across discoveries', () => {
    const state = editLocation(enabled(), { name: 'Existing' }, { makeId: () => 'p1' });
    const result = buildLocationProposals(state, { places: [
        { ref: 'new', name: 'Different', evidence: 'Town' },
    ] }, options());
    assert.equal(result.rows.length, 0);
    assert.ok(result.warnings.some(warning => /collision/.test(warning)));
    const duplicates = buildLocationProposals(enabled(), { places: [
        { ref: 'a', name: 'One', evidence: 'Town' },
        { ref: 'b', name: 'Two', evidence: 'Town' },
    ] }, { ...options(), makeId: () => 'same' });
    assert.equal(duplicates.rows.length, 1);
    assert.ok(duplicates.warnings.some(warning => /collision/.test(warning)));
});

test('serialized pending rows keep trusted identity and prevent repeated application', () => {
    const state = enabled();
    const { rows } = buildLocationProposals(state, discovery, options());
    const pending = JSON.parse(JSON.stringify(rows));
    const chosen = pending.map(row => ({ ...row, kind: 'location-update', actor: 'Forged',
        location: { id: 'forged', provenance: { hash: 'new' } },
        ...(row.kind === 'location-current' ? { after: 'Forged destination' } : {}),
    }));
    let seenProvenance;
    const applied = applyLocationReview(state, pending, chosen, { isSourceCurrent: provenance => {
        seenProvenance = provenance; return provenance.hash === 'original';
    } });
    assert.equal(seenProvenance.hash, 'original');
    assert.equal(applied.appliedRows.length, 3);
    assert.equal(applied.state.locations.currentId, 'p1');
    assert.equal(applied.appliedRows.find(row => row.kind === 'location-current').after, 'Lantern');
    const replayed = applyLocationReview(applied.state, pending, chosen);
    assert.equal(replayed.appliedRows.length, 0);
    assert.deepEqual(replayed.state, applied.state);
    assert.equal(applyLocationReview(state, pending, [{ ...chosen[0], id: 'not-pending' }]).appliedRows.length, 0);
});

test('reader place proposals are bounded and never truncate a replacement description', () => {
    const input = { places: Array.from({ length: 45 }, (_, i) => ({ ref: `r${i}`, name: `Place ${i}`, evidence: 'Town' })) };
    const result = buildLocationProposals(enabled(), input, options());
    assert.equal(result.rows.length, 40);
    assert.ok(result.warnings.some(warning => /first 40/.test(warning)));
    const tooLong = buildLocationProposals(enabled(), { places: [{ ref: 'x', name: 'Place', description: 'x'.repeat(4001), evidence: 'Town' }] }, options());
    assert.equal(tooLong.rows.length, 0);
    const pending = buildLocationProposals(enabled(), { places: [{ ref: 'x', name: 'Place', evidence: 'Town' }] }, options()).rows;
    const edited = applyLocationReview(enabled(), pending, pending.map(row => ({ ...row, after: 'x'.repeat(4001) })));
    assert.equal(edited.appliedRows.length, 0);
    assert.deepEqual(edited.state.locations.records, {});
});

test('disabling places preserves pending selections without applying them', () => {
    const state = enabled();
    const { rows } = buildLocationProposals(state, discovery, options());
    const result = applyLocationReview(setLocationsEnabled(state, false), rows, rows);
    assert.equal(result.appliedRows.length, 0);
    assert.equal(result.remainingRows.length, 3);
    assert.ok(result.warnings.some(warning => /disabled/.test(warning)));
    assert.deepEqual(result.state.locations.records, {});
});
