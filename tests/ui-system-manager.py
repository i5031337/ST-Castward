"""Read-only Manager layout and inline editing check in the running host."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.resize(1400, 1100)
    browser.execute("document.querySelector('#sillynpc-open-manage').click()")
    for _ in range(50):
        if browser.execute("return !!document.querySelector('.sillynpc-section[data-section=systems]')"):
            break
        time.sleep(.1)
    browser.execute("""
      document.querySelector('.sillynpc-section[data-section=systems]').click();
      [...document.querySelectorAll('#sillynpc-systems-view .sillynpc-charview-tab')]
        .find(button => button.textContent === 'Manager').click();
      // Test a desktop-width menu without changing the user's saved window size.
      const popup = document.querySelector('.popup:has(.sillynpc-manage)');
      popup.style.width = '1100px'; popup.style.maxWidth = '95vw';
      const entry = [...document.scripts].find(script => script.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script');
      script.type = 'module'; script.id = 'castward-manager-fixture';
      script.textContent = `
        try {
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const { buildSystemManager } = await import(root + 'src/ui/system/ui-system-manager.js');
          const { getSettings } = await import(root + 'src/core/settings.js');
          const settings = getSettings(), rosters = settings.systemNpcRosters;
          const key = Object.keys(settings.statusTracker.presets)[0];
          const check = (ok, message) => { if (!ok) throw Error(message); };
          try {
            // Supply a saved roster only while rendering; never save or clear it.
            settings.systemNpcRosters = { ...rosters, [key]: { enabled: true, cards: [{ id: 'fixture', name: 'Fixture' }] } };
            document.querySelector('.sillynpc-systems-body').replaceChildren(buildSystemManager(() => {}));
          } finally { settings.systemNpcRosters = rosters; }
          const panel = document.querySelector('.sillynpc-system-manager');
          const list = panel.querySelector('.sillynpc-system-list');
          check(list.clientHeight > 300, 'Library still limited to 300px: ' + list.clientHeight);
          check(panel.getBoundingClientRect().bottom <= window.innerHeight,
            'Manager exceeds viewport: ' + JSON.stringify([...function* () {
              for (let element = panel; element; element = element.parentElement) yield {
                element: element.id || element.className, height: element.clientHeight,
                display: getComputedStyle(element).display, style: element.getAttribute('style') };
            }()]));
          check(![...panel.querySelectorAll('button')].some(button => button.textContent === 'Edit details'), 'Old edit button remains');
          check(panel.querySelectorAll('.sillynpc-system-name').length === Object.keys(settings.statusTracker.presets).length, 'Missing name fields');
          const titleStyle = getComputedStyle(panel.querySelector('.sillynpc-system-name'));
          const subtitleField = panel.querySelector('.sillynpc-system-description');
          const subtitleStyle = getComputedStyle(subtitleField);
          check(titleStyle.borderTopWidth === '0px' && titleStyle.paddingTop === '0px'
            && titleStyle.backgroundColor === 'rgba(0, 0, 0, 0)' && Number(titleStyle.fontWeight) >= 700,
            'Name no longer looks like a plain bold title');
          check(subtitleField.rows === 1 && subtitleStyle.borderTopWidth === '0px'
            && Number(subtitleStyle.opacity) === .6 && parseFloat(subtitleStyle.fontSize) < parseFloat(titleStyle.fontSize),
            'Subtitle no longer looks like compact muted text');
          const clear = [...panel.querySelectorAll('button')].find(button => button.textContent === 'Clear roster');
          check(clear.previousElementSibling.textContent === 'Export roster', 'Roster action order is wrong');
          const controls = [...clear.parentElement.querySelectorAll('label, button')];
          check(controls.length === 4, 'Expected four reuse/roster controls');
          const centers = controls.map(control => { const box = control.getBoundingClientRect(); return box.top + box.height / 2; });
          check(Math.max(...centers) - Math.min(...centers) < 2, 'Roster controls wrap at desktop width: ' + centers);
          check(panel.querySelector('button[aria-label="Duplicate System"] .fa-copy'), 'Missing accessible copy icon');
          const blank = panel.parentElement.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom;
          check(blank < 5, 'Unused space below Manager: ' + blank);

          // Exercise the real field builder against local data so nothing is persisted.
          const source = (await (await fetch(root + 'src/ui/system/ui-system-details.js')).text())
            .replace(/^import[^;]+;\\s*/gm, '').replace(/export function/g, 'function');
          const local = { name: 'Original', description: 'Subtitle' };
          let saves = 0, warnings = 0;
          const buildFields = new Function('getSettings', 'editSystemDetails', 'toastr',
            source + '; return buildSystemDetailFields;')(
              () => ({ statusTracker: { presets: { fixture: { metadata: local } } } }),
              (key, name, subtitle) => {
                if (!name.trim() || name === 'Taken') return false;
                Object.assign(local, { name: name.trim(), description: subtitle.trim() }); saves++; return true;
              }, { warning: () => warnings++ });
          const fields = buildFields('fixture');
          const name = fields.querySelector('input'), subtitle = fields.querySelector('textarea');
          name.value = 'Renamed'; name.dispatchEvent(new Event('change'));
          subtitle.value = 'New subtitle'; subtitle.dispatchEvent(new Event('change'));
          check(local.name === 'Renamed' && local.description === 'New subtitle' && saves === 2, 'Inline changes failed');
          name.value = 'Taken'; name.dispatchEvent(new Event('change'));
          check(name.value === 'Renamed' && warnings === 1 && saves === 2, 'Invalid name was not restored');
          name.value = 'Cancelled'; name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
          check(name.value === 'Renamed' && saves === 2, 'Escape did not cancel');
          let blurred = 0; name.blur = () => blurred++;
          name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
          check(blurred === 1, 'Enter did not commit');
          document.body.setAttribute('data-manager-result', JSON.stringify({ height: list.clientHeight,
            inlineEdits: true, invalidNames: true, keyboard: true, rosterControlsOneLine: true, copyIcon: true, fillsWindow: true }));
        } catch (error) {
          document.body.setAttribute('data-manager-result', JSON.stringify({ error: error.message + ' ' + error.stack }));
        }
      `;
      document.body.append(script);
    """)
    try:
        result = None
        for _ in range(100):
            raw = browser.execute("return document.body.getAttribute('data-manager-result')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(.1)
        assert result and 'error' not in result, result
        print('Manager live UI passed:', json.dumps(result))
    finally:
        browser.execute("document.querySelector('#castward-manager-fixture')?.remove(); document.body.removeAttribute('data-manager-result')")
