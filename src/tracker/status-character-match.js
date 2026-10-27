import { getActiveCharacters } from '../characters/characters.js';
import { cardForShortName } from '../characters/short-name-match.js';
import { getAllCharacters } from '../characters/character-repository.js';

export function findCardForName(name) {
    if (!name) return null;
    const lower = String(name).trim().toLowerCase();
    const cards = getAllCharacters();

    const byName = cards.find(c => (c.name || '').toLowerCase() === lower);
    if (byName) return byName;

    for (const card of cards) {
        for (const alias of card.aliases || []) {
            if (!alias?.pattern) continue;
            if (alias.isRegex) {
                try { if (new RegExp(alias.pattern, 'i').test(name)) return card; } catch { /* invalid regex */ }
            } else if (alias.pattern.trim().toLowerCase() === lower) {
                return card;
            }
        }
    }
    return cardForShortName(name, getActiveCharacters(), true);
}

/**
 * The name a character should be stored under.
 *
 * Aliases collapse onto the card's own name, so a character the narrator calls
 * "Instructor Kovacs" in one line and "Mr. Kovacs" in the next is one row in the cast
 * rather than two. A name with no card is its own canonical form - unknown characters
 * are tracked too, and there is nothing to collapse them onto.
 *
 * @param {string} name
 * @returns {string}
 */
export function resolveCanonicalName(name) {
    return findCardForName(name)?.name || String(name ?? '').trim();
}
