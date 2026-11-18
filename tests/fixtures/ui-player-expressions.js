export async function verifyPlayerExpressions(root) {
    const { getSettings } = await import(root + 'src/core/settings.js');
    const { getPlayerCard, getCurrentPersonaKey } = await import(root + 'src/tracker/status-logic.js');
    const { normalizeCharacterPresentation } = await import(root + 'src/core/npc-presentation.js');
    const runtime = await import(root + 'src/expressions/npc-expressions.js');
    const scene = await import(root + 'src/expressions/scene-sprites.js');
    const { buildExpressionsSection } = await import(root + 'src/ui/characters/ui-expressions.js');
    const { injectAtDialogueLines } = await import(root + 'src/chat/chat-speech.js');
    const { applyPlayerPortrait } = await import(root + 'src/chat/chat-portraits.js');
    const portraits = await import(root + 'src/expressions/dialogue-portraits.js');
    const { expressionGenerator } = await import(root + 'src/expressions/host-expression-generation.js');
    const host = await import('/script.js');
    const context = SillyTavern.getContext(), settings = getSettings();
    const saved = { ...settings }, metadata = { ...context.chatMetadata };
    const length = context.chat.length, characterId = context.characterId;
    const originalFetch = window.fetch, originalGenerate = expressionGenerator.generate;
    const classifier = context.extensionSettings.expressions;
    let user, reply, editor;
    const result = {};
    try {
        if (context.getCurrentChatId() === undefined) {
            const id = context.characters.findIndex(card => card.chat);
            if (id < 0) throw new Error('Needs an existing host character chat.');
            host.setCharacterId(id);
        }
        const key = getCurrentPersonaKey();
        settings.personaData = { ...settings.personaData, [key]: { imageUrl: '/img/ai4.png', profile: {} } };
        Object.assign(settings, { enabled: true, playerExpressions: true, autoGenerateNpcExpressions: false,
            npcExpressionsPerMessage: false, npcExpressionIpAdapterMode: false, showPresentNpcSprites: false,
            characters: [], speakerIgnoreList: '', dialogueRecognitionFormat: '{name}: "{dialogue}"',
        });
        context.extensionSettings.expressions = { ...classifier, api: 0 };
        context.chatMetadata.sillynpc_expression_sprites = {};
        context.chatMetadata.sillynpc_npcs = [];
        const card = getPlayerCard();
        normalizeCharacterPresentation(card);
        card.presentation.expressions.spriteFolder = 'PlayerFixture/expressions';
        const sprites = [{ label: 'joy', path: '/characters/../img/ai4.png?player=joy' },
            { label: 'neutral', path: '/characters/../img/ai4.png?player=neutral' }];
        window.fetch = (url, ...args) => String(url).startsWith('/api/sprites/get?')
            ? Promise.resolve(new Response(JSON.stringify(sprites))) : originalFetch(url, ...args);
        const make = (id, html) => {
            const element = document.createElement('div'); element.className = 'mes'; element.setAttribute('mesid', id);
            element.innerHTML = '<div class="mesAvatarWrapper"><div class="avatar"><img src="/img/ai4.png"></div></div><div class="mes_text"></div>';
            element.querySelector('.mes_text').innerHTML = html;
            document.querySelector('#chat').append(element); return element;
        };
        context.chat.push({ is_user: true, mes: 'I feel wonderful.', force_avatar: key });
        user = make(length, '<p>I feel wonderful.</p>');
        let calls = 0;
        const savePortrait = (...args) => portraits.rememberDialoguePortrait(...args, { save: () => {} });
        const adapters = { loadPack: async () => sprites, classify: async () => { calls++; return 'joy'; },
            saveBinding: () => {}, rememberSprite: () => {}, savePortrait };
        await runtime.completeNpcExpressions(length, adapters);
        result.userPortrait = user.querySelector('.avatar img').dataset.sillynpcExpression === 'joy' && calls === 1;
        runtime.resetNpcExpressions(); runtime.renderNpcExpressions(user);
        result.savedUserPortrait = user.querySelector('.avatar img').dataset.sillynpcExpression === 'joy';
        applyPlayerPortrait(user); runtime.renderNpcExpressions(user);
        result.reprocessKeepsExpression = user.querySelector('.avatar img').dataset.sillynpcExpression === 'joy';
        context.chat.push({ mes: `${card.name}: "Hello."\n${card.name}: "Again."` });
        reply = make(length + 1, '<p></p><p></p>');
        [...reply.querySelectorAll('.mes_text p')].forEach((p, i) => { p.textContent = `${card.name}: "${i ? 'Again.' : 'Hello.'}"`; });
        injectAtDialogueLines(reply.querySelector('.mes_text'), [], () => '/img/ai4.png', false);
        settings.npcExpressionsPerMessage = true;
        await runtime.completeNpcExpressions(length + 1, adapters);
        result.playerReplyDialogue = [...reply.querySelectorAll('[data-persona]')].length === 2
            && [...reply.querySelectorAll('[data-persona]')].every(img => img.dataset.sillynpcExpression === 'joy') && calls === 2;
        const speechUnit = { messageId: length + 1, revision: (await import(root + 'src/chat/dialogue-presentation.js')).dialogueRevision(SillyTavern.getContext(), length + 1),
            kind: 'dialogue', isPersona: true, npcId: null, dialogueLineIndex: 0 };
        runtime.showNpcSpeechExpression(speechUnit);
        result.playerSpeechSprite = document.querySelector('#sillynpc-speech-sprite img')?.src.includes('player=joy') === true;
        scene.rememberNpcSprite(card, sprites, 'joy', null, { save: () => {} });
        settings.showPresentNpcSprites = true;
        await scene.refreshSceneSprites({ loadPack: async () => sprites });
        result.playerSceneSprite = [...document.querySelectorAll('.sillynpc-scene-sprite')].some(el => el.dataset.npcId === card.id);
        settings.showPresentNpcSprites = false; scene.clearSceneSprites();
        editor = buildExpressionsSection(card, { save: () => {}, savePortrait }); document.body.append(editor);
        await new Promise(resolve => setTimeout(resolve, 100));
        result.sharedEditor = ['emotion', 'prompt', 'prompt2', 'prompt3', 'negativePrompt', 'workflow', 'folder', 'fallback']
            .every(field => editor.querySelector(`[data-expression-field="${field}"]`));
        let generated;
        expressionGenerator.generate = async job => { generated = job; return sprites; };
        editor.querySelector('[data-expression-action="generate"]').click();
        for (let i = 0; i < 40 && !generated; i++) await new Promise(resolve => setTimeout(resolve, 25));
        result.manualPlayerGeneration = generated?.npcId === card.id && generated?.reference === card.imageUrl
            && generated?.isCurrent() === true;
        let automatic, finishAutomatic;
        expressionGenerator.generate = job => {
            automatic = job;
            return new Promise(resolve => { finishAutomatic = resolve; });
        };
        context.chat[length].mes = 'I fear danger.';
        runtime.resetNpcExpressions();
        await runtime.completeNpcExpressions(length, { ...adapters, classify: async () => 'fear' });
        for (let i = 0; i < 40 && !automatic; i++) await new Promise(resolve => setTimeout(resolve, 25));
        result.automaticPlayerGeneration = automatic?.npcId === card.id && automatic?.label === 'fear'
            && automatic?.reference === card.imageUrl && automatic?.isCurrent() === true;
        settings.playerExpressions = false;
        result.cancelledPlayerGeneration = automatic?.isCurrent() === false;
        finishAutomatic?.(sprites);
        runtime.resetNpcExpressions(); runtime.renderNpcExpressions(user);
        result.playerOptOutRestoresPortrait = !user.querySelector('.avatar img').dataset.sillynpcExpression;
        const before = calls; await runtime.completeNpcExpressions(length, adapters);
        result.playerOptOutSkipsWork = calls === before;
        settings.playerExpressions = true;
        context.chat[length].force_avatar = '/User Avatars/other-persona.png';
        await runtime.completeNpcExpressions(length, adapters);
        result.otherPersonaExcluded = calls === before;
        return result;
    } finally {
        runtime.resetNpcExpressions(); scene.clearSceneSprites(); user?.remove(); reply?.remove(); editor?.remove();
        expressionGenerator.generate = originalGenerate; window.fetch = originalFetch;
        Object.assign(settings, saved); context.extensionSettings.expressions = classifier;
        context.chat.splice(length);
        for (const key of Object.keys(context.chatMetadata)) delete context.chatMetadata[key];
        Object.assign(context.chatMetadata, metadata); host.setCharacterId(characterId);
    }
}
