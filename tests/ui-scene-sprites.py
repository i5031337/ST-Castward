"""Read-only scene sprite layout check against a running local SillyTavern."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    for width, height in [(1440, 1000), (390, 844)]:
        browser.resize(width, height)
        browser.execute("""const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
            const script = document.createElement('script'); script.type = 'module';
            script.id = 'sillynpc-scene-sprite-test';
            script.src = new URL('tests/fixtures/ui-scene-sprites.js?width=' + innerWidth, new URL('.', entry.src));
            document.head.append(script);""")
        result = None
        try:
            for _ in range(80):
                raw = browser.execute("return document.documentElement.getAttribute('data-scene-sprite-test')")
                if raw:
                    result = json.loads(raw)
                    break
                time.sleep(.25)
            assert result and 'error' not in result, result
            viewport = browser.execute('return [innerWidth, innerHeight]')
            print(json.dumps({'viewport': viewport, **result}))
        finally:
            browser.execute("""document.getElementById('sillynpc-scene-sprite-test')?.remove();
                document.documentElement.removeAttribute('data-scene-sprite-test');""")
