import { readFileSync, readdirSync } from 'node:fs';
import { makeState } from './gemma-tracker-scenarios.mjs';

// Prior history is context already reflected in state. The final player action has
// not been read yet; it and text form the exchange whose consequences are scored.
function loadScenes(relative) {
    const directory = new URL(relative, import.meta.url);
    return readdirSync(directory).filter(name => name.endsWith('.json')).sort().map(name => {
        const scene = JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
        return { ...scene, earlier: [...scene.history.map(message =>
            `[${message.role === 'user' ? 'Player (Alex)' : 'Narrator'}] ${message.content}`), `[Player (Alex)] ${scene.user}`] };
    });
}
export const roleplayScenarios = loadScenes('./roleplay/');
export const qualitativeScenarios = loadScenes('./roleplay/qualitative/');

export function makeRoleplayState(scenario, settings) {
    const state = makeState(scenario, settings);
    Object.assign(state.global, scenario.globalStats);
    Object.assign(state.player.stats, scenario.playerStats);
    state.locations.records.home.name = scenario.startPlace;
    if (scenario.system === 'fantasy') {
        delete state.player.collections.clothing;
        state.player.collections.abilities = structuredClone(scenario.abilities || []);
    }
    if (state.characters[0]) {
        Object.assign(state.characters[0].stats, scenario.npcStats);
        state.characters[0].collections = structuredClone(scenario.npcCollections || {});
    }
    if (scenario.offstage) state.characters = [];
    return state;
}
