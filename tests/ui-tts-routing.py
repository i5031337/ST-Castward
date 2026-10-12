"""Unsaved Firefox checks for generic model routing and actual preview/playback."""
import json
import time
from pathlib import Path
from ui_webdriver import browser_session

source = Path(__file__).with_name('fixtures').joinpath('ui-tts-routing.js').read_text()
with browser_session(allow_audio=True) as browser:
    browser.execute("""
        const script = document.createElement('script');
        script.type = 'module'; script.id = 'sillynpc-tts-routing-fixture';
        script.textContent = """ + json.dumps(source) + "; document.head.append(script);")
    try:
        result = None
        for _ in range(160):
            raw = browser.execute("return document.documentElement.getAttribute('data-tts-routing-fixture')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(.25)
        assert result and not result.get('error') and all(value is True for value in result.values()), result
        print('TTS routing UI passed:', json.dumps(result))
    finally:
        browser.execute("document.getElementById('sillynpc-tts-routing-fixture')?.remove();document.documentElement.removeAttribute('data-tts-routing-fixture');")
