import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLocationStore, editLocation, setCurrentLocation, setLocationsEnabled, backgroundImageUrl } from '../src/locations/location-store.js';

const source = readFileSync(new URL('../src/locations/location-background.js', import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
    .replaceAll('export function ', 'function ');
const sync = new Function('readLocationStore', 'backgroundImageUrl', `${source}\nreturn syncPlaceBackground;`)(readLocationStore, backgroundImageUrl);

test('a confirmed place applies its linked background to this chat once', () => {
    let state = editLocation({}, { name: 'Tavern', backgroundImage: 'url("user/images/tavern.png")' }, { makeId: () => 'tavern' });
    state = setLocationsEnabled(setCurrentLocation(state, 'tavern'), true);
    const metadata = { sillynpc_status_state: state };
    let saves = 0;
    const context = { chatMetadata: metadata, getCurrentChatId: () => 'chat-a', saveMetadataDebounced: () => saves++ };
    const background = { style: { backgroundImage: '' } };
    assert.equal(sync(context, background), true);
    assert.equal(metadata.custom_background, 'url("user/images/tavern.png")');
    assert.equal(background.style.backgroundImage, metadata.custom_background);
    assert.equal(saves, 1);
    assert.equal(sync(context, background), false);
    assert.equal(saves, 1);
    metadata.sillynpc_status_state = setCurrentLocation(state, '');
    assert.equal(sync(context, background), false);
    assert.equal(metadata.custom_background, 'url("user/images/tavern.png")');
    metadata.sillynpc_status_state = state;
    assert.equal(sync(context, background), true);
    assert.equal(saves, 1);
});

test('background links stay within an open, enabled chat', () => {
    let state = editLocation({}, { name: 'Tavern', backgroundImage: 'url("user/images/tavern.png")' }, { makeId: () => 'tavern' });
    state = setCurrentLocation(state, 'tavern');
    const metadata = { sillynpc_status_state: state };
    const background = { style: { backgroundImage: '' } };
    const context = { chatMetadata: metadata, getCurrentChatId: () => null };
    assert.equal(sync(context, background), false);
    context.getCurrentChatId = () => 'chat-b';
    assert.equal(sync(context, background), false);
    metadata.sillynpc_status_state = setLocationsEnabled(state, true);
    assert.equal(sync(context, background), true);
});
