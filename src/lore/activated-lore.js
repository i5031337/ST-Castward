import { getAllCharacters } from '../characters/character-repository.js';

/** Entries activated for the latest generation, shared by reader and scene prompts. */

/** @type {Array<object>} */
let activatedEntries = [];

/**
 * Record activated entries so the narrator and reader can recognize existing cards.
 *
 * @param {Array<object>} entries
 */
export function noteActivatedLore(entries) {
    activatedEntries = Array.isArray(entries) ? entries : [];
}

/**
 * Return cards whose linked lore entry fired this turn.
 *
 * @returns {object[]}
 */
export function charactersFromActivatedLore() {
    if (!activatedEntries.length) return [];
    const characters = getAllCharacters();
    return characters.filter(char => char.lorebook && activatedEntries.some(entry =>
        String(entry?.world ?? entry?.book ?? '') === String(char.lorebook.world)
        && String(entry?.uid) === String(char.lorebook.uid)));
}
