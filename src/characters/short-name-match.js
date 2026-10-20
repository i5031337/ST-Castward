// Titles alone are too broad to infer identity; explicit aliases can still opt into them.
const TITLES = new Set(('mr mrs ms mx miss dr doctor prof professor sir dame lord lady '
    + 'king queen prince princess captain capt commander cmdr lieutenant lt general '
    + 'sergeant sgt officer chief master mistress father mother brother sister saint st').split(' '));
const isTitle = word => TITLES.has(word.toLowerCase().replace(/\.$/, ''));
const wordsFor = name => String(name ?? '').trim().split(/\s+/).filter(Boolean);

/** Resolve a shorter first/last name only when exactly one card in the supplied cast fits. */
export function cardForShortName(name, characters, caseInsensitive = false) {
    const words = wordsFor(name);
    if (!words.length || words.every(isTitle) || (words.join('').match(/\p{L}/gu) || []).length < 2) return null;
    const fold = value => caseInsensitive ? value.toLowerCase() : value;
    const short = words.map(fold).join(' ');
    let found = null;
    for (const card of characters) {
        const names = [card.name, ...(card.aliases || []).filter(alias => !alias.isRegex).map(alias => alias.pattern)];
        const matches = names.some(full => {
            const parts = wordsFor(full);
            // Require an actual shortening, not a different spelling or a partial word.
            if (parts.length <= words.length) return false;
            while (parts.length && isTitle(parts[0])) parts.shift();
            const normalized = parts.map(fold).join(' ');
            return normalized === short || normalized.startsWith(`${short} `) || normalized.endsWith(` ${short}`);
        });
        if (!matches) continue;
        if (found && found !== card) return null;
        found = card;
    }
    return found;
}
