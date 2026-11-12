"""Run expression display synchronization checks without models or saved fixtures."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""
      const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script'); script.type = 'module'; script.id = 'pack-refresh-fixture';
      script.textContent = `
        let result;
        try {
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const {verifyExpressionPackRefresh} = await import(root + 'tests/fixtures/ui-expression-pack-refresh.js');
          result = await verifyExpressionPackRefresh(root);
        } catch (error) { result = {error: String(error) + String(error.stack || '')}; }
        document.documentElement.setAttribute('data-pack-refresh-fixture', JSON.stringify(result));
      `;
      document.head.append(script);
    """)
    try:
        result = None
        for _ in range(120):
            raw = browser.execute("return document.documentElement.getAttribute('data-pack-refresh-fixture')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(.25)
        assert result and not result.get('error') and all(value is True for value in result.values()), result
        print('Expression pack refresh UI passed:', json.dumps(result))
    finally:
        browser.execute("document.querySelector('#pack-refresh-fixture')?.remove();document.documentElement.removeAttribute('data-pack-refresh-fixture');")
