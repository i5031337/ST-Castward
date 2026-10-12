import test from 'node:test';
import assert from 'node:assert/strict';
import { presentSpriteCards, validLatestSprite, mayRememberSprite, latestPackSprite } from '../src/expressions/scene-sprite-state.js';

const card = { id: 'bianca', name: 'Bianca', aliases: ['Receptionist'], imageUrl: '/portrait.png',
    presentation: { expressions: { spriteFolder: 'SillyNPC/Bianca' } } };
const latest = { path: '/characters/SillyNPC/Bianca/joy.png', label: 'joy', reference: card.imageUrl,
    folder: card.presentation.expressions.spriteFolder, messageId: 3, lineIndex: 2, source: 123 };

test('scene sprites include present NPCs and aliases, exclude offstage cards and the player', () => {
    const player = { id: 'player', name: 'Theo' };
    const absent = { id: 'other', name: 'Felicity' };
    const state = { player: { name: 'Theo' }, characters: [{ name: ' receptionist ' }, { name: 'Theo' }] };
    assert.deepEqual(presentSpriteCards([card, player, absent], state), [card]);
    assert.deepEqual(presentSpriteCards([card], { characters: [{ id: 'bianca', name: 'Renamed' }] }), [card]);
    assert.deepEqual(presentSpriteCards([card], { characters: [] }), []);
});

test('saved sprites survive reload only for the same portrait, folder, and source message', () => {
    assert.equal(validLatestSprite(card, latest, () => 123), true);
    assert.equal(validLatestSprite(card, latest, () => 456), false);
    assert.equal(validLatestSprite(card, latest, () => null), false);
    assert.equal(validLatestSprite({ ...card, imageUrl: '/new.png' }, latest, () => 123), false);
    assert.equal(validLatestSprite(card, { ...latest, folder: 'Other' }, () => 123), false);
    assert.equal(validLatestSprite(card, { ...latest, path: 'https://example.com/sprite.png' }, () => 123), false);
    assert.equal(validLatestSprite(card, { ...latest, source: null }, () => null), true);
});

test('slow images from earlier lines do not displace newer expressions or manual selections', () => {
    assert.equal(mayRememberSprite(latest, { ...latest, lineIndex: 1 }, () => 123), false);
    assert.equal(mayRememberSprite(latest, { ...latest, messageId: 2 }, () => 123), false);
    assert.equal(mayRememberSprite(latest, { ...latest, messageId: 4 }, () => 123), true);
    assert.equal(mayRememberSprite(latest, { ...latest, lineIndex: 1 }, () => 456), true);
    const manual = { ...latest, source: null, lineIndex: Number.MAX_SAFE_INTEGER };
    assert.equal(mayRememberSprite(manual, latest, () => 123), false);
    assert.equal(mayRememberSprite(manual, { ...latest, messageId: 4 }, () => 123), true);
});

test('existing packs show their most recently saved sprite before a selection has been recorded', () => {
    const sprites = [{ label: 'neutral', path: '/characters/NPC/neutral.png?t=20261012100000' },
        { label: 'joy', path: '/characters/NPC/joy.png?t=20261012113000' }];
    assert.equal(latestPackSprite(sprites), sprites[1].path);
    assert.equal(latestPackSprite([...sprites].reverse()), sprites[1].path);
    assert.equal(latestPackSprite([{ label: 'joy', path: '/joy' }]), '/joy');
    assert.equal(latestPackSprite([]), '');
});
