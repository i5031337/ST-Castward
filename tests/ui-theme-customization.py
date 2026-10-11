"""Unsaved theme editor and computed-style checks in the running host."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""
      window.addEventListener('error', event => document.documentElement.setAttribute('data-theme-check', JSON.stringify({error: event.message})), {once:true});
      window.addEventListener('unhandledrejection', event => document.documentElement.setAttribute('data-theme-check', JSON.stringify({error: String(event.reason)})), {once:true});
      const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      if (!entry) throw Error('Extension entry not loaded');
      const script = document.createElement('script'); script.type = 'module';
      script.id = 'sillynpc-theme-check';
      script.textContent = `
        const base = ${JSON.stringify(new URL('.', entry.src).href)};
        const {getSettings} = await import(base + 'src/core/settings.js');
        const {applyThemeAppearance} = await import(base + 'src/core/theme-customization.js');
        const {renderThemeCustomization} = await import(base + 'src/ui/settings/ui-theme-customization.js');
        const {updateAllExtensionThemes} = await import(base + 'src/ui/shared/ui-theme.js');
        const {SILLYNPC_THEMES} = await import(base + 'src/core/constants.js');
        const settings = getSettings();
        const saved = {menuStyle: settings.menuStyle, themeOverrides: settings.themeOverrides};
        const mount = document.createElement('div'); mount.className = 'popup';
        mount.style.cssText = 'display:block; position:fixed; inset:20px; width:700px; height:800px; z-index:9999';
        const menu = document.createElement('div'); menu.className = 'sillynpc-manage';
        mount.append(menu); document.body.append(mount);
        const assert = (value, message) => {if (!value) throw Error(message)};
        const result = {};
        try {
          settings.themeOverrides = {};
          for (const id of ['default', ...SILLYNPC_THEMES]) {
            settings.menuStyle = id; menu.replaceChildren();
            applyThemeAppearance(menu, settings);
            renderThemeCustomization(menu, new Set(['Customize theme']), {get: () => settings, save: () => {}});
            assert(menu.querySelectorAll('[data-theme-field]').length === 21, 'All controls: ' + id);
            const change = (key, value) => {
              const input = menu.querySelector('[data-theme-field="' + key + '"] .text_pole');
              input.value = value; input.dispatchEvent(new Event('input', {bubbles:true}));
            };
            change('bg-primary', '#112233'); change('fg-primary', '#eeeeee');
            change('accent-text', '#abcdef'); change('font-family', 'sans-serif');
            change('surface', 'gradient');
            assert(getComputedStyle(menu).backgroundImage.includes('linear-gradient'), 'Gradient: ' + id);
            change('surface', 'paper');
            assert(getComputedStyle(menu).backgroundImage.includes('repeating-linear-gradient'), 'Paper: ' + id);
            change('surface', 'solid'); change('rounding', '0');
            change('border-width', '2'); change('density', 'compact'); change('line-height', '1.8');
            assert(getComputedStyle(menu).borderTopWidth === '2px', 'Border weight: ' + id);
            assert(menu.style.getPropertyValue('--sillynpc-space-md') === '9px', 'Spacing: ' + id);
            change('animations', 'off'); change('decorations', 'off');
            change('shadow', '0'); change('glow', '0'); change('blur', '0');
            assert(getComputedStyle(menu).backgroundColor === 'rgb(17, 34, 51)', 'Panel colour: ' + id);
            assert(getComputedStyle(menu).borderRadius === '0px', 'Rounding: ' + id);
            const heading = document.createElement('h3'); heading.className = 'sillynpc-section-title';
            heading.textContent = 'Heading'; menu.append(heading);
            assert(getComputedStyle(heading).color === 'rgb(171, 205, 239)', 'Heading colour: ' + id);
            assert(getComputedStyle(heading).fontFamily === 'sans-serif', 'Font: ' + id);
            assert(getComputedStyle(heading, '::after').display === 'none', 'Decorations: ' + id);
            const row = menu.querySelector('.sillynpc-setting');
            assert(getComputedStyle(row).animationName === 'none', 'Animations: ' + id);
            assert(getComputedStyle(menu).boxShadow.split('rgba(0, 0, 0, 0)').length === 3, 'Shadow: ' + id);
            for (const cls of ['sillynpc-status-box', 'sillynpc-reader-report', 'sillynpc-review-panel', 'sillynpc-hud-container']) {
              const surface = document.createElement('div'); surface.className = cls;
              mount.append(surface); applyThemeAppearance(surface, settings);
              assert(getComputedStyle(surface).color === 'rgb(238, 238, 238)', cls + ' text: ' + id);
              surface.remove();
            }
            const backgroundRow = menu.querySelector('[data-theme-field="bg-primary"]');
            backgroundRow.querySelector('button').click();
            assert(!settings.themeOverrides[id]['bg-primary'], 'Field reset: ' + id);
            assert(settings.themeOverrides[id]['fg-primary'] === '#eeeeee', 'Field reset isolation: ' + id);
            menu.querySelector('.sillynpc-theme-reset').click();
            assert(!settings.themeOverrides[id], 'Reset settings: ' + id);
            assert(!menu.style.getPropertyValue('--sillynpc-bg-primary'), 'Reset styles: ' + id);
          }
          result.presets = 9;
          mount.style.width = '280px';
          assert([...menu.querySelectorAll('.sillynpc-theme-controls')].every(row => row.scrollWidth <= row.clientWidth + 2), 'Narrow layout');
          result.narrowLayout = true;
        } catch (error) { result.error = error.message + ' | ' + error.stack; }
        finally {
          Object.assign(settings, saved); mount.remove(); updateAllExtensionThemes();
          document.documentElement.setAttribute('data-theme-check', JSON.stringify(result));
        }
      `;
      document.body.append(script);
    """)
    for _ in range(80):
        value = browser.execute("return document.documentElement.getAttribute('data-theme-check')")
        if value:
            break
        time.sleep(0.25)
    assert value, 'Theme fixture timed out'
    result = json.loads(value)
    browser.execute("document.querySelector('#sillynpc-theme-check')?.remove(); document.documentElement.removeAttribute('data-theme-check')")
    assert 'error' not in result, result
    print(json.dumps(result))
