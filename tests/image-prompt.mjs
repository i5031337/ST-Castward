import { startActivity } from '../src/core/generation-activity.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { characterImageDescription } from '../src/api/api-image-description.js';
import { setProfileSettingsProvider } from '../src/core/profile-fields.js';
import { normalizeSystemDefinition } from '../src/core/system-schema.js';
import { profileSchema } from '../src/generation/contracts.js';
import { validateShape } from '../src/generation/validate-shape.js';
import { imageItemsFromCollections } from '../src/api/api-image-items.js';

const source = readFileSync(new URL('../src/api/api-image-generate.js', import.meta.url), 'utf8')
    .split('function imageUrlFromResult')[0].replace(/^import .*;\n/gm, '').replaceAll('export ', '');
function fixture() {
    const calls = [];
    const settings = { imgGenPromptPrefix: '' };
    const dependencies = {
        getSettings: () => settings,
        resolveImagePrompt: () => '{{name}} | {{lore}} | {{items}}',
        fillImagePrompt: (template, values) => template.replace(/{{(\w+)}}/g, (_, key) => values[key]),
        describeImageCollections: () => 'Clothing: Red coat',
        characterImageDescription: () => 'Species: Elf',
        loadWorldInfo: async () => ({ entries: [{ uid: 1, content: 'Lore' }] }),
        debugLog() {},
        generateImage: async (prompt, options) => { calls.push({ prompt, options }); return '/portrait.png'; },
    };
    const api = new Function(...Object.keys(dependencies), `${source}\nreturn { buildCharacterImagePrompt, generateCharacterImageLogic };`)
        (...Object.values(dependencies));
    return { ...api, calls, settings };
}

test('portrait preview uses profile and items without making an image request', async () => {
    const f = fixture();
    const card = { name: 'Mira', lorebook: { world: 'World', uid: 1 } };
    assert.equal(await f.buildCharacterImagePrompt(card), 'Mira | Species: Elf | Clothing: Red coat');
    assert.deepEqual(f.calls, []);
});

test('manual edited prompt is sent verbatim with ownership and blanks are rejected', async () => {
    const f = fixture();
    const card = { name: 'Mira' };
    const prompt = 'Custom outfit\nKeep this exact prompt';
    assert.equal(await f.generateCharacterImageLogic(card, { prompt }), '/portrait.png');
    assert.deepEqual(f.calls, [{ prompt, options: { owner: card } }]);
    await assert.rejects(f.generateCharacterImageLogic(card, { prompt: '  ' }), /Enter an image prompt/);
    assert.equal(f.calls.length, 1);
});

test('landscape generation uses the host image command without portrait prompt controls', async () => {
    const source = readFileSync(new URL('../src/api/api-image-generate.js', import.meta.url), 'utf8')
        .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
        .replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ');
    let request;
    const context = { getCurrentChatId: () => 'chat-a', chatMetadata: {} };
    const generate = new Function('startActivity', 'applyMacros', 'SlashCommandParser',
        'debugLog', 'persistGeneratedImage', 'DEFAULT_IMAGE_NEGATIVE_PROMPT', 'getContext',
        `${source}\nreturn generateImage;`)(startActivity, value => value, { commands: { imagine: { callback: async (args, prompt) => {
        request = { args, prompt }; return 'user/images/place.png';
    } } } }, () => {}, async value => value, 'portrait negatives', () => context);
    const path = await generate('Stone bridge at dusk', {
        shape: { pixels: { width: 1280, height: 720 } }, negativePrompt: 'people, text',
        gallery: false, extend: false, edit: false,
    });
    assert.equal(path, 'user/images/place.png');
    assert.deepEqual(request, { prompt: 'Stone bridge at dusk', args: {
        quiet: 'true', gallery: 'false', extend: 'false', edit: 'false',
        width: '1280', height: '720', negative: 'people, text',
    } });
});


test('portrait prefix precedes the description in preview and automatic requests and can be cleared', async () => {
    const f = fixture();
    const card = { name: 'Mira' };
    f.settings.imgGenPromptPrefix = '  Solo, profile picture  ';
    const expected = 'Solo, profile picture\nMira | Species: Elf | Clothing: Red coat';
    assert.equal(await f.buildCharacterImagePrompt(card), expected);
    await f.generateCharacterImageLogic(card);
    assert.equal(f.calls[0].prompt, expected);
    await f.generateCharacterImageLogic(card, { prompt: 'Manually replaced prompt' });
    assert.equal(f.calls[1].prompt, 'Manually replaced prompt');
    f.settings.imgGenPromptPrefix = '';
    assert.equal(await f.buildCharacterImagePrompt(card), 'Mira | Species: Elf | Clothing: Red coat');
});

test('portrait description uses visual profile details filled on the card', () => {
    const char = { profile: {
        age: '  late twenties ',
        appearance: '  Dark curls and a silver scar. ',
        personality: '  Reserved but quick to smile. ',
    } };
    const description = characterImageDescription(char, 'Unrelated lore');
    assert.ok(description.includes('late twenties'));
    assert.ok(description.includes('Dark curls and a silver scar.'));
    assert.doesNotMatch(description, /Reserved|Unrelated lore/);
    assert.equal(characterImageDescription({ profile: {} }, 'Older free-form lore'), 'Older free-form lore');
});

test('portrait items follow each collection image setting and actor target', () => {
    const definitions = [
        { id: 'clothes', name: 'Clothing', target: 'all', includeInImagePrompt: true, fields: [{ name: 'piece', isPrimary: true }] },
        { id: 'secrets', name: 'Secrets', target: 'all', includeInImagePrompt: false, fields: [{ name: 'name', isPrimary: true }] },
        { id: 'legacy', name: 'Equipment', target: 'npc', fields: [{ name: 'name', isPrimary: true }] },
    ];
    const collections = {
        clothes: [{ piece: 'Red cloak' }, { piece: 'Silver sword' }, { piece: 'Red cloak' }],
        secrets: [{ name: 'Hidden letter' }],
        legacy: [{ name: 'Silver sword' }, { name: 'Leather boots' }],
        unknown: [{ name: 'Unconfigured item' }],
    };
    const npc = imageItemsFromCollections(collections, definitions);
    const player = imageItemsFromCollections(collections, definitions, true);
    assert.equal(npc, 'Clothing: Red cloak, Silver sword\nEquipment: Silver sword, Leather boots');
    assert.equal(player, 'Clothing: Red cloak, Silver sword');
    assert.equal(imageItemsFromCollections({ clothes: [] }, definitions), 'Clothing: none\nEquipment: none');
    assert.equal(imageItemsFromCollections({}, definitions, true), 'Clothing: none');
    definitions[0].emptyImagePrompt = '';
    definitions[2].emptyImagePrompt = 'unarmed';
    assert.equal(imageItemsFromCollections({}, definitions), 'Equipment: unarmed');
    assert.equal(imageItemsFromCollections({ clothes: [{ piece: 'Red cloak' }] }, definitions),
        'Clothing: Red cloak\nEquipment: unarmed');
});


test('custom portrait fields use labels and exclude retired, unselected and template-excluded fields', () => {
    const definition = normalizeSystemDefinition({ schemaVersion: 1, profiles: { player: [], npc: [
        { id: 'species', label: 'Species', includeInImagePrompt: true },
        { id: 'clothing', label: 'Outfit', includeInImagePrompt: true },
        { id: 'appearance', label: 'Appearance', includeInImagePrompt: false },
        { id: 'secret', label: 'Secret', includeInImagePrompt: false },
        { id: 'retired', includeInImagePrompt: true, retired: true },
    ] }, npcTemplates: [{ id: 'creature', name: 'Creature', profileIds: ['species', 'appearance', 'secret', 'retired'], statIds: [] }] });
    setProfileSettingsProvider(() => ({ activeSystem: 'custom', statusTracker: { presets: { custom: { definition } } } }));
    try {
        const card = { npcTemplateId: 'creature', profile: {
            species: 'Dragon', clothing: 'Cloak', appearance: 'Excluded', secret: 'Hidden', retired: 'Old',
        } };
        assert.equal(characterImageDescription(card, 'Secret: Hidden'), 'Species: Dragon');
        delete card.profile.species;
        assert.equal(characterImageDescription(card, 'Secret: Hidden'), '');
    } finally { setProfileSettingsProvider(() => null); }
});

test('profile portrait flags survive normalization and are validated as booleans', () => {
    const definition = normalizeSystemDefinition({ schemaVersion: 1, profiles: { player: [], npc: [
        { id: 'age' }, { id: 'appearance', includeInImagePrompt: false },
        { id: 'species', includeInImagePrompt: true }, { id: 'history' },
    ] } });
    assert.deepEqual(definition.profiles.map(field => field.includeInImagePrompt), [true, false, true, false]);
    assert.deepEqual(normalizeSystemDefinition(definition).profiles, definition.profiles);
    assert.deepEqual(validateShape(definition.profiles[2], profileSchema), []);
    assert.ok(validateShape({ ...definition.profiles[2], includeInImagePrompt: 'yes' }, profileSchema)
        .some(error => error.includes('includeInImagePrompt')));
});
