import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocationStore, currentLocationPath, editLocation, deleteLocation, setCurrentLocation, setLocationsEnabled } from '../src/locations/location-store.js';

const add = (state, name, id, rest = {}) => editLocation(state, { name, ...rest }, { makeId: () => id });

test('place records are opt-in, chat-local and independent of the input state', () => {
    const source = { player: { name: 'Traveler' } };
    assert.deepEqual(readLocationStore(source), { enabled: false, currentId: '', records: {} });
    const state = add(source, 'The Lantern', 'tavern', { aliases: ['Lantern', ' lantern ', 'The Lantern'] });
    assert.equal(source.locations, undefined);
    assert.deepEqual(state.locations.records.tavern.aliases, ['Lantern']);
    const copy = readLocationStore(state);
    copy.records.tavern.aliases.push('Inn');
    assert.deepEqual(state.locations.records.tavern.aliases, ['Lantern']);
    assert.equal(setLocationsEnabled(state, true).locations.enabled, true);
    assert.equal(state.locations.enabled, false);
});

test('renaming preserves identity; names and aliases cannot ambiguously identify two places', () => {
    let state = add({}, 'The Lantern', 'tavern', { aliases: ['Inn'] });
    state = setCurrentLocation(state, 'tavern');
    state = editLocation(state, { id: 'tavern', name: 'The Broken Lantern' });
    assert.equal(state.locations.currentId, 'tavern');
    assert.deepEqual(state.locations.records.tavern.aliases, ['Inn']);
    assert.throws(() => add(state, 'inn', 'other'), /already belongs/);
    assert.throws(() => add(state, 'Other', 'other', { aliases: ['THE BROKEN LANTERN'] }), /already belongs/);
    assert.throws(() => editLocation(state, { id: 'missing', name: 'New' }), /no longer exists/);
});

test('containment cannot cycle; deletion detaches children and clears current place', () => {
    let state = add({}, 'Town', 'town');
    state = add(state, 'Tavern', 'tavern', { parentId: 'town' });
    assert.throws(() => editLocation(state, { id: 'town', parentId: 'tavern' }), /contain itself/);
    assert.throws(() => editLocation(state, { id: 'town', parentId: 'unknown' }), /does not exist/);
    state = setCurrentLocation(state, 'town');
    const deleted = deleteLocation(state, 'town');
    assert.equal(deleted.locations.records.tavern.parentId, '');
    assert.equal(deleted.locations.currentId, '');
    assert.ok(state.locations.records.town);
    assert.throws(() => setCurrentLocation(deleted, 'town'), /does not exist/);
});

test('current place path follows chat-owned parents and respects the System switch', () => {
    let state = add({}, 'City', 'city');
    state = add(state, 'Inn', 'inn', { parentId: 'city' });
    state = add(state, 'Room', 'room', { parentId: 'inn' });
    state = setCurrentLocation(state, 'room');
    assert.deepEqual(currentLocationPath(state), []);
    state = setLocationsEnabled(state, true);
    assert.deepEqual(currentLocationPath(state), ['City', 'Inn', 'Room']);
    assert.deepEqual(currentLocationPath(setCurrentLocation(state, 'city')), ['City']);
    assert.deepEqual(currentLocationPath(setCurrentLocation(state, '')), []);
});

test('reading damaged stores repairs dangling and cyclic containment without mutating persistence', () => {
    const state = { locations: { enabled: true, currentId: 'missing', records: {
        a: { name: 'A', parentId: 'b' }, b: { name: 'B', parentId: 'a' },
        c: { name: 'C', parentId: 'missing' }, invalid: null,
    } } };
    const store = readLocationStore(state);
    assert.equal(store.currentId, '');
    assert.equal(store.records.a.parentId, '');
    assert.equal(store.records.c.parentId, '');
    assert.equal(state.locations.records.a.parentId, 'b');
});

test('manual edits reject malformed fields and excessive prose instead of silently erasing facts', () => {
    const state = add({}, 'Town', 'town', { description: 'Old walls.', aliases: ['Home'] });
    for (const patch of [{ description: null }, { description: 4 }, { aliases: 'Home' },
        { aliases: [null] }, { parentId: false }, { name: 'x'.repeat(201) },
        { description: 'x'.repeat(4001) }, { aliases: Array.from({ length: 31 }, (_, i) => `A${i}`) },
        { aliases: ['x'.repeat(201)] }, { loreEntryId: -1 }]) {
        assert.throws(() => editLocation(state, { id: 'town', ...patch }));
    }
    assert.equal(state.locations.records.town.description, 'Old walls.');
    assert.deepEqual(state.locations.records.town.aliases, ['Home']);
    assert.throws(() => editLocation(state, { id: 3, name: 'Other' }), /Invalid place ID/);
    assert.throws(() => setCurrentLocation(state, 3), /Invalid current place ID/);
});

test('reserved IDs and allocation collisions cannot corrupt records; JSON preserves stable identity', () => {
    let state = add({}, 'Town', 'town', { lorebook: 'World', loreEntryId: 0 });
    for (const id of ['__proto__', 'constructor', 'prototype', '', ' town ', 'x'.repeat(201)]) {
        assert.throws(() => add(state, 'Other', id), /Invalid place ID/);
    }
    assert.throws(() => add(state, 'Other', 'town'), /already exists/);
    state = setCurrentLocation(state, 'town');
    state = JSON.parse(JSON.stringify(state));
    state = editLocation(state, { id: 'town', name: 'New Town' });
    assert.equal(state.locations.currentId, 'town');
    assert.equal(state.locations.records.town.loreEntryId, 0);
    const untrusted = JSON.parse('{"locations":{"records":{"__proto__":{"name":"Corrupt"},"ok":{"name":"Town"}}}}');
    assert.deepEqual(Object.keys(readLocationStore(untrusted).records), ['ok']);
    assert.equal({}.name, undefined);
});
