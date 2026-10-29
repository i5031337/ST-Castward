import { Popup, POPUP_TYPE } from '../../../../../../popup.js';
import { getContext } from '../../../../../../st-context.js';
import { eventSource } from '../../../../../../events.js';
import { getSettings, saveSettings } from '../../core/settings.js';
import { startGenerationTask } from '../../core/generation-cancellation.js';
import { generationRequestAdapter } from '../../generation/request.js';
import { getPersonaData, loadStateFromMetadata, saveStateToMetadata, applyScenePrompt } from '../../tracker/status-logic.js';
import { createPlayerAdventureService } from '../../characters/player-adventure.js';

function appendText(parent, tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.append(node);
    return node;
}

async function reviewStartingSheet(draft, contract) {
    const wrap = document.createElement('div');
    appendText(wrap, 'h3', 'Starting stats and collections');
    appendText(wrap, 'p', 'Review your starting sheet before applying it to this adventure.');
    for (const [name, value] of Object.entries(draft.stats)) appendText(wrap, 'p', `${name}: ${value}`);
    for (const collection of contract.collections) {
        appendText(wrap, 'h4', collection.name || collection.id);
        const entries = draft.collections[collection.id];
        if (!entries.length) appendText(wrap, 'p', 'Empty');
        for (const entry of entries) {
            const details = collection.fields.filter(field => Object.hasOwn(entry, field.name))
                .map(field => `${field.label || field.name}: ${entry[field.name]}`);
            appendText(wrap, 'p', details.join(' · '));
        }
    }
    return Boolean(await new Popup(wrap, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Apply', cancelButton: 'Discard',
    }).show());
}

export const playerAdventureService = createPlayerAdventureService({
    getContext, getSettings, getPersona: getPersonaData, loadState: loadStateFromMetadata,
    request: args => {
        const settings = getSettings();
        return generationRequestAdapter({ ...settings.statusTracker, extractionTemperature: '' }, settings.loreProfileId || '')(args);
    },
    review: reviewStartingSheet, saveState: saveStateToMetadata, saveSettings,
    afterSave: state => {
        applyScenePrompt();
        eventSource.emit('sillynpc-status-updated', state, { source: 'player-creation' });
    },
});

export async function fillPlayerAdventure(card) {
    const task = startGenerationTask({ activity: { kind: 'profile', label: 'Creating player starting sheet…' },
        getPersonaKey: () => getPersonaData().avatar });
    try { return await playerAdventureService.initialize(card, task.signal); }
    finally { task.finish(); }
}
