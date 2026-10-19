import assert from 'node:assert/strict';
import test from 'node:test';
import { reorderItem } from '../src/ui/shared/ui-reorder.js';

test('reordering inserts before or after a destination in either direction', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => ({ id }));
    for (const [source, target, after, expected] of [
        [a, c, false, [b, a, c, d]], [a, c, true, [b, c, a, d]],
        [d, b, false, [a, d, b, c]], [d, b, true, [a, b, d, c]],
    ]) {
        const items = [a, b, c, d];
        assert.equal(reorderItem(items, source, target, after), true);
        assert.deepEqual(items, expected);
    }
});

test('protected prefixes, foreign objects, and unchanged positions do not mutate the list', () => {
    const [identifier, a, b] = [{ id: 'name' }, { id: 'a' }, { id: 'b' }];
    const items = [identifier, a, b];
    for (const [source, target, after, minimum] of [
        [identifier, b, true, 1], [b, identifier, false, 1],
        [{ id: 'a' }, b, true, 0], [a, {}, true, 0],
        [a, a, true, 0], [a, b, false, 0], [b, a, true, 0],
    ]) {
        assert.equal(reorderItem(items, source, target, after, minimum), false);
        assert.deepEqual(items, [identifier, a, b]);
    }
    assert.equal(reorderItem(items, b, identifier, true, 1), true);
    assert.deepEqual(items, [identifier, b, a]);
});
