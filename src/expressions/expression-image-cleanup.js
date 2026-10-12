/** Delete only the unique Image Edit output returned to this generation job. */
export async function cleanupExpressionSource(url, { fetch, headers }) {
    if (typeof url !== 'string' || !/^\/user\/images\/image-edit\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i.test(url)) return;
    const response = await fetch('/api/images/delete', {
        method: 'POST', headers: headers(), body: JSON.stringify({ path: url.slice(1) }),
    });
    if (!response.ok && response.status !== 404) throw new Error(`Image cleanup failed (${response.status}).`);
}
