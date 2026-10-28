import { safeURL, viewportKey } from './core.js';

// No page-world bridge, fetch(), hidden navigation or continuous DOM observer.
if (window === window.top) start().catch(() => {});

async function start() {
  const send = async message => {try{return await chrome.runtime.sendMessage(message);}catch{return{ok:false};}};
  const initialURL = location.href;
  const viewport = viewportKey(innerWidth, innerHeight, devicePixelRatio);
  const boot = await send({ type: 'BOOT', viewport });
  if (!boot?.ok) return;
  const config = boot.config;
  const same = raw => safeURL(raw, { origin: location.origin, allowLoopback: config.allowLoopback,allowSensitiveHost:config.allowSensitiveHost });
  const lifetime = new AbortController(), nodes = new Set();
  let stopped = false, pending = false, sampled = false, scrolled = scrollY>0, lcp, lcpObserver,reportedSensitive=false;
  let intentTimer, assetTimer, expiryTimer, loadTimer, cutoffTimer;
  let held = null, heldAt = 0, accepted = null, assetsSent = false, expired = false;
  const denied = new Set();
  const clean = () => { for (const n of nodes) n.remove(); nodes.clear(); };
  const sensitive = () => {const found=Boolean(document.querySelector('form,input[type="password"],input[autocomplete^="cc-"],[contenteditable="true"],[data-neuroload="off"],meta[name="neuroload"][content="off"]'));if(found&&!reportedSensitive){reportedSensitive=true;void send({type:'HOLD',reason:'sensitive-dom'});}return found;};
  const constrained = () => !navigator.onLine || navigator.connection?.saveData || ['slow-2g', '2g', '3g'].includes(navigator.connection?.effectiveType);
  const eligible = () => !stopped && (!config.accessUntil||Date.now()<config.accessUntil) && location.href === initialURL && viewportKey(innerWidth, innerHeight, devicePixelRatio) === viewport && document.visibilityState === 'visible' && !constrained() && !sensitive();
  const release = () => { held = null; clearTimeout(intentTimer); clearTimeout(assetTimer); };
  const stop = () => {
    if (stopped) return;
    stopped = true; release(); clean(); lifetime.abort(); lcpObserver?.disconnect();
    for (const timer of [expiryTimer, loadTimer, cutoffTimer]) clearTimeout(timer);
    chrome.runtime.onMessage.removeListener(onMessage);
  };
  const onMessage = (message,sender) => { if (sender.id===chrome.runtime.id && message.type === 'STOP') stop(); };
  const listen = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: lifetime.signal });
  chrome.runtime.onMessage.addListener(onMessage);
  try {
    lcpObserver = new PerformanceObserver(list => { if (!scrolled && !sampled) lcp = list.getEntries().at(-1); });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* Optional progressive enhancement. */ }
  listen(window, 'scroll', () => { if (scrollY > 0) scrolled = true; }, { once: true, passive: true });
  listen(window, 'pagehide', stop, { once: true });
  listen(document, 'visibilitychange', () => { if (document.hidden) { release(); clean(); } });
  listen(window, 'offline', stop, { once: true });
  if (navigator.connection) listen(navigator.connection, 'change', () => { if (constrained()) stop(); });
  listen(window, 'popstate', stop, { once: true });
  listen(window, 'hashchange', stop, { once: true });

  function anchor(event) {
    const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self') || a.matches('[data-no-prefetch],[data-neuroload="off"]') || /(?:^|\s)(?:nofollow|external)(?:\s|$)/i.test(a.rel)) return null;
    const url = same(a.href);
    return url && url !== initialURL ? { a, url } : null;
  }
  function append(resource) {
    if (resource.kind === 'document') {
      if (!HTMLScriptElement.supports?.('speculationrules')) return;
      const script = document.createElement('script');
      script.type = 'speculationrules'; script.dataset.neuroload = 'hint';
      script.textContent = JSON.stringify({ prefetch: [{ source: 'list', urls: [resource.url], eagerness: 'immediate' }] });
      nodes.add(script); (document.head || document.documentElement).append(script);
    } else {
      if (performance.getEntriesByName(resource.url).length || [...document.querySelectorAll('link[rel="prefetch"],link[rel="preload"]')].some(link => link.href === resource.url)) return;
      const link = document.createElement('link');
      if (!link.relList.supports('prefetch')) return;
      link.rel = 'prefetch'; link.as = resource.kind === 'style' ? 'style' : 'image';
      link.href = resource.url; link.dataset.neuroload = 'hint';
      nodes.add(link); (document.head || document.documentElement).append(link);
    }
  }
  function sendAssets() {
    if (expired || assetsSent || !accepted || held !== accepted.to) return;
    if (!eligible()) { stop(); return; }
    assetsSent = true;
    for (const resource of accepted.resources) if (resource.kind !== 'document') append(resource);
  }
  function scheduleAssets() {
    clearTimeout(assetTimer);
    if (accepted && held === accepted.to && !assetsSent) assetTimer = setTimeout(sendAssets, Math.max(0, 500 - (performance.now() - heldAt)));
  }
  async function anticipate(url, intent) {
    if (expired || denied.has(url)) return;
    if (accepted) { if (accepted.to === url && intent !== 'prediction') scheduleAssets(); return; }
    if (pending || !sampled || !eligible() || document.querySelector('script[type="speculationrules"]')) return;
    pending = true;
    const result = await send({ type: 'PLAN', to: url, viewport, intent });
    pending = false;
    if (!result?.ok) { denied.add(url); return; }
    if (!eligible()) { stop(); return; }
    // Reserve once, even if the pointer leaves before the worker replies.
    accepted = result.plan;
    if (accepted.mode === 'strict' || (intent !== 'prediction' && held !== url)) return;
    for (const resource of accepted.resources) if (resource.kind === 'document') append(resource);
    if (intent !== 'prediction') scheduleAssets(); // Idle prediction never fetches assets alone.
    expiryTimer = setTimeout(() => { expired = true; release(); clean(); }, 30000);
  }
  function hold(target, intent) {
    release();
    if (!target) return;
    held = target.url; heldAt = performance.now();
    intentTimer = setTimeout(() => anticipate(target.url, intent), 200);
  }
  if (config.mode === 'measured') {
    listen(document, 'pointerover', event => {
      if (!event.isTrusted || event.pointerType === 'touch') return;
      const target = anchor(event);
      if (target && event.relatedTarget instanceof Node && target.a.contains(event.relatedTarget)) return;
      hold(target, 'pointer');
    }, { passive: true });
    listen(document, 'pointerout', event => {
      const target = anchor(event);
      if (target && event.relatedTarget instanceof Node && target.a.contains(event.relatedTarget)) return;
      release();
    }, { passive: true });
    listen(document, 'focusin', event => { if (event.isTrusted) hold(anchor(event), 'focus'); });
    listen(document, 'focusout', release);
  }
  listen(document, 'click', event => {
    if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !eligible()) return;
    const target = anchor(event);
    if (target) void send({ type: 'CLICK', to: target.url });
  });

  function sample() {
    if (sampled || !eligible() || scrolled) return;
    sampled = true; lcpObserver?.disconnect();
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav || nav.redirectCount || (nav.responseStatus && nav.responseStatus !== 200)) return;
    const cutoff = Math.min(2500, performance.now());
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || cutoff;
    const resources = [];
    const timing = url => performance.getEntriesByName(url).filter(e => e.entryType === 'resource' && e.responseEnd <= cutoff && e.encodedBodySize > 0).at(-1);
    let inspected = 0;
    for (const link of document.querySelectorAll('head link[rel="stylesheet"]')) {
      if (++inspected > 20 || resources.length >= 2) break;
      if (!link.sheet || link.disabled || link.integrity || link.crossOrigin || (link.media && !matchMedia(link.media).matches)) continue;
      const url = safeURL(link.href, { origin: location.origin, document: false, allowLoopback: config.allowLoopback,allowSensitiveHost:config.allowSensitiveHost });
      const entry = url && timing(url);
      if (entry && entry.startTime <= fcp) resources.push({ url, bytes: entry.encodedBodySize, kind: 'style' });
    }
    const img = lcp?.element;
    if (img instanceof HTMLImageElement && img.loading !== 'lazy' && img.complete && img.naturalWidth > 0 && !img.crossOrigin && !img.closest('picture') && !img.srcset) {
      const rect = img.getBoundingClientRect();
      const url = safeURL(img.currentSrc, { origin: location.origin, document: false, allowLoopback: config.allowLoopback,allowSensitiveHost:config.allowSensitiveHost });
      const entry = url && timing(url);
      if (entry && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth && rect.width > 0 && rect.height > 0) resources.push({ url, bytes: entry.encodedBodySize, kind: 'image' });
    }
    void send({ type: 'LEARN', profile: { url: initialURL, viewport, documentBytes: nav.encodedBodySize, resources } });
    if (config.mode === 'strict') return;
    const links = new Set();
    let inspectedLinks = 0;
    for (const a of document.links) {
      if (++inspectedLinks > 300) break;
      const target = anchor({target:a}); if(target) links.add(target.url);
      if(links.size>=100)break;
    }
    if (links.size) (window.requestIdleCallback || (fn => setTimeout(fn, 100)))(async () => {
      if(!eligible())return;
      const prediction=await send({type:'PREDICT',viewport,links:[...links]});
      if(prediction?.ok && prediction.to && eligible()) void anticipate(prediction.to,'prediction');
    }, { timeout: 2000 });
  }
  if (document.readyState === 'complete') loadTimer = setTimeout(sample, 350);
  else listen(window, 'load', () => { loadTimer = setTimeout(sample, 350); }, { once: true });
  cutoffTimer = setTimeout(() => { sample(); lcpObserver?.disconnect(); }, 2500);
}
