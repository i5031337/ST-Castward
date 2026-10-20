"""Unsaved page-context check of the reusable roster control and independent chat copies."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script');
      script.id = 'castward-roster-check'; script.type = 'module';
      script.textContent = `
        try {
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const { buildSystemManager } = await import(root + 'src/ui/system/ui-system-manager.js');
          const { getSettings } = await import(root + 'src/core/settings.js');
          const { captureNpcRoster, seedNpcRoster, setNpcRosterEnabled, setNpcRosterOption } = await import(root + 'src/characters/system-npc-roster.js');
          const { applyRosterStateSeed } = await import(root + 'src/characters/system-roster-state.js');
          const { readNpcMemories } = await import(root + 'src/tracker/npc-memories.js');
          const settings = getSettings();
          const panel = buildSystemManager(() => {});
          const controls = [...panel.querySelectorAll('input[aria-label^="Reuse NPCs"]')];
          if (controls.length !== Object.keys(settings.statusTracker.presets).length) throw Error('Missing roster controls');
          for (const control of controls) {
            const name = control.getAttribute('aria-label').replace('Reuse NPCs in new chats with ', '');
            if (control.checked !== (settings.systemNpcRosters?.[name]?.enabled === true)) throw Error('Wrong checkbox state');
            const row = control.closest('.sillynpc-system-reuse');
            const places = row.querySelector('input[aria-label^="Carry over Places"]');
            if (!places || row.querySelector('input[aria-label^="Carry over NPC memories"]')) throw Error('Memory carryover belongs in Builder');
            if (places.checked !== (settings.systemNpcRosters?.[name]?.reusePlaces === true)) throw Error('Wrong carryover state');
          }
          const fixture = {activeSystem:'A',statusTracker:{presets:{A:{definition:{memories:{carryOver:true}}}},npcStats:[
            {name:'Level',defaultValue:'1',carryOver:true},{name:'HP',defaultValue:'10',carryOver:false}
          ]}};
          const context = {getCurrentChatId:()=> 'fixture',chat:[],chatMetadata:{sillynpc_system:'A',sillynpc_npcs:[
            {id:'source',name:'Mira',profile:{detail:'Test'},statusOverrides:{Level:'4',HP:'2'},statusCollections:{bag:['ring']}}
          ]}};
          setNpcRosterEnabled(fixture,context,'A',true);
          context.chatMetadata.sillynpc_status_state = {locations:{enabled:true,currentId:'inn',records:{
            town:{name:'Town'},inn:{name:'Inn',parentId:'town'}
          }},npcMemories:{'id:source':{entries:[{id:'old',text:'Old memory',sourceMessageId:'7',provenance:{systemId:'A',sources:[{messageId:7,fingerprint:'old'}]}}],archive:[]}}};
          setNpcRosterOption(fixture,context,'A','reusePlaces',true);
          captureNpcRoster(fixture,context);
          context.chatMetadata = {sillynpc_system:'A'};
          seedNpcRoster(fixture,context,()=> 'independent');
          const card = context.chatMetadata.sillynpc_npcs[0];
          const state = {player:{stats:{HP:'10'}}};
          applyRosterStateSeed(state,context.chatMetadata);
          context.chatMetadata.sillynpc_status_state = state;
          const memory = readNpcMemories(state,card).entries[0];
          if (state.locations.currentId || state.locations.records.inn.parentId !== 'town'
            || memory.text !== 'Old memory' || memory.provenance || memory.sourceMessageId || !memory.manual) throw Error('Invalid state carryover');
          if (card.id !== 'independent' || card.statusOverrides.Level !== '4' || card.statusOverrides.HP !== '10'
            || Object.keys(card.statusCollections).length) throw Error('Invalid copied card');
          card.profile.detail = 'Changed'; captureNpcRoster(fixture,context);
          context.chatMetadata = {sillynpc_system:'A'};
          seedNpcRoster(fixture,context,()=> 'next');
          if (context.chatMetadata.sillynpc_npcs[0].profile.detail !== 'Changed') throw Error('Future edit missing');
          document.body.setAttribute('data-roster-result',JSON.stringify({controls:controls.length,copies:true,places:true,memories:true}));
        } catch(error) {
          document.body.setAttribute('data-roster-result',JSON.stringify({error:String(error.stack || error)}));
        }
      `;
      document.body.append(script);""")
    try:
        for _ in range(80):
            raw = browser.execute("return document.body.getAttribute('data-roster-result')")
            if raw:
                result = json.loads(raw)
                assert 'error' not in result, result
                print(json.dumps(result))
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Page module timed out')
    finally:
        browser.execute("document.querySelector('#castward-roster-check')?.remove(); document.body.removeAttribute('data-roster-result')")
