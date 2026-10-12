/** Existing present-NPC display checks, using only fixture state and mocked packs. */
export async function verifyExpressionScene({root,cards,context,settings,scene,runtime,readSpeechUnits,fixture,sprites,edits,uploads}) {
  const result={};
  cards[1].imageUrl='/img/ai4.png';
  context.chatMetadata.sillynpc_status_state={player:{name:'Scene Player'},characters:cards.map(c=>({name:c.name}))};
  settings.autoGenerateNpcExpressions=false;settings.showPresentNpcSprites=true;
  await scene.refreshSceneSprites({loadPack:async()=>sprites});
  let stage=document.querySelector('#sillynpc-scene-sprites');
  result.allPresentWithoutTts=stage?.querySelectorAll('.sillynpc-scene-sprite').length===2
    &&!document.querySelector('#sillynpc-speech-sprite');
  const sceneImage=stage.querySelector('[data-npc-id="'+cards[0].id+'"] img');
  result.latestSceneExpression=sceneImage.src.includes('generated=sadness')&&getComputedStyle(sceneImage).objectFit==='contain';
  runtime.showNpcSpeechExpression(readSpeechUnits(fixture)[0]);
  const {stopNpcTts}=await import(root+'src/tts/npc-tts.js');stopNpcTts();
  result.ttsLeavesSceneVisible=!!document.querySelector('#sillynpc-scene-sprites')&&!document.querySelector('#sillynpc-speech-sprite');
  scene.clearSceneSprites();await scene.refreshSceneSprites({loadPack:async()=>sprites});
  result.sceneRestoresSavedLatest=document.querySelector('#sillynpc-scene-sprites [data-npc-id="'+cards[0].id+'"] img').src.includes('generated=sadness');
  context.chatMetadata.sillynpc_status_state.characters=[{name:cards[0].name}];
  await scene.refreshSceneSprites({loadPack:async()=>sprites});
  result.offstageRemoved=document.querySelectorAll('#sillynpc-scene-sprites .sillynpc-scene-sprite').length===1
    &&!document.querySelector('#sillynpc-scene-sprites [data-npc-id="'+cards[1].id+'"]');
  context.chatMetadata.sillynpc_status_state.characters=[];
  await scene.refreshSceneSprites({loadPack:async()=>sprites});
  result.emptySceneHidden=!document.querySelector('#sillynpc-scene-sprites');
  context.chatMetadata.sillynpc_status_state.characters=[{name:cards[0].name}];
  await scene.refreshSceneSprites({loadPack:async()=>sprites});
  settings.showPresentNpcSprites=false;await scene.refreshSceneSprites();
  result.sceneToggleOff=!document.querySelector('#sillynpc-scene-sprites');
  result.sceneDisplayDoesNotGenerate=edits()===4&&uploads()===4;
  result.nativeHolderUntouched=!document.querySelector('#expression-holder [data-sillynpc-expression]');
  return result;
}
