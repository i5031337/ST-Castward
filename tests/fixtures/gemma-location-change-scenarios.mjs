import { scenarios, makeState } from './gemma-tracker-scenarios.mjs';
import { mixedLocationTreeScenarios } from './gemma-location-tree-scenarios.mjs';

const placeChecks = new Set(['placeCreated', 'currentPlace', 'placeParent', 'placeRoot',
    'createdPlaceCount', 'noMovement', 'noPlaceCreated']);
const flag = moved => ['locationFlag', moved ? 'yes' : 'no', true];
const moving = new Set(['fantasy-travel', 'dating-travel']);
// Preserve ordinary stat/inventory checks while replacing the old place-detail contract.
export const locationChangeScenarios = [
    ...scenarios.map(scene => ({ ...scene, checks: [flag(moving.has(scene.id)),
        ...scene.checks.filter(([name]) => !placeChecks.has(name))] })),
    ...mixedLocationTreeScenarios.map(scene => ({ ...scene, checks: [flag(true),
        ...scene.checks.filter(([name]) => !placeChecks.has(name))] })),
    { id: 'alias-stay', system: 'fantasy', npc: 'Mira', aliases: ['the Lantern'],
        text: 'Alex and Mira remain at the Lantern. Mira calls the inn by its familiar shortened name while Alex finishes breakfast.', moved: false },
    { id: 'room-arrival', system: 'fantasy', npc: 'Mira',
        text: 'Alex and Mira leave the Rusty Lantern main hall and climb upstairs. They enter the rented bedroom, close its door, and settle down inside.', moved: true },
    { id: 'same-room-movement', system: 'dating', npc: 'June',
        text: 'Alex and June move from their table to the counter inside Moonbeam Café. Alex stays inside the café while June orders another tea.', moved: false },
    { id: 'departure-unknown', system: 'fantasy', npc: 'Mira',
        text: 'Alex and Mira leave the Rusty Lantern behind. They set off along the road and are still travelling when the sun sets. Their destination remains undecided.', moved: true },
    { id: 'invitation-threshold', system: 'dating', npc: 'June',
        text: 'From their table inside Moonbeam Café, June points toward the theater. "Come with me tonight," she says. Alex agrees to consider it and stays seated.', moved: false },
    { id: 'npc-departs-alone', system: 'fantasy', npc: 'Mira',
        text: 'Mira leaves the Rusty Lantern and walks to the market. Alex stays at the inn, quietly sorting the pack beside the hearth.', moved: false },
    { id: 'return-to-same-place', system: 'dating', npc: 'June',
        text: 'Alex and June leave Moonbeam Café, walk around the block, and return to their original table inside Moonbeam Café. They are back where they started.', moved: false },
    { id: 'implicit-arrival', system: 'dating', npc: 'June',
        text: 'The café is several streets behind them now. Alex and June settle into red velvet seats beneath the Marigold Theater balcony as the curtain rises.', moved: true },
    { id: 'second-person-arrival', system: 'fantasy', npc: 'Mira',
        text: 'You follow Mira out of the Rusty Lantern and across the square. Inside the apothecary, you set your pack on the counter while Mira waits beside you.', moved: true },
    { id: 'known-place-description', system: 'fantasy', npc: 'Mira',
        text: 'At the Rusty Lantern table, Mira explains that the Old Mill stands beside the river and has a collapsed waterwheel. Alex listens, still sitting across from her.', moved: false },
].map(scene => scene.checks ? scene : { ...scene, checks: [flag(scene.moved)] });

export function makeLocationChangeState(scene, settings) {
    const state = makeState(scene, settings);
    if (scene.aliases) state.locations.records.home.aliases = scene.aliases;
    return state;
}
