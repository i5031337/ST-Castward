import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backgroundImageUrl, editLocation, readLocationStore, setCurrentLocation } from '../src/locations/location-store.js';

const source = readFileSync(new URL('../src/locations/location-image.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');
const api = new Function('backgroundImageUrl', 'editLocation', 'readLocationStore',
    `${source}\nreturn { buildPlaceBackgroundPrompt, generatePlaceBackground };`)
    (backgroundImageUrl, editLocation, readLocationStore);

function fixture() {
    let state = editLocation({}, { name: 'Blue Inn', description: 'Copper lamps and an open hearth.' },
        { makeId: () => 'inn' });
    state = setCurrentLocation(state, 'inn');
    state.locations.enabled = true;
    const metadata = { sillynpc_status_state: state };
    let metadataSaves = 0;
    let context = { chatMetadata: metadata, getCurrentChatId: () => 'chat-a',
        saveMetadataDebounced: () => metadataSaves++ };
    const settings = { enabled: true, autoPlaceBackgrounds: false };
    const requests = [], saves = [], events = [];
    let finish;
    const options = {
        currentContext: () => context, settingsProvider: () => settings,
        generate: (prompt, imageOptions) => {
            requests.push({ prompt, imageOptions });
            return new Promise(resolve => { finish = resolve; });
        },
        save: (next, details) => { metadata.sillynpc_status_state = next; saves.push(details); },
        emit: (...args) => events.push(args),
    };
    return { metadata, settings, requests, saves, events, options,
        get context() { return context; }, set context(value) { context = value; },
        get metadataSaves() { return metadataSaves; },
        finish: image => finish(image) };
}

test('background prompt includes only the selected Place card', () => {
    const store = { records: {
        town: { name: 'Frostmere', description: 'Snowy town walls.' },
        house: { name: 'Blue House', description: 'A blue porch and garden.', parentId: 'town' },
        room: { name: 'Nursery', description: 'Painted stars on the ceiling.', parentId: 'house' },
    } };
    const prompt = api.buildPlaceBackgroundPrompt(store, 'house');
    assert.match(prompt, /Blue House/);
    assert.match(prompt, /blue porch and garden/);
    for (const excluded of ['Frostmere', 'Snowy town walls', 'Nursery', 'Painted stars']) {
        assert.ok(!prompt.includes(excluded), `${excluded} should not enter this Place's image prompt`);
    }
});

test('new Place generation is opt in and saves a linked landscape without a chat message', async () => {
    const f = fixture();
    assert.equal(await api.generatePlaceBackground('inn', { ...f.options, automatic: true }), false);
    f.settings.autoPlaceBackgrounds = true;
    const task = api.generatePlaceBackground('inn', { ...f.options, automatic: true });
    assert.equal(f.requests.length, 1);
    assert.match(f.requests[0].prompt, /Blue Inn[\s\S]*Copper lamps/);
    const { width, height } = f.requests[0].imageOptions.shape.pixels;
    assert.ok(width > height, 'Place backgrounds use a landscape image');
    assert.equal(f.requests[0].imageOptions.gallery, false);
    assert.equal(f.requests[0].imageOptions.extend, false);
    assert.equal(f.requests[0].imageOptions.edit, false);
    assert.equal(api.generatePlaceBackground('inn', { ...f.options, automatic: true }), task);
    f.finish('/user/images/blue inn.png');
    assert.equal(await task, true);
    assert.equal(f.metadata.sillynpc_status_state.locations.records.inn.backgroundImage,
        'url("user/images/blue%20inn.png")');
    assert.deepEqual(f.metadata.chat_backgrounds, ['user/images/blue inn.png']);
    assert.equal(f.saves[0].recordHistory, false);
    assert.equal(f.events[0][0], 'sillynpc-status-updated');
});

test('changed chat, Place, or image discards an in-flight result', async () => {
    for (const change of [
        f => { f.context = { chatMetadata: {}, getCurrentChatId: () => 'chat-b' }; },
        f => { f.metadata.sillynpc_status_state = editLocation(f.metadata.sillynpc_status_state,
            { id: 'inn', description: 'The roof collapsed.' }); },
        f => { f.metadata.sillynpc_status_state = editLocation(f.metadata.sillynpc_status_state,
            { id: 'inn', backgroundImage: 'url("user/images/manual.png")' }); },
    ]) {
        const f = fixture();
        f.settings.autoPlaceBackgrounds = true;
        const task = api.generatePlaceBackground('inn', { ...f.options, automatic: true });
        change(f);
        f.finish('/user/images/generated.png');
        assert.equal(await task, false);
        assert.equal(f.saves.length, 0);
        assert.equal(f.metadata.chat_backgrounds, undefined);
    }
});

test('manual generation works with automatic drawing off and refuses inline image data', async () => {
    const f = fixture();
    const task = api.generatePlaceBackground('inn', f.options);
    f.finish('data:image/png;base64,aaaa');
    await assert.rejects(task, /did not save a background file/);
    assert.equal(f.saves.length, 0);
});
