import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySite} from '../src/site-policy.js';
import {DEFAULTS,cleanConfig,allowed,safeURL} from '../src/core.js';
import {createAccessController,SENSITIVE_TTL} from '../src/access.js';
import {validMessage,validConfig} from '../src/validation.js';

for(const host of ['www.service-public.fr','id.fgov.be','www.belgium.be','www.gov.uk','www.usa.gov','www.gouv.fr','www.admin.ch','www.gov.tr','europa.eu','ministry.gov.test'])test(`government signal requires consent: ${host}`,()=>{
 assert.equal(classifySite('https://'+host+'/').category,'government');
 assert.equal(safeURL('https://'+host+'/'),null);
});
for(const host of ['bank.test','hospital.test','outlook.test','login.example.org','xn--bcher-kva.test'])test(`sensitive hostname is not automatic without approval: ${host}`,()=>assert.ok(classifySite('https://'+host+'/')));
test('automatic scope is optional and does not override sensitive or private rules',()=>{
 const c=cleanConfig({...DEFAULTS,automatic:true});
 assert.equal(DEFAULTS.automatic,false);assert.equal(allowed('https://public.test/article',c),true);
 assert.equal(allowed('https://ministry.gov.test/article',c),false);
 const approved={...c,sensitiveOrigins:['https://ministry.gov.test']};
 assert.equal(allowed('https://ministry.gov.test/article',approved),true);
 for(const path of ['/login','/account','/payment','/article?token=x'])assert.equal(allowed('https://ministry.gov.test'+path,approved),false);
 assert.equal(allowed('https://bank.test/article',approved),false);
});
test('popup decision messages cannot be sent by content or settings contexts',()=>{
 const m={type:'SENSITIVE_ALLOW',tabId:1,requestId:'12345678-1234-1234-1234-123456789abc'};
 assert.equal(validMessage(m,'popup'),true);assert.equal(validMessage(m,false),false);assert.equal(validMessage(m,true),false);
 assert.equal(validMessage({...m,requestId:'forged'},'popup'),false);
 assert.equal(validConfig({...DEFAULTS,sensitiveOrigins:['https://bank.test']}),false);
 assert.equal(validConfig({...DEFAULTS,automatic:true}),true);
});

test('automatic and sensitive consent never bypass private or action hostnames',()=>{
 for(const host of ['checkout.public.test','cart.public.test','payment.public.test','pay-bank.test','billing.public.test','profile.public.test','dashboard.public.test','signup.public.test','download.public.test','delete.public.test','graphql.public.test','compte.public.test','secure-bank.test']){
  const url='https://'+host+'/',c={...DEFAULTS,automatic:true,sensitiveOrigins:[new URL(url).origin]};
  assert.equal(safeURL(url,{allowSensitiveHost:true}),null,host);
  assert.equal(allowed(url,c),false,host);
 }
 assert.equal(classifySite('https://wallet.test/').category,'finance');
});

function harness(){
 let now=Date.now(),store={},stop=0,injected=0,popups=0,granted=true;
 const tabs=new Map([[1,{id:1,url:'https://ministry.gov.test/',incognito:false,windowId:1}],[2,{id:2,url:'https://public.test/',incognito:false,windowId:1}]]);
 const api={storage:{session:{get:async key=>({[key]:structuredClone(store[key])}),set:async value=>Object.assign(store,structuredClone(value)),remove:async key=>{delete store[key];}}},
  permissions:{contains:async()=>granted},tabs:{get:async id=>tabs.get(id),query:async()=>[tabs.get(1)]},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{},setPopup:async()=>{},openPopup:async()=>{popups++;}}};
 const access=createAccessController(api,{clock:()=>now,stopTab:async()=>{stop++;},injectTab:async()=>{injected++;}});
 const config=cleanConfig({...DEFAULTS,automatic:true,mode:'measured'});
 const sender=id=>({url:tabs.get(id).url,tab:tabs.get(id),documentId:'doc-'+id});
 return{access,config,sender,tabs,data:()=>store,advance:ms=>{now+=ms;},stop:()=>stop,injected:()=>injected,popups:()=>popups,revokePermission:()=>{granted=false;},now:()=>now};
}
test('sensitive first visit creates one request and zero learned profiles',async()=>{
 const h=harness(),empty={pages:{},edges:{}};
 assert.equal((await h.access.context(h.sender(1),h.config,empty,{notify:true})).reason,'sensitive-consent');
 await h.access.context(h.sender(1),h.config,empty,{notify:true});
 assert.equal(h.popups(),1);assert.equal(h.injected(),0);
 const status=await h.access.status(1,h.config,empty);assert.equal(status.status,'pending');assert.ok(status.requestId);
 assert.equal(h.data().sensitiveState[1].model,undefined);
});
test('approval is bound to origin and tab, rotates nonce and expires',async()=>{
 const h=harness(),empty={pages:{},edges:{}};
 const before=await h.access.status(1,h.config,empty);
 assert.equal((await h.access.decide(2,before.requestId,true,h.config)).ok,false);
 assert.equal((await h.access.decide(1,'forged',true,h.config)).ok,false);
 assert.equal((await h.access.decide(1,before.requestId,true,h.config)).ok,true);
 assert.equal((await h.access.decide(1,before.requestId,true,h.config)).ok,false);
 const context=await h.access.context(h.sender(1),h.config,empty);assert.equal(context.ok,true);assert.equal(context.sensitive,true);
 assert.equal(h.injected(),1);assert.ok(h.stop()>0);
 h.advance(SENSITIVE_TTL+1);assert.equal((await h.access.context(h.sender(1),h.config,empty)).ok,false);
});
test('navigation, revocation and hard private routes invalidate approval attempts',async()=>{
 const h=harness(),empty={pages:{},edges:{}},pending=await h.access.status(1,h.config,empty);
 h.tabs.get(1).url='https://bank.test/';assert.equal((await h.access.decide(1,pending.requestId,true,h.config)).ok,false);
 h.tabs.get(1).url='https://ministry.gov.test/login';assert.equal((await h.access.decide(1,pending.requestId,true,h.config)).ok,false);
 h.tabs.get(1).url='https://ministry.gov.test/';h.revokePermission();assert.equal((await h.access.decide(1,pending.requestId,true,h.config)).ok,false);
});
test('sensitive model is session-only, bounded, and removed on denial or close',async()=>{
 const h=harness(),empty={pages:{},edges:{}},pending=await h.access.status(1,h.config,empty);
 await h.access.decide(1,pending.requestId,true,h.config);
 const ctx=await h.access.context(h.sender(1),h.config,empty),pages={};
 for(let i=0;i<20;i++)pages[`https://ministry.gov.test/article-${i}`]={at:h.now(),viewport:'1200x800@1',documentBytes:1000,resources:[]};
 assert.equal(await h.access.writeModel(1,ctx.record,{pages,edges:{}},ctx.policy),true);
 assert.equal(Object.keys(h.data().sensitiveState[1].model.pages).length,8);
 const approved=await h.access.status(1,h.config,empty);
 await h.access.decide(1,approved.requestId,false,h.config);
 assert.equal(Object.keys(h.data().sensitiveState[1].model.pages).length,0);
 assert.equal((await h.access.context(h.sender(1),h.config,empty)).ok,false);
 await h.access.forget(1);assert.equal(h.data().sensitiveState[1],undefined);
});
test('a detected form blocks the document without an override',async()=>{
 const h=harness(),empty={pages:{},edges:{}},pending=await h.access.status(1,h.config,empty);
 await h.access.decide(1,pending.requestId,true,h.config);await h.access.dom(h.sender(1));
 assert.equal((await h.access.context(h.sender(1),h.config,empty)).ok,false);
 assert.equal((await h.access.status(1,h.config,empty)).status,'protected');
 assert.equal((await h.access.decide(1,pending.requestId,true,h.config)).ok,false);
});
