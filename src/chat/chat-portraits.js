import { BUILT_IN_DEFAULT_AVATAR, paletteColorFor } from '../core/constants.js';
import { getSettings } from '../core/settings.js';
import { getContext } from '../../../../../st-context.js';
import { findCharacter, getActiveCharacters } from '../characters/characters.js';
import { isChatCharacter } from '../characters/character-repository.js';
import { personaFileFromAvatar } from '../core/utils.js';
import { reconcileScenePresence, resolvePersonaSpeaker, getPlayerImageUrl, getCurrentPersonaKey } from '../tracker/status-logic.js';
import { faceFor } from '../characters/default-portraits.js';
import { messageBeats } from '../story/beats.js';
import { injectAtDialogueLines } from './chat-speech.js';

export function playerPortraitFor(record) {
    if (!getSettings().enabled) return '';
    if (!record?.is_user) return '';

    // No force_avatar means SillyTavern drew whoever is active, which is this player.
    const wrote = personaFileFromAvatar(record.force_avatar);
    if (wrote && wrote !== getCurrentPersonaKey()) return '';

    // Empty when no portrait has been made, which is how the persona picture stays.
    return getPlayerImageUrl();
}

/**
 * Remember the host avatar only while replacing it. Clear the saved source on restoration so persona changes cannot restore a stale image.
 *
 * @param {Element} mesEl
 */
export function applyPlayerPortrait(mesEl) {
    const img = mesEl.querySelector('.mesAvatarWrapper .avatar img');
    if (!img) return;

    const context = getContext();
    const record = (context?.chat || [])[Number(mesEl.getAttribute('mesid'))];
    const wanted = playerPortraitFor(record);

    if (wanted) {
        if (img.dataset.sillynpcAvatar === undefined) {
            img.dataset.sillynpcAvatar = img.getAttribute('src') || '';
        }
        if (img.getAttribute('src') !== wanted) img.setAttribute('src', wanted);
        return;
    }

    // Nothing of ours belongs here. Undefined means we never replaced anything, so
    // whatever is on screen is SillyTavern's and is already right.
    const original = img.dataset.sillynpcAvatar;
    if (original === undefined) return;
    delete img.dataset.sillynpcAvatar;
    if (img.getAttribute('src') !== original) img.setAttribute('src', original);
}

/**
 * Walk a rendered message and inject character avatars next to speaker labels.
 * @param {Element} mesEl
 */
export function injectCharacterImages(mesEl) {
    const textContainer = mesEl.querySelector('.mes_text');
    if (!textContainer) return;

    // Strip prior decorations so re-renders are idempotent.
    clearDecorations(textContainer);
    mesEl.removeAttribute('data-sillynpc-processed');

    if (!getSettings().enabled) return;

    // Scoped to this chat: a character belonging to another story is neither decorated
    // here nor reported present, which is what stops a new chat inheriting the last
    // one's cast. The manage grid still shows everybody.
    const allCharacters = getActiveCharacters();

    const messageId = mesEl.getAttribute('mesid');
    const context = getContext();
    const chat = (context && Array.isArray(context.chat)) ? context.chat : [];
    const isLastMessage = chat.length > 0 ? Number(messageId) >= chat.length - 1 : true;

    // Bound to this message, because which face a stranger wears depends on when they
    // were last seen - and a picture picked fresh on every render would reshuffle the
    // whole chat on each redraw.
    const pickFace = (name, char) => faceFor({ char, name, messageId: Number(messageId) });

    pendingActiveCharacters = new Set();
    try {
        injectAtDialogueLines(textContainer, allCharacters, pickFace, isLastMessage);
    } finally {
        const names = pendingActiveCharacters;
        pendingActiveCharacters = null;

        // Idempotent per message id, so re-rendering does not advance the clock.
        if (isLastMessage) reconcileScenePresence([...names], messageId);
    }

    // After all avatars are placed, decorate each speaker's containing paragraph.
    decorateSpeechBlocks(textContainer);
    
    // Mark as processed
    mesEl.setAttribute('data-sillynpc-processed', 'true');
}

/** Streaming decoration has no scene or metadata side effects. */
export function decorateStreamingDialogue(mesEl) {
    const container = mesEl?.querySelector('.mes_text');
    if (!container || !getSettings().enabled) return;
    clearDecorations(container);
    injectAtDialogueLines(container, getActiveCharacters(), () => BUILT_IN_DEFAULT_AVATAR, false);
    decorateSpeechBlocks(container);
}

export function clearDecorations(textContainer) {
    textContainer.querySelectorAll('.sillynpc-speech-text, .sillynpc-speaker-name, .sillynpc-speaker-colon').forEach(wrapper => {
        const parent = wrapper.parentNode;
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
        parent.removeChild(wrapper);
    });
    textContainer.normalize();
    textContainer.querySelectorAll('.sillynpc-chat-avatar').forEach(el => el.remove());
    textContainer.querySelectorAll('.sillynpc-alias-link').forEach(el => el.remove());
    // Turning colouring off has to give the model's own colours back, so this is undone
    // here with every other decoration.
    textContainer.querySelectorAll('.sillynpc-ignore-model-color').forEach(el => {
        el.classList.remove('sillynpc-ignore-model-color');
    });
    textContainer.querySelectorAll('.sillynpc-speech-block').forEach(p => {
        p.classList.remove(
            'sillynpc-speech-block',
            'sillynpc-multi-speaker',
            'divider-subtle', 'divider-bold', 'divider-dashed', 'divider-none',
            'color-text', 'color-background', 'color-border', 'color-gradient', 'color-all'
        );
        p.style.removeProperty('--sillynpc-color');
        p.removeAttribute('data-sillynpc-char');
    });
}

/**
 * Names seen on the last message during the current injectCharacterImages() pass.
 * Flushed once at the end rather than written per avatar.
 * @type {Set<string>}
 */
let pendingActiveCharacters = null;

/** Build speaker portraits for both injection paths, sharing persona and fallback selection. */
export function createAvatarImg({ char, defaultImage, name, isLastMessage, persona: resolvedPersona }) {
    const img = document.createElement('img');
    const shape = getSettings().avatarShape || 'rounded';
    const size = getSettings().avatarSize || 'medium';
    img.className = `sillynpc-chat-avatar shape-${shape} size-${size}`;
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.onerror = () => img.remove();

    const globalFit = getSettings().defaultImageFit || 'contain';
    const effectiveFit = (char?.imageFit) || globalFit;
    img.style.objectFit = effectiveFit;

    // A cast decision can identify the speaker as the player even when a card exists.
    const label = name || char?.name || '';
    const persona = resolvedPersona === undefined
        ? (label ? resolvePersonaSpeaker(label) : null) : resolvedPersona;

    if (persona) {
        img.src = persona.imageUrl;
        img.alt = persona.name || label;
        img.title = `${persona.name || label} — this is you; click to open your sheet`;
        img.dataset.persona = 'true';
        // A persona is not one of the cast, but say the name anyway and let mayJoinScene
        // be the single place that decides who joins.
        if (label) {
            img.dataset.charName = label;
            if (isLastMessage && pendingActiveCharacters) pendingActiveCharacters.add(label);
        }
        // A persona whose picture file has gone - or who has never had one, since the
        // fallback name ST reports is not a real file - would otherwise hit the onerror
        // above and vanish, which looks exactly like the decision doing nothing.
        img.onerror = () => {
            img.onerror = () => img.remove();
            img.src = defaultImage || BUILT_IN_DEFAULT_AVATAR;
        };
    } else if (char) {
        img.src = char.imageUrl || defaultImage || BUILT_IN_DEFAULT_AVATAR;
        img.alt = char.name || '';
        img.title = isChatCharacter(char.id)
            ? `${char.name || 'unnamed'} — click to edit card`
            : `${char.name || 'unnamed'} — click to create a new chat profile or edit the reusable card`;
        img.dataset.charId = char.id;
        if (char.name) {
            img.dataset.charName = char.name;
            if (isLastMessage && pendingActiveCharacters) {
                pendingActiveCharacters.add(char.name);
            }
        }
    } else {
        img.src = defaultImage || BUILT_IN_DEFAULT_AVATAR;
        img.alt = name || '';
        img.title = name
            ? `${name} — click to create and Fill; Shift-click to link as alias`
            : 'click to create and Fill; Shift-click to link as alias';
        img.setAttribute('aria-label', img.title);
        img.dataset.default = 'true';
        if (name) {
            img.dataset.charName = name;
            // A speaker with no card is still present in the scene. Only characters
            // with cards used to be reported, which is why a new cast could appear in
            // the message while the tracker still listed the previous scene.
            if (isLastMessage && pendingActiveCharacters) {
                pendingActiveCharacters.add(name);
            }
        }
    }
    return img;
}

/**
 * Prefer the card colour; otherwise derive a stable shade from the speaker name.
 *
 * @param {string} [charId] From the avatar, when the speaker has a card.
 * @param {string} [charName] From the avatar, carded or not.
 * @returns {{ color: string, charId: string|null } | null} Null means leave it plain.
 */
export function resolveSpeakerColor(charId, charName) {
    const char = charId ? findCharacter(charId) : null;
    if (char?.color) return { color: char.color, charId: char.id };

    if (!getSettings().autoColorUnknownSpeakers || !charName) return null;
    return { color: paletteColorFor(charName), charId: null };
}

/**
 * Override nested model-written colours with a removable class. Clearing decorations restores them without changing message text.
 *
 * @param {Element} block
 * @returns {number} How many tags were neutralised.
 */
export function neutraliseModelColors(block) {
    if (!getSettings().applyColors) return 0;
    const tags = block?.querySelectorAll?.('font[color]') || [];
    let count = 0;
    for (const tag of tags) {
        tag.classList.add('sillynpc-ignore-model-color');
        count += 1;
    }
    return count;
}
/** Colour speaker paragraphs using the shared beat discovery. Leave narration uncoloured. */
function decorateSpeechBlocks(container) {
    const settings = getSettings();
    for (const beat of messageBeats(container)) {
        if (beat.isNarration) continue;
        const block = beat.element;
        // A message with no block elements is one beat whose element is the container
        // itself, and painting the whole message as one speaker's is not what that means.
        if (block === container) continue;

        // Reset classes to ensure setting changes apply
        block.classList.remove(
            'sillynpc-speech-block', 
            'divider-subtle', 'divider-bold', 'divider-dashed', 'divider-none',
            'color-text', 'color-background', 'color-border', 'color-gradient', 'color-all'
        );
        block.style.removeProperty('--sillynpc-color');

        block.classList.add('sillynpc-speech-block', `divider-${settings.dividerStyle || 'subtle'}`);

        if (!beat.ambiguous) {
            wrapSingleSpeakerBlock(block, beat.avatars[0]);
        } else {
            block.classList.add('sillynpc-multi-speaker');
        }

        if (settings.applyColors) {
            const matchedAvatar = block.querySelector('.sillynpc-chat-avatar[data-char-id]');
            const named = block.querySelector('.sillynpc-chat-avatar[data-char-name]');
            const colour = resolveSpeakerColor(matchedAvatar?.dataset.charId, named?.dataset.charName);
            if (colour) {
                block.style.setProperty('--sillynpc-color', colour.color);
                if (colour.charId) block.setAttribute('data-sillynpc-char', colour.charId);
                block.classList.add(`color-${settings.colorStyle || 'text'}`);
            }
        }

        neutraliseModelColors(block);
    }
}

function wrapSingleSpeakerBlock(block, avatar) {
    if (avatar.parentNode !== block) {
        block.insertBefore(avatar, block.firstChild);
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'sillynpc-speech-text';
    const others = [...block.childNodes].filter(n => n !== avatar);
    for (const node of others) wrapper.appendChild(node);
    block.appendChild(wrapper);
}
