import test from 'node:test';
import assert from 'node:assert/strict';
import { editLocation, setCurrentLocation } from '../src/locations/location-store.js';
import { buildLocationProposals, applyLocationReview } from '../src/locations/location-proposals.js';

const enabled = () => ({ locations: { enabled: true, currentId: '', records: {} } });
const options = () => { let id = 0; return { provenance: { messageId: 3, hash: 'original' },
    makeId: () => `p${++id}` }; };
const discovery = { places: [
    { name: 'Lantern', description: 'An inn in Town.', parent: 'Town' },
    { name: 'Town', description: 'A town.' },
], current: 'Lantern' };

test('location discovery requires opt-in but accepts proposals without citations', () => {
    assert.equal(buildLocationProposals({}, discovery, options()).rows.length, 0);
    const result = buildLocationProposals(enabled(), { places: [
        { name: 'Lantern' },
    ], current: 'Lantern' }, options());
    assert.deepEqual(result.rows.map(row => row.kind), ['location-create', 'location-current']);
    assert.deepEqual(result.warnings, []);
});

test('a current marker needs a known or proposed place name', () => {
    const result = buildLocationProposals(enabled(), { places: [
        { name: 'Penelope\'s Office' },
    ], current: 'missing' }, options());
    assert.deepEqual(result.rows.map(row => row.kind), ['location-create']);
    assert.match(result.warnings[0], /name is unknown or ambiguous/);
});

test('new parent dependencies and current place apply in any review order', () => {
    const state = enabled();
    const { rows } = buildLocationProposals(state, discovery, options());
    assert.equal(rows.length, 3);
    const result = applyLocationReview(state, [...rows].reverse(), rows);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.appliedRows.length, 3);
    assert.equal(result.state.locations.currentId, 'p1');
    assert.equal(result.state.locations.records.p1.parentId, 'p2');
    assert.deepEqual(state.locations.records, {});
});

test('case drift in a unique place name preserves proposed containment and movement', () => {
    const state = enabled();
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { name: 'Lantern', parent: 'TOWN' },
        { name: 'Town' },
    ], current: 'LANTERN' }, options());
    assert.deepEqual(warnings, []);
    const result = applyLocationReview(state, rows, rows);
    assert.equal(result.state.locations.records.p1.parentId, 'p2');
    assert.equal(result.state.locations.currentId, 'p1');
});

test('ambiguous imported aliases leave parent and current identity unresolved', () => {
    const state = enabled();
    state.locations.records = {
        north: { name: 'North Town', aliases: ['Town'] },
        south: { name: 'South Town', aliases: ['town'] },
    };
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { name: 'Lantern', parent: 'TOWN' },
    ], current: 'Town' }, options());
    assert.equal(rows[0].location.record.parentId, '');
    assert.equal(rows.some(row => row.kind === 'location-current'), false);
    assert.ok(warnings.length);
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
    let state = editLocation(enabled(), { name: 'Lantern', aliases: ['Inn'], description: 'An inn.', backgroundImage: 'url("user/images/inn.png")' }, { makeId: () => 'inn' });
    const { rows } = buildLocationProposals(state, { places: [
        { name: 'Lantern', description: 'An inn with a burned roof.' },
    ] }, options());
    const applied = applyLocationReview(state, rows, rows);
    assert.equal(applied.state.locations.records.inn.description, 'An inn with a burned roof.');
    assert.equal(applied.state.locations.records.inn.backgroundImage, 'url("user/images/inn.png")');
    assert.deepEqual(applied.state.locations.records.inn.aliases, ['Inn']);
    state = editLocation(state, { id: 'inn', description: 'Manual description.' });
    assert.equal(applyLocationReview(state, rows, rows).appliedRows.length, 0);
});

test('null optional parent from a reader preserves existing containment', () => {
    let state = editLocation(enabled(), { name: 'Town' }, { makeId: () => 'town' });
    state = editLocation(state, { name: 'Lantern', parentId: 'town', description: 'An inn.' }, { makeId: () => 'inn' });
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { name: 'Lantern', description: 'An inn with a burned roof.', parent: null },
    ] }, options());
    assert.deepEqual(warnings, []);
    assert.equal(rows.length, 1);
    const result = applyLocationReview(state, rows, rows);
    assert.equal(result.state.locations.records.inn.parentId, 'town');
    assert.equal(result.state.locations.records.inn.description, 'An inn with a burned roof.');
});

test('unknown parent name does not discard a proposed place or invent containment', () => {
    const state = enabled();
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { name: 'Old Mill', parent: 'not-a-known-id' },
    ], current: 'Old Mill' }, options());
    assert.deepEqual(rows.map(row => row.kind), ['location-create', 'location-current']);
    assert.equal(rows[0].location.record.parentId, '');
    assert.ok(warnings.some(warning => /unknown parent/.test(warning)));
});

test('known names reuse the stored identity for containment and current place', () => {
    const state = editLocation(enabled(), { name: 'Moonbeam Café' }, { makeId: () => 'home' });
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { name: 'Glasshouse', parent: 'Moonbeam Café' },
        { name: 'Moonbeam Café' },
    ], current: 'Glasshouse' }, options());
    assert.deepEqual(rows.map(row => row.kind), ['location-create', 'location-current']);
    assert.equal(rows[0].location.record.parentId, 'home');
    assert.deepEqual(warnings, []);
});

test('current-place proposals cannot overwrite a later manual scene change', () => {
    let state = editLocation(enabled(), { name: 'Lantern' }, { makeId: () => 'inn' });
    const { rows } = buildLocationProposals(state, { current: 'Lantern' }, options());
    state = editLocation(state, { name: 'Town' }, { makeId: () => 'town' });
    state = setCurrentLocation(state, 'town');
    assert.equal(applyLocationReview(state, rows, rows).appliedRows.length, 0);
});

test('clearing current place requires an explicit empty reference', () => {
    const state = setCurrentLocation(editLocation(enabled(), { name: 'Lantern' }, { makeId: () => 'inn' }), 'inn');
    assert.equal(buildLocationProposals(state, {}, options()).rows.length, 0);
    const { rows } = buildLocationProposals(state, { current: '' }, options());
    const result = applyLocationReview(state, rows, rows);
    assert.equal(result.appliedRows.length, 1);
    assert.equal(result.state.locations.currentId, '');
});

test('cyclic and ambiguous reader discoveries are held out of the store', () => {
    const cycle = buildLocationProposals(enabled(), { places: [
        { name: 'A', parent: 'b' },
        { name: 'B', parent: 'a' },
    ] }, options());
    assert.equal(cycle.rows.length, 0);
    assert.ok(cycle.warnings.length);
    const duplicate = buildLocationProposals(enabled(), { places: [
        { name: 'Inn' },
        { name: 'Other', aliases: ['inn'] },
    ] }, options());
    assert.equal(duplicate.rows.length, 1);
});

test('malformed supplied fields cannot erase saved fields, and repeated names are never resolved arbitrarily', () => {
    const state = editLocation(enabled(), { name: 'Lantern', aliases: ['Inn'], description: 'A familiar inn.' }, { makeId: () => 'inn' });
    for (const patch of [{ aliases: null }, { aliases: 'Other' }, { description: null }, { parent: 3 }]) {
        const result = buildLocationProposals(state, { places: [{ name: 'Lantern', ...patch }] }, options());
        assert.equal(result.rows.length, 0);
        assert.ok(result.warnings.length);
    }
    const result = buildLocationProposals(state, { places: [
        { name: 'Lantern', description: 'First guess' },
        { name: 'Lantern', description: 'Second guess' },
    ] }, options());
    assert.equal(result.rows.length, 0);
    assert.equal(state.locations.records.inn.name, 'Lantern');
});

test('allocated stable IDs cannot overwrite existing places or collide across discoveries', () => {
    const state = editLocation(enabled(), { name: 'Existing' }, { makeId: () => 'p1' });
    const result = buildLocationProposals(state, { places: [
        { name: 'Different' },
    ] }, options());
    assert.equal(result.rows.length, 0);
    assert.ok(result.warnings.some(warning => /collision/.test(warning)));
    const duplicates = buildLocationProposals(enabled(), { places: [
        { name: 'One' },
        { name: 'Two' },
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
    const input = { places: Array.from({ length: 45 }, (_, i) => ({ name: `Place ${i}` })) };
    const result = buildLocationProposals(enabled(), input, options());
    assert.ok(result.rows.length > 0 && result.rows.length < input.places.length);
    assert.ok(result.warnings.length > 0);
    const tooLong = buildLocationProposals(enabled(), { places: [{ name: 'Place', description: 'x'.repeat(4001) }] }, options());
    assert.equal(tooLong.rows.length, 0);
    const pending = buildLocationProposals(enabled(), { places: [{ name: 'Place' }] }, options()).rows;
    const edited = applyLocationReview(enabled(), pending, pending.map(row => ({ ...row, after: 'x'.repeat(4001) })));
    assert.equal(edited.appliedRows.length, 0);
    assert.deepEqual(edited.state.locations.records, {});
});

test('disabling places preserves pending selections without applying them', () => {
    const state = enabled();
    const { rows } = buildLocationProposals(state, discovery, options());
    state.locations.enabled = false;
    const result = applyLocationReview(state, rows, rows);
    assert.equal(result.appliedRows.length, 0);
    assert.equal(result.remainingRows.length, 3);
    assert.ok(result.warnings.some(warning => /disabled/.test(warning)));
    assert.deepEqual(result.state.locations.records, {});
});

test('known aliases update and select the existing place without renaming it', () => {
    let state = editLocation(enabled(), { name: 'The Lantern', aliases: ['Lantern Inn'],
        description: 'A familiar inn.', backgroundImage: 'url("user/images/inn.png")' }, { makeId: () => 'opaque-stored-id' });
    const { rows, warnings } = buildLocationProposals(state, { places: [
        { name: 'LANTERN INN', description: 'A familiar inn with a repaired roof.' },
    ], current: 'Lantern Inn' }, options());
    assert.deepEqual(warnings, []);
    assert.deepEqual(rows.map(row => row.kind), ['location-update', 'location-current']);
    assert.ok(rows.every(row => row.location.id === 'opaque-stored-id'));
    state = applyLocationReview(state, rows, rows).state;
    assert.equal(state.locations.currentId, 'opaque-stored-id');
    assert.equal(state.locations.records['opaque-stored-id'].name, 'The Lantern');
    assert.equal(state.locations.records['opaque-stored-id'].backgroundImage, 'url("user/images/inn.png")');
});

test('remembering another place preserves the current scene', () => {
    const state = setCurrentLocation(editLocation(enabled(), { name: 'Moonbeam Café' },
        { makeId: () => 'cafe-id' }), 'cafe-id');
    const { rows } = buildLocationProposals(state, { places: [
        { name: 'Glasshouse', description: 'A conservatory with a glass roof.' },
    ] }, options());
    assert.deepEqual(rows.map(row => row.kind), ['location-create']);
    const applied = applyLocationReview(state, rows, rows).state;
    assert.equal(applied.locations.currentId, 'cafe-id');
    assert.ok(Object.values(applied.locations.records).some(place => place.name === 'Glasshouse'));
});
