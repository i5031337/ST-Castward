// Public tracker API; implementations declare their own dependencies.
export { mergeStatValue, resolveMaxValue, promptCeiling, isNumericStat, meterHasCeiling,
    drawsMeter, clampToCeiling, getInitialStatValue } from './stat-value-utils.js';
export { parseMessageForUpdates, splitStatKeyPart } from './status-update-parser.js';

export { sanitizeModelUpdate, describeNpcStatFields } from './status-stat-values.js';
export { getCurrentPersonaKey, getCurrentPersonaName, getPlayerCard, getPlayerImageUrl, createChatPlayerSeed, activatePersona } from './status-persona-state.js';
export { getPersonaData, rememberSwipeBase, restoreProfiles, getSwipeBase, swipeBaseRecord, getProfileBase, snapshotProfiles, recordTurnEffects, refreshTurnBase, initStatusLogic, getChatPersona, rememberChatPersona, restoreChatPersona, restoreChatSystem } from './status-chat-session.js';
export { setSwipeBaseAligner, PERSONA_KEY, hasOpenChat, SYSTEM_KEY, getChatSystem, chatHasStarted } from './status-session-context.js';
export { loadStateFromMetadata, saveStateToMetadata, getHistoryEntries, undoLastChange } from './status-state-storage.js';
export { formatCompactStatus } from './status-status-summary.js';
export { getStatusInstructions, getStatusExample, applyScenePrompt, buildSceneContext, onGenerationStarted } from './status-scene-prompt.js';
export { allowedValues, constrainToOptions, capToLength, constrainToDefinition, findMatchingStatKey } from './status-update-constraints.js';
export { applyUpdate } from './status-apply-update.js';
export { findCardForName, resolveCanonicalName } from './status-character-match.js';
export { CAST_PERSONA, CAST_EXCLUDED, getCastDecisions, setCastDecision, resolvePersonaSpeaker, mayJoinScene } from './status-cast-decisions.js';
export { reconcileScenePresence, registerActiveCharacter, removeActiveCharacter } from './status-scene-presence.js';
export { syncOverrideToActiveState, getMergedItem, updateMasterItem, renameMasterItem, deleteMasterItem, renameCollectionId } from './status-collection-schema.js';
export { statsInSystem } from './status-stat-filter.js';
export { renameStat, renameCollectionField } from './status-stat-schema.js';
export { getActiveSystem, migrateToActiveSystem, setActiveSystem, createSystem, editSystemDetails, duplicateSystem, saveSystemPreset, applySystemPreset, deleteSystemPreset, importSystemPreset } from './status-system-presets.js';
