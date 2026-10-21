"""Read-only production reader evidence check; no model requests or fixture saves."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(script =>
        script.src.includes('/SillyNPC-XP/index.js'));
        if (!entry) throw new Error('Extension entry script not found');
        const script = document.createElement('script');
        script.type = 'module'; script.id = 'castward-reader-evidence-check';
        script.textContent = `
          try {
            const root = ${JSON.stringify(new URL('.', entry.src).href)};
            const { collectLeadUp, buildUserPrompt } = await import(root + 'src/tracker/extractor/status-extractor-prompt.js');
            const { getSettings } = await import(root + 'src/core/settings.js');
            const chat = SillyTavern.getContext().chat;
            const saved = chat.slice();
            const result = {};
            try {
              chat.splice(0, chat.length,
                {mes:'Previous resolved reply.',is_user:false},
                {mes:'I pay three coins.',is_user:true,name:'Alex'},
                {mes:'Rowan marks his ledger.',is_user:false});
              const state = {global:{},player:{stats:{},collections:{}},characters:[]};
              const settings = getSettings().statusTracker;
              const prompt = buildUserPrompt(state, chat[2].mes, settings, collectLeadUp(2,0));
              const fresh = prompt.split('### FRESH PLAYER TURN (not yet reflected in state)')[1]
                ?.split('### LATEST ASSISTANT REPLY')[0] || '';
              result.freshActionAtZeroContext = fresh.includes('I pay three coins.')
                && !prompt.includes('Previous resolved reply.');
              result.resolutionAndDeduplication = prompt.includes("Use the assistant's resolution")
                && prompt.includes('Count an event once when both turns describe it');
              chat.push({mes:'Rowan tests the next anchor.',is_user:false});
              result.continuationClosesExchange = collectLeadUp(3,0).length === 0;
            } finally {
              chat.splice(0, chat.length, ...saved);
            }
            document.documentElement.setAttribute('data-reader-evidence-result', JSON.stringify(result));
          } catch (error) {
            document.documentElement.setAttribute('data-reader-evidence-result', JSON.stringify({error:String(error.stack || error)}));
          }
        `;
        document.body.append(script);""")
    try:
        result = None
        for _ in range(100):
            result = browser.execute("return document.documentElement.getAttribute('data-reader-evidence-result')")
            if result:
                break
            time.sleep(0.1)
        assert result, 'Reader module fixture timed out'
        result = json.loads(result)
        assert result and all(value is True for value in result.values()), result
        print(json.dumps(result, indent=2))
    finally:
        browser.execute("""document.querySelector('#castward-reader-evidence-check')?.remove();
            document.documentElement.removeAttribute('data-reader-evidence-result');""")
