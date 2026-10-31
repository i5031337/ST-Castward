"""Unsaved portrait UI checks. No image requests or host settings writes."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute("""const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
        const script = document.createElement('script'); script.type = 'module'; script.id = 'sillynpc-image-smoke';
        script.textContent = `
          const root = ${JSON.stringify(new URL('.', entry.src).href)};
          const { buildCharacterImagePrompt } = await import(root + 'src/api/api-image-generate.js');
          const { generateCharacterImage } = await import(root + 'src/ui/api/ui-api-image.js');
          const { renderImageSettingsView, renderProfileSettingsView } = await import(root + 'src/ui/settings/ui-settings-generation.js');
          const { renderTrackerDisplayAndReading } = await import(root + 'src/ui/tracker/ui-tracker-display-reading.js');
          const { getSettings } = await import(root + 'src/core/settings.js');
          const { buildProfilesEditor } = await import(root + 'src/ui/system/ui-system-profiles.js');
          const { buildMemoryControls } = await import(root + 'src/ui/system/ui-system-memories.js');
          const result = {};
          const { normalizeSystemDefinition } = await import(root + 'src/core/system-schema.js');
          const fixture = normalizeSystemDefinition({ schemaVersion: 2, profiles: [{ id: 'species', label: 'Species', targets: ['npc'], includeInImagePrompt: true }] });
          const host = document.createElement('div');
          let saves = 0;
          const originalMode = getSettings().statusTracker.extractionMode;
          try {
            const imageSettings = document.createElement('div');
            renderImageSettingsView(imageSettings);
            const profileSettings = document.createElement('div');
            renderProfileSettingsView(profileSettings);
            const portraitToggle = profileSettings.querySelector('[data-setting=autoPortraitOnFill]');
            const generationToggle = profileSettings.querySelector('[data-setting="statusTracker.autoGenerateNpcProfiles"]');
            result.portraitUnderProfiles = profileSettings.querySelectorAll('[data-setting=autoPortraitOnFill]').length === 1
              && portraitToggle.querySelector('input[type="checkbox"]').checked === !!getSettings().autoPortraitOnFill;
            result.generationUnderProfiles = profileSettings.querySelectorAll('[data-setting="statusTracker.autoGenerateNpcProfiles"]').length === 1
              && generationToggle.querySelector('input[type="checkbox"]').checked === !!getSettings().statusTracker.autoGenerateNpcProfiles;
            result.memoriesSeparateFromFields = !profileSettings.querySelector('.profile-new-label')
              && !!profileSettings.querySelector('.profile-memory-enabled')
              && profileSettings.querySelector('.sillynpc-system-memory-controls').closest('details')?.open === false;
            result.noImageProfileToggles = !imageSettings.querySelector('[data-setting=autoPortraitOnFill]')
              && !imageSettings.querySelector('[data-setting="statusTracker.autoGenerateNpcProfiles"]');
            getSettings().statusTracker.extractionMode = 'inline';
            const inlineProfiles = document.createElement('div');
            renderProfileSettingsView(inlineProfiles);
            result.inlineProfileControls = !!inlineProfiles.querySelector('[data-setting=autoPortraitOnFill]')
              && !!inlineProfiles.querySelector('[data-setting="statusTracker.autoGenerateNpcProfiles"]');
            getSettings().statusTracker.extractionMode = originalMode;
            const expressionToggle = imageSettings.querySelector('[data-setting=autoGenerateNpcExpressions]');
            result.imageAutomationPreserved = !!imageSettings.querySelector('[data-setting=autoPlaceBackgrounds]')
              && expressionToggle.querySelector('input[type="checkbox"]').checked === !!getSettings().autoGenerateNpcExpressions;
            result.sharedExpressionWorkflow = expressionToggle?.nextElementSibling?.dataset.setting === 'npcExpressionWorkflow'
              && !!imageSettings.querySelector('[data-setting=npcExpressionWorkflow] select');
            const adapterToggle=imageSettings.querySelector('[data-setting=npcExpressionIpAdapterMode]');
            result.ipAdapterModeSetting=adapterToggle?.previousElementSibling?.dataset.setting==='npcExpressionWorkflow'
              &&adapterToggle.querySelector('input[type="checkbox"]').checked===!!getSettings().npcExpressionIpAdapterMode;
            const messageToggle=imageSettings.querySelector('[data-setting=npcExpressionsPerMessage]');
            const refreshToggle=imageSettings.querySelector('[data-setting=npcExpressionsRefreshOnImagePrompt]');
            result.expressionOptions=messageToggle?.previousElementSibling===adapterToggle
              &&refreshToggle?.previousElementSibling===messageToggle
              &&messageToggle.querySelector('input').checked===!!getSettings().npcExpressionsPerMessage
              &&refreshToggle.querySelector('input').checked===!!getSettings().npcExpressionsRefreshOnImagePrompt;
            const sceneToggle=imageSettings.querySelector('[data-setting=showPresentNpcSprites]');
            result.sceneSpriteSetting=!!sceneToggle&&sceneToggle.querySelector('input[type="checkbox"]').checked===!!getSettings().showPresentNpcSprites;
            const tracker = document.createElement('div');
            renderTrackerDisplayAndReading({ container: tracker,
              settings: { ...getSettings().statusTracker, extractionMode: 'extract' },
              onApply: () => {}, onDisplay: () => {}, onChange: () => {}, section: () => {} });
            result.noTrackerProfileToggles = !tracker.querySelector('[data-setting=autoPortraitOnFill]')
              && !tracker.querySelector('[data-setting=\"statusTracker.autoGenerateNpcProfiles\"]');
            host.append(imageSettings);
            const prefix = imageSettings.querySelector('[data-setting=imgGenPromptPrefix] textarea');
            result.noImageContextSetting = !imageSettings.querySelector('[data-setting=imgGenContextMessages]');
            result.prefixSetting = !!prefix && prefix.value === getSettings().imgGenPromptPrefix;
            const editor = buildProfilesEditor(() => {}, { definition: () => fixture, getSettings: () => ({statusTracker: {}}), saveSettings: () => saves++ });
            host.append(editor); document.body.append(host);
            const checkbox = editor.querySelector('.profile-image-prompt');
            result.fieldSelected = checkbox.checked;
            checkbox.click();
            result.fieldToggle = !fixture.profiles[0].includeInImagePrompt && saves === 1;
            const memoryContext = { definition: () => fixture, getSettings: () => ({ statusTracker: {} }),
              saveSettings: () => saves++, refreshMemoryButton: () => {} };
            const memories = buildMemoryControls(memoryContext);
            host.append(memories);
            const interval = memories.querySelector('.profile-memory-interval');
            interval.value = '6'; interval.dispatchEvent(new Event('change'));
            const carry = memories.querySelector('.profile-memory-carryover');
            const heldCarryover = fixture.memories.carryOver;
            carry.click();
            result.memoryEdits = fixture.memories.interval === 6 && fixture.memories.carryOver === !heldCarryover
              && saves === 3 && !editor.querySelector('.profile-memory-enabled');
            const card = { name: 'Portrait Smoke NPC', profile: { age: '30', appearance: 'Blue coat' } };
            const expectedPrompt = await buildCharacterImagePrompt(card);
            const task = generateCharacterImage(card);
            let textarea;
            for (let n = 0; n < 100; n++) {
              textarea = document.querySelector('.sillynpc-image-prompt');
              if (textarea) break;
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            if (!textarea) throw new Error('Image prompt popup did not open');
            const expectedArea = document.createElement('textarea'); expectedArea.value = expectedPrompt;
            result.promptPrefilled = textarea.value === expectedArea.value;
            textarea.value = 'Edited portrait prompt'; textarea.dispatchEvent(new Event('input', { bubbles: true }));
            result.promptEditable = textarea.value === 'Edited portrait prompt';
            const dialog = textarea.closest('dialog');
            const cancel = dialog.querySelector('.popup-button-cancel');
            if (!cancel) throw new Error('Cancel button missing');
            cancel.click(); await task;
            result.cancelClosed = !document.querySelector('.sillynpc-image-prompt');
          } catch (error) { result.error = error.stack || String(error); }
          finally { getSettings().statusTracker.extractionMode = originalMode; host.remove(); document.getElementById('sillynpc-image-smoke')?.remove(); }
          document.documentElement.setAttribute('data-image-smoke', JSON.stringify(result));
        `;
        document.body.append(script);""")
    for attempt in range(200):
        result = browser.execute("return document.documentElement.getAttribute('data-image-smoke')")
        if result:
            break
        time.sleep(0.1)
    assert result, 'Portrait UI check timed out'
    data = json.loads(result)
    browser.execute("document.documentElement.removeAttribute('data-image-smoke')")
    assert 'error' not in data, data
    assert all(data.values()), data
    print(json.dumps(data, indent=2))
