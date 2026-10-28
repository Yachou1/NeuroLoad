import {DEFAULTS,cleanConfig,allowed,safeURL,learn,addTransition,pruneModel,makePlan,reserve,validResource} from './core.js';
import {validMessage,createIngressGuard} from './validation.js';
import {createAccessController} from './access.js';

let queue=Promise.resolve(),pendingMessages=0;
const serialized=task=>{const result=queue.then(task);queue=result.catch(()=>{});return result;};
const ingress=createIngressGuard();
const emptyModel=()=>({pages:{},edges:{}});
const permissionPattern=origin=>origin+'/*';
const extensionSender=sender=>sender?.id===chrome.runtime.id&&sender.origin===`chrome-extension://${chrome.runtime.id}`&&sender.documentLifecycle==='active'&&(sender.frameId===undefined||sender.frameId===0)&&!sender.tab?.incognito;
function uiRole(sender){
  if(!extensionSender(sender))return false;
  if(sender.url===chrome.runtime.getURL('options.html'))return true;
  try{const u=new URL(sender.url);if(u.hash||u.href.split('?')[0]!==chrome.runtime.getURL('popup.html'))return false;const keys=[...u.searchParams.keys()];return keys.length===0||(keys.length===1&&keys[0]==='tab'&&/^\d{1,10}$/.test(u.searchParams.get('tab')))?'popup':false;}catch{return false;}
}
function sourcePage(sender){
  if(sender?.id!==chrome.runtime.id||!Number.isInteger(sender.tab?.id)||sender.tab.id<0||sender.tab.incognito!==false||sender.frameId!==0||sender.documentLifecycle!=='active'||typeof sender.documentId!=='string'||!/^[a-zA-Z0-9-]{1,128}$/.test(sender.documentId))return false;
  try{return sender.origin===new URL(sender.url).origin&&/^https?:$/.test(new URL(sender.url).protocol);}catch{return false;}
}
async function permittedOrigins(origins){const checks=await Promise.all(origins.map(o=>chrome.permissions.contains({origins:[permissionPattern(o)]})));return origins.filter((_,i)=>checks[i]);}
async function protectStorage(){await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});}
async function stopTab(tabId){try{await chrome.tabs.sendMessage(tabId,{type:'STOP'});}catch{/* No live content script. */}}
async function stopDocuments(){await Promise.allSettled((await chrome.tabs.query({})).map(tab=>stopTab(tab.id)));}
const access=createAccessController(chrome,{stopTab,injectTab:tabId=>chrome.scripting.executeScript({target:{tabId},files:['content.js'],world:'ISOLATED'})});
async function budgetKey(url){if(/^sha256:[a-f0-9]{64}$/.test(url))return url;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));return 'sha256:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
async function trimLedger(){
  const {ledger={entries:[]}}=await chrome.storage.local.get('ledger');
  const now=Math.max(Date.now(),ledger.lastAt||0);
  ledger.entries=await Promise.all(ledger.entries.filter(e=>e.at>now-86400000).map(async e=>({...e,to:await budgetKey(e.to)})));
  await chrome.storage.local.set({ledger});
}
async function load(){const data=await chrome.storage.local.get(['config','model']);const config=cleanConfig(data.config);return{config,model:pruneModel(data.model||emptyModel(),config)};}
async function syncScripts(){
  const {config}=await load();
  const matches=(await permittedOrigins(config.allowedOrigins)).map(permissionPattern);
  if(config.automatic&&await chrome.permissions.contains({origins:['https://*/*']}))matches.push('https://*/*');
  const current=await chrome.scripting.getRegisteredContentScripts();
  if(current.length)await chrome.scripting.unregisterContentScripts({ids:current.map(s=>s.id)});
  if(config.enabled&&matches.length)await chrome.scripting.registerContentScripts([{id:'neuroload',matches:[...new Set(matches)],js:['content.js'],runAt:'document_start',allFrames:false,persistAcrossSessions:true,world:'ISOLATED'}]);
}
async function handle(message,sender,role){
  const {config:base,model:publicModel}=await load();
  if(role==='popup'){
    if(message.type==='TAB_STATUS')return access.status(message.tabId,base,publicModel);
    return access.decide(message.tabId,message.requestId,message.type==='SENSITIVE_ALLOW',base);
  }
  if(role){
    if(message.type==='GET'){
      await chrome.storage.local.set({model:publicModel});
      const {ledger={entries:[]}}=await chrome.storage.local.get('ledger');
      return{ok:true,config:base,globalAccess:await chrome.permissions.contains({origins:['https://*/*']}),pages:Object.keys(publicModel.pages).length,transitions:Object.keys(publicModel.edges).length,ledger:{entries:ledger.entries.filter(e=>e.at>Date.now()-86400000).map(({at,requests,bytes})=>({at,requests,bytes}))}};
    }
    if(message.type==='SAVE'){
      const next=cleanConfig(message.config);next.allowedOrigins=await permittedOrigins(next.allowedOrigins);
      if(next.automatic&&!await chrome.permissions.contains({origins:['https://*/*']}))return{ok:false,reason:'global-permission-required'};
      await chrome.storage.local.set({config:next,model:pruneModel(publicModel,next)});
      await trimLedger();await access.clear();await stopDocuments();await syncScripts();return{ok:true,config:next};
    }
    if(message.type==='CLEAR'){
      await chrome.storage.local.set({model:emptyModel()});await chrome.storage.local.remove('ledger');await access.clear();await stopDocuments();return{ok:true};
    }
    return{ok:false};
  }
  const context=await access.context(sender,base,publicModel,{notify:message.type==='BOOT'});
  if(!context.ok)return context;
  const {policy:config,model}=context,origin=new URL(sender.url).origin,pageId=`${sender.tab.id}:${sender.documentId}`;
  if(!allowed(sender.url,config))return{ok:false};
  if(message.type==='BOOT'){
    const c={mode:config.mode,allowLoopback:config.allowLoopback};
    if(context.sensitive){c.allowSensitiveHost=true;c.accessUntil=context.record.expiresAt;}
    return{ok:true,config:c};
  }
  if(message.type==='HOLD'){await access.dom(sender);return{ok:true};}
  if(message.type==='PREDICT'){
    const links=new Set(message.links.filter(url=>safeURL(url,{origin,allowLoopback:config.allowLoopback,allowSensitiveHost:context.sensitive})&&allowed(url,config)));
    const candidate=Object.values(model.edges).filter(e=>e.from===sender.url&&links.has(e.to)).sort((a,b)=>b.count-a.count).find(e=>makePlan(model,sender.url,e.to,message.viewport,'prediction',config));
    return{ok:true,to:candidate?.to||null};
  }
  if(message.type==='LEARN'){
    if(message.profile.url!==sender.url||!message.profile.resources.every(r=>validResource(r,origin,config)))return{ok:false};
    const next=learn(model,message.profile,config);if(next===model)return{ok:false};
    if(context.sensitive)return{ok:await access.writeModel(sender.tab.id,context.record,next,config)};
    await chrome.storage.local.set({model:next});return{ok:true};
  }
  if(message.type==='CLICK'){
    if(!safeURL(message.to,{origin,allowLoopback:config.allowLoopback,allowSensitiveHost:context.sensitive}))return{ok:false};
    const next=addTransition(model,sender.url,message.to,config);
    if(context.sensitive)return{ok:await access.writeModel(sender.tab.id,context.record,next,config)};
    await chrome.storage.local.set({model:next});return{ok:true};
  }
  if(message.type==='PLAN'){
    const plan=makePlan(model,sender.url,message.to,message.viewport,message.intent,config);
    if(!plan)return{ok:false,reason:'unknown-or-ineligible'};
    if(plan.mode==='strict')return{ok:true,plan};
    const {ledger={entries:[]}}=await chrome.storage.local.get('ledger');
    const result=reserve(ledger,{...plan,to:await budgetKey(plan.to)},pageId,config);
    await chrome.storage.local.set({ledger:result.ledger});return result.ok?{ok:true,plan}:{ok:false,reason:result.reason};
  }
  return{ok:false};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const role=uiRole(sender);
  if((!role&&!sourcePage(sender))||!validMessage(message,role)){respond({ok:false,reason:'invalid'});return false;}
  if(pendingMessages>=(role?32:24)||(!role&&!ingress(`${sender.tab.id}:${sender.documentId}`,message.type))){respond({ok:false,reason:'limited'});return false;}
  pendingMessages++;
  const finish=result=>{pendingMessages--;try{respond(result);}catch{/* Sender closed. */}};
  serialized(()=>handle(message,sender,role)).then(finish,()=>finish({ok:false,reason:'internal'}));return true;
});
chrome.runtime.onInstalled.addListener(()=>serialized(async()=>{
  await protectStorage();const data=await chrome.storage.local.get(['config','model']);const config=cleanConfig(data.config||DEFAULTS);
  await chrome.storage.local.set({config,model:pruneModel(data.model||emptyModel(),config)});await trimLedger();await syncScripts();
}));
chrome.runtime.onStartup.addListener(()=>serialized(async()=>{await protectStorage();await access.clear();await trimLedger();await syncScripts();}));
chrome.permissions.onAdded.addListener(()=>serialized(syncScripts));
chrome.permissions.onRemoved.addListener(()=>serialized(async()=>{
  const {config,model}=await load();config.allowedOrigins=await permittedOrigins(config.allowedOrigins);
  if(config.automatic&&!await chrome.permissions.contains({origins:['https://*/*']}))config.automatic=false;
  await chrome.storage.local.set({config,model:pruneModel(model,config)});await trimLedger();await access.clear();await stopDocuments();await syncScripts();
}));
chrome.tabs.onRemoved?.addListener(tabId=>serialized(()=>access.forget(tabId)));
