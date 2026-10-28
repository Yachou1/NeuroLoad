# Security policy and limitations

NeuroLoad is an experimental prototype. Local reviews and adversarial tests do not provide an independent certification or a zero-vulnerability guarantee. See [the 0.3 review](docs/SECURITY-REVIEW-0.3.md), [sensitive-site consent](docs/AUTOMATIC-0.4.md) and [publication checks](docs/PUBLICATION-0.4.1.md).

## Permissions and trust boundaries

Required permissions are only `storage` and `scripting`. Site access is optional: individual origins in manual mode, or broad HTTPS access after explicitly enabling automatic mode. The sensitivity filter is an application control; it does not narrow the technical scope of Chrome's global host permission. Use manual mode for an actual browser-enforced domain boundary.

Messages are checked before storage access and queue admission: schema, field count, size, extension ID, sender origin, main frame, active lifecycle and document ID. The worker then checks current permissions, URLs, exclusions, freshness and budgets. Plans and resource costs are reconstructed from validated models. Websites have no external NeuroLoad API or page-world message bridge. Content scripts receive no global settings, browsing-history list or list of learned targets.

Sensitive consent is accepted only from the extension popup. A random request identifier is bound to the tab and exact origin, rotated after each decision, and checked against the tab's current URL. Consent lasts 15 minutes and is not added to permanent settings. It cannot override private routes, login/payment/action hosts, parameters, exclusions or detected forms. Sensitive profiles stay in trusted session storage, bounded and unusable after expiry. Public profiles are revalidated before use.

## Defensive controls

- Trusted-only local and session storage access is reapplied at installation and browser startup.
- UI rendering uses `textContent`, not `innerHTML`, `eval`, remote scripts or embedded production credentials.
- UI CSP blocks network connections, embedding and form submission; Trusted Types protects HTML/script sinks. The isolated content-script world has its own CSP, so a page's restrictive CSP is not advertised as a universal opt-out.
- Worker reads, decisions and writes are serialized. The content queue is limited to 24 pending requests, with eight additional slots for trusted UI contexts.
- Per document per minute: at most 32 admitted content messages, including caps of 6 BOOT, 1 LEARN, 1 PREDICT, 20 CLICK, 12 PLAN and 1 HOLD. A worker-wide limit of 200 content messages per minute and a 128-document table bound also apply. These memory counters reset when the worker restarts; network reservations persist separately.
- Nested encodings, control/invisible characters, local aliases, private/action routes and unsupported resource types are rejected. URL checks do not certify DNS resolution or future redirects.
- Budget destinations use unsalted SHA-256 fingerprints instead of raw URLs. These are guessable from known URLs and are not encryption. Reservations remain counted after access revocation until their 24-hour expiry.

## Residual risks

An allowed website can change its DOM, links, response size, cache policy or redirects after learning. A nominally public URL may be authenticated. Native requests can send site cookies, and even GET requests can have poorly designed server side effects. Sensitivity detection is heuristic and incomplete; an unknown sensitive site may activate automatically. Do not rely on classification as proof that a site is safe.

Measured mode cannot cap actual transferred bytes. Strict mode initiates no speculative body downloads, but does not control the site's or Chrome's own traffic. Removing a hint or revoking consent cannot recall sent data or clear native caches. Browser IPC/deserialization costs, a compromised browser, other installed extensions and local profile access are outside the protective limits claimed here.

The `.test` TLS fixture key is deliberately public test data. It is never trusted by the production extension and must not be used as a real service credential or installed in a trust store.

## Reporting

Use GitHub private vulnerability reporting **if it is enabled** for this repository. If it is unavailable, request a private contact channel without posting exploit details or personal data. No unconfigured contact address or reporting feature is claimed to exist. Avoid public traces containing passwords, cookies, tokens, browsing histories or personal URLs.
