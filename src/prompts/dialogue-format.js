import { placeWritingPrompt } from './prompt-slot.js';
import { getSettings } from '../core/settings.js';
import { DIALOGUE_FORMAT_PROMPT, debugLog } from '../core/constants.js';
import { usesDesignedNpcVoices } from '../tts/tts-settings.js';

export const DIALOGUE_FORMAT_KEY = 'sillynpc-dialogue-format';

export function dialogueFormatText() {
    const tts = getSettings().tts;
    if (!tts?.enabled || !usesDesignedNpcVoices(tts)) return DIALOGUE_FORMAT_PROMPT;
    return `${DIALOGUE_FORMAT_PROMPT}\nWhen a new NPC speaks for the first time, put one separate plain-text line before their first dialogue: [[NPC_VOICE speaker="Name" description="brief audible voice traits"]]. Use their exact dialogue speaker name. Include an age band and voice presentation if established, plus a few audible traits; include an accent only if established. Do not write this line for the player or repeat it for an existing NPC. Leave a blank line between this cue and Name: "dialogue". Keep the cue outside quotation marks.`;
}

export function applyDialogueFormatPrompt() {
    const settings = getSettings();
    const off = !settings.enabled || !settings.dialogueFormatEnabled;

    placeWritingPrompt(DIALOGUE_FORMAT_KEY, off ? '' : dialogueFormatText(), {
        depth: Number(settings.dialogueFormatDepth ?? 0),
    });

    if (off) return;
    debugLog(`Dialogue format sent at depth ${Number(settings.dialogueFormatDepth ?? 0)}`);
}
