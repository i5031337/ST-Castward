export const NPC_NAME_CANDIDATE_COUNT = 4;
const INITIALS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const LENGTH_WEIGHTS = [[1, 15], [2, 45], [3, 30], [4, 10]];
const RHYTHM_WEIGHTS = {
    2: [['first', 50], ['last', 50]],
    3: [['first', 40], ['middle', 40], ['last', 20]],
    4: [['first', 25], ['penultimate', 50], ['last', 25]],
};

/** Uniform selection without modulo bias; injected selectors make randomness testable. */
export function randomIndex(length) {
    if (!Number.isSafeInteger(length) || length < 1) throw new Error('No choices available.');
    const range = 2 ** 32;
    const limit = range - range % length;
    const buffer = new Uint32Array(1);
    do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % length;
}

function weightedChoice(choices, pick) {
    let roll = pick(choices.reduce((sum, [, weight]) => sum + weight, 0));
    for (const [value, weight] of choices) {
        if (roll < weight) return value;
        roll -= weight;
    }
}

/** Creative hints only: the model owns pronunciation and cultural fit. */
export function buildNpcNamingBrief(usedNames = [], pick = randomIndex) {
    const syllables = weightedChoice(LENGTH_WEIGHTS, pick);
    const emphasis = syllables === 1 ? 'single beat' : weightedChoice(RHYTHM_WEIGHTS[syllables], pick);
    const usedInitials = new Set(usedNames.map(name => String(name || '').normalize('NFKD')
        .replace(/\p{M}/gu, '').toUpperCase().match(/\p{L}/u)?.[0]));
    const preferred = INITIALS.filter(letter => !usedInitials.has(letter));
    const fallback = INITIALS.filter(letter => usedInitials.has(letter));
    const candidateInitials = [];
    while (candidateInitials.length < NPC_NAME_CANDIDATE_COUNT) {
        const pool = preferred.length ? preferred : fallback;
        candidateInitials.push(pool.splice(pick(pool.length), 1)[0]);
    }
    return {
        syllables,
        length: `Aim for ${syllables} syllable${syllables === 1 ? '' : 's'} in the given or primary name, not the whole name with surnames or titles.`,
        rhythm: syllables === 1 ? 'One clear beat.' : `Aim for emphasis on the ${emphasis} syllable.`,
        candidateInitials,
        guidance: 'Use candidateInitials in order, one per alternative primary name written in the Latin alphabet. '
            + 'These are creative hints, not strict requirements. Natural names for the setting, culture and requested nameStyle '
            + 'take precedence over length, rhythm and initials. Do not force Latin initials or an anglicized stress pattern '
            + 'onto another naming tradition. Do not explain the brief in the response.',
    };
}
