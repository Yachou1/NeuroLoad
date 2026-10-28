# Prototype architecture

## Execution flow

`options → optional Chrome grant → SAVE → worker → dynamic isolated content script`.

`content script → LEARN → validated model → PLAN → reconstructed cost → serialized persistent reservation → native hints → native cache → normal navigation`.

Sources are in `src/`; `npm run build` generates the standalone classic content script and extension modules under `extension/`. There is no remote code or third-party runtime dependency. npm packages are development tools only.

`site-policy.js` classifies hostname signals. `access.js` runs before BOOT authorization. Automatic mode requires the actual global HTTPS grant. Recognized sensitive sites use `popup → TAB_STATUS → SENSITIVE_ALLOW / SENSITIVE_DENY → tab/origin/nonce checks → session state`. Approval stops and reinjects the isolated script in that tab; it does not override private-page guards. The toolbar action now opens this popup, which links to settings.

## Message contract

| Message | Accepted sender | Effect |
|---|---|---|
| GET / SAVE / CLEAR | Exact trusted options page | Counters, validated configuration, data/reservation clearing |
| BOOT | Granted, active, top-level non-incognito document | Mode and localhost flag; approved sensitive pages also receive the sensitive-host flag and expiry, never models/global configuration |
| PREDICT | Same frame, valid viewport, up to 100 supplied links | At most one fresh eligible candidate already among those links, never a history list |
| LEARN | Exact `sender.url` document | Bounded viewport, document size and up to three permitted subresources |
| CLICK | Granted source, public same-origin target | Decaying transition count; source emits only on trusted clicks |
| PLAN | Granted document, known intent | Reconstruct plan and reserve centrally; no blind caller-supplied downloads |
| HOLD | Same source, sensitive-dom reason | Suspend a form/private document and remove its temporary model |
| TAB_STATUS | Exact trusted popup | Current origin, category, request ID and status, never model data |
| SENSITIVE_ALLOW / SENSITIVE_DENY | Same popup, tab/request binding | Recheck current URL, grants and hard guards; rotate nonce and stop old script |
| STOP | Worker to existing scripts | Remove hints, listeners and timers after changes or revocation |

Message shapes, sender identity, sizes, queue capacity and rate limits are checked before disk reads/queue admission. Worker tasks are serialized so reads, admissions and writes do not interleave across tabs. The source identity combines Chrome tab and document IDs. There is no HTTP application server, external API or database migration.

## Learning and bounds

The public model contains at most 200 pages and 600 transitions, retained logically for 1–7 days. Sensitive models stay separately in trusted session storage: at most 32 temporary records, with 8 pages and 16 transitions per approved tab for 15 minutes. Requests last 15 minutes and denials one hour. Expiry is enforced before reuse; physical cleanup occurs on later mutations, not a permanent timer.

Revocation removes affected models. Hashed budget reservations remain counted for 24 hours to avoid reopening caps. Explicit clearing removes models and reservations. Disabling keeps eligible public learning but clears temporary consent and stops scripts. Browser startup resets sensitive consent.

The initial sample runs at `load + 350 ms`, with a 2.5-second cutoff. There is no continuous DOM MutationObserver. Sensitive markers are rechecked during learning, admission and asset emission. Early scrolling prevents learning. CSS inspection is limited to 20 candidates; link inspection to 300 without materializing the entire collection. Viewports are rounded to 100 px and DPR to one decimal. A class-changing resize prevents profile use.

Trusted hover or focus proposes a known document at 200 ms, with CSS/image at 500 ms on the same held target. Leaving cancels the second stage; moving among children of the same link does not restart it. An unknown link does not consume the ability to speculate on a later known one. Reservations are not refunded. Hints expire after 30 seconds. Strict installs no speculative hover handler.

Passive prediction requires confidence ≥ 0.8, using `1 - exp(-decayed_count / 3)` with a three-day decay constant and a currently eligible visible link. Only the document is proposed without sustained intent. This is lightweight local learning, not a neural-network accuracy claim.

## Persistence and compatibility

Since 0.3, persisted models and transitions are revalidated at every worker load to reject corrupted or newly forbidden entries. BOOT no longer exposes learned target lists; PREDICT accepts bounded current-page candidates. UI CSP/Trusted Types supplement rather than replace worker validation. Link filtering includes case-insensitive `nofollow`/`external`, download/target restrictions and opt-outs.

The ledger persists across worker/browser restarts. `lastAt` prevents reopening caps if the clock moves backward; older compatible ledgers may omit it. Since 0.4, destination fields are SHA-256 fingerprints and old URLs are migrated during installation/startup or ledger cleanup. Unsalted hashes are data minimization, not encryption.

Chrome 122+ is declared; tests record the actual available Chromium version, not proof for every older version. Popup auto-opening has a version-sensitive badge fallback. No page response, navigation behavior or server code is rewritten.

Rollback: choose Strict, disable automatic access or remove the extension, then reload/close tabs. The settings do not clear Chrome's global cache, and sent requests cannot be retroactively canceled. Tests use isolated profiles and do not change the personal browser.
