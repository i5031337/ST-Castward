import { createNpcCreationService } from '../../src/npc/npc-creation.js';

export const request = { requestKey: 'dock-ferryman', role: 'ferryman', situation: 'A flooded river crossing',
    requirements: 'Knows about the missing caravan', nameStyle: 'Short river-town names' };
export function settingsFixture() {
    const stats = [
        { id: 'health', name: 'Health', type: 'number', defaultValue: '10/10', min: '0', maxStatValue: '50', targets: ['npc'] },
        { id: 'strength', name: 'Strength', type: 'number', defaultValue: '5', min: '1', maxStatValue: '10', targets: ['npc'] },
        { id: 'level', name: 'Level', type: 'number', defaultValue: '1', min: '1', locked: true, targets: ['npc'] },
        { id: 'xp', name: 'XP', type: 'number', defaultValue: '0/100', min: '0', maxStatValue: '100', targets: ['npc'] },
        { id: 'mood', name: 'Mood', type: 'text', options: ['Calm', 'Worried'], targets: ['npc'] },
    ];
    const template = { id: 'human', name: 'Human', progression: { enabled: true, xpFieldId: 'xp', levelFieldId: 'level' } };
    return { enabled: true, npcCreationToolEnabled: true, activeSystem: 'River', loreProfileId: '', loreMaxTokens: 2048,
        statusTracker: { npcStats: stats, npcTemplates: [template], presets: { River: { definition: {
            profiles: [{ id: 'appearance', label: 'Appearance', targets: ['npc'] },
                { id: 'motive', label: 'Motive', targets: ['npc'] },
                { id: 'player-only', label: 'Player secret', targets: ['player'] }],
            stats: { character: stats }, npcTemplates: [template],
        } } } } };
}
export function generated() {
    return { nameCandidates: ['Tovin Reed', 'Beska Venn', 'Daro Rusk', 'Hessa Quill'],
        npcTemplateId: 'human', profile: { appearance: 'A compact figure in patched oilskins.', motive: 'They want to buy back a family boat.' },
        stats: { Health: '12/12', Strength: '6', Level: '2', XP: '0/100', Mood: 'Calm' }, collections: {} };
}
export function fixture({ beforeCreate } = {}) {
    const settings = settingsFixture();
    let context = { getCurrentChatId: () => 'chat', chatMetadata: {}, chat: [{ is_user: true, mes: 'Cross the river.' }] };
    const cards = [], world = [], calls = [];
    let generate = async options => {
        const raw = generated();
        if (!options.schema.properties.nameCandidates) delete raw.nameCandidates;
        return raw;
    };
    let afterCommit = async () => {};
    const service = createNpcCreationService({
        getSettings: () => settings, getContext: () => context,
        getCards: () => [...cards, ...world], getChatCards: () => cards,
        getForbiddenNames: () => ['Tovin Reed', ...cards.map(card => card.name), ...world.map(card => card.name)],
        getReservedNames: () => ['Player', 'Narrator'],
        getKnownActor: name => context.chatMetadata.sillynpc_status_state?.characters
            ?.find(actor => actor.name.toLowerCase() === name.toLowerCase()),
        buildContext: () => ({ story: 'A river crossing.' }),
        requestFor: () => async options => { calls.push(options); return generate(options); },
        commit: draft => { const card = { id: `card-${cards.length}`, ...draft }; cards.push(card); return card; },
        beforeCreate,
        afterCommit: (...args) => afterCommit(...args), pick: length => length - 1,
    });
    return { settings, cards, world, calls, service, get context() { return context; },
        switchChat: () => { context = { ...context, getCurrentChatId: () => 'other', chatMetadata: {} }; },
        setGenerate: fn => { generate = fn; }, setAfterCommit: fn => { afterCommit = fn; } };
}

