import {SCHEMA,SAVE_KEY} from './browser-version.mjs';
import * as THREE from 'three';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const port=4176,base=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
let output='';server.stdout.on('data',s=>output+=s);server.stderr.on('data',s=>output+=s);
const results=[],errors=[];
let browser;
const check=async(name,fn)=>{await fn();results.push(name);console.log(`PASS ${name}`);};
try{
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===59)throw new Error(output);await delay(150);}
  await mkdir('artifacts',{recursive:true});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const snap=()=>page.evaluate(()=>window.__ALONGLINE__.snapshot());
  const ready=()=>page.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render?.triangles>1000);
  const mode=m=>page.locator(`[data-mode="${m}"]`).click();
  const endpoints=async(a,b)=>{await page.locator('#track-from').selectOption(a);await page.locator('#track-to').selectOption(b);};
  // Deliberate two immediate DOM clicks exercise reentrancy while real pointer clicks cover selection and the modal.
  const confirm=()=>page.locator('#confirm-construction').evaluate(b=>{b.click();b.click();});
  const save=async()=>{await page.locator('#save-menu').click();await page.locator('#save-now').click();await page.locator('#save-dialog .dialog-close').click();};
  const importDoc=async(doc)=>{await page.locator('#save-menu').click();await page.locator('#import-file').setInputFiles({name:'test-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.locator('#save-dialog .dialog-close').click();};
  await page.goto(`${base}?diagnostics=1`);await ready();await page.locator('#pause').click();
  await check('cancel does not charge; two real station builds charge once each',async()=>{
    await page.locator('[data-route="A"]').click();await page.locator('#build-station').click();assert.equal((await snap()).world.economy.balance,100000);
    await page.locator('#construction-dialog .dialog-close').click();assert.equal(Object.keys((await snap()).world.railway.stations).length,0);
    await page.locator('#build-station').click();await confirm();assert.equal((await snap()).world.economy.balance,92000);
    await page.locator('[data-route="B"]').click();await page.locator('#build-station').click();await page.locator('#confirm-construction').click();
    const s=await snap();assert.equal(s.world.economy.balance,84000);assert.equal(Object.keys(s.world.railway.stations).length,2);assert.equal(s.world.economy.ledger.length,2);assert.equal(await page.locator('#build-station').count(),0);
  });
  await check('map endpoint picking previews 12000 without charging; locked D/C explain rejection',async()=>{
    await mode('track');await page.locator('[data-node="node-a"]').click();await page.locator('[data-node="node-b"]').click();
    assert.match(await page.locator('#preview-cost').innerText(),/12,000/);assert.equal((await snap()).world.economy.balance,84000);
    assert.deepEqual((await snap()).editor,{mode:'track',from:'node-a',to:'node-b'});
    await page.waitForFunction(()=>!window.__ALONGLINE__.snapshot().render.needsRender);assert.ok((await snap()).render.previewSegments>0);await page.screenshot({path:'artifacts/stage-2-preview.png'});
    await page.locator('#track-to').selectOption('node-d');assert.equal(await page.locator('#preview-build').isDisabled(),true);assert.match(await page.locator('#preview-reason').innerText(),/成长|200 人/);
    await page.locator('#track-to').selectOption('node-c');assert.match(await page.locator('#preview-reason').innerText(),/可选支线/);
    assert.equal((await snap()).world.economy.balance,84000);
    await page.locator('#clear-preview').click();
    const rect=await page.locator('canvas').boundingBox(),cameraState=(await snap()).world.camera;
    const camera=new THREE.PerspectiveCamera(37,rect.width/rect.height,1,950);camera.position.fromArray(cameraState.position);camera.lookAt(new THREE.Vector3(...cameraState.target));camera.updateMatrixWorld();
    let clicked=false;
    for(let i=0;i<16;i++){
      const angle=i*Math.PI/8;const p=new THREE.Vector3(-51+Math.cos(angle)*5.5,2.2,29+Math.sin(angle)*5.5).project(camera);
      const x=rect.x+(p.x+1)*rect.width/2,y=rect.y+(1-p.y)*rect.height/2;
      if(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName==='CANVAS',{x,y})){await page.mouse.click(x,y);clicked=true;break;}
    }
    assert.equal(clicked,true,'a ground point near A is available outside the node button');assert.equal((await snap()).editor.from,'node-a');
  });
  await check('confirm builds the graph and visible railway; complete path is duplicate-safe',async()=>{
    await endpoints('node-a','node-b');await page.locator('#preview-build').click();assert.match(await page.locator('#construction-amount').innerText(),/12,000/);await confirm();
    const s=await snap();assert.equal(s.world.economy.balance,72000);assert.equal(Object.keys(s.world.railway.tracks).length,3);assert.equal(s.line.ok,true);assert.deepEqual(s.line.nodes,['node-a','node-coast','node-valley','node-b']);assert.ok(s.render.railwayModels>0);
    assert.equal(await page.locator('#preview-build').isDisabled(),true);assert.match(await page.locator('#preview-reason').innerText(),/全部建成/);
    await page.locator('#preview-build').dispatchEvent('click');assert.equal((await snap()).world.economy.balance,72000);assert.equal((await snap()).world.economy.ledger.length,3);
  });
  await check('rename stations safely and reverse valid stop/path order; duplicate stops rejected',async()=>{
    await page.locator('[data-route="A"]').click();await page.locator('#station-name').fill('汐港始发');await page.locator('#rename-station').click();
    await page.locator('[data-route="B"]').click();await page.locator('#station-name').fill('青溪中央');await page.locator('#rename-station').click();
    const before=await snap();await page.locator('#station-name').fill('<script>');await page.locator('#rename-station').click();assert.equal((await snap()).world.railway.revision,before.world.railway.revision);
    await mode('line');await page.locator('#reverse-stops').click();assert.deepEqual((await snap()).world.railway.line.stops,['B','A']);assert.deepEqual((await snap()).line.nodes,['node-b','node-valley','node-coast','node-a']);
    const revision=(await snap()).world.railway.revision;
    await page.locator('[data-stop-index="1"]').selectOption('B');await page.locator('#save-stops').click();assert.equal((await snap()).world.railway.revision,revision);
    await page.locator('[data-stop-index="1"]').selectOption('A');await page.locator('#save-stops').click();
    assert.equal((await snap()).world.economy.balance,72000);assert.equal(await page.locator('#can-dispatch').getAttribute('data-ready'),'true');
    await mode('inspect');await page.locator('[data-town="B"]').click();await page.waitForFunction(()=>!window.__ALONGLINE__.snapshot().render.needsRender);await page.screenshot({path:'artifacts/stage-2-berths.png'});
    await page.locator('#home-view').click();await mode('line');await page.waitForTimeout(350);await page.screenshot({path:'artifacts/stage-2-built.png'});
  });
  await check('track demolition refunds once, invalidates the line and blocks deployment',async()=>{
    await mode('track');await page.locator('[data-remove-edge="ab-valley"]').click();assert.match(await page.locator('#construction-description').innerText(),/不可投车/);assert.match(await page.locator('#construction-amount').innerText(),/2,000/);await confirm();
    let s=await snap();assert.equal(s.world.economy.balance,74000);assert.equal(Object.keys(s.world.railway.tracks).length,2);assert.equal(s.line.ok,false);assert.equal(await page.locator('[data-remove-edge="ab-valley"]').count(),0);
    await mode('line');assert.match(await page.locator('#line-readiness').innerText(),/断开/);assert.equal(await page.locator('#can-dispatch').getAttribute('data-ready'),'false');assert.equal(await page.locator('#can-dispatch').isDisabled(),true);
    await page.screenshot({path:'artifacts/stage-2-disconnected.png'});
  });
  await check('save/reload preserves names, partial tracks, stop order, invalid path and exact funds',async()=>{
    await save();const original=await snap();
    for(let i=0;i<3;i++){await page.reload();await ready();const s=await snap();assert.deepEqual(s.world.railway,original.world.railway);assert.deepEqual(s.world.economy,original.world.economy);assert.deepEqual(s.line,original.line);assert.equal(s.render.objects,original.render.objects);}
    assert.equal((await snap()).world.railway.stations.B.name,'青溪中央');
  });
  await check('reconnect charges only missing track; station removal retains track and refunds once',async()=>{
    await mode('track');await endpoints('node-a','node-b');assert.match(await page.locator('#preview-cost').innerText(),/4,000/);await page.locator('#preview-build').click();await confirm();assert.equal((await snap()).world.economy.balance,70000);assert.equal((await snap()).line.ok,true);
    await page.locator('[data-route="A"]').click();const purchase=(await snap()).world.railway.stations.A.purchaseId;await page.locator('#remove-station').click();await confirm();let s=await snap();assert.equal(s.world.economy.balance,74000);assert.equal(Object.keys(s.world.railway.tracks).length,3);assert.equal(s.line.ok,false);
    await page.locator('#build-station').click();await confirm();s=await snap();assert.equal(s.world.economy.balance,66000);assert.notEqual(s.world.railway.stations.A.purchaseId,purchase);assert.equal(s.line.ok,true);
    await page.locator('#station-name').fill('汐港始发');await page.locator('#rename-station').click();
  });
  let exported;
  await check('v2 export/import retains assets, route, historical purchase allocations and funds',async()=>{
    await page.locator('#save-menu').click();const download=page.waitForEvent('download');await page.locator('#export-save').click();await (await download).saveAs('artifacts/stage-2-save.json');exported=JSON.parse(await readFile('artifacts/stage-2-save.json','utf8'));assert.equal(exported.schemaVersion,SCHEMA);
    await page.locator('#save-dialog .dialog-close').click();const before=await snap();await importDoc(exported);assert.deepEqual((await snap()).world,before.world);
  });
  const legacy=JSON.parse(await readFile('tests/fixtures/stage1-v1.json','utf8'));
  await check('real v1 schema import migrates camera/time/funds and initializes an empty railway',async()=>{
    await importDoc(legacy);const s=await snap();assert.equal(s.world.clock.minutes,482);assert.equal(s.world.clock.paused,true);assert.equal(s.world.economy.balance,100000);assert.equal(Object.keys(s.world.railway.tracks).length,0);assert.equal(s.line.ok,false);assert.equal(s.world.selected,'B');assert.deepEqual(s.world.camera.target,[0,0,-3]);
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).schemaVersion,SAVE_KEY),SCHEMA);
    await importDoc(exported);
  });
  await check('insufficient money and locked station leave financial and asset state unchanged',async()=>{
    const low=structuredClone(legacy);low.world.economy={balance:3000,ledger:[{id:'fixture-expense',amount:-97000,reason:'合法低资金验收场景',tick:20}]};await importDoc(low);
    const before=await snap();await page.locator('#build-station').click();assert.equal((await snap()).world.economy.balance,3000);assert.deepEqual((await snap()).world.railway,before.world.railway);
    await mode('track');await endpoints('node-a','node-b');assert.match(await page.locator('#preview-reason').innerText(),/资金不足/);assert.equal(await page.locator('#preview-build').isDisabled(),true);
    await page.locator('[data-route="D"]').click();assert.equal(await page.locator('#build-station').isDisabled(),true);assert.equal((await snap()).world.economy.balance,3000);
    await importDoc(exported);
  });
  await check('constructed railway works after offline reload and keeps live pause/speed controls',async()=>{
    await save();await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await ready();assert.deepEqual((await snap()).world.railway,exported.world.railway);assert.equal((await snap()).line.ok,true);await context.setOffline(false);
    const frozen=(await snap()).world.clock.minutes;await page.waitForTimeout(300);assert.equal((await snap()).world.clock.minutes,frozen);
    await page.locator('[data-speed="2"]').click();await page.locator('#pause').click();await page.waitForTimeout(400);assert.ok((await snap()).world.clock.minutes>frozen);await page.locator('#pause').click();assert.equal((await snap()).world.economy.balance,66000);
  });
  const desktop=await snap();
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(`${base}?diagnostics=1`);await mobile.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render?.triangles>1000);
  await check('touch UI can build a station and preview/confirm a corridor without overflow',async()=>{
    await mobile.locator('[data-route="A"]').tap();await mobile.locator('#build-station').tap();await mobile.locator('#confirm-construction').tap();assert.equal(await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.economy.balance),92000);
    await mobile.locator('[data-mode="track"]').tap();await mobile.locator('#track-from').selectOption('node-a');await mobile.locator('#track-to').selectOption('node-b');await mobile.locator('#preview-build').tap();await mobile.locator('#confirm-construction').tap();assert.equal(await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.economy.balance),80000);
    await mobile.locator('[data-mode="line"]').tap();assert.equal(await mobile.locator('#can-dispatch').getAttribute('data-ready'),'false');assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await mobile.locator('#collapse-tools').tap();assert.equal(await mobile.locator('#collapse-tools').getAttribute('aria-expanded'),'false');await mobile.screenshot({path:'artifacts/stage-2-mobile.png'});
    await mobile.locator('#collapse-tools').tap();assert.equal(await mobile.locator('#collapse-tools').getAttribute('aria-expanded'),'true');
  });
  await check('legacy localStorage fallback reads v1 and preserves the original backup key',async()=>{
    const c=await browser.newContext({viewport:{width:1000,height:800}});await c.addInitScript(save=>localStorage.setItem('alongline-town.save.v1',JSON.stringify(save)),legacy);const p=await c.newPage();await p.goto(`${base}?diagnostics=1`);await p.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render?.triangles>1000);assert.equal(await p.evaluate(()=>window.__ALONGLINE__.snapshot().world.clock.minutes),482);
    await p.locator('#save-menu').click();await p.locator('#save-now').click();assert.equal(await p.evaluate(({key,version})=>!!localStorage.getItem('alongline-town.save.v1')&&JSON.parse(localStorage.getItem(key)).schemaVersion===version,{key:SAVE_KEY,version:SCHEMA}),true);await c.close();
  });
  await check('no browser JavaScript errors during construction',async()=>assert.deepEqual(errors,[]));
  await writeFile('artifacts/construction-report.json',JSON.stringify({at:new Date().toISOString(),browser:await browser.version(),checks:results,desktop,errors},null,2));console.log(JSON.stringify({checks:results.length,balance:desktop.world.economy.balance,line:desktop.line,render:desktop.render},null,2));
}catch(e){console.error(e);throw e;}finally{await browser?.close();server.kill();}
