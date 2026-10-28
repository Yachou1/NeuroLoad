# Changelog

## 0.4.1

- English settings, sensitive-site consent, toolbar messages, categories and project documentation.
- Matching browser-test selectors updated; security rules, budgets and prediction behavior unchanged.
- 95 unit tests and 58 browser checks passed (153 total). Prepared for initial public MIT-licensed GitHub publication.

## 0.4.0

- Optional automatic HTTPS activation after an explicit Chrome grant; manual mode and Strict defaults retained.
- Local government/sensitive-host classification and trusted, exact-origin, tab-scoped 15-minute consent. Badge fallback if Chrome cannot open the popup.
- Rotating random request IDs, real tab URL and permission checks. Consent cannot override private pages, parameters, exclusions, forms or action/payment hosts.
- Sensitive models in trusted session storage: 8 pages / 16 transitions per tab, 32 temporary records. Close/settings/revocation cleanup and expiry before reuse.
- Budget destinations changed to SHA-256 fingerprints; spent reservations retained for 24 hours after revocation. Old raw destinations migrated during ledger cleanup.
- 95 unit tests and 58 browser checks covering permissions, roles, nonces, temporary data and synthetic HTTPS. Detection remains heuristic; automatic Chrome access is technically broad.

## 0.3.0

- Strict message schemas, field/size bounds, extension identity, origin, top frame, active lifecycle and document validation before admission. Bounded queue and rates.
- Minimal BOOT replies; PREDICT returns at most one candidate from current-page links, not history lists.
- Persisted data revalidation; nested encoding, invisible characters, local aliases and sensitive-route hardening.
- Matching passive/hover link filters, including case-insensitive NOFOLLOW.
- Restrictive UI CSP, Trusted Types, trusted storage reapplied at startup and CI actions pinned by SHA.
- 68 unit tests and 48 browser checks passed. No zero-vulnerability claim.

## 0.2.0

- Document after 200 ms, assets after 500 ms of sustained intent; departure cancels the second stage without refund.
- Passive prediction limited to a document. Removed continuous DOM observation, model-change broadcasts and per-message global purges.
- Unknown links no longer consume known-link opportunities. Bounded traversal and listener cleanup.
- Encoded exclusions/resource extensions checked after decoding. Conservative clock handling and budget accounting.
- 35 unit tests, 34 browser checks and a seven-scenario comparison against native Chrome and 0.1.
- Isolated-world CSP behavior verified against Chrome documentation and a real-browser test.

## 0.1.0

Initial prototype: per-site access, local first-viewport profiles, centralized admission, settings, 15 unit tests, 11 browser checks and 27 benchmark sequences.
