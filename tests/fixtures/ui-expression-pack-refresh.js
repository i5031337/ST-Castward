/** Unsaved regressions for publishing manual and delayed automatic image edits. */
export async function verifyExpressionPackRefresh(root) {
    const runtime = await import(root + 'src/expressions/npc-expressions.js');
    const scene = await import(root + 'src/expressions/scene-sprites.js');
    const portraits = await import(root + 'src/expressions/dialogue-portraits.js');
    const { getSettings } = await import(root + 'src/core/settings.js');
    const { expressionGenerator } = await import(root + 'src/expressions/host-expression-generation.js');
    const { buildExpressionsSection } = await import(root + 'src/ui/characters/ui-expressions.js');
    const { injectAtDialogueLines } = await import(root + 'src/chat/chat-speech.js');
    const { normalizeCharacterPresentation } = await import(root + 'src/core/npc-presentation.js');
    const host = await import('/script.js');
    const context = SillyTavern.getContext(), settings = getSettings();
    const savedSettings = { ...settings }, metadata = { ...context.chatMetadata }, length = context.chat.length;
    const characterId = context.characterId, generate = expressionGenerator.generate, originalFetch = window.fetch;
    const expressions = context.extensionSettings.expressions;
    // These mock pack URLs need no image files; preserve the DOM while checking assignments.
    const ignoreMockImageError = event => {
        if (event.target instanceof HTMLImageElement
            && event.target.getAttribute('src')?.startsWith('/characters/Fixture/Refresh/')) event.stopImmediatePropagation();
    };
    document.addEventListener('error', ignoreMockImageError, true);
    const result = {};
    let fixture, editor, nextFixture, releaseClassification;
    const wait = async (predicate, step = 'unknown') => {
        for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
        throw new Error('Expression refresh fixture timed out: ' + step);
    };
    try {
        if (context.getCurrentChatId() === undefined) host.setCharacterId(context.characters.findIndex(card => card.chat));
        const card = { id: 'pack-refresh-fixture', name: 'Pack Refresh', aliases: [], imageUrl: '/img/ai4.png',
            presentation: { expressions: { spriteFolder: 'Fixture/Refresh', fallback: 'neutral' } } };
        normalizeCharacterPresentation(card);
        card.presentation.expressions.generation.reference = card.imageUrl;
        Object.assign(settings, { enabled: true, characters: [card], autoGenerateNpcExpressions: true,
            npcExpressionsPerMessage: true, npcExpressionsRefreshOnImagePrompt: true,
            npcExpressionIpAdapterMode: false, showPresentNpcSprites: true, statusTracker: { enabled: false } });
        context.extensionSettings.expressions = { api: 0 };
        Object.assign(context.chatMetadata, { sillynpc_npcs: [], sillynpc_cast: { categories: null, include: [], exclude: [] },
            sillynpc_expression_sprites: {}, sillynpc_status_state: { characters: [{ id: card.id, name: card.name }] } });
        context.chat.push({ mes: 'Pack Refresh: "First."\nPack Refresh: "Last."', swipe_id: 0 });
        fixture = document.createElement('div'); fixture.className = 'mes'; fixture.setAttribute('mesid', length);
        fixture.innerHTML = '<div class="mes_text"><p>Pack Refresh: "First."</p><p>Pack Refresh: "Last."</p></div>';
        document.querySelector('#chat').append(fixture);
        injectAtDialogueLines(fixture.querySelector('.mes_text'), [card], () => card.imageUrl, false);
        const pack = version => ['neutral', 'joy', 'sadness'].map(label => ({ label,
            path: `/characters/Fixture/Refresh/${label}.${version === 'old' ? 'jpg' : 'png'}?emotion=${label}&t=${version}` }));
        let sprites = pack('old'), release, generationRequests = 0;
        window.fetch = (url, ...args) => String(url).startsWith('/api/sprites/get?')
            ? Promise.resolve(new Response(JSON.stringify(sprites), { headers: { 'Content-Type': 'application/json' } }))
            : originalFetch(url, ...args);
        expressionGenerator.generate = async () => { generationRequests++; return new Promise(resolve => { release = resolve; }); };
        const save = () => {};
        const rememberSprite = (...args) => scene.rememberNpcSprite(...args, { save });
        const savePortrait = (...args) => portraits.rememberDialoguePortrait(...args, { save });
        card.presentation.expressions.generation.imageSources = { joy: 'old prompt' };
        runtime.resetNpcExpressions();
        await runtime.completeNpcExpressions(length, { saveBinding: save, loadPack: async () => sprites,
            classify: async () => 'joy', rememberSprite, savePortrait });
        await wait(() => release, 'automatic generation start');
        const record = () => context.chatMetadata.sillynpc_expression_sprites[card.id];
        result.groupUsesLastLine = record().lineIndex === 1;
        sprites = pack('automatic'); release(sprites);
        await wait(() => record().path.includes('automatic'), 'automatic scene record');
        await scene.refreshSceneSprites();
        const avatars = () => [...fixture.querySelectorAll('.sillynpc-chat-avatar')];
        const scenePath = () => document.querySelector('#sillynpc-scene-sprites img')?.getAttribute('src');
        result.automaticRefreshesBoth = avatars().every(avatar => avatar.src.includes('automatic')) && scenePath().includes('automatic');
        result.oneGenerationForGroupedNpc = generationRequests === 1;

        // Use the actual manual editor with automation off and a populated classifier cache.
        settings.autoGenerateNpcExpressions = false;
        expressionGenerator.generate = async () => (sprites = pack('manual'));
        editor = buildExpressionsSection(card, { save, savePortrait }); document.body.append(editor);
        await wait(() => editor.textContent.includes('3 sprites available'), 'editor pack');
        const emotion = editor.querySelector('[data-expression-field="emotion"]');
        emotion.value = 'joy'; emotion.dispatchEvent(new Event('change'));
        const button = editor.querySelector('[data-expression-action="generate"]'); button.click();
        await wait(() => !button.disabled, 'manual generation');
        await scene.refreshSceneSprites();
        result.manualRefreshesBoth = avatars().every(avatar => avatar.src.includes('manual')) && scenePath().includes('manual');

        // Reload discards runtime jobs; saved line portraits still receive replacement URLs.
        runtime.resetNpcExpressions();
        expressionGenerator.generate = async () => (sprites = pack('reload'));
        button.click(); await wait(() => !button.disabled, 'manual reload generation'); await scene.refreshSceneSprites();
        result.manualRefreshesSavedPortraits = avatars().every(avatar => avatar.src.includes('reload')) && scenePath().includes('reload');

        // Refreshing a pack must keep a newer/manual emotion while refreshing its URL.
        rememberSprite(card, sprites, 'sadness', null);
        sprites = pack('late'); runtime.refreshNpcExpressionPack(card, sprites, { save, savePortrait });
        await scene.refreshSceneSprites();
        result.packRefreshPreservesSelection = record().label === 'sadness' && scenePath().includes('emotion=sadness&t=late');
        result.otherEmotionsStayAssigned = avatars().every(avatar => avatar.dataset.sillynpcExpression === 'joy');

        // A newly made emotion must replace the neutral fallback in saved history too.
        const { readDialogueRecords } = await import(root + 'src/chat/dialogue-presentation.js');
        const lines = readDialogueRecords(fixture);
        for (const line of lines) savePortrait({ line, sprites, label: 'fear', fallback: 'neutral' }, 'fear');
        emotion.value = 'fear'; emotion.dispatchEvent(new Event('change'));
        expressionGenerator.generate = async () => (sprites = [...pack('new-emotion'),
            { label: 'fear', path: '/characters/Fixture/Refresh/fear.png?emotion=fear&t=new-emotion' }]);
        button.click(); await wait(() => !button.disabled, 'missing manual emotion'); await scene.refreshSceneSprites();
        result.manualReplacesMissingFallback = avatars().every(avatar => avatar.src.includes('emotion=fear'))
            && scenePath().includes('emotion=fear');

        settings.autoGenerateNpcExpressions = true;
        context.chat.push({ mes: context.chat[length].mes, swipe_id: 0 });
        nextFixture = document.createElement('div'); nextFixture.className = 'mes'; nextFixture.setAttribute('mesid', length + 1);
        nextFixture.innerHTML = '<div class="mes_text"><p>Pack Refresh: "First."</p><p>Pack Refresh: "Last."</p></div>';
        document.querySelector('#chat').append(nextFixture);
        injectAtDialogueLines(nextFixture.querySelector('.mes_text'), [card], () => card.imageUrl, false);
        const nextAvatars = () => [...nextFixture.querySelectorAll('.sillynpc-chat-avatar')];
        runtime.renderNpcExpressions(nextFixture);
        result.previousExpressionBeforeClassification = nextAvatars().every(avatar => avatar.dataset.sillynpcExpression === 'fear');
        // Saved history supplies the same placeholder even without a scene selection or runtime cache.
        runtime.resetNpcExpressions(); delete context.chatMetadata.sillynpc_expression_sprites[card.id];
        runtime.renderNpcExpressions(nextFixture);
        result.previousExpressionFromSavedHistory = nextAvatars().every(avatar => avatar.dataset.sillynpcExpression === 'fear');
        const pending = runtime.completeNpcExpressions(length + 1, { saveBinding: save, loadPack: async () => sprites,
            classify: () => new Promise(resolve => { releaseClassification = resolve; }), rememberSprite, savePortrait });
        await wait(() => releaseClassification, 'pending classification');
        result.previousExpressionWhilePending = nextAvatars().every(avatar => avatar.dataset.sillynpcExpression === 'fear');
        result.placeholderDoesNotSave = !context.chat[length + 1].extra && !record();
        releaseClassification('sadness'); await pending;
        result.classificationReplacesPlaceholder = nextAvatars().every(avatar => avatar.dataset.sillynpcExpression === 'sadness');

        // History can have no DOM or classifier cache after a reload. Replace its filename too.
        const { writeLinePortrait, readLinePortrait } = await import(root + 'src/expressions/dialogue-portrait-state.js');
        const hiddenMessageId = context.chat.length, hiddenLine = { npcId: card.id, lineIndex: 0 };
        context.chat.push({ mes: 'Pack Refresh: "Older history."', swipe_id: 0 });
        writeLinePortrait(context.chat[hiddenMessageId], hiddenLine, { label: 'fear', fallback: 'neutral',
            path: '/characters/Fixture/Refresh/neutral.jpg?t=old' });
        runtime.resetNpcExpressions();
        sprites = [...pack('history'), { label: 'fear', path: '/characters/Fixture/Refresh/fear.webp?t=history' }];
        runtime.refreshNpcExpressionPack(card, sprites, { save, savePortrait });
        result.unloadedHistoryReplacesRenamedFallback = readLinePortrait(context.chat[hiddenMessageId], hiddenLine)?.path
            === '/characters/Fixture/Refresh/fear.webp?t=history';
        return result;
    } finally {
        releaseClassification?.('sadness');
        expressionGenerator.generate = generate; window.fetch = originalFetch;
        document.removeEventListener('error', ignoreMockImageError, true);
        runtime.resetNpcExpressions(); scene.clearSceneSprites(); fixture?.remove(); editor?.remove(); nextFixture?.remove();
        Object.assign(settings, savedSettings);
        for (const key of Object.keys(context.chatMetadata)) delete context.chatMetadata[key];
        Object.assign(context.chatMetadata, metadata); context.chat.splice(length);
        context.extensionSettings.expressions = expressions; host.setCharacterId(characterId);
    }
}
