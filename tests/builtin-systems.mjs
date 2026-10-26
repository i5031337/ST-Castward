import assert from 'node:assert/strict';
import test from 'node:test';
import { builtinSystemChoices, createBuiltinSystem } from '../src/core/builtin-systems.js';
import { validateDefinition } from '../src/generation/validate-definition.js';
import { characterImageDescription } from '../src/api/api-image-description.js';
import { setProfileSettingsProvider } from '../src/core/profile-fields.js';

test('shipped Systems validate and remain independent editable copies', () => {
    assert.ok(builtinSystemChoices.length > 0);
    for (const choice of builtinSystemChoices) {
        const definition = createBuiltinSystem(choice.id);
        assert.deepEqual(validateDefinition(definition), [], choice.name);
        definition.name = 'Edited';
        assert.equal(createBuiltinSystem(choice.id).name, choice.name);
    }
    assert.equal(createBuiltinSystem('missing'), null);
});

test('fantasy portraits include species alongside appearance and exclude background', () => {
    const definition = createBuiltinSystem('fantasy');
    setProfileSettingsProvider(() => ({ activeSystem: 'fantasy',
        statusTracker: { presets: { fantasy: { definition } } } }));
    try {
        const description = characterImageDescription({ npcTemplateId: 'character', profile: {
            ancestry: 'Elf', appearance: 'Silver hair', background: 'Secret royal heir',
        } });
        assert.match(description, /Elf/);
        assert.match(description, /Silver hair/);
        assert.doesNotMatch(description, /Secret royal heir/);
    } finally { setProfileSettingsProvider(() => null); }
});
