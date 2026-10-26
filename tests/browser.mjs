import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const port=4175,base=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
let serverOutput='';server.stdout.on('data',d=>serverOutput+=d);server.stderr.on('data',d=>serverOutput+=d);
let browser;
const results=[],errors=[];
const check=(name,fn)=>async()=>{await fn();results.push(name);console.log(`PASS ${name}`);};
try{
  for(let i=0;i<60;i++){try{const r=await fetch(base);if(r.ok)break;}catch{}if(i===59)throw new Error(`Preview failed: ${serverOutput}`);await delay(150);}
  await mkdir('artifacts',{recursive:true});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const requests=[];page.on('request',r=>requests.push(r.url()));
  const snap=()=>page.evaluate(()=>window.__ALONGLINE__.snapshot());
  const ready=()=>page.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render?.triangles>1000);
  await page.goto(`${base}?diagnostics=1`);await ready();await page.waitForTimeout(1000);
  await check('map opens, three regions, candidate plots, initial funds',async()=>{
    const s=await snap();assert.equal(s.world.economy.balance,100000);assert.equal(Object.keys(s.world.towns).length,3);
    assert.equal(await page.locator('.town-label').count(),3);assert.equal(await page.locator('.station-pin').count(),3);
    assert.ok(s.render.trees>100);assert.ok(s.render.houses>=25);assert.equal(await page.locator('#webgl-error').isVisible(),false);
    await page.screenshot({path:'artifacts/regression-desktop.png'});
  })();
  await check('candidate selection, B passing berths, locked D, cancel',async()=>{
    await page.locator('[data-station="B"]').click();assert.equal((await snap()).world.selected,'B');
    assert.match(await page.locator('#selection-panel').innerText(),/两个会让泊位/);
    await page.locator('[data-route="D"]').click();assert.match(await page.locator('#selection-panel').innerText(),/成长|200 人/);
    await page.locator('canvas').focus();await page.keyboard.press('Escape');assert.equal((await snap()).world.selected,null);
    await page.locator('[data-station="A"]').click();await page.locator('canvas').click({position:{x:90,y:80}});assert.equal((await snap()).world.selected,null);
  })();
  await check('pause freezes simulation; speed buttons do not touch camera or selection',async()=>{
    await page.locator('#pause').click();const before=await snap();await page.waitForTimeout(700);
    assert.equal((await snap()).world.clock.minutes,before.world.clock.minutes);
    await page.locator('[data-speed="4"]').click();let after=await snap();assert.equal(after.world.clock.speed,4);assert.equal(after.world.clock.paused,true);assert.deepEqual(after.world.camera,before.world.camera);assert.equal(after.world.selected,before.world.selected);
    await page.locator('#pause').click();await page.waitForTimeout(700);assert.ok((await snap()).world.clock.minutes>before.world.clock.minutes);
    await page.locator('#pause').click();await page.locator('[data-speed="1"]').click();
  })();
  await check('rotate / pan / zoom and camera bounds; Home reset',async()=>{
    const before=(await snap()).world.camera;
    const r=await page.locator('canvas').boundingBox();const x=r.x+r.width*.5,y=r.y+r.height*.73;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+180,y+140,{steps:8});await page.mouse.up();await page.waitForTimeout(700);
    assert.notDeepEqual((await snap()).world.camera,before);
    await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x+800,y+700,{steps:5});await page.mouse.up({button:'right'});
    await page.mouse.wheel(0,100000);await page.waitForTimeout(500);
    for(let i=0;i<9;i++)await page.locator('#zoom-in').click();
    const closeCamera=(await snap()).world.camera;
    const closeDistance=Math.hypot(...closeCamera.position.map((n,i)=>n-closeCamera.target[i]));
    assert.ok(Math.abs(closeDistance-50)<.1);
    for(let i=0;i<8;i++)await page.locator('#zoom-out').click();
    const c=(await snap()).world.camera;const d=Math.hypot(...c.position.map((n,i)=>n-c.target[i]));const polar=Math.acos((c.position[1]-c.target[1])/d);
    assert.ok(d>=49.9&&d<=285.1);assert.ok(polar>=.239&&polar<=1.101);assert.equal(c.target[1],0);assert.ok(Math.abs(c.target[0])<=95&&Math.abs(c.target[2])<=70);assert.ok(c.position[1]>20);
    await page.locator('canvas').focus();await page.keyboard.press('Home');await page.waitForTimeout(300);assert.deepEqual((await snap()).world.camera.target,[0,0,-3]);
  })();
  let saved;
  await check('save/load/reload retains world and camera without duplicate objects',async()=>{
    await page.locator('[data-station="B"]').click();await page.locator('#focus-station').click();await page.waitForTimeout(300);
    await page.locator('#save-menu').click();await page.locator('#save-now').click();saved=await snap();
    for(let i=0;i<3;i++)await page.locator('#load-save').click();const loaded=await snap();
    assert.equal(loaded.render.objects,saved.render.objects);assert.equal(loaded.world.economy.balance,100000);assert.equal(loaded.world.selected,'B');
    await page.locator('#save-dialog .dialog-close').click();await page.reload();await ready();
    const reloaded=await snap();assert.equal(reloaded.render.objects,saved.render.objects);assert.equal(reloaded.world.clock.minutes,saved.world.clock.minutes);assert.equal(reloaded.world.clock.paused,true);assert.equal(reloaded.world.selected,'B');assert.equal(Object.keys(reloaded.world.towns).length,3);
    for(let i=0;i<3;i++)assert.ok(Math.abs(reloaded.world.camera.position[i]-saved.world.camera.position[i])<1e-6);
  })();
  await check('export/import and invalid import are atomic',async()=>{
    await page.locator('#save-menu').click();const dl=page.waitForEvent('download');await page.locator('#export-save').click();const download=await dl;await download.saveAs('artifacts/exported-save.json');
    const before=await snap();
    await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('有效的 JSON'));
    assert.deepEqual((await snap()).world,before.world);
    await page.locator('#import-file').setInputFiles('artifacts/exported-save.json');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('导入成功'));
    assert.equal((await snap()).world.selected,'B');assert.equal((await snap()).render.objects,before.render.objects);
    await page.locator('#save-dialog .dialog-close').click();
  })();
  await check('offline reload works with bundled assets, no remote core requests',async()=>{
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    assert.equal(requests.filter(u=>!u.startsWith(base)&&!u.startsWith('blob:')&&!u.startsWith('data:')).length,0);
    await context.setOffline(true);await page.reload();await ready();assert.equal((await snap()).world.selected,'B');await context.setOffline(false);
  })();
  await page.locator('#home-view').click();await page.waitForTimeout(600);
  await page.screenshot({path:'artifacts/regression-desktop.png'});
  const frameIntervals=await page.evaluate(()=>new Promise(resolve=>{
    const times=[];let last=performance.now();
    function sample(now){times.push(now-last);last=now;if(times.length<90)requestAnimationFrame(sample);else resolve(times.slice(5).sort((a,b)=>a-b));}
    requestAnimationFrame(sample);
  }));
  const performance=await snap();
  performance.idleFrameBaseline={samples:frameIntervals.length,medianFrameMs:frameIntervals[Math.floor(frameIntervals.length/2)],p95FrameMs:frameIntervals[Math.floor(frameIntervals.length*.95)]};
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';});
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const mobile=await mobileContext.newPage();
  mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(`${base}?diagnostics=1`);await mobile.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render);
  await check('touch layout, tap selection and real two-finger pan/pinch',async()=>{
    await mobile.locator('[data-route="A"]').tap();assert.equal(await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.selected),'A');
    await mobile.locator('#focus-station').tap();await mobile.locator('#home-view').tap();
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const before=await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.camera);
    const cdp=await mobileContext.newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:135,y:350,id:1},{x:245,y:350,id:2}]});
    for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:135-i*8,y:350+i*5,id:1},{x:245+i*8,y:350+i*5,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForTimeout(500);
    const after=await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.camera);assert.notDeepEqual(after,before);
    await mobile.locator('#pause').tap();const paused=await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.clock.minutes);await mobile.waitForTimeout(400);assert.equal(await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.clock.minutes),paused);
    await mobile.locator('#home-view').tap();await mobile.waitForTimeout(300);await mobile.screenshot({path:'artifacts/regression-mobile.png'});
  })();
  await check('no browser JavaScript errors',async()=>assert.deepEqual(errors,[]))();
  const report={at:new Date().toISOString(),browser:await browser.version(),viewport:{width:1440,height:1000},gpu,checks:results,performance,errors};
  await writeFile('artifacts/regression-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({checks:results.length,performance:performance.performance,render:performance.render,gpu},null,2));
}finally{await browser?.close();server.kill();}
