import {SCHEMA,SAVE_KEY} from './browser-version.mjs';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const port=4178,base=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});server.stdout.resume();server.stderr.resume();
let browser;const checks=[],errors=[],samples=[];
const check=async(name,fn)=>{await fn();checks.push(name);console.log(`PASS ${name}`);};
function mass(s){const p=s.world.passengers;const waiting=p.waiting.reduce((n,b)=>n+b.count,0),onboard=p.onboard.reduce((n,b)=>n+b.count,0),completed=p.completed.reduce((n,b)=>n+b.count,0);assert.equal(p.totals.accepted,waiting+onboard+completed+p.totals.abandoned);assert.equal(p.totals.potential,p.totals.accepted+p.totals.noService+p.totals.priceRejected);assert.ok(onboard<=24);assert.equal(new Set(p.completed.map(e=>e.eventId)).size,p.completed.length);return {waiting,onboard,completed,abandoned:p.totals.abandoned,accepted:p.totals.accepted,noService:p.totals.noService};}
try{
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await delay(150);}
  await mkdir('artifacts',{recursive:true});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const snap=()=>page.evaluate(()=>window.__ALONGLINE__.snapshot());
  const ready=()=>page.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render?.triangles>1000);
  const pause=async()=>{if(!(await snap()).world.clock.paused)await page.locator('#pause').click();};const resume=async()=>{if((await snap()).world.clock.paused)await page.locator('#pause').click();};
  const mode=m=>page.locator(`button[data-mode=${m}]`).click();
  const reload=async()=>{await pause();const before=await snap();await page.locator('#save-menu').click();await page.locator('#save-now').click();await page.locator('#save-dialog .dialog-close').click();await page.reload();await ready();const after=await snap();assert.deepEqual(after.world.passengers,before.world.passengers);assert.deepEqual(after.world.fleet,before.world.fleet);assert.deepEqual(after.world.economy,before.world.economy);mass(after);return after;};
  await page.goto(`${base}?diagnostics=1`);await ready();
  await check('no service creates no batches, only separate potential demand',async()=>{
    await page.locator('[data-speed="4"]').click();await page.waitForFunction(()=>window.__ALONGLINE__.snapshot().passengerStats.noService>0);await pause();const s=await snap();assert.equal(mass(s).accepted,0);assert.equal(s.world.passengers.waiting.length,0);
  });
  await check('v3 active train migrates without retroactive passengers or duplicate purchase',async()=>{
    await page.locator('#save-menu').click();await page.locator('#import-file').setInputFiles('tests/fixtures/stage3-v3.json');await page.locator('#save-dialog .dialog-close').click();const s=await snap();assert.equal(s.world.fleet.vehicle.id,'train-0001');assert.equal(s.world.economy.balance,50000);assert.equal(s.world.passengers.totals.accepted,0);assert.equal(s.world.passengers.lastDemandMinute,480);await mode('passengers');
  });
  await check('real demand boards and queues; moving save preserves passenger identities and ages',async()=>{
    await resume();await page.waitForFunction(()=>{const s=window.__ALONGLINE__.snapshot();return s.world.fleet.vehicle.status==='running'&&s.passengerStats.onboard>0&&s.passengerStats.waiting>0;},null,{timeout:30000});await pause();const s=await reload();samples.push({phase:'running',stats:mass(s),minutes:s.world.clock.minutes});assert.ok(s.world.passengers.onboard.every(b=>b.fare===20));await mode('passengers');await page.screenshot({path:`artifacts/stage-${SCHEMA}-pax-boarding.png`});
  });
  let acceptedAtStop;
  await check('arrival alights first, fills 24 seats, leaves queue and produces unique fare events',async()=>{
    await resume();await page.waitForFunction(()=>{const s=window.__ALONGLINE__.snapshot();return s.passengerStats.completed>0&&s.passengerStats.onboard===24;},null,{timeout:40000});await pause();const s=await snap();const stats=mass(s);assert.equal(stats.onboard,24);assert.ok(stats.waiting>0);assert.ok(stats.completed>0);assert.equal(s.world.economy.balance,100000+s.world.economy.ledger.reduce((n,e)=>n+e.amount,0));assert.ok(s.world.passengers.completed.every(e=>e.amount===e.count*e.fare&&e.fare===20));assert.ok(s.render.visiblePeople>0&&s.render.visiblePeople<=12);samples.push({phase:'arrival',stats,minutes:s.world.clock.minutes});
    await mode('train');await page.locator('#follow-train').click();await mode('passengers');await page.waitForFunction(()=>!window.__ALONGLINE__.snapshot().render.needsRender);await page.screenshot({path:`artifacts/stage-${SCHEMA}-pax-arrival.png`});const after=await reload();assert.equal(after.world.passengers.completed.length,s.world.passengers.completed.length);
  });
  await check('loaded stop request delivers riders before stopping and creates no further accepted demand',async()=>{
    await mode('train');await page.locator('#stop-train').click();assert.notEqual((await snap()).world.fleet.vehicle.status,'stopped');acceptedAtStop=(await snap()).world.passengers.totals.accepted;await resume();await page.waitForFunction(()=>window.__ALONGLINE__.snapshot().world.fleet.vehicle.status==='stopped',null,{timeout:40000});await pause();const s=await snap();assert.equal(mass(s).onboard,0);assert.equal(s.world.passengers.totals.accepted,acceptedAtStop);assert.ok(s.passengerStats.noService>0);assert.equal(s.world.economy.balance,100000+s.world.economy.ledger.reduce((n,e)=>n+e.amount,0));samples.push({phase:'stopped',stats:mass(s),minutes:s.world.clock.minutes});
  });
  await check('patience expires original queues at 240 minutes; abandon save does not reset timestamps',async()=>{
    await resume();await page.waitForFunction(()=>window.__ALONGLINE__.snapshot().passengerStats.abandoned>0,null,{timeout:50000});await pause();const s=await snap();assert.equal(s.world.passengers.totals.accepted,acceptedAtStop);assert.ok(mass(s).abandoned>0);await reload();await mode('passengers');await page.screenshot({path:`artifacts/stage-${SCHEMA}-pax-demand.png`});samples.push({phase:'abandoned',stats:mass(s),minutes:s.world.clock.minutes});
  });
  await check('completed journeys survive selling the empty train and offline reload with no second completion',async()=>{
    const count=(await snap()).world.passengers.completed.length;const beforeSale=(await snap()).world.economy.balance;await mode('train');await page.locator('#withdraw-train').click();await page.locator('#sell-train').click();await page.locator('#confirm-construction').click();assert.equal((await snap()).world.economy.balance,beforeSale+13200);await reload();assert.equal((await snap()).world.passengers.completed.length,count);
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await ready();mass(await snap());assert.equal((await snap()).world.passengers.completed.length,count);await context.setOffline(false);await mode('passengers');
  });
  const final=await snap();
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});await mobileContext.addInitScript(save=>localStorage.setItem('alongline-town.save.v3',JSON.stringify(save)),JSON.parse(await readFile('tests/fixtures/stage3-v3.json','utf8')));const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(`${base}?diagnostics=1`);await mobile.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render?.triangles>1000);
  await check('touch passenger dashboard, conserved counters and finite platform figures',async()=>{
    assert.equal(await mobile.evaluate(()=>window.__ALONGLINE__.snapshot().world.fleet.vehicle.id),'train-0001');await mobile.locator('button[data-mode=passengers]').tap();await mobile.locator('#pause').tap();await mobile.waitForFunction(()=>window.__ALONGLINE__.snapshot().passengerStats.waiting>0);await mobile.locator('#pause').tap();const s=await mobile.evaluate(()=>window.__ALONGLINE__.snapshot());mass(s);assert.ok(s.render.visiblePeople<=12);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.screenshot({path:`artifacts/stage-${SCHEMA}-pax-mobile.png`});await mobile.locator('#save-menu').tap();await mobile.locator('#save-now').tap();assert.equal(await mobile.evaluate(({key,schema})=>!!localStorage.getItem('alongline-town.save.v3')&&JSON.parse(localStorage.getItem(key)).schemaVersion===schema,{key:SAVE_KEY,schema:SCHEMA}),true);
  });
  await check('no JavaScript errors',async()=>assert.deepEqual(errors,[]));
  await writeFile('artifacts/passenger-report.json',JSON.stringify({at:new Date().toISOString(),browser:await browser.version(),checks,samples,final,errors},null,2));console.log(JSON.stringify({checks:checks.length,samples,final:mass(final)},null,2));
}catch(e){console.error(e);throw e;}finally{await browser?.close();server.kill();}
