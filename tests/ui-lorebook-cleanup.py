"""Verify lorebook controls with mocked cleanup; never delete or save user data."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute(r"""
        const script = document.createElement('script');
        script.type = 'module';
        script.id = 'castward-lorebook-test';
        const entry = [...document.scripts].find(el => /SillyNPC-XP\/index\.js/.test(el.src));
        const base = new URL('./', entry.src).href;
        script.textContent = `
            const root = document.documentElement;
            let view;
            let cleanup, originalFind, originalRemove, Popup, fixturePopup;
            try {
                const { appendLorebookControls } = await import('${base}src/ui/settings/ui-settings-lorebooks.js');
                ({ lorebookCleanup: cleanup } = await import('${base}src/lore/lorebook-cleanup-runtime.js'));
                ({ Popup } = await import('/scripts/popup.js'));
                const { getSettings } = await import('${base}src/core/settings.js');
                const { defaultSettings } = await import('${base}src/core/settings-defaults.js');
                if (defaultSettings.autoCreateLorebook !== true) throw new Error('Creation must default on');
                const unused = await cleanup.find();
                originalFind = cleanup.find;
                originalRemove = cleanup.remove;
                view = document.createElement('div');
                document.body.append(view);
                appendLorebookControls(view);
                const checkbox = view.querySelector('input[type=checkbox]');
                if (!checkbox || checkbox.checked !== !!getSettings().autoCreateLorebook) throw new Error('Toggle mismatch');
                const names = ['Castward Chat orphan <test>', 'Castward Chat orphan 2'];
                cleanup.find = async () => names;
                const removed = [];
                cleanup.remove = async selected => {
                    removed.push([...selected]);
                    return { deleted: selected.length, failed: 0, skipped: 0 };
                };
                let confirmations = 0;
                const button = view.querySelector('.sillynpc-cleanup-lorebooks');
                const click = async allow => {
                    const existing = new Set(Popup.util.popups);
                    button.click();
                    for (let n = 0; n < 100; n++) {
                        fixturePopup = Popup.util.popups.find(popup => !existing.has(popup));
                        if (fixturePopup) break;
                        await new Promise(resolve => setTimeout(resolve, 20));
                    }
                    if (!fixturePopup) throw new Error('Confirmation did not open');
                    confirmations++;
                    const content = fixturePopup.content;
                    if (!names.every(name => content.textContent.includes(name))
                        || content.textContent.includes('[object HTMLDivElement]')
                        || content.querySelector('test')) throw new Error('Unsafe or missing preview');
                    (allow ? fixturePopup.okButton : fixturePopup.cancelButton).click();
                    for (let n = 0; n < 100 && button.disabled; n++) await new Promise(resolve => setTimeout(resolve, 20));
                    if (button.disabled) throw new Error('Cleanup did not finish');
                    fixturePopup = null;
                };
                await click(false);
                if (removed.length) throw new Error('Cancel deleted books');
                await click(true);
                if (confirmations !== 2 || JSON.stringify(removed) !== JSON.stringify([names])) throw new Error('Wrong deletion list');
                root.setAttribute('data-castward-lorebook-result', JSON.stringify({ ok: true, confirmations, deleted: removed[0].length, unusedBooks: unused.length }));
            } catch (error) {
                root.setAttribute('data-castward-lorebook-result', JSON.stringify({ error: error.stack || String(error) }));
            } finally {
                if (originalFind) cleanup.find = originalFind;
                if (originalRemove) cleanup.remove = originalRemove;
                if (fixturePopup) await fixturePopup.completeCancelled();
                view?.remove();
                document.querySelector('#castward-lorebook-test')?.remove();
            }
        `;
        document.body.append(script);
    """)
    result = None
    for _ in range(150):
        raw = browser.execute("return document.documentElement.getAttribute('data-castward-lorebook-result')")
        if raw:
            result = json.loads(raw)
            break
        time.sleep(0.1)
    browser.execute("document.documentElement.removeAttribute('data-castward-lorebook-result')")
    assert result and result.get('ok'), result
    browser.execute("document.querySelector('#sillynpc-open-manage').click()")
    browser.execute("document.querySelector('.sillynpc-section[data-section=profiles]').click()")
    assert browser.execute("""return !!document.querySelector('[data-panel=profiles] [data-setting=autoCreateLorebook]')
        && !!document.querySelector('[data-panel=profiles] .sillynpc-cleanup-lorebooks');""")
    print(json.dumps(result))
