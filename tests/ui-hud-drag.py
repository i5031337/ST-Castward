"""Exercise HUD touch/mouse gestures in the host browser without saving settings."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.resize(480, 800)
    browser.execute('''
      const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        try {
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const moduleUrl = root + 'src/ui/hud/ui-hud.js';
          const { getSettings } = await import(root + 'src/core/settings.js');
          const fixture = window.hudDragFixture = {
            settings: structuredClone(getSettings()), saves: 0, opens: 0,
            original: document.getElementById('sillynpc-hud'),
          };
          fixture.original?.removeAttribute('id');
          fixture.settings.statusTracker.hud = { position: { x: null, y: null } };
          fixture.settings.statusTracker.hudPosition = 'top-left';
          fixture.settings.statusTracker.hudScale = 1.25;
          let source = await (await fetch(moduleUrl)).text();
          source = source
            .replace(/import \\{ eventSource \\} from [^;]+;/,
              'const eventSource = { on() {} };')
            .replace(/import \\{ getSettings, saveSettings \\} from [^;]+;/,
              'const getSettings = () => window.hudDragFixture.settings; const saveSettings = () => window.hudDragFixture.saves++;')
            .replace(/import \\{ openPlayerSheet \\} from [^;]+;/,
              'const openPlayerSheet = () => window.hudDragFixture.opens++;')
            .replace(/import \\{ renderHUD \\} from [^;]+;/,
              'const renderHUD = () => {};')
            .replace(/from '([^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL(path, moduleUrl).href));
          const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          try { (await import(url)).initHUD(); } finally { URL.revokeObjectURL(url); }
          fixture.hud = document.getElementById('sillynpc-hud');
          fixture.hud.style.width = '180px';
          fixture.hud.style.height = '90px';
          const portrait = fixture.hud.querySelector('.sillynpc-hud-portrait');
          portrait.style.width = portrait.style.height = '60px';
          document.body.setAttribute('data-hud-drag-ready', 'ok');
        } catch (error) {
          document.body.setAttribute('data-hud-drag-ready', String(error.stack));
        }
      `;
      document.body.append(script); script.remove();
    ''')
    try:
        result = None
        for _ in range(80):
            result = browser.execute("return document.body.getAttribute('data-hud-drag-ready')")
            if result:
                break
            time.sleep(.25)
        assert result == 'ok', result

        def state():
            return browser.execute('''
              const f = window.hudDragFixture;
              const r = f.hud.getBoundingClientRect();
              const p = f.hud.querySelector('.sillynpc-hud-portrait');
              const pr = p.getBoundingClientRect();
              return { x: r.left, y: r.top, px: Math.round(pr.x + pr.width / 2),
                py: Math.round(pr.y + pr.height / 2), saves: f.saves, opens: f.opens,
                position: f.settings.statusTracker.hud.position,
                dragging: f.hud.classList.contains('is-dragging'),
                touchAction: getComputedStyle(p).touchAction };
            ''')

        def gesture(kind, dx=0, dy=0, cancel=False):
            before = state()
            actions = [
                {'type': 'pointerMove', 'duration': 0, 'x': before['px'], 'y': before['py']},
                {'type': 'pointerDown', 'button': 0},
                {'type': 'pointerMove', 'duration': 150,
                 'x': before['px'] + dx, 'y': before['py'] + dy},
            ]
            if cancel:
                # A browser interruption must finish using the last movement coordinates.
                browser.request('POST', f'/session/{browser.session}/actions', {'actions': [{
                    'type': 'pointer', 'id': kind, 'parameters': {'pointerType': kind}, 'actions': actions,
                }]})
                browser.execute('''
                  const p = hudDragFixture.hud.querySelector('.sillynpc-hud-portrait');
                  p.dispatchEvent(new PointerEvent('pointercancel', {
                    bubbles: true, pointerId: window.hudDragPointerId, pointerType: 'touch'
                  }));
                ''')
                browser.request('DELETE', f'/session/{browser.session}/actions')
            else:
                actions.append({'type': 'pointerUp', 'button': 0})
                browser.request('POST', f'/session/{browser.session}/actions', {'actions': [{
                    'type': 'pointer', 'id': kind, 'parameters': {'pointerType': kind}, 'actions': actions,
                }]})
            return before, state()

        browser.execute('''
          hudDragFixture.hud.addEventListener('pointerdown', event => {
            window.hudDragPointerId = event.pointerId;
          });
        ''')
        assert state()['touchAction'] == 'none', state()
        before, after = gesture('touch')
        assert after['opens'] == 1 and after['saves'] == 0, after
        assert after['position'] == {'x': None, 'y': None}, after
        before, after = gesture('touch', 80, 110)
        assert abs(after['x'] - before['x'] - 80) < 2, (before, after)
        assert abs(after['y'] - before['y'] - 110) < 2, (before, after)
        assert after['saves'] == 1 and after['opens'] == 1 and not after['dragging'], after
        before, after = gesture('mouse', 25, 30)
        assert abs(after['x'] - before['x'] - 25) < 2, (before, after)
        assert after['saves'] == 2 and after['opens'] == 1, after
        before, after = gesture('touch', -30, -40, cancel=True)
        assert after['saves'] == 3 and not after['dragging'], after
        before, after = gesture('touch')
        assert after['opens'] == 2 and after['saves'] == 3, after
        browser.execute('''
          hudDragFixture.hud.querySelector('.sillynpc-hud-portrait').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        ''')
        assert state()['opens'] == 3, state()
        print(json.dumps({'touchDrag': 'passed', 'mouseDrag': 'passed',
                          'tapAndKeyboardClick': 'passed', 'cancelAndRetry': 'passed'}))
    finally:
        browser.execute('''
          const f = window.hudDragFixture;
          f?.hud?.remove();
          if (f?.original) f.original.id = 'sillynpc-hud';
          delete window.hudDragFixture;
          delete window.hudDragPointerId;
          document.body.removeAttribute('data-hud-drag-ready');
        ''')
