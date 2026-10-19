// Focused place-tree trials. Keep these separate from the original tracker benchmark.
export const locationTreeScenarios = [
    { id: 'fantasy-new-parent', system: 'fantasy',
        text: 'Alex leaves the Rusty Lantern. Alex arrives in Brackenport, a coastal town. Alex enters the Blue Heron Inn inside Brackenport. The Blue Heron Inn is a tavern within Brackenport. Alex remains inside the Blue Heron Inn.',
        checks: [['placeCreated', 'Brackenport', true], ['placeCreated', 'Blue Heron Inn', true],
            ['placeParent', 'Blue Heron Inn', 'Brackenport', true], ['placeRoot', 'Brackenport', true],
            ['currentPlace', 'Blue Heron Inn', true], ['createdPlaceCount', 2, true]] },
    { id: 'dating-new-root', system: 'dating',
        text: 'Alex leaves Moonbeam Café and arrives inside the Marigold Theater. The theater is a named performance venue with red velvet seats and a small stage. Alex remains inside the Marigold Theater as the lights come up.',
        checks: [['placeCreated', 'Marigold Theater', true], ['placeRoot', 'Marigold Theater', true],
            ['currentPlace', 'Marigold Theater', true], ['createdPlaceCount', 1, true]] },
];

export const naturalLocationTreeScenarios = locationTreeScenarios.map(scenario => ({
    ...scenario,
    id: `${scenario.id}-prose`,
    text: scenario.system === 'fantasy'
        ? `The Rusty Lantern dwindles behind Alex as the road bends toward the coast. By dusk, Brackenport's salt-streaked houses rise around the travelers, and Alex passes beneath the town gate.

Rain is starting when Alex slips into the Blue Heron Inn, a tavern tucked among Brackenport's narrow lanes. Alex settles beside the inn's hearth while water taps against the shutters.`
        : `Rain clings to Alex's coat as they leave Moonbeam Café. Across town, the Marigold Theater glows beneath its old marquee, its doors open for the evening performance.

Alex steps inside the theater. Red velvet seats slope toward a small stage, and the house lights dim as Alex finds a place among the audience.`,
}));

export const mixedLocationTreeScenarios = [
    { id: 'fantasy-parent-mixed', system: 'fantasy', npc: 'Mira',
        text: `The Rusty Lantern fades behind Alex and Mira as they follow the coastal road. At dusk they pass through Brackenport's town gate, with salt-streaked houses crowding the lanes.

They duck into the Blue Heron Inn, a tavern among Brackenport's houses. Alex slips on the wet entry step and scrapes an arm badly enough to bleed. The innkeeper presses a brass key into Alex's hand for a room upstairs; Alex keeps the key. Mira stays beside Alex inside the inn.`,
        checks: [['placeCreated', 'Brackenport', true], ['placeCreated', 'Blue Heron Inn', true],
            ['placeParent', 'Blue Heron Inn', 'Brackenport', true], ['placeRoot', 'Brackenport', true],
            ['currentPlace', 'Blue Heron Inn', true], ['playerDecreased', 'HP', true],
            ['itemAdd', 'equipment', 'brass key', 1, true], ['npcPresent', 'Mira', true], ['noXp', true],
            ['createdPlaceCount', 2, true]] },
    { id: 'dating-root-mixed', system: 'dating', npc: 'June', items: [{ name: 'sunflower', quantity: 2 }],
        text: `Alex and June leave Moonbeam Café in the rain. Across town, the Marigold Theater glows beneath its old marquee, and they hurry through the doors before the performance begins.

Inside the theater, Alex gives June one of the two sunflowers from the bag. June keeps the flower and smiles, feeling closer to Alex. After a long, draining evening, Alex is worn out but stays beside June among the red velvet seats as the house lights dim.`,
        checks: [['placeCreated', 'Marigold Theater', true], ['placeRoot', 'Marigold Theater', true],
            ['currentPlace', 'Marigold Theater', true], ['itemRemove', 'items', 'sunflower', 1, true],
            ['npcItemAdd', 'June', 'items', 'sunflower', 1, true], ['npcIncreased', 'June', 'Affection', true],
            ['playerDecreased', 'Social Energy', true], ['npcPresent', 'June', true],
            ['createdPlaceCount', 1, true]] },
];
