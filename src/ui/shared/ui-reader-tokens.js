import { approximateTokens } from '../../core/tokens.js';
import { appendSettingHelp } from '../settings/ui-setting-help.js';

const listeners = new WeakMap();

/** Refresh locally when reader settings change; tab navigation rebuilds System-dependent text. */
export function buildReaderTokenReadout(container, readPrompts, note = '') {
    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-reader-tokens notes';
    const count = document.createElement('small');
    count.className = 'sillynpc-token-count sillynpc-setting-row';
    const help = 'Built-in instructions and this System’s definitions and examples. '
        + 'Excludes story and character context, replies, and connection-specific overhead. ' + note;
    wrap.append(count);
    const refresh = () => {
        count.textContent = Object.entries(readPrompts()).map(([label, prompts]) => {
            const counts = prompts.map(approximateTokens);
            const low = Math.min(...counts), high = Math.max(...counts);
            return `${label} base instructions: ≈${low.toLocaleString()}${low === high ? '' : '–' + high.toLocaleString()} tokens`;
        }).join(' · ');
    };
    const previous = listeners.get(container);
    if (previous) {
        container.removeEventListener('input', previous);
        container.removeEventListener('change', previous);
    }
    listeners.set(container, refresh);
    container.addEventListener('input', refresh);
    container.addEventListener('change', refresh);
    refresh();
    appendSettingHelp(wrap, help);
    wrap.querySelector('.sillynpc-setting-help-button').setAttribute('aria-label', 'Help: Base instruction token estimate');
    return wrap;
}
