"""Check empty tracker hit targets and editing with isolated, unsaved writes."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""
      const entry = [...document.scripts].find(script => script.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script');
      script.type = 'module'; script.id = 'tracker-editing-check';
      script.textContent = `
        const root = ${JSON.stringify(new URL('.', entry.src).href)};
        const result = {};
        const host = document.createElement('div');
        host.className = 'sillynpc-status-box';
        Object.assign(host.style, {position:'fixed',inset:'20px',zIndex:'999999',background:'#222'});
        try {
          const { bindTrackerEditor, isTrackerEditLocked } = await import(root + 'src/tracker/tracker-edit-lock.js');
          const { renderFieldSet } = await import(root + 'src/tracker/ui/status-ui-template-core.js');
          const source = await (await fetch(root + 'src/tracker/ui/status-ui-edit.js')).text();
          const code = source.split(String.fromCharCode(10)).filter(line => !line.startsWith('import '))
            .join(String.fromCharCode(10))
            .replaceAll('export function ', 'function ');
          const updates = [];
          const state = {characters:[{name:'Empty fixture'}]};
          const attach = new Function('bindTrackerEditor','isTrackerEditLocked','loadStateFromMetadata','applyUpdate',
            code + ';return attachInlineEditListeners;')(bindTrackerEditor, isTrackerEditLocked, () => state,
              (update, options) => updates.push({update,options}));
          const fields = [{name:'Condition',type:'text',format:'{{name}}: {{value}}'},
            {name:'Counter',type:'number',format:'{{value}}'}];
          for (const type of ['global','player','character']) {
            const row = document.createElement('div');
            row.innerHTML = renderFieldSet(fields, () => '', type, type === 'character' ? 0 : null);
            host.append(row);
          }
          document.body.append(host);
          attach(host, {state});
          const editors = [...host.querySelectorAll('.sillynpc-status-editable')];
          result.emptyTargets = editors.length === 6 && editors.every(editor => {
            const box = editor.getBoundingClientRect();
            return box.width >= 10 && box.height >= 10 && getComputedStyle(editor).display === 'inline-block';
          });
          result.placeholderIsVisual = editors.every(editor => !editor.innerText.trim()
            && getComputedStyle(editor, '::before').content.includes('—'));
          editors[0].focus(); editors[0].blur();
          result.unchangedDoesNotWrite = updates.length === 0;
          editors.forEach(editor => {
            editor.focus();
            document.execCommand('insertText', false, editor.dataset.key === 'Counter' ? '7' : 'Ready');
            editor.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true}));
          });
          result.allScopesEdited = updates.length === 6
            && updates[0].update.global.Condition === 'Ready'
            && updates[1].update.global.Counter === '7'
            && updates[2].update.player.stats.Condition === 'Ready'
            && updates[3].update.player.stats.Counter === '7'
            && updates[4].update.characters[0].name === 'Empty fixture'
            && updates[4].update.characters[0].stats.Condition === 'Ready'
            && updates[5].update.characters[0].stats.Counter === '7'
            && updates.every(({options}) => options.verbatim && options.progressionResolved);
          editors[0].focus(); editors[0].innerText = ''; editors[0].blur();
          result.clearAndRefill = updates.at(-1).update.global.Condition === '';
          editors[0].focus(); document.execCommand('insertText', false, 'Rested'); editors[0].blur();
          result.clearAndRefill &&= updates.at(-1).update.global.Condition === 'Rested';
          if (!Object.values(result).every(Boolean)) throw Error(JSON.stringify(result));
          document.documentElement.setAttribute('data-tracker-editing', JSON.stringify({result}));
        } catch(error) {
          document.documentElement.setAttribute('data-tracker-editing', JSON.stringify({error:String(error) + String(error.stack || ''),result}));
        } finally {host.remove();}
      `;
      document.head.append(script);
    """)
    try:
        for _ in range(100):
            raw = browser.execute("return document.documentElement.getAttribute('data-tracker-editing')")
            if raw:
                break
            time.sleep(0.1)
        else:
            raise AssertionError('Tracker editing fixture timed out')
        outcome = json.loads(raw)
        assert 'error' not in outcome, outcome
        print('Tracker editing passed:', json.dumps(outcome['result']))
    finally:
        browser.execute("""document.querySelector('#tracker-editing-check')?.remove();
          document.documentElement.removeAttribute('data-tracker-editing');""")
