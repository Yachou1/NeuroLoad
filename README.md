# NeuroLoad — First viewport

An open-source Chrome Manifest V3 prototype that learns the initial resources of public pages you have visited, then asks Chrome to prepare a small set when you are likely to navigate there. Learning stays on your device. MIT licensed.

**Version 0.4.1:** English settings, consent prompts and documentation. Automatic HTTPS activation is optional. Recognized sensitive sites, including government services, require consent for the exact site and tab, lasting 15 minutes. Private pages remain blocked. Detection is imperfect and automatic mode requires a technically broad Chrome permission. See [automatic mode and consent](docs/AUTOMATIC-0.4.md).

## What it does

- Learns a public page during a real visit, without crawling the site.
- On a sustained hover or focus, proposes one document, up to two initial stylesheets and one observed first-viewport LCP image.
- Uses native Speculation Rules and HTTP caching. Normal navigation still loads the authentic page.
- Keeps budgets shared across tabs, local retention limits, exclusions and sensitive-page safeguards.
- Uses no server, remote model, telemetry, hidden rendering or background site crawler.

**Essential limit:** Chrome does not expose an exact transferred-byte ceiling for native prefetching. NeuroLoad therefore defaults to **Strict**, which initiates no speculative body downloads and is not expected to improve loading speed. **Measured** mode limits admitted hints and estimated bytes; it cannot guarantee a ceiling on bytes actually transferred. If an absolute nonzero network cap is mandatory, this prototype does not meet that requirement without server cooperation. [API constraints](docs/API-LIMITS.md).

## Install in Chrome

The built `extension/` directory works without installing development dependencies.

1. Download this repository with **Code → Download ZIP**, then extract it, or clone it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the project's `extension/` directory.
4. Click the NeuroLoad icon, then **Settings and automatic mode**.
5. Choose **Enable automatic mode** and accept Chrome's optional HTTPS access request, or add individual trusted public sites manually. Reload existing tabs. Installation itself grants no site access.
6. Recognized sensitive sites request temporary consent in the extension popup. If Chrome cannot open it automatically, click the icon showing `?`. You can decline. This consent cannot override private pages, payment routes, forms, exclusions or query parameters.
7. To test actual prefetching, select **Measured**, save, and reload. Visit a target page once without scrolling during the first seconds. Return to a same-origin page linking to it. After 200 ms of hover the document is proposed; after 500 ms of continuous intent the known CSS/image may follow. The learned viewport must match.

Chrome may ignore hints because of its preload settings, power saving, cache rules or resource conditions. Unknown first visits cannot benefit from a learned profile. The extension does not change headers, CSP or navigation responses.

## Resource scope

| Resource | Policy |
|---|---|
| Document | One same-origin Speculation Rules `prefetch`; Chrome downloads the **complete document**, without rendering the target |
| CSS | Up to two active head stylesheets discovered before FCP and observed during the initial window |
| Image | One observed LCP image entirely inside the first viewport; no lazy loading, responsive `srcset`, `<picture>` or CORS image mode |
| Video, audio, JavaScript, fonts, offscreen images | Never proposed by NeuroLoad |
| Cross-origin resources or URL parameters | Excluded |
| Unknown pages, SPA transitions, unknown sizes, different viewport | No speculation |

CSS selection is an approximation: an initial stylesheet can contain rules for the rest of the page. CSS backgrounds and responsive images are intentionally skipped. NeuroLoad cannot serve an arbitrary partial HTML fragment as an authentic browser navigation.

Passive predictions prepare only the document. A brief hover between 200 and 500 ms also prepares only the document. Leaving cancels unissued assets without refunding budget reservations. A long incorrect hover can still waste the entire admitted set.

## Budgets and privacy

Defaults: one speculation per source document; at most 4 hints and 256 KiB estimated per page, 20 hints / 2 MiB per rolling hour, and 60 hints / 8 MiB per rolling 24 hours. Reservations use observed compressed body size × 2 + 4 KiB per resource. No refunds when Chrome ignores a hint. A destination has a one-minute cooldown. Counts represent hints, not every internal browser request or server redirect.

Save-Data, offline or 2G/3G connections, hidden documents, forms, private routes and missing permissions block speculation. Connection information is a coarse browser estimate, not a Wi-Fi speed test. Incognito is disallowed.

Automatic sensitivity detection can miss sites. **Use manual mode when you need Chrome access restricted to chosen domains.** Exclude private accounts and internal tools. Temporary consent is suitable only for trusted public pages.

Public models stay in `chrome.storage.local`: at most 200 pages and 600 transitions, with logical expiry of 1–7 days. Recognized sensitive-site models stay in trusted `chrome.storage.session`, scoped to a tab and consent duration. The 24-hour budget ledger stores SHA-256 destination fingerprints rather than raw URLs; unsalted fingerprints are not encryption. No HTML, form content, password or cookie is stored. Native requests may still send site cookies. [Privacy policy](docs/PRIVACY.md).

## Develop and verify

Node.js 22+ and npm:

```sh
npm ci
npm run build
npm test
npm run browser:install
npm run test:browser
npm run bench
npm run package
```

`npm run check` builds and runs the full test suite. The last engine verification passed 95 unit tests and 58 browser checks (153 total). [Current publication verification](docs/PUBLICATION-0.4.1.md) records the English-build check separately. Historical results are labeled by version; they are not fresh public-web measurements.

Playwright installs its test browser under `.work/browsers/` and uses isolated profiles. On a dedicated Linux CI host, `npm run browser:install -- --with-deps` installs Chromium system dependencies. Native site-permission dialogs and stable Chrome still need separate human verification.

Start the local demo with `node bench/fixture.mjs`; enable localhost only for that demo. [Benchmark method](docs/BENCHMARKS.md), [architecture](docs/ARCHITECTURE.md), [security](SECURITY.md), [contributing](CONTRIBUTING.md).

The historical 0.2 comparison covered 140 synthetic navigations and seven scenarios. It reduced speculative payloads on a short accidental hover by 99.4%, without demonstrating a net CPU benefit. Those results are descriptive, not a promise for real websites. [Optimization report](docs/OPTIMIZATION.md).

## Open-source publication

Repository: [Yachou1/NeuroLoad](https://github.com/Yachou1/NeuroLoad). The name is provisional. `npm run package` produces versioned extension and source ZIPs under `dist/`, which is excluded from Git. The repository includes built extension files, source, tests, benchmark fixtures, lockfile, MIT license and CI configuration.

For an update, replace the extension directory in its existing location, reload the extension and affected tabs. Compatible settings remain; profiles rejected by newer guards must be learned again. Removing hints cannot recall completed requests or clear Chrome's native caches. This repository is not a Chrome Web Store listing, a security certification or a zero-vulnerability guarantee.
