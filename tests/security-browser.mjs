import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createFixture} from '../bench/fixture.mjs';
import {launch,configure,train,workerFor} from '../bench/browser.mjs';

const fixture=await createFixture({delay:35});
let context;
const checks=[],observations={};
const profile=resolve('.work',`security-profile-${process.pid}-${Date.now()}`);
const check=async(name,fn)=>{await fn();checks.push(name);console.log(`PASS ${name}`);};
try{
 context=await launch({fixtureOrigin:fixture.origin,profile});
 const page=await context.newPage();page.setDefaultTimeout(8000);
 const {worker,extensionId}=await configure(context,fixture.origin,{mode:'measured'});
 await train(page,worker,fixture.origin);await page.waitForTimeout(700);await page.mouse.move(1100,700);
 const tabId=await worker.evaluate(async origin=>(await chrome.tabs.query({url:origin+'/*'})).find(t=>t.url===origin+'/').id,fixture.origin);
 const content=async payload=>worker.evaluate(async({tabId,payload})=>{
  const result=await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',args:[payload],func:async message=>chrome.runtime.sendMessage(message)});
  return result[0].result;
 },{tabId,payload});
 await check('real content scripts cannot read protected extension storage',async()=>{
  const result=await worker.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:async()=>{
   try{await chrome.storage.local.get('config');return{denied:false};}catch(error){return{denied:true,name:error.name};}
  }}))[0].result,tabId);
  assert.equal(result.denied,true);observations.storageDenied=true;
 });
 await check('unprivileged scripts cannot call options-only operations',async()=>{
  for(const message of [{type:'GET'},{type:'CLEAR'},{type:'SAVE',config:{enabled:false}}])assert.equal((await content(message)).ok,false);
 });
 await check('real BOOT replies expose neither settings nor browsing-history lists',async()=>{
  const result=await content({type:'BOOT',viewport:'1200x800@1'});
  assert.equal(result.ok,true);assert.deepEqual(Object.keys(result).sort(),['config','ok']);
  assert.deepEqual(Object.keys(result.config).sort(),['allowLoopback','mode']);
 });
 await check('page postMessage cannot forge extension commands or network hints',async()=>{
  const before=await worker.evaluate(()=>chrome.storage.local.get(['config','model']));
  const mark=fixture.log.length;
  await page.evaluate(()=>{
   for(const type of ['SAVE','CLEAR','PLAN','LEARN'])window.postMessage({type,to:location.origin+'/article',config:{enabled:false}},'*');
  });
  await page.waitForTimeout(350);
  const after=await worker.evaluate(()=>chrome.storage.local.get(['config','model']));
  assert.deepEqual(after,before);
  assert.equal(fixture.log.slice(mark).filter(r=>r.purpose.includes('prefetch')).length,0);
 });
 await check('oversized and prototype-named messages are rejected in the browser',async()=>{
  for(const message of [{type:'constructor'},{type:'BOOT',viewport:'1'.repeat(10000)},{type:'LEARN',profile:{resources:{some:1}}},{type:'PLAN',to:fixture.origin+'/article',viewport:'1200x800@1',intent:'pointer',resources:[{url:'https://example.invalid/'}]}])assert.equal((await content(message)).ok,false);
 });
 await check('poisoned persisted resources cannot produce a plan',async()=>{
  const original=await worker.evaluate(async()=> (await chrome.storage.local.get('model')).model);
  await worker.evaluate(async({origin})=>{
   const {model}=await chrome.storage.local.get('model');model.pages[origin+'/article'].resources=[{url:'https://example.invalid/payload.js',kind:'style',bytes:100}];await chrome.storage.local.set({model});
  },{origin:fixture.origin});
  assert.equal((await content({type:'PLAN',to:fixture.origin+'/article',viewport:'1200x800@1',intent:'pointer'})).ok,false);
  await worker.evaluate(model=>chrome.storage.local.set({model}),original);
 });
 for(const route of ['/passive-nofollow','/passive-download','/passive-no-prefetch'])await check(`passive prediction respects ${route} before any hover`,async()=>{
  await worker.evaluate(async({origin,route})=>{
   const {model}=await chrome.storage.local.get('model');
   model.pages[origin+route]={...model.pages[origin+'/'],at:Date.now()};
   model.edges[JSON.stringify([origin+route,origin+'/article'])]={from:origin+route,to:origin+'/article',count:8,at:Date.now()};
   await chrome.storage.local.set({model});await chrome.storage.local.remove('ledger');
  },{origin:fixture.origin,route});
  const mark=fixture.log.length;await page.goto(fixture.origin+route);await page.waitForTimeout(1000);
  assert.equal(fixture.log.slice(mark).filter(r=>r.purpose.includes('prefetch')).length,0);
  assert.equal(await page.locator('[data-neuroload="hint"]').count(),0);
 });
 const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
 await options.getByText('Everything stays on this device.',{exact:true}).waitFor();
 await check('extension UI CSP blocks outbound data even to an authorized host',async()=>{
  const mark=fixture.log.length;
  const blocked=await options.evaluate(async origin=>{
   try{await fetch(origin+'/security-leak?secret=canary');return false;}catch{return true;}
  },fixture.origin);
  assert.equal(blocked,true);assert.ok(!fixture.log.slice(mark).some(r=>r.path==='/security-leak'));
 });
 await check('Trusted Types blocks injected HTML without breaking the options UI',async()=>{
  const blocked=await options.evaluate(()=>{
   try{document.body.insertAdjacentHTML('beforeend','<img src="https://example.invalid/canary">');return false;}catch(error){return error.name==='TypeError';}
  });
  assert.equal(blocked,true);await options.locator('#save').click();
  await options.getByText('Settings saved. Reload allowed tabs.',{exact:true}).waitFor();
 });
 await options.close();
 await check('the options page cannot be embedded by a website',async()=>{
  await page.evaluate(url=>{const frame=document.createElement('iframe');frame.src=url;document.body.append(frame);},`chrome-extension://${extensionId}/options.html`);
  await page.waitForTimeout(400);
  assert.ok(!page.frames().some(frame=>frame.url()===`chrome-extension://${extensionId}/options.html`));
 });
 await check('a live renderer flood is limited and the trusted UI stays usable',async()=>{
  const result=await worker.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:async()=>{
   const results=await Promise.all(Array.from({length:80},()=>chrome.runtime.sendMessage({type:'BOOT',viewport:'1200x800@1'})));
   return{ok:results.filter(r=>r.ok).length,limited:results.filter(r=>r.reason==='limited').length};
  }}))[0].result,tabId);
  assert.ok(result.ok<=6);assert.ok(result.limited>0);observations.flood=result;
  const ui=await context.newPage();await ui.goto(`chrome-extension://${extensionId}/options.html`);
  await ui.getByText('Everything stays on this device.',{exact:true}).waitFor();await ui.close();
 });
 await check('protected storage and authorized learning survive a browser restart',async()=>{
  await context.close();context=await launch({fixtureOrigin:fixture.origin,profile});
  const restarted=await workerFor(context),restored=await context.newPage();
  await restored.goto(fixture.origin+'/');await restored.waitForTimeout(800);
  const state=await restarted.evaluate(()=>chrome.storage.local.get(['config','model']));
  assert.equal(state.config.mode,'measured');assert.ok(state.model.pages[fixture.origin+'/article']);
  const id=await restarted.evaluate(async origin=>(await chrome.tabs.query({url:origin+'/*'})).find(t=>t.url===origin+'/').id,fixture.origin);
  const denied=await restarted.evaluate(async tabId=>(await chrome.scripting.executeScript({target:{tabId},world:'ISOLATED',func:async()=>{
   try{await chrome.storage.local.get('model');return false;}catch{return true;}
  }}))[0].result,id);
  assert.equal(denied,true);observations.restartStorageDenied=true;
 });
 await writeFile('.work/security-browser-results.json',JSON.stringify({at:new Date().toISOString(),browser:context.browser().version(),checks,observations},null,2));
 console.log(`${checks.length} security browser checks passed`);
}finally{await context?.close();await fixture.close();}
