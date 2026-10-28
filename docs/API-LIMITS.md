# Verified APIs and design decisions

Primary sources were consulted before implementation on 27 October 2026, with permission/popup APIs checked again for 0.4 on 28 October. The implementation choices below are interpretations for this prototype; reuse and performance remain site-dependent.

| Mechanism | Actual use | Limits |
|---|---|---|
| Speculation Rules `prefetch` | One centrally admitted same-origin document | Chrome fetches the complete document for a possible navigation. This is not partial HTML, target rendering or subresource crawling. |
| `link rel=prefetch` | Known same-origin CSS/image resources | Native HTTP caching. Reuse depends on freshness, cache keys, `Vary`, request mode and server behavior. No guaranteed hit. |
| `link rel=preload` | Not injected | Targets the current document. Raising priority for a future page's resources is not assumed to help. |
| `preconnect` | Not injected | The predicted target is same-origin with a source already connected. Third-party warming is out of scope. |
| Resource / Navigation Timing | Previously observed compressed sizes and timings | `encodedBodySize` is encoded body size, not all wire bytes. Missing/protected sizes are not invented. |
| `chrome.scripting` | Dynamic isolated-world registration on granted origins | No mandatory all-site access, main-world script or page message bridge. Automatic HTTPS access is separately opt-in. |
| Local/session storage | Bounded public model, reservations and temporary sensitive consent | Trusted contexts only. Scripts receive minimal startup fields and validated plans. |
| Optional host permissions | Manual origin grants or explicit global HTTPS grant | `permissions.request` requires a user gesture. Application sensitivity rules do not reduce Chrome's technical grant. |
| `chrome.action.openPopup` | Attempts one consent popup for an active sensitive tab | Generally available since Chrome 127; 118–126 limited to policy-installed extensions. A `?` badge remains the fallback for the declared Chrome 122 minimum. |

## Guarantees unavailable to this MV3 prototype

Native hint APIs expose neither a per-prefetch byte ceiling nor reliable stream access/cancellation. Past size does not limit future size. Removing a hint does not prove cancellation of sent bytes. Worker `fetch()` or a `Range` response cannot turn an arbitrary HTML fragment into an authentic navigation response. Cache partitioning also prevents treating the extension-origin cache as interchangeable with a page's cache.

**Strict** guarantees only that NeuroLoad initiates no speculative body downloads. It does not cap normal page traffic or Chrome/site speculation. **Measured** limits admissions and estimated sizes, not transferred bytes. An absolute nonzero network budget requires a different cooperative design, not a claim that the native APIs provide this control.

There is no prerender, experimental `prerender_until_script`, hidden iframe, navigation interception, proxy or fake preview. A separate preview was omitted because it would not accelerate authentic navigation and would expand the scope.

## Browser and site behavior

Existing page speculation rules cause NeuroLoad to abstain. Its rules contain only validated JSON URLs. No CSP, header or nonce is changed, and refusal is not retried. Without Speculation Rules support, document speculation is skipped; there is no legacy HTML-prefetch fallback. Already admitted CSS/image hints may still be proposed.

The isolated world has its own CSP with `inline-speculation-rules`. Real Chrome 156 tests confirm a document prefetch can occur despite the page's `script-src 'self'`. Page CSP is not advertised as a universal NeuroLoad disable switch. Permissions, exclusions and opt-out markers are the prototype's controls. Worker decisions use Chrome-provided sender identity and actual grants, and reconstruct plans/costs rather than trusting caller-provided downloads.

## Primary references

- [Chrome: Speculation Rules and conditions](https://developer.chrome.com/docs/web-platform/prerender-pages), [dynamic rules and eagerness](https://developer.chrome.com/blog/speculation-rules-improvements).
- [web.dev: prefetch](https://web.dev/articles/link-prefetch), [preload and request modes](https://web.dev/articles/preload-critical-assets).
- [Chrome: HTTP cache partitioning](https://developer.chrome.com/blog/http-cache-partitioning).
- [Chrome: isolated scripts and CSP](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#content-security-policy).
- [Chrome: permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions), [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), [popup API](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup), [storage](https://developer.chrome.com/docs/extensions/reference/api/storage).
- [W3C: Resource Timing](https://www.w3.org/TR/resource-timing/).
- [Playwright: persistent Chromium extension testing](https://playwright.dev/docs/chrome-extensions).
- [Chrome DevTools Protocol: Performance metrics](https://chromedevtools.github.io/devtools-protocol/tot/Performance/).
