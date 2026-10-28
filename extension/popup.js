// src/popup.js
var $ = (id) => document.getElementById(id);
var tabId;
var requestId;
var call = (message) => chrome.runtime.sendMessage(message);
function show(result) {
  requestId = result.requestId;
  $("origin").textContent = result.origin || "";
  $("category").textContent = result.category || "";
  $("category").hidden = !result.category;
  $("mode").textContent = result.mode === "strict" ? "Strict mode: local learning only, no speculative content downloads." : "Measured mode: first-viewport resources, estimated budget.";
  const pending = ["pending", "denied"].includes(result.status) && Boolean(requestId);
  $("allow").hidden = !pending;
  $("deny").hidden = !pending;
  $("revoke").hidden = result.status !== "approved";
  $("sensitive-note").hidden = !pending;
  const labels = { pending: ["Your consent is required", "This site appears sensitive. NeuroLoad does not analyze its content or start speculation before your decision."], denied: ["NeuroLoad stays off", "You declined activation for this tab. You can change that decision here."], approved: ["Temporary consent is active", "Consent is valid until " + new Date(result.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + ". Profiles for this site remain temporary."], active: ["NeuroLoad is allowed", "This site is not recognized as sensitive. Page, budget and connection safeguards still apply."], protected: ["This page remains protected", "A private area, form, URL parameters or exclusion prevents speculation. This screen cannot override that protection."], permission: ["Site access has not been granted", "Enable automatic mode in settings or add this site to your manual list."], disabled: ["NeuroLoad is off", "The extension is not preparing pages. You can enable it in settings."], blocked: ["Unsupported page", "NeuroLoad cannot run on this page."] };
  labels.capacity = ["Too many open requests", "Close other tabs or clear learning data in settings to free temporary requests."];
  const [title, description] = labels[result.status] || labels.blocked;
  $("title").textContent = title;
  $("description").textContent = description;
}
async function decide(allow) {
  $("allow").disabled = true;
  $("deny").disabled = true;
  $("revoke").disabled = true;
  try {
    const result = await call({ type: allow ? "SENSITIVE_ALLOW" : "SENSITIVE_DENY", tabId, requestId });
    if (!result?.ok) throw new Error();
    window.close();
  } catch {
    $("status").textContent = "The request expired or the tab changed. Reopen this window to check the site.";
  }
}
$("allow").addEventListener("click", (event) => {
  if (event.isTrusted) void decide(true);
});
$("deny").addEventListener("click", (event) => {
  if (event.isTrusted) void decide(false);
});
$("revoke").addEventListener("click", (event) => {
  if (event.isTrusted) void decide(false);
});
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
(async () => {
  const tab = new URL(location.href).searchParams.get("tab");
  tabId = tab !== null ? Number(tab) : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  if (!Number.isInteger(tabId) || tabId < 0) throw new Error();
  const result = await call({ type: "TAB_STATUS", tabId });
  if (!result?.ok) throw new Error();
  show(result);
})().catch(() => {
  $("title").textContent = "Tab unavailable";
  $("description").textContent = "Open this window from the NeuroLoad icon in the tab you want to check.";
});
