// Explicit authoring tool, never run by node --test. Frozen replies are reviewed fixtures.
// node tests/generate-roleplay-scenes.js [--qualitative] [--overwrite]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = new URL(process.argv.includes('--qualitative') ? './fixtures/roleplay/qualitative/' : './fixtures/roleplay/', import.meta.url);
const narratorBytes = readFileSync(new URL('../examples/narrator.json', import.meta.url));
const narrator = JSON.parse(narratorBytes).data;
const endpoint = 'http://127.0.0.1:9931/v1';
const modelsResponse = await fetch(`${endpoint}/models`);
if (!modelsResponse.ok) throw Error(`Models: ${modelsResponse.status}`);
const model = (await modelsResponse.json()).data[0].id;
const files = readdirSync(directory).filter(name => name.endsWith('.json')).sort();
const substitute = text => text.replaceAll('{{user}}', 'Alex')
    .replace(/\{\{random:[^}]+\}\}/g, 'T');
for (const [index, filename] of files.entries()) {
    const path = new URL(filename, directory);
    const scene = JSON.parse(readFileSync(path, 'utf8'));
    if (scene.text && !process.argv.includes('--overwrite')) continue;
    const messages = [
        { role: 'system', content: substitute(narrator.system_prompt) + '\n\n'
            + `Scene direction for this authored evaluation fixture: ${scene.generationBrief}\n`
            + 'Write 180–240 words of natural roleplay prose in 2–4 paragraphs. Use second person for Alex. '
            + 'Do not mention tracker fields, test expectations, or these scene directions. '
            + 'Preserve established clothing and possessions. Do not introduce extra characters just to end the beat. '
            + 'Do not choose Alex’s next action. All characters in these scenes are adults.' },
        ...scene.history, { role: 'user', content: scene.user + '\n\n' + substitute(narrator.post_history_instructions) },
    ];
    const parameters = { temperature: 0.8, top_p: 0.95, seed: 5031337 + index, max_tokens: 1800,
        chat_template_kwargs: { enable_thinking: false } };
    const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, ...parameters, stream: false }),
    });
    if (!response.ok) throw Error(`${scene.id}: ${response.status}: ${await response.text()}`);
    const completion = await response.json();
    const choice = completion.choices?.[0];
    if (choice?.finish_reason !== 'stop' || !choice.message?.content?.trim()) {
        throw Error(`${scene.id}: missing or truncated reply (${choice?.finish_reason})`);
    }
    delete scene.review;
    scene.text = choice.message.content.trim();
    scene.generation = { model, endpoint, generatedAt: new Date().toISOString(),
        narratorSha256: createHash('sha256').update(narratorBytes).digest('hex'),
        parameters, usage: completion.usage, finishReason: choice.finish_reason };
    writeFileSync(path, JSON.stringify(scene, null, 2) + '\n');
    console.log(`${scene.id}: ${scene.text.split(/\s+/).length} words`);
}
