# NeuroLoad 0.3 — security review and hardening

Historical local review dated 28 October 2026, Europe/Brussels. Chrome for Testing 156.0.8078.4, Node 24.22.1. Not an independent audit, certification or zero-vulnerability guarantee. Later automatic-access/consent changes are documented separately.

## Threat model and findings

Reviewed manifest, options, worker, messages, URLs/sizes, storage and hints. Pages and content-script input are less trusted than the worker. No arbitrary worker downloads or settings/history disclosure should be available to that context. In 0.3 grants remained per-origin, incognito prohibited and Strict default. No new permission, telemetry, remote execution, authentication or secondary resource was added.

| Finding | Reproduction/risk | Correction |
|---|---|---|
| Incomplete URL filtering | log%2569n could hide a route on a server decoding twice; localhost. was an accepted loopback alias | Reject nested encoding, trailing-dot aliases, control/invisible characters; normalize sensitive words, including French/Turkish routes |
| Passive link exclusions differed | A refused link still produced prefetch; nofollow comparison was case-sensitive | Share hover/prediction filters; case-insensitive tokens; regressions for NOFOLLOW, download and data-no-prefetch |
| Too much BOOT data | Granted origins, exclusions and learned target URLs reached the less-trusted content context | Only mode/localhost fields; PREDICT returns at most one candidate from supplied current-page links, no history list |
| Insufficient ingress bounds | Repeated message payloads and queued writes lacked application limits | Strict schemas, fields, sizes, per-document/type/worker caps and bounded queue before storage reads |
| Sender/persistence checks | Origin/lifecycle not explicit and stored profiles less strictly filtered | Chrome identity, origin, top frame, active lifecycle and document checks; persisted-model/transition revalidation; reject caller-supplied cost/plan replacement |
| UI/CI defenses | Minimal UI CSP and movable action tags | Restrictive UI CSP, Trusted Types, no UI network, checkout/setup-node pinned to verified official SHAs |

These findings did not demonstrate remote code execution. BOOT disclosure assumed a compromised content context under the chosen defense model. URL cases showed guard bypasses, not exploitation of any specific external server.

## Executed verification

- **68 unit tests passed**, including 5,000 malformed data sets, 2,500 pseudorandom budget admissions, types/fields, corrupt storage, persistence failure, identity, revocation, restart, clock and message limits.
- **48 browser checks passed:** 11 original, 23 extended, 14 security checks. First-viewport learning, cache, UI, budgets and refused resources remained functional.
- Real-browser attacks checked protected storage denial from content; GET/SAVE/CLEAR role denial; minimal BOOT; ineffective forged postMessage; malformed messages; poisoned persistence; UI fetch blocked before reaching the fixture; Trusted Types HTML-sink blocking; forbidden options embedding; limited 80-message flood with usable UI; protections retained across browser restart.
- Worker tests simulated Chrome permission removal with queued work. Browser tests removed allowed origins. Native stable-Chrome optional-grant/revocation dialogs were not automated and remained human checks.
- npm audit reported no known installed-dependency vulnerabilities at the check. esbuild/Playwright are development tools, not extension runtime dependencies. No exhaustive audit of their sources was claimed.

Evidence: [base](browser-results-0.3.json), [extended](extended-browser-results-0.3.json), [security](security-browser-results-0.3.json), [build counts/fingerprints](security-evidence-0.3.json). These identify observations, not a signature/certification. [Small 0.3 navigation smoke](security-smoke-0.3.json) is not a performance study. The earlier 140-row matrix measures exactly 0.2. Remote CI had not run during this historical review.

## Compatibility and residual limits

Compatible settings remain; newly invalid profiles are ignored and learned again. Admissions stay persistent/centralized. Revalidation can add worker cost; no CPU improvement is claimed. Rate limits may temporarily suspend very fast usage.

Chrome's active lifecycle metadata describes the context when its message channel was created, not an atomic guarantee throughout queue delay. Document ID plus source visibility/URL/pagehide checks supplement it. Compromised browser/OS and separately privileged hostile extensions are outside this application guarantee.

Classification is heuristic. A public URL can change content, cache or redirects. DNS, native cookies and GET side effects cannot be fully controlled. Measured lacks an exact wire-byte cap; Strict initiates no speculative bodies. Local models are plaintext protected by Chrome contexts/profile access, not independent encryption. Reload after updates. Older releases restore weaker protections; disabling/removing stops future work but cannot recall sent traffic/cache.

## Primary sources

- [Chrome extension security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure).
- [Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [MessageSender metadata](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender).
- [Storage access](https://developer.chrome.com/docs/extensions/reference/api/storage), [Chromium implementation](https://chromium.googlesource.com/chromium/src/+/main/extensions/browser/api/storage/storage_utils.cc).
- [Isolated-world CSP](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#content-security-policy).

UI and storage protections were empirically checked in the recorded browser, not inferred solely from manifest directives.
