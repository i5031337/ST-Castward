import test from 'node:test';
import assert from 'node:assert/strict';
import { planHistoryWindow } from '../src/prompts/history-window.js';

const countTokens = text => text.length;
const messages = lengths => lengths.map((length, index) => ({
    index, is_user: index % 2 === 1, mes: 'x'.repeat(length),
}));

test('the cutoff stays fixed until visible history reaches the maximum', async () => {
    const saved = messages([3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const limits = { min: 12, max: 18, countTokens };
    const initial = await planHistoryWindow(saved, { first: 0, ...limits });
    assert.equal(initial.first, 5);
    assert.equal(initial.start, 5);
    assert.equal(initial.trimmed, true);

    saved.push(...messages([2, 2]).map((message, index) => ({ ...message,
        index: saved.length + index, is_user: index === 0 })));
    const next = await planHistoryWindow(saved, { first: initial.first, ...limits });
    assert.deepEqual(next, { first: 5, start: 5, trimmed: false });

    saved.push(...messages([4, 4]).map((message, index) => ({ ...message,
        index: saved.length + index, is_user: index === 0 })));
    const later = await planHistoryWindow(saved, { first: next.first, ...limits });
    assert.equal(later.trimmed, true);
    assert.equal(saved[later.start].is_user, true);
    assert.ok(later.first > initial.first);
});

test('the plan never trims inside the only remaining player turn', async () => {
    const saved = messages([3, 20, 20]);
    assert.deepEqual(await planHistoryWindow(saved, { first: 0, min: 5, max: 10, countTokens }),
        { first: 0, start: 0, trimmed: false });
    assert.equal(saved.length, 3);
});

test('consecutive player messages remain in the same visible turn', async () => {
    const saved = [
        { index: 0, is_user: false, mes: 'x'.repeat(5) },
        { index: 1, is_user: true, mes: 'x'.repeat(5) },
        { index: 2, is_user: false, mes: 'x'.repeat(5) },
        { index: 3, is_user: true, mes: 'x'.repeat(5) },
        { index: 4, is_user: true, mes: 'x'.repeat(5) },
        { index: 5, is_user: false, mes: 'x'.repeat(5) },
    ];
    const plan = await planHistoryWindow(saved, { first: 0, min: 15, max: 25, countTokens });
    assert.deepEqual(plan, { first: 3, start: 3, trimmed: true });
});

