import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createFixture} from '../bench/fixture.mjs';
import {launch,configure,waitProfile,train} from '../bench/browser.mjs';

const fixture=await createFixture({delay:35});
let context;
const checks=[],errors=[],observations={};
const check=async(name,fn)=>{await fn();checks.push(name);console.log(`PASS ${name}`);};
try{
 context=await launch({fixtureOrigin:fixture.origin});
 const page=await context.newPage();page.setDefaultTimeout(8000);
 page.on('pageerror',e=>errors.push(e.message));
 const {worker,extensionId}=await configure(context,fixture.origin,{mode:'measured'});
 await train(page,worker,fixture.origin);
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 const records=n=>fixture.log.slice(n).filter(r=>r.purpose.includes('prefetch'));
 const assets=n=>records(n).filter(r=>['/critical.css','/hero.png'].includes(r.path));
 async function prepare(route='/'){
  await page.goto('about:blank');await page.waitForTimeout(120);
  await cdp.send('Network.clearBrowserCache');
  await worker.evaluate(()=>chrome.storage.local.remove('ledger'));
  const mark=fixture.log.length;
  await page.goto(fixture.origin+route);await page.waitForTimeout(900);
  await page.mouse.move(1100,700);return mark;
 }
 async function save(overrides){
  const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText('Everything stays on this device.',{exact:true}).waitFor();
  const result=await options.evaluate(async overrides=>{
   const {config}=await chrome.runtime.sendMessage({type:'GET'});
   return chrome.runtime.sendMessage({type:'SAVE',config:{...config,...overrides}});
  },overrides);
  assert.equal(result.ok,true);await options.close();
 }
 await check('a short glance emits only the small document, not CSS or hero',async()=>{
  const n=await prepare();await page.locator('#target').hover();await page.waitForTimeout(300);
  assert.ok(records(n).some(r=>r.path==='/article'));
  assert.equal(assets(n).length,0);
  await page.mouse.move(1100,700);await page.waitForTimeout(650);
  assert.equal(assets(n).length,0);
  const ledger=await worker.evaluate(async()=> (await chrome.storage.local.get('ledger')).ledger);
  assert.equal(ledger.entries[0].requests,3); // Unused reservations are not refunded.
 });
 await check('a sustained hover emits the minimal learned set once',async()=>{
  const n=await prepare();await page.locator('#target').hover();await page.waitForTimeout(850);
  assert.equal(records(n).filter(r=>r.path==='/article').length,1);
  assert.equal(assets(n).length,2);
  await page.mouse.move(1100,700);await page.locator('#target').hover();await page.waitForTimeout(700);
  assert.equal(assets(n).length,2);
 });
 await check('hovering an unknown page does not consume a later known prediction',async()=>{
  const n=await prepare();await page.locator('#unknown').hover();await page.waitForTimeout(350);
  await page.locator('#target').hover();await page.waitForTimeout(850);
  assert.equal(assets(n).length,2);assert.ok(!records(n).some(r=>r.path==='/unknown'));
 });
 await check('pointer movement inside a nested link preserves dwell time',async()=>{
  const n=await prepare('/nested');await page.locator('#nested-a').hover();await page.waitForTimeout(310);
  await page.locator('#nested-b').hover();await page.waitForTimeout(330);
  assert.equal(assets(n).length,2);
 });
 await check('newly inserted sensitive form cancels the asset phase',async()=>{
  const n=await prepare();await page.locator('#target').hover();await page.waitForTimeout(280);
  await page.evaluate(()=>document.body.append(document.createElement('form')));
  await page.waitForTimeout(500);assert.equal(assets(n).length,0);
  assert.equal(await page.locator('[data-neuroload="hint"]').count(),0);
 });
 await check('keyboard navigation gets the same staged critical resources',async()=>{
  const n=await prepare();await page.keyboard.press('Tab');
  assert.equal(await page.locator('#target').evaluate(a=>a===document.activeElement),true);
  await page.waitForTimeout(850);assert.equal(assets(n).length,2);
 });
 await check('focus departure cancels the pending hero download',async()=>{
  const n=await prepare();await page.keyboard.press('Tab');await page.waitForTimeout(280);
  await page.keyboard.press('Tab');await page.waitForTimeout(600);assert.equal(assets(n).length,0);
 });
 for(const [label,attributes] of [ ['download',{download:''}], ['new tab',{target:'_blank'}], ['nofollow',{rel:'nofollow'}], ['per-link opt out',{'data-no-prefetch':''}] ]){
  await check(`${label} links never trigger speculation`,async()=>{
   const n=await prepare();await page.locator('#target').evaluate((a,attrs)=>{for(const [k,v]of Object.entries(attrs))a.setAttribute(k,v);},attributes);
   await page.locator('#target').hover();await page.waitForTimeout(750);assert.equal(records(n).length,0);
  });
 }
 await check('site opt out is respected without observing the whole DOM',async()=>{
  const n=await prepare('/opt-out');await page.locator('#target').hover();await page.waitForTimeout(750);assert.equal(records(n).length,0);
 });
 await check('different viewport rejects the old image profile',async()=>{
  await page.setViewportSize({width:600,height:800});const n=await prepare();
  await page.locator('#target').hover();await page.waitForTimeout(750);assert.equal(records(n).length,0);
  await page.setViewportSize({width:1200,height:800});
 });
 await check('tight page budget excludes the hero while retaining document and CSS',async()=>{
  await save({pageKiB:16});const n=await prepare();await page.locator('#target').hover();await page.waitForTimeout(850);
  assert.ok(records(n).some(r=>r.path==='/article'));assert.ok(records(n).some(r=>r.path==='/critical.css'));
  assert.ok(!records(n).some(r=>r.path==='/hero.png'));await save({pageKiB:256});
 });
 await check('daily cap rejects the entire plan before any speculative request',async()=>{
  await save({dayRequests:1});const n=await prepare();await page.locator('#target').hover();await page.waitForTimeout(850);
  assert.equal(records(n).length,0);await save({dayRequests:60});
 });
 await check('CSS already loaded by the source is not prefetched again',async()=>{
  const n=await prepare('/shared');await page.locator('#target').hover();await page.waitForTimeout(850);
  assert.ok(records(n).some(r=>r.path==='/hero.png'));
  assert.ok(!records(n).some(r=>r.path==='/critical.css'));
 });
 for(const route of ['/responsive','/offscreen','/failure','/redirect']){
  await check(`${route}: initial learning rejects unsupported image or navigation`,async()=>{
   await page.goto('about:blank');await cdp.send('Network.clearBrowserCache');
   await page.goto(fixture.origin+route);await page.waitForTimeout(850);
   const model=await worker.evaluate(async()=> (await chrome.storage.local.get('model')).model);
   if(route==='/failure'||route==='/redirect') assert.ok(!model.pages[fixture.origin+route]);
   else {assert.ok(model.pages[fixture.origin+route]);assert.ok(model.pages[fixture.origin+route].resources.every(r=>r.kind!=='image'));}
  });
 }
 await check('a late hero does not expand the initial learning window',async()=>{
  await page.goto(fixture.origin+'/slow',{waitUntil:'domcontentloaded'});
  await waitProfile(worker,fixture.origin+'/slow');
  const profile=await worker.evaluate(async url=> (await chrome.storage.local.get('model')).model.pages[url],fixture.origin+'/slow');
  assert.ok(profile.resources.every(r=>r.kind!=='image'));await page.waitForLoadState('load');
 });
 await check('idle learning predicts the document but requires intent for its assets',async()=>{
  await worker.evaluate(async({origin})=>{
   const {model}=await chrome.storage.local.get('model');model.edges[JSON.stringify([origin+'/',origin+'/article'])]={from:origin+'/',to:origin+'/article',count:8,at:Date.now()};
   await chrome.storage.local.set({model});
  },{origin:fixture.origin});
  const n=await prepare();await page.waitForTimeout(650);
  assert.ok(records(n).some(r=>r.path==='/article'));assert.equal(assets(n).length,0);
  await page.locator('#target').hover();await page.waitForTimeout(850);assert.equal(assets(n).length,2);
  await worker.evaluate(async()=>{const {model}=await chrome.storage.local.get('model');model.edges={};await chrome.storage.local.set({model});});
 });
 await check('CSP headers are preserved while native behavior is observed',async()=>{
  await prepare();const response=await page.goto(fixture.origin+'/csp');await page.waitForTimeout(900);
  assert.ok(response.headers()['content-security-policy'].includes("script-src 'self'"));
  const n=fixture.log.length;await page.locator('#target').hover();await page.waitForTimeout(850);
  observations.cspDocumentPrefetch=records(n).some(r=>r.path==='/article');
  assert.equal(await page.locator('script[src]').count(),0);
 });
 assert.deepEqual(errors,[]);
 await writeFile('.work/extended-browser-results.json',JSON.stringify({at:new Date().toISOString(),browser:context.browser().version(),checks,errors,observations},null,2));
 console.log(`${checks.length} extended browser checks passed`);
}finally{await context?.close();await fixture.close();}
