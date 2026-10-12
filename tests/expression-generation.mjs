import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpressionGenerator } from '../src/expressions/expression-generation.js';
import { EMOTION_LABELS, EMOTION_PROMPTS, normalizeExpressionGeneration, expressionPromptVariants, setExpressionPrompt, selectExpressionPrompt, expressionFolder, prepareExpressionReference, expressionWorkflow } from '../src/expressions/expression-prompts.js';
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
    assert.deepEqual(generation.prompts.joy, ['My custom smile', null, null]);
    assert.deepEqual(expressionPromptVariants(generation, 'joy'), ['My custom smile', ...EMOTION_PROMPTS.joy.slice(1)]);
    assert.equal(generation.prompts.nonsense, undefined);
    assert.deepEqual(normalizeNpcPresentation({ expressions: { generation } }).expressions.generation, generation);
    const first = expressionFolder({ id: 'one' }, '/a.png');
    assert.notEqual(first, expressionFolder({ id: 'one' }, '/b.png'));
    assert.notEqual(first, expressionFolder({ id: 'two' }, '/a.png'));
});

test('all emotions have three distinct variants and random selection can reach each one', () => {
    const generation = normalizeExpressionGeneration();
    for (const label of EMOTION_LABELS) {
        const variants = expressionPromptVariants(generation, label);
        assert.equal(variants.length, 3, label);
        assert.equal(new Set(variants).size, 3, label);
        const job = { prompt: '', promptVariants: variants };
        for (const [index, random] of [0, 0.34, 0.999].entries()) {
            assert.equal(selectExpressionPrompt(job, () => random), variants[index]);
            assert.equal(selectExpressionPrompt({ ...job, prompt: 'NPC portrait prompt' }, () => random), `NPC portrait prompt\n${variants[index]}`);
        }
    }
});

test('old built-in prompts adopt variants and body language while custom prompts survive', () => {
    const generation = normalizeExpressionGeneration({
        basePrompt: 'Use the reference image. Preserve the same character identity, hairstyle, outfit, art style, body proportions, framing and background. Change the facial expression only.',
        prompts: { joy: 'Joyful expression, cheerful eyes, happy open smile.', anger: ['Custom fury', '', 'Custom shout'] },
    });
    assert.equal(generation.basePrompt, undefined);
    assert.equal(generation.prompts.joy, undefined);
    assert.deepEqual(expressionPromptVariants(generation, 'joy'), EMOTION_PROMPTS.joy);
    assert.deepEqual(generation.prompts.anger, ['Custom fury', null, 'Custom shout']);
    setExpressionPrompt(generation, 'joy', 0, 'Edited');
    assert.notEqual(expressionPromptVariants(normalizeExpressionGeneration(), 'joy')[0], 'Edited');
    assert.equal(normalizeExpressionGeneration({ basePrompt: 'Custom base' }).basePrompt, undefined);
});

test('default prompt storage is sparse and resetting overrides removes them', () => {
    const generation = normalizeExpressionGeneration({ prompts: EMOTION_PROMPTS });
    assert.deepEqual(generation.prompts, {});
    assert.ok(JSON.stringify(normalizeNpcPresentation()).length < 1000);
    setExpressionPrompt(generation, 'joy', 1, 'Custom pose');
    assert.deepEqual(generation.prompts.joy, [null, 'Custom pose', null]);
    setExpressionPrompt(generation, 'joy', 1, '');
    assert.deepEqual(generation.prompts, {});
    const variants = expressionPromptVariants(generation, 'joy');
    variants[0] = 'Mutated copy';
    assert.equal(expressionPromptVariants(generation, 'joy')[0], EMOTION_PROMPTS.joy[0]);
});

test('expression-only jobs accept an empty prefix and send just a selected variant', async () => {
    const { generator, calls, job } = fixture();
    await generator.generate({ ...job, prompt: '', promptVariants: EMOTION_PROMPTS.joy });
    assert.ok(EMOTION_PROMPTS.joy.includes(calls[0].prompt));
});

test('random variants share pending jobs and failure suppression; explicit retry draws again', async () => {
    const { job } = fixture();
    const inputs = [];
    const generator = createExpressionGenerator({ loadPack: async () => [],
        edit: async input => { inputs.push(input); throw new Error('offline'); }, upload: async () => {} });
    const variantsJob = { ...job, promptVariants: EMOTION_PROMPTS.joy };
    const task = generator.generate(variantsJob);
    assert.equal(generator.generate({ ...variantsJob, promptVariants: [...EMOTION_PROMPTS.joy] }), task);
    await assert.rejects(task, /offline/);
    await assert.rejects(generator.generate(variantsJob), /offline/);
    assert.equal(inputs.length, 1);
    await assert.rejects(generator.generate(variantsJob, { retry: true }), /offline/);
    assert.equal(inputs.length, 2);
    for (const input of inputs) assert.ok(EMOTION_PROMPTS.joy.some(variant => input.prompt === `${job.prompt}\n${variant}`));
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

test('cancelled pending jobs settle promptly and fresh retries run after the old edit completes', async () => {
    const { job } = fixture();
    let finish, edits = 0;
    const cleaned = [], packs = [];
    const generator = createExpressionGenerator({ loadPack: async () => packs,
        edit: async () => { edits++; if (edits === 1) return new Promise(resolve => { finish = resolve; }); return '/fresh.png'; },
        upload: async ({ label }) => packs.push({ label, path: '/sprite.png' }),
        cleanup: async url => cleaned.push(url) });
    const controller = new AbortController();
    const cancelled = generator.generate({ ...job, signal: controller.signal });
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    const fresh = generator.generate(job, { retry: true });
    assert.notEqual(fresh, cancelled);
    assert.equal(edits, 1);
    finish('/cancelled.png');
    await fresh;
    assert.equal(edits, 2);
    assert.deepEqual(cleaned, ['/cancelled.png', '/fresh.png']);
    assert.equal(packs.length, 1);
});

test('manual replace work has its own cancellation and does not reuse automatic work', async () => {
    const { job } = fixture();
    let finish, edits = 0;
    const packs = [];
    const generator = createExpressionGenerator({ loadPack: async () => packs,
        edit: () => { edits++; return new Promise(resolve => { finish = resolve; }); },
        upload: async ({ label }) => packs.push({ label, path: '/sprite.png' }) });
    const automatic = generator.generate(job);
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    const controller = new AbortController();
    const manual = generator.generate({ ...job, signal: controller.signal }, { replace: true });
    assert.notEqual(manual, automatic);
    controller.abort();
    await assert.rejects(manual, { name: 'AbortError' });
    finish('/automatic.png');
    await automatic;
    assert.equal(edits, 1);
});

test('replace requests independently regenerate a pending missing-expression job', async () => {
    const { job } = fixture();
    const packs = [];
    let edits = 0;
    const generator = createExpressionGenerator({ loadPack: async () => packs,
        edit: async () => { edits++; return '/generated.png'; },
        upload: async ({ label }) => { packs.splice(0, packs.length, { label, path: '/sprite.png' }); } });
    const missing = generator.generate(job);
    const replace = generator.generate(job, { retry: true, replace: true });
    assert.notEqual(missing, replace);
    await Promise.all([missing, replace]);
    assert.equal(edits, 2);
});

test('upload failures still clean generated sources and preserve the upload error', async () => {
    const { job } = fixture();
    const cleaned = [];
    const generator = createExpressionGenerator({ loadPack: async () => [], edit: async () => '/output.png',
        upload: async () => { throw new Error('upload offline'); }, cleanup: async url => cleaned.push(url) });
    await assert.rejects(generator.generate(job), /upload offline/);
    assert.deepEqual(cleaned, ['/output.png']);
});

test('source cleanup deletes only the exact unique Image Edit image path', async () => {
    const { cleanupExpressionSource } = await import('../src/expressions/expression-image-cleanup.js');
    const calls = [];
    const deps = { fetch: async (...args) => { calls.push(args); return { ok: true }; }, headers: () => ({ token: 'fixture' }) };
    const url = '/user/images/image-edit/01234567-89ab-cdef-0123-456789abcdef.png';
    for (const unsafe of ['/portrait.png', url + '?x=1', url.replace('image-edit/', 'image-edit/../'),
        'https://example.org' + url, '/user/images/image-edit/manual.png']) {
        await cleanupExpressionSource(unsafe, deps);
    }
    assert.equal(calls.length, 0);
    await cleanupExpressionSource(url, deps);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/images/delete');
    assert.deepEqual(JSON.parse(calls[0][1].body), { path: url.slice(1) });
    assert.equal(calls[0][1].signal, undefined);
});
