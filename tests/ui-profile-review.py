"""Real review controls followed by automatic profile filling; no saved fixtures or model calls."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
        const script = document.createElement('script'); script.type = 'module'; script.id = 'castward-profile-review-probe';
        script.src = new URL('tests/fixtures/ui-profile-review.js', new URL('.', entry.src)).href;
        document.body.append(script);""")
    try:
        for _ in range(160):
            raw = browser.execute("return document.body.getAttribute('data-profile-review-result')")
            if raw:
                result = json.loads(raw)
                print(json.dumps(result, indent=2))
                assert result and all(value is True for value in result.values()), result
                break
            time.sleep(0.2)
        else:
            raise AssertionError('Profile review fixture timed out')
    finally:
        browser.execute("document.querySelector('#castward-profile-review-probe')?.remove(); document.body.removeAttribute('data-profile-review-result')")
