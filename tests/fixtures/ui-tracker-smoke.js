// Reversible tracker controls, report, and profile fixtures for ui-smoke.py.
const root = new URL('../../', import.meta.url).href;
const { getSettings } = await import(root + 'src/core/settings.js');
const { renderStatusView } = await import(root + 'src/ui/tracker/ui-tracker-settings.js');
const { refreshReadButton } = await import(root + 'src/ui/tracker/ui-read-button.js');
const { buildSceneContext } = await import(root + 'src/tracker/status-logic.js');
const { buildStatusHtml } = await import(root + 'src/tracker/ui/status-ui-template.js');
const { buildTrackerBox } = await import(root + 'src/tracker/ui/status-ui-box.js');
const { renderExtractionReport } = await import(root + 'src/tracker/ui/status-ui-report.js');
const { getExtractionReport } = await import(root + 'src/tracker/extractor/status-extraction-report.js');
const { renderReviewPanel } = await import(root + 'src/ui/tracker/ui-change-review.js');
const { selectReviewRows } = await import(root + 'src/tracker/level-grant-review.js');
const { defaultTrackerSettings } = await import(root + 'src/core/settings-tracker-defaults.js');
const { resolveProfileFields } = await import(root + 'src/core/profile-fields.js');
const { formatLoreContent, parseLoreContent } = await import(root + 'src/lore/lore-format.js');
const { buildProfilesEditor } = await import(root + 'src/ui/system/ui-system-profiles.js');
const { renderProfileFields } = await import(root + 'src/ui/characters/ui-profile.js');
const masterSettings = getSettings();
const savedEnabled = masterSettings.enabled;
masterSettings.enabled = true;
const settings = masterSettings.statusTracker;
const keys = ['enabled', 'extractionMode', 'showGlobalStats', 'showPlayerStats',
  'showNpcStats', 'showRawTrackerOutput'];
const saved = Object.fromEntries(keys.map(key => [key, settings[key]]));
const chat = SillyTavern.getContext().chat;
const savedChat = chat.slice();
const panel = document.querySelector('#sillynpc-status-view');
const result = {};
try {
  const { normalizeSystemDefinition } = await import(root + 'src/core/system-schema.js');
  const fixtureDefinition = normalizeSystemDefinition({schemaVersion:2, npcTemplates: [{id:'mage',name:'Mage'}], profiles: [
    {id:'detail', label:'Detail', targets:['player','npc']},
  ]});
  const editor = buildProfilesEditor(() => {}, {
    definition: () => fixtureDefinition, getSettings: () => ({statusTracker:{}}), saveSettings: () => {},
  });
  result.profileEditors = editor.querySelectorAll('.sillynpc-system-profile-row').length === 1
    && !editor.querySelector('.profile-policy')
    && !!editor.querySelector('.profile-guidance')
    && editor.querySelectorAll('.col-target:checked').length === 2
    && editor.querySelector('.sillynpc-system-profile-options')?.children.length === 2
    && editor.querySelector('.profile-text-section')?.closest('label').textContent.includes('Display as text section')
    && !editor.textContent.includes('Multiline editor');
  const layout = document.createElement('div');
  layout.className = 'sillynpc sillynpc-manage sillynpc-system-builder';
  layout.style.width = '700px';
  layout.append(editor); document.body.append(layout);
  try {
    const besideCheckbox = label => {
      const checkbox = label.querySelector('input').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(label.lastChild);
      const text = range.getBoundingClientRect();
      return text.left >= checkbox.right
        && Math.abs(text.top + text.height / 2 - checkbox.top - checkbox.height / 2) < 5;
    };
    const options = [...editor.querySelectorAll('.sillynpc-system-profile-options > label')];
    const targets = [...editor.querySelectorAll('.col-targets > label')];
    const center = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const profileRow = editor.querySelector('.sillynpc-system-profile-row');
    const compactProfile = () => {
      const sections = [...profileRow.children];
      const fonts = [...profileRow.querySelectorAll('input[type=text], textarea, button, label, small, .col-targets-caption')]
        .map(el => getComputedStyle(el).fontSize);
      return new Set(fonts).size === 1 && sections.every((el, index) => !index
        || el.getBoundingClientRect().top - sections[index - 1].getBoundingClientRect().bottom <= 4.1);
    };
    result.compactProfileFields = compactProfile();
    result.profileEditorInlineLabels = [...options, ...targets].every(besideCheckbox)
      && Math.abs(center(options[0]) - center(options[1])) < 2
      && targets.every(label => Math.abs(center(label) - center(editor.querySelector('.col-targets-caption'))) < 2);
    layout.style.width = '280px';
    result.compactProfileFields &&= compactProfile();
    result.profileEditorInlineLabels &&= [...editor.querySelectorAll('.col-targets, .sillynpc-system-profile-options')]
      .every(row => row.scrollWidth <= row.clientWidth + 2);
  } finally { layout.remove(); }
  const profileEditor = document.createElement('div');
  renderProfileFields({ isPlayer: true, profile: {} }, profileEditor);
  result.profileControls = profileEditor.querySelectorAll('.sillynpc-profile-row').length > 0
    && [...profileEditor.querySelectorAll('.sillynpc-profile-controls')].every(controls =>
      controls.children.length === 2
      && [...controls.children].every(control => control.tagName === 'BUTTON'));
  const scene = buildSceneContext({ global: {},
    player: { name: 'Smoke Player', stats: {}, collections: {} },
    characters: [{ name: 'Smoke NPC', stats: {}, collections: {} }] });
  result.sceneStatusOnly = scene.includes('[Current Scene Status]')
    && scene.includes('Smoke Player') && scene.includes('Smoke NPC')
    && !scene.includes('Who they are:');
  const savedPlayerStats = settings.playerStats;
  try {
    settings.playerStats = [
      { name: 'Smoke Resolve', type: 'number', purpose: 'Mental endurance under pressure.' },
      { name: 'Smoke Unused', type: 'number', purpose: 'UNUSED_SMOKE_MEANING' }
    ];
    const meaningsScene = buildSceneContext({ global: {}, characters: [],
      player: { name: 'Smoke Player', stats: { 'Smoke Resolve': 0 }, collections: {} } });
    result.sceneStatMeanings = meaningsScene.includes('Stat meanings:')
      && meaningsScene.includes('Player.Smoke Resolve: Mental endurance under pressure.')
      && meaningsScene.includes('Smoke Resolve=0')
      && !meaningsScene.includes('UNUSED_SMOKE_MEANING');
  } finally { settings.playerStats = savedPlayerStats; }
  const fields = resolveProfileFields('player');
  const values = Object.fromEntries(fields.map(field => [field.id, 'Smoke value']));
  const lore = formatLoreContent(values, '', undefined, 'player');
  const parsed = parseLoreContent(lore, { scope: 'player' });
  result.playerLoreFields = fields.every(field => parsed?.[field.id] === 'Smoke value')
    && lore.split(String.fromCharCode(10)).filter(Boolean).length === fields.length;
  settings.enabled = true; settings.extractionMode = 'manual';
  renderStatusView(panel); refreshReadButton(); refreshReadButton();
  result.visibilityControls = keys.slice(2).every(key =>
    panel.querySelector('[data-setting="statusTracker.' + key + '"]')
      ?.closest('details')?.querySelector('summary')?.textContent === 'Customize display');
  const fixture = { global: { Location: 'Smoke World' },
    player: { name: 'Smoke Player', stats: { HP: '17/20' },
      collections: { inventory: [{ name: 'Player Sword', quantity: 1 }] } },
    characters: [{ name: 'Smoke NPC', stats: { HP: '7/10' },
      collections: { inventory: [{ name: 'NPC Shield', quantity: 1 }] } }] };
  const display = structuredClone(defaultTrackerSettings);
  display.showNpcPortraits = false;
  result.visibilityCombinations = true;
  for (let mask = 0; mask < 8; mask++) {
    display.showGlobalStats = !!(mask & 1);
    display.showPlayerStats = !!(mask & 2);
    display.showNpcStats = !!(mask & 4);
    const html = buildStatusHtml(fixture, display);
    result.visibilityCombinations &&= html.includes('Smoke World') === display.showGlobalStats
      && html.includes('17/20') === display.showPlayerStats
      && html.includes('Player Sword') === display.showPlayerStats
      && html.includes('Smoke NPC') === display.showNpcStats
      && html.includes('NPC Shield') === display.showNpcStats
      && (mask !== 0 || html === '');
  }
  display.showGlobalStats = true; display.showNpcStats = true;
  display.showPlayerStats = false;
  display.template = '<div class="sillynpc-status-box">{{globals}} {{player}} {{inventory}}'
    + '<div class="sillynpc-status-characters">{{#characters}}'
    + '<div class="sillynpc-status-char">{{name}} {{fields}} {{inventory}}</div>'
    + '{{/characters}}</div></div>';
  const customHtml = buildStatusHtml(fixture, display);
  result.customCollectionVisibility = !customHtml.includes('Player Sword')
    && customHtml.includes('NPC Shield');
  const sceneBefore = buildSceneContext(fixture);
  Object.assign(settings, { showGlobalStats: false, showPlayerStats: false, showNpcStats: false });
  result.noTrackerBar = buildTrackerBox(fixture, { view: 'full' }) === null;
  result.backgroundUnchanged = settings.enabled && buildSceneContext(fixture) === sceneBefore;
  chat.splice(0, chat.length, { mes: 'Smoke story', swipe_id: 0, extra: {
    sillynpc_reader_report: { swipe: 0, status: 'done', summary: 'Smoke report',
      output: { player: { stats: { HP: '17/20' } }, characters: [
        { name: 'Mudkip', stats: { XP: '10/100' } }, { name: 'Wurmple' }] } } } });
  const message = document.createElement('div');
  message.innerHTML = '<div class="mes_text">Smoke story</div>';
  settings.showRawTrackerOutput = true;
  renderExtractionReport(message, 0);
  result.reportShown = !!message.querySelector('.sillynpc-reader-report details');
  const readerLabels = [...message.querySelectorAll('.sillynpc-reader-content strong')]
    .map(label => label.textContent);
  result.namedReaderEntries = readerLabels.includes('Mudkip') && readerLabels.includes('Wurmple')
    && !readerLabels.includes('1') && !readerLabels.includes('2') && !readerLabels.includes('name');
  settings.showRawTrackerOutput = false;
  renderExtractionReport(message, 0);
  result.reportHidden = !message.querySelector('.sillynpc-reader-report')
    && getExtractionReport(0)?.summary === 'Smoke report';
  settings.showRawTrackerOutput = true;
  renderExtractionReport(message, 0);
  result.reportRestored = !!message.querySelector('.sillynpc-reader-report details');
  const storedSummary = chat[0].extra.sillynpc_reader_report.summary;
  chat[0].extra.sillynpc_reader_report.summary = '0 applied · 106 awaiting review';
  chat[0].extra.sillynpc_pending = Array.from({length: 106}, () => ({kind: 'stat'}));
  renderExtractionReport(message, 0);
  const pendingSummary = message.querySelector('summary').textContent;
  chat[0].extra.sillynpc_applied = chat[0].extra.sillynpc_pending;
  delete chat[0].extra.sillynpc_pending;
  renderExtractionReport(message, 0);
  result.reviewCountsRefresh = pendingSummary.includes('Applied: None · Needs review: 106 stats')
    && message.querySelector('summary').textContent.includes('Applied: 106 stats · Needs review: None')
    && message.querySelector('.sillynpc-reader-breakdown').textContent.includes('106 stats');
  chat[0].extra.sillynpc_applied = [
    {scope: 'character', actor: 'Mudkip', kind: 'stat', label: 'XP', before: '9', after: '0'},
    {scope: 'character', actor: 'Mudkip', kind: 'stat', label: 'Level', before: '4', after: '5'}];
  renderExtractionReport(message, 0);
  result.levelUpVisible = message.querySelector('summary').textContent.includes('1 XP update, 1 level-up')
    && message.querySelector('.sillynpc-reader-breakdown').textContent.includes('Level: 4 → 5');
  chat[0].extra.sillynpc_applied = [
    {scope: 'character', actor: 'Mudkip', kind: 'stat', label: 'XP', before: '', after: '0'},
    {scope: 'character', actor: 'Mudkip', kind: 'stat', label: 'Level', before: '', after: '5'}];
  renderExtractionReport(message, 0);
  result.initialStatsVisible = message.querySelector('summary').textContent.includes('Applied: 2 stats')
    && !message.querySelector('.sillynpc-reader-report').textContent.includes('XP update')
    && !message.querySelector('.sillynpc-reader-report').textContent.includes('level-up');
  const savedNpcDefinitions = settings.npcStats;
  try {
    settings.npcStats = [{name: 'HP', type: 'bar', defaultValue: '10/10'},
      {name: 'Rating', type: 'number', defaultValue: '1', maxStatValue: '5'}];
    chat[0].extra.sillynpc_applied = ['HP', 'Rating'].flatMap(label => [
      {scope: 'character', actor: 'Mudkip', kind: 'stat', label, before: '', after: '3'},
      {scope: 'character', actor: 'Mudkip', kind: 'stat-max', label, before: '(none)',
        after: label === 'HP' ? '10' : '5'}]);
    renderExtractionReport(message, 0);
    const breakdownText = message.querySelector('.sillynpc-reader-breakdown').textContent;
    result.poolMaximumSummary = message.querySelector('summary').textContent.includes('Applied: 2 stats')
      && breakdownText.includes('HP maximum: 10') && !breakdownText.includes('Rating maximum')
      && !message.querySelector('summary').textContent.includes('stat maximum');
  } finally { settings.npcStats = savedNpcDefinitions; }
  let reviewRows = Array.from({length: 106}, (_, i) => ({kind: 'stat', scope: 'player',
    actor: null, label: 'Fixture ' + i, before: '0', after: '1'}));
  let selectedCount = 0;
  renderReviewPanel(message, 0, { getPendingChanges: () => reviewRows,
    resolvePendingChanges: (_id, accepted) => {
      selectedCount = selectReviewRows(reviewRows, accepted).rows.length;
      reviewRows = [];
    } });
  message.querySelector('.sillynpc-review-actions button').click();
  result.reviewStatSelection = selectedCount === 106 && !message.querySelector('.sillynpc-review-panel');
  chat[0].extra.sillynpc_reader_report.summary = storedSummary;
  delete chat[0].extra.sillynpc_applied;
  const warning = 'Collection "missing" skipped: expected "moves". <img src=x onerror=alert(1)>';
  chat[0].extra.sillynpc_reader_report.warnings = [warning,
    'Player · Condition: "Tense" skipped: allowed values are Happy; kept "Happy".'];
  settings.showRawTrackerOutput = false;
  renderExtractionReport(message, 0);
  const warningBox = message.querySelector('.sillynpc-reader-warnings');
  result.collectionWarningsVisible = warningBox?.textContent.includes(warning)
    && warningBox.textContent.includes('Player · Condition')
    && warningBox.querySelector('strong').textContent === 'Skipped or adjusted changes'
    && !warningBox.querySelector('img')
    && !message.querySelector('.sillynpc-reader-content');
  delete chat[0].extra.sillynpc_reader_report.warnings;
  renderExtractionReport(message, 0);
  result.collectionWarningsCleared = !message.querySelector('.sillynpc-reader-report');
  result.manualOption = !!panel.querySelector('option[value="manual"]');
  result.buttons = document.querySelectorAll('#sillynpc-read-button').length;
  result.accessible = document.querySelector('#sillynpc-read-button')?.getAttribute('aria-label');
  settings.enabled = false; refreshReadButton();
  result.hiddenWhenDisabled = !document.querySelector('#sillynpc-read-button');
  settings.enabled = true; settings.extractionMode = 'extract'; refreshReadButton();
  result.hiddenWhenAutomatic = !document.querySelector('#sillynpc-read-button');
} catch (error) { result.error = String(error); }
finally {
  chat.splice(0, chat.length, ...savedChat);
  for (const key of keys) {
    if (saved[key] === undefined) delete settings[key];
    else settings[key] = saved[key];
  }
  masterSettings.enabled = savedEnabled;
  renderStatusView(panel); refreshReadButton();
}
document.documentElement.setAttribute('data-manual-smoke', JSON.stringify(result));
