/** Unsaved scene sprite layout checks in headless Edge. */
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = () => new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
        const value = server.address().port;
        server.close(() => resolve(value));
    });
});

async function main() {
    const profile = mkdtempSync(path.join(tmpdir(), 'sillynpc-scene-ui-'));
    const browserPort = await port();
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-allow-origins=*', `--remote-debugging-port=${browserPort}`,
        `--user-data-dir=${profile}`, 'http://127.0.0.1:8000/'], { stdio: 'ignore', windowsHide: true });
    let socket, closeBrowser;
    try {
        let page;
        for (let i = 0; i < 100 && !page; i++) {
            try {
                const tabs = await (await fetch(`http://127.0.0.1:${browserPort}/json`)).json();
                page = tabs.find(tab => tab.type === 'page' && tab.url.includes('127.0.0.1:8000'));
            } catch { /* Browser is starting. */ }
            if (!page) await sleep(100);
        }
        if (!page) throw new Error('Headless Edge did not open SillyTavern.');
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        const pending = new Map(); let serial = 0;
        socket.onmessage = event => {
            const message = JSON.parse(event.data);
            if (!message.id) return;
            const waiter = pending.get(message.id); pending.delete(message.id);
            if (message.error) waiter.reject(new Error(message.error.message));
            else waiter.resolve(message.result);
        };
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++serial; pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
        closeBrowser = () => send('Browser.close');
        const evaluate = async expression => {
            const answer = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.text);
            return answer.result.value;
        };
        for (const [width, height] of [[1440, 1000], [390, 844]]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            let root;
            for (let i = 0; i < 200 && !root; i++) {
                root = await evaluate(`(() => { const entry = [...document.scripts].find(s => ['ST-Castward', 'SillyNPC-levels', 'SillyNPC-XP'].some(name => s.src.includes(name + '/index.js'))); return entry && document.getElementById('sillynpc-open-manage') ? new URL('.', entry.src).href : null; })()`);
                if (!root) await sleep(100);
            }
            if (!root) throw new Error('Castward did not become ready in SillyTavern.');
            await evaluate(`(() => { const script = document.createElement('script'); script.type = 'module'; script.id = 'sillynpc-scene-sprite-test'; script.src = ${JSON.stringify(root + 'tests/fixtures/ui-scene-sprites.js')} + '?width=' + innerWidth; document.head.append(script); })()`);
            let result;
            for (let i = 0; i < 200 && !result; i++) {
                result = await evaluate(`document.documentElement.getAttribute('data-scene-sprite-test')`);
                if (!result) await sleep(100);
            }
            await evaluate(`(() => { document.getElementById('sillynpc-scene-sprite-test')?.remove(); document.documentElement.removeAttribute('data-scene-sprite-test'); })()`);
            if (!result) throw new Error(`Scene sprite fixture timed out at ${width}px.`);
            const parsed = JSON.parse(result);
            if (parsed.error) throw new Error(parsed.error);
            console.log(JSON.stringify({ viewport: [width, height], ...parsed }));
        }
    } finally {
        try { await Promise.race([closeBrowser?.(), sleep(1000)]); } catch { /* Browser already closed. */ }
        socket?.close();
        if (child.exitCode === null) child.kill();
        await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]);
        for (let i = 0; i < 20; i++) {
            try { rmSync(profile, { recursive: true, force: true }); break; }
            catch { if (i === 19) console.warn(`Temporary Edge profile remains: ${profile}`); await sleep(100); }
        }
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
