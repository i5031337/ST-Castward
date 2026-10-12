/** Existing editor fixture, kept separate from the host-context test harness. */
export async function verifyExpressionEditor({ root, cards, packRequests, expressionPromptVariants }) {
  const {buildExpressionsSection}=await import(root+'src/ui/characters/ui-expressions.js');
  const result={};
  let writes=0;
  const editor=buildExpressionsSection(cards[0],{save:()=>writes++}); document.body.append(editor);
  try {
    for(let i=0;i<50&&!editor.textContent.includes('sprites available');i++) await new Promise(r=>setTimeout(r,10));
    result.preview=editor.textContent.includes('2 sprites available')&&!editor.querySelector('img').hidden&&packRequests()===1;
    const editorPreview=editor.querySelector('img');
    editorPreview.dispatchEvent(new Event('error'));
    result.editorPortraitFallback=!editorPreview.hidden&&editorPreview.src.endsWith('/img/ai4.png');
    editorPreview.dispatchEvent(new Event('error'));
    result.editorMissingPortrait=editorPreview.hidden&&editor.textContent.includes('Preview image unavailable.');
    const folder=editor.querySelector('[data-expression-field="folder"]');
    folder.value='Pack/too/deep';folder.dispatchEvent(new Event('change'));
    result.invalidFolder=cards[0].presentation.expressions.spriteFolder==='ExpressionPack/A'&&writes===0;
    result.noNpcAutomaticToggles=!editor.querySelector('input[type="checkbox"]');
    result.conciseEditor=[...editor.querySelectorAll('details')].every(d=>!d.open);
    const generationEditor=editor.querySelector('.sillynpc-expression-generation');
    const availability=generationEditor.querySelector('.sillynpc-expression-availability');
    result.existingExpressionIndicator=availability.dataset.missing==='false'&&availability.textContent.includes('neutral');
    const selection=generationEditor.querySelector('select');
    selection.value='fear';selection.dispatchEvent(new Event('change'));
    result.missingExpressionIndicator=availability.dataset.missing==='true'&&availability.textContent.includes('fear')&&!editor.querySelector('img').hidden;
    selection.value='joy';selection.dispatchEvent(new Event('change'));
    result.selectionUpdatesIndicator=availability.dataset.missing==='false'&&availability.textContent.includes('joy');
    const config=cards[0].presentation.expressions;
    config.generation.reference='';folder.value='';folder.dispatchEvent(new Event('change'));
    const emotion=generationEditor.querySelector('select');
    result.emotionVocabulary=emotion.options.length===28;
    emotion.value='joy'; emotion.dispatchEvent(new Event('change'));
    const prompt=generationEditor.querySelector('[data-expression-field="prompt"]');
    prompt.value='Saved fixture smile.'; prompt.dispatchEvent(new Event('change'));
    result.savedEmotionPrompt=config.generation.prompts.joy[0]==='Saved fixture smile.';
    result.threeEmotionPrompts=generationEditor.querySelectorAll('[data-expression-field^="prompt"]').length===3
      &&new Set(expressionPromptVariants(config.generation,'joy')).size===3;
    const secondPrompt=generationEditor.querySelector('[data-expression-field="prompt2"]');
    secondPrompt.value='Saved second pose.';secondPrompt.dispatchEvent(new Event('change'));
    result.savedSecondVariant=config.generation.prompts.joy[1]==='Saved second pose.';
    const thirdPrompt=generationEditor.querySelector('[data-expression-field="prompt3"]');
    thirdPrompt.value='';thirdPrompt.dispatchEvent(new Event('change'));
    result.blankVariantResets=thirdPrompt.value===expressionPromptVariants(config.generation,'joy')[2]&&!!thirdPrompt.value;
    result.noSharedExpressionInstructions=!generationEditor.querySelector('[data-expression-field="basePrompt"]');
    return {result,editor,folder,generationEditor,availability,config};
  } catch(error) { editor.remove(); throw error; }
}
