(() => {
  // src/site-policy.js
  var within = (host, root) => host === root || host.endsWith("." + root);
  var governmentRoots = ["belgium.be", "service-public.fr", "ameli.fr", "urssaf.fr", "admin.ch", "europa.eu", "government.nl", "overheid.nl", "guichet.lu", "public.lu", "vlaanderen.be", "wallonie.be"];
  function classifySite(raw) {
    let host;
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      return null;
    }
    if (/(?:^|\.)(?:gov|gouv|fgov|gob|government|overheid)(?:\.|$)/.test(host) || /(?:^|\.)go\.[a-z]{2}$/.test(host) || governmentRoots.some((root) => within(host, root))) return { category: "government", label: "Government or public service" };
    if (/(?:bank|banque|banc[ao]|paypal|stripe|revolut|wise|wallet|impots|tax|assurance|insurance)/.test(host)) return { category: "finance", label: "Banking, payments or insurance" };
    if (/(?:hospital|medical|sante|health|mutuelle)/.test(host)) return { category: "health", label: "Health or personal data" };
    if (/(?:gmail|outlook|proton|webmail)/.test(host) || /(?:^|\.)(?:mail|inbox|messages)(?:\.|$)/.test(host)) return { category: "mail", label: "Mail" };
    if (/(?:^|\.)(?:auth|oauth|sso|login|account|accounts|admin|private|secure|token|session)(?:\.|$)/.test(host)) return { category: "private", label: "Private area or authentication" };
    if (host.split(".").some((part) => part.startsWith("xn--"))) return { category: "review", label: "Domain name requiring review" };
    return null;
  }
  var hardPrivateHost = (host) => /(?:^|[\W_])(?:auth|oauth|sso|log[io]n|log[io]ut|sign[io]n|signout|signup|register|account|accounts|profile|settings|admin|dashboard|checkout|cart|basket|payment|pay|billing|invoice|patient|api|graphql|wp-admin|wp-json|private|secret|secure|token|session|mail|webmail|inbox|messages|delete|remove|unsubscribe|download|connexion|deconnexion|compte|paiement|panier|facture|messagerie|giris|cikis|hesap|odeme|sepet|sifre)(?:$|[\W_])/i.test(host) || /(?:gmail|outlook|proton)/i.test(host);

  // src/core.js
  var DEFAULTS = Object.freeze({
    enabled: true,
    mode: "strict",
    allowedOrigins: [],
    exclusions: [],
    pageKiB: 256,
    hourKiB: 2048,
    dayKiB: 8192,
    pageRequests: 4,
    hourRequests: 20,
    dayRequests: 60,
    retentionDays: 7,
    allowLoopback: false,
    automatic: false
  });
  var forbidden = /(?:^|[\W_])(?:auth|oauth|sso|log[io]n|log[io]ut|sign[io]n|signout|signup|register|account|profile|settings|admin|dashboard|checkout|cart|basket|payment|pay|billing|invoice|bank|banking|wallet|medical|patient|health|hospital|mail|webmail|inbox|messages|private|secret|token|session|delete|remove|unsubscribe|download|api|graphql|wp-admin|wp-json)(?:$|[\W_])/i;
  var sensitiveHost = /(?:bank|banque|banc[ao]|paypal|stripe|revolut|wise|outlook|gmail|proton|hospital|medical|sante|health|impots|tax|mutuelle|assurance|insurance)/i;
  var sensitiveLocal = /(?:^|[\W_])(?:connexion|deconnexion|inscription|compte|paiement|panier|facture|messagerie|patient|sante|supprimer|desabonnement|giris|cikis|hesap|odeme|sepet|sifre)(?:$|[\W_])/i;
  var normalize = (value) => value.normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase();
  function safeURL(raw, { origin, document: document2 = true, allowLoopback = false, allowSensitiveHost = false } = {}) {
    try {
      if (typeof raw !== "string" || raw.length > 2048 || raw !== raw.trim() || /[\x00-\x20\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(raw)) return null;
      const u = new URL(raw);
      if (u.hostname.endsWith(".")) return null;
      const loop = ["localhost", "127.0.0.1"].includes(u.hostname);
      if (!(u.protocol === "https:" || allowLoopback && loop && u.protocol === "http:")) return null;
      if (u.username || u.password || u.search || document2 && u.hash) return null;
      if (origin && u.origin !== origin) return null;
      if (!loop && (u.hostname.includes(":") || /^\d+\./.test(u.hostname) || !u.hostname.includes(".") || /\.(?:local|internal|localhost|lan)$/.test(u.hostname))) return null;
      if (loop && !allowLoopback) return null;
      const decoded = decodeURIComponent(u.pathname), path = normalize(decoded);
      if (/%|[\x00-\x1f\x7f-\x9f\\\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(decoded)) return null;
      if (forbidden.test(path) || sensitiveLocal.test(path) || hardPrivateHost(u.hostname)) return null;
      if (!allowSensitiveHost && (forbidden.test(u.hostname) || sensitiveHost.test(u.hostname) || classifySite(u.href))) return null;
      if (document2 && /\.[a-z0-9]{1,8}$/i.test(path) && !/\.(?:html?|php|aspx?)$/i.test(path)) return null;
      u.hash = "";
      return u.href;
    } catch {
      return null;
    }
  }
  function viewportKey(w, h, dpr = 1) {
    return `${Math.round(w / 100) * 100}x${Math.round(h / 100) * 100}@${Math.round(dpr * 10) / 10}`;
  }

  // src/content.js
  if (window === window.top) start().catch(() => {
  });
  async function start() {
    const send = async (message) => {
      try {
        return await chrome.runtime.sendMessage(message);
      } catch {
        return { ok: false };
      }
    };
    const initialURL = location.href;
    const viewport = viewportKey(innerWidth, innerHeight, devicePixelRatio);
    const boot = await send({ type: "BOOT", viewport });
    if (!boot?.ok) return;
    const config = boot.config;
    const same = (raw) => safeURL(raw, { origin: location.origin, allowLoopback: config.allowLoopback, allowSensitiveHost: config.allowSensitiveHost });
    const lifetime = new AbortController(), nodes = /* @__PURE__ */ new Set();
    let stopped = false, pending = false, sampled = false, scrolled = scrollY > 0, lcp, lcpObserver, reportedSensitive = false;
    let intentTimer, assetTimer, expiryTimer, loadTimer, cutoffTimer;
    let held = null, heldAt = 0, accepted = null, assetsSent = false, expired = false;
    const denied = /* @__PURE__ */ new Set();
    const clean = () => {
      for (const n of nodes) n.remove();
      nodes.clear();
    };
    const sensitive = () => {
      const found = Boolean(document.querySelector('form,input[type="password"],input[autocomplete^="cc-"],[contenteditable="true"],[data-neuroload="off"],meta[name="neuroload"][content="off"]'));
      if (found && !reportedSensitive) {
        reportedSensitive = true;
        void send({ type: "HOLD", reason: "sensitive-dom" });
      }
      return found;
    };
    const constrained = () => !navigator.onLine || navigator.connection?.saveData || ["slow-2g", "2g", "3g"].includes(navigator.connection?.effectiveType);
    const eligible = () => !stopped && (!config.accessUntil || Date.now() < config.accessUntil) && location.href === initialURL && viewportKey(innerWidth, innerHeight, devicePixelRatio) === viewport && document.visibilityState === "visible" && !constrained() && !sensitive();
    const release = () => {
      held = null;
      clearTimeout(intentTimer);
      clearTimeout(assetTimer);
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      release();
      clean();
      lifetime.abort();
      lcpObserver?.disconnect();
      for (const timer of [expiryTimer, loadTimer, cutoffTimer]) clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
    const onMessage = (message, sender) => {
      if (sender.id === chrome.runtime.id && message.type === "STOP") stop();
    };
    const listen = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: lifetime.signal });
    chrome.runtime.onMessage.addListener(onMessage);
    try {
      lcpObserver = new PerformanceObserver((list) => {
        if (!scrolled && !sampled) lcp = list.getEntries().at(-1);
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
    }
    listen(window, "scroll", () => {
      if (scrollY > 0) scrolled = true;
    }, { once: true, passive: true });
    listen(window, "pagehide", stop, { once: true });
    listen(document, "visibilitychange", () => {
      if (document.hidden) {
        release();
        clean();
      }
    });
    listen(window, "offline", stop, { once: true });
    if (navigator.connection) listen(navigator.connection, "change", () => {
      if (constrained()) stop();
    });
    listen(window, "popstate", stop, { once: true });
    listen(window, "hashchange", stop, { once: true });
    function anchor(event) {
      const a = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!a || a.hasAttribute("download") || a.target && a.target !== "_self" || a.matches('[data-no-prefetch],[data-neuroload="off"]') || /(?:^|\s)(?:nofollow|external)(?:\s|$)/i.test(a.rel)) return null;
      const url = same(a.href);
      return url && url !== initialURL ? { a, url } : null;
    }
    function append(resource) {
      if (resource.kind === "document") {
        if (!HTMLScriptElement.supports?.("speculationrules")) return;
        const script = document.createElement("script");
        script.type = "speculationrules";
        script.dataset.neuroload = "hint";
        script.textContent = JSON.stringify({ prefetch: [{ source: "list", urls: [resource.url], eagerness: "immediate" }] });
        nodes.add(script);
        (document.head || document.documentElement).append(script);
      } else {
        if (performance.getEntriesByName(resource.url).length || [...document.querySelectorAll('link[rel="prefetch"],link[rel="preload"]')].some((link2) => link2.href === resource.url)) return;
        const link = document.createElement("link");
        if (!link.relList.supports("prefetch")) return;
        link.rel = "prefetch";
        link.as = resource.kind === "style" ? "style" : "image";
        link.href = resource.url;
        link.dataset.neuroload = "hint";
        nodes.add(link);
        (document.head || document.documentElement).append(link);
      }
    }
    function sendAssets() {
      if (expired || assetsSent || !accepted || held !== accepted.to) return;
      if (!eligible()) {
        stop();
        return;
      }
      assetsSent = true;
      for (const resource of accepted.resources) if (resource.kind !== "document") append(resource);
    }
    function scheduleAssets() {
      clearTimeout(assetTimer);
      if (accepted && held === accepted.to && !assetsSent) assetTimer = setTimeout(sendAssets, Math.max(0, 500 - (performance.now() - heldAt)));
    }
    async function anticipate(url, intent) {
      if (expired || denied.has(url)) return;
      if (accepted) {
        if (accepted.to === url && intent !== "prediction") scheduleAssets();
        return;
      }
      if (pending || !sampled || !eligible() || document.querySelector('script[type="speculationrules"]')) return;
      pending = true;
      const result = await send({ type: "PLAN", to: url, viewport, intent });
      pending = false;
      if (!result?.ok) {
        denied.add(url);
        return;
      }
      if (!eligible()) {
        stop();
        return;
      }
      accepted = result.plan;
      if (accepted.mode === "strict" || intent !== "prediction" && held !== url) return;
      for (const resource of accepted.resources) if (resource.kind === "document") append(resource);
      if (intent !== "prediction") scheduleAssets();
      expiryTimer = setTimeout(() => {
        expired = true;
        release();
        clean();
      }, 3e4);
    }
    function hold(target, intent) {
      release();
      if (!target) return;
      held = target.url;
      heldAt = performance.now();
      intentTimer = setTimeout(() => anticipate(target.url, intent), 200);
    }
    if (config.mode === "measured") {
      listen(document, "pointerover", (event) => {
        if (!event.isTrusted || event.pointerType === "touch") return;
        const target = anchor(event);
        if (target && event.relatedTarget instanceof Node && target.a.contains(event.relatedTarget)) return;
        hold(target, "pointer");
      }, { passive: true });
      listen(document, "pointerout", (event) => {
        const target = anchor(event);
        if (target && event.relatedTarget instanceof Node && target.a.contains(event.relatedTarget)) return;
        release();
      }, { passive: true });
      listen(document, "focusin", (event) => {
        if (event.isTrusted) hold(anchor(event), "focus");
      });
      listen(document, "focusout", release);
    }
    listen(document, "click", (event) => {
      if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !eligible()) return;
      const target = anchor(event);
      if (target) void send({ type: "CLICK", to: target.url });
    });
    function sample() {
      if (sampled || !eligible() || scrolled) return;
      sampled = true;
      lcpObserver?.disconnect();
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav || nav.redirectCount || nav.responseStatus && nav.responseStatus !== 200) return;
      const cutoff = Math.min(2500, performance.now());
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime || cutoff;
      const resources = [];
      const timing = (url) => performance.getEntriesByName(url).filter((e) => e.entryType === "resource" && e.responseEnd <= cutoff && e.encodedBodySize > 0).at(-1);
      let inspected = 0;
      for (const link of document.querySelectorAll('head link[rel="stylesheet"]')) {
        if (++inspected > 20 || resources.length >= 2) break;
        if (!link.sheet || link.disabled || link.integrity || link.crossOrigin || link.media && !matchMedia(link.media).matches) continue;
        const url = safeURL(link.href, { origin: location.origin, document: false, allowLoopback: config.allowLoopback, allowSensitiveHost: config.allowSensitiveHost });
        const entry = url && timing(url);
        if (entry && entry.startTime <= fcp) resources.push({ url, bytes: entry.encodedBodySize, kind: "style" });
      }
      const img = lcp?.element;
      if (img instanceof HTMLImageElement && img.loading !== "lazy" && img.complete && img.naturalWidth > 0 && !img.crossOrigin && !img.closest("picture") && !img.srcset) {
        const rect = img.getBoundingClientRect();
        const url = safeURL(img.currentSrc, { origin: location.origin, document: false, allowLoopback: config.allowLoopback, allowSensitiveHost: config.allowSensitiveHost });
        const entry = url && timing(url);
        if (entry && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth && rect.width > 0 && rect.height > 0) resources.push({ url, bytes: entry.encodedBodySize, kind: "image" });
      }
      void send({ type: "LEARN", profile: { url: initialURL, viewport, documentBytes: nav.encodedBodySize, resources } });
      if (config.mode === "strict") return;
      const links = /* @__PURE__ */ new Set();
      let inspectedLinks = 0;
      for (const a of document.links) {
        if (++inspectedLinks > 300) break;
        const target = anchor({ target: a });
        if (target) links.add(target.url);
        if (links.size >= 100) break;
      }
      if (links.size) (window.requestIdleCallback || ((fn) => setTimeout(fn, 100)))(async () => {
        if (!eligible()) return;
        const prediction = await send({ type: "PREDICT", viewport, links: [...links] });
        if (prediction?.ok && prediction.to && eligible()) void anticipate(prediction.to, "prediction");
      }, { timeout: 2e3 });
    }
    if (document.readyState === "complete") loadTimer = setTimeout(sample, 350);
    else listen(window, "load", () => {
      loadTimer = setTimeout(sample, 350);
    }, { once: true });
    cutoffTimer = setTimeout(() => {
      sample();
      lcpObserver?.disconnect();
    }, 2500);
  }
})();
