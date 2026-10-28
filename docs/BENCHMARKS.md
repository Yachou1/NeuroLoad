# Benchmark method

This document describes the original protocol. The historical seven-scenario 0.1/0.2 comparison is in [OPTIMIZATION.md](OPTIMIZATION.md). Running `npm run bench` uses the current extension and replaces only temporary `bench/results/latest.*`, not archived historical evidence.

Three synthetic scenarios: `/article` (HTTP-cacheable), `/no-store` (document not HTTP-cacheable; CSS/image remain cacheable), and `/miss` (hover a learned article but open a different unknown page). The last scenario measures incorrect-prediction waste, not public-web usage frequency.

## Comparable groups

1. **native:** same Chromium without an extension, fresh-profile native defaults.
2. **strict:** extension learning/checks, no speculative body downloads.
3. **measured:** same extension, speculation on learned profiles.

Each row uses a fresh isolated profile, the same 1200×800 viewport, identical target-then-source training, and HTTP cache clearing through CDP without deleting learned models. Group order alternates. The source gets 2.7 seconds for observation, then hover leads the click by one second. This is a favorable, controlled lead-time scenario, not a measure of real prediction accuracy.

The harness copies the built extension under `.work/test-extensions/` and grants only the local fixture in that test manifest. The automatic-mode HTTPS test separately pregrants its broad pattern on synthetic `.test` hosts. Native optional-permission dialogs require human verification; the delivered manifest retains no required site access. Tests cover scope, isolated registration, UI and data clearing, not automated acceptance of Chrome's native permission dialog.

The server delays each document response by 110 ms and each critical resource by 220 ms. This is a response-delay fixture, not complete throughput/RTT/loss/TLS/mobile emulation. Bodies are gzip; no artificial CPU throttle is used. Secondary media include a lazy image at 2000 px and a video with `preload=none`; neither may be speculatively requested.

## Metrics

- **FCP:** Paint Timing for the real target navigation.
- **LCP:** last candidate observed at `load + 700 ms` using an observer installed before navigation. This fixed point is shared across groups, not final LCP for a long browsing session.
- **Network:** server request count and actual gzip body bytes sent from source start through target completion, including preparation. Speculative and post-click traffic are separated. Headers/TLS are excluded.
- **CDP:** raw encodedDataLength, cache/prefetch indications and navigation details. CDP may omit speculative work; server totals provide an independent accounting check.
- **CPU:** renderer main-thread Performance.TaskDuration delta using threadTicks, from source through target. Includes content-script/preparation work. Excludes extension-worker and browser-wide CPU, energy, kernel profiles and memory. A reset counter produces null, not an artificial negative saving.

Raw data are in `bench/results/latest.json`, medians/p75 in `latest.md`. Historical results are under `docs/`. Samples are descriptive: no significance test or extrapolation to other sites.

## Reproduce

```powershell
$env:NEUROLOAD_RUNS = '10'
$env:NEUROLOAD_DELAY = '110'
$env:NEUROLOAD_SCENARIOS = '/article,/no-store,/miss'
npm run bench
```

Real deployment qualification needs more incorrect clicks, no-navigation cases, warm caches, changed sizes, responsive images, restrictive CSP, cookies, redirects and slow devices. Check stable Chrome, actual host grants and preload settings manually. Never present unmeasured values as results.
