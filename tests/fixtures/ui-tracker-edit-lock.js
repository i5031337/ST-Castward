// Production UI handlers with isolated stores and no host saves or model requests.
const root = new URL('../../', import.meta.url).href;
const lock = await import(root + 'src/tracker/tracker-edit-lock.js');
const { collectionEditorFixture } = await import(root + 'tests/fixtures/ui-collection-editor.js');
const result = {};
const host = document.createElement('div');
host.className = 'sillynpc';
document.body.appendChild(host);
let release;
const savedToastr = globalThis.toastr;

async function compile(path, names, overrides) {
    const source = await (await fetch(root + path)).text();
    const deps = {};
    for (const match of source.matchAll(/^import\s+{([\s\S]*?)}\s+from\s+['"]([^'"]+)['"];\s*/gm)) {
        const module = await import(new URL(match[2], root + path));
        for (const name of match[1].split(',').map(name => name.trim()).filter(Boolean)) deps[name] = module[name];
    }
    Object.assign(deps, overrides);
    const code = source.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export function ', 'function ');
    return new Function(...Object.keys(deps), code + `;return {${names}};`)(...Object.values(deps));
}

try {
    const stats = [{ name: 'HP', type: 'number', defaultValue: '100' },
        { name: 'Mood', type: 'text', options: ['Calm', 'Happy'] }];
    const settings = { enabled: true, activeSystem: 'fixture', statusTracker: { playerStats: stats, npcStats: stats,
        collections: [{ id: 'items', fields: [{ name: 'name', isPrimary: true, type: 'text' }] }] } };
    const actor = { isPlayer: true, name: 'Player', stats: { HP: '95', Mood: 'Calm' }, collections: { items: [{ name: 'Sword' }] } };
    const state = { player: actor, characters: [] };
    const npc = { name: 'NPC', statusOverrides: { HP: '70', Mood: 'Calm' } };
    const context = { chatMetadata: {}, getCurrentChatId: () => 'fixture' };
    const updates = [];
    const applyUpdate = change => { updates.push(change); Object.assign(actor.stats, change.player?.stats); };
    const { attachInlineEditListeners } = await compile('src/tracker/ui/status-ui-edit.js', 'attachInlineEditListeners', {
        loadStateFromMetadata: () => state, applyUpdate,
    });
    const { renderOverridesSection } = await compile('src/ui/manage/ui-manage-overrides.js', 'renderOverridesSection', {
        getContext: () => context, getSettings: () => settings, getCurrentPersonaKey: () => 'fixture',
        npcStatsFor: () => stats, loadStateFromMetadata: () => state, applyUpdate,
        saveSettings: () => updates.push('npc'), syncOverrideToActiveState: () => {}, triggerReprocess: () => {},
    });
    const inline = document.createElement('div');
    inline.innerHTML = '<span class="sillynpc-status-editable" contenteditable="true" data-type="player" data-key="HP" data-initial="95" title="Edit HP">95</span>';
    const playerSheet = document.createElement('div');
    const npcSheet = document.createElement('div');
    const collection = document.createElement('div');
    host.append(inline, playerSheet, npcSheet, collection);
    attachInlineEditListeners(inline, { state });
    renderOverridesSection({ isPlayer: true }, playerSheet);
    renderOverridesSection(npc, npcSheet);

    const reviewHost = document.createElement('div'); host.appendChild(reviewHost);
    const { renderReviewPanel } = await compile('src/ui/tracker/ui-change-review.js', 'renderReviewPanel', {
        getSettings: () => settings,
    });
    let reviews = 0;
    let pendingRows = [{ kind: 'stat', scope: 'player', label: 'HP', before: '95', after: '90' }];
    renderReviewPanel(reviewHost, 0, { getPendingChanges: () => pendingRows,
        resolvePendingChanges: () => { reviews++; pendingRows = []; } });

    const fixture = await collectionEditorFixture(root, { settings, state });
    let confirm;
    const { renderCollectionUI, attachCollectionListeners } = await compile('src/ui/collections/ui-collection.js', 'renderCollectionUI, attachCollectionListeners', {
        getSettings: () => settings, loadStateFromMetadata: () => state,
        createCollectionEditor: fixture.createCollectionEditor,
        Popup: { show: { confirm: () => new Promise(resolve => { confirm = resolve; }) } },
    });
    const draw = () => {
        collection.innerHTML = renderCollectionUI('items', actor, settings.statusTracker);
        attachCollectionListeners(collection, actor, draw);
        return collection;
    };
    draw();
    const edit = inline.querySelector('[contenteditable]');
    edit.focus(); edit.innerText = '80';
    release = lock.lockTrackerEdits();
    result.focusedEditSettled = actor.stats.HP === '80' && updates.length === 1;
    result.disabledControls = edit.contentEditable === 'false'
        && [...host.querySelectorAll('input, select, button')].every(input => input.disabled);
    result.noticeVisible = [...host.querySelectorAll('[role="status"]')].every(note => !note.hidden && getComputedStyle(note).display !== 'none');
    result.choiceCovered = !!playerSheet.querySelector('select:disabled') && !!npcSheet.querySelector('select:disabled');
    reviewHost.querySelector('button').dispatchEvent(new Event('click'));
    result.reviewBlocked = reviews === 0 && !!reviewHost.querySelector('input:disabled');
    edit.innerText = '1'; edit.dispatchEvent(new Event('blur'));
    for (const input of host.querySelectorAll('.override-val-input')) {
        input.value = '1'; input.dispatchEvent(new Event('change'));
    }
    collection.querySelector('.sillynpc-add-item').dispatchEvent(new Event('click'));
    result.handlersRefuse = updates.length === 1 && fixture.writes() === 0 && npc.statusOverrides.HP === '70';
    // Simulate the reader's accepted values while editing is disabled.
    actor.stats.HP = '90'; actor.stats.Mood = 'Happy'; npc.statusOverrides.HP = '65';
    actor.collections.items = [{ name: 'Shield' }];
    const late = document.createElement('div');
    late.innerHTML = '<input title="Original" disabled><span contenteditable="true">Late editor</span>';
    host.appendChild(late);
    lock.bindTrackerEditor(late, 'input, span');
    result.newEditorLocked = late.querySelector('span').contentEditable === 'false';
    release(); release = null;
    result.reenabled = edit.contentEditable === 'true' && edit.title === 'Edit HP'
        && !playerSheet.querySelector('input').disabled && !npcSheet.querySelector('select').disabled;
    result.originalDisabledPreserved = late.querySelector('input').disabled && late.querySelector('input').title === 'Original';
    result.sheetsRefreshed = playerSheet.querySelector('input').value === '90'
        && playerSheet.querySelector('select').value === 'Happy' && npcSheet.querySelector('input').value === '65';
    result.collectionRefreshed = collection.querySelector('input').value === 'Shield'
        && collection.querySelector('[role="status"]').hidden;
    reviewHost.querySelector('button').click();
    result.reviewResumed = reviews === 1;

    // An old confirmation must stay invalid even after cancellation unlocks a new editor.
    collection.querySelector('.drop-item').click();
    const controller = new AbortController();
    release = lock.lockTrackerEdits(controller.signal);
    controller.abort();
    confirm(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    result.oldConfirmationRefused = actor.collections.items[0]?.name === 'Shield' && fixture.writes() === 0;
    result.cancellationUnlocked = !lock.isTrackerEditLocked() && !collection.querySelector('input').disabled;
    collection.querySelector('input').value = 'Spear';
    collection.querySelector('input').dispatchEvent(new Event('change'));
    result.editAfterReading = actor.collections.items[0].name === 'Spear' && fixture.writes() > 0;

    const { buildManualLevelUpSection } = await import(root + 'src/ui/characters/ui-manual-level-up.js');
    globalThis.toastr = { success: () => {}, warning: () => {} };
    let triggers = 0, retries = 0, busy = false, enabled = true, finishTrigger;
    const reward = { id: 'fixture-reward', oldLevel: 1, newLevel: 2, pending: [], failures: [{}] };
    const service = { info: () => ({ enabled }), isBusy: () => busy, records: () => [reward],
        trigger: async () => {
            triggers++; busy = true;
            await new Promise(resolve => { finishTrigger = resolve; });
            busy = false;
            return reward;
        },
        retry: async () => { retries++; },
    };
    const levelUp = buildManualLevelUpSection({ id: 'fixture-npc', name: 'Fixture' }, { service });
    host.appendChild(levelUp);
    const levelButton = levelUp.querySelector('.sillynpc-trigger-level-up');
    const retryButton = levelUp.querySelector('.sillynpc-manual-level-up-retry');
    release = lock.lockTrackerEdits();
    const lateLevelUp = buildManualLevelUpSection({ id: 'fixture-npc', name: 'Fixture' }, { service });
    host.appendChild(lateLevelUp);
    result.levelUpControlsLocked = levelButton.disabled && retryButton.disabled
        && [...lateLevelUp.querySelectorAll('button')].every(button => button.disabled);
    levelButton.dispatchEvent(new Event('click')); retryButton.dispatchEvent(new Event('click'));
    await new Promise(resolve => setTimeout(resolve, 0));
    result.levelUpHandlersRefuse = triggers === 0 && retries === 0;
    release(); release = null;
    result.levelUpControlsResumed = !levelButton.disabled && !retryButton.disabled;
    lateLevelUp.remove();
    levelButton.click();
    release = lock.lockTrackerEdits();
    finishTrigger();
    await new Promise(resolve => setTimeout(resolve, 0));
    result.finishingLevelUpKeepsLock = triggers === 1 && levelButton.disabled && retryButton.disabled;
    release(); release = null;
    result.completedLevelUpResumes = !levelButton.disabled && !retryButton.disabled;
    retryButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    result.retryAfterReading = retries === 1 && !retryButton.disabled;
    release = lock.lockTrackerEdits(); enabled = false;
    release(); release = null;
    result.levelCapStaysDisabled = levelButton.disabled;
} catch (error) {
    result.error = String(error.stack || error);
} finally {
    host.remove();
    release?.();
    globalThis.toastr = savedToastr;
    document.documentElement.setAttribute('data-tracker-edit-lock', JSON.stringify(result));
}
