/** In-memory dialogue/portrait checks; no host saves or model requests. */
export async function checkShortNames(base, settings) {
    const { readDialogueRecords } = await import(base + 'src/chat/dialogue-presentation.js');
    const { injectAtDialogueLines } = await import(base + 'src/chat/chat-speech.js');
    const { clearDecorations } = await import(base + 'src/chat/chat-portraits.js');
    const cards = [
        { id: 'short-name-professor', name: 'Professor Vale', aliases: [] },
        { id: 'short-name-doctor', name: 'Doctor Sen', aliases: [] },
        { id: 'short-name-princess', name: 'Princess Elara', aliases: [] },
        { id: 'short-name-captain', name: 'Captain Rook', aliases: [] },
        { id: 'short-name-full', name: 'Mira Voss', aliases: [] },
    ];
    const beforeCards = JSON.stringify(cards);
    const mes = document.createElement('div'); mes.setAttribute('mesid', '0');
    const container = document.createElement('div'); container.className = 'mes_text'; mes.append(container);
    container.innerHTML = '<p>Vale: "The ridge is still passable."</p>'
        + '<p>Sen: "I will take my bag."</p><p>Elara: "Use the wagons."</p>'
        + '<p>Rook: "My crew will meet you."</p><p>Mira: "I will fetch the horses."</p>';
    const options = { context: { chat: [{ mes: container.textContent }], getCurrentChatId: () => 'short-name-fixture' },
        characters: cards, settings, ignoredLabels: new Set(), personaFor: () => null };
    const read = () => readDialogueRecords(mes, options);
    const lines = read();
    const result = {
        shortDialogueCanonical: lines.length === cards.length && lines.every((line, index) =>
            line.npcId === cards[index].id && line.displayName === cards[index].name),
        shortLabelsPreserved: lines.map(line => line.speakerLabel).join(',') === 'Vale,Sen,Elara,Rook,Mira',
    };
    injectAtDialogueLines(container, cards, () => '/img/ai4.png', false);
    result.shortPortraitsMatch = [...container.querySelectorAll('.sillynpc-chat-avatar')]
        .every((avatar, index) => avatar.dataset.charId === cards[index].id)
        && container.querySelectorAll('.sillynpc-chat-avatar').length === cards.length;
    result.shortDecoratedRead = JSON.stringify(read()) === JSON.stringify(lines);
    clearDecorations(container);
    cards.push({ id: 'short-name-ambiguous', name: 'Doctor Vale', aliases: [] });
    result.ambiguousShortUnresolved = read()[0].npcId === null;
    cards.pop();
    result.shortMatchingNoWrites = JSON.stringify(cards) === beforeCards;
    return result;
}
