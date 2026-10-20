import { paletteIndexFor } from './hash.js';
export const SPEAKER_PALETTE = Object.freeze([
    '#c0736a', '#5e93c4', '#7fa05a', '#b58a4a', '#9a6fb0',
    '#4fa3a0', '#c4707f', '#8a8fbf', '#a8894f', '#6b9f7c',
    '#b3766d', '#5f86a8', '#9d7bb5', '#a2a05c', '#6f97b8',
]);

export const SYSTEM_PROMPT = [
    'Read the latest roleplay message and return a JSON tracker update.',
    'Use configured fields and exact names.',
    'Report resolved events. Use earlier messages as context.',
    'Use stated amounts. Estimate conservatively when an effect is clear but its amount is unstated.',
    'List every NPC present after the message.',
    'Follow the output format in the request.',
].join('\n');

export function paletteColorFor(name) {
    return SPEAKER_PALETTE[paletteIndexFor(name, SPEAKER_PALETTE.length)];
}

export const DIALOGUE_FORMAT_PROMPT = 'Start each spoken line with the speaker\'s actual name and a colon: Name: "dialogue".';

export const IMAGE_PROMPT = '{{lore}}\n{{items}}';
