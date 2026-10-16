import { createBuiltinSystem } from './builtin-systems.js';
import { defaultSettings } from './settings-defaults.js';
import { projectSystemTracker } from './system-schema.js';

/** Seed only a new install; startup adopts the matching preset and binds the open chat. */
export function createInitialSettings() {
    const settings = structuredClone(defaultSettings);
    const definition = createBuiltinSystem('fantasy');
    const name = definition.name;
    Object.assign(settings.statusTracker, projectSystemTracker(definition));
    settings.statusTracker.presets[name] = {
        version: '3.0.0',
        metadata: { name, ...definition.metadata },
        config: {},
        definition,
    };
    return settings;
}
