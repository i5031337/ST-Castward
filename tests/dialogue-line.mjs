import assert from 'node:assert/strict';
import test from 'node:test';
import { dialogueLabels } from '../src/chat/dialogue-line.js';
import { parseDialogueTemplate, resolveDialogueTemplate, DEFAULT_DIALOGUE_TEMPLATE } from '../src/chat/dialogue-template.js';

test('plain speaker lines work without a character card or Markdown', () => {
    const text = 'Her face is framed by gold-rimmed glasses.\n\n'
        + 'Chloe: "Welcome to the campus, freshman!"\n\n'
        + 'She offers a friendly smile.';
    assert.deepEqual(dialogueLabels(text).map(({ name }) => name), ['Chloe']);
    assert.deepEqual(dialogueLabels('Chloe: “Welcome.”').map(({ name }) => name), ['Chloe']);
});

test('incomplete, repeated, reversed and multiline templates use the default safely', () => {
    for (const value of [null, {}, '', '{name}', '{dialogue}: {name}',
        '{name}: {dialogue} {name}', '{name}: {dialogue}\nOther', '{name} {dialogue}']) {
        assert.equal(parseDialogueTemplate(value), null);
        assert.equal(resolveDialogueTemplate(value).template, DEFAULT_DIALOGUE_TEMPLATE);
    }
    assert.ok(parseDialogueTemplate('{name} "{dialogue}"'));
});

test('only line-start name and quoted dialogue count as a speaker', () => {
    assert.deepEqual(dialogueLabels('She says, Chloe: "Welcome."'), []);
    assert.deepEqual(dialogueLabels('HP: 10/10'), []);
    assert.deepEqual(dialogueLabels('**Chloe**: "Welcome."'), []);
    assert.deepEqual(dialogueLabels('Chloe: "Welcome."', false), []);
    assert.deepEqual(dialogueLabels('Chloe: '), []);
    assert.deepEqual(dialogueLabels('Chloe: ', true, true).map(({ name }) => name), ['Chloe']);
    assert.deepEqual(dialogueLabels('She says, Chloe: ', true, true), []);
    assert.deepEqual(dialogueLabels('\nChloe: ', false, true).map(({ name }) => name), ['Chloe']);
});

test('custom separators and brackets preserve speaker and speech offsets', () => {
    for (const [template, line] of [
        ['[{name}]: "{dialogue}"', '[Chloe]: "Hello."'],
        ['{name} — {dialogue}', 'Chloe — Hello.'],
        ['({name}) | 「{dialogue}」', '(Chloe) | 「Hello.」'],
    ]) {
        const [label] = dialogueLabels(line, true, false, template);
        assert.equal(label.name, 'Chloe');
        assert.equal(line.slice(label.start, label.end), 'Chloe');
        assert.match(line.slice(label.quoteStart), /Hello/u);
        assert.deepEqual(dialogueLabels('She says, ' + line, true, false, template), []);
        assert.deepEqual(dialogueLabels('Chloe: "Hello."', true, false, template), []);
    }
    assert.equal(dialogueLabels('[Chloe]: ', true, true, '[{name}]: "{dialogue}"')[0].name, 'Chloe');
    assert.equal(dialogueLabels('Chloe: "Hi."', true, false, '{broken}')[0].name, 'Chloe');
});
