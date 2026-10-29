const root = new URL('../../', import.meta.url);
const hostRoot = new URL('../../../', root);
const result = {};
let container, settings, oldEnabled;
try {
    const { createNpcProfileFollowups } = await import(new URL('src/tracker/extractor/status-profile-followups.js', root));
    const { renderReviewPanel } = await import(new URL('src/ui/tracker/ui-change-review.js', root));
    const { isTrackerEditLocked, lockTrackerEdits } = await import(new URL('src/tracker/tracker-edit-lock.js', root));
    const { getSettings } = await import(new URL('src/core/settings.js', root));
    const { getContext } = await import(new URL('st-context.js', hostRoot));
    const metadata = JSON.stringify(getContext().chatMetadata);
    const { npcProfileFollowups: liveFollowups } = await import(new URL('src/tracker/extractor/status-profile-followups-runtime.js', root));
    const { eventSource } = await import(new URL('events.js', hostRoot));
    const { REVIEW_EVENT } = await import(new URL('src/tracker/status-review.js', root));
    const originalResume = liveFollowups.resume;
    let resumed = false;
    try {
        liveFollowups.resume = id => { resumed = id === -99999; return Promise.resolve({}); };
        await eventSource.emit(REVIEW_EVENT, { messageId: -99999 });
        if (!resumed) throw new Error('The production review event did not resume profile follow-ups');
        result.reviewEventConnected = true;
    } finally { liveFollowups.resume = originalResume; }
    settings = getSettings(); oldEnabled = settings.enabled; settings.enabled = true;
    const response = await fetch(new URL('src/tracker/extractor/status-npc-profiles.js', root));
    const source = (await response.text()).replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export ', '');
    for (const reject of [false, true]) {
        const localSettings = { enabled: true, activeSystem: 'fixture', autoPortraitOnFill: false,
            statusTracker: { enabled: true, autoGenerateNpcProfiles: true } };
        const message = { mes: 'Mira arrives.', swipe_id: 0, extra: { sillynpc_reader_report: { status: 'done' } } };
        const context = { chat: [message], chatMetadata: {}, getCurrentChatId: () => 'unsaved' };
        const state = { player: { name: 'Player' }, characters: [{ name: 'Mira', stats: { HP: '10/10' }, collections: { gear: [] } }] };
        const cards = [];
        let pending = [
            { id: 'hp', kind: 'stat', scope: 'character', actor: 'Mira', label: 'HP', before: '10/10', after: '2/10', risk: 'risky' },
            { id: 'lantern', kind: 'item-add', scope: 'character', actor: 'Mira', label: 'Lantern', collectionId: 'gear', item: { name: 'Lantern' }, after: 'Lantern', risk: 'risky' },
        ];
        let requests = 0, targetChecks = 0;
        const dependencies = {
            getSettings: () => localSettings, getContext: () => context, saveSettings() {}, LOG_PREFIX: '[fixture]',
            profileFieldsForCard: () => [{ id: 'appearance' }], profileFieldValue: (profile, field) => profile[field.id] || '',
            resolveCanonicalName: name => name, loadStateFromMetadata: () => state, mayJoinScene: () => true,
            findCardForName: name => cards.find(card => card.name === name), findCharacterRecord: id => cards.find(card => card.id === id),
            createCharacter: name => { const card = { id: 'fixture-card', name, profile: {} }; cards.push(card); return card; },
            requireLorebook: async () => { targetChecks++; return 'Fixture'; },
            generateLoreContent: async card => {
                requests++;
                if (card.statusOverrides.HP !== (reject ? '10/10' : '6/10')) throw new Error('Unreviewed HP reached profile filling');
                if (card.statusCollections.gear.length !== (reject ? 0 : 1)) throw new Error('Unreviewed gear reached profile filling');
                return { content: 'Appearance: Blue coat' };
            },
            parseGeneratedProfileFields: () => ({ appearance: 'Blue coat' }), syncProfileToLore: async () => {}, triggerReprocess() {},
        };
        const fill = new Function(...Object.keys(dependencies), source + '\nreturn generateNewNpcProfiles;')(...Object.values(dependencies));
        const followups = createNpcProfileFollowups({
            getSettings: () => localSettings, getContext: () => context, getPersona: () => 'fixture',
            latestIndex: () => 0, ruleSignature: () => 'fixture', pendingChanges: () => pending,
            async generate(names, current, signal) {
                const unlock = lockTrackerEdits(signal);
                try { return await fill(names, current, signal); } finally { unlock(); }
            },
        });
        await followups.schedule(0, ['Mira']);
        if (requests || targetChecks || isTrackerEditLocked()) throw new Error('Autofill interrupted pending review');
        container = document.createElement('div'); document.body.append(container);
        let completion;
        renderReviewPanel(container, 0, {
            getPendingChanges: () => pending,
            resolvePendingChanges: (id, accepted) => {
                for (const row of accepted) {
                    if (row.kind === 'stat') state.characters[0].stats.HP = row.after;
                    if (row.kind === 'item-add') state.characters[0].collections.gear.push(row.item);
                }
                pending = [];
                completion = followups.resume(id);
            },
        });
        if (container.querySelectorAll('.sillynpc-review-row').length !== 2) throw new Error('Review rows were not visible');
        if (!reject) {
            for (const checkbox of container.querySelectorAll('.sillynpc-review-toggle')) if (!checkbox.checked) checkbox.click();
            const input = container.querySelector('input.sillynpc-review-to');
            input.value = '6/10'; input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const buttons = container.querySelectorAll('.sillynpc-review-actions button');
        buttons[reject ? 1 : 0].click();
        if (!completion) throw new Error('Review action was blocked');
        await completion;
        if (requests !== 1 || targetChecks !== 1 || cards.length !== 1 || message.extra.sillynpc_reader_report.npcProfiles.status !== 'done') {
            throw new Error('Reviewed profile did not finish');
        }
        if (isTrackerEditLocked()) throw new Error('Tracker remained locked');
        result[reject ? 'discardThenFill' : 'approveEditedSheetThenFill'] = true;
        container.remove(); container = null;
    }
    result.hostMetadataUnchanged = JSON.stringify(getContext().chatMetadata) === metadata;
} catch (error) {
    result.error = String(error) + '\n' + (error.stack || '');
} finally {
    container?.remove();
    if (settings) settings.enabled = oldEnabled;
    document.body.setAttribute('data-profile-review-result', JSON.stringify(result));
}
