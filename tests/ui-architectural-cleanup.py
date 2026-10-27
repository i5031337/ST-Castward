"""Unsaved tracker ownership and lifecycle fixtures in the running SillyTavern host."""
import json
import time
from ui_webdriver import browser_session


with browser_session() as browser:
    browser.execute("""
      const entry = [...document.scripts].find(script => script.src.includes('/SillyNPC-XP/index.js'));
      if (!entry) throw new Error('Extension entry missing');
      const script = document.createElement('script');
      script.type = 'module'; script.id = 'tracker-cleanup-fixture';
      script.textContent = `
        const root = ${JSON.stringify(new URL('.', entry.src).href)};
        const result = {};
        try {
          for (const [file, name] of [
            ['ui-collection-editor.js', 'runCollectionEditorFixture'],
            ['ui-tracker-lifecycle.js', 'runTrackerLifecycleFixture'],
            ['ui-schema-operations.js', 'runSchemaOperationFixture'],
          ]) {
            const fixture = await import(root + 'tests/fixtures/' + file);
            result[file] = await fixture[name](root);
          }
        } catch (error) { result.error = error.stack; }
        document.documentElement.setAttribute('data-tracker-cleanup', JSON.stringify(result));
      `;
      document.head.append(script);
    """)
    try:
        result = None
        for _ in range(100):
            raw = browser.execute("return document.documentElement.getAttribute('data-tracker-cleanup')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(0.1)
        assert result and 'error' not in result, result
        for checks in result.values():
            assert checks and all(value is True for value in checks.values()), checks
        print('Castward architectural cleanup passed:', json.dumps(result))
    finally:
        browser.execute("""document.querySelector('#tracker-cleanup-fixture')?.remove();
          document.documentElement.removeAttribute('data-tracker-cleanup');""")
