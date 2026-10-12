"""Unsaved host-rendered completed-line streaming fixture; no model or speech requests."""
import json
import time
from pathlib import Path
from ui_webdriver import browser_session

source = Path(__file__).with_name('fixtures').joinpath('ui-npc-streaming.js').read_text()
with browser_session() as browser:
    browser.execute("""
        const script = document.createElement('script');
        script.type = 'module'; script.id = 'sillynpc-streaming-fixture';
        script.textContent = """ + json.dumps(source) + "; document.head.append(script);")
    try:
        result = None
        for _ in range(160):
            raw = browser.execute("return document.documentElement.getAttribute('data-npc-streaming-fixture')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(.25)
        assert result and not result.get('error') and all(value is True for value in result.values()), result
        print('Completed-line streaming UI passed:', json.dumps(result))
    finally:
        browser.execute("document.getElementById('sillynpc-streaming-fixture')?.remove();document.documentElement.removeAttribute('data-npc-streaming-fixture');")
