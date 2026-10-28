# Contributing

Use Node.js 22+, `npm ci`, `npm run browser:install`, then `npm run check`. Files in `extension/` are committed build outputs: regenerate them after changing `src/`. There are no third-party runtime dependencies; development dependencies are pinned in the lockfile.

Keep the scope limited to initial, above-the-fold rendering. Do not add prerendering, crawlers, secondary media downloads, remote browsing models or unsupported claims about exact transferred-byte caps. Any change to permissions, resource types, sender identity, exclusions, consent or budgets needs an impact explanation and behavioral verification.

Tests must use isolated profiles and local synthetic fixtures. Never test against real sensitive services or a personal browser profile. Include preparation in network and CPU accounting, and publish raw results with regressions and limitations. Do not present unmeasured values as results.

Use English for new documentation, interface copy, issues, commit messages and pull request descriptions. Security-test fixtures may retain foreign-language routes or Unicode strings when those are necessary to test URL handling.

Before publishing a release: run `npm run check`, `npm audit`, `npm run bench` and `npm run package`, then inspect the archives and production manifest. Site access must remain optional. The checked-in TLS key is explicitly public test data for reserved `.test` hosts, not a production secret.

For Chrome Web Store distribution, separately review current listing requirements, screenshots, hosted privacy policy and project naming. The build scripts do not publish externally. Report vulnerabilities privately using the repository's private reporting channel if enabled; do not include browsing history, credentials or personal URLs in public issues.
