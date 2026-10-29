// In-memory scene layout checks. No images are generated and no fixtures are saved.
const root = new URL('../../', import.meta.url);
const { getSettings } = await import(new URL('src/core/settings.js', root));
const { refreshSceneSprites, clearSceneSprites, focusSceneSprite } = await import(new URL('src/expressions/scene-sprites.js', root));
const { readDialogueRecords } = await import(new URL('src/chat/dialogue-presentation.js', root));
const { showNpcSpeechExpression } = await import(new URL('src/expressions/npc-expressions.js', root));
const { showSpeechSprite, clearSpeechSprite } = await import(new URL('src/expressions/speech-sprite.js', root));
const settings = getSettings(), context = SillyTavern.getContext();
const { setCharacterId } = await import('/script.js');
const savedCharacterId = context.characterId;
const fixtureCharacterId = context.characters.length;
const savedSettings = Object.fromEntries(['enabled', 'showPresentNpcSprites', 'characters'].map(key => [key, settings[key]]));
const keys = ['sillynpc_npcs', 'sillynpc_cast', 'sillynpc_status_state', 'sillynpc_expression_sprites'];
const savedMetadata = Object.fromEntries(keys.filter(key => Object.hasOwn(context.chatMetadata, key)).map(key => [key, context.chatMetadata[key]]));
const results = [];
const message = document.createElement('div');
message.className = 'mes';
const savedChatLength = context.chat.length;
const check = (condition, message) => { if (!condition) throw new Error(message); };
try {
    context.characters.push({ name: 'Scene layout fixture', chat: 'scene-layout-fixture' });
    setCharacterId(fixtureCharacterId);
    settings.enabled = settings.showPresentNpcSprites = true;
    for (const key of keys) delete context.chatMetadata[key];
    const imageUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="teal"/></svg>');
    const spriteUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect x="80" width="240" height="800" fill="teal"/></svg>');
    const checkPortrait = image => {
        check(image.dataset.portrait === 'true' && getComputedStyle(image).objectFit === 'cover', 'Fallback portraits should fill a tall frame');
        const expected = Math.min(image.offsetWidth * 2, image.parentElement.clientHeight);
        check(Math.abs(image.offsetHeight - expected) <= 1, 'Square portraits should have comparable height to tall sprites');
    };
    const cards = Array.from({ length: 5 }, (_, i) => ({ id: `scene-test-${i}`, name: `Scene ${i}`, imageUrl }));
    settings.characters = cards;
    for (const count of [1, 2, 3, 5]) {
        context.chatMetadata.sillynpc_status_state = { characters: cards.slice(0, count) };
        await refreshSceneSprites();
        const scene = document.getElementById('sillynpc-scene-sprites');
        const figures = [...scene.querySelectorAll('.sillynpc-scene-sprite')];
        check(figures.length === count, 'Only present NPCs should render');
        figures.forEach(figure => checkPortrait(figure.querySelector('img')));
        const widths = figures.map(el => el.offsetWidth);
        check(Math.max(...widths) - Math.min(...widths) <= 1, 'NPC slots must have equal widths');
        for (const side of scene.children) {
            for (const figure of side.children) {
                check(Math.abs(figure.offsetWidth - side.clientWidth) <= 1, 'Adding an NPC must not divide the available sprite width');
            }
            if (side.children.length > 1) {
                const [a, b] = [...side.children].map(el => el.getBoundingClientRect());
                check(a.left < b.right && b.left < a.right && Math.abs(a.left - b.left) > 1, 'Partners should overlap with a visible stagger');
            }
        }
        focusSceneSprite(cards[0].id);
        const active = figures[0];
        check(active.dataset.active === 'true', 'Speaker should be marked active');
        check(figures.slice(1).every(el => +getComputedStyle(active).zIndex > +getComputedStyle(el).zIndex), 'Speaker should be above scene partners');
        await refreshSceneSprites();
        check(scene.dataset.activeNpcId === cards[0].id, 'Refreshing an expression must retain playback focus');
        if (count >= 3) {
            focusSceneSprite(cards[2].id);
            check(scene.querySelector('[data-active="true"]').dataset.npcId === cards[2].id, 'Focus should follow the next speaker');
            check(scene.querySelectorAll('[data-active="true"]').length === 1, 'Only one speaker should be in front');
        }
        results.push({ count, slotWidth: widths[0] });
    }
    cards[0].presentation = { expressions: { spriteFolder: 'SceneLayoutFixture' } };
    await refreshSceneSprites({ loadPack: async () => [{ label: 'neutral', path: spriteUrl }] });
    const sceneImage = document.querySelector('.sillynpc-scene-sprite img');
    check(sceneImage.dataset.portrait === 'false' && getComputedStyle(sceneImage).objectFit === 'contain',
        'Available sprites should stay fully visible');
    sceneImage.onerror();
    checkPortrait(sceneImage);
    showSpeechSprite(cards[0], '', '', { dialogueLineIndex: 0 });
    checkPortrait(document.querySelector('#sillynpc-speech-sprite img'));
    showSpeechSprite(cards[0], spriteUrl, '', { dialogueLineIndex: 0 });
    const speechImage = document.querySelector('#sillynpc-speech-sprite img');
    check(speechImage.dataset.portrait === 'false' && getComputedStyle(speechImage).objectFit === 'contain',
        'Speech sprites should stay fully visible');
    speechImage.onerror();
    checkPortrait(speechImage);
    clearSpeechSprite();
    message.setAttribute('mesid', String(context.chat.length));
    message.innerHTML = '<div class="mes_text"><p>Scene 2: "Hello there."</p></div>';
    context.chat.push({ mes: 'Scene 2: "Hello there."', is_user: false });
    document.querySelector('#chat').append(message);
    focusSceneSprite(null);
    await refreshSceneSprites();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    check(document.querySelector('#sillynpc-scene-sprites').dataset.activeNpcId === cards[2].id,
        'Without playback, the latest dialogue speaker should be in front: ' + JSON.stringify({ records: readDialogueRecords(message), active: document.querySelector('#sillynpc-scene-sprites').dataset.activeNpcId }));
    const line = readDialogueRecords(message)[0];
    focusSceneSprite(cards[0].id);
    showNpcSpeechExpression({ ...line, kind: 'dialogue', dialogueLineIndex: line.lineIndex });
    check(document.querySelector('#sillynpc-scene-sprites').dataset.activeNpcId === cards[2].id,
        'Speech playback should bring the speaking NPC to the front');
    context.chatMetadata.sillynpc_status_state = { characters: [] };
    await refreshSceneSprites();
    check(!document.getElementById('sillynpc-scene-sprites'), 'Empty scenes should clear the display');
    document.documentElement.setAttribute('data-scene-sprite-test', JSON.stringify({ results }));
} catch (error) {
    document.documentElement.setAttribute('data-scene-sprite-test', JSON.stringify({ error: `${error.message}\n${error.stack}` }));
} finally {
    clearSceneSprites();
    clearSpeechSprite();
    message.remove();
    context.chat.length = savedChatLength;
    setCharacterId(savedCharacterId);
    context.characters.splice(fixtureCharacterId, 1);
    Object.assign(settings, savedSettings);
    for (const key of keys) delete context.chatMetadata[key];
    Object.assign(context.chatMetadata, savedMetadata);
    await refreshSceneSprites();
}
