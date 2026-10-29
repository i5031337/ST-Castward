"""Player Fill dialogs with mocked generation and unsaved storage; no model requests."""
import json
import time
from ui_webdriver import browser_session


with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(script => script.src.includes('/SillyNPC-XP/index.js'));
        const script = document.createElement('script');
        script.type = 'module'; script.id = 'castward-player-creation-fixture';
        script.src = new URL('tests/fixtures/ui-player-creation.js', new URL('.', entry.src)).href;
        document.head.append(script);""")
    result = None
    try:
        for _ in range(160):
            raw = browser.execute("return document.documentElement.getAttribute('data-player-creation')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(0.25)
        assert result and not result.get('error'), result
        assert all(result.get(key) for key in [
            'threeStages', 'personaAndSystemExplained', 'startingSheetSelected', 'preview',
            'noWriteBeforeReview', 'cancelKeptDefaults', 'appliedOnce', 'repeatDisabled', 'libraryRegistered',
        ]), result
        print(json.dumps(result, indent=2))
    finally:
        browser.execute("""document.querySelector('#castward-player-creation-fixture')?.remove();
            document.documentElement.removeAttribute('data-player-creation');""")
