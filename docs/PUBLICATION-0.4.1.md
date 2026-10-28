# English publication — 0.4.1

Prepared on 28 October 2026 for [Yachou1/NeuroLoad](https://github.com/Yachou1/NeuroLoad), a public MIT-licensed repository.

## Scope and impact

The settings page, consent popup, toolbar messages, category labels, manifest presentation, project documentation, changelog and benchmark report labels are in English. Tests were updated to match visible English UI strings. Foreign-language URL cases and historical fixture content remain where they test security handling or preserve comparison payloads.

No permission, admission budget, classifier rule, storage schema, sensitive-site consent duration, URL hard guard or resource-selection behavior changed in this language update. Generated extension files and package/manifest versions were updated together. The prior 0.4 build and its evidence remain historical.

## Verification

- `npm run check`: **95 unit tests and 58 browser checks passed (153 total)** on isolated Chromium 156.0.8078.4 under Windows.
- Browser groups: [11 base](browser-results-0.4.1.json), [23 extended](extended-browser-results-0.4.1.json), [14 security](security-browser-results-0.4.1.json), [10 automatic/consent](automatic-browser-results-0.4.1.json).
- The English sensitive-consent screenshot was visually inspected: [consent](sensitive-prompt-0.4.1.png), [settings](options-0.4.1.png).
- `npm audit --audit-level=high`: no known installed-dependency findings at the recorded check. This is not an exhaustive source audit or a zero-vulnerability claim.
- [Six-navigation smoke benchmark](benchmark-smoke-0.4.1.md), [raw data](benchmark-smoke-0.4.1.json): native, Strict and Measured, two repetitions each. Functional/descriptive only; no new statistical or public-web speed claim.
- [Machine-readable verification](verification-0.4.1.json) records the counts, audit and build checks. Packaging checks verify ZIP integrity, runtime files and absence of required production host permissions.

The GitHub workflow runs the build, full tests, generated-file consistency, dependency audit and packaging on a fresh Linux runner. Its configuration is included; a local pass is not a claim that remote CI has passed. Native Chrome permission dialogs and the oldest declared Chrome versions still need manual qualification.

## Distribution and limitations

Clone/download the repository and load `extension/` unpacked using the [installation instructions](../README.md). Required permissions remain `storage` and `scripting`; host permissions are optional. The checked-in TLS key is public synthetic test data, not a production credential.

Automatic sensitivity detection is incomplete, the optional global HTTPS grant is technically broad, Measured mode caps estimates rather than actual wire bytes, and Strict is download-free with no expected speed gain. [Privacy](PRIVACY.md), [security](../SECURITY.md), [API limits](API-LIMITS.md).
