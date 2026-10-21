const root = new URL('../../', import.meta.url);
const host = new URL('../../../', root);
const result = {};
let settings, saved, context, metadataSnapshot;
try {
    const { getSettings } = await import(new URL('src/core/settings.js', root));
    const { getContext } = await import(new URL('st-context.js', host));
    const { ToolManager } = await import(new URL('tool-calling.js', host));
    const { renderWritingRulesView } = await import(new URL('src/ui/settings/ui-settings-writing.js', root));
    const { createNpcCreationService } = await import(new URL('src/npc/npc-creation.js', root));
    const { npcGenerationContract } = await import(new URL('src/npc/npc-generation.js', root));
    settings = getSettings();
    context = getContext();
    metadataSnapshot = JSON.stringify(context.chatMetadata);
    saved = { enabled: settings.enabled, npcCreationToolEnabled: settings.npcCreationToolEnabled };
    const tool = ToolManager.tools.find(tool => tool.toFunctionOpenAI().function.name === 'castward_create_npc');
    result.registeredOnStartup = Boolean(tool);
    result.narratorResumes = tool?.stealth === false;
    result.schema = tool?.toFunctionOpenAI().function.parameters.required.includes('nameStyle') === true;
    settings.enabled = false;
    result.masterSwitch = await tool.shouldRegister() === false;
    result.disabledAction = JSON.parse(await tool.invoke({})).ok === false;
    settings.enabled = true;
    settings.npcCreationToolEnabled = false;
    result.featureSwitch = await tool.shouldRegister() === false;
    settings.npcCreationToolEnabled = true;
    result.chatGating = await tool.shouldRegister() === (context.getCurrentChatId() !== undefined);
    result.argumentFailure = JSON.parse(await tool.invoke({})).ok === false;

    const view = document.createElement('div');
    renderWritingRulesView(view, () => {});
    result.writingToggle = Boolean(view.querySelector('[data-setting="npcCreationToolEnabled"] input[type="checkbox"]'));

    const localSettings = structuredClone(settings);
    localSettings.activeSystem = '';
    localSettings.statusTracker.presets = {};
    localSettings.statusTracker.npcTemplates = [];
    localSettings.statusTracker.npcStats = [];
    const localContext = { getCurrentChatId: () => 'unsaved-npc-probe', chatMetadata: {}, chat: [{ mes: 'Find a ferryman.' }] };
    const cards = [];
    let requests = 0;
    const service = createNpcCreationService({
        getSettings: () => localSettings, getContext: () => localContext,
        getCards: () => cards, getChatCards: () => cards,
        getForbiddenNames: () => ['Tovin Reed', ...cards.map(card => card.name)],
        buildContext: () => ({ story: 'A river town.' }),
        requestFor: () => async () => {
            requests++;
            const contract = npcGenerationContract(localSettings);
            return { nameCandidates: ['Tovin Reed', 'Beska Venn', 'Orrel Pike', 'Nessa Marr', 'Perrin Holt', 'Ulla Fen', 'Daro Rusk', 'Hessa Quill'],
                npcTemplateId: '', stats: {}, profile: Object.fromEntries(contract.choices[0].fields.map(field => [field.id, 'A useful ferryman detail.'])) };
        },
        commit: draft => { const card = { id: 'unsaved-card', ...draft }; cards.push(card); return card; },
        pick: length => length - 1,
    });
    const input = { requestKey: 'unsaved-ferryman', role: 'ferryman', situation: 'A river town', requirements: '', nameStyle: '' };
    const created = JSON.parse(await service.create(input));
    result.randomNameInOutput = created.name === 'Hessa Quill' && created.name === cards[0].name;
    result.profileInOutput = Object.values(created.profile).every(text => text === 'A useful ferryman detail.');
    result.idempotent = JSON.parse(await service.create(input)).id === created.id && cards.length === 1 && requests === 1;
    result.noSceneMutation = localContext.chatMetadata.sillynpc_status_state === undefined;
    result.hostMetadataUnchanged = JSON.stringify(context.chatMetadata) === metadataSnapshot;
} catch (error) {
    result.error = String(error);
    result.stack = error.stack;
} finally {
    if (saved) Object.assign(settings, saved);
}
document.body.setAttribute('data-npc-creation-result', JSON.stringify(result));
