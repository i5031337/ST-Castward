import { getRequestHeaders } from '../../../../../../../script.js';
import { getSettings } from '../../core/settings.js';
import { buildSettingSelect } from '../shared/ui-shared.js';
import { resetNpcExpressions } from '../../expressions/npc-expressions.js';

/** Expressions need a reference-edit workflow independently of ordinary portrait generation. */
export function buildExpressionWorkflowSetting() {
    const current = getSettings().npcExpressionWorkflow || '';
    const root = buildSettingSelect({
        key: 'npcExpressionWorkflow', label: 'Expression Editing Workflow',
        options: [{ value: '', label: 'Choose a reference-edit workflow' },
            ...(current ? [{ value: current, label: current }] : [])],
        help: 'Saved ComfyUI API workflow with %reference_image% and %prompt% inputs. '
            + 'Used by all NPCs for automatic and manual expressions. Independent of the portrait workflow in ST Image Generation.',
        onChange: () => resetNpcExpressions(),
    });
    const select = root.querySelector('select');
    fetch('/api/sd/comfy/workflows', { method: 'POST', headers: getRequestHeaders(), body: '{}' })
        .then(response => { if (!response.ok) throw new Error('Workflow list unavailable.'); return response.json(); })
        .then(files => {
            if (!Array.isArray(files)) throw new Error('Workflow list unavailable.');
            for (const file of files.filter(file => typeof file === 'string').sort()) {
                if ([...select.options].some(option => option.value === file)) continue;
                const option = document.createElement('option'); option.value = file; option.textContent = file; select.append(option);
            }
        }).catch(error => {
            const status = document.createElement('p'); status.setAttribute('role', 'status');
            status.textContent = error.message; root.append(status);
        });
    return root;
}
