import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {safeURL,DEFAULTS,cleanConfig,learn,pruneModel} from '../src/core.js';
import {validViewport,validProfile,validMessage,validConfig,createIngressGuard} from '../src/validation.js';

for(const [label,url]of[
 ['nested login','https://example.org/log%2569n'],['nested path separator','https://example.org/foo%252flogin'],
 ['trailing-dot loopback','https://localhost./'],['nested script extension','https://example.org/movie%252emp4'],
 ['invisible route','https://example.org/log%EF%BB%BFin'],['bidirectional route','https://example.org/a%E2%80%AEb'],
 ['raw line break','https://example.org/pub\nlic'],['whitespace',' https://example.org/'],
 ['French private route','https://example.org/d%C3%A9connexion'],['Turkish payment route','https://example.org/%C3%B6deme'],
 ['compatibility characters','https://example.org/%EF%BD%8C%EF%BD%8F%EF%BD%87%EF%BD%89%EF%BD%8E']
])test(`URL guard rejects ${label}`,()=>assert.equal(safeURL(url),null));

for(const viewport of ['1'.repeat(100000)+'x800@1','12..x800@1','0x0@0','100000x800@1','1200x800@99','1201x800@1',null,{},'1200x800@NaN'])test(`viewport validation rejects ${String(viewport).slice(0,30)}`,()=>assert.equal(validViewport(viewport),false));
test('viewport validator preserves legitimate zoom ratios',()=>{for(const s of ['1200x800@1','600x800@0.5','20000x10000@2','1200x800@1.3'])assert.equal(validViewport(s),true);});

const url='https://example.org/article',viewport='1200x800@1';
const profile={url,viewport,documentBytes:1000,resources:[]};
const message={type:'LEARN',profile};
test('payload schemas reject unknown fields, own method names and oversized resource lists',()=>{
 for(const payload of [null,[],{type:'constructor'},{type:'GET'},{type:'BOOT',viewport,config:DEFAULTS},{type:'LEARN',profile:{...profile,resources:{some:1}}},{type:'LEARN',profile:{...profile,resources:new Array(5000).fill({url,bytes:1,kind:'style'})}},{type:'PLAN',to:url,viewport,intent:'pointer',estimatedBytes:1}]) assert.equal(validMessage(payload,false),false);
 assert.equal(validMessage(message,false),true);
 assert.equal(validMessage({type:'PLAN',to:url,viewport,intent:'pointer'},false),true);
 assert.equal(validMessage({type:'SAVE',config:DEFAULTS},true),true);
});
test('non-finite sizes, oversized bodies and unsupported resource types are rejected',()=>{
 for(const bad of [NaN,Infinity,-1,0,'1000',2097153])assert.equal(validProfile({...profile,documentBytes:bad}),false);
 assert.equal(validProfile({...profile,resources:[{url,bytes:1,kind:'video'}]}),false);
});
test('prototype-named configuration keys cannot influence schema tables',()=>{
 assert.equal(validConfig(JSON.parse('{"__proto__":{"enabled":true}}')),false);
 assert.equal(validConfig({constructor:{prototype:{}}}),false);
 assert.equal(validConfig({...DEFAULTS,enabled:'yes'}),false);
 assert.equal(validConfig({...DEFAULTS,allowedOrigins:new Array(51).fill('https://example.org')}),false);
});
test('untrusted persisted profiles and cross-origin transitions are purged',()=>{
 const c=cleanConfig({...DEFAULTS,mode:'measured',allowedOrigins:['https://example.org','https://other.org']});
 let m=learn({pages:{},edges:{}},profile,c);
 const p=m.pages[url];
 m.pages['https://example.org/bad']={...p,resources:[{url:'https://other.org/secret.png',bytes:100,kind:'image'}]};
 m.pages['https://example.org/log%2569n']={...p};
 m.pages['https://example.org/huge']={...p,documentBytes:Infinity};
 m.pages['https://other.org/article']={...p};
 m.edges[JSON.stringify([url,'https://other.org/article'])]={from:url,to:'https://other.org/article',count:1,at:Date.now()};
 m.edges['__proto__']={from:url,to:url,count:100,at:Date.now()};
 const clean=pruneModel(m,c);
 assert.deepEqual(Object.keys(clean.pages).sort(),[url,'https://other.org/article'].sort());
 assert.deepEqual(clean.edges,{});
});
test('message floods are bounded per type, document and worker',()=>{
 let now=100000;const guard=createIngressGuard(()=>now);
 assert.equal(guard('one','LEARN'),true);assert.equal(guard('one','LEARN'),false);
 for(let i=0;i<12;i++)assert.equal(guard('two','PLAN'),true);
 assert.equal(guard('two','PLAN'),false);
 assert.equal(guard('three','__proto__'),false);
 let allowed=13;
 for(let i=0;i<400;i++)if(guard('doc-'+i,'BOOT'))allowed++;
 assert.equal(allowed,200);assert.equal(guard('new','BOOT'),false);
 now+=60000;assert.equal(guard('new','BOOT'),true);
 now-=60000;assert.equal(guard('new','LEARN'),true);assert.equal(guard('new','LEARN'),false);
});
test('5000 malformed JSON payloads exercise every message type without throwing',()=>{
 let seed=41;
 const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)%6);
 const values=[null,[],{},42,'BOOT',{some:1}];
 for(let i=0;i<5000;i++){
  const x={type:'UNKNOWN',viewport:values[random()],profile:{url:values[random()],resources:values[random()]}};
  assert.doesNotThrow(()=>validMessage(x,false));assert.equal(validMessage(x,false),false);
  for(const type of ['BOOT','PLAN','LEARN','PREDICT','CLICK']){
   const payload=type==='BOOT'?{type,viewport:values[random()]}:type==='LEARN'?{type,profile:{url:values[random()],viewport:values[random()],documentBytes:values[random()],resources:values[random()]}}:type==='PREDICT'?{type,viewport:values[random()],links:values[random()]}:type==='CLICK'?{type,to:values[random()]}:{type,to:values[random()],viewport:values[random()],intent:values[random()]};
   assert.doesNotThrow(()=>validMessage(payload,false));
  }
  assert.doesNotThrow(()=>validMessage({type:'SAVE',config:values[random()]},true));
 }
});
test('production manifest preserves minimal permissions and isolates extension UI',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.permissions.sort(),['scripting','storage']);
 for(const key of ['host_permissions','externally_connectable','web_accessible_resources','content_scripts'])assert.equal(manifest[key],undefined);
 const csp=manifest.content_security_policy.extension_pages;
 for(const directive of ["default-src 'none'","connect-src 'none'","frame-ancestors 'none'","form-action 'none'","require-trusted-types-for 'script'","trusted-types 'none'"])assert.ok(csp.includes(directive));
 assert.ok(!csp.includes('unsafe-inline')&&!csp.includes('unsafe-eval'));
});
