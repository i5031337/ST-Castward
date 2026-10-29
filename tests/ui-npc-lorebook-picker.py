"""Real lorebook chooser and pending NPC creation; storage and generation are mocked."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
        const script = document.createElement('script'); script.type = 'module'; script.id = 'castward-picker-probe';
        script.src = new URL('tests/fixtures/ui-npc-lorebook-picker.js', new URL('.', entry.src)).href;
        document.body.append(script);""")
    try:
        for _ in range(200):
            raw = browser.execute("return document.body.getAttribute('data-npc-lorebook-picker-result')")
            if raw:
                result = json.loads(raw)
                print(json.dumps(result, indent=2))
                assert result and all(value is True for value in result.values()), result
                break
            time.sleep(0.2)
        else:
            raise AssertionError('Lorebook picker probe timed out')
    finally:
        browser.execute("document.querySelector('#castward-picker-probe')?.remove(); document.body.removeAttribute('data-npc-lorebook-picker-result')")
