// Unsaved fixtures: actual Fill dialogs and host lifecycle, with generation/storage stubbed.
const root = new URL('../../', import.meta.url).href;
const { Popup } = await import(new URL('../../../popup.js', root).href);
const { fillCharacter } = await import(root + 'src/ui/characters/ui-fill.js');
const { playerAdventureService } = await import(root + 'src/ui/characters/ui-player-adventure.js');
const { getPersonaData } = await import(root + 'src/tracker/status-logic.js');
const { createPlayerAdventureService } = await import(root + 'src/characters/player-adventure.js');
const source = await (await fetch(root + 'src/ui/characters/ui-player-adventure.js')).text();
const reviewSource = source.slice(source.indexOf('function appendText'), source.indexOf('export const playerAdventureService'));
const { POPUP_TYPE } = await import(new URL('../../../popup.js', root).href);
const review = new Function('document', 'Popup', 'POPUP_TYPE', reviewSource + '\nreturn reviewStartingSheet;')(document, Popup, POPUP_TYPE);
const original = { audit: playerAdventureService.audit, initialize: playerAdventureService.initialize };
const result = {};
const pause = () => new Promise(resolve => setTimeout(resolve, 25));
async function waitFor(find) {
    for (let i = 0; i < 160; i++) { const found = find(); if (found) return found; await pause(); }
    throw new Error('Timed out waiting for player creation dialog.');
}
let running;
try {
    const settings = { activeSystem: 'fixture', statusTracker: { playerStats: [
        { id: 'health', name: 'Health', type: 'number', defaultValue: '10/10', maxStatValue: '30' },
    ], collections: [{ id: 'gear', name: 'Equipment', targets: ['player'], fields: [
        { name: 'name', label: 'Name', type: 'text', isPrimary: true },
        { name: 'description', label: 'Description', type: 'text' },
    ] }] } };
    const card = { name: 'Fixture Hero', isPlayer: true, personaKey: getPersonaData().avatar, imageUrl: '/fixture.png', profile: {} };
    const persona = { avatar: card.personaKey, description: 'A traveling healer.' };
    const context = { getCurrentChatId: () => 'fixture', chatMetadata: {}, chat: [] };
    let state = { player: { personaKey: card.personaKey, stats: { Health: '10/10' }, collections: { gear: [] } } };
    let requests = 0, saves = 0;
    const local = createPlayerAdventureService({
        getContext: () => context, getSettings: () => settings, getPersona: () => persona, loadState: () => state,
        request: async () => { requests++; return { stats: { Health: '18/18' }, collections: {
            gear: [{ name: 'Travel cloak', description: 'Warm wool & brass clasps.' }],
        } }; },
        review, saveState: (next, options) => { options.beforeCommit?.(); state = next; saves++; return true; },
    });
    playerAdventureService.audit = (...args) => local.audit(...args);
    playerAdventureService.initialize = (...args) => local.initialize(...args);
    for (const accept of [false, true]) {
        running = fillCharacter(card);
        const plan = await waitFor(() => Popup.util.popups.find(popup => popup.dlg.querySelector('.sillynpc-fill-plan')));
        const rows = [...plan.dlg.querySelectorAll('.sillynpc-fill-check')];
        result.threeStages = rows.map(row => row.dataset.stage).join(',') === 'lore,adventure,image';
        result.personaAndSystemExplained = plan.dlg.textContent.includes('SillyTavern persona and active System');
        rows.find(row => row.dataset.stage === 'lore').checked = false;
        rows.find(row => row.dataset.stage === 'image').checked = false;
        result.startingSheetSelected = rows.find(row => row.dataset.stage === 'adventure').checked;
        await plan.completeAffirmative();
        const preview = await waitFor(() => Popup.util.popups.find(popup => popup.dlg.textContent.includes('Review your starting sheet')));
        result.preview = preview.dlg.textContent.includes('Health: 18/18')
            && preview.dlg.textContent.includes('Travel cloak') && preview.dlg.textContent.includes('Warm wool & brass clasps.');
        result.noWriteBeforeReview = saves === 0 && settings.master_items === undefined;
        if (accept) await preview.completeAffirmative();
        else await preview.completeNegative();
        await running; running = null;
        if (!accept) result.cancelKeptDefaults = saves === 0 && state.player.stats.Health === '10/10';
    }
    result.appliedOnce = saves === 1 && requests === 2 && state.player.adventureInitialized
        && state.player.stats.Health === '18/18' && state.player.collections.gear[0].name === 'Travel cloak';
    result.libraryRegistered = settings.master_items?.gear?.['travel cloak']?.description === 'Warm wool & brass clasps.';
    result.repeatDisabled = local.audit(card).done;
} catch (error) {
    result.error = String(error) + '\n' + (error.stack || '');
} finally {
    for (const popup of [...Popup.util.popups]) {
        if (popup.dlg.querySelector('.sillynpc-fill-plan') || popup.dlg.textContent.includes('Review your starting sheet')) {
            await popup.completeNegative();
        }
    }
    if (running) await running.catch(() => {});
    Object.assign(playerAdventureService, original);
    document.documentElement.setAttribute('data-player-creation', JSON.stringify(result));
}
