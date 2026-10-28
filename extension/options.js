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
var bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;
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
function cleanConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
  const c = { ...DEFAULTS };
  for (const key of ["enabled", "allowLoopback", "automatic"]) if (typeof input[key] === "boolean") c[key] = input[key];
  c.mode = input.mode === "measured" ? "measured" : "strict";
  for (const [key, min, max] of [
    ["pageKiB", 16, 1024],
    ["hourKiB", 16, 16384],
    ["dayKiB", 16, 65536],
    ["pageRequests", 1, 4],
    ["hourRequests", 1, 60],
    ["dayRequests", 1, 200],
    ["retentionDays", 1, 7]
  ]) c[key] = bounded(input[key], DEFAULTS[key], min, max);
  c.allowedOrigins = [...new Set((Array.isArray(input.allowedOrigins) ? input.allowedOrigins : []).slice(0, 50).flatMap((raw) => {
    try {
      const u = new URL(raw);
      return safeURL(u.origin + "/", { allowLoopback: c.allowLoopback, allowSensitiveHost: true }) ? [u.origin] : [];
    } catch {
      return [];
    }
  }))];
  c.exclusions = [...new Set((Array.isArray(input.exclusions) ? input.exclusions : []).filter((x) => typeof x === "string" && x.trim() && x.length <= 200).map((x) => x.trim().toLowerCase()).slice(0, 100))];
  return c;
}

// src/options.js
var $ = (id) => document.getElementById(id);
var config;
var globalAccess = false;
var call = (message) => chrome.runtime.sendMessage(message);
var status = (text, error = false) => {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
};
function read() {
  const c = { ...config, enabled: $("enabled").checked, mode: document.querySelector('[name="mode"]:checked').value, allowLoopback: $("allowLoopback").checked, exclusions: $("exclusions").value.split("\n") };
  for (const key of ["pageKiB", "hourKiB", "dayKiB", "pageRequests", "hourRequests", "dayRequests", "retentionDays"]) c[key] = Number($(key).value);
  return cleanConfig(c);
}
function render() {
  $("auto-status").textContent = config.automatic ? "Automatic mode is on: recognized sensitive HTTPS sites require temporary consent." : "Automatic mode is off: only manually added sites are included.";
  $("enable-auto").hidden = config.automatic;
  $("disable-auto").hidden = !config.automatic && !globalAccess;
  for (const key of ["enabled", "allowLoopback"]) $(key).checked = config[key];
  for (const key of ["pageKiB", "hourKiB", "dayKiB", "pageRequests", "hourRequests", "dayRequests", "retentionDays"]) $(key).value = config[key];
  document.querySelector(`[name="mode"][value="${config.mode}"]`).checked = true;
  $("exclusions").value = config.exclusions.join("\n");
  $("sites").replaceChildren();
  $("no-sites").hidden = config.allowedOrigins.length > 0;
  $("no-sites").textContent = config.automatic ? "No manually added sites. Automatic mode covers accessible HTTPS sites." : "No sites allowed. NeuroLoad does not observe any pages.";
  for (const origin of config.allowedOrigins) {
    const li = document.createElement("li"), text = document.createElement("span"), button = document.createElement("button");
    text.textContent = origin;
    button.textContent = "Remove access";
    button.className = "secondary";
    button.addEventListener("click", async () => {
      config = read();
      config.allowedOrigins = config.allowedOrigins.filter((x) => x !== origin);
      const result = await call({ type: "SAVE", config });
      if (!result.ok) return status("Could not remove this site.", true);
      await chrome.permissions.remove({ origins: [`${origin}/*`] });
      config = result.config;
      render();
      status("Access removed and site data cleared. Reload its tabs.");
    });
    li.append(text, button);
    $("sites").append(li);
  }
}
async function refresh() {
  const result = await call({ type: "GET" });
  if (!result?.ok) throw new Error("unavailable");
  config = result.config;
  globalAccess = result.globalAccess === true;
  render();
  $("stats").textContent = `${result.pages} pages \xB7 ${result.transitions} transitions`;
  const entries = result.ledger.entries;
  $("usage").textContent = `Reservations over 24 h: ${entries.reduce((s, e) => s + e.requests, 0)} resources \xB7 ${Math.ceil(entries.reduce((s, e) => s + e.bytes, 0) / 1024)} estimated KiB. These are not measured network bytes.`;
}
$("add-site").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const raw = new URL($("origin").value.trim());
    const next = read();
    if (!safeURL(raw.origin + "/", { allowLoopback: next.allowLoopback, allowSensitiveHost: true })) return status("Choose a supported HTTPS site. Private areas remain blocked.", true);
    if (next.allowedOrigins.length >= 50) return status("The 50-site limit has been reached.", true);
    const granted = await chrome.permissions.request({ origins: [`${raw.origin}/*`] });
    if (!granted) return status("Access was not granted. No changes made.", true);
    next.allowedOrigins = [.../* @__PURE__ */ new Set([...next.allowedOrigins, raw.origin])];
    const result = await call({ type: "SAVE", config: next });
    if (!result?.ok) return status("Settings were not saved.", true);
    config = result.config;
    render();
    $("origin").value = "";
    status("Site allowed. Reload its tab to begin.");
  } catch {
    status("Invalid address or permission unavailable.", true);
  }
});
$("enable-auto").addEventListener("click", async (event) => {
  if (!event.isTrusted) return;
  try {
    const next = read();
    if (!await chrome.permissions.request({ origins: ["https://*/*"] })) return status("Broad access was denied. Automatic mode remains off.", true);
    globalAccess = true;
    next.automatic = true;
    const result = await call({ type: "SAVE", config: next });
    if (!result?.ok) throw new Error();
    config = result.config;
    render();
    status("Automatic mode enabled. Reload existing tabs. Recognized sensitive sites will request your consent.");
  } catch {
    render();
    status("Activation unavailable. You can remove broad access using the removal button.", true);
  }
});
$("disable-auto").addEventListener("click", async () => {
  try {
    const next = read();
    next.automatic = false;
    const result = await call({ type: "SAVE", config: next });
    if (!result?.ok) throw new Error();
    const removed = await chrome.permissions.remove({ origins: ["https://*/*"] });
    await refresh();
    status(removed ? "Automatic mode stopped and broad access removed. Reload your tabs." : "Automatic mode stopped. Chrome retains broad access: check the extension permissions.", !removed);
  } catch {
    status("Could not complete removal. Check the extension permissions in Chrome.", true);
  }
});
$("save").addEventListener("click", async () => {
  const inputs = [...document.querySelectorAll('input[type="number"]')];
  if (inputs.some((input) => !input.reportValidity())) return;
  try {
    const result = await call({ type: "SAVE", config: read() });
    if (!result?.ok) throw new Error();
    config = result.config;
    render();
    status("Settings saved. Reload allowed tabs.");
  } catch {
    status("Could not save settings.", true);
  }
});
$("clear").addEventListener("click", async () => {
  const result = await call({ type: "CLEAR" });
  if (!result?.ok) return status("Clearing is unavailable.", true);
  await refresh();
  status("Learning data and reservations cleared.");
});
refresh().then(() => status("Everything stays on this device."), () => status("Service unavailable. Reload the extension.", true));
