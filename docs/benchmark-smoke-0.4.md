# NeuroLoad local benchmark

2026-10-28T08:48:10.503Z · Chromium 156.0.8078.4 · win32 10.0.26200 · 11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz

| Scenario | Mode | n | Median FCP ms | Median LCP ms | LCP p75 ms | Median body bytes | Median requests | Median main-thread CPU ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| /article | native | 2 | 396.0 | 412.0 | 412.0 | 67709 | 4 | 15.9 |
| /article | strict | 2 | 396.0 | 404.0 | 412.0 | 67709 | 4 | 20.1 |
| /article | measured | 2 | 64.0 | 64.0 | 64.0 | 67709 | 4 | 20.7 |

Bytes include BOTH preparation and navigation. Speculative work is included in the accounting. Strict is the control without speculative downloads.

- Local synthetic fixture; no public-web performance claim.
- Browser default preload settings; separate fresh profiles; cache cleared after training.
- CPU proxy is renderer main-thread TaskDuration; extension worker/browser-wide CPU not included.
- Server payload bytes exclude headers/TLS; CDP bytes may omit speculation work. Both raw series included.
- Not a universal hard transferred-byte ceiling. Strict mode initiates zero speculative body downloads.
- No-store tests document memory prefetch reuse separately from HTTP subresource caching.

Raw data: benchmark-smoke-0.4.json. Descriptive small sample; no public-web speed guarantee.
