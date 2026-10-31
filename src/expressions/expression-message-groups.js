/** A completed reply gives each NPC one emotion across all their dialogue lines. */
export function expressionMessageGroups(lines, perMessage) {
    if (!perMessage) return lines.map(line => [line]);
    const groups = new Map();
    for (const line of lines) {
        if (!groups.has(line.npcId)) groups.set(line.npcId, []);
        groups.get(line.npcId).push(line);
    }
    return [...groups.values()];
}
