"""Read-only place lore integration through SillyTavern's real dry-run scanner."""
import json
import time
from ui_webdriver import browser_session


with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(script =>
        script.src.includes('/SillyNPC-XP/index.js'));
        if (!entry) throw new Error('Castward entry script not loaded');
        const root = new URL('.', entry.src).href;
        const script = document.createElement('script');
        script.id = 'castward-place-lore-check'; script.type = 'module';
        script.textContent = `
          try {
            const { checkLocationLore } = await import(${JSON.stringify(root + 'tests/fixtures/ui-location-lore.js')});
            const result = await checkLocationLore(${JSON.stringify(root)});
            document.documentElement.setAttribute('data-place-lore-check', JSON.stringify({result}));
          } catch (error) {
            document.documentElement.setAttribute('data-place-lore-check', JSON.stringify({error: String(error) + ' | ' + (error.stack || '')}));
          }
        `;
        document.body.append(script);""")
    try:
        for _ in range(200):
            raw = browser.execute("return document.documentElement.getAttribute('data-place-lore-check')")
            if raw:
                outcome = json.loads(raw)
                assert 'error' not in outcome, outcome.get('error')
                assert outcome['result'] and all(outcome['result'].values()), outcome
                print('Castward live place lore passed:', json.dumps(outcome['result']))
                break
            time.sleep(0.1)
        else:
            raise AssertionError('Place lore fixture timed out')
    finally:
        browser.execute("""document.querySelector('#castward-place-lore-check')?.remove();
            document.documentElement.removeAttribute('data-place-lore-check');""")
