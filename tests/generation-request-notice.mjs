import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ui/shared/ui-generation-notice.js', import.meta.url), 'utf8');
const noticeSource = source.replace(/^import .*;\n/gm, '').replace('export async function', 'async function');

function fixture({ dismissed = false, continueFill = true, remember = false } = {}) {
    const settings = { generationNoticeDismissed: dismissed };
    const popups = [];
    let saves = 0;
    const document = {
        createElement: tag => ({ tag, children: [], append(...children) { this.children.push(...children); } }),
        createTextNode: text => ({ text }),
    };
    class Popup {
        constructor(content, type, title, buttons) { popups.push({ content, buttons }); }
        async show() {
            const checkbox = popups.at(-1).content.children[1].children[0];
            checkbox.checked = remember;
            return continueFill;
        }
    }
    const run = new Function('document', 'Popup', 'POPUP_TYPE', 'getSettings', 'saveSettings',
        `${noticeSource}; return confirmGenerationNotice;`)(document, Popup, { CONFIRM: 1 },
        () => settings, () => { saves++; });
    return { run, settings, popups, get saves() { return saves; } };
}

test('Fill explains the image request and cancel prevents opting out', async () => {
    const f = fixture({ continueFill: false, remember: true });
    assert.equal(await f.run('Fill'), false);
    assert.match(f.popups[0].content.children[0].textContent, /image generation request.*may incur charges/i);
    assert.equal(f.popups[0].content.children[1].className, 'sillynpc-generation-notice-choice');
    assert.deepEqual(f.popups[0].buttons, { okButton: 'Continue', cancelButton: 'Cancel' });
    assert.equal(f.settings.generationNoticeDismissed, false);
    assert.equal(f.saves, 0);
});

test('Fill remembers the notice only after Continue with opt-out selected', async () => {
    const f = fixture({ remember: true });
    assert.equal(await f.run('NPC creation'), true);
    assert.match(f.popups[0].content.children[0].textContent, /^NPC creation may send/);
    assert.equal(f.settings.generationNoticeDismissed, true);
    assert.equal(f.saves, 1);
    assert.equal(await f.run('Fill'), true);
    assert.equal(f.popups.length, 1);

    const repeat = fixture();
    assert.equal(await repeat.run('Fill'), true);
    assert.equal(repeat.settings.generationNoticeDismissed, false);
    assert.equal(repeat.saves, 0);
});
