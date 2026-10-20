import { makeState } from './gemma-tracker-scenarios.mjs';

// Keep these cases separate from the original frozen benchmark. Each message is
// ordinary two-paragraph narration; the numbers below exist only in prior state
// and scoring expectations, never in the text sent as the latest story message.
export const naturalScenarios = [
    { id: 'dating-restful-night', system: 'dating', startPlace: 'Alex’s apartment', energy: '2/10',
        text: `Alex comes home feeling wrung out after the long evening. The apartment is quiet, and the familiar routine of putting away a coat and making tea helps the noise of the day fade. Alex goes to bed early, falls asleep easily, and sleeps soundly without interruption.

Morning light comes through the curtains. Alex wakes refreshed, clear-headed, and ready to enjoy being around people again. After breakfast and a leisurely shower, Alex lingers over another cup of tea at home, looking forward to seeing June later.`,
        checks: [['appliedPlayerValue', 'Social Energy', '10/10', true], ['noMovement', true], ['noInventoryChanges', true]] },
    { id: 'dating-draining-evening', system: 'dating', startPlace: 'Moonbeam Café', npc: 'June', energy: '9/10',
        text: `The café is crowded and loud enough that Alex has to strain to follow June’s words. A difficult call from work keeps interrupting their conversation. Alex tries to stay present, but each interruption leaves them a little less able to engage. June notices the tired look on Alex’s face and gives them room to sit quietly.

By the time the rain eases, Alex is still at the table, rubbing tired eyes and struggling to focus on even a simple question. June is beside Alex, reading the menu while they take a breather. The two untouched menus lie between them as they listen to the last drops patter against the window.`,
        checks: [['playerDecreased', 'Social Energy', true], ['npcPresent', 'June'], ['noMovement', true], ['noInventoryChanges', true]] },
    { id: 'dating-quiet-control', system: 'dating', startPlace: 'Moonbeam Café', npc: 'June', energy: '6/10',
        text: `Alex and June sit at their usual table while a bus splashes through a puddle outside. June has heard a rumor that the Glasshouse conservatory may close for repairs. She says she would like to see it someday, if the story turns out to be true. Alex listens and turns a page of the magazine already on the table.

The conversation drifts to the weather. They settle into a comfortable silence while the magazine lies open between them. June turns her cup in her hands and wonders what the conservatory's glass roof looks like in the rain. A bus pulls away outside as they continue sitting together.`,
        checks: [['playerUnchanged', 'Social Energy'], ['relationshipUnchanged', 'June', true], ['noMovement', true],
            ['noPlaceCreated', 'Glasshouse', true], ['noInventoryChanges', true]] },
    { id: 'fantasy-cellar-injury', system: 'fantasy', startPlace: 'Rusty Lantern', npc: 'Mira', hp: '12/12',
        text: `The cellar stairs of the Rusty Lantern are slick from a leaking barrel. Alex misses a step and lands hard against the edge of a wooden crate. Pain shoots through the shoulder, and a dark bruise begins to show beneath the torn sleeve. Mira hurries down from the taproom when she hears the crash.

Alex gets back to their feet but favors the injured arm. Mira checks that Alex can walk and stays nearby while they catch their breath. She sets the empty crate upright, and the two of them pause on the cellar steps while dust settles in the lantern light.`,
        checks: [['playerDecreased', 'HP', true], ['npcPresent', 'Mira'], ['noInventoryAddsOrRemoves', true], ['noXp', true]] },
    { id: 'fantasy-wound-treated', system: 'fantasy', startPlace: 'Rusty Lantern', npc: 'Mira', hp: '5/12', condition: 'Wounded',
        text: `Alex sits beside the Rusty Lantern hearth, still hurting from an earlier injury. Mira cleans the wound with warm water and wraps it carefully in fresh linen from her own supplies. The bleeding stops. Alex rests there for most of the afternoon while Mira keeps the fire going and makes sure the bandage stays in place.

When Alex stands, the sharpest pain has eased and moving feels easier than it did before. The wound has begun to heal, although Alex is not fully recovered. Mira puts the leftover linen back in her satchel, then settles beside Alex at the hearth as the fire burns low.`,
        checks: [['playerIncreased', 'HP', true], ['playerBelowCapacity', 'HP', true], ['npcPresent', 'Mira'],
            ['noMovement', true], ['noPlayerInventoryChanges', true], ['noXp', true]] },
    { id: 'fantasy-shared-recovery', system: 'fantasy', startPlace: 'Rusty Lantern', npc: 'Mira', hp: '4/12', npcHp: '6/12',
        text: `Alex and Mira return to their rooms at the Rusty Lantern after a hard journey. Both are sore and nursing old cuts, and neither has much appetite for supper. They sleep deeply through the night while rain moves across the roof and the fire downstairs slowly dies away.

In the morning, Mira stretches without wincing and finds that her cuts have closed. Alex feels just as restored; the aches are gone, the skin has healed, and moving is easy again. They linger upstairs over tea, pleased to have a quiet morning before the road calls them onward.`,
        checks: [['appliedPlayerValue', 'HP', '12/12', true], ['appliedNpcValue', 'Mira', 'HP', '12/12', true],
            ['npcPresent', 'Mira'], ['noInventoryChanges', true], ['noXp', true], ['noNpcXp', 'Mira', true]] },
    { id: 'fantasy-partial-healing', system: 'fantasy', startPlace: 'Rusty Lantern', npc: 'Mira', hp: '3/12', npcHp: '4/12',
        text: `After the road skirmish, Alex and Mira sit together in the Rusty Lantern's quiet back room. Mira washes the grit from Alex's arm and ties a clean bandage around the shallow cut. Alex steadies a lamp while Mira tends the scrape across her own ribs. They pause whenever the work stings, grateful to be someplace warm.

Later, the bleeding has stopped and both can move more comfortably. Alex can use the arm again, and Mira's breathing comes easier, but their wounds remain tender and neither feels ready for another fight. They stay at the table, talking softly while the rain continues outside.`,
        checks: [['playerIncreased', 'HP', true], ['playerBelowCapacity', 'HP', true],
            ['npcAppliedIncreased', 'Mira', 'HP', true], ['npcBelowCapacity', 'Mira', 'HP', true],
            ['npcPresent', 'Mira'], ['noXp', true], ['noNpcXp', 'Mira', true]] },
    { id: 'fantasy-rumor-control', system: 'fantasy', startPlace: 'Rusty Lantern', npc: 'Mira', hp: '8/12',
        text: `Mira tells Alex about an old mill beyond the town. A passing merchant claims the place has a hidden chest, but Mira has never seen it herself and does not know whether the story is true. Alex listens over supper at their table in the Rusty Lantern. The meal was already there when the conversation began.

They talk for a while about whether it would be worth asking the merchant for directions tomorrow. Mira sketches a road in the condensation on her glass, then wipes it away with her thumb. Supper plates remain between them as they linger at the table, watching the tavern's candles burn lower.`,
        checks: [['playerUnchanged', 'HP'], ['noXp', true], ['noMovement', true], ['noPlaceCreated', 'old mill', true],
            ['noInventoryChanges', true], ['npcPresent', 'Mira']] },
];

export function makeNaturalState(scenario, settings) {
    const state = makeState(scenario, settings);
    if (scenario.startPlace) {
        state.locations.records.home.name = scenario.startPlace;
    }
    if (scenario.condition) state.player.stats.Condition = scenario.condition;
    if (scenario.npcHp && state.characters[0]) state.characters[0].stats.HP = scenario.npcHp;
    return state;
}
