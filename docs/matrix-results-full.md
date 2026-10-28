# NeuroLoad 0.1 / optimized comparison

2026-10-27T22:49:10.127Z · Chrome for Testing 156.0.8078.4 · win32 10.0.26200

| Case | Group | n | Median FCP ms | Median LCP ms | LCP p75 | Median CPU ms | Median body bytes | Median speculative bytes |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| glance | native | 5 | 172.0 | 172.0 | 172.0 | 13.2 | 828 | 0 |
| glance | baseline | 5 | 192.0 | 192.0 | 192.0 | 17.1 | 68123 | 67295 |
| glance | strict | 5 | 172.0 | 172.0 | 176.0 | 17.7 | 828 | 0 |
| glance | optimized | 5 | 172.0 | 172.0 | 172.0 | 18.1 | 1221 | 393 |
| cold | native | 5 | 404.0 | 420.0 | 424.0 | 14.5 | 67709 | 0 |
| cold | baseline | 5 | 68.0 | 68.0 | 68.0 | 20.7 | 67709 | 67295 |
| cold | strict | 5 | 404.0 | 408.0 | 420.0 | 19.9 | 67709 | 0 |
| cold | optimized | 5 | 68.0 | 68.0 | 68.0 | 20.4 | 67709 | 67295 |
| no-store | native | 5 | 404.0 | 420.0 | 428.0 | 16.6 | 67709 | 0 |
| no-store | baseline | 5 | 68.0 | 68.0 | 68.0 | 20.2 | 67709 | 67295 |
| no-store | strict | 5 | 400.0 | 400.0 | 420.0 | 19.7 | 67709 | 0 |
| no-store | optimized | 5 | 68.0 | 68.0 | 76.0 | 21.8 | 67709 | 67295 |
| warm | native | 5 | 68.0 | 68.0 | 68.0 | 14.9 | 0 | 0 |
| warm | baseline | 5 | 68.0 | 68.0 | 68.0 | 21.8 | 0 | 0 |
| warm | strict | 5 | 64.0 | 64.0 | 68.0 | 21.6 | 0 | 0 |
| warm | optimized | 5 | 68.0 | 68.0 | 68.0 | 21.5 | 0 | 0 |
| short | native | 5 | 400.0 | 420.0 | 420.0 | 15.2 | 67709 | 0 |
| short | baseline | 5 | 284.0 | 312.0 | 316.0 | 21.6 | 67709 | 393 |
| short | strict | 5 | 404.0 | 420.0 | 424.0 | 19.4 | 67709 | 0 |
| short | optimized | 5 | 280.0 | 296.0 | 296.0 | 21.9 | 67709 | 393 |
| heavy | native | 5 | 404.0 | 424.0 | 440.0 | 15.2 | 68115 | 0 |
| heavy | baseline | 5 | 64.0 | 68.0 | 68.0 | 20.0 | 68115 | 67295 |
| heavy | strict | 5 | 400.0 | 416.0 | 420.0 | 19.6 | 68115 | 0 |
| heavy | optimized | 5 | 64.0 | 64.0 | 68.0 | 20.4 | 68115 | 67295 |
| miss | native | 5 | 176.0 | 176.0 | 176.0 | 13.3 | 828 | 0 |
| miss | baseline | 5 | 188.0 | 188.0 | 192.0 | 17.4 | 68123 | 67295 |
| miss | strict | 5 | 172.0 | 172.0 | 172.0 | 17.6 | 828 | 0 |
| miss | optimized | 5 | 208.0 | 208.0 | 208.0 | 17.3 | 68123 | 67295 |

- Synthetic local fixture, small descriptive sample; no public-web speed claim.
- CPU covers the renderer main thread including preparation, not all Chrome or the extension worker.
- Network counts complete gzip bodies received by the server, excluding headers/TLS.
- Glance: 300ms hover, then departure; short: navigate after 300ms. Staging trades short-lead latency for lower wasted bytes.
- Warm: native HTTP cache retained after identical training.
- Native preloading settings remain at fresh-profile defaults.
- New profiles per sequence; counterbalanced group order. Native host-grant prompts are not automated.
