// Evidence and expected outcomes are fixed before any model response is inspected.
export const profileScenarios = [
    {
        id: 'fantasy-fill-story', system: 'fantasy-adventure', path: 'fill', name: 'Mara',
        story: 'Narrator: Alex meets Mara at Iron Hollow. Mara is a dwarf smith with a soot-dark braid and a scar over her left eyebrow. She says the flood destroyed her family forge. Mara now repairs the bridge each morning because she wants the valley connected again. Alex says he is an elven herbalist with silver hair.',
        lore: '', facts: 'HP: 9/12, Armor: 8', profile: {},
        checks: [
            ['ancestry', ['dwarf']], ['calling', ['smith']], ['appearance', ['braid', 'scar']],
            ['background', ['flood', 'forge']], ['motivation', ['bridge', 'valley']],
            ['avoid', ['herbalist', 'silver hair', 'elf']],
        ],
    },
    {
        id: 'fantasy-fill-lore', system: 'fantasy-adventure', path: 'fill', name: 'Tamsin',
        story: '',
        lore: 'Tamsin is a human mapmaker from Blackpine. She lost her right hand in a winter avalanche and now wears a brass prosthetic. She hopes to chart a safe pass through the mountains.',
        facts: 'Intelligence: 13, Equipment: brass prosthetic',
        profile: { background: 'Born in Blackpine.' },
        checks: [
            ['preserved', 'background', 'Born in Blackpine.'], ['ancestry', ['human']],
            ['calling', ['mapmaker']], ['appearance', ['brass', 'prosthetic']],
            ['motivation', ['pass', 'mountain']],
        ],
    },
    {
        id: 'dating-fill-story', system: 'dating-sim', path: 'fill', name: 'Nia',
        story: 'Narrator: Alex meets Nia at the cafe. Nia wears amber glasses and a green cardigan. She speaks softly, waits for others to finish, and sketches birds in her notebook every afternoon. Nia asks Alex not to photograph her. She says she hopes to open a pottery studio. Alex talks about his own love of hiking.',
        lore: '', facts: 'Mood: Calm, Affection: 4', profile: {},
        checks: [
            ['appearance', ['amber', 'glasses']], ['personality', ['soft', 'quiet', 'listen', 'patient']],
            ['interests', ['sketch', 'birds']], ['boundaries', ['photo', 'photograph']],
            ['aspiration', ['pottery', 'studio']], ['avoid', ['hiking']],
        ],
    },
    {
        id: 'dating-fill-lore', system: 'dating-sim', path: 'fill', name: 'Priya',
        story: '',
        lore: 'Priya spends weekends studying tide pools. She asks visitors to text before coming over and hopes to become a veterinarian. Her appearance has never been described.',
        facts: 'Trust: 12, Relationship: Acquaintance',
        profile: { personality: 'Dry wit, careful with strangers.' },
        checks: [
            ['preserved', 'personality', 'Dry wit, careful with strangers.'],
            ['interests', ['tide', 'pool']], ['boundaries', ['text', 'visit']],
            ['aspiration', ['veterinarian']], ['omitted', 'appearance'],
        ],
    },
    {
        id: 'fantasy-auto-new-npc', system: 'fantasy-adventure', path: 'auto', name: 'Orin',
        story: 'Narrator: Orin the halfling scout enters the camp. He has a red cloak and one silver earring. Orin grew up among river barges and seeks his missing sister. Alex, the player, is a tall human soldier.',
        lore: '', facts: 'HP: 8/8, Equipment: red cloak', profile: {},
        checks: [
            ['ancestry', ['halfling']], ['calling', ['scout']], ['appearance', ['red cloak', 'earring']],
            ['background', ['river', 'barge']], ['motivation', ['sister']],
            ['avoid', ['soldier']],
        ],
    },
    {
        id: 'dating-auto-new-npc', system: 'dating-sim', path: 'auto', name: 'Elena',
        story: 'Narrator: Elena joins Alex at the bookstore. Elena wears a blue denim jacket. She is outspoken but listens when corrected. She collects old train tickets and dreams of opening a secondhand bookshop. Elena tells Alex that surprise visits make her uncomfortable.',
        lore: '', facts: 'Mood: Curious, Trust: 3', profile: {},
        checks: [
            ['appearance', ['denim', 'jacket']], ['personality', ['outspoken', 'listen']],
            ['interests', ['train', 'ticket']], ['boundaries', ['surprise', 'visit']],
            ['aspiration', ['bookshop']],
        ],
    },
];

export const profileCriteria = {
    allResponsesReadable: true,
    overallRequiredCheckRate: 0.85,
    perPathRequiredCheckRate: 0.8,
    perSystemRequiredCheckRate: 0.8,
    critical: ['preserved', 'omitted', 'avoid'],
};
