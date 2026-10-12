const nameKey = value => String(value || '').trim().toLowerCase();
const matchesName = (card, value) => {
    const name = nameKey(value);
    if (!name) return false;
    if (nameKey(card.name) === name) return true;
    return (card.aliases || []).some(alias => {
        const pattern = typeof alias === 'string' ? alias : alias?.pattern;
        if (!pattern) return false;
        if (!alias.isRegex) return nameKey(pattern) === name;
        try { return new RegExp(`^(?:${pattern})$`, 'iu').test(String(value).trim()); }
        catch { return false; }
    });
};

/** The tracker scene, rather than the whole chat library, defines who is present. */
export function presentSpriteCards(cards, state) {
    const actors = state?.characters || [];
    const player = nameKey(state?.player?.name);
    return cards.filter(card => {
        return !matchesName(card, player) && actors.some(actor => actor.id === card.id || matchesName(card, actor.name));
    });
}

export function validLatestSprite(card, record, sourceFor) {
    const config = card.presentation?.expressions;
    return record && record.reference === card.imageUrl && record.folder === config?.spriteFolder
        && typeof record.path === 'string' && record.path.startsWith('/characters/')
        && (record.source === null || record.source === sourceFor(record.messageId));
}

/** An older line's slow image must not displace a newer expression. */
export function mayRememberSprite(previous, next, sourceFor) {
    if (!previous || previous.reference !== next.reference || previous.folder !== next.folder
        || (previous.source !== null && previous.source !== sourceFor(previous.messageId))) return true;
    return next.messageId > previous.messageId
        || (next.messageId === previous.messageId && next.lineIndex >= previous.lineIndex);
}

/** Existing packs predate saved selections; the host includes modification times in sprite URLs. */
export function latestPackSprite(sprites, fallback = 'neutral') {
    const dated = sprites.map(sprite => ({ ...sprite, modified: Number(sprite.path.match(/[?&]t=(\d{14})(?:&|$)/)?.[1]) || 0 }))
        .filter(sprite => sprite.modified).sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
    return dated[0]?.path || sprites.find(sprite => sprite.label === fallback)?.path
        || [...sprites].sort((a, b) => a.path.localeCompare(b.path))[0]?.path || '';
}
