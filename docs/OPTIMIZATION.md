# NeuroLoad 0.2 — optimization and extended verification

Historical report for the measured 0.2 build, not a fresh measurement of later releases. Changes targeted accidental-hover waste and page-side checking overhead. Strict stayed download-free; same-origin scope, permissions and first-viewport budgets remained.

## Verified changes

The document is proposed at 200 ms, CSS/image at 500 ms on the same held target. Leaving between thresholds cancels unissued assets without refunding reservations. Passive prediction prepares only a document. This preserves lead time on a correct sustained hover but delays assets for a fast click. A long wrong hover can still waste the full admitted set; it is a measured trade-off, not universal latency improvement.

The whole-document MutationObserver and model-change subscriptions were removed. Sensitive markers are checked at learning, admission and asset emission. A form inserted between phases stops the second and removes current hints; sent requests cannot be recalled. Traversal and listener cleanup stay bounded.

In 0.2 BOOT supplied fresh same-origin/viewport targets, avoiding an unknown-link miss consuming a later known opportunity. **This historical mechanism was replaced in 0.3:** BOOT no longer supplies target lists; bounded PREDICT candidates are now used. The 0.3 worker also reintroduced persisted-model revalidation on every load for security.

Encoded exclusions/media extensions are checked after decoding. A conservative clock ledger avoids reopening caps after a clock rollback. Optional lastAt remains compatible with older data.

## Executed checks

- 35 unit tests, including 2,500 pseudorandom budget admissions, clocks, concurrency, restarts, persistence failure, expired profiles, encodings and exclusions.
- 11 original and 23 extended browser checks: hover/focus timing and departure, child-link movement, unknown/known targets, dynamic forms, refused links, small budgets, existing CSS, viewport mismatch, responsive/offscreen/late images, HTTP errors, redirects and passive prediction.
- Real CSP check: Chrome 156 accepts isolated-world speculation even with page script-src self, as documented by [Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#content-security-policy). No header/nonce changes.

Evidence: [base checks](browser-results-0.2.json), [extended checks](extended-browser-results-0.2.json). npm audit reported no known installed-dependency vulnerabilities at that historical check.

## Comparison

The [summary](matrix-results.md), [full table](matrix-results-full.md) and [raw data](matrix-results.json) cover **140 navigations**, seven scenarios, four groups and five repetitions per group. The short-hover case reduced speculative bodies from 67,295 to 393 bytes (**99.4%**); full sequence traffic fell from 68,123 to 1,221 bytes. Cold-cache median LCP was 68 ms for both 0.1 and 0.2 versus 420 ms for native Chrome. **No net CPU gain was demonstrated.** See all groups and p75 values, including regressions, in the full table.

Scenarios: cold cache, no-store document, warm cache, 300 ms glance then another click, correct click after 300 ms, dynamic 15,000-node source, wrong click after one second. No secondary media was speculated in any sequence and Strict emitted no prefetch in its 35 sequences. Each row used a fresh profile with identical training and preparation; order rotated/reversed. Timed sessions were not run in parallel, and checkpoints retained finished rows.

```powershell
$env:NEUROLOAD_BASELINE = 'C:/path/to/extension-0.1'
$env:NEUROLOAD_RUNS = '5'
npm run bench:matrix
```

Without NEUROLOAD_BASELINE, the matrix compares native, Strict and the current Measured build. The historical baseline was the original delivered 0.1 archive, not a simulated rewrite. Manifest/content/worker/core SHA-256 fingerprints are in the raw results. Harness grant configuration was shared; production manifests were tested separately.

## Limits and rollback

Small descriptive local-fixture samples with artificial response delay, no significance test and no public-web promise. CPU is renderer main-thread work including preparation, not worker/browser-wide CPU or energy. Bytes are gzip bodies, excluding headers/TLS. Native preloading stayed at fresh-profile defaults. Native stable-Chrome permission paths remain manual checks.

Scope stayed at the first viewport: no extra permission, secondary resource, crawl, authentication or backend. To return to 0.1, restore its directory and reload the extension/tabs; older protections then apply. Sent requests and native cache cannot be recalled. Historical CI configuration was provided; remote CI execution is separate from these local results.
