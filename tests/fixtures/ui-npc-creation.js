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
    const { npcGenerationContract, npcToolParameters } = await import(new URL('src/npc/npc-generation.js', root));
    const { renderCollectionUI } = await import(new URL('src/ui/collections/ui-collection.js', root));
    settings = getSettings();
    context = getContext();
    metadataSnapshot = JSON.stringify(context.chatMetadata);
    saved = { enabled: settings.enabled, npcCreationToolEnabled: settings.npcCreationToolEnabled };
    const tool = ToolManager.tools.find(tool => tool.toFunctionOpenAI().function.name === 'castward_create_npc');
    result.registeredOnStartup = Boolean(tool);
    result.narratorResumes = tool?.stealth === false;
    result.schema = tool?.toFunctionOpenAI().function.parameters.required.includes('nameStyle') === true;
    const toolSchema = tool?.toFunctionOpenAI().function.parameters;
    result.optionalNameSchema = toolSchema.properties.name.type === 'string' && !toolSchema.required.includes('name');
    settings.enabled = false;
    result.masterSwitch = await tool.shouldRegister() === false;
    result.disabledAction = JSON.parse(await tool.invoke({})).ok === false;
    settings.enabled = true;
    settings.npcCreationToolEnabled = false;
    result.featureSwitch = await tool.shouldRegister() === false;
    settings.npcCreationToolEnabled = true;
    result.chatGating = await tool.shouldRegister() === (context.getCurrentChatId() !== undefined);
    toolSchema.properties.npcTemplateId.enum = ['stale-template'];
    await tool.shouldRegister();
    result.templateSchemaRefresh = JSON.stringify(toolSchema.properties.npcTemplateId)
        === JSON.stringify(npcToolParameters(settings).properties.npcTemplateId);
    result.argumentFailure = JSON.parse(await tool.invoke({})).ok === false;

    const view = document.createElement('div');
    renderWritingRulesView(view, () => {});
    result.writingToggle = Boolean(view.querySelector('[data-setting="npcCreationToolEnabled"] input[type="checkbox"]'));

    const localSettings = structuredClone(settings);
    localSettings.activeSystem = '';
    localSettings.statusTracker.presets = {};
    localSettings.statusTracker.npcTemplates = [];
    localSettings.statusTracker.npcStats = [];
    localSettings.statusTracker.collections = [{ id: 'clothes', name: 'Clothes', targets: ['npc'],
        hint: 'Garments currently worn.', trackQuantity: false, fields: [
            { id: 'piece-id', name: 'piece', label: 'Garment', type: 'text', isPrimary: true },
            { id: 'worn-id', name: 'worn', label: 'Worn', type: 'boolean', defaultValue: true },
        ] }];
    const localContext = { getCurrentChatId: () => 'unsaved-npc-probe', chatMetadata: {}, chat: [{ mes: 'Find a ferryman.' }] };
    const cards = [];
    let requests = 0;
    let fixedSchema;
    let namingBrief;
    let lastGeneration;
    const service = createNpcCreationService({
        getSettings: () => localSettings, getContext: () => localContext,
        getCards: () => cards, getChatCards: () => cards,
        getForbiddenNames: () => ['Tovin Reed', ...cards.map(card => card.name)],
        getKnownActor: name => localContext.chatMetadata.sillynpc_status_state?.characters.find(actor => actor.name === name),
        buildContext: () => ({ story: 'A river town.', namingUsedNames: ['Zera', 'Captain B'] }),
        requestFor: () => async options => {
            requests++;
            lastGeneration = options;
            fixedSchema = !Object.hasOwn(options.schema.properties, 'nameCandidates');
            namingBrief = JSON.parse(options.userPrompt).namingBrief;
            const templateId = options.schema.properties.npcTemplateId.enum[0];
            const contract = npcGenerationContract(localSettings, { npcTemplateId: templateId });
            return { ...(!fixedSchema ? { nameCandidates: ['Tovin Reed', 'Beska Venn', 'Daro Rusk', 'Hessa Quill'] } : {}),
                npcTemplateId: templateId, stats: {},
                collections: Object.fromEntries(contract.choices[0].collections.map(collection => [collection.id,
                    collection.id === 'clothes' ? [{ piece: 'Oilskin coat', worn: true }] : [{ name: 'Bite' }]])),
                profile: Object.fromEntries(contract.choices[0].fields.map(field => [field.id, 'A useful ferryman detail.'])) };
        },
        commit: draft => { const card = { id: `unsaved-card-${cards.length}`, ...draft }; cards.push(card); return card; },
        pick: length => length - 1,
    });
    const input = { requestKey: 'unsaved-ferryman', role: 'ferryman', situation: 'A river town', requirements: '', nameStyle: '' };
    const created = JSON.parse(await service.create(input));
    result.randomNameInOutput = created.name === 'Hessa Quill' && created.name === cards[0].name;
    result.namingHints = namingBrief.syllables === 4 && namingBrief.candidateInitials.length === 4
        && new Set(namingBrief.candidateInitials).size === 4 && !namingBrief.candidateInitials.includes('Z')
        && !namingBrief.candidateInitials.includes('C') && namingBrief.guidance.includes('take precedence');
    result.profileInOutput = Object.values(created.profile).every(text => text === 'A useful ferryman detail.');
    result.startingCollections = created.collections.clothes[0].piece === 'Oilskin coat'
        && created.collections.clothes[0].worn === true && cards[0].statusCollections.clothes[0].worn === true;
    const clothingView = document.createElement('div');
    clothingView.innerHTML = renderCollectionUI('clothes', { collections: created.collections }, localSettings.statusTracker, { isEditMode: false });
    result.startingCollectionRendering = clothingView.textContent.includes('Oilskin coat') && clothingView.textContent.includes('Yes');
    result.idempotent = JSON.parse(await service.create(input)).id === created.id && cards.length === 1 && requests === 1;
    result.noSceneMutation = localContext.chatMetadata.sillynpc_status_state === undefined;
    const actor = { name: 'Éowyn', stats: {}, collections: { clothes: [], items: [{ name: 'Sword' }] } };
    localContext.chatMetadata.sillynpc_status_state = { characters: [actor] };
    const fixedInput = { ...input, requestKey: 'unsaved-canon', name: 'Éowyn', requirements: 'Preserve established canon.' };
    const fixed = JSON.parse(await service.create(fixedInput));
    result.fixedNameInOutput = fixed.name === 'Éowyn' && cards[1].name === fixed.name && fixedSchema && namingBrief === undefined;
    result.namedStatePreserved = fixed.collections.items[0].name === 'Sword'
        && cards[1].statusCollections.items !== actor.collections.items && fixed.collections.clothes.length === 0;
    result.namedRetry = JSON.parse(await service.create(fixedInput)).id === fixed.id && requests === 2;
    cards[1].aliases = [{ pattern: 'White Lady', isRegex: false }];
    const alias = JSON.parse(await service.create({ ...fixedInput, requestKey: 'another-key', name: 'White Lady' }));
    result.existingAliasReused = alias.id === fixed.id && alias.name === 'Éowyn' && alias.reused && cards.length === 2 && requests === 2;
    localSettings.activeSystem = 'unsaved-template-system';
    localSettings.statusTracker.presets[localSettings.activeSystem] = { definition: {
        npcTemplates: [{ id: 'person', name: 'Person', description: 'Humanoid people.' },
            { id: 'creature', name: 'Creature', description: 'Wild creatures.' }],
        profiles: [{ id: 'appearance', label: 'Appearance', targets: ['npc'] },
            { id: 'instinct', label: 'Instinct', targets: ['template:creature'] }], stats: { character: [] },
    } };
    localSettings.statusTracker.collections[0].targets = ['template:person'];
    localSettings.statusTracker.collections.push({ id: 'moves', name: 'Moves', targets: ['template:creature'],
        fields: [{ id: 'name', name: 'name', type: 'text', isPrimary: true }] });
    try { await service.create({ ...input, requestKey: 'missing-template' }); result.templateRequired = false; }
    catch (error) { result.templateRequired = error.message.includes('npcTemplateId: required') && requests === 2; }
    const person = JSON.parse(await service.create({ ...input, requestKey: 'new-person', npcTemplateId: 'person' }));
    const body = JSON.parse(lastGeneration.userPrompt);
    result.selectedTemplate = person.npcTemplateId === 'person' && body.templates.length === 1 && body.templates[0].id === 'person';
    result.templateNoiseRemoved = !/"creature"|"instinct"|"moves"/.test(lastGeneration.userPrompt)
        && person.collections.clothes[0].piece === 'Oilskin coat';
    result.hostMetadataUnchanged = JSON.stringify(context.chatMetadata) === metadataSnapshot;
} catch (error) {
    result.error = String(error);
    result.stack = error.stack;
} finally {
    if (saved) Object.assign(settings, saved);
}
document.body.setAttribute('data-npc-creation-result', JSON.stringify(result));
