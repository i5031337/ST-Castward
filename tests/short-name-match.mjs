import assert from 'node:assert/strict';
import test from 'node:test';
import { cardForShortName } from '../src/characters/short-name-match.js';
import { cardForDialogueName } from '../src/chat/dialogue-discovery.js';

const card = (name, aliases = []) => ({ name, aliases });

test('short speaker labels resolve whole first/last names and names without titles', () => {
    for (const [full, short] of [
        ['Professor Vale', 'Vale'], ['Doctor Sen', 'Sen'], ['Princess Elara', 'Elara'],
        ['Captain Rook', 'Rook'], ['Mira Voss', 'Mira'], ['Mira Voss', 'Voss'],
        ['Jean Luc Moreau', 'Jean Luc'], ['Jean Luc Moreau', 'Luc Moreau'],
        ['Dr. Ágata Voss', 'Ágata'], ['Dr. Ágata Voss', 'Ágata Voss'],
        ['Captain Li', 'Li'], ["Mira O’Neill", 'O’Neill'], ['Mira-Anne Voss', 'Mira-Anne'],
    ]) {
        const npc = card(full);
        assert.equal(cardForDialogueName(short, [npc]), npc, `${short} → ${full}`);
        assert.deepEqual(npc.aliases, []);
    }
});

test('automatic matching never guesses partial words, initials, internal names, or titles alone', () => {
    for (const [full, short] of [
        ['Professor Vale', 'Professor'], ['Captain Rook', 'Captain'], ['Dr. Sen', 'Dr.'],
        ['Lady Mira Voss', 'Lady'], ['Captain Mira Voss', 'Captain Mira'],
        ['Mira Voss', 'Mir'], ['Mira Voss', 'Mi'], ['Mira Voss', 'M. Voss'],
        ['Jean Luc Moreau', 'Luc'], ['Mira-Anne Voss', 'Mira'],
        ['Anna Voss', 'Ann'], ['Mira Voss', 'Mira Vale'], ['Doctor Sen', 'Senator'],
    ]) assert.equal(cardForShortName(short, [card(full)]), null, `${short} ≠ ${full}`);
    assert.equal(cardForShortName('', [card('Mira Voss')]), null);
});

test('ambiguous short names stay unresolved, and adding another card invalidates an earlier match', () => {
    const first = card('Professor Vale');
    const cast = [first, card('Doctor Sen')];
    assert.equal(cardForDialogueName('Vale', cast), first);
    cast.push(card('Doctor Vale'));
    assert.equal(cardForDialogueName('Vale', cast), null);
    assert.equal(cardForDialogueName('Professor Vale', cast), first);
});

test('exact names and explicit literal/regex aliases outrank automatic matches', () => {
    const full = card('Professor Vale');
    const exact = card('Vale');
    const literal = card('Mira', [{ pattern: 'Vale', isRegex: false }]);
    const regex = card('Mira', [{ pattern: 'V[a-z]+', isRegex: true }]);
    for (const explicit of [exact, literal, regex]) {
        assert.equal(cardForDialogueName('Vale', [full, explicit]), explicit);
    }
    const titled = card('Captain Rook', [{ pattern: 'Captain', isRegex: false }]);
    assert.equal(cardForDialogueName('Captain', [titled]), titled);
});

test('short matching respects case settings and literal aliases, without interpreting regex aliases as names', () => {
    const npc = card('Dr. Ágata Voss', [
        { pattern: 'Professor Vale', isRegex: false }, { pattern: 'Doctor Sen', isRegex: true },
    ]);
    assert.equal(cardForDialogueName('voss', [npc]), null);
    assert.equal(cardForDialogueName('voss', [npc], true), npc);
    assert.equal(cardForDialogueName('Vale', [npc]), npc);
    assert.equal(cardForDialogueName('Sen', [npc]), null);
    assert.equal(cardForDialogueName('  Ágata   Voss  ', [npc]), npc);
});
