"""Read-only running-host Places UI check; all fixture writes stay in isolated memory."""
import json
import time
from ui_webdriver import browser_session


with browser_session() as browser:
    browser.resize(420, 900)
    browser.execute("""const entry = [...document.scripts].find(script =>
        script.src.includes('/SillyNPC-XP/index.js'));
        if (!entry) throw new Error('Castward entry script not loaded');
        const root = new URL('.', entry.src).href;
        const script = document.createElement('script');
        script.id = 'sillynpc-locations-ui-check'; script.type = 'module';
        script.textContent = `
          try {
            const { checkLocations } = await import(${JSON.stringify(root + 'tests/fixtures/ui-locations.js')});
            const result = await checkLocations(${JSON.stringify(root)});
            document.documentElement.setAttribute('data-locations-ui-check', JSON.stringify({result}));
          } catch (error) {
            document.documentElement.setAttribute('data-locations-ui-check', JSON.stringify({error: String(error) + ' | ' + (error.stack || '')}));
          }
        `;
        document.body.append(script);""")
    try:
        for attempt in range(200):
            outcome = browser.execute("return document.documentElement.getAttribute('data-locations-ui-check')")
            if outcome:
                break
            time.sleep(0.1)
        else:
            raise AssertionError('Places fixture timed out')
        outcome = json.loads(outcome)
        assert 'error' not in outcome, outcome.get('error')
        assert outcome['result'] and all(outcome['result'].values()), outcome
        print('Castward live Places UI passed:', json.dumps(outcome['result']))
    finally:
        browser.execute("""document.querySelector('#sillynpc-locations-ui-check')?.remove();
            document.documentElement.removeAttribute('data-locations-ui-check');""")
