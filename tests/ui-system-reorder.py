"""Exercise System drag handles in the running host using unsaved draft editors."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.resize(1280, 1100)
    browser.execute("""
      const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script'); script.type = 'module'; script.id = 'sillynpc-reorder-fixture';
      script.textContent = `
        let host;
        try {
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const { createBuiltinSystem } = await import(root + 'src/core/builtin-systems.js');
          const { createDraftContext } = await import(root + 'src/generation/draft-context.js');
          const { buildStatsEditor } = await import(root + 'src/ui/system/ui-system-stats.js');
          const { buildProfilesEditor } = await import(root + 'src/ui/system/ui-system-profiles.js');
          const { buildCollectionsEditor } = await import(root + 'src/ui/system/ui-system-collections.js');
          host = document.createElement('div'); host.id = 'sillynpc-reorder-host'; host.className = 'sillynpc-system-builder';
          Object.assign(host.style, { position: 'fixed', inset: '10px', zIndex: '999999', overflow: 'auto',
            background: '#222', padding: '16px' });
          document.body.append(host);
          const result = {};
          const check = (value, message) => { if (!value) throw new Error(message); };
          let globalDrops = 0;
          const watchDrop = () => globalDrops++;
          document.addEventListener('drop', watchDrop);
          try {
            const drag = (source, target, after = true) => {
              const handle = source.querySelector('.sillynpc-drag-handle');
              check(handle, 'Missing drag handle');
              target.scrollIntoView({ block: 'center' });
              const origin = handle.getBoundingClientRect();
              handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1,
                button: 0, clientX: origin.x + 5, clientY: origin.y + 5 }));
              const box = target.getBoundingClientRect();
              const clientX = box.right - 4, clientY = after ? box.bottom - 4 : box.top + 4;
              document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, clientX, clientY }));
              const accepted = target.classList.contains(after ? 'sillynpc-drop-after' : 'sillynpc-drop-before');
              document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, clientX, clientY }));
              check(!host.querySelector('.sillynpc-drop-before, .sillynpc-drop-after, .sillynpc-reorder-dragging'), 'Drag decoration left behind');
              return accepted;
            };
            for (const [key, selector] of [['characterStats', '.sillynpc-system-stat-row'], ['globalStats', '.sillynpc-system-stat-row'],
                ['profiles', '.sillynpc-system-profile-row'], ['collections', '.sillynpc-system-collection-row']]) {
              let saves = 0;
              const context = createDraftContext(createBuiltinSystem('fantasy'), () => saves++);
              const render = () => host.replaceChildren(key === 'profiles' ? buildProfilesEditor(render, context)
                : key === 'collections' ? buildCollectionsEditor(render, context) : buildStatsEditor(key, render, context));
              render();
              const list = key === 'profiles' ? context.definition().profiles : key === 'collections'
                ? context.getSettings().statusTracker.collections : context.definition().stats[key === 'globalStats' ? 'world' : 'character'];
              const original = [...list], beforeSaves = saves;
              const rows = host.querySelectorAll(selector);
              check(drag(rows[0], rows[1]), key + ' rejected valid drag');
              check(list[0] === original[1] && list[1] === original[0], key + ' order did not change');
              check(saves === beforeSaves + 1, key + ' did not save once');
              const captured = context.capture();
              const savedList = key === 'profiles' ? captured.profiles : key === 'collections' ? captured.collections
                : captured.stats[key === 'globalStats' ? 'world' : 'character'];
              check(savedList[0].id === original[1].id, key + ' capture lost order');
              // The same focused handle also works without a mouse.
              host.querySelector(selector + ' .sillynpc-drag-handle').dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
              check(list[0] === original[0], key + ' keyboard reorder failed');
              // Cancelled drags preserve data and clear the insertion indicator.
              const handle = host.querySelector(selector + ' .sillynpc-drag-handle');
              handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
              document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, clientX: 20, clientY: 20 }));
              document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
              check(list[0] === original[0] && !host.querySelector('.sillynpc-reorder-dragging'), key + ' cancellation failed');
              result[key] = true;
            }
            const context = createDraftContext(createBuiltinSystem('fantasy'));
            const render = () => host.replaceChildren(buildCollectionsEditor(render, context)); render();
            const collection = context.getSettings().statusTracker.collections[0];
            let fieldList = host.querySelector('.fields-list');
            check(!fieldList.firstElementChild.querySelector('.sillynpc-drag-handle'), 'Identifier is draggable');
            check(!fieldList.children[1].querySelector('.sillynpc-drag-handle'), 'Built-in quantity is draggable');
            const originalFields = [...collection.fields];
            check(!drag(fieldList.children[2], fieldList.children[0], false), 'Allowed a field before identifier');
            check(collection.fields[0] === originalFields[0], 'Identifier moved');
            fieldList = host.querySelector('.fields-list');
            check(drag(fieldList.children[2], fieldList.children[0], true), 'Field could not move below identifier');
            check(collection.fields[1] === originalFields[2], 'Collection field reorder failed');
            // A nested field must never reorder an enclosing collection or another collection's fields.
            const collections = context.getSettings().statusTracker.collections;
            const firstCollection = collections[0], firstField = firstCollection.fields[1];
            const foreignRow = host.querySelectorAll('.sillynpc-system-collection-row')[1];
            fieldList = host.querySelector('.fields-list');
            check(!drag(fieldList.children[1], foreignRow), 'Accepted cross-list drag');
            check(collections[0] === firstCollection && firstCollection.fields[1] === firstField, 'Cross-list drag changed data');
            check(globalDrops === 0, 'Drop reached SillyTavern global handler');
            check(!host.querySelector('.stat-up-btn, .stat-down-btn, .move-up-btn, .move-down-btn, .move-field-up, .move-field-down'), 'Arrow buttons remain');
            result.nestedFields = true;
            result.protectedFields = true;
            result.isolatedDrops = true;
            // Leave an unsaved Profile editor ready for a real WebDriver mouse drag.
            const nativeContext = createDraftContext(createBuiltinSystem('fantasy'));
            const nativeRender = () => host.replaceChildren(buildProfilesEditor(nativeRender, nativeContext));
            nativeRender();
            host.scrollTop = 0;
            document.body.setAttribute('data-sillynpc-reorder-result', JSON.stringify(result));
          } finally { document.removeEventListener('drop', watchDrop); }
        } catch (error) {
          host?.remove();
          document.body.setAttribute('data-sillynpc-reorder-result', JSON.stringify({ error: error.stack }));
        }
      `;
      document.body.append(script);
    """)
    try:
        result = None
        for _ in range(100):
            raw = browser.execute("return document.body.getAttribute('data-sillynpc-reorder-result')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(.1)
        assert result and 'error' not in result, result
        points = browser.execute("""
          const host = document.querySelector('#sillynpc-reorder-host');
          const rows = host.querySelectorAll('.sillynpc-system-profile-row');
          const source = rows[0].querySelector('.sillynpc-drag-handle').getBoundingClientRect();
          const target = rows[1].getBoundingClientRect();
          return { x: Math.round(source.x + source.width / 2), y: Math.round(source.y + source.height / 2),
            toX: Math.round(target.right - 4), toY: Math.round(target.bottom - 5) };
        """)
        browser.request('POST', f'/session/{browser.session}/actions', {'actions': [{
            'type': 'pointer', 'id': 'mouse', 'parameters': {'pointerType': 'mouse'}, 'actions': [
                {'type': 'pointerMove', 'duration': 0, 'x': points['x'], 'y': points['y']},
                {'type': 'pointerDown', 'button': 0}, {'type': 'pause', 'duration': 150},
                {'type': 'pointerMove', 'duration': 200, 'x': points['x'] + 12, 'y': points['y'] + 12},
                {'type': 'pointerMove', 'duration': 700, 'x': points['toX'], 'y': points['toY']},
                {'type': 'pause', 'duration': 200}, {'type': 'pointerUp', 'button': 0},
            ]}]})
        for _ in range(40):
            order = browser.execute("return [...document.querySelectorAll('#sillynpc-reorder-host .profile-label')].map(input => input.value)")
            if order[:2] == ['Ancestry or Species', 'Background']:
                break
            time.sleep(.1)
        assert order[:2] == ['Ancestry or Species', 'Background'], {'order': order, 'points': points}
        result['nativeMouseDrag'] = True
        browser.execute("""
          const host = document.querySelector('#sillynpc-reorder-host'); host.scrollTop = 0;
          const handle = host.querySelector('.sillynpc-drag-handle');
          const rect = handle.getBoundingClientRect(), bounds = host.getBoundingClientRect();
          handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 2,
            button: 0, clientX: rect.x + 4, clientY: rect.y + 4 }));
          document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 2,
            clientX: bounds.right - 20, clientY: bounds.bottom - 5 }));
        """)
        time.sleep(.3)
        scrolled = browser.execute("""
          const host = document.querySelector('#sillynpc-reorder-host');
          const scrolled = host.scrollTop > 0;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          return scrolled && !document.body.classList.contains('sillynpc-reordering')
            && !host.querySelector('.sillynpc-reorder-dragging, .sillynpc-drop-before, .sillynpc-drop-after');
        """)
        assert scrolled, 'Edge scrolling or Escape cancellation failed'
        result['edgeScrollAndEscape'] = True
        print('System reorder live UI passed:', json.dumps(result))
    finally:
        browser.execute("document.querySelector('#sillynpc-reorder-host')?.remove(); document.querySelector('#sillynpc-reorder-fixture')?.remove(); document.body.removeAttribute('data-sillynpc-reorder-result')")
