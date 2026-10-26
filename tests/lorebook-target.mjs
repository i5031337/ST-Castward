import test from 'node:test';
import assert from 'node:assert/strict';
import { existingFillLorebookName, newChatLorebookName } from '../src/lore/lorebook-target.js';

test('Fill uses a chosen chat book before a default and ignores stale names', () => {
    assert.equal(existingFillLorebookName('Chat', 'Default', ['Chat', 'Default']), 'Chat');
    assert.equal(existingFillLorebookName('', 'Default', ['Default']), 'Default');
    assert.equal(existingFillLorebookName('Missing', 'Gone', ['Other']), '');
});

test('a Fill chat book has a safe, unique name', () => {
    const first = newChatLorebookName('Alice/Chapter:1');
    assert.ok(first.length > 0);
    assert.doesNotMatch(first, /[\\/:*?"<>|]/);
    assert.notEqual(newChatLorebookName('Alice/Chapter:1', [first]), first);
    assert.ok(newChatLorebookName('x'.repeat(100)).length <= 64);
});
