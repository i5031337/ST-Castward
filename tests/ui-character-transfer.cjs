/** Read-only Cast export fixture in the running SillyTavern frontend. */
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
        const value = server.address().port;
        server.close(() => resolve(value));
    });
});

async function main() {
    const profile = mkdtempSync(path.join(tmpdir(), 'castward-transfer-ui-'));
    const debugPort = await freePort();
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`, 'http://127.0.0.1:8000/'], { stdio: 'ignore', windowsHide: true });
    let socket;
    try {
        let page;
        for (let i = 0; i < 100; i++) {
            try {
                const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
                page = tabs.find(tab => tab.type === 'page' && tab.url.includes('127.0.0.1:8000'));
                if (page) break;
            } catch { /* browser starting */ }
            await sleep(100);
        }
        if (!page) throw new Error('Headless Edge did not open SillyTavern.');
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let nextId = 0;
        const pending = new Map();
        socket.onmessage = event => {
            const message = JSON.parse(event.data);
            if (!message.id) return;
            const waiter = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) waiter.reject(new Error(message.error.message));
            else waiter.resolve(message.result);
        };
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++nextId;
            pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async expression => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
            return result.result.value;
        };
        let root;
        for (let i = 0; i < 150; i++) {
            root = await evaluate(`(() => { const script = [...document.scripts].find(s =>
                /(?:ST-Castward|SillyNPC-levels|SillyNPC-XP)\\/index\\.js/.test(s.src));
                return script ? new URL('.', script.src).href : ''; })()`);
            if (root) break;
            await sleep(100);
        }
        if (!root) throw new Error('Castward did not load in the host.');
        for (let i = 0; i < 200; i++) {
            if (await evaluate(`Boolean(document.getElementById('sillynpc-open-manage'))`)) break;
            await sleep(100);
        }
        const fixture = `const result={};try{
            const {exportCharacters,parseTransferFile}=await import(${JSON.stringify(root + 'src/characters/character-transfer.js')});
            const uri='data:image/png;base64,YQ==';
            const card={id:'transfer-fixture',name:'Transfer Fixture',images:[uri],imageUrl:uri,
                imageTags:{[uri]:{Mood:'Calm'}},profile:{appearance:'A careful scout'},
                statusOverrides:{Rank:'4',HP:'3/10'},statusCollections:{conditions:[{name:'Bruised'}]},
                memories:{entries:[{text:'Found the lantern'}]},presentation:{}};
            const payload=await exportCharacters([card],{npcStats:[{name:'Rank',carryOver:true},
                {name:'HP',carryOver:false}]});
            const restored=parseTransferFile(JSON.stringify(payload)).characters[0];
            result.version=payload.version;result.profile=restored.profile.appearance;
            result.rank=restored.innateStats.Rank;result.noHP=!Object.hasOwn(restored.innateStats,'HP');
            result.condition=restored.collections.conditions[0].name;
            result.memory=restored.memories.entries[0].text;
            result.portrait=restored.images[restored.portrait]===uri;
            result.tag=restored.imageTags[0].Mood;
            result.ui=Boolean(document.getElementById('sillynpc-open-manage'));
        }catch(error){result.error=String(error.stack||error)}
        document.documentElement.setAttribute('data-transfer-fixture',JSON.stringify(result));`;
        await evaluate(`(() => { const s=document.createElement('script'); s.type='module';
            s.id='transfer-fixture'; s.textContent=${JSON.stringify(fixture)}; document.head.append(s); return true; })()`);
        let raw;
        for (let i = 0; i < 200; i++) {
            raw = await evaluate(`document.documentElement.getAttribute('data-transfer-fixture')`);
            if (raw) break;
            await sleep(100);
        }
        await evaluate(`(() => { document.getElementById('transfer-fixture')?.remove();
            document.documentElement.removeAttribute('data-transfer-fixture'); return true; })()`);
        if (!raw) throw new Error('Castward export fixture did not finish.');
        const result = JSON.parse(raw);
        console.log(result);
        if (result.error || result.version !== 3 || result.profile !== 'A careful scout'
            || result.rank !== '4' || !result.noHP || result.condition !== 'Bruised'
            || result.memory !== 'Found the lantern' || !result.portrait || result.tag !== 'Calm'
            || !result.ui) process.exitCode = 1;
        await Promise.race([send('Browser.close'), sleep(1000)]);
    } finally {
        socket?.close();
        if (child.exitCode === null) child.kill();
        await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3000)]);
        for (let i = 0; i < 20; i++) {
            try { rmSync(profile, { recursive: true, force: true }); break; }
            catch { await sleep(100); }
        }
    }
}

const watchdog = setTimeout(() => {
    console.error('Castward export browser check timed out.');
    process.exit(1);
}, 45000);
main().catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => clearTimeout(watchdog));
