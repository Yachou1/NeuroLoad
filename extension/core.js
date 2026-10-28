import {validViewport, validProfile, isRecord} from './validation.js';
import {classifySite,hardPrivateHost} from './site-policy.js';
export const DAY = 86400000;
export const DEFAULTS = Object.freeze({
  enabled: true, mode: 'strict', allowedOrigins: [], exclusions: [],
  pageKiB: 256, hourKiB: 2048, dayKiB: 8192,
  pageRequests: 4, hourRequests: 20, dayRequests: 60,
  retentionDays: 7, allowLoopback: false, automatic: false
});
const forbidden = /(?:^|[\W_])(?:auth|oauth|sso|log[io]n|log[io]ut|sign[io]n|signout|signup|register|account|profile|settings|admin|dashboard|checkout|cart|basket|payment|pay|billing|invoice|bank|banking|wallet|medical|patient|health|hospital|mail|webmail|inbox|messages|private|secret|token|session|delete|remove|unsubscribe|download|api|graphql|wp-admin|wp-json)(?:$|[\W_])/i;
const sensitiveHost = /(?:bank|banque|banc[ao]|paypal|stripe|revolut|wise|outlook|gmail|proton|hospital|medical|sante|health|impots|tax|mutuelle|assurance|insurance)/i;
const sensitiveLocal = /(?:^|[\W_])(?:connexion|deconnexion|inscription|compte|paiement|panier|facture|messagerie|patient|sante|supprimer|desabonnement|giris|cikis|hesap|odeme|sepet|sifre)(?:$|[\W_])/i;
const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
export const excluded = (url, config) => config.exclusions.some(x => normalize(decodeURIComponent(url)).includes(normalize(x)));
const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;

export function safeURL(raw, { origin, document = true, allowLoopback = false, allowSensitiveHost = false } = {}) {
  try {
    if (typeof raw !== 'string' || raw.length > 2048 || raw !== raw.trim() || /[\x00-\x20\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(raw)) return null;
    const u = new URL(raw);
    if (u.hostname.endsWith('.')) return null;
    const loop = ['localhost', '127.0.0.1'].includes(u.hostname);
    if (!(u.protocol === 'https:' || (allowLoopback && loop && u.protocol === 'http:'))) return null;
    if (u.username || u.password || u.search || (document && u.hash)) return null;
    if (origin && u.origin !== origin) return null;
    if (!loop && (u.hostname.includes(':') || /^\d+\./.test(u.hostname) || !u.hostname.includes('.') || /\.(?:local|internal|localhost|lan)$/.test(u.hostname))) return null;
    if (loop && !allowLoopback) return null;
    const decoded = decodeURIComponent(u.pathname), path = normalize(decoded);
    if (/%|[\x00-\x1f\x7f-\x9f\\\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(decoded)) return null;
    if (forbidden.test(path) || sensitiveLocal.test(path) || hardPrivateHost(u.hostname)) return null;
    if(!allowSensitiveHost && (forbidden.test(u.hostname) || sensitiveHost.test(u.hostname) || classifySite(u.href)))return null;
    if (document && /\.[a-z0-9]{1,8}$/i.test(path) && !/\.(?:html?|php|aspx?)$/i.test(path)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

export function cleanConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const c = { ...DEFAULTS };
  for (const key of ['enabled', 'allowLoopback','automatic']) if (typeof input[key] === 'boolean') c[key] = input[key];
  c.mode = input.mode === 'measured' ? 'measured' : 'strict';
  for (const [key, min, max] of [
    ['pageKiB', 16, 1024], ['hourKiB', 16, 16384], ['dayKiB', 16, 65536],
    ['pageRequests', 1, 4], ['hourRequests', 1, 60], ['dayRequests', 1, 200], ['retentionDays', 1, 7]
  ]) c[key] = bounded(input[key], DEFAULTS[key], min, max);
  c.allowedOrigins = [...new Set((Array.isArray(input.allowedOrigins) ? input.allowedOrigins : []).slice(0, 50).flatMap(raw => {
    try { const u = new URL(raw); return safeURL(u.origin + '/', { allowLoopback: c.allowLoopback,allowSensitiveHost:true }) ? [u.origin] : []; } catch { return []; }
  }))];
  c.exclusions = [...new Set((Array.isArray(input.exclusions) ? input.exclusions : []).filter(x => typeof x === 'string' && x.trim() && x.length <= 200).map(x => x.trim().toLowerCase()).slice(0, 100))];
  return c;
}

export function allowed(raw, config) {
  const url = safeURL(raw, { allowLoopback: config.allowLoopback,allowSensitiveHost:true });
  if(!url)return false;
  const origin=new URL(url).origin;
  return Boolean(hasScope(origin,config) && !excluded(url,config) && (!classifySite(url) || config.sensitiveOrigins?.includes(origin)));
}

export function hasScope(origin,config){
  const root=safeURL(origin+'/',{allowLoopback:config.allowLoopback,allowSensitiveHost:true});
  return Boolean(config.enabled && root && (config.allowedOrigins.includes(origin) || (config.automatic && (new URL(root).protocol==='https:' || config.allowLoopback))));
}

export function viewportKey(w, h, dpr = 1) {
  return `${Math.round(w / 100) * 100}x${Math.round(h / 100) * 100}@${Math.round(dpr * 10) / 10}`;
}

export function pruneModel(model, config, now = Date.now()) {
  const cutoff = now - config.retentionDays * DAY;
  const policy={...config,enabled:true};
  const pages = Object.entries(isRecord(model?.pages)?model.pages:{}).slice(0,400).filter(([url,p]) => isRecord(p) && Number.isSafeInteger(p.at) && p.at >= cutoff && p.at <= now+300000 && allowed(url,policy) && validProfile({...p,url}) && p.resources.every(r=>validResource(r,new URL(url).origin,policy))).sort((a,b)=>b[1].at-a[1].at).slice(0,200).map(([url,p])=>[url,{at:p.at,viewport:p.viewport,documentBytes:p.documentBytes,resources:p.resources.map(({url,kind,bytes})=>({url,kind,bytes}))}]);
  const keep = new Set(pages.map(([url]) => url));
  const edges = Object.entries(isRecord(model?.edges)?model.edges:{}).slice(0,1200).filter(([key,e]) => isRecord(e) && Number.isSafeInteger(e.at) && e.at >= cutoff && e.at <= now+300000 && Number.isInteger(e.count) && e.count>=1 && e.count<=100 && keep.has(e.from) && keep.has(e.to) && new URL(e.from).origin===new URL(e.to).origin && key===JSON.stringify([e.from,e.to])).sort((a,b)=>b[1].at-a[1].at).slice(0,600).map(([key,e])=>[key,{from:e.from,to:e.to,count:e.count,at:e.at}]);
  return { pages: Object.fromEntries(pages), edges: Object.fromEntries(edges) };
}

export function validResource(r, origin, config) {
  if (!isRecord(r) || !['style','image'].includes(r.kind) || !Number.isSafeInteger(r.bytes) || r.bytes<1 || r.bytes>2097152) return false;
  const url=safeURL(r.url,{origin,document:false,allowLoopback:config.allowLoopback,allowSensitiveHost:config.sensitiveOrigins?.includes(origin)});
  return Boolean(url && url===r.url && !excluded(url,config) && !/\.(?:mp4|webm|mov|avi|m4v|m3u8|mpd|mp3|m4a|ogg|wav|flac|js|mjs|wasm|woff2?|ttf|otf|zip|pdf)$/i.test(decodeURIComponent(new URL(url).pathname)));
}

// Sizes are observed encoded response bodies; never a wire-byte guarantee.
export function learn(model, raw, config, now = Date.now()) {
  if (!raw || !allowed(raw.url, config) || !validViewport(raw.viewport) || !Number.isSafeInteger(raw.documentBytes) || raw.documentBytes>2097152) return model;
  const docBytes = bounded(raw.documentBytes, 0, 0, 2 * 1024 * 1024);
  if (!docBytes) return model; // Unknown/cached-zero sizes are not guessed.
  const origin = new URL(raw.url).origin;
  let styles = 0, images = 0;
  const seen = new Set();
  const resources = (Array.isArray(raw.resources) ? raw.resources : []).slice(0, 12).flatMap(r => {
    const url = safeURL(r?.url, { origin, document: false, allowLoopback: config.allowLoopback,allowSensitiveHost:config.sensitiveOrigins?.includes(origin) });
    const bytes = bounded(r?.bytes, 0, 0, 2 * 1024 * 1024);
    if (!url || !validResource(r,origin,config) || seen.has(url)) return [];
    if (r.kind === 'style' ? styles++ >= 2 : r.kind === 'image' ? images++ >= 1 : true) return [];
    seen.add(url);
    return [{ url, kind: r.kind, bytes }];
  });
  const previous = model.pages?.[raw.url];
  const pages = { ...model.pages, [raw.url]: { at: now, viewport: raw.viewport, documentBytes: Math.max(docBytes, previous?.documentBytes || 0), resources } };
  return pruneModel({ pages, edges: model.edges || {} }, config, now);
}

export function addTransition(model, from, to, config, now = Date.now()) {
  if (from === to || !allowed(from, config) || !allowed(to, config) || new URL(from).origin !== new URL(to).origin) return model;
  const key = JSON.stringify([from, to]);
  const old = model.edges?.[key];
  return pruneModel({ ...model, edges: { ...model.edges, [key]: { from, to, count: Math.min(100, (old?.count || 0) + 1), at: now } } }, config, now);
}

export function rank(model, from, to, intent, now = Date.now()) {
  const edge = model.edges?.[JSON.stringify([from, to])];
  const decayed = edge ? edge.count * Math.exp(-(now - edge.at) / (3 * DAY)) : 0;
  const confidence = 1 - Math.exp(-decayed / 3);
  return { score: (intent === 'pointer' || intent === 'focus' ? 0.8 : 0) + 0.2 * confidence, confidence };
}

export function makePlan(model, from, to, viewport, intent, config, now = Date.now()) {
  if (!allowed(from, config) || !allowed(to, config) || from === to || new URL(from).origin !== new URL(to).origin) return null;
  const p = model.pages?.[to];
  if (!p || p.viewport !== viewport || p.at < now - config.retentionDays * DAY || !p.documentBytes) return null;
  const { score, confidence } = rank(model, from, to, intent, now);
  if (intent === 'prediction' ? confidence < 0.8 : score < 0.8) return null;
  if (config.mode === 'strict') return { mode: 'strict', to, resources: [], estimatedBytes: 0, requests: 0 };
  const items = [{ url: to, kind: 'document', bytes: p.documentBytes }, ...p.resources];
  const resources = [];
  let estimatedBytes = 0;
  for (const item of items) {
    const estimate = item.bytes * 2 + 4096;
    if (resources.length >= config.pageRequests || estimatedBytes + estimate > config.pageKiB * 1024) break;
    resources.push({ ...item, estimate });
    estimatedBytes += estimate;
  }
  return resources.length ? { mode: 'measured', to, resources, estimatedBytes, requests: resources.length } : null;
}

export function reserve(ledger, plan, pageId, config, now = Date.now()) {
  // A wall-clock rollback must not reopen a spent sliding-window budget.
  now = Math.max(now, ledger.lastAt || 0, ...(ledger.entries || []).map(e => e.at));
  const entries = (ledger.entries || []).filter(e => e.at > now - DAY);
  const nextLedger = { entries, lastAt: now };
  if (!plan || !plan.requests || entries.some(e => e.pageId === pageId)) return { ok: false, ledger: nextLedger, reason: 'page-or-empty' };
  if (entries.some(e => e.to === plan.to && now - e.at < 60000)) return { ok: false, ledger: nextLedger, reason: 'cooldown' };
  for (const [ms, requestCap, byteCap] of [[3600000, config.hourRequests, config.hourKiB * 1024], [DAY, config.dayRequests, config.dayKiB * 1024]]) {
    const recent = entries.filter(e => now - e.at < ms);
    if (recent.reduce((sum, e) => sum + e.requests, 0) + plan.requests > requestCap || recent.reduce((sum, e) => sum + e.bytes, 0) + plan.estimatedBytes > byteCap) return { ok: false, ledger: nextLedger, reason: 'budget' };
  }
  if (plan.requests > config.pageRequests || plan.estimatedBytes > config.pageKiB * 1024) return { ok: false, ledger: nextLedger, reason: 'budget' };
  entries.push({ at: now, pageId, to: plan.to, requests: plan.requests, bytes: plan.estimatedBytes });
  return { ok: true, ledger: nextLedger };
}
