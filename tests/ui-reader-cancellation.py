"""Exercise the standard Stop button with reversible, mocked reader requests."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(script => script.src.includes('/SillyNPC-XP/index.js'));
        const script = document.createElement('script');
        script.type = 'module'; script.id = 'reader-cancellation-fixture';
        script.src = new URL('tests/fixtures/ui-reader-cancellation.js', entry.src).href;
        document.head.appendChild(script);""")
    result = None
    try:
        for _ in range(80):
            raw = browser.execute("return document.documentElement.getAttribute('data-reader-cancellation')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(0.25)
        assert result and 'error' not in result and all(result.values()), result
        print(json.dumps(result))
    finally:
        browser.execute("""document.querySelector('#reader-cancellation-fixture')?.remove();
            document.documentElement.removeAttribute('data-reader-cancellation');""")
