# NeuroLoad 0.2 — comparative results

2026-10-27T22:49:10.127Z · Chrome for Testing 156.0.8078.4 · win32 10.0.26200 · 11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz

**140 navigations**, seven scenarios, four groups, five repetitions per group. Median values; descriptive local-fixture results.

| Case | LCP Chrome ms | LCP 0.1 ms | LCP 0.2 ms | CPU 0.1 ms | CPU 0.2 ms | Network 0.1 bytes | Network 0.2 bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Brief hover, different click | 172.0 | 192.0 | 172.0 | 17.1 | 18.1 | 68123 | 1221 |
| Cold cache | 420.0 | 68.0 | 68.0 | 20.7 | 20.4 | 67709 | 67709 |
| Document no-store | 420.0 | 68.0 | 68.0 | 20.2 | 21.8 | 67709 | 67709 |
| Warm cache | 68.0 | 68.0 | 68.0 | 21.8 | 21.5 | 0 | 0 |
| Correct click at 300 ms | 420.0 | 312.0 | 296.0 | 21.6 | 21.9 | 67709 | 67709 |
| Dynamic 15,000-node source | 424.0 | 68.0 | 64.0 | 20.0 | 20.4 | 68115 | 68115 |
| Wrong click after 1 s | 176.0 | 188.0 | 208.0 | 17.4 | 17.3 | 68123 | 68123 |

- Brief hover: speculative bodies fell from 67,295 to 393 bytes (99.4% less); total sequence traffic from 68,123 to 1,221 bytes. Reservations stayed fully charged.
- Dynamic-page CPU: 20.0 to 20.4 ms. No net CPU saving demonstrated; worker/browser-wide CPU is excluded.
- Fast clicks expose an asset-delay trade-off; the table describes these fixtures, not other sites.
- A long wrong hover can still waste the full prefetch set.
- No speculative secondary media in all 140 sequences; no prefetch in all 35 Strict sequences.

Gzip body totals include preparation/navigation but exclude headers/TLS. Main-thread threadTicks includes preparation. Artificial delays: 110 ms per document, twice that per critical resource. Warm retains trained HTTP cache; other cases clear it. Fresh profiles, rotated/reversed order, no parallel timed sessions. The baseline is the original built 0.1 archive; [raw series and fingerprints](matrix-results.json).

Small samples, no significance test or public-web guarantee. [Method and limits](OPTIMIZATION.md). [Full FCP/LCP/p75/four-group table](matrix-results-full.md).
