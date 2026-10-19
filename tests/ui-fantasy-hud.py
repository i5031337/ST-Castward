"""Render the Fantasy starter floating HUD without saving settings or chat fixtures."""
import time
import json
from ui_webdriver import browser_session
with browser_session() as browser:
    browser.execute('''
      const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script'); script.type = 'module';
      script.textContent = `
        let settings, saved, host, hostApi, savedCharacter, fixtureIndex;
        try {
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const { createBuiltinSystem } = await import(root + 'src/core/builtin-systems.js');
          const { projectSystemTracker } = await import(root + 'src/core/system-schema.js');
          const { getSettings } = await import(root + 'src/core/settings.js');
          const { renderHUD } = await import(root + 'src/ui/hud/ui-hud-render.js');
          settings = getSettings(); saved = { enabled: settings.enabled, statusTracker: settings.statusTracker };
          const definition = createBuiltinSystem('fantasy');
          hostApi = await import('/script.js');
          savedCharacter = hostApi.this_chid;
          fixtureIndex = hostApi.characters.length;
          hostApi.characters.push({ name: 'HUD fixture', chat: 'unsaved-hud-fixture' });
          hostApi.setCharacterId(fixtureIndex);
          settings.enabled = true;
          settings.statusTracker = { ...settings.statusTracker, ...projectSystemTracker(definition), hudEnabled: true };
          host = document.createElement('div');
          host.className = 'sillynpc-hud-container';
          host.innerHTML = '<div class="sillynpc-hud-portrait"></div><div class="sillynpc-hud-stats"></div>';
          document.body.append(host);
          const state = { player: { stats: { HP: '12/12', Mana: '10/10', XP: '35/100', Level: '2' } } };
          renderHUD(host, state, { isDragging: false, applyHudZoom() {}, clampToViewport: (x,y) => ({x,y}), placeHud() {} });
          const rows = [...host.querySelectorAll('.sillynpc-hud-stat-row')].map(row => row.title);
          if (!rows.includes('XP: 35/100') || !rows.includes('Level: 2')) throw new Error('HUD missing XP/Level: ' + JSON.stringify(rows));
          document.body.setAttribute('data-fantasy-hud-result', JSON.stringify({ rows }));
        } catch (error) {
          document.body.setAttribute('data-fantasy-hud-result', JSON.stringify({ error: String(error) }));
        } finally {
          if (fixtureIndex !== undefined) {
            hostApi.setCharacterId(savedCharacter);
            hostApi.characters.splice(fixtureIndex, 1);
          }
          if (saved) Object.assign(settings, saved);
          host?.remove();
        }
      `;
      document.body.append(script); script.remove();
    ''')
    result = None
    for _ in range(80):
        result = browser.execute("return document.body.getAttribute('data-fantasy-hud-result')")
        if result: break
        time.sleep(.25)
    assert result, 'Fixture timed out'
    browser.execute("document.body.removeAttribute('data-fantasy-hud-result')")
    result = json.loads(result)
    assert 'error' not in result, result
    print(json.dumps(result))
