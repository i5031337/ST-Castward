import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpressionEngine, selectSprite } from '../src/expressions/expression-engine.js';
import { wireExpressionEvents } from '../src/expressions/expression-events.js';
import { EventEmitter } from 'node:events';
import { expressionMessageGroups } from '../src/expressions/expression-message-groups.js';
import { needsExpressionRefresh, captureExpressionImageSource, hasPendingImageCollection } from '../src/expressions/expression-source-policy.js';

const line = (npcId, lineIndex = 0) => ({ npcId, lineIndex, text: `Speech ${lineIndex}`, revision: 'chat/swipe/source' });
const job = (npcId, index = 0) => ({ line: line(npcId, index), config: { api: 0 } });
test('message mode groups each NPC dialogue once while line mode keeps separate emotions', () => {
    const lines = [line('a', 0), line('b', 1), line('a', 2)];
    assert.deepEqual(expressionMessageGroups(lines, true), [[lines[0], lines[2]], [lines[1]]]);
    assert.deepEqual(expressionMessageGroups(lines, false), lines.map(part => [part]));
});
test('image prompt changes replace only sprites with a recorded generated source', () => {
    const generation = { imageSources: { joy: 'old' } };
    assert.equal(needsExpressionRefresh(generation, 'joy', 'new', true), true);
    assert.equal(needsExpressionRefresh(generation, 'joy', 'old', true), false);
    assert.equal(needsExpressionRefresh(generation, 'fear', 'new', true), false);
    assert.equal(needsExpressionRefresh(generation, 'joy', 'new', false), false);
});
test('image source follows every included profile field and collection regardless of name', () => {
    const card = { imageUrl: '/portrait.png', profile: { ancestry: 'Elf', mood: 'Kind', secret: 'Hidden' } };
    const fields = [{ id: 'ancestry', label: 'Ancestry', includeInImagePrompt: true },
        { id: 'mood', label: 'Mood', includeInImagePrompt: true },
        { id: 'secret', label: 'Secret', includeInImagePrompt: false }];
    const definitions = [{ id: 'equipment', name: 'Equipment', targets: ['npc'], includeInImagePrompt: true },
        { id: 'private', name: 'Private', targets: ['npc'], includeInImagePrompt: false }];
    const collections = { equipment: [{ name: 'Blue coat' }], private: [{ name: 'Key' }] };
    const snapshot = () => captureExpressionImageSource(card, fields, collections, definitions, 'Solo portrait');
    const source = snapshot();
    card.profile.secret = 'Revealed'; collections.private.push({ name: 'Book' });
    assert.equal(snapshot(), source);
    card.profile.ancestry = 'Dwarf';
    assert.notEqual(snapshot(), source);
    card.profile.ancestry = 'Elf'; card.profile.mood = 'Cautious';
    assert.notEqual(snapshot(), source);
    card.profile.mood = 'Kind'; collections.equipment[0].name = 'Red coat';
    assert.notEqual(snapshot(), source);
    collections.equipment[0].name = 'Blue coat';
    assert.notEqual(captureExpressionImageSource(card, fields, collections, definitions, 'Close portrait'), source);
    collections.equipment = [];
    assert.notEqual(snapshot(), source);
    const emptySource = snapshot();
    definitions[0].emptyImagePrompt = 'unarmed';
    assert.notEqual(snapshot(), emptySource);
    definitions[0].emptyImagePrompt = '';
    assert.notEqual(snapshot(), emptySource);
});
test('only pending image collections for the classified NPC delay regeneration', () => {
    const card = { name: 'Tessa' };
    const definitions = [{ id: 'outfit', targets: ['npc'], includeInImagePrompt: true },
        { id: 'secrets', targets: ['npc'], includeInImagePrompt: false }];
    const row = { scope: 'npc', actor: 'Tessa', collectionId: 'outfit', kind: 'item-add' };
    assert.equal(hasPendingImageCollection([row], card, definitions), true);
    assert.equal(hasPendingImageCollection([{ ...row, actor: 'Mira' }], card, definitions), false);
    assert.equal(hasPendingImageCollection([{ ...row, collectionId: 'secrets' }], card, definitions), false);
    assert.equal(hasPendingImageCollection([{ ...row, scope: 'player' }], card, definitions), false);
});
test('packs map labels and sparse fallbacks with stable variants independent of listing order', () => {
    const sprites = [{ label: 'joy', path: '/b' }, { label: 'joy', path: '/a' }, { label: 'neutral', path: '/n' }];
    assert.equal(selectSprite(sprites, 'missing', 'neutral', 'id'), '/n');
    assert.equal(selectSprite(sprites, 'missing', 'absent', 'id'), '');
    assert.equal(selectSprite([], 'joy', 'neutral', 'id'), '');
    assert.equal(selectSprite(sprites, 'joy', 'neutral', 'id'), selectSprite([...sprites].reverse(), 'joy', 'neutral', 'id'));
});
test('queue deduplicates pending and completed requests and serializes NPCs', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const requests = [], applied = [];
    const engine = createExpressionEngine({
        async classify(job) { requests.push(job.line.npcId); await gate; return 'joy'; },
        isCurrent: () => true, apply: (job, label) => applied.push([job.line.npcId, label]),
    });
    const first = engine.enqueue(job('a'));
    assert.equal(engine.enqueue(job('a')), first);
    const second = engine.enqueue(job('b'));
    await Promise.resolve(); assert.deepEqual(requests, ['a']);
    release(); await Promise.all([first, second]);
    await engine.enqueue(job('a'));
    assert.deepEqual(requests, ['a', 'b']);
    assert.deepEqual(applied, [['a', 'joy'], ['b', 'joy'], ['a', 'joy']]);
    await engine.enqueue({ ...job('a'), config: { api: 3 } });
    assert.equal(requests.length, 3);
    await engine.enqueue({ ...job('a'), sprites: [{ label: 'joy' }] });
    assert.equal(requests.length, 4);
});
test('invalidating a job or resetting the engine prevents pending results from applying', async () => {
    for (const reset of [false, true]) {
        let resolve, current = true;
        const applied = [];
        const engine = createExpressionEngine({ classify: () => new Promise(done => { resolve = done; }),
            isCurrent: () => current, apply: value => applied.push(value) });
        const task = engine.enqueue(job('a'));
        await Promise.resolve();
        if (reset) engine.reset(); else current = false;
        resolve('joy'); await task;
        assert.deepEqual(applied, []);
    }
});
test('obsolete queued jobs are skipped and failed classifiers do not block later NPCs', async () => {
    const applied = [];
    const engine = createExpressionEngine({
        classify: async job => { if (job.line.npcId === 'bad') throw new Error('offline'); return 'neutral'; },
        isCurrent: job => job.line.npcId !== 'stale', apply: job => applied.push(job.line.npcId),
    });
    await assert.rejects(engine.enqueue(job('bad')), /offline/);
    await engine.enqueue(job('stale'));
    await engine.enqueue(job('good'));
    assert.deepEqual(applied, ['good']);
});

test('only changed completed foreground replies schedule work; history, quiet, stopped and obsolete work stay idle', () => {
    const events = new EventEmitter();
    const types = Object.fromEntries(['GENERATION_STARTED', 'GENERATION_STOPPED', 'GENERATION_ENDED',
        'CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED'].map(name => [name, name]));
    let identity = 'old', renders = 0;
    const completed = [], deferred = [];
    wireExpressionEvents({ events, types, renderedEvent: 'render', render: () => renders++, reset: () => {},
        latestId: () => 1, revision: () => identity, defer: fn => deferred.push(fn), complete: id => completed.push(id) });
    events.emit('render'); events.emit(types.GENERATION_ENDED);
    events.emit(types.GENERATION_STARTED, 'quiet'); identity = 'quiet'; events.emit(types.GENERATION_ENDED);
    events.emit(types.GENERATION_STARTED, 'normal', {}, true); identity = 'dry'; events.emit(types.GENERATION_ENDED);
    assert.equal(renders, 1); assert.equal(deferred.length, 0);
    events.emit(types.GENERATION_STARTED, 'normal'); events.emit(types.GENERATION_ENDED);
    assert.equal(deferred.length, 0);
    events.emit(types.GENERATION_STARTED, 'normal'); identity = 'new'; events.emit(types.GENERATION_ENDED);
    deferred.pop()(); assert.deepEqual(completed, [1]);
    events.emit(types.GENERATION_ENDED); assert.equal(deferred.length, 0);
    for (const event of [types.CHAT_CHANGED, types.MESSAGE_SWIPED, types.MESSAGE_EDITED, types.MESSAGE_DELETED, types.GENERATION_STOPPED]) {
        events.emit(types.GENERATION_STARTED, 'swipe'); identity += 'x'; events.emit(types.GENERATION_ENDED);
        events.emit(event); deferred.pop()();
    }
    events.emit(types.GENERATION_STARTED, 'continue'); identity += 'x'; events.emit(types.GENERATION_STOPPED);
    events.emit(types.GENERATION_ENDED);
    assert.deepEqual(completed, [1]); assert.equal(deferred.length, 0);
});

test('tracker cleanup before the deferred frame uses the final revision without accepting replacement messages', () => {
    const events = new EventEmitter();
    const types = Object.fromEntries(['GENERATION_STARTED', 'GENERATION_STOPPED', 'GENERATION_ENDED',
        'CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED'].map(name => [name, name]));
    let message = { text: 'old' }, deferred;
    const completed = [];
    wireExpressionEvents({ events, types, renderedEvent: 'render', render: () => {}, reset: () => {},
        latestId: () => 0, revision: () => message.text, sourceToken: () => message,
        defer: fn => { deferred = fn; }, complete: () => completed.push(message.text) });
    events.emit(types.GENERATION_STARTED, 'normal'); message.text = 'new with status block';
    events.emit(types.GENERATION_ENDED); message.text = 'new cleaned'; deferred();
    assert.deepEqual(completed, ['new cleaned']);
    events.emit(types.GENERATION_STARTED, 'regenerate'); message.text = 'replacement reply';
    events.emit(types.GENERATION_ENDED); message = { text: 'different chat message' }; deferred();
    assert.deepEqual(completed, ['new cleaned']);
});

test('reset aborts a stalled request and fresh classification starts without its completion', async () => {
    let oldSignal;
    const applied = [];
    const engine = createExpressionEngine({
        classify: job => {
            if (job.line.npcId === 'old') { oldSignal = job.signal; return new Promise(() => {}); }
            return Promise.resolve('joy');
        }, isCurrent: () => true, apply: job => applied.push(job.line.npcId),
    });
    const old = engine.enqueue(job('old'));
    await Promise.resolve();
    engine.reset();
    await engine.enqueue(job('fresh'));
    await old;
    assert.equal(oldSignal.aborted, true);
    assert.deepEqual(applied, ['fresh']);
});

test('deadline aborts stalled classification and releases subsequent jobs', async () => {
    let stalledSignal;
    const applied = [];
    const engine = createExpressionEngine({ timeoutMs: 10,
        classify: job => {
            if (job.line.npcId === 'stalled') { stalledSignal = job.signal; return new Promise(() => {}); }
            return Promise.resolve('neutral');
        }, isCurrent: () => true, apply: job => applied.push(job.line.npcId),
    });
    await assert.rejects(engine.enqueue(job('stalled')), { name: 'TimeoutError' });
    await engine.enqueue(job('fresh'));
    assert.equal(stalledSignal.aborted, true);
    assert.deepEqual(applied, ['fresh']);
});

test('caller cancellation releases the queue and suppresses late results', async () => {
    const controller = new AbortController();
    let release;
    const applied = [];
    const engine = createExpressionEngine({
        classify: job => job.line.npcId === 'cancelled' ? new Promise(resolve => { release = resolve; }) : Promise.resolve('neutral'),
        isCurrent: () => true, apply: job => applied.push(job.line.npcId),
    });
    const pending = engine.enqueue({ ...job('cancelled'), signal: controller.signal });
    await Promise.resolve(); controller.abort(); await pending;
    await engine.enqueue(job('fresh')); release('joy'); await Promise.resolve();
    assert.deepEqual(applied, ['fresh']);
});

test('pending classification can adopt a completed line identity without another request', async () => {
    let release, requests = 0;
    const streaming = { ...job('a'), line: { ...line('a'), streamId: 'generation', revision: 'stream' } };
    const finalLine = { ...line('a'), revision: 'completed' };
    const applied = [];
    const engine = createExpressionEngine({
        classify: () => { requests++; return new Promise(resolve => { release = resolve; }); },
        isCurrent: candidate => candidate.line.streamId === 'generation' || candidate.line === finalLine,
        apply: candidate => applied.push(candidate.line),
    });
    const pending = engine.enqueue(streaming);
    await Promise.resolve();
    streaming.line = finalLine;
    release('joy'); await pending;
    assert.equal(requests, 1);
    assert.deepEqual(applied, [finalLine]);
});
