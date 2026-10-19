import { normalizeSystemDefinition } from './system-schema.js';

const profile = (id, label, targets, guidance = '', multiline = true) => ({ id, label, targets, guidance, multiline });
const number = (id, name, targets, defaultValue, purpose, extra = {}) => ({
    id, name, targets, type: 'number', defaultValue, purpose, min: '0', ...extra,
});
const text = (id, name, targets, purpose, extra = {}) => ({
    id, name, targets, type: 'text', defaultValue: '', purpose, ...extra,
});
const world = (id, name, purpose) => text(id, name, [], purpose);
const field = (id, label, type = 'text', extra = {}) => ({
    id, name: id, label, type, defaultValue: type === 'number' ? 0 : '',
    isPrimary: false, isStatic: type !== 'number', ...extra,
});
const entry = (id, name, targets, guidance, fields, extra = {}) => ({
    id, name, targets, guidance, trackQuantity: false, fields: [
        field('name', 'Name', 'text', { isPrimary: true, isStatic: true }), ...fields,
    ], ...extra,
});
const xp = targets => number('xp', 'XP', targets, '0/100',
    'Experience earned through meaningful challenges, discoveries, and growth in the story.',
    { maxStatValue: '100', guidance: 'Award only XP supported by events in the story.' });
const level = targets => number('level', 'Level', targets, '1',
    'A broad measure of how much this character has grown through experience.',
    { min: '1', locked: true, carryOver: true });
const progression = (enabled, statIds = [], pointsPerLevel = 0) => ({
    enabled, xpFieldId: enabled ? 'xp' : '', levelFieldId: enabled ? 'level' : '',
    pointsPerLevel, assignment: 'manual', statIds,
});
const memories = { enabled: false, guidance: '', interval: 8, maxEntriesPerCharacter: 50 };
const fantasyActors = ['player', 'template:character'];

const fantasy = {
    locations: { enabled: true },
    schemaVersion: 2, id: 'fantasy-adventure', name: 'Fantasy Adventure',
    metadata: { description: 'Characters of every kind, quests, gear, and magic.', author: 'Castward' },
    profiles: [
        profile('background', 'Background', fantasyActors, 'Origin and formative history.'),
        { ...profile('ancestry', 'Ancestry or Species', fantasyActors, 'Brief heritage or species label, whether person or beast.', false),
            includeInImagePrompt: true },
        profile('calling', 'Role', fantasyActors, 'Brief profession or natural role label.', false),
        profile('appearance', 'Appearance', fantasyActors, 'Visible appearance.'),
        profile('motivation', 'Motivation', fantasyActors, 'What this character wants or instinctively seeks.'),
    ],
    npcTemplates: [
        { id: 'character', name: 'Character', description: 'People, beasts, companions, and foes share the same stats.',
            progression: progression(true, ['hp'], 1) },
    ],
    stats: {
        world: [world('time', 'Time', 'The time of day or moment in the story.'),
            world('quest', 'Quest', 'The objective or lead the characters are currently pursuing.')],
        character: [
            number('hp', 'HP', fantasyActors, '12/12',
                'Physical well-being. Wounds lower current HP; healing restores it. Maximum HP reflects lasting resilience.',
                { isPrimary: true, color: '#e03131', carryOver: true }),
            number('mana', 'Mana', fantasyActors, '10/10',
                'Magical energy. Casting spells spends current Mana; rest or magical recovery restores it. Maximum Mana reflects lasting magical capacity.',
                { isPrimary: true, color: '#3b5bdb', carryOver: true }),
            number('armor', 'Armor', fantasyActors, '10',
                'Protection from worn gear, natural hide, or magic. Higher values suggest that a blow is less threatening.',
                { carryOver: true }),
            ...[
                ['strength', 'Strength', 'Physical power used to lift, grapple, break, and strike with force.'],
                ['dexterity', 'Dexterity', 'Agility, balance, quick reactions, and precise movement.'],
                ['constitution', 'Constitution', 'Endurance against exhaustion, illness, harsh conditions, and prolonged effort.'],
                ['intelligence', 'Intelligence', 'Memory, learned knowledge, investigation, and deliberate reasoning.'],
                ['wisdom', 'Wisdom', 'Awareness, intuition, judgment, and attention to subtle details.'],
                ['charisma', 'Charisma', 'Presence and the ability to persuade, inspire, or unsettle others.'],
            ].map(([id, name, purpose]) => number(id, name, fantasyActors, '10',
                `${purpose} Higher values mean greater capability here. Change this lasting trait only when the story establishes a meaningful change.`,
                { carryOver: true, visible: false })),
            text('condition', 'Condition', fantasyActors,
                'Describe injuries, ailments, and other temporary effects in plain words.',
                { defaultValue: 'Healthy' }),
            number('currency', 'Currency', fantasyActors, '0',
                'Money held by this character; change it when the story establishes a gain or expense.',
                { carryOver: true, visible: false }),
            { ...xp(fantasyActors), isPrimary: true, color: '#f59f00' },
            { ...level(fantasyActors), isPrimary: true },
        ],
    },
    collections: [
        entry('equipment', 'Equipment', fantasyActors,
            'Carried gear; change holdings only when the story establishes a transfer.', [
                field('quantity', 'Quantity', 'number', { defaultValue: 1, min: '0', isStatic: false }),
                field('description', 'Description', 'text', { isMultiline: true }),
            ], { trackQuantity: true }),
        entry('abilities', 'Abilities and Spells', fantasyActors,
            'Known abilities, spells, or techniques and any limits established by the story.', [
                field('kind', 'Kind'), field('rank', 'Rank'),
                field('uses', 'Remaining Uses', 'text', { isStatic: false,
                    guidance: 'Optional. Leave blank when the ability has no stated use limit.' }),
                field('effect', 'Effect', 'text', { isMultiline: true }),
            ], { levelUpRewards: { enabled: true, mode: 'guided', interval: 1, schedule: [],
                guidance: 'At a new level, propose a new ability, spell, or technique only when it fits this character’s role, training, and story. Avoid duplicates. Choose no reward when nothing fits; not every character learns magic or gains a new feature at every level.',
            } }),
    ],
    progression: { player: progression(true, ['hp'], 1) }, memories,
    hud: { layout: 'plate', showWorld: true, showNpcPortraits: true,
        playerStatIds: ['hp', 'mana', 'armor', 'condition', 'level', 'xp'],
        npcStatIds: ['hp', 'mana', 'armor', 'condition', 'level', 'xp'], worldStatIds: ['time', 'quest'] },
};

const dating = {
    locations: { enabled: true },
    schemaVersion: 2, id: 'dating-sim', name: 'Dating Sim',
    metadata: { description: 'Relationships, outfits, useful items, and personal memories.', author: 'Castward' },
    profiles: [
        profile('personality', 'Personality', ['player', 'template:character'],
            'Stable traits and social style.'),
        profile('appearance', 'Appearance', ['player', 'template:character'],
            'Visible appearance.'),
        profile('interests', 'Interests', ['player', 'template:character'], 'Interests and favorite activities.'),
        profile('boundaries', 'Boundaries', ['player', 'template:character'],
            'Stated boundaries and preferences; do not infer consent from a score.'),
        profile('aspiration', 'Aspiration', ['player', 'template:character'], 'Longer-term hopes.'),
    ],
    npcTemplates: [
        { id: 'character', name: 'Character', description: 'Every recurring person shares the same relationship fields.',
            progression: progression(false) },
    ],
    stats: {
        world: [world('day', 'Day and Time', 'Current day and time.'),
            world('occasion', 'Occasion', 'Current event or planned date.')],
        character: [
            number('energy', 'Social Energy', ['player'], '10/10', 'Current energy for social activity.',
                { isPrimary: true, color: '#3b5bdb' }),
            text('mood', 'Mood', ['player', 'template:character'],
                'Current emotional state.', { defaultValue: 'Neutral' }),
            number('affection', 'Affection', ['template:character'], '0',
                'Warmth toward the player, based on established interactions.', { maxStatValue: '100', carryOver: true }),
            number('trust', 'Trust', ['template:character'], '0',
                'Trust earned through actions in the story.', { maxStatValue: '100', carryOver: true }),
            number('comfort', 'Comfort', ['template:character'], '0',
                'How comfortable this character currently feels around the player.',
                { maxStatValue: '100', carryOver: true }),
            text('relationship', 'Relationship', ['template:character'],
                'Current relationship in words; change only when events support it.', { carryOver: true }),
        ],
    },
    collections: [
        entry('clothing', 'Clothing', ['player', 'template:character'],
            'Garments currently being worn. Preserve their color and details until the story changes the outfit; remove garments when taken off.', [
                field('slot', 'Garment Type'), field('color', 'Color'),
                field('details', 'Appearance', 'text', { isMultiline: true }),
            ], { includeInImagePrompt: true }),
        entry('items', 'Items', ['player', 'template:character'],
            'Carried belongings, gifts, keepsakes, and useful objects. Change holdings only when the story establishes a transfer.', [
                field('quantity', 'Quantity', 'number', { defaultValue: 1, min: '0', isStatic: false }),
                field('description', 'Description', 'text', { isMultiline: true }),
            ], { trackQuantity: true, includeInImagePrompt: false }),
    ],
    progression: { player: progression(false) },
    memories: { ...memories, enabled: true,
        guidance: 'Keep meaningful shared experiences and changes in relationships as personal memories.' },
    hud: { layout: 'underline', showWorld: true, showNpcPortraits: true,
        playerStatIds: ['energy', 'mood'], npcStatIds: ['affection', 'trust', 'mood', 'relationship'],
        worldStatIds: ['day', 'occasion'] },
};

const creature = {
    locations: { enabled: true },
    schemaVersion: 2, id: 'creature-trainer', name: 'Creature Trainer',
    metadata: { description: 'Trainers, creatures, moves, teams, items, and growing stats.', author: 'Castward' },
    profiles: [
        profile('appearance', 'Appearance', ['player', 'template:trainer', 'template:creature'],
            'Visible appearance.'),
        profile('ambition', 'Ambition', ['player', 'template:trainer'], 'Training goal or personal ambition.'),
        profile('species', 'Species', ['template:creature'], 'Brief creature species or kind label.', false),
        profile('element', 'Element', ['template:creature'], 'One or two elemental affinities.', false),
        profile('ability', 'Ability', ['template:creature'], 'Distinct innate ability, if known.'),
        profile('nature', 'Nature', ['template:creature'], 'Brief temperament or disposition label.', false),
    ],
    npcTemplates: [
        { id: 'trainer', name: 'Trainer', description: 'Rivals, allies, and other human trainers.',
            progression: progression(false) },
        { id: 'creature', name: 'Creature', description: 'A trainable creature with six familiar combat stats.',
            progression: progression(true, ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed'], 2) },
    ],
    stats: {
        world: [world('region', 'Region', 'Current region.'),
            world('objective', 'Objective', 'Current training or travel goal.')],
        character: [
            number('hp', 'HP', ['template:creature'], '10/10', 'Current and maximum HP; the pool can grow on level-up.',
                { maxStatValue: '255', isPrimary: true, color: '#e03131', carryOver: true }),
            ...[
                ['attack', 'Attack'], ['defense', 'Defense'], ['special_attack', 'Special Attack'],
                ['special_defense', 'Special Defense'], ['speed', 'Speed'],
            ].map(([id, name]) => number(id, name, ['template:creature'], '10',
                `${name} rating on a 0–255 scale. Initialize for this creature; level bonuses may raise it.`,
                { maxStatValue: '255', locked: true, carryOver: true, visible: false })),
            text('condition', 'Condition', ['template:creature'], 'Temporary status or ailment.',
                { defaultValue: 'Healthy' }),
            xp(['template:creature']), level(['template:creature']),
        ],
    },
    collections: [
        entry('team', 'Team', ['player', 'template:trainer'],
            'Creatures currently travelling with this trainer.', [
                field('species', 'Species'),
            ]),
        entry('moves', 'Moves', ['template:creature'],
            'Moves this creature has learned; add or replace only when the story establishes it.', [
                field('element', 'Element'), field('category', 'Category'),
                field('power', 'Power', 'number', { isStatic: false }),
                field('uses', 'Remaining Uses', 'number', { isStatic: false }),
            ]),
        entry('items', 'Items', ['player', 'template:trainer'],
            'Carried belongings, useful supplies, keepsakes, and earned awards. Change holdings only when the story establishes a gain, loss, or transfer.', [
                field('quantity', 'Quantity', 'number', { defaultValue: 1, min: '0', isStatic: false }),
                field('description', 'Description', 'text', { isMultiline: true }),
            ], { trackQuantity: true, includeInImagePrompt: false }),
    ],
    progression: { player: progression(false) }, memories,
    hud: { layout: 'pips', showWorld: true, showNpcPortraits: true,
        playerStatIds: [], npcStatIds: ['hp', 'condition', 'level', 'xp'],
        worldStatIds: ['region', 'objective'] },
};

const sources = { fantasy, dating, creature };
export const builtinSystemChoices = Object.freeze(Object.entries(sources).map(([id, source]) => ({
    id, name: source.name, description: source.metadata.description,
})));

/** Return a fresh editable definition; shipped templates never live in user settings. */
export function createBuiltinSystem(id) {
    const source = sources[id];
    return source ? normalizeSystemDefinition(structuredClone(source)) : null;
}
