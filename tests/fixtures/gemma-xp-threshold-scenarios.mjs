import { roleplayScenarios } from './gemma-tracker-roleplay-scenarios.mjs';

// Same full rescue exchange; only the held XP changes. Score separately from the
// twenty-scene corpus so testing progression does not alter its published baseline.
const rescue = structuredClone(roleplayScenarios.find(scene => scene.id === 'fantasy-courier-rescue'));
export const xpThresholdScenarios = [{ ...rescue, id: 'fantasy-courier-rescue-xp-threshold', xp: '99/100',
    checks: [...rescue.checks, ['appliedPlayerValue', 'Level', '2', true]] }];
