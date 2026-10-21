"""Read-only SillyTavern System Builder smoke check; requires a running local server."""
import json
import time
from ui_webdriver import browser_session


with browser_session() as browser:
    execute = browser.execute
    execute("document.querySelector('#sillynpc-open-manage').click()")
    time.sleep(0.5)
    execute("document.querySelector('.sillynpc-section[data-section=status]').click()")
    cast_controls = execute("""const panel = document.querySelector('#sillynpc-status-view');
        return {section: [...panel.querySelectorAll('h3')].some(el =>
            el.textContent.trim() === 'Who Is In The Scene'),
          mode: !!panel.querySelector('[data-setting="statusTracker.castMode"]'),
          binding: !!panel.querySelector('[data-setting="statusTracker.sceneBindingStat"]')};""")
    assert cast_controls == {'section': False, 'mode': False, 'binding': False}, cast_controls
    execute("""const entry = [...document.scripts].find(script =>
        script.src.includes('/SillyNPC-XP/index.js'));
        if (!entry) throw new Error('Extension entry script missing');
        const script = document.createElement('script');
        script.type = 'module'; script.id = 'sillynpc-manual-smoke';
        script.src = new URL('tests/fixtures/ui-tracker-smoke.js', new URL('.', entry.src)).href;
        document.head.appendChild(script);""")
    manual_result = None
    for _ in range(40):
        raw = execute("return document.documentElement.getAttribute('data-manual-smoke')")
        if raw:
            manual_result = json.loads(raw)
            break
        time.sleep(0.25)
    execute("""document.querySelector('#sillynpc-manual-smoke')?.remove();
        document.documentElement.removeAttribute('data-manual-smoke');""")
    assert manual_result and manual_result.get('manualOption'), manual_result
    assert all(manual_result.get(key) for key in ['sceneStatusOnly', 'sceneStatMeanings', 'playerLoreFields', 'profileEditors', 'profileEditorInlineLabels', 'compactProfileFields', 'profileControls']), manual_result
    assert manual_result.get('buttons') == 1 and manual_result.get('accessible'), manual_result
    assert manual_result.get('hiddenWhenDisabled') and manual_result.get('hiddenWhenAutomatic'), manual_result
    assert all(manual_result.get(key) for key in [
        'visibilityControls', 'visibilityCombinations', 'customCollectionVisibility',
        'noTrackerBar', 'backgroundUnchanged', 'reportShown', 'reportHidden', 'reportRestored', 'reviewCountsRefresh', 'reviewStatSelection',
        'collectionWarningsVisible', 'collectionWarningsCleared', 'levelUpVisible', 'initialStatsVisible',
    ]), manual_result
    execute("document.querySelector('.sillynpc-section[data-section=systems]').click()")
    palette = execute("""const pages = [
          ['Profile fields', '.sillynpc-system-profile-row'],
          ['Stats', '.sillynpc-system-stat-row'],
          ['Global', '.sillynpc-system-stat-row'],
          ['Collections', '.sillynpc-system-collection-row'],
          ['NPC Templates', '.sillynpc-system-profile-row'],
          ['Player progression', '.sillynpc-progression-editor'],
        ];
        return pages.map(([tab, selector]) => {
          [...document.querySelectorAll('.sillynpc-system-builder [role=tab]')]
            .find(el => el.textContent.trim() === tab).click();
          const cards = [...document.querySelectorAll('.sillynpc-system-builder ' + selector)];
          return {tab, styles: cards.map(card => {
            const style = getComputedStyle(card);
            const input = getComputedStyle(card.querySelector('.text_pole'));
            return [style.backgroundColor, style.color, style.borderTopColor, style.borderTopStyle,
              style.borderTopWidth, style.borderRadius, input.backgroundColor, input.color, input.borderTopColor];
          })};
        });""")
    reference = palette[0]['styles'][0]
    assert all(page['styles'] and all(style == reference for style in page['styles']) for page in palette), palette
    execute("[...document.querySelectorAll('.sillynpc-system-builder [role=tab]')].find(el => el.textContent.trim() === 'Stats').click()")
    result = execute("""const rows = [...document.querySelectorAll('.sillynpc-system-builder .sillynpc-alias-row')];
        return {rows: rows.length,
          bulkControls: document.querySelectorAll('.sillynpc-system-builder .sillynpc-bulk-bar, .sillynpc-system-builder .sillynpc-bulk-check').length,
          deleteButtons: rows.filter(row => row.querySelector('.delete-btn')).length,
          customFormats: rows.filter(row => row.querySelector('.stat-format')).length,
          enabledNameToggles: rows.filter(row => row.querySelector('.stat-show-name') && !row.querySelector('.stat-show-name').disabled).length,
          separateOptionRows: rows.filter(row => {
            const definition = row.querySelector('.sillynpc-stat-definition');
            const options = row.querySelector('.sillynpc-stat-options');
            return definition && options && !definition.querySelector('input[type=checkbox], input[type=color]')
              && !options.querySelector('.stat-purpose, .stat-type, .stat-min, .stat-max, .stat-options')
              && options.getBoundingClientRect().top >= definition.getBoundingClientRect().bottom - 1;
          }).length,
          compactRows: rows.filter(row => {
            const sections = [...row.children].filter(el => el.matches('.sillynpc-stat-header, .sillynpc-stat-definition, .sillynpc-stat-options, .col-targets'));
            return sections.every((el, index) => !index || el.getBoundingClientRect().top - sections[index - 1].getBoundingClientRect().bottom <= 4.1);
          }).length,
          uniformFonts: rows.filter(row => {
            const sizes = [...row.querySelectorAll('input[type=text], select, button, label, small, .col-targets-caption')]
              .map(el => getComputedStyle(el).fontSize);
            return new Set(sizes).size === 1;
          }).length,
          obsoletePolicies: rows.filter(row => row.querySelector('.stat-update-policy')).length,
          purpose: rows.filter(row => row.querySelector('.stat-purpose')).length,
          numericOptions: rows.filter(row => row.querySelector('.stat-type')?.value === 'number'
            && row.querySelector('.stat-options')).length,
          wrongMaxLabels: rows.filter(row => {
            if (row.querySelector('.stat-type')?.value !== 'number') return false;
            const pool = row.querySelector('.stat-default')?.value.includes('/');
            const label = [...row.querySelectorAll('small')].map(el => el.textContent.trim())
              .find(text => text === 'Max:' || text === 'Limit:');
            return label !== (pool ? 'Limit:' : 'Max:');
          }).length};""")
    assert result['rows'] > 0 and result['purpose'] == result['rows'], result
    assert result['bulkControls'] == 0 and result['deleteButtons'] == result['rows'], result
    assert result['customFormats'] == 0 and result['enabledNameToggles'] == result['rows'], result
    assert result['separateOptionRows'] == result['rows'], result
    assert result['compactRows'] == result['rows'] and result['uniformFonts'] == result['rows'], result
    assert result['obsoletePolicies'] == 0
    assert result['numericOptions'] == 0 and result['wrongMaxLabels'] == 0, result
    print('Castward live UI passed:', json.dumps(result))
