import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '').replaceAll('export ', '');

function element(tag) {
    const events = {};
    return { tag, children: [], style: {}, type: 'text',
        append(...children) { this.children.push(...children); },
        appendChild(child) { this.children.push(child); },
        addEventListener(type, callback) { events[type] = callback; },
        change() { events.change(); } };
}

function fixture({ primaryType = 'text', accept = true } = {}) {
    const master = { gear: { sword: { name: 'Sword', description: 'Established blade', enchanted: false } } };
    const fields = [{ name: 'name', type: primaryType, isPrimary: true },
        { name: 'description', type: 'text' }, { name: 'enchanted', type: 'boolean' }];
    const writes = [];
    const dependencies = { document: { createElement: element }, libraryBulk: null,
        updateMasterItem: (id, key, data) => {
            writes.push(data);
            if (!accept) return null;
            master[id][key] = data;
            return {};
        },
        renameMasterItem: (_id, _oldName, _newName, data) => { writes.push(data); return {}; },
        render() {} };
    const build = new Function(...Object.keys(dependencies),
        `${source('../src/ui/collections/ui-item-library-sections.js')}\nreturn buildItemRow;`)(...Object.values(dependencies));
    const card = build({ root: {}, search: { value: '' }, master, colDef: { id: 'gear', fields }, fields, primary: 'name', key: 'sword' });
    return { card, writes, master };
}

test('Item Library boolean edits and numeric identifiers reach the pipeline as native values', () => {
    const f = fixture();
    const checkbox = f.card.children[2].children[1];
    checkbox.checked = true;
    checkbox.change();
    assert.equal(f.writes[0].enchanted, true);
    assert.equal(f.writes[0].name, 'Sword');
    const numeric = fixture({ primaryType: 'number' });
    const identifier = numeric.card.children[0].children[0];
    identifier.value = '7';
    identifier.change();
    assert.equal(numeric.writes[0].name, 7);
});

test('a rejected library field edit restores the committed value', () => {
    const f = fixture({ accept: false });
    const input = f.card.children[1].children[1];
    input.value = 'Rejected rewrite';
    input.change();
    assert.equal(input.value, 'Established blade');
    assert.equal(f.master.gear.sword.description, 'Established blade');
});

test('the library host boundary reports pipeline validation errors without throwing into controls', () => {
    const notices = [];
    const dependencies = { runSchemaOperation() { throw new Error('Invalid configured value'); },
        peekStateFromMetadata() {}, saveStateToMetadata() {}, getCurrentPersonaKey() {},
        toastr: { warning: message => notices.push(message) }, console: { warn() {} } };
    const update = new Function(...Object.keys(dependencies),
        `${source('../src/tracker/status-collection-schema.js')}\nreturn updateMasterItem;`)(...Object.values(dependencies));
    assert.equal(update('gear', 'Sword', {}), null);
    assert.deepEqual(notices, ['Invalid configured value']);
});
