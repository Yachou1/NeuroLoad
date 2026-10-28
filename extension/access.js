import {safeURL,hasScope,pruneModel,excluded} from './core.js';
import {classifySite} from './site-policy.js';
import {isRecord} from './validation.js';
export const SENSITIVE_TTL=15*60*1000;
const EMPTY=()=>({pages:{},edges:{}});

export function createAccessController(api,{stopTab,injectTab,clock=()=>Date.now()}={}) {
  async function state(){
    const {sensitiveState={}}=await api.storage.session.get('sensitiveState');
    const now=clock(),clean={};
    for(const [key,r]of Object.entries(isRecord(sensitiveState)?sensitiveState:{}).slice(0,32)){
      if(/^\d+$/.test(key)&&isRecord(r)&&typeof r.origin==='string'&&r.origin.length<=2048&&Number.isSafeInteger(r.expiresAt)&&r.expiresAt>now&&['pending','approved','denied','dom'].includes(r.state))clean[key]=r;
    }
    return clean;
  }
  const save=records=>api.storage.session.set({sensitiveState:records});
  async function badge(tabId,text,title){
    await Promise.allSettled([
      api.action.setBadgeText({tabId,text}),api.action.setBadgeBackgroundColor({tabId,color:'#d8ab59'}),
      api.action.setTitle({tabId,title}),api.action.setPopup({tabId,popup:`popup.html?tab=${tabId}`})
    ]);
  }
  async function prompt(tabId,config,origin,category,notify){
    const records=await state();let record=records[tabId],fresh=false;
    if(!record || record.origin!==origin || record.state==='dom'){
      if(!record && Object.keys(records).length>=32){await badge(tabId,'!','NeuroLoad: too many open requests');return null;}
      record={origin,category,state:'pending',expiresAt:clock()+SENSITIVE_TTL,requestId:crypto.randomUUID()};
      records[tabId]=record;await save(records);fresh=true;
    }
    await badge(tabId,record.state==='denied'?'—':'?','NeuroLoad: consent required for this sensitive site');
    if(notify&&fresh&&typeof api.action.openPopup==='function'){
      try{const tabs=await api.tabs.query({active:true,lastFocusedWindow:true});if(tabs.some(tab=>tab.id===tabId))await api.action.openPopup({windowId:tabs[0].windowId});}catch{/* Badge remains available on browsers that cannot open the popup. */}
    }
    return record;
  }
  async function context(sender,config,publicModel,{notify=false}={}){
    let origin;try{origin=new URL(sender.url).origin;}catch{return {ok:false,reason:'blocked-url'};}
    if(!config.enabled)return{ok:false,reason:'disabled'};
    if(!safeURL(sender.url,{allowLoopback:config.allowLoopback,allowSensitiveHost:true}) || excluded(sender.url,config)){
      await badge(sender.tab.id,'!','NeuroLoad: this page remains protected');return{ok:false,reason:'protected-page'};
    }
    if(!hasScope(origin,config))return{ok:false,reason:'not-authorized'};
    if(!await api.permissions.contains({origins:[origin+'/*']}))return{ok:false,reason:'permission'};
    const records=await state(),record=records[sender.tab.id];
    if(record?.origin===origin&&record.state==='dom'){
      if(record.documentId===sender.documentId)return{ok:false,reason:'protected-page'};
      delete records[sender.tab.id];await save(records);
    }
    const category=classifySite(sender.url);
    if(!category)return{ok:true,policy:config,model:publicModel,sensitive:false};
    if(record?.origin===origin&&record.state==='approved'){
      const policy={...config,sensitiveOrigins:[origin]};
      return{ok:true,policy,model:pruneModel(record.model||EMPTY(),policy,clock()),sensitive:true,record};
    }
    await prompt(sender.tab.id,config,origin,category,notify);
    return{ok:false,reason:'sensitive-consent',category:category.category};
  }
  async function status(tabId,config,publicModel){
    let tab;try{tab=await api.tabs.get(tabId);}catch{return{ok:false,reason:'missing-tab'};}
    if(!config.enabled)return{ok:true,status:'disabled',mode:config.mode};
    if(tab.incognito)return{ok:true,status:'protected',mode:config.mode};
    if(!tab.url)return{ok:true,status:'permission',mode:config.mode};
    let origin;try{origin=new URL(tab.url).origin;}catch{return{ok:true,status:'blocked'};}
    if(!safeURL(tab.url,{allowLoopback:config.allowLoopback,allowSensitiveHost:true})||excluded(tab.url,config))return{ok:true,status:'protected',origin,mode:config.mode};
    if(!hasScope(origin,config)||!await api.permissions.contains({origins:[origin+'/*']}))return{ok:true,status:'permission',mode:config.mode};
    const records=await state(),record=records[tabId],category=classifySite(tab.url);
    if(record?.origin===origin&&record.state==='dom')return{ok:true,status:'protected',origin,mode:config.mode};
    if(!category)return{ok:true,status:'active',origin,mode:config.mode};
    if(record?.origin===origin&&record.state==='approved')return{ok:true,status:'approved',origin,category:category.label,expiresAt:record.expiresAt,mode:config.mode,requestId:record.requestId};
    const pending=await prompt(tabId,config,origin,category,false);
    return{ok:true,status:!pending?'capacity':pending.state==='denied'?'denied':'pending',origin,category:category.label,requestId:pending?.requestId||null,mode:config.mode};
  }
  async function decide(tabId,requestId,allow,config){
    const records=await state(),record=records[tabId];
    let tab;try{tab=await api.tabs.get(tabId);}catch{return{ok:false};}
    if(!record||record.requestId!==requestId||!tab.url||tab.incognito||new URL(tab.url).origin!==record.origin||!hasScope(record.origin,config)||!safeURL(tab.url,{allowLoopback:config.allowLoopback,allowSensitiveHost:true})||excluded(tab.url,config)||!await api.permissions.contains({origins:[record.origin+'/*']}))return{ok:false,reason:'stale-request'};
    record.state=allow?'approved':'denied';record.expiresAt=clock()+(allow?SENSITIVE_TTL:60*60*1000);record.model=EMPTY();record.requestId=crypto.randomUUID();
    await save(records);await stopTab?.(tabId);
    await badge(tabId,allow?'':'—',allow?'NeuroLoad: temporary consent is active':'NeuroLoad: declined for this tab');
    if(allow)await injectTab?.(tabId);
    return{ok:true,expiresAt:record.expiresAt};
  }
  async function writeModel(tabId,record,model,policy){
    const records=await state(),current=records[tabId];
    if(!current||current.state!=='approved'||current.requestId!==record.requestId)return false;
    const clean=pruneModel(model,policy,clock()),pages=Object.fromEntries(Object.entries(clean.pages).filter(([url])=>new URL(url).origin===current.origin).slice(0,8)),keep=new Set(Object.keys(pages));
    current.model={pages,edges:Object.fromEntries(Object.entries(clean.edges).filter(([,e])=>keep.has(e.from)&&keep.has(e.to)).slice(0,16))};await save(records);return true;
  }
  async function dom(sender){
    const records=await state();if(!records[sender.tab.id]&&Object.keys(records).length>=32)return;
    records[sender.tab.id]={origin:new URL(sender.url).origin,state:'dom',documentId:sender.documentId,expiresAt:clock()+SENSITIVE_TTL};
    await save(records);await badge(sender.tab.id,'!','NeuroLoad: form or private area, speculation suspended');await stopTab?.(sender.tab.id);
  }
  async function forget(tabId){const records=await state();delete records[tabId];await save(records);}
  async function clear(){const records=await state();await api.storage.session.remove('sensitiveState');await Promise.allSettled(Object.keys(records).map(id=>badge(Number(id),'','NeuroLoad')));}
  return{context,status,decide,writeModel,dom,forget,clear};
}
