import { readerCancellationHarness } from './helpers/reader-cancellation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLocationProposals, applyLocationReview } from '../src/locations/location-proposals.js';
import { readLocationStore } from '../src/locations/location-store.js';
import { trackerMessageIndex } from '../src/tracker/ui/status-ui-placement.js';

function evaluate(file, dependencies, result) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export async function ', 'async function ')
        .replaceAll('export function ', 'function ');
    return new Function(...Object.keys(dependencies), `${source}\nreturn ${result};`)(...Object.values(dependencies));
}

function fixture({ enabled = true, afterRequest, afterLocationRequest, reviewMode = 'off',
    knownPlace = false, currentPlace = false, locationChanged = false, locationError = null, locationWarnings = [] } = {}) {
    let state = { global: { Time: 'noon' }, characters: [],
        locations: { enabled, currentId: currentPlace ? 'new-tavern' : '', records: knownPlace || currentPlace ? { 'new-tavern': {
            id: 'new-tavern', name: 'The Lantern', description: 'A tavern.', aliases: [],
            parentId: '', lorebook: '', loreEntryId: null,
        } } : {} } };
    const context = { personaId: 'persona-a', chatMetadata: {}, getCurrentChatId: () => 'chat-a',
        chat: [{ mes: 'We enter the Lantern tavern at dusk.', swipe_id: 0, extra: {} }] };
    const settings = { enabled: true,
        statusTracker: { enabled: true, extractionMode: 'extract', reviewMode } };
    const records = [], reports = [], requests = [], locationRequests = [];
    let pending;
    const runtime = evaluate('../src/locations/location-runtime.js', {
        getContext: () => context, buildLocationProposals, applyLocationReview,
        loadStateFromMetadata: () => state, saveStateToMetadata: next => { state = next; },
        refreshTurnBase: () => {}, recordAppliedChanges: (id, rows) => records.push(rows),
        trackerMessageIndex, partitionChanges: evaluate('../src/tracker/status-diff-review.js', {}, 'partitionChanges'),
        eventSource: { emit: () => {} },
        generatePlaceBackground: async () => false,
    }, '{ locationProposalsForReading, partitionLocationRows, resolveLocationRows }');
    const output = { global: { Time: 'dusk' }, player: {}, characters: [], locationChanged };
    const locationOutput = {
        places: [{ name: 'The Lantern', description: 'A tavern.' }],
        current: 'The Lantern',
    };
    const prepareSceneLocationReading = evaluate('../src/locations/location-reading.js', {
        readLocationStore, requestLocationReading: async args => {
            locationRequests.push(args);
            await afterLocationRequest?.(context, state, locationOutput);
            if (locationError) throw locationError;
            return { output: structuredClone(locationOutput), raw: structuredClone(locationOutput), warnings: locationWarnings };
        },
    }, 'prepareSceneLocationReading');
    const dependencies = {
        getContext: () => context, getSettings: () => settings, getAllCharacters: () => [],
        LOG_PREFIX: 'Castward test', debugLog: () => {}, document: { querySelector: () => null },
        loadStateFromMetadata: () => state, getCurrentPersonaKey: () => context.personaId, getCurrentPersonaName: () => 'Alex',
        prepareSceneLocationReading,
        rememberSwipeBase: () => {}, refreshTurnBase: () => {}, sanitizeModelUpdate: () => {},
        reconcileScenePresence: () => {}, takeRefusedValues: () => [], takeCollectionWarnings: () => [],
        applyUpdate: (update, options) => {
            const next = { ...state, global: { ...state.global, ...update.global } };
            if (!options.dryRun) state = next;
            return next;
        },
        computeStateDiff: (before, after) => before.global.Time === after.global.Time ? [] : [{
            kind: 'stat', scope: 'global', label: 'Time', before: before.global.Time,
            after: after.global.Time, risk: 'safe',
        }],
        partitionChanges: evaluate('../src/tracker/status-diff-review.js', {}, 'partitionChanges'),
        buildUpdateFromChanges: rows => ({ global: Object.fromEntries(rows.map(row => [row.label, row.after])) }),
        attachReasons: () => [], isItemDecided: () => false,
        setPendingChanges: (id, rows) => { pending = rows; context.chat[id].extra.sillynpc_pending = rows; },
        recordAppliedChanges: (id, rows) => records.push(rows),
        strangersToClassify: () => [], setStrangerKinds: () => false, triggerReprocess: () => {},
        buildExtractionSchema: () => ({}), buildUserPrompt: () => 'One ordinary reader request', collectLeadUp: () => [],
        requestExtraction: async (...args) => {
            requests.push(args);
            await afterRequest?.(context, state, output);
            return structuredClone(output);
        },
        coerceToUpdate: value => value, normalizeModelReadings: () => {}, prepareGrantReview: () => {},
        validateReviewedTransitions: () => ({ invalid: new Set() }),
        prepareLevelReading: async () => ({ reading: { personaId: 'persona-a' }, transitions: [], rows: [], failures: [] }),
        saveLevelReading: () => {}, retryLevelReading: () => {}, LEVEL_READING_KEY: 'level-reading',
        startExtractionReport: id => context.chat[id], finishExtractionReport: (id, message, report) => reports.push(report),
        extractionSwipe: message => Number(message.swipe_id || 0), renderExtractionReport: () => {},
        normalizeCollectionUpdates: () => [], replacementReadingState: () => null, revertToBase: () => {},
        trackerMessageIndex, generateNewNpcProfiles: async () => ({ generated: 0, failed: 0 }),
        locationProposalsForReading: runtime.locationProposalsForReading,
        partitionLocationRows: runtime.partitionLocationRows,
        resolveLocationRows: runtime.resolveLocationRows,
    };
    const run = evaluate('../src/tracker/extractor/status-extractor-run.js', { ...readerCancellationHarness(), ...dependencies }, 'extractStateFromMessage');
    return { run: () => run('We enter the Lantern tavern at dusk.', 0), context, requests, locationRequests, reports, records, output, settings,
        get pending() { return pending; }, get state() { return state; } };
}

test('risky-only review holds new places and their movement while ordinary world changes autoapply', async () => {
    const f = fixture({ reviewMode: 'risky' });
    assert.deepEqual(await f.run(), { applied: true, pending: 2 });
    assert.equal(f.requests.length, 1);
    assert.equal(f.locationRequests.length, 1);
    assert.equal(f.state.global.Time, 'dusk');
    assert.deepEqual(f.state.locations.records, {});
    assert.deepEqual(f.pending.map(row => row.kind), ['location-create', 'location-current']);
    assert.equal(f.records[0].length, 1);
    assert.equal(f.records[0][0].scope, 'global');
});

test('apply everything saves places and current movement in the same reader turn', async () => {
    const f = fixture();
    assert.deepEqual(await f.run(), { applied: true, pending: 0 });
    assert.equal(f.state.locations.records[f.state.locations.currentId].name, 'The Lantern');
    assert.deepEqual(f.pending, []);
    assert.deepEqual(f.records.flat().map(row => row.kind), ['stat', 'location-create', 'location-current']);
    assert.match(f.reports[0].summary, /3 applied · 0 awaiting review/);
});

test('ask for every change keeps places and ordinary changes pending', async () => {
    const f = fixture({ reviewMode: 'all' });
    assert.deepEqual(await f.run(), { applied: true, pending: 3 });
    assert.equal(f.state.global.Time, 'noon');
    assert.deepEqual(f.state.locations.records, {});
    assert.deepEqual(f.pending.map(row => row.kind), ['stat', 'location-create', 'location-current']);
});

test('risky-only review applies movement to a known place without a card proposal', async () => {
    const f = fixture({ reviewMode: 'risky', knownPlace: true });
    assert.deepEqual(await f.run(), { applied: true, pending: 0 });
    assert.equal(f.state.locations.currentId, 'new-tavern');
    assert.deepEqual(f.pending, []);
    assert.deepEqual(f.records.flat().map(row => row.kind), ['stat', 'location-current']);
});

test('disabled place tracking ignores unsolicited location output', async () => {
    const f = fixture({ enabled: false });
    assert.deepEqual(await f.run(), { applied: true, pending: 0 });
    assert.equal(f.state.global.Time, 'dusk');
    assert.deepEqual(f.state.locations.records, {});
    assert.deepEqual(f.pending, []);
});

test('uncited place proposals enter normal review alongside ordinary changes', async () => {
    const f = fixture({ reviewMode: 'risky' });
    assert.deepEqual(await f.run(), { applied: true, pending: 2 });
    assert.deepEqual(f.state.locations.records, {});
    assert.deepEqual(f.pending.map(row => row.kind), ['location-create', 'location-current']);
    assert.ok(!f.reports[0].warnings.some(warning => warning.includes('evidence')));
});

test('async source changes cannot publish place proposals or ordinary changes', async () => {
    for (const afterRequest of [
        context => { context.chat[0].mes = 'Edited while reading.'; },
        context => { context.chat[0].swipe_id = 1; },
        context => { context.chatMetadata = {}; },
        context => { context.personaId = 'persona-b'; },
    ]) {
        const f = fixture({ afterRequest });
        const result = await f.run();
        assert.equal(result.applied, false);
        assert.equal(result.reason, 'reply changed while reading');
        assert.equal(f.pending, undefined);
        assert.equal(f.state.global.Time, 'noon');
        assert.deepEqual(f.state.locations.records, {});
    }
});

test('place proposals keep the pre-request baseline so manual edits made while reading win', async () => {
    const f = fixture({ reviewMode: 'risky', locationChanged: true, afterRequest: (context, state) => {
        state.locations.records['new-tavern'].description = 'My correction made during the request.';
    } });
    f.state.locations.records['new-tavern'] = {
        id: 'new-tavern', name: 'The Lantern', description: 'The original known tavern.',
        aliases: [], parentId: '', lorebook: '', loreEntryId: null,
    };
    f.state.locations.currentId = 'new-tavern';
    assert.deepEqual(await f.run(), { applied: true, pending: 1 });
    assert.equal(f.pending[0].kind, 'location-update');
    assert.equal(f.pending[0].location.before.description, 'The original known tavern.');
    const result = applyLocationReview(f.state, f.pending, f.pending);
    assert.equal(result.appliedRows.length, 0);
    assert.equal(result.state.locations.records['new-tavern'].description,
        'My correction made during the request.');
    assert.ok(result.warnings.some(warning => warning.includes('changed since extraction')));
});

test('enabling places during an unrelated reader request does not admit unsolicited discoveries', async () => {
    const f = fixture({ enabled: false, afterRequest: (context, state) => {
        state.locations.enabled = true;
    } });
    assert.deepEqual(await f.run(), { applied: true, pending: 0 });
    assert.equal(f.state.locations.enabled, true);
    assert.deepEqual(f.state.locations.records, {});
    assert.deepEqual(f.pending, []);
    assert.equal(f.state.global.Time, 'dusk');
});

test('a missing current place initializes independently of a false tracker flag', async () => {
    const f = fixture({ locationChanged: false });
    await f.run();
    assert.equal(f.requests.length, 1);
    assert.equal(f.locationRequests.length, 1);
    assert.equal(f.locationRequests[0].playerName, 'Alex');
    assert.equal(f.state.locations.currentId !== '', true);
    assert.deepEqual(f.reports[0].output.locationChanged, false);
    assert.equal(f.reports[0].locationReading.status, 'done');
});

test('known stationary scenes skip the location request and ignore unsolicited tracker place details', async () => {
    for (const locationChanged of [false, undefined, 'true', 1]) {
        const f = fixture({ currentPlace: true, locationChanged });
        f.output.locations = { places: [{ name: 'Invented destination' }], current: 'Invented destination' };
        await f.run();
        assert.equal(f.locationRequests.length, 0);
        assert.equal(f.state.locations.currentId, 'new-tavern');
        assert.equal(Object.keys(f.state.locations.records).length, 1);
        assert.equal(f.reports[0].locationReading, undefined);
    }
});

test('a true tracker flag invokes the dedicated reader for an existing location', async () => {
    const f = fixture({ currentPlace: true, locationChanged: true });
    await f.run();
    assert.equal(f.locationRequests.length, 1);
    assert.equal(f.locationRequests[0].state.locations.currentId, 'new-tavern');
});

test('a failed location request preserves successful stat updates and reports the failure', async () => {
    const error = new Error('Reader offline');
    error.output = 'unusable location response';
    const f = fixture({ locationError: error });
    assert.deepEqual(await f.run(), { applied: true, pending: 0 });
    assert.equal(f.state.global.Time, 'dusk');
    assert.deepEqual(f.state.locations.records, {});
    assert.match(f.reports[0].warnings.join(' '), /Location reading failed: Reader offline/);
    assert.equal(f.reports[0].locationReading.raw, error.output);
    assert.equal(f.reports[0].status, 'done');
});

test('source changes during the second request cannot publish tracker or location changes', async () => {
    for (const afterLocationRequest of [
        context => { context.chat[0].mes = 'Edited during location reading.'; },
        context => { context.chat[0].swipe_id = 2; },
        context => { context.chatMetadata = {}; },
        context => { context.personaId = 'persona-b'; },
    ]) {
        const f = fixture({ afterLocationRequest });
        assert.deepEqual(await f.run(), { applied: false, reason: 'reply changed while reading' });
        assert.equal(f.pending, undefined);
        assert.equal(f.state.global.Time, 'noon');
        assert.deepEqual(f.state.locations.records, {});
    }
});

test('disabling Places during the location request discards its output while retaining stat updates', async () => {
    const f = fixture({ afterLocationRequest: (_context, state) => { state.locations.enabled = false; } });
    assert.deepEqual(await f.run(), { applied: true, pending: 0 });
    assert.equal(f.state.global.Time, 'dusk');
    assert.deepEqual(f.state.locations.records, {});
    assert.equal(f.reports[0].locationReading, undefined);
});

test('duplicate extraction attempts request neither tracker nor location twice', async () => {
    const f = fixture();
    await f.run();
    assert.deepEqual(await f.run(), { applied: false, reason: 'already extracted' });
    assert.equal(f.requests.length, 1);
    assert.equal(f.locationRequests.length, 1);
});

test('changing the active System during the location request discards both readings', async () => {
    const f = fixture({ afterLocationRequest: () => { f.settings.activeSystem = 'Another System'; } });
    assert.deepEqual(await f.run(), { applied: false, reason: 'reply changed while reading' });
    assert.equal(f.state.global.Time, 'noon');
    assert.deepEqual(f.state.locations.records, {});
});

test('ignored location fields are reported without blocking usable place proposals', async () => {
    const warning = 'Location reading ignored unsupported fields at places[1]: "type".';
    const f = fixture({ locationWarnings: [warning] });
    assert.deepEqual(await f.run(), { applied: true, pending: 0 });
    assert.equal(f.state.locations.records[f.state.locations.currentId].name, 'The Lantern');
    assert.ok(f.reports[0].warnings.includes(warning));
    assert.ok(f.reports[0].locationReading.warnings.includes(warning));
});
