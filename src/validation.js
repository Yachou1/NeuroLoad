// Untrusted message data is checked before disk access or queue admission.
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
export function validViewport(value) {
  if (!text(value, 28) || !/^\d{3,5}x\d{3,5}@\d{1,2}(?:\.\d)?$/.test(value)) return false;
  const [dimensions, ratio] = value.split('@'), [w, h] = dimensions.split('x').map(Number);
  return w >= 100 && w <= 20000 && h >= 100 && h <= 20000 && w % 100 === 0 && h % 100 === 0 && Number(ratio) >= .1 && Number(ratio) <= 16;
}
export function validProfile(value) {
  if (!isRecord(value) || !text(value.url, 2048) || !validViewport(value.viewport) || !integer(value.documentBytes, 1, 2097152) || !Array.isArray(value.resources) || value.resources.length > 3) return false;
  let styles = 0, images = 0;
  return value.resources.every(r => isRecord(r) && text(r.url, 2048) && integer(r.bytes, 1, 2097152) && (r.kind === 'style' ? ++styles <= 2 : r.kind === 'image' ? ++images <= 1 : false));
}
export function validConfig(value) {
  if (!isRecord(value) || Object.keys(value).length > 14) return false;
  const flags = ['enabled', 'allowLoopback','automatic'];
  const numbers = {pageKiB:[16,1024],hourKiB:[16,16384],dayKiB:[16,65536],pageRequests:[1,4],hourRequests:[1,60],dayRequests:[1,200],retentionDays:[1,7]};
  for (const [key, v] of Object.entries(value)) {
    if (flags.includes(key)) { if (typeof v !== 'boolean') return false; }
    else if (key === 'mode') { if (!['strict','measured'].includes(v)) return false; }
    else if (Object.hasOwn(numbers,key)) { if (!integer(v, ...numbers[key])) return false; }
    else if (key === 'allowedOrigins') { if (!Array.isArray(v) || v.length > 50 || !v.every(x => text(x,2048))) return false; }
    else if (key === 'exclusions') { if (!Array.isArray(v) || v.length > 100 || !v.every(x => text(x,200))) return false; }
    else return false;
  }
  return true;
}
export function validMessage(message, ui) {
  if (!isRecord(message) || !text(message.type, 16) || Object.keys(message).length > 8) return false;
  const keys={GET:['type'],CLEAR:['type'],SAVE:['type','config'],BOOT:['type','viewport'],LEARN:['type','profile'],CLICK:['type','to'],PLAN:['type','to','viewport','intent'],PREDICT:['type','viewport','links'],HOLD:['type','reason'],TAB_STATUS:['type','tabId'],SENSITIVE_ALLOW:['type','tabId','requestId'],SENSITIVE_DENY:['type','tabId','requestId']};
  if (!Object.hasOwn(keys,message.type) || Object.keys(message).some(k=>!keys[message.type].includes(k))) return false;
  if (message.type==='LEARN') {
    const p=message.profile;
    if (!isRecord(p) || !Array.isArray(p.resources) || p.resources.length>3 || Object.keys(p).some(k=>!['url','viewport','documentBytes','resources'].includes(k)) || p.resources.some(r=>!isRecord(r)||Object.keys(r).some(k=>!['url','kind','bytes'].includes(k)))) return false;
  }
  if(ui==='popup')return integer(message.tabId,0,2147483647) && (message.type==='TAB_STATUS' || (['SENSITIVE_ALLOW','SENSITIVE_DENY'].includes(message.type)&&typeof message.requestId==='string'&&/^[a-f0-9-]{36}$/i.test(message.requestId)));
  if (ui) return ['GET','CLEAR'].includes(message.type) || (message.type === 'SAVE' && validConfig(message.config));
  if (message.type === 'BOOT') return validViewport(message.viewport);
  if (message.type === 'PREDICT') return validViewport(message.viewport) && Array.isArray(message.links) && message.links.length<=100 && message.links.every(x=>text(x,2048));
  if (message.type === 'LEARN') return validProfile(message.profile);
  if (message.type === 'CLICK') return text(message.to,2048);
  if (message.type === 'HOLD')return message.reason==='sensitive-dom';
  return message.type === 'PLAN' && text(message.to,2048) && validViewport(message.viewport) && ['pointer','focus','prediction'].includes(message.intent);
}
export function createIngressGuard(clock = () => Date.now()) {
  const documents = new Map();
  let globalStart = 0, globalCount = 0, highWater = 0;
  return (key, type) => {
    const now = highWater = Math.max(highWater,clock());
    if (now - globalStart >= 60000) { globalStart=now; globalCount=0; }
    if (globalCount >= 200) return false;
    let bucket=documents.get(key);
    if (!bucket || now-bucket.at >= 60000) {
      if (!bucket && documents.size >= 128) documents.delete(documents.keys().next().value);
      bucket={at:now,total:0,types:Object.create(null)}; documents.set(key,bucket);
    }
    const limits={BOOT:6,LEARN:1,CLICK:20,PLAN:12,PREDICT:1,HOLD:1};
    if (!Object.hasOwn(limits,type) || bucket.total >= 32 || (bucket.types[type] || 0) >= limits[type]) return false;
    bucket.total++;bucket.types[type]=(bucket.types[type]||0)+1;globalCount++;
    return true;
  };
}
