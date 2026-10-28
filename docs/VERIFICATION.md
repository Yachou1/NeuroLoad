# Historical prototype 0.1 verification

This preserves first-release evidence. See [publication verification](PUBLICATION-0.4.1.md) for the current English build and [0.2 optimization](OPTIMIZATION.md) for the extended historical comparison.

Local checks: 27 October 2026, Windows, Node 24.22.1, Playwright 1.64.1, Chrome for Testing / Chromium 156.0.8078.4. Declared Chrome 122 minimum was not covered by a version matrix.

- Build generated a standalone loadable extension.
- **15 unit tests passed:** URL/origin guards, model freshness/bounds, viewport/decay, hourly/day caps, identity, cross-tab concurrency, reconstructed costs, clearing and disable.
- **11 browser checks passed:** isolated registration, actual initial CSS/image learning and prefetches, no speculative video/offscreen image, one plan per document, CSS reuse, UI/Strict switching, refused links, forms, existing rules, offline behavior, origin removal, production installation without site access. No pageerror on the tested page.
- npm audit reported no known installed-dependency vulnerabilities at that historical check.

[Browser evidence](browser-results.json) and [production options screenshot](options.png) are archived; the screenshot predates the English interface.

The [benchmark report](benchmark-results.md) and [raw results](benchmark-results.json) cover three scenarios, three modes, three repetitions: **27 sequences**, in two batches using identical extension code (18 correct-prediction navigations, then 9 wrong-click trials). Actual-navigation FCP/LCP, gzip server body counts and renderer main-thread threadTicks CPU include preparation. Worker/browser-wide CPU is excluded; [method and limits](BENCHMARKS.md).

The test manifest pregranted only the local fixture; production installation without any grant was checked separately. Native stable-Chrome optional-permission dialogs remained manual. CI was configured but no remote run or publication had occurred during this historical check.

Scope remained initial rendering: complete native-prefetched document plus a learned CSS/image subset, no preview/hidden rendering/video/crawl/backend. Only permissions, model, options, messages and DOM hints were added, with no external consumer migration.

Native APIs cannot satisfy an absolute nonzero transferred-byte ceiling. Strict initiates no speculative bodies and promises no speed gain; Measured applies estimated admission caps only. Disabling/removing and reloading stops future work, not already sent traffic or native cache.
