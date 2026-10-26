import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const port=4177,base=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});server.stdout.resume();server.stderr.resume();
let browser;const checks=[],errors=[],observations=[];
const check=async(name,fn)=>{await fn();checks.push(name);console.log(`PASS ${name}`);};
try{
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await delay(150);}
  await mkdir('artifacts',{recursive:true});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const snap=()=>page.evaluate(()=>window.__ALONGLINE__.snapshot());
  const ready=()=>page.waitForFunction(()=>window.__ALONGLINE__?.snapshot().render?.triangles>1000);
  const mode=m=>page.locator(`button[data-mode=${m}]`).click();
  const resume=async()=>{if((await snap()).world.clock.paused)await page.locator('#pause').click();};
  const pause=async()=>{if(!(await snap()).world.clock.paused)await page.locator('#pause').click();};
  const reloadAt=async(status)=>{
    await page.waitForFunction(s=>window.__ALONGLINE__.snapshot().world.fleet.vehicle?.status===s,status,{timeout:80000});await pause();
    const before=await snap();assert.equal(before.world.fleet.vehicle.status,status);
    await page.locator('#save-menu').click();await page.locator('#save-now').click();await page.locator('#save-dialog .dialog-close').click();
    await page.reload();await ready();const after=await snap();assert.deepEqual(after.world.fleet,before.world.fleet);assert.deepEqual(after.world.economy,before.world.economy);assert.equal(after.render.trainModels,1);observations.push({status,minutes:after.world.clock.minutes,train:after.world.fleet.vehicle});
    await mode('train');await page.screenshot({path:`artifacts/stage-3-${status}.png`});await resume();
  };
  await page.goto(`${base}?diagnostics=1`);await ready();
  await page.locator('#save-menu').click();await page.locator('#import-file').setInputFiles('tests/fixtures/stage2-v2.json');await page.locator('#save-dialog .dialog-close').click();
  await check('v2 migration, real purchase, depot and one allocation',async()=>{
    assert.equal((await snap()).world.economy.balance,72000);await mode('train');await page.locator('[data-buy=light]').click();await page.locator('#confirm-construction').evaluate(b=>{b.click();b.click();});assert.equal((await snap()).world.economy.balance,50000);
    await page.locator('#dispatch-train').click();assert.equal((await snap()).world.fleet.vehicle.status,'ready');assert.equal((await snap()).world.fleet.vehicle.id,'train-0001');
    await page.locator('[data-speed="4"]').click();await resume();
  });
  await check('running save/reload and actual track removal guard',async()=>{
    await reloadAt('running');await pause();const before=await snap();await mode('track');await page.locator('[data-remove-edge=ab-valley]').click();assert.equal(await page.locator('#construction-dialog').isVisible(),false);assert.deepEqual((await snap()).world.economy,before.world.economy);assert.ok((await snap()).world.railway.tracks['ab-valley']);
    await mode('line');const old=(await snap()).world.fleet.vehicle.route.stops;await page.locator('#reverse-stops').click();assert.deepEqual((await snap()).world.fleet.vehicle.route.stops,old);assert.ok((await snap()).world.fleet.vehicle.pendingStops);
    await mode('train');await page.locator('#follow-train').click();await resume();await page.waitForFunction(()=>window.__ALONGLINE__.snapshot().world.fleet.vehicle.legElapsed>30);await pause();await page.screenshot({path:'artifacts/stage-3-cruise.png'});await resume();
  });
  await check('braking save/reload retains location and locked fare-independent money',async()=>await reloadAt('braking'));
  await check('dwell save/reload and safe pending route applied at station',async()=>{
    await reloadAt('dwelling');const v=(await snap()).world.fleet.vehicle;assert.deepEqual(v.route.stops,['B','A']);assert.equal(v.pendingStops,null);
  });
  await check('three full round trips observed in real browser with configured 4x time',async()=>{
    await page.waitForFunction(()=>window.__ALONGLINE__.snapshot().world.fleet.vehicle.legsCompleted>=6,null,{timeout:180000});await pause();
    const s=await snap();assert.ok(s.world.fleet.vehicle.legsCompleted>=6);assert.equal(s.world.economy.balance,50000);assert.equal(s.world.economy.ledger.filter(e=>e.vehicle?.kind==='buy').length,1);assert.equal(s.render.trainModels,1);observations.push({threeRoundTrips:s.world.fleet.vehicle.legsCompleted/2,minutes:s.world.clock.minutes});
    await mode('train');await page.screenshot({path:'artifacts/stage-3-follow.png'});
  });
  await check('stop safely, return depot, sell once, second model can be bought',async()=>{
    await page.locator('#stop-train').click();await resume();await page.waitForFunction(()=>window.__ALONGLINE__.snapshot().world.fleet.vehicle.status==='stopped',null,{timeout:30000});await pause();await mode('train');await page.locator('#withdraw-train').click();assert.equal((await snap()).world.fleet.vehicle.status,'depot');
    await page.locator('#sell-train').click();await page.locator('#confirm-construction').evaluate(b=>{b.click();b.click();});assert.equal((await snap()).world.economy.balance,63200);
    await page.locator('[data-buy=large]').click();await page.locator('#confirm-construction').click();assert.equal((await snap()).world.economy.balance,25200);assert.equal((await snap()).world.fleet.vehicle.id,'train-0002');assert.equal((await snap()).world.fleet.vehicle.type,'large');await page.waitForFunction(()=>window.__ALONGLINE__.snapshot().render.trainModels===1);
  });
  await check('no JavaScript errors',async()=>assert.deepEqual(errors,[]));
  await writeFile('artifacts/train-report.json',JSON.stringify({at:new Date().toISOString(),browser:await browser.version(),checks,observations,final:await snap(),errors},null,2));
}catch(e){console.error(e);throw e;}finally{await browser?.close();server.kill();}
