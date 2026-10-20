"""Exercise automatic cast lore through SillyTavern's real dry-run scanner; no saves or model requests."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script'); script.type = 'module'; script.id = 'castward-lore-probe';
      script.textContent = `
        const result = {}; let events, listener;
        try {
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const { createCastLoreActivator } = await import(root + 'src/lore/cast-lore.js');
          const hostRoot = new URL('../../../', root);
          const { eventSource, event_types } = await import(new URL('events.js', hostRoot));
          const { checkWorldInfo, getSortedEntries, newWorldInfoEntryTemplate } = await import(new URL('world-info.js', hostRoot));
          events = {eventSource,event_types};
          const world = 'Castward unsaved lore probe';
          const data = {entries:{
            1:{...structuredClone(newWorldInfoEntryTemplate),uid:1,key:['CastwardRosterProbe','CastwardProbeAlias'],content:'Unique carried profile knowledge.',selective:false,ignoreBudget:true,scanDepth:1},
            2:{...structuredClone(newWorldInfoEntryTemplate),uid:2,key:['CastwardBlockedProbe'],content:'Disabled lore.',disable:true,selective:false,ignoreBudget:true,scanDepth:1},
            3:{...structuredClone(newWorldInfoEntryTemplate),uid:3,key:['CastwardUnrelatedProbe'],content:'Unrelated old adventure.',constant:true,ignoreBudget:true}
          }};
          const context = {getCurrentChatId:()=> 'unsaved',chatMetadata:{sillynpc_system:'A',world_info:'Keep this selection'}};
          const settings = {enabled:true,activeSystem:'A'};
          let cards = [
            {id:'new',rosterSourceId:'old',lorebook:{world,uid:1}},
            {id:'disabled',rosterSourceId:'old2',lorebook:{world,uid:2}}
          ];
          listener = createCastLoreActivator({getContext:()=>context,getSettings:()=>settings,
            getCharacters:()=>cards,loadWorldInfo:async()=>data});
          eventSource.on(event_types.WORLDINFO_ENTRIES_LOADED,listener);
          const sorted = await getSortedEntries();
          result.scanHook = sorted.filter(e=>e.world===world).length===2;
          const activated = async text => [...(await checkWorldInfo([text],8192,true)).allActivatedEntries].filter(e=>e.world===world);
          const byName = await activated('I ask CastwardRosterProbe about their past.');
          result.nameTrigger = byName.length===1 && byName[0].content.includes('Unique carried profile knowledge');
          result.aliasTrigger = (await activated('I speak with CastwardProbeAlias.')).some(e=>e.uid===1);
          result.noMention = (await activated('A quiet day.')).length===0;
          result.disabled = !(await activated('CastwardBlockedProbe arrives.')).some(e=>e.uid===2);
          result.unrelatedExcluded = !(await activated('CastwardUnrelatedProbe arrives.')).some(e=>e.uid===3);
          cards = []; result.castScope = (await activated('CastwardRosterProbe arrives.')).length===0;
          cards = [{id:'generated',lorebook:{world,uid:1}}];
          result.generatedProfile = (await activated('CastwardRosterProbe arrives.')).some(e=>e.uid===1);
          result.existingSelection = context.chatMetadata.world_info==='Keep this selection';
          result.sourceUnchanged = data.entries[1].key.length===2 && data.entries[1].world===undefined;
        } catch(error) {result.error=String(error);result.stack=error.stack;}
        finally {if(listener) events.eventSource.removeListener(events.event_types.WORLDINFO_ENTRIES_LOADED,listener);}
        document.body.setAttribute('data-cast-lore-result',JSON.stringify(result));
      `; document.body.append(script);""")
    try:
        for _ in range(160):
            raw = browser.execute("return document.body.getAttribute('data-cast-lore-result')")
            if raw:
                result = json.loads(raw)
                print(json.dumps(result, indent=2))
                assert result and all(value is True for value in result.values()), result
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Lore probe timed out')
    finally:
        browser.execute("document.querySelector('#castward-lore-probe')?.remove(); document.body.removeAttribute('data-cast-lore-result')")
