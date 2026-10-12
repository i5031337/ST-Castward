import { normalizeCharacterPresentation, normalizeSpriteFolder } from '../../core/npc-presentation.js';
import { saveSettings } from '../../core/settings.js';
import { getContext } from '../../../../../../st-context.js';
import { isChatCharacter } from '../../characters/character-repository.js';
import { triggerReprocess } from '../../chat/reprocess.js';
import { loadSpritePack } from '../../expressions/host-expressions.js';
import { selectSprite } from '../../expressions/expression-engine.js';
import { buildExpressionGeneration } from './ui-expression-generation.js';
import { rememberNpcSprite } from '../../expressions/scene-sprites.js';

export function buildExpressionsSection(card, { save = () => {
    if (isChatCharacter(card.id)) getContext()?.saveMetadataDebounced?.();
    else saveSettings();
    triggerReprocess();
} } = {}) {
    const config = normalizeCharacterPresentation(card).expressions;
    const root = document.createElement('fieldset'); root.className = 'sillynpc-expression-editor';
    const legend = document.createElement('legend'); legend.textContent = 'Expressions'; root.append(legend);
    const preview = document.createElement('img'); preview.alt = 'Expression preview';
    preview.style.cssText = 'width:100%;max-height:240px;object-fit:contain'; root.append(preview);
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    let sprites = [], request = 0, selected = 'neutral';
    const show = () => {
        const path = selectSprite(sprites, selected, config.fallback, card.id) || card.imageUrl;
        preview.hidden = !path; if (path) preview.src = path;
    };
    preview.onerror = () => { preview.hidden = true; status.textContent = 'Sprite unavailable; using the NPC portrait.'; };
    const load = async () => {
        const version = ++request;
        try {
            const loaded = await loadSpritePack(config.spriteFolder);
            if (version !== request) return;
            sprites = loaded; show(); status.textContent = `${sprites.length} sprites available.`;
        } catch (error) { if (version === request) status.textContent = error.message; }
    };
    const pack = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Sprite pack'; pack.append(summary);
    const field = (title, input, key) => {
        const label = document.createElement('label'); label.textContent = title; label.append(input); pack.append(label);
        input.className = 'text_pole'; input.dataset.expressionField = key;
    };
    const folder = document.createElement('input'); folder.value = config.spriteFolder;
    folder.placeholder = 'Assigned automatically from the NPC portrait'; field('Folder', folder, 'folder');
    const fallback = document.createElement('input'); fallback.value = config.fallback; field('Fallback', fallback, 'fallback');
    folder.addEventListener('change', () => {
        const valid = normalizeSpriteFolder(folder.value);
        if (folder.value.trim() && !valid) {
            status.textContent = 'Use a folder and at most one subfolder.'; folder.value = config.spriteFolder; return;
        }
        config.spriteFolder = valid; config.bindingStatus = 'unverified'; sprites = []; request++; save(); show();
    });
    fallback.addEventListener('change', () => { config.fallback = fallback.value.trim() || 'neutral'; save(); show(); });
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'menu_button';
    refresh.textContent = 'Refresh pack'; refresh.dataset.expressionAction = 'refresh'; refresh.addEventListener('click', load);
    pack.append(refresh, status);
    root.append(buildExpressionGeneration(card, { save,
        onSelect: label => { selected = label; show(); },
        onPack: (loaded, label) => {
            request++; sprites = loaded; selected = label; show(); status.textContent = `${loaded.length} sprites available.`;
            rememberNpcSprite(card, loaded, label, null, { save });
        },
        onReference: () => { request++; folder.value = config.spriteFolder; sprites = []; show(); },
    }), pack);
    show();
    if (config.spriteFolder) void load();
    return root;
}
