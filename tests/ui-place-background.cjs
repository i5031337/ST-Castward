/** Unsaved Places editor and linked background check in the running SillyTavern UI. */
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = () => new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); });
});

async function main() {
    const profile = mkdtempSync(path.join(tmpdir(), 'castward-place-ui-'));
    const browserPort = await port();
    const child = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*',
            `--remote-debugging-port=${browserPort}`, `--user-data-dir=${profile}`, 'http://127.0.0.1:8000/'],
        { stdio: 'ignore', windowsHide: true });
    let socket;
    try {
        let page;
        for (let i = 0; i < 100; i++) {
            try {
                const tabs = await (await fetch(`http://127.0.0.1:${browserPort}/json`)).json();
                page = tabs.find(tab => tab.type === 'page' && tab.url.includes('127.0.0.1:8000'));
                if (page) break;
            } catch { /* Browser is starting. */ }
            await sleep(100);
        }
        if (!page) throw new Error('Headless Edge did not open SillyTavern.');
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        const pending = new Map(); let serial = 0;
        socket.onmessage = event => {
            const message = JSON.parse(event.data);
            if (!message.id) return;
            const waiter = pending.get(message.id); pending.delete(message.id);
            if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
        };
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++serial; pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async expression => {
            for (let attempt = 0; attempt < 50; attempt++) {
                const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
                if (!result.exceptionDetails) return result.result.value;
                if (attempt === 49) throw new Error(result.exceptionDetails.text);
                await sleep(100);
            }
        };
        let root;
        for (let i = 0; i < 200; i++) {
            root = await evaluate(`new URL('.', [...document.scripts].find(s =>
                /SillyNPC-levels|ST-Castward|SillyNPC-XP/.test(s.src) && s.src.endsWith('/index.js'))?.src || location.href).href`);
            if (/SillyNPC-levels|ST-Castward|SillyNPC-XP/.test(root)) break;
            await sleep(100);
        }
        if (!/SillyNPC-levels|ST-Castward|SillyNPC-XP/.test(root)) throw new Error('Castward did not load.');
        await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: false });
        const fixture = `const out={};try{
            const {checkLocations}=await import(${JSON.stringify(root + 'tests/fixtures/ui-locations.js')});
            out.editor=await checkLocations(${JSON.stringify(root)});
            const {renderImageGenerationSettings}=await import(${JSON.stringify(root + 'src/ui/settings/ui-settings-generation-image.js')});
            const imageSettings=document.createElement('div');
            renderImageGenerationSettings(imageSettings,()=>{});
            out.autoToggle=Boolean(imageSettings.querySelector('[data-setting="autoPlaceBackgrounds"] input[type="checkbox"]'));
            const {syncPlaceBackground}=await import(${JSON.stringify(root + 'src/locations/location-background.js')});
            const metadata={sillynpc_status_state:{locations:{enabled:true,currentId:'inn',records:{
                inn:{name:'Inn',backgroundImage:'url("user/images/inn.png")'},
                road:{name:'Road',backgroundImage:'url("user/images/road.png")'}
            }}}};
            const context={chatMetadata:metadata,getCurrentChatId:()=> 'unsaved-fixture',saveMetadataDebounced:()=>{out.saves=(out.saves||0)+1}};
            const background={style:{backgroundImage:''}};
            out.first=syncPlaceBackground(context,background);
            out.inn=metadata.custom_background;
            metadata.sillynpc_status_state.locations.currentId='road';
            out.second=syncPlaceBackground(context,background);
            out.road=background.style.backgroundImage;
            metadata.sillynpc_status_state.locations.currentId='';
            out.empty=syncPlaceBackground(context,background);
        }catch(error){out.error=String(error.stack||error)}
        document.documentElement.setAttribute('data-place-background-check',JSON.stringify(out));`;
        await evaluate(`(() => { const script=document.createElement('script');script.type='module';
            script.id='place-background-check';script.textContent=${JSON.stringify(fixture)};
            document.body.append(script);return true })()`);
        let result;
        for (let i = 0; i < 300; i++) {
            result = await evaluate(`document.documentElement.getAttribute('data-place-background-check')`);
            if (result) break;
            await sleep(100);
        }
        if (!result) throw new Error('Places UI fixture timed out.');
        const outcome = JSON.parse(result);
        if (outcome.error || !Object.values(outcome.editor || {}).every(Boolean) || !outcome.autoToggle
            || !outcome.first || !outcome.second || outcome.empty
            || outcome.inn !== 'url("user/images/inn.png")'
            || outcome.road !== 'url("user/images/road.png")' || outcome.saves !== 2) {
            throw new Error(JSON.stringify(outcome));
        }
        console.log('Castward live Places editor and background checks passed.');
    } finally {
        if (socket?.readyState === WebSocket.OPEN) socket.close();
        await new Promise(resolve => {
            if (child.exitCode !== null) return resolve();
            child.once('exit', resolve);
            child.kill();
            setTimeout(resolve, 2000);
        });
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
