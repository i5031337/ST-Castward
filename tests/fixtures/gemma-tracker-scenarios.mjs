// Predefined before baseline inference. Holdouts exercise different names/events without tuning.
export const criteria = { validJsonAndNotTruncated: 1, overallRequiredCheckRate: 0.90,
    perSystemRequiredCheckRate: 0.85, criticalFailuresAllowed: 0 };
const place = (id, name, description = '') => ({ id, name, description, aliases: [], parentId: '' });
export const scenarios = [
    { id: 'fantasy-opening', system: 'fantasy', opening: true,
        text: 'You are seated inside the Rusty Lantern tavern in the town of Briar Glen. Copper lamps hang above its oak tables. Mira, the human innkeeper, greets you: "Welcome, Alex." It is morning.',
        checks: [['placeCreated', 'Rusty Lantern', true], ['currentPlace', 'Rusty Lantern', true], ['npcPresent', 'Mira'], ['noXp', true]] },
    { id: 'fantasy-battle', system: 'fantasy', npc: 'Mira', xp: '90/100',
        text: 'Inside the Rusty Lantern, the trapped cellar door snaps against Alex, dealing 3 HP of damage. Alex frees the trapped courier and earns 20 XP. Mira remains beside Alex, unharmed. The rescue is complete; Alex picks up two red healing potions, each a small glass bottle that restores health. No one travels anywhere.',
        checks: [['playerValue', 'HP', '9/12'], ['playerValue', 'XP', '110/100'], ['itemAdd', 'equipment', 'red healing potion', 2], ['npcPresent', 'Mira'], ['noMovement', true]] },
    { id: 'fantasy-travel', system: 'fantasy', npc: 'Mira',
        text: 'Alex leaves the Rusty Lantern with Mira and arrives inside the Old Mill. Broken wooden gears cover the dusty floor. Both stand in the mill now. Alex drinks one of the three red healing potions in the pack; the draught restores 2 HP. The other two bottles remain in the pack.', hp: '7/12', items: [{ name: 'red healing potion', quantity: 3 }],
        checks: [['placeCreated', 'Old Mill', true], ['currentPlace', 'Old Mill', true], ['playerValue', 'HP', '9/12'], ['itemRemove', 'equipment', 'red healing potion', 1], ['npcPresent', 'Mira']] },
    { id: 'fantasy-rumour', system: 'fantasy', npc: 'Mira', items: [{ name: 'red healing potion', quantity: 3 }],
        text: 'Mira stays at the table with Alex in the Rusty Lantern. "They say the Old Mill burned down, but nobody knows if that is true. We might go there tomorrow. Do you still have those three red healing potions?" she asks. Alex simply nods; no items change hands, no one drinks anything, and no one leaves.',
        checks: [['noMovement', true], ['noPlaceCreated', 'Old Mill', true], ['noInventoryChanges', true], ['noXp', true], ['npcPresent', 'Mira']] },
    { id: 'dating-opening', system: 'dating', opening: true,
        text: 'You sit inside Moonbeam Café in the Riverside district. Blue tile lines the counter and rain taps its tall windows. June, a human university student, sits across from you. "Nice to finally meet you, Alex," she says. It is Saturday afternoon.',
        checks: [['placeCreated', 'Moonbeam Café', true], ['currentPlace', 'Moonbeam Café', true], ['npcPresent', 'June'], ['noInventoryChanges', true]] },
    { id: 'dating-gift', system: 'dating', npc: 'June', items: [{ name: 'sunflower', quantity: 3 }],
        text: 'Still seated inside Moonbeam Café, Alex gives June one of the three sunflowers from the bag. June keeps the bright yellow flower. "You remembered my favorite. I feel much closer to you now," she says, smiling warmly. Alex feels happy, though the long conversation costs 2 Social Energy. No one leaves.',
        checks: [['itemRemove', 'items', 'sunflower', 1], ['npcItemAdd', 'June', 'items', 'sunflower', 1], ['playerValue', 'Social Energy', '8/10'], ['npcIncreased', 'June', 'Affection'], ['noMovement', true]] },
    { id: 'dating-travel', system: 'dating', npc: 'June',
        text: 'Alex and June leave Moonbeam Café and arrive inside the Glasshouse conservatory. Ferns surround a stone fountain beneath the glass roof. June stays beside Alex. Alex slips off the blue wool scarf and puts it in the bag, keeping the white shirt on. They have not agreed to become partners.', clothing: [{ name: 'blue wool scarf', color: 'blue', slot: 'scarf' }, { name: 'white shirt', color: 'white', slot: 'shirt' }],
        checks: [['placeCreated', 'Glasshouse', true], ['currentPlace', 'Glasshouse', true], ['itemRemove', 'clothing', 'blue wool scarf'], ['notRemoved', 'clothing', 'white shirt', true], ['relationshipUnchanged', 'June', true]] },
    { id: 'dating-plan', system: 'dating', npc: 'June', items: [{ name: 'concert ticket', quantity: 2 }],
        text: 'June and Alex remain at their Moonbeam Café table. "Maybe we could visit the Glasshouse next week," June says. "I heard its fountain broke, though that could be gossip. Are you thinking of giving me a concert ticket?" Alex says, "I have not decided." The two tickets stay in Alex’s bag. Nothing is exchanged.',
        checks: [['noMovement', true], ['noPlaceCreated', 'Glasshouse', true], ['noInventoryChanges', true], ['relationshipUnchanged', 'June', true], ['npcPresent', 'June']] },
    { id: 'fantasy-holdout-opening', system: 'fantasy', holdout: true, opening: true,
        text: 'Alex stands inside Emberwatch Keep, a fortress in Ashvale. A cracked stone hearth warms the guardroom. Captain Rowan, a human guard, stands beside Alex. "You are safe here," Rowan says. Dusk has fallen.',
        checks: [['placeCreated', 'Emberwatch Keep', true], ['currentPlace', 'Emberwatch Keep', true], ['npcPresent', 'Rowan'], ['noXp', true]] },
    { id: 'fantasy-holdout-cost', system: 'fantasy', holdout: true, npc: 'Mira',
        earlier: ['[Narrator] If Alex casts Spark, it will drain 2 HP. Alex has not cast it yet.'],
        text: 'Alex stays at the Rusty Lantern table beside Mira. "I might cast Spark later, but not now," Alex says. Mira mentions a silver key she saw yesterday, but neither of them obtains it. They rest quietly.',
        checks: [['playerValue', 'HP', '12/12'], ['noInventoryChanges', true], ['noXp', true], ['noMovement', true], ['npcPresent', 'Mira']] },
    { id: 'dating-holdout-opening', system: 'dating', holdout: true, opening: true,
        text: 'Alex is inside the Paper Crane bookstore on Linden Street. Green reading lamps light shelves of used novels. Sam, a human librarian, stands across the counter. "Hello, Alex," Sam says. It is Monday morning.',
        checks: [['placeCreated', 'Paper Crane', true], ['currentPlace', 'Paper Crane', true], ['npcPresent', 'Sam'], ['noInventoryChanges', true]] },
    { id: 'dating-holdout-drink', system: 'dating', holdout: true, npc: 'June', items: [{ name: 'mint candy', quantity: 4 }],
        text: 'Alex remains at Moonbeam Café with June and eats two of the four mint candies from the bag, leaving two. June quietly reads her own book; nothing about their relationship changes. After a quiet rest, Alex recovers 1 Social Energy.', energy: '6/10',
        checks: [['itemRemove', 'items', 'mint candy', 2], ['playerValue', 'Social Energy', '7/10'], ['relationshipUnchanged', 'June', true], ['noMovement', true], ['npcPresent', 'June']] },
];
export function makeState(scenario, settings) {
    const defaults = defs => Object.fromEntries(defs.map(def => [def.name, String(def.defaultValue ?? '')]));
    const name = scenario.system === 'fantasy' ? 'Rusty Lantern' : 'Moonbeam Café';
    return { global: defaults(settings.globalStats),
        player: { stats: { ...defaults(settings.playerStats), ...(scenario.hp ? { HP: scenario.hp } : {}),
            ...(scenario.xp ? { XP: scenario.xp } : {}), ...(scenario.energy ? { 'Social Energy': scenario.energy } : {}) },
            collections: { [scenario.system === 'fantasy' ? 'equipment' : 'items']: scenario.items || [], clothing: scenario.clothing || [] } },
        characters: scenario.npc ? [{ name: scenario.npc, npcTemplateId: 'character', stats: { ...defaults(settings.npcStats),
            ...(scenario.system === 'dating' ? { Affection: '15', Trust: '10', Comfort: '20', Relationship: 'Friends' } : {}) }, collections: {} }] : [],
        locations: { enabled: true, currentId: scenario.opening ? '' : 'home', records: scenario.opening ? {} : { home: place('home', name) } } };
}
