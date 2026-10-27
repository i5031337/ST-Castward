"""Reversible absolute-reader host check; requests go only to a local mock upstream."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from ui_webdriver import browser_session


requests = []


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        requests.append(body)
        reply = {'choices': [{'message': {'content': json.dumps({
            'global': {}, 'player': {}, 'characters': []})}}]}
        payload = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        pass


server = HTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with browser_session() as browser:
        browser.execute('''
          const entry = [...document.scripts].find(s => s.src.includes('/SillyNPC-XP/index.js'));
          if (!entry) throw new Error('Extension entry script missing');
          const script = document.createElement('script');
          script.type = 'module'; script.id = 'castward-absolute-check';
          script.textContent = `
            const result = {};
            let settings, trackerSaved, live, liveSaved, chat, chatSaved;
            const fetchSaved = window.fetch;
            try {
              const root = ${JSON.stringify(new URL('.', entry.src).href)};
              const { getSettings } = await import(root + 'src/core/settings.js');
              const { collectLeadUp, buildUserPrompt } = await import(root + 'src/tracker/extractor/status-extractor-prompt.js');
              const { buildExtractionSchema } = await import(root + 'src/tracker/extractor/status-extractor-schema.js');
              const { requestExtraction } = await import(root + 'src/tracker/extractor/status-extractor-request.js');
              const { normalizeModelReadings } = await import(root + 'src/tracker/extractor/status-extractor-readings.js');
              const { loadStateFromMetadata, sanitizeModelUpdate, applyUpdate, getStatusInstructions, getStatusExample } = await import(root + 'src/tracker/status-logic.js');
              const { computeStateDiff, buildUpdateFromChanges } = await import(root + 'src/tracker/status-diff.js');
              const context = SillyTavern.getContext();
              settings = getSettings(); trackerSaved = settings.statusTracker;
              live = loadStateFromMetadata(); liveSaved = structuredClone(live);
              chat = context.chat; chatSaved = chat.slice();
              const stats = [
                {id:'xp',name:'XP',type:'number',defaultValue:'0/100'},
                {id:'level',name:'Level',type:'number',defaultValue:'1',locked:true},
                {id:'hp',name:'HP',type:'bar',defaultValue:'6/20'}
              ];
              const progression = {enabled:true,xpFieldId:'xp',levelFieldId:'level',pointsPerLevel:0,statIds:[]};
              const template = {id:'absolute-fixture',name:'Fixture',statIds:stats.map(s => s.id),progression};
              const tracker = {...structuredClone(trackerSaved),globalStats:[],playerStats:stats,npcStats:stats,
                collections:[],npcTemplates:[template],progression:{player:progression},
                presets:{...trackerSaved.presets,[settings.activeSystem]:{definition:{npcTemplates:[template],stats:{npc:stats}}}}};
              settings.statusTracker = tracker;
              const baseline = {...structuredClone(liveSaved),global:{},
                player:{...structuredClone(liveSaved.player),stats:{XP:'99/100',Level:'1',HP:'6/20'},collections:{}},
                characters:[{name:'Absolute Fixture NPC',npcTemplateId:template.id,stats:{XP:'99/100',Level:'1',HP:'6/20'},collections:{}}]};
              for (const key of Object.keys(live)) delete live[key];
              Object.assign(live, structuredClone(baseline));
              chat.splice(0, chat.length,
                {mes:'Previous resolved reply.',is_user:false},
                {mes:'I carry the wounded scout to safety.',is_user:true,name:'Alex'},
                {mes:'The scout reaches shelter and thanks you.',is_user:false});
              const prompt = buildUserPrompt(baseline, chat[2].mes, tracker, collectLeadUp(2,0));
              result.freshUserAndAssistant = prompt.includes(chat[1].mes) && prompt.includes(chat[2].mes)
                && !prompt.includes('Previous resolved reply.');
              result.absolutePrompt = !/player\\.deltas|globalDeltas|"deltas"\\s*:/.test(prompt)
                && /absolute/i.test(prompt);
              const instructions = getStatusInstructions(), example = getStatusExample();
              result.absoluteInline = !/player\\.deltas|globalDeltas|"deltas"\\s*:/.test(instructions + example)
                && /absolute/i.test(instructions);
              const schema = buildExtractionSchema(tracker,{state:baseline});
              result.schemaStrings = schema.properties.player.properties.stats.properties.XP.type === 'string'
                && schema.properties.characters.items.properties.stats.properties.XP.type === 'string'
                && !JSON.stringify(schema).includes('"deltas"') && !schema.properties.globalDeltas;
              const normalized = {global:{},player:{stats:{XP:'119/100'}},characters:[]};
              const warnings = [];
              normalizeModelReadings(normalized, baseline, tracker, {cards:[],warnings});
              sanitizeModelUpdate(normalized,baseline,tracker,{warnings});
              const preview = applyUpdate(normalized,{dryRun:true,warnings});
              result.previewRollover = preview.player.stats.XP === '19/100' && preview.player.stats.Level === '2';
              result.previewPure = live.player.stats.XP === '99/100' && live.player.stats.Level === '1';
              const rows = computeStateDiff(baseline,preview,tracker);
              const reviewed = buildUpdateFromChanges(rows,baseline,tracker,[]);
              const accepted = applyUpdate(reviewed,{dryRun:true,progressionResolved:true});
              result.reviewDoesNotDoubleAward = accepted.player.stats.XP === '19/100' && accepted.player.stats.Level === '2';
              const replacement = applyUpdate(normalized,{dryRun:true});
              result.regenerationSameBaseline = replacement.player.stats.XP === preview.player.stats.XP
                && replacement.player.stats.Level === preview.player.stats.Level;
              const lower = {player:{stats:{XP:'80/100'}},characters:[]};
              normalizeModelReadings(lower,baseline,tracker,{cards:[],warnings:[]});
              sanitizeModelUpdate(lower,baseline,tracker,{warnings:[]});
              result.lowerXpRefused = !Object.hasOwn(lower.player.stats,'XP');
              const blankNpc = structuredClone(baseline);
              blankNpc.characters[0].stats = {XP:'',Level:'',HP:''};
              const initialize = {characters:[{name:'Absolute Fixture NPC',npcTemplateId:template.id,stats:{XP:'0/100',Level:'3',HP:'7/10'}}]};
              normalizeModelReadings(initialize,blankNpc,tracker,{cards:[],warnings:[]});
              sanitizeModelUpdate(initialize,blankNpc,tracker,{warnings:[]});
              result.npcStartingLevel = initialize.characters[0].stats.Level === '3';
              const removeMaximum = buildUpdateFromChanges([{scope:'player',actor:null,label:'HP',kind:'stat-max',after:'(none)'}],baseline,tracker,[]);
              const removed = applyUpdate(removeMaximum,{dryRun:true,verbatim:true,progressionResolved:true});
              result.reviewMaximumRemoval = removed.player.stats.HP === '6';
              const profile = trackerSaved.extractionProfileId;
              if (!profile) throw new Error('Dedicated reader profile required for transport fixture');
              const captures = [];
              window.fetch = async (input, init) => {
                const url = typeof input === 'string' ? input : input.url;
                if (url.includes('/api/backends/') && url.includes('/generate')) {
                  const body = JSON.parse(init.body);
                  captures.push(body.json_schema ?? null);
                  body.custom_url = 'http://127.0.0.1:MOCKPORT/v1';
                  return fetchSaved(input,{...init,body:JSON.stringify(body)});
                }
                return fetchSaved(input,init);
              };
              for (const profileId of [profile,'']) for (const enabled of [false,true]) {
                const before = captures.length;
                await requestExtraction(prompt,schema,{...trackerSaved,extractionProfileId:profileId,
                  extractionUseSchema:enabled},'Return an empty JSON update.',{usageKind:'absolute-fixture-no-usage'});
                if (captures.length !== before + 1) throw new Error('Unexpected fallback or missing request');
                const capture = captures.at(-1);
                if (enabled ? JSON.stringify(capture?.value) !== JSON.stringify(schema) : capture !== null)
                  throw new Error('Schema transport mismatch');
              }
              result.bothSchemaPathsOnAndOff = captures.length === 4;
            } catch (error) {result.error = String(error.stack || error);}
            finally {
              window.fetch = fetchSaved;
              if (chat && chatSaved) chat.splice(0,chat.length,...chatSaved);
              if (live && liveSaved) {for (const key of Object.keys(live)) delete live[key]; Object.assign(live,liveSaved);}
              if (settings && trackerSaved) settings.statusTracker = trackerSaved;
            }
            document.documentElement.setAttribute('data-absolute-result',JSON.stringify(result));
          `;
          document.body.append(script);
        '''.replace('MOCKPORT', str(server.server_port)))
        try:
            result = None
            for _ in range(300):
                raw = browser.execute("return document.documentElement.getAttribute('data-absolute-result')")
                if raw:
                    result = json.loads(raw)
                    break
                time.sleep(.1)
            assert result and all(value is True for value in result.values()), result
            assert len(requests) == 4, len(requests)
            for index, request in enumerate(requests):
                response_format = request.get('response_format') or {}
                if index % 2:
                    assert response_format.get('type') == 'json_schema', response_format
                    schema = response_format['json_schema']['schema']
                    assert schema['properties']['player']['properties']['stats']['properties']['XP']['type'] == 'string'
                    assert 'deltas' not in schema['properties']['player']['properties']
                    assert 'globalDeltas' not in schema['properties']
                else:
                    assert response_format.get('type') != 'json_schema', response_format
            print(json.dumps(result, indent=2))
            print('Four mock upstream requests verified; no model inference or fixture saves.')
        finally:
            browser.execute("document.querySelector('#castward-absolute-check')?.remove();document.documentElement.removeAttribute('data-absolute-result');")
finally:
    server.shutdown()
    server.server_close()
