import { npcTemplates } from '../core/npc-templates.js';
import { fnv1a } from '../core/hash.js';
import { getSettings } from '../core/settings.js';
import { getChatCast } from '../characters/characters.js';
import { getAllCharacters } from '../characters/character-repository.js';
import { getCastDecisions } from '../tracker/status-logic.js';
import { faceAssignmentVersion } from '../characters/default-portraits.js';


/**
 * Fingerprint image length and bounded edge samples to detect portrait changes without hashing an entire data URI. Collisions remain possible.
 *
 * @param {string} url
 * @returns {string}
 */
function imageKey(url) {
    const text = String(url || '');
    if (!text) return '0';

    const EDGE = 256;
    const sample = text.length <= EDGE * 2
        ? text
        : text.slice(0, EDGE) + text.slice(-EDGE);

    // FNV-1a: spreads a change of one character. See hash.js.
    return `${text.length}.${fnv1a(sample).toString(36)}`;
}

/**
 * Compare rendering inputs to skip redundant redraws. Include only fields that affect chat decoration and tracker boxes.
 *
 * @returns {string}
 */

export function chatRenderSignature() {
    const settings = getSettings();

    const characters = getAllCharacters().map(char => [
        char.id,
        char.name,
        char.color,
        char.category,
        char.imageFit,
        imageKey(char.imageUrl),
        // Shown in the tracker box, and editable from the character page - which
        // asked for a redraw that a signature blind to them would have declined.
        JSON.stringify(char.statusOverrides || {}),
        char.npcTemplateId || '',
        (char.aliases || []).map(alias => `${alias.pattern}~${alias.isRegex}`).join(','),
    ].join('|')).join(';');

    const decoration = [
        settings.enabled,
        settings.applyColors,
        settings.hideSpeakerNames,
        settings.caseInsensitive,
        settings.defaultImageFit,
        settings.avatarShape,
        settings.avatarSize,
        settings.colorStyle,
        settings.dividerStyle,
        settings.menuStyle,
        settings.speakerIgnoreList,
        (settings.defaultImages || []).map(i => i && i.src).join(','),
    ].join('|');

    /** Track box settings and complete stat definitions; exclude unrelated HUD settings to avoid chat redraws. */
    const tracker = getSettings().statusTracker || {};
    const trackerBox = [
        tracker.enabled,
        tracker.showOnlyAtBottom,
        tracker.customCSS,
        /** Watch template changes from editing, imports, presets, and System switches. */
        tracker.template,
        tracker.characterColumns,
        JSON.stringify(tracker.globalStats || []),
        JSON.stringify(tracker.playerStats || []),
        JSON.stringify(tracker.npcStats || []),
        JSON.stringify(npcTemplates()),
        JSON.stringify(tracker.collections || []),
        settings.trackerFontScale,
        // Not a setting at all: which face a stranger wears is chat metadata, and
        // "Redraw every face" changes it without touching anything else here.
        faceAssignmentVersion(),
    ].join('|');

    // Which characters this chat is scoped to decides who gets decorated at all.
    const cast = getChatCast();
    const scope = [
        (cast.categories || []).join(','),
        (cast.include || []).join(','),
        (cast.exclude || []).join(','),
        /** Cast decisions change speaker identity and portraits. */
        JSON.stringify(getCastDecisions()),
    ].join('|');

    return `${characters}#${decoration}#${trackerBox}#${scope}`;
}
