const statRules = fields => fields?.map(({ format, visible, isPrimary, color, ...rules }) => rules);

/** Compare the rules behind a reading, without invalidating it for display changes. */
export function readerRuleSignature(settings) {
    const tracker = settings.statusTracker;
    const system = tracker.presets?.[settings.activeSystem]?.definition;
    return JSON.stringify({
        system: system && { stats: Object.fromEntries(Object.entries(system.stats || {})
            .map(([scope, fields]) => [scope, statRules(fields)])),
        npcTemplates: system.npcTemplates, collections: system.collections,
        progression: system.progression, locations: system.locations },
        globalStats: statRules(tracker.globalStats), playerStats: statRules(tracker.playerStats),
        npcStats: statRules(tracker.npcStats), npcTemplates: tracker.npcTemplates,
        collections: tracker.collections, progression: tracker.progression, locations: tracker.locations,
    });
}

/** Capture after focused edits settle and before constructing the model request. */
export function captureReaderRules(getSettings) {
    const rules = readerRuleSignature(getSettings());
    return () => readerRuleSignature(getSettings()) === rules;
}
