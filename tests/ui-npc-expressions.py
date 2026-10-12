"""Unsaved stage 2 host fixtures with mocked sprites and classification."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""
      const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
      const script = document.createElement('script'); script.type='module'; script.id='npc-expressions-fixture';
      script.textContent = `
        const result={}; let settings, savedSettings, context, metadata, chatLength, fixture, editor, originalFetch, expressionsSettings, imageSettings, originalWarning, hostScript, originalCharacterId;
        let runtime,scene;
        try {
          const root=${JSON.stringify(new URL('.', entry.src).href)};
          const {getSettings}=await import(root+'src/core/settings.js');
          const {classifierHint}=await import(root+'src/expressions/host-expressions.js');
          const {expressionPromptVariants}=await import(root+'src/expressions/expression-prompts.js');
          const {injectAtDialogueLines}=await import(root+'src/chat/chat-speech.js');
          runtime=await import(root+'src/expressions/npc-expressions.js');
          scene=await import(root+'src/expressions/scene-sprites.js');
          const rememberSprite=(...args)=>scene.rememberNpcSprite(...args,{save:()=>{}});
          const portraits=await import(root+'src/expressions/dialogue-portraits.js');
          const savePortrait=(...args)=>portraits.rememberDialoguePortrait(...args,{save:()=>{}});
          settings=getSettings(); context=SillyTavern.getContext();
          hostScript=await import('/script.js');originalCharacterId=context.characterId;
          if(context.getCurrentChatId()===undefined){
            const id=context.characters.findIndex(c=>c.chat);
            if(id<0)throw new Error('Scene fixture needs a host character with a chat.');
            hostScript.setCharacterId(id);
          }
          savedSettings={characters:settings.characters,enabled:settings.enabled,autoGenerateNpcExpressions:settings.autoGenerateNpcExpressions,npcExpressionWorkflow:settings.npcExpressionWorkflow,npcExpressionIpAdapterMode:settings.npcExpressionIpAdapterMode,showPresentNpcSprites:settings.showPresentNpcSprites};
          metadata={...context.chatMetadata}; chatLength=context.chat.length;
          expressionsSettings=context.extensionSettings.expressions;
          context.extensionSettings.expressions={...expressionsSettings,api:0};
          const cards=['A','B'].map(name=>({id:'expression-fixture-'+name,name:'Expression '+name,aliases:[],imageUrl:'/img/ai4.png',
            presentation:{expressions:{enabled:true,spriteFolder:'ExpressionPack/'+name,fallback:'neutral'}}}));
          settings.characters=cards; settings.enabled=true;settings.autoGenerateNpcExpressions=true;settings.showPresentNpcSprites=false;settings.npcExpressionIpAdapterMode=false;
          context.chatMetadata.sillynpc_npcs=[];
          context.chatMetadata.sillynpc_expression_sprites={};
          context.chatMetadata.sillynpc_cast={categories:null,include:[],exclude:[]};
          context.chat.push({mes:['Expression A: "First."','Expression B: "Second."','Expression A: "Last."'].join(String.fromCharCode(10)),swipe_id:0});
          fixture=document.createElement('div'); fixture.className='mes'; fixture.setAttribute('mesid',chatLength);
          fixture.innerHTML='<div class="mes_text"><p>Expression A: "First."</p><p>Expression B: "Second."</p><p>Expression A: "Last."</p></div>';
          document.querySelector('#chat').append(fixture);
          injectAtDialogueLines(fixture.querySelector('.mes_text'),cards,()=>'/img/ai4.png',false);
          const sprites=[{label:'joy',path:'/characters/../img/ai4.png?expression=joy'},
            {label:'neutral',path:'/characters/../img/ai4.png?expression=neutral'}];
          originalFetch=window.fetch;
          let packRequests=0;
          window.fetch=(url,...args)=>String(url).startsWith('/api/sprites/get?')
            ? (packRequests++,Promise.resolve(new Response(JSON.stringify(sprites),{headers:{'Content-Type':'application/json'}})))
            : originalFetch(url,...args);
          let calls=[], completionPackRequests=0;
          const adapters={rememberSprite,savePortrait,saveBinding:()=>{},loadPack:async()=>{completionPackRequests++;return sprites;},classify:async job=>{calls.push([job.line.npcId,job.line.text]);return job.line.text==='First.'?'neutral':'joy';}};
          const {verifyExpressionStreaming}=await import(root+'tests/fixtures/ui-expression-streaming.js');
          Object.assign(result,await verifyExpressionStreaming({root,runtime,context,fixture,chatLength,sprites}));
          await runtime.completeNpcExpressions(chatLength,adapters);
          result.eachLine=JSON.stringify(calls)===JSON.stringify([[cards[0].id,'First.'],[cards[1].id,'Second.'],[cards[0].id,'Last.']]);
          result.sharedCompletionPacks=completionPackRequests===2;
          result.portraits=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.dataset.sillynpcExpression).join(',')==='neutral,joy,joy';
          const preservedPortraits=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.src).join('|');
          runtime.resetNpcExpressions({clear:false});
          result.generationPreservesHistory=preservedPortraits===[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.src).join('|');
          runtime.renderNpcExpressions(fixture); await runtime.completeNpcExpressions(chatLength,adapters);
          result.cached=calls.length===3;
          context.chat[chatLength]=JSON.parse(JSON.stringify(context.chat[chatLength]));
          runtime.resetNpcExpressions();runtime.renderNpcExpressions(fixture);
          result.refreshRestoresLinePortraits=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.dataset.sillynpcExpression).join(',')==='neutral,joy,joy';
          result.restoreWithoutRequests=calls.length===3&&packRequests===0;
          settings.autoGenerateNpcExpressions=false;runtime.renderNpcExpressions(fixture);
          result.savedPortraitsWithoutAutomation=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.dataset.sillynpcExpression).join(',')==='neutral,joy,joy';
          settings.autoGenerateNpcExpressions=true;
          const {verifyExpressionRegeneration}=await import(root+'tests/fixtures/ui-expression-regeneration.js');
          Object.assign(result,await verifyExpressionRegeneration({root,runtime,context,fixture,chatLength,sprites,rememberSprite,savePortrait}));
          const {readSpeechUnits}=await import(root+'src/tts/speech-units.js');
          const {verifyExpressionSpeech}=await import(root+'tests/fixtures/ui-expression-speech.js');
          Object.assign(result,await verifyExpressionSpeech({root,runtime,fixture,cards,readSpeechUnits,chatLength}));
          result.baseUnchanged=cards.every(c=>c.imageUrl==='/img/ai4.png');
          const avatar=fixture.querySelectorAll('.sillynpc-chat-avatar')[1];
          avatar.dispatchEvent(new Event('error'));
          result.missingImageFallback=avatar.dataset.sillynpcExpression==='neutral';
          avatar.dispatchEvent(new Event('error'));
          result.missingFallbackPortrait=!avatar.dataset.sillynpcExpression&&avatar.src.endsWith('/img/ai4.png');
          runtime.renderNpcExpressions(fixture);
          context.chat[chatLength].swipe_id=1;
          runtime.renderNpcExpressions(fixture);
          result.swipeIsolation=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].every(a=>!a.dataset.sillynpcExpression);
          runtime.resetNpcExpressions();
          let release;
          const pending=runtime.completeNpcExpressions(chatLength,{rememberSprite,savePortrait,saveBinding:()=>{},loadPack:async()=>sprites,
            classify:()=>new Promise(resolve=>{release=resolve;})});
          for(let i=0;i<50&&!release;i++) await new Promise(r=>setTimeout(r,10));
          context.chat[chatLength].mes='Edited fixture';
          release('joy'); await pending;
          runtime.renderNpcExpressions(fixture);
          result.staleRejected=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].every(a=>!a.dataset.sillynpcExpression);
          result.unsupportedHint=classifierHint({api:2,promptType:'full'}).includes('conversation context')
            && classifierHint({api:2,promptType:'raw'}).includes('lock');
          const {verifyExpressionEditor}=await import(root+'tests/fixtures/ui-expression-editor.js');
          const editorFixture=await verifyExpressionEditor({root,cards,packRequests:()=>packRequests,expressionPromptVariants});
          editor=editorFixture.editor;
          const {folder,generationEditor,availability,config}=editorFixture;
          Object.assign(result,editorFixture.result);
          const {expressionJob}=await import(root+'src/expressions/host-expression-generation.js');
          const {buildCharacterImagePrompt}=await import(root+'src/api/api-image-generate.js');
          const plainJob=await expressionJob(cards[0],'joy',()=>true);
          result.expressionOnlyPrompt=plainJob.prompt===''&&JSON.stringify(plainJob.promptVariants)===JSON.stringify(expressionPromptVariants(config.generation,'joy'));
          settings.npcExpressionIpAdapterMode=true;
          const adapterJob=await expressionJob(cards[0],'joy',()=>true);
          result.ipAdapterPortraitPrompt=adapterJob.prompt===await buildCharacterImagePrompt(cards[0])
            &&JSON.stringify(adapterJob.promptVariants)===JSON.stringify(plainJob.promptVariants);
          settings.npcExpressionIpAdapterMode=false;
          settings.autoGenerateNpcExpressions=false;
          imageSettings=context.extensionSettings.sd;
          context.extensionSettings.sd={...imageSettings,comfy_url:'http://fixture.invalid',comfy_workflow:'PortraitOnly.json'};
          settings.npcExpressionWorkflow='FixtureEdit.json';
          let stored=[], edits=0, uploads=0, sentPrompt='', uploadedFolder='', pauseEdit=false, releaseEdit, requestedWorkflow;
          const mockJson=value=>Promise.resolve(new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
          const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1X8AAAAASUVORK5CYII=';
          window.fetch=(url,options={})=>{
            const path=new URL(String(url),location.origin).pathname;
            if(path==='/api/sprites/get') return mockJson(stored);
            if(path==='/api/sd/comfy/workflows') return mockJson(['FixtureEdit.json']);
            if(path==='/api/sd/comfy/workflow') {
              requestedWorkflow=JSON.parse(options.body).file_name;
              return mockJson(JSON.stringify({'1':{class_type:'Fixture',inputs:{image:'%reference_image%',text:'%prompt%'}}}));
            }
            if(path==='/api/sd/comfy/generate'){
              edits++;sentPrompt=JSON.parse(JSON.parse(options.body).prompt).prompt['1'].inputs.text;
              if(pauseEdit) return new Promise(resolve=>{releaseEdit=()=>resolve(new Response(JSON.stringify({format:'png',data:png}),{headers:{'Content-Type':'application/json'}}));});
              return mockJson({format:'png',data:png});
            }
            if(path==='/api/images/upload') return mockJson({path:'/user/images/image-edit/fixture.png'});
            if(path==='/api/images/delete') return mockJson({ok:true});
            if(path==='/user/images/image-edit/fixture.png'||path==='/img/ai4.png') return originalFetch('data:image/png;base64,'+png);
            if(path==='/api/sprites/upload'){
              uploads++;uploadedFolder=options.body.get('name');
              const label=options.body.get('label');
              stored=[{label,path:'/characters/../img/ai4.png?generated='+label}];
              return mockJson({ok:true});
            }
            return originalFetch(url,options);
          };
          const generate=generationEditor.querySelector('[data-expression-action=generate]');
          result.singleGenerateButton=generate.textContent==='Generate'&&!generationEditor.querySelector('[data-expression-action=regenerate]');
          result.clearedPackIndicator=availability.dataset.missing==='true';
          generate.click();
          for(let i=0;i<100&&generate.disabled;i++) await new Promise(r=>setTimeout(r,25));
          result.generatedFromReference=edits===1&&uploads===1&&uploadedFolder===config.spriteFolder
            &&expressionPromptVariants(config.generation,'joy').includes(sentPrompt)
            &&editor.querySelector('select').value==='joy';
          result.sharedEditingWorkflow=requestedWorkflow==='FixtureEdit.json'&&context.extensionSettings.sd.comfy_workflow==='PortraitOnly.json';
          result.generatedExpressionIndicator=availability.dataset.missing==='false'&&availability.textContent.includes('joy');
          generate.click();
          for(let i=0;i<100&&generate.disabled;i++) await new Promise(r=>setTimeout(r,25));
          result.generateReplacesExistingSprite=edits===2&&uploads===2;
          result.manualWorksWithAutomaticOff=edits===2&&uploads===2&&!settings.autoGenerateNpcExpressions;
          config.generation.reference='';config.spriteFolder='';
          let disabledCalls=0;
          runtime.resetNpcExpressions();
          await runtime.completeNpcExpressions(chatLength,{loadPack:async()=>{disabledCalls++;return [];},classify:async()=>{disabledCalls++;return 'joy';}});
          result.globalOffSkipsClassification=disabledCalls===0&&config.generation.reference==='';
          settings.autoGenerateNpcExpressions=true;
          context.chatMetadata.sillynpc_expression_sprites={};
          cards[1].imageUrl='';
          config.generation.reference='';config.spriteFolder='';
          stored=[]; pauseEdit=true; runtime.resetNpcExpressions();
          let classificationLabels,bindingSaves=0;
          await runtime.completeNpcExpressions(chatLength,{rememberSprite,savePortrait,loadPack:async()=>[],saveBinding:()=>bindingSaves++,classify:async job=>{
            classificationLabels=job.labels;return 'joy';
          }});
          result.globalOnPreparesReference=bindingSaves===1&&config.generation.reference===cards[0].imageUrl
            &&config.spriteFolder.startsWith('SillyNPC/');
          for(let i=0;i<100&&!releaseEdit;i++) await new Promise(r=>setTimeout(r,25));
          result.editDoesNotBlockClassification=!!releaseEdit&&uploads===2;
          runtime.showNpcSpeechExpression(readSpeechUnits(fixture)[0]);
          const speechPortrait=document.querySelector('#sillynpc-speech-sprite img').src;
          releaseEdit();
          for(let i=0;i<100&&fixture.querySelector('.sillynpc-chat-avatar').dataset.sillynpcExpression!=='joy';i++) await new Promise(r=>setTimeout(r,25));
          result.emptyPackGeneration=classificationLabels?.length===28&&edits===3&&uploads===3;
          result.generatedApplied=fixture.querySelector('.sillynpc-chat-avatar').dataset.sillynpcExpression==='joy';
          result.lateEditKeepsSpeechPortrait=document.querySelector('#sillynpc-speech-sprite img').src===speechPortrait;
          runtime.resetNpcExpressions();runtime.renderNpcExpressions(fixture);
          result.generatedPortraitSurvivesRefresh=fixture.querySelector('.sillynpc-chat-avatar').src.includes('generated=joy');
          const warnings=[]; originalWarning=toastr.warning; toastr.warning=(...args)=>warnings.push(args);
          settings.npcExpressionWorkflow='';pauseEdit=false;runtime.resetNpcExpressions();
          const failedAdapters={rememberSprite,savePortrait,loadPack:async()=>[],saveBinding:()=>{},classify:async()=> 'sadness'};
          await runtime.completeNpcExpressions(chatLength,failedAdapters);
          for(let i=0;i<100&&!warnings.length;i++) await new Promise(r=>setTimeout(r,25));
          result.visibleWorkflowFailure=warnings.length===1&&warnings[0][0].includes('Expression Editing Workflow')&&edits===3;
          runtime.resetNpcExpressions();await runtime.completeNpcExpressions(chatLength,failedAdapters);
          await new Promise(r=>setTimeout(r,50));
          result.noRepeatedFailureWarnings=warnings.length===1&&edits===3;
          settings.npcExpressionWorkflow='FixtureEdit.json';
          await runtime.completeNpcExpressions(chatLength,failedAdapters);
          for(let i=0;i<100&&uploads<4;i++) await new Promise(r=>setTimeout(r,25));
          result.workflowCorrectionRecovers=edits===4&&uploads===4;
          for(let i=0;i<100&&context.chatMetadata.sillynpc_expression_sprites?.[cards[0].id]?.label!=='sadness';i++) await new Promise(r=>setTimeout(r,25));
          const {verifyExpressionScene}=await import(root+'tests/fixtures/ui-expression-scene.js');
          Object.assign(result,await verifyExpressionScene({root,cards,context,settings,scene,runtime,readSpeechUnits,fixture,sprites,edits:()=>edits,uploads:()=>uploads}));
          settings.npcExpressionIpAdapterMode=true;
          const portraitPrompt=await buildCharacterImagePrompt(cards[0]);
          generate.click();
          for(let i=0;i<100&&(uploads<5||generate.disabled);i++) await new Promise(r=>setTimeout(r,25));
          result.ipAdapterGeneration=uploads===5&&expressionPromptVariants(cards[0].presentation.expressions.generation,'joy')
            .some(variant=>sentPrompt===portraitPrompt+String.fromCharCode(10)+variant);
          pauseEdit=true;releaseEdit=undefined;generate.click();
          for(let i=0;i<100&&!releaseEdit;i++) await new Promise(r=>setTimeout(r,25));
          if(!releaseEdit)throw new Error('IP-Adapter cancellation fixture did not start.');
          settings.npcExpressionIpAdapterMode=false;releaseEdit();
          for(let i=0;i<100&&generate.disabled;i++) await new Promise(r=>setTimeout(r,25));
          result.modeChangeCancelsPendingEdit=uploads===5&&generationEditor.querySelector('[role="status"]').textContent==='Cancelled.';
        } catch(error) {result.error=String(error.stack||error);}
        finally {
          runtime?.resetNpcExpressions();scene?.clearSceneSprites(); fixture?.remove(); editor?.remove();
          if(originalFetch) window.fetch=originalFetch;
          if(originalWarning) toastr.warning=originalWarning;
          if(settings&&savedSettings) Object.assign(settings,savedSettings);
          if(context&&metadata){for(const key of Object.keys(context.chatMetadata)) delete context.chatMetadata[key];Object.assign(context.chatMetadata,metadata);}
          if(context&&chatLength!==undefined) context.chat.splice(chatLength);
          if(context) context.extensionSettings.expressions=expressionsSettings;
          if(context&&imageSettings) context.extensionSettings.sd=imageSettings;
          hostScript?.setCharacterId(originalCharacterId);
        }
        document.documentElement.setAttribute('data-npc-expressions-fixture',JSON.stringify(result));
      `; document.head.append(script);
    """)
    result = None
    try:
        for _ in range(100):
            raw = browser.execute("return document.documentElement.getAttribute('data-npc-expressions-fixture')")
            if raw:
                result = json.loads(raw)
                break
            time.sleep(.25)
        assert result and not result.get('error') and all(value is True for value in result.values()), result
        print('NPC expressions UI passed:', json.dumps(result))
    finally:
        browser.execute("document.querySelector('#npc-expressions-fixture')?.remove();document.documentElement.removeAttribute('data-npc-expressions-fixture');")
