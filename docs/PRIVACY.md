# Privacy policy

NeuroLoad has no backend and sends no telemetry. It does not use browsing history, cookies APIs, webRequest, debugger, synchronization, advertising or remote AI services. External benchmark scripts use debugging APIs only in isolated test profiles.

## Local data

Permanent local storage contains settings, automatic-mode choice, manual origins, exclusions, public URL/resource profiles, rounded viewport sizes, compressed body sizes, observation dates and transition counts. Public URLs have no credentials, parameters or fragments, but can still reveal interests. Public models are stored in plaintext, bounded to 200 pages and 600 transitions, with logical retention of 1–7 days.

The budget ledger keeps reservation times, resource counts, estimated bytes, source-document identifiers and SHA-256 destination fingerprints for 24 hours. Raw destination URLs are not stored in that ledger. Unsalted hashes can be guessed for known URLs: they are not encryption.

Recognized sensitive sites are paused before DOM analysis, learning or speculative requests. Their origin, category, tab ID, request identifier and decision remain in trusted `chrome.storage.session`. An approval lasts 15 minutes for one exact origin in one tab; the temporary model holds at most 8 pages and 16 transitions. There are at most 32 temporary records. Unanswered requests expire after 15 minutes; refusals after one hour.

Expiry is checked before reuse. Expired entries are physically removed on a subsequent write rather than by a permanent timer. Closing a tab, clearing learning data, changing settings or removing access clears relevant sensitive records. Browser startup resets temporary consent. Budget reservations remain counted for 24 hours after revocation to prevent cap bypass; explicit clearing removes the ledger too.

No page HTML, page text, form values, passwords, cookies or downloaded resource copies are stored by NeuroLoad. Responses stay in caches managed by Chrome. There is no scheduled deletion process while Chrome is closed. Chrome controls storage removal when the extension is uninstalled.

## Network and access

Strict mode adds no speculative content downloads. Measured mode inserts native hints on allowed pages. Sites may receive your IP address, ordinary cookies/headers and a prefetch indication. A public page can later become private or redirect. NeuroLoad cannot prove that you are logged out, that a GET has no side effects, or that a response will retain its learned size and cache policy.

No site is observed before Chrome grants host access. Manual mode grants selected origins. Automatic mode is off by default and requests optional global HTTPS access; after that grant, unrecognized sites may be analyzed without another per-site decision. Application filters do not narrow this Chrome permission. Detection may miss sensitive services; manual mode provides a browser-enforced restriction to chosen origins.

## Controls

You can stop automatic mode and remove broad access, remove individual manual grants, add exclusions, choose Strict, disable NeuroLoad, revoke temporary consent from the tab's icon, or clear learning and reservations. Reload tabs after changes for a fresh start. Already sent requests and Chrome caches cannot be recalled by these controls. Incognito, Chrome internal pages, local files, third-party resources and forms are unsupported.
