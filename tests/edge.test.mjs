import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,DEFAULTS,cleanConfig,safeURL,learn,makePlan,reserve} from '../src/core.js';
const c=cleanConfig({...DEFAULTS,mode:'measured',allowedOrigins:['https://example.org']});
const from='https://example.org/',to=from+'article',viewport='1200x800@1';
const now=20*DAY;
const profile={url:to,viewport,documentBytes:1000,resources:[]};

for(const [label,input] of [['null',null],['number',42],['array',[]],['string','hello']]) test(`configuration ${label} falls back to safe defaults`,()=>{
 assert.deepEqual(cleanConfig(input),DEFAULTS);
});
for(const suffix of ['mp4','MP3','webm','woff2','wasm','pdf','zip']) test(`encoded ${suffix} resource cannot masquerade as CSS`,()=>{
 const m=learn({pages:{},edges:{}},{...profile,resources:[{url:from+'media%2e'+suffix,kind:'style',bytes:100}]},c,now);
 assert.equal(m.pages[to].resources.length,0);
});
test('encoded resource names respect user exclusions',()=>{
 const m=learn({pages:{},edges:{}},{...profile,resources:[{url:from+'h%65ro.png',kind:'image',bytes:100}]},{...c,exclusions:['/hero']},now);
 assert.deepEqual(m.pages[to].resources,[]);
});
test('an hour boundary releases hourly budget but not the daily cap',()=>{
 const model=learn({pages:{},edges:{}},profile,c,now);
 const plan=makePlan(model,from,to,viewport,'pointer',c,now);
 const first=reserve({},plan,'first',c,now);
 assert.equal(reserve(first.ledger,plan,'second',{...c,hourRequests:1},now+3599999).ok,false);
 assert.equal(reserve(first.ledger,plan,'second',{...c,hourRequests:1},now+3600000).ok,true);
 assert.equal(reserve(first.ledger,plan,'second',{...c,dayRequests:1},now+3600000).ok,false);
 assert.equal(reserve(first.ledger,plan,'second',{...c,dayRequests:1},now+DAY).ok,true);
});
test('unknown sizes, zero budget and malformed profiles never invent requests',()=>{
 const empty={pages:{},edges:{}};
 for(const bytes of [0,NaN,undefined,-1]) assert.deepEqual(learn(empty,{...profile,documentBytes:bytes},c,now),empty);
 const model=learn(empty,profile,c,now);
 assert.equal(makePlan(model,from,to,viewport,'pointer',{...c,pageKiB:0},now),null);
 assert.equal(makePlan(model,from,to,viewport,'pointer',{...c,pageRequests:0},now),null);
});
test('randomized admissions cannot exceed page/hour/day limits across destinations',()=>{
 let seed=29,ledger={},accepted=0,t=now;
 const limits={...c,pageRequests:4,hourRequests:10,dayRequests:25,pageKiB:256,hourKiB:500,dayKiB:1000};
 const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let i=0;i<2500;i++){
  t+=1+Math.floor(rand()*5000);
  const plan={to:from+`article-${i}`,requests:1+Math.floor(rand()*5),estimatedBytes:1000+Math.floor(rand()*100000)};
  const result=reserve(ledger,plan,'doc-'+i,limits,t);ledger=result.ledger;
  if(result.ok){accepted++;assert.ok(plan.requests<=4);assert.ok(plan.estimatedBytes<=256*1024);}
  for(const [period,requests,bytes] of [[3600000,10,500*1024],[DAY,25,1000*1024]]){
   const entries=ledger.entries.filter(e=>t-e.at<period);
   assert.ok(entries.reduce((s,e)=>s+e.requests,0)<=requests);
   assert.ok(entries.reduce((s,e)=>s+e.bytes,0)<=bytes);
  }
 }
 assert.ok(accepted>1);
});
test('turning the clock back does not reopen an exhausted hour',()=>{
 const limits={...c,hourRequests:1},p={to,requests:1,estimatedBytes:1000};
 const a=reserve({},p,'one',limits,now);
 const b=reserve(a.ledger,{...p,to:from+'two'},'two',limits,now+3600000);
 assert.equal(b.ok,true);
 const rollback=reserve(b.ledger,{...p,to:from+'three'},'three',limits,now+1000);
 assert.equal(rollback.ok,false);assert.equal(rollback.reason,'budget');
 assert.equal(rollback.ledger.lastAt,now+3600000);
});
test('URL parser rejects sensitive routes through encoded spelling and malformed encoding',()=>{
 for(const path of ['%61ccount','%70ayment','%6cogin','foo/%00','foo/%zz']) assert.equal(safeURL(from+path),null,path);
});
