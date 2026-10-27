import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackerMessageIndex } from '../src/tracker/ui/status-ui-placement.js';

const source = readFileSync(new URL('../src/tracker/ui/status-ui-refresh.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ')
    .replace("await import('../extractor/status-level-reading.js')", 'await loadRewards()')
    .replace("await import('../extractor/status-extractor-run.js')", 'await loadReader()');

function harness() {
    const buttons = [];
    const context = { chat: [{ mes: 'A reply.', extra: {} }] };
    const settings = { enabled: true, statusTracker: { enabled: true, showRawTrackerOutput: false } };
    let report = { status: 'done' }, base = {}, release;
    const calls = [], errors = [];
    const document = {
        querySelectorAll: () => buttons,
        createElement: () => {
            const button = { dataset: {}, setAttribute(key, value) { this[key] = value; },
                addEventListener(_type, listener) { this.click = () => listener({ stopPropagation() {} }); } };
            buttons.push(button);
            return button;
        },
    };
    const deps = { document, getContext: () => context, getSettings: () => settings,
        getExtractionReport: () => report, getSwipeBase: () => base, trackerMessageIndex,
        loadReader: async () => ({ extractStateFromMessage: async (...args) => {
            calls.push(['reader', ...args]); await new Promise(resolve => { release = resolve; });
        } }),
        loadRewards: async () => ({ retryLevelReading: async id => {
            calls.push(['rewards', id]); await new Promise(resolve => { release = resolve; });
            return { applied: true, failures: 0 };
        } }), toastr: { error: error => errors.push(error) }, console,
    };
    const api = new Function(...Object.keys(deps), `${source}\nreturn {buildTrackerReadButton,refreshTrackerReadButtons};`)(...Object.values(deps));
    let redraws = 0;
    return { ...api, context, settings, calls, errors, setReport: value => { report = value; },
        setBase: value => { base = value; }, release: () => release(), redraws: () => redraws,
        button: () => api.buildTrackerReadButton(0, () => redraws++) };
}

test('refresh stays available with output hidden, labels failures and disables during reading', () => {
    const h = harness();
    const button = h.button();
    assert.equal(button.hidden, false);
    assert.equal(button['aria-label'], 'Regenerate tracker reading');
    h.setReport({ status: 'failed' }); h.setBase(null); h.refreshTrackerReadButtons();
    assert.equal(button.title, 'Retry tracker reading');
    assert.equal(button.hidden, false);
    h.setReport({ status: 'running' }); h.refreshTrackerReadButtons();
    assert.equal(button.disabled, true);
    h.setReport({ status: 'cancelled' }); h.setBase({}); h.refreshTrackerReadButtons();
    assert.equal(button.disabled, false);
    h.context.chat.push({ mes: 'Newer reply' }); h.refreshTrackerReadButtons();
    assert.equal(button.hidden, true);
});

test('regeneration and first-reading retry keep their options and block duplicate controls', async () => {
    for (const regenerate of [true, false]) {
        const h = harness();
        h.setBase(regenerate ? {} : null); h.setReport({ status: 'failed' });
        const button = h.button();
        const run = button.click();
        await Promise.resolve();
        const duplicate = h.button();
        assert.equal(duplicate.disabled, true);
        await duplicate.click();
        assert.deepEqual(h.calls, [['reader', 'A reply.', 0, { manual: true, regenerate }]]);
        h.release(); await run;
        assert.equal(button.disabled, false);
        assert.equal(duplicate.disabled, false);
        assert.equal(h.redraws(), 1);
    }
});

test('missing rewards retry only rewards, including when the reading has no replacement base', async () => {
    const h = harness(); h.setBase(null);
    h.context.chat[0].extra = { sillynpc_level_reading: { failures: [{}] },
        sillynpc_reader_report: { summary: '1 choices failed' } };
    const button = h.button();
    assert.equal(button.hidden, false);
    assert.equal(button['aria-label'], 'Retry missing level-up rewards');
    const run = button.click(); await Promise.resolve();
    assert.deepEqual(h.calls, [['rewards', 0]]);
    h.release(); await run;
    assert.equal(h.context.chat[0].extra.sillynpc_reader_report.summary, '0 applied · 0 awaiting review');
});

test('old controls cannot read a replacement message or run when disabled', async () => {
    const h = harness(); const button = h.button();
    h.context.chat[0] = { mes: 'Replacement', extra: {} };
    await button.click();
    h.settings.enabled = false;
    const disabled = h.button();
    await disabled.click();
    assert.deepEqual(h.calls, []);
    assert.equal(disabled.hidden, true);
});
