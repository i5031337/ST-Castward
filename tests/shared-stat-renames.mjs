import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSchemaOperation, installSchemaWrites } from '../src/tracker/schema-operation-calculation.js';

test('shared stat rename follows assignments and preserves other template readings', () => {
    const field = { id: 'health', name: 'Health', targets: ['player', 'template:mage'] };
    const system = { npcTemplates: [{ id: 'mage' }, { id: 'beast' }] };
    const settings = { activeSystem: 'story', statusTracker: {
        presets: { story: { definition: system } }, playerStats: [field], npcStats: [field],
    } };
    const state = { player: { stats: { Health: '4' } }, players: { inactive: { stats: { Health: '8' } } },
        characters: [{ npcTemplateId: 'mage', stats: { Health: '3' } },
            { npcTemplateId: 'beast', stats: { Health: '9' } }] };
    const cards = [{ npcTemplateId: 'mage', statusOverrides: { Health: '5' } },
        { npcTemplateId: 'beast', statusOverrides: { Health: '12' } }];
    const plan = calculateSchemaOperation({ tracker: settings.statusTracker, system, state, cards,
        operation: { type: 'stat', scopes: ['npcStats', 'playerStats'], oldName: 'Health', newName: 'Vitality', field } });
    installSchemaWrites(plan.writes);
    const next = plan.nextState;
    assert.deepEqual(next.player.stats, { Vitality: '4' });
    assert.deepEqual(next.players.inactive.stats, { Vitality: '8' });
    assert.deepEqual(next.characters[0].stats, { Vitality: '3' });
    assert.deepEqual(next.characters[1].stats, { Health: '9' });
    assert.deepEqual(cards[0].statusOverrides, { Vitality: '5' });
    assert.deepEqual(cards[1].statusOverrides, { Health: '12' });
});
