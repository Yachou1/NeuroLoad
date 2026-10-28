import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, learn } from '../src/core.js';

const origin='https://example.org', from=origin+'/', to=origin+'/article';
let sequence=0;
async function harness({ granted=true, globalGranted=false, tabURL=from, existing }={}) {
  const config={...DEFAULTS,mode:'measured',allowedOrigins:[origin]};
  let model={pages:{},edges:{}};
  for(let i=0;i<8;i++) model=learn(model,{url:origin+`/article-${i}`,viewport:'1200x800@1',documentBytes:1000,resources:[{url:origin+'/a.css',kind:'style',bytes:1000}]},config);
  model=learn(model,{url:to,viewport:'1200x800@1',documentBytes:1000,resources:[{url:origin+'/a.css',kind:'style',bytes:1000}]},config);
  const data=existing?structuredClone(existing):{config,model},session={};let listener,registered=[],stops=0,failWrite=false,reads=0,permissionRemoved;
  const event=()=>({addListener(){}});
  globalThis.chrome={
    runtime:{id:'unit',getURL:path=>`chrome-extension://unit/${path}`,onMessage:{addListener(fn){listener=fn;}},onInstalled:event(),onStartup:event()},
    action:{onClicked:event(),setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{},setPopup:async()=>{}},
    permissions:{onAdded:event(),onRemoved:{addListener(fn){permissionRemoved=fn;}},contains:async value=>value.origins.includes('https://*/*')?globalGranted:granted},
    tabs:{query:async()=>[{id:1}],get:async id=>({id,url:tabURL,incognito:false}),sendMessage:async()=>{stops++;}},
    scripting:{getRegisteredContentScripts:async()=>registered,unregisterContentScripts:async()=>{registered=[];},registerContentScripts:async scripts=>{registered=scripts;},executeScript:async()=>{}},
    storage:{local:{
      get:async keys=>{reads++;return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in data).map(k=>[k,structuredClone(data[k])]));},
      set:async values=>{if(failWrite)throw new Error('Simulated disk failure');await new Promise(resolve=>setTimeout(resolve,1));Object.assign(data,structuredClone(values));},
      remove:async key=>{delete data[key];}
    },session:{get:async key=>({[key]:structuredClone(session[key])}),set:async value=>Object.assign(session,structuredClone(value)),remove:async key=>{delete session[key];}}}
  };
  await import(`../src/background.js?test=${sequence++}`);
  return {data,session,send:(message,sender)=>new Promise(resolve=>listener(message,sender,resolve)),stops:()=>stops,failWrite:value=>{failWrite=value;},reads:()=>reads,revoke:async()=>{granted=false;globalGranted=false;await permissionRemoved();}};
}
const sender=(tab=1)=>({id:'unit',url:from,origin,frameId:0,documentLifecycle:'active',documentId:`doc-${tab}`,tab:{id:tab,incognito:false}});
const ui={id:'unit',url:'chrome-extension://unit/options.html',origin:'chrome-extension://unit',frameId:0,documentLifecycle:'active',tab:{id:500}};
const plan=(target=to)=>({type:'PLAN',to:target,viewport:'1200x800@1',intent:'pointer'});

test('automatic SAVE requires the actual global Chrome grant',async()=>{
  let h=await harness();
  assert.equal((await h.send({type:'SAVE',config:{...h.data.config,automatic:true}},ui)).reason,'global-permission-required');
  assert.equal(h.data.config.automatic,false);
  h=await harness({globalGranted:true});
  assert.equal((await h.send({type:'SAVE',config:{...h.data.config,automatic:true}},ui)).ok,true);
  assert.equal(h.data.config.automatic,true);
});

test('government BOOT is paused; only the trusted popup can decide',async()=>{
  const gov='https://ministry.gov.test',h=await harness({globalGranted:true,tabURL:gov+'/'});
  h.data.config={...h.data.config,automatic:true};
  const page={...sender(),url:gov+'/',origin:gov};
  assert.equal((await h.send({type:'BOOT',viewport:'1200x800@1'},page)).reason,'sensitive-consent');
  const popup={...ui,url:'chrome-extension://unit/popup.html?tab=1'};
  const pending=await h.send({type:'TAB_STATUS',tabId:1},popup);
  const decision={type:'SENSITIVE_ALLOW',tabId:1,requestId:pending.requestId};
  assert.equal((await h.send(decision,page)).ok,false);
  assert.equal((await h.send(decision,ui)).ok,false);
  assert.equal((await h.send(decision,popup)).ok,true);
  const boot=await h.send({type:'BOOT',viewport:'1200x800@1'},page);
  assert.equal(boot.ok,true);assert.equal(boot.config.allowSensitiveHost,true);
  assert.ok(boot.config.accessUntil>Date.now());assert.equal(boot.config.allowedOrigins,undefined);
  assert.equal((await h.send({type:'LEARN',profile:{url:gov+'/',viewport:'1200x800@1',documentBytes:1000,resources:[]}},page)).ok,true);
  assert.equal(h.data.model.pages[gov+'/'],undefined);
  assert.ok(h.session.sensitiveState[1].model.pages[gov+'/']);
});

test('worker budget storage contains destination fingerprints rather than raw URLs',async()=>{
  const h=await harness();assert.equal((await h.send(plan(),sender())).ok,true);
  assert.match(h.data.ledger.entries[0].to,/^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(h.data.ledger).includes(origin),false);
});

test('popup URLs with extra fields are rejected before any storage read',async()=>{
  const h=await harness(),before=h.reads();
  const bad={...ui,url:'chrome-extension://unit/popup.html?tab=1&tab=2'};
  assert.equal((await h.send({type:'TAB_STATUS',tabId:1},bad)).ok,false);
  assert.equal(h.reads(),before);
});

test('worker rejects wrong identities, subframes, private tabs and absent permissions',async()=>{
  let h=await harness();
  for(const s of [{...sender(),id:'other'}, {...sender(),frameId:1}, {...sender(),tab:{id:1,incognito:true}}, {...sender(),url:origin+'/account'}, {...sender(),documentId:undefined}]) assert.equal((await h.send(plan(),s)).ok,false);
  assert.equal((await h.send({type:'SAVE',config:DEFAULTS},sender())).ok,false);
  h=await harness({granted:false});
  assert.equal((await h.send(plan(),sender())).ok,false);
});
test('worker rebuilds resource lists and costs instead of trusting the caller',async()=>{
  const h=await harness();
  const result=await h.send({...plan(),resources:[{url:origin+'/movie.mp4',kind:'video'}],estimatedBytes:1},sender());
  assert.equal(result.ok,false);
  const valid=await h.send(plan(),sender());
  assert.equal(valid.ok,true);
  assert.deepEqual(valid.plan.resources.map(r=>r.kind),['document','style']);
  assert.equal(h.data.ledger.entries[0].bytes,12192);
});
test('concurrent tabs share one atomic ledger and destination cooldown',async()=>{
  const h=await harness();
  const results=await Promise.all(Array.from({length:12},(_,i)=>h.send(plan(),sender(i+1))));
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(h.data.ledger.entries.length,1);
});
test('hour request cap applies across different destinations, not just a per-tab counter',async()=>{
  const h=await harness();h.data.config.hourRequests=4;
  const results=await Promise.all(Array.from({length:8},(_,i)=>h.send(plan(origin+`/article-${i}`),sender(i+1))));
  assert.equal(results.filter(r=>r.ok).length,2);
  assert.equal(h.data.ledger.entries.reduce((n,e)=>n+e.requests,0),4);
});
test('trusted options work in a tab; disable stops documents and preserves the model',async()=>{
  const h=await harness();
  const result=await h.send({type:'SAVE',config:{...h.data.config,enabled:false}},ui);
  assert.equal(result.ok,true);assert.ok(h.stops()>0);
  assert.ok(Object.keys(h.data.model.pages).length>0);
  assert.equal((await h.send(plan(),sender())).ok,false);
});
test('clearing data removes persisted budgets and learned pages',async()=>{
  const h=await harness();await h.send(plan(),sender());
  assert.ok(h.data.ledger);
  assert.equal((await h.send({type:'CLEAR'},ui)).ok,true);
  assert.deepEqual(h.data.model,{pages:{},edges:{}});assert.equal(h.data.ledger,undefined);
});
test('PREDICT returns only a fresh same-origin candidate from the supplied links',async()=>{
 const h=await harness();
 h.data.model.pages[origin+'/old']={...h.data.model.pages[to],at:0};
 h.data.model.pages[origin+'/small']={...h.data.model.pages[to],viewport:'600x800@1'};
 h.data.model.pages['https://other.org/article']={...h.data.model.pages[to]};
 h.data.model.pages[from]={...h.data.model.pages[to]};
 for(const target of [to,origin+'/old',origin+'/small','https://other.org/article'])h.data.model.edges[JSON.stringify([from,target])]={from,to:target,count:8,at:Date.now()};
 const result=await h.send({type:'PREDICT',viewport:'1200x800@1',links:[to,origin+'/old',origin+'/small','https://other.org/article']},sender());
 assert.equal(result.to,to);assert.equal(result.knownTargets,undefined);
});
test('a restarted worker retains admission budgets from local storage',async()=>{
 let h=await harness();h.data.config.dayRequests=2;
 assert.equal((await h.send(plan(),sender())).ok,true);
 h=await harness({existing:h.data});
 const result=await h.send(plan(origin+'/article-1'),sender(2));
 assert.equal(result.ok,false);assert.equal(result.reason,'budget');
});
test('failed persistence emits no plan and does not poison the message queue',async()=>{
 const h=await harness();h.failWrite(true);
 assert.equal((await h.send(plan(),sender())).ok,false);
 assert.equal(h.data.ledger,undefined);
 h.failWrite(false);assert.equal((await h.send(plan(),sender())).ok,true);
});
test('invalid and inactive senders are rejected before any storage read',async()=>{
 const h=await harness();
 for(const s of [{...sender(),origin:'https://other.org'},{...sender(),documentLifecycle:'cached'},{...sender(),documentLifecycle:'prerender'},{...sender(),documentId:'x'.repeat(1000)},{...ui,origin:'https://example.org'}])assert.equal((await h.send(plan(),s)).ok,false);
 assert.equal((await h.send({type:'LEARN',profile:{resources:{some:1}}},sender())).ok,false);
 assert.equal(h.reads(),0);
});
test('BOOT does not disclose unrelated sites, exclusions or budgets',async()=>{
 const h=await harness();h.data.config.allowedOrigins.push('https://other.org');h.data.config.exclusions=['private-company'];
 const result=await h.send({type:'BOOT',viewport:'1200x800@1'},sender());
 assert.equal(result.ok,true);assert.deepEqual(result.config,{mode:'measured',allowLoopback:false});
 assert.equal(result.knownTargets,undefined);assert.equal(result.predicted,undefined);
 assert.ok(!JSON.stringify(result).includes('other.org'));assert.ok(!JSON.stringify(result).includes('private-company'));
});
test('malicious learned resources never reach storage or native request plans',async()=>{
 const h=await harness();
 const result=await h.send({type:'LEARN',profile:{url:from,viewport:'1200x800@1',documentBytes:1000,resources:[{url:'https://other.org/a.png',bytes:100,kind:'image'}]}},sender());
 assert.equal(result.ok,false);assert.ok(!h.data.model.pages[from]);
});
test('an untrusted document cannot force unbounded queued writes',async()=>{
 const h=await harness();
 const results=await Promise.all(Array.from({length:500},()=>h.send({type:'CLICK',to},sender())));
 assert.ok(results.filter(r=>r.ok).length<=20);
 assert.ok(results.some(r=>r.reason==='limited'));
 assert.ok(h.reads()<=20);
});
test('permission removal rejects queued plans and purges the origin model',async()=>{
 const h=await harness();
 const queued=h.send(plan(),sender());
 await h.revoke();assert.equal((await queued).ok,false);
 assert.deepEqual(h.data.config.allowedOrigins,[]);assert.deepEqual(h.data.model,{pages:{},edges:{}});
 assert.ok(h.stops()>0);
 assert.equal((await h.send(plan(),sender(2))).ok,false);
});
