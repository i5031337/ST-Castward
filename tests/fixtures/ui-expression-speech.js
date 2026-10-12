export async function verifyExpressionSpeech({ root, runtime, fixture, cards, readSpeechUnits, chatLength }) {
    const result = {};
    const {createSpeechQueue}=await import(root+'src/tts/speech-queue.js');
    const {playSpeechAudio}=await import(root+'src/tts/openai-speech.js');
    const units=readSpeechUnits(fixture).map(u=>({...u,voice:'test'}));
    result.lineIdentity=units.map(u=>u.dialogueLineIndex).join(',')==='0,1,2';
    const OriginalAudio=window.Audio; const players=[];
    try {
      window.Audio=class extends EventTarget {
        constructor(){super();players.push(this);} play(){return Promise.resolve();}
        pause(){} removeAttribute(){} load(){}
      };
      const queue=createSpeechQueue({valid:()=>true,synthesize:async()=>new Blob(['mock']),
        playAudio:playSpeechAudio,onState:(state,job,unit)=>{if(state==='playing')runtime.showNpcSpeechExpression(unit);}});
      const playing=queue.play(chatLength,units[0].revision,units);
      for(let i=0;i<50&&players.length<1;i++) await new Promise(r=>setTimeout(r,10));
      result.noSynthesisAdvance=!document.querySelector('#sillynpc-speech-sprite');
      players[0].dispatchEvent(new Event('playing'));
      result.firstSprite=document.querySelector('#sillynpc-speech-sprite img').src.includes('expression=neutral');
      const portraitsBefore=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.src).join('|');
      players[0].dispatchEvent(new Event('ended'));
      for(let i=0;i<50&&players.length<2;i++) await new Promise(r=>setTimeout(r,10));
      result.waitingRetainsSprite=document.querySelector('#sillynpc-speech-sprite').dataset.npcId===cards[0].id;
      players[1].dispatchEvent(new Event('playing'));
      result.secondSprite=document.querySelector('#sillynpc-speech-sprite').dataset.npcId===cards[1].id;
      players[1].dispatchEvent(new Event('ended'));
      for(let i=0;i<50&&players.length<3;i++) await new Promise(r=>setTimeout(r,10));
      players[2].dispatchEvent(new Event('playing'));
      const holder=document.querySelector('#sillynpc-speech-sprite');
      result.lastSprite=holder.dataset.npcId===cards[0].id&&holder.querySelector('img').src.includes('expression=joy');
      result.fullBody=getComputedStyle(holder.querySelector('img')).objectFit==='contain'&&holder.getBoundingClientRect().height>200;
      result.staticPortraits=portraitsBefore===[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.src).join('|');
      players[2].dispatchEvent(new Event('ended')); await playing;
      result.retainedAfterSpeech=!!document.querySelector('#sillynpc-speech-sprite');
      const {stopNpcTts}=await import(root+'src/tts/npc-tts.js'); stopNpcTts();
      result.stopClears=!document.querySelector('#sillynpc-speech-sprite');
    } finally {window.Audio=OriginalAudio;}
    return result;
}
