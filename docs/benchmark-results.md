# NeuroLoad local benchmark

2026-10-27T20:15:47.477Z · Chrome for Testing / Chromium 156.0.8078.4 · win32 10.0.26200 · 11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz

| Scenario | Mode | n | Median FCP ms | Median LCP ms | LCP p75 ms | Median body bytes | Median requests | Median main-thread CPU ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| /article | native | 3 | 388.0 | 388.0 | 404.0 | 67709 | 4 | 15.7 |
| /article | strict | 3 | 404.0 | 420.0 | 420.0 | 67709 | 4 | 21.4 |
| /article | measured | 3 | 68.0 | 68.0 | 68.0 | 67709 | 4 | 20.9 |
| /no-store | native | 3 | 400.0 | 404.0 | 416.0 | 67709 | 4 | 15.1 |
| /no-store | strict | 3 | 388.0 | 404.0 | 404.0 | 67709 | 4 | 21.1 |
| /no-store | measured | 3 | 68.0 | 68.0 | 68.0 | 67709 | 4 | 21.3 |
| /miss | native | 3 | 256.0 | 256.0 | 280.0 | 828 | 2 | 30.3 |
| /miss | strict | 3 | 236.0 | 236.0 | 260.0 | 828 | 2 | 38.0 |
| /miss | measured | 3 | 208.0 | 208.0 | 280.0 | 68123 | 5 | 44.7 |

27 sequences in two successive batches using identical extension code: 18 correct predictions followed by 9 wrong-click trials. Three repetitions per group; descriptive results without significance testing.

Network totals include preparation and navigation. A wrong click can waste prefetch traffic without improving latency. Strict emitted no speculative bodies, and no secondary media was speculated. Body counts exclude headers/TLS. CPU is renderer main-thread threadTicks only, excluding worker/browser-wide CPU. Artificial response delay and one-second lead time do not demonstrate public-web speed.

[Method](BENCHMARKS.md). [Raw data](benchmark-results.json).
