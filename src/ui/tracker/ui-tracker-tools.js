import { buildContextReport } from './ui-tracker-context.js';
import { openAdvancedSettingsPopup } from './ui-tracker-popups.js';

export function renderTrackerTools({ container, onChange }) {
    /* -- Chat size --------------------------------------------------------- */

    container.appendChild(buildContextReport(onChange));

    /* -- Buttons ----------------------------------------------------------- */

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '20px';
    btnRow.style.flexWrap = 'wrap';

    const advBtn = document.createElement('button');
    advBtn.type = 'button';
    advBtn.className = 'menu_button';
    advBtn.style.flex = '1';
    advBtn.innerHTML = '<i class="fa-solid fa-code"></i> HTML & CSS Template';
    advBtn.addEventListener('click', () => openAdvancedSettingsPopup());

    btnRow.append(advBtn);
    container.appendChild(btnRow);
}
