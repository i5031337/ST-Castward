import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpressionGenerator } from '../src/expressions/expression-generation.js';
import { EMOTION_LABELS, normalizeExpressionGeneration, expressionFolder, prepareExpressionReference, expressionWorkflow } from '../src/expressions/expression-prompts.js';
import { normalizeNpcPresentation } from '../src/core/npc-presentation.js';

function fixture() {
    const calls = [], packs = new Map();
    const generator = createExpressionGenerator({
        loadPack: async folder => packs.get(folder) || [],
        edit: async input => { calls.push(input); return '/user/images/image-edit/test.png'; },
        upload: async ({ folder, label }) => packs.set(folder, [{ label, path: `/characters/${folder}/${label}.png` }]),
    });
    const job = { owner: 'chat A', npcId: 'npc', folder: 'SillyNPC/npc', label: 'joy',
        reference: '/portrait.png', prompt: 'Keep outfit. Smile.', negativePrompt: 'text',
        workflow: 'Edit.json', isCurrent: () => true };
    return { generator, calls, packs, job };
}

test('28 saved prompts normalize, round-trip with cards, and preserve custom instructions', () => {
    assert.equal(EMOTION_LABELS.length, 28);
    const generation = normalizeExpressionGeneration({ enabled: true, reference: '/a.png',
        workflow: 'Edit.json', prompts: { joy: ' My custom smile ', nonsense: 'discard' } });
    assert.equal(generation.prompts.joy, 'My custom smile');
    assert.equal(generation.prompts.nonsense, undefined);
    assert.deepEqual(normalizeNpcPresentation({ expressions: { generation } }).expressions.generation, generation);
    const first = expressionFolder({ id: 'one' }, '/a.png');
    assert.notEqual(first, expressionFolder({ id: 'one' }, '/b.png'));
    assert.notEqual(first, expressionFolder({ id: 'two' }, '/a.png'));
});

test('expressions use a shared editing workflow independently of the host portrait workflow', () => {
    const card = { presentation: normalizeNpcPresentation() };
    assert.equal(expressionWorkflow(card, { npcExpressionWorkflow: 'ReferenceEdit.json' }), 'ReferenceEdit.json');
    assert.equal(expressionWorkflow(card, {}), '');
    card.presentation.expressions.generation.workflow = 'Override.json';
    assert.equal(expressionWorkflow(card, { npcExpressionWorkflow: 'ReferenceEdit.json' }), 'Override.json');
});

test('generation prepares current reference and preserves existing packs until the portrait changes', () => {
    const card = { id: 'Bianca', imageUrl: '/portrait.png', presentation: normalizeNpcPresentation({
        expressions: { enabled: true, generation: { enabled: true } },
    }) };
    assert.equal(prepareExpressionReference(card), true);
    assert.equal(card.presentation.expressions.generation.reference, card.imageUrl);
    assert.equal(card.presentation.expressions.spriteFolder, expressionFolder(card, card.imageUrl));
    assert.equal(prepareExpressionReference(card), false);
    card.imageUrl = '/changed.png';
    assert.equal(prepareExpressionReference(card), true);
    assert.equal(card.presentation.expressions.generation.reference, '/changed.png');
    assert.equal(card.presentation.expressions.spriteFolder, expressionFolder(card, '/changed.png'));
    card.presentation.expressions.spriteFolder = 'ExistingPack';
    card.presentation.expressions.generation.reference = '';
    assert.equal(prepareExpressionReference(card), true);
    assert.equal(card.presentation.expressions.spriteFolder, 'ExistingPack');
});

test('NPCs without portraits leave bindings untouched and per-NPC automatic switches are removed', () => {
    const card = { imageUrl: '', presentation: normalizeNpcPresentation({ expressions: { enabled: true, generation: { enabled: true } } }) };
    assert.equal(prepareExpressionReference(card), false);
    assert.equal(card.presentation.expressions.spriteFolder, '');
    assert.equal(card.presentation.expressions.generation.reference, '');
    assert.equal(card.presentation.expressions.enabled, undefined);
    assert.equal(card.presentation.expressions.generation.enabled, undefined);
});

test('duplicate jobs share one edit, send the saved prompt unchanged, and reuse completed sprites', async () => {
    const { generator, job, calls } = fixture();
    const task = generator.generate(job);
    assert.equal(generator.generate(job), task);
    const sprites = await task;
    assert.equal(sprites[0].label, 'joy');
    await generator.generate(job);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { reference: job.reference, prompt: job.prompt, negativePrompt: 'text', workflow: 'Edit.json', signal: undefined });
    await generator.generate(job, { retry: true, replace: true });
    assert.equal(calls.length, 2);
});

test('stale and cancelled jobs never upload or start queued edits', async () => {
    let release, current = true, uploads = 0, edits = 0;
    const { job } = fixture();
    const generator = createExpressionGenerator({ loadPack: async () => [],
        edit: () => { edits++; return new Promise(resolve => { release = resolve; }); }, upload: async () => uploads++ });
    const first = generator.generate({ ...job, isCurrent: () => current });
    const controller = new AbortController();
    const queued = generator.generate({ ...job, label: 'fear', signal: controller.signal });
    const rejected = assert.rejects(queued, { name: 'AbortError' });
    while (!release) await new Promise(resolve => setImmediate(resolve));
    current = false; controller.abort(); release('/user/images/test.png');
    await assert.rejects(first, { name: 'AbortError' }); await rejected;
    assert.equal(uploads, 0); assert.equal(edits, 1);
});

test('failures do not repeat automatically or block other emotions; explicit retry recovers', async () => {
    const { job } = fixture();
    let calls = 0, offline = true, label;
    const generator = createExpressionGenerator({ loadPack: async () => label ? [{ label, path: '/test' }] : [],
        edit: async () => { calls++; if (offline) throw new Error('offline'); return '/user/images/test.png'; },
        upload: async input => { label = input.label; } });
    await assert.rejects(generator.generate(job), /offline/);
    await assert.rejects(generator.generate(job), /offline/);
    assert.equal(calls, 1);
    offline = false;
    await generator.generate({ ...job, workflow: 'FixedEdit.json' });
    label = null;
    await generator.generate({ ...job, label: 'fear' });
    label = null;
    await generator.generate(job, { retry: true });
    assert.equal(calls, 4);
});
