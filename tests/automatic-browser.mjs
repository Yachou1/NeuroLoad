import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createFixture} from '../bench/fixture.mjs';
import {launch,configure,waitProfile} from '../bench/browser.mjs';

const fixture=await createFixture({delay:35,secure:true});
const publicOrigin=fixture.origin,port=new URL(publicOrigin).port;
const government=`https://ministry.gov.test:${port}`,bank=`https://bank.test:${port}`;
let context;
const checks=[],check=async(name,fn)=>{await fn();checks.push(name);console.log(`PASS ${name}`);};
try{
 context=await launch({fixtureOrigin:publicOrigin,testGlobalAccess:true,ignoreHTTPSErrors:true,extraArgs:['--host-resolver-rules=MAP *.test 127.0.0.1','--no-proxy-server']});
 await context.route('https://**/*',route=>['public.test','ministry.gov.test','bank.test'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const {worker,extensionId}=await configure(context,publicOrigin,{mode:'measured'});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 const wait=async fn=>{const end=Date.now()+6000;while(Date.now()<end){if(await fn())return;await page.waitForTimeout(80);}throw new Error('State did not become ready');};
 const tabId=async origin=>worker.evaluate(async origin=>(await chrome.tabs.query({url:origin+'/*'})).find(t=>t.url.startsWith(origin+'/')).id,origin);
 const state=()=>worker.evaluate(async()=> (await chrome.storage.session.get('sensitiveState')).sensitiveState||{});
 const open=async id=>{const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${id}`);await popup.waitForFunction(()=>!document.getElementById('title').textContent.includes('Checking'));return popup;};
 let govId;
 await check('global activation is explicit and registers HTTPS without a typed site list',async()=>{
  const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText('Everything stays on this device.',{exact:true}).waitFor();
  await options.locator('#enable-auto').click();
  await options.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Automatic mode enabled'));
  const result=await options.evaluate(async()=>{const {config}=await chrome.runtime.sendMessage({type:'GET'});config.allowedOrigins=[];return chrome.runtime.sendMessage({type:'SAVE',config});});
  assert.equal(result.ok,true);assert.equal(result.config.automatic,true);
  const registered=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());assert.ok(registered[0].matches.includes('https://*/*'));
  await options.close();
 });
 await check('an unlisted ordinary HTTPS site learns automatically',async()=>{
  await page.goto(publicOrigin+'/article');await waitProfile(worker,publicOrigin+'/article');
  const config=await worker.evaluate(async()=> (await chrome.storage.local.get('config')).config);assert.deepEqual(config.allowedOrigins,[]);
 });
 await check('government pages pause before learning or speculative requests',async()=>{
  const mark=fixture.log.length;await page.goto(government+'/article');govId=await tabId(government);
  await wait(async()=>Boolean((await state())[govId]));
  const record=(await state())[govId];assert.equal(record.state,'pending');assert.equal(record.model,undefined);
  const model=await worker.evaluate(async()=> (await chrome.storage.local.get('model')).model);
  assert.ok(!Object.keys(model.pages).some(url=>url.startsWith(government)));
  assert.equal(fixture.log.slice(mark).filter(r=>r.purpose.includes('prefetch')).length,0);
  assert.equal(await worker.evaluate(tabId=>chrome.action.getBadgeText({tabId}),govId),'?');
 });
 await check('the trusted popup explains the government classification and denial',async()=>{
  const popup=await open(govId);
  assert.ok((await popup.locator('#category').textContent()).includes('Government'));
  assert.equal(await popup.locator('#allow').isVisible(),true);
  await popup.screenshot({path:'.work/sensitive-prompt.png'});
  await popup.locator('#deny').click();await wait(async()=> (await state())[govId]?.state==='denied');
  if(!popup.isClosed())await popup.close();
  await page.bringToFront();await page.reload();await page.waitForTimeout(600);
  assert.equal((await state())[govId].state,'denied');assert.equal((await state())[govId].model.pages[government+'/article'],undefined);
 });
 await check('approval learns only a temporary model for that tab',async()=>{
  const popup=await open(govId);await popup.locator('#allow').click();await wait(async()=> (await state())[govId]?.state==='approved');
  if(!popup.isClosed())await popup.close();await page.bringToFront();
  await wait(async()=>Boolean((await state())[govId]?.model?.pages[government+'/article']));
  const local=await worker.evaluate(()=>chrome.storage.local.get(null));assert.ok(!JSON.stringify(local).includes('ministry.gov.test'));
 });
 await check('approved public government navigation can prepare its initial resources',async()=>{
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.clearBrowserCache');
  await page.goto(government+'/');await page.waitForTimeout(850);await page.mouse.move(1100,700);
  const mark=fixture.log.length;await page.locator('#target').hover();await page.waitForTimeout(850);
  assert.ok(fixture.log.slice(mark).some(r=>r.path==='/article'&&r.purpose.includes('prefetch')));
  assert.ok((await state())[govId].model.pages[government+'/']);
  const local=await worker.evaluate(()=>chrome.storage.local.get(null));assert.ok(!JSON.stringify(local).includes('ministry.gov.test'));
 });
 await check('a forged approval nonce cannot authorize another bank tab',async()=>{
  const other=await context.newPage();await other.goto(bank+'/article');const id=await tabId(bank);
  await wait(async()=>Boolean((await state())[id]));
  const popup=await open(id),govNonce=(await state())[govId].requestId;
  const result=await popup.evaluate(({id,nonce})=>chrome.runtime.sendMessage({type:'SENSITIVE_ALLOW',tabId:id,requestId:nonce}),{id,nonce:govNonce});
  assert.equal(result.ok,false);assert.equal((await state())[id].state,'pending');
  await popup.close();await other.close();await wait(async()=>!(await state())[id]);
 });
 await check('private paths remain blocked despite an active sensitive consent',async()=>{
  await page.bringToFront();const mark=fixture.log.length;await page.goto(government+'/account');await page.waitForTimeout(500);
  const popup=await open(govId);assert.equal(await popup.locator('#allow').isVisible(),false);
  assert.ok((await popup.locator('#title').textContent()).includes('protected'));
  const result=await popup.evaluate(({id,nonce})=>chrome.runtime.sendMessage({type:'SENSITIVE_ALLOW',tabId:id,requestId:nonce}),{id:govId,nonce:(await state())[govId].requestId});
  assert.equal(result.ok,false);assert.equal(fixture.log.slice(mark).filter(r=>r.purpose.includes('prefetch')).length,0);await popup.close();
 });
 await check('expiry removes access and requires a new decision',async()=>{
  await worker.evaluate(async id=>{const {sensitiveState}=await chrome.storage.session.get('sensitiveState');sensitiveState[id].expiresAt=Date.now()-1;await chrome.storage.session.set({sensitiveState});},govId);
  await page.bringToFront();await page.goto(government+'/article');await wait(async()=> (await state())[govId]?.state==='pending');
  assert.equal((await state())[govId].model,undefined);
 });
 await check('closing the tab clears its sensitive request and temporary model',async()=>{
  await page.close();const end=Date.now()+5000;while(Date.now()<end&&(await state())[govId])await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal((await state())[govId],undefined);
 });
 await writeFile('.work/automatic-browser-results.json',JSON.stringify({at:new Date().toISOString(),browser:context.browser().version(),checks,scope:'Synthetic .test domains mapped to localhost; pregranted harness permission; native host prompts remain manual.'},null,2));
 console.log(`${checks.length} automatic browser checks passed`);
}finally{await context?.close();await fixture.close();}
