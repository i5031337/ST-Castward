/** Independent full-body display; native Expressions retains its own holders. */
export function clearSpeechSprite() {
    document.getElementById('sillynpc-speech-sprite')?.remove();
}

export function showSpeechSprite(card, path, fallback, unit) {
    clearSpeechSprite();
    const source = path || card.imageUrl;
    if (!source) return;
    const holder = document.createElement('div');
    holder.id = 'sillynpc-speech-sprite';
    holder.dataset.npcId = card.id;
    holder.dataset.lineIndex = unit.dialogueLineIndex;
    holder.setAttribute('aria-label', `${card.name} speaking`);
    const image = document.createElement('img');
    image.alt = card.name;
    const sources = [...new Set([source, fallback, card.imageUrl].filter(Boolean))];
    let index = 0;
    image.onerror = () => {
        if (++index < sources.length) image.src = sources[index];
        else holder.remove();
    };
    image.src = sources[0];
    holder.append(image);
    document.body.append(holder);
}
