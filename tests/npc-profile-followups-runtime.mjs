import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';
import { lockTrackerEdits, isTrackerEditLocked } from '../src/tracker/tracker-edit-lock.js';
import { createNpcProfileFollowups } from '../src/tracker/extractor/status-profile-followups.js';

test('deferred filling owns Stop and the tracker lock after the original reader has finished', async () => {
    const h = readerCancellationHarness();
    const context = { chatMetadata: {}, getCurrentChatId: () => 'chat',
        chat: [{ mes: 'Mira arrives.', swipe_id: 0, extra: { sillynpc_reader_report: { status: 'done' } } }] };
    const settings = { enabled: true, activeSystem: 'A', statusTracker: { enabled: true, autoGenerateNpcProfiles: true } };
    let pending = [{}], finishModel, modelSignal;
    const dependencies = { getContext: () => context, getSettings: () => settings,
        startGenerationTask: h.startGenerationTask, awaitGenerationRequest: h.awaitGenerationRequest,
        getCurrentPersonaKey: () => 'one', getPendingChanges: () => pending,
        saveChatSoon() {}, trackerMessageIndex: () => 0, document: { querySelector: () => null },
        readerRuleSignature: () => 'rules', renderExtractionReport() {}, lockTrackerEdits, createNpcProfileFollowups,
        generateNewNpcProfiles: (names, current, signal) => { modelSignal = signal; return new Promise(resolve => { finishModel = resolve; }); },
    };
    const source = readFileSync(new URL('../src/tracker/extractor/status-profile-followups-runtime.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export ', '');
    const queue = new Function(...Object.keys(dependencies), `${source}\nreturn npcProfileFollowups;`)(...Object.values(dependencies));
    await queue.schedule(0, ['Mira']);
    assert.equal(h.listeners(), 0);
    assert.equal(isTrackerEditLocked(), false);
    pending = [];
    const filling = queue.resume(0);
    await Promise.resolve();
    assert.equal(isTrackerEditLocked(), true);
    assert.equal(h.button.style.display, 'flex');
    h.emit('stop');
    await filling;
    assert.equal(modelSignal.aborted, true);
    assert.equal(isTrackerEditLocked(), false);
    assert.equal(h.listeners(), 0);
    assert.equal(context.chat[0].extra.sillynpc_reader_report.npcProfiles.status, 'cancelled');
    finishModel({ generated: 1, failed: 0 });
    await Promise.resolve();
    assert.equal(context.chat[0].extra.sillynpc_reader_report.npcProfiles.status, 'cancelled');
});
