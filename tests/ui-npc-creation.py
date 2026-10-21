"""Unsaved host tool registration, writing UI and mocked creation checks; no model requests."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      if (!entry) throw new Error('Castward entry missing');
      const script = document.createElement('script'); script.type = 'module'; script.id = 'castward-npc-probe';
      script.src = new URL('tests/fixtures/ui-npc-creation.js', new URL('.', entry.src)).href;
      document.body.append(script);""")
    try:
        for _ in range(160):
            raw = browser.execute("return document.body.getAttribute('data-npc-creation-result')")
            if raw:
                result = json.loads(raw)
                print(json.dumps(result, indent=2))
                assert result and all(value is True for value in result.values()), result
                break
            time.sleep(0.25)
        else:
            raise AssertionError('NPC tool probe timed out')
    finally:
        browser.execute("document.querySelector('#castward-npc-probe')?.remove(); document.body.removeAttribute('data-npc-creation-result')")
