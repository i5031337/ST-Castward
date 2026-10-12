export async function verifyExpressionRegeneration({ root, runtime, context, fixture, chatLength, sprites, rememberSprite, savePortrait }) {
    const result = {};
    const {wireExpressionEvents}=await import(root+'src/expressions/expression-events.js');
    const {dialogueRevision}=await import(root+'src/chat/dialogue-presentation.js');
    const listeners=new Map();
    const events={on:(name,callback)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(callback);},
      emit:(name,...args)=>{for(const callback of listeners.get(name)||[])callback(...args);}};
    const types=Object.fromEntries(['GENERATION_STARTED','GENERATION_STOPPED','GENERATION_ENDED','CHAT_CHANGED',
      'MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_DELETED'].map(name=>[name,name]));
    let regeneratedTask,regenerationCompletions=0,regeneratedCalls=0;
    wireExpressionEvents({events,types,renderedEvent:'fixture-rendered',render:runtime.renderNpcExpressions,
      reset:runtime.resetNpcExpressions,latestId:()=>context.chat.length-1,
      revision:id=>dialogueRevision(SillyTavern.getContext(),id),sourceToken:id=>context.chat[id],defer:requestAnimationFrame,
      complete:id=>{regenerationCompletions++;regeneratedTask=runtime.completeNpcExpressions(id,{rememberSprite,savePortrait,
        saveBinding:()=>{},loadPack:async()=>sprites,classify:async job=>{regeneratedCalls++;return job.line.text==='First.'?'neutral':'joy';}});return regeneratedTask;}});
    const outgoing=context.chat[chatLength];
    events.emit(types.GENERATION_STARTED,'regenerate');
    context.chat.pop();events.emit(types.MESSAGE_DELETED,context.chat.length);
    context.chat.push({...outgoing,extra:{}});
    events.emit(types.GENERATION_ENDED);
    for(let i=0;i<100&&!regeneratedTask;i++)await new Promise(r=>setTimeout(r,10));
    if(!regeneratedTask)throw new Error('Regeneration completion was not scheduled.');
    await regeneratedTask;
    result.regeneratedReplyClassified=regeneratedCalls===3&&regenerationCompletions===1;
    result.regeneratedPortraits=[...fixture.querySelectorAll('.sillynpc-chat-avatar')].map(a=>a.dataset.sillynpcExpression).join(',')==='neutral,joy,joy';
    events.emit(types.GENERATION_ENDED);await new Promise(r=>setTimeout(r,25));
    result.regenerationCompletedOnce=regeneratedCalls===3&&regenerationCompletions===1;
    return result;
}
