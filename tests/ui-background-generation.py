"""Unsaved background recovery and busy-input checks; no image/model requests."""
import json
import time
from ui_webdriver import browser_session

with browser_session() as browser:
    browser.execute(r"""const entry=[...document.scripts].find(s=>s.src.includes('/SillyNPC-XP/index.js'));
    const script=document.createElement('script'); script.type='module'; script.id='castward-background-check';
    script.textContent=`
    const root=${JSON.stringify(new URL('.',entry.src).href)};
    const out={};
    const {SlashCommandParser}=await import('/scripts/slash-commands/SlashCommandParser.js');
    const {SlashCommand}=await import('/scripts/slash-commands/SlashCommand.js');
    const {executeSlashCommandsOnChatInput,executeSlashCommandsWithOptions}=await import('/scripts/slash-commands.js');
    const {getContext}=await import('/scripts/st-context.js');
    const imagine=SlashCommandParser.commands.imagine;
    const original=imagine.callback;
    let release, busy;
    const background=document.querySelector('#bg1');
    const oldBackground=background.style.backgroundImage;
    try {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name:'castward-background-fixture-wait',callback:()=>new Promise(resolve=>{release=resolve})
        }));
        busy=executeSlashCommandsOnChatInput('/castward-background-fixture-wait');
        for(let i=0;i<100&&!release;i++) await new Promise(r=>setTimeout(r,10));
        if(!release) throw Error('Busy input fixture did not start');
        out.busyRunnerReturnsNull=await executeSlashCommandsOnChatInput('/imagine quiet=true fixture')===null;
        let active=0, peak=0; const prompts=[];
        imagine.callback=async(args,prompt)=>{
            active++; peak=Math.max(peak,active); prompts.push(prompt);
            await new Promise(r=>setTimeout(r,30)); active--;
            return '/user/images/background-fixture.png';
        };
        const source=(await (await fetch(root+'src/api/api-image-generate.js')).text())
            .replace(/^import\\s+[\\s\\S]*?\\s+from\\s+['"][^'"]+['"];\\s*/gm,'').replaceAll('export ','');
        const generate=new Function('getContext','executeSlashCommandsWithOptions','applyMacros',
            'debugLog','recordUsage','DEFAULT_IMAGE_NEGATIVE_PROMPT',source+';return generateImage;')
            (getContext,executeSlashCommandsWithOptions,v=>v,()=>{},()=>{},'');
        const paths=await Promise.all(['First landscape','Second landscape'].map(prompt=>generate(prompt,{shape:{}})));
        out.bothReturned=paths.every(path=>path==='/user/images/background-fixture.png');
        out.serialized=peak===1&&prompts.join(',')==='First landscape,Second landscape';
        const {syncPlaceBackground}=await import(root+'src/locations/location-background.js');
        const metadata={sillynpc_status_state:{locations:{enabled:true,currentId:'inn',records:{
            inn:{name:'Inn',backgroundImage:'url("user/images/background-fixture.png")'}
        }}}};
        const context={chatMetadata:metadata,getCurrentChatId:()=> 'fixture',saveMetadataDebounced:()=>{}};
        out.first=syncPlaceBackground(context,background);
        background.style.backgroundImage='none';
        out.recovered=syncPlaceBackground(context,background)
            &&background.style.backgroundImage===metadata.custom_background;
        metadata.custom_background='url("other.png")';
        out.metadataRecovered=syncPlaceBackground(context,background)
            &&metadata.custom_background===background.style.backgroundImage;
        out.idempotent=syncPlaceBackground(context,background)===false;
    } catch(error) {out.error=String(error.stack||error)}
    finally {
        imagine.callback=original;
        delete SlashCommandParser.commands['castward-background-fixture-wait'];
        release?.(''); if(busy) await busy;
        background.style.backgroundImage=oldBackground;
        document.getElementById('castward-background-check')?.remove();
        document.documentElement.setAttribute('data-background-check',JSON.stringify(out));
    }`;
    document.body.append(script);""")
    result = None
    for _ in range(300):
        result = browser.execute("return document.documentElement.getAttribute('data-background-check')")
        if result:
            break
        time.sleep(0.1)
    assert result, 'Background check timed out'
    data = json.loads(result)
    browser.execute("document.documentElement.removeAttribute('data-background-check')")
    assert 'error' not in data, data
    assert all(data.values()), data
    print(json.dumps(data, indent=2))
