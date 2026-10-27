/** Local estimate only: independent of the chat model and reader connection. */
export function approximateTokens(text) {
    return Math.ceil(String(text ?? '').length / 4);
}
