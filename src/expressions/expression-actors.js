import { getContext } from '../../../../../st-context.js';
import { getSettings } from '../core/settings.js';
import { getActiveCharacters } from '../characters/characters.js';
import { getPlayerCard, getCurrentPersonaKey } from '../tracker/status-logic.js';
import { personaFileFromAvatar } from '../core/utils.js';
import { dialogueRevision, readDialogueRecords } from '../chat/dialogue-presentation.js';
import { dialogueLineCurrent } from '../chat/dialogue-stream-state.js';

/** Expression adapters keep player identity separate from cast and voice routing. */
export function expressionCardFor(id) {
    if (id?.startsWith('player:')) {
        const card = getPlayerCard();
        return card.id === id ? card : null;
    }
    return getActiveCharacters().find(card => card.id === id);
}

export function expressionLine(line) {
    return line.isPersona && !line.npcId ? { ...line, npcId: getPlayerCard().id } : line;
}

export function expressionLineCurrent(line) {
    if (line.isPersona && expressionCardFor(line.npcId) === null) return false;
    const message = getContext().chat?.[line.messageId];
    if (line.isPersona && message?.is_user && !playerMessageCurrent(message)) return false;
    return dialogueLineCurrent(line.isPersona && line.streamId ? { ...line, npcId: null } : line);
}

export function playerMessageCurrent(message) {
    const avatar = personaFileFromAvatar(message?.force_avatar);
    return message?.is_user && (!avatar || avatar === getCurrentPersonaKey());
}

export function readExpressionLines(element) {
    const context = getContext(), messageId = Number(element?.getAttribute('mesid'));
    const message = context.chat?.[messageId];
    if (!element || message?.is_system) return [];
    if (message?.is_user) {
        if (!getSettings().playerExpressions || !playerMessageCurrent(message)) return [];
        const text = String(message.extra?.display_text ?? message.mes ?? '').trim();
        return text ? [expressionLine({ messageId, revision: dialogueRevision(context, messageId),
            lineIndex: 0, isPersona: true, text, displayName: getPlayerCard().name })] : [];
    }
    return readDialogueRecords(element).filter(line => !line.isPersona || getSettings().playerExpressions).map(expressionLine);
}

export function expressionsEnabled(line) {
    const settings = getSettings();
    return settings.enabled && (line.isPersona
        ? settings.playerExpressions === true : settings.autoGenerateNpcExpressions === true);
}
