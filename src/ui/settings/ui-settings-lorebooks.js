import { Popup } from '../../../../../../popup.js';
import { buildSettingToggle } from '../shared/ui-shared.js';
import { lorebookCleanup } from '../../lore/lorebook-cleanup-runtime.js';

export function appendLorebookControls(view) {
    view.append(buildSettingToggle({
        key: 'autoCreateLorebook', label: 'Create Chat Lorebooks Automatically',
        help: 'Allow Castward to create and attach a chat lorebook when saving profiles or memories '
            + 'without a target. On by default; shows a notification when a book is created. '
            + 'When off, Castward asks you to choose or create a lorebook before writing profiles or memories.',
    }));
    const wrap = document.createElement('div');
    wrap.className = 'sillynpc-setting';
    wrap.dataset.setting = 'cleanupLorebooks';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu_button sillynpc-cleanup-lorebooks';
    const label = document.createElement('span');
    label.className = 'sillynpc-setting-label';
    label.textContent = 'Delete unused Castward lorebooks';
    button.append(label);
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            const names = await lorebookCleanup.find();
            if (!names.length) {
                toastr.info('No unused Castward lorebooks found.', 'Castward');
                return;
            }
            const content = document.createElement('div');
            const note = document.createElement('p');
            note.textContent = `Delete these ${names.length} unused lorebooks? This cannot be undone. `
                + 'Books referenced by saved chats, characters, personas, or settings are kept.';
            const list = document.createElement('pre');
            list.style.cssText = 'max-height:40vh; overflow:auto; white-space:pre-wrap; text-align:left';
            list.textContent = names.join('\n');
            content.append(note, list);
            if (!await Popup.show.confirm('Delete unused Castward lorebooks', content.outerHTML)) return;
            const { deleted, failed, skipped } = await lorebookCleanup.remove(names);
            const message = `Deleted ${deleted} lorebooks.`
                + (skipped ? ` Kept ${skipped} books that are now in use or no longer available.` : '')
                + (failed ? ` ${failed} could not be deleted.` : '');
            toastr[failed ? 'warning' : 'success'](message, 'Castward');
        } catch (err) {
            toastr.error(err.message, 'Castward');
        } finally {
            button.disabled = false;
        }
    });
    const help = document.createElement('small');
    help.className = 'notes';
    help.style.display = 'block';
    help.textContent = 'Checks books named “Castward Chat …” against saved chats and all current links. '
        + 'Shows the list before deleting. Other lorebooks are kept.';
    wrap.append(button, help);
    view.append(wrap);
}
