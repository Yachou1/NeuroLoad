import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createFixture } from './fixture.mjs';
import { launch, configure, waitProfile } from './browser.mjs';

const iterations = Number(process.env.NEUROLOAD_RUNS || 5);
if (!Number.isInteger(iterations) || iterations < 2 || iterations > 30) throw new Error('NEUROLOAD_RUNS: 2..30');
const fixture = await createFixture({ delay: Number(process.env.NEUROLOAD_DELAY || 110) });
const rows = [];
const scenarios = process.env.NEUROLOAD_SCENARIOS?.split(',') || ['/article', '/no-store', '/miss'];
if (scenarios.some(s => !['/article', '/no-store', '/miss'].includes(s))) throw new Error('Unknown scenario');
const median = values => { const sorted = [...values].sort((a,b) => a-b); const mid = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2; };
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*p)-1)];
let version;
try {
  for (const scenario of scenarios) for (let trial = 0; trial < iterations; trial++) {
    // Counterbalanced order; each row uses a fresh isolated Chrome profile.
    const modes = trial % 2 ? ['measured', 'strict', 'native'] : ['native', 'strict', 'measured'];
    for (const mode of modes) {
      let context;
      try {
        context = await launch({ extension: mode !== 'native', fixtureOrigin: fixture.origin });
        version = context.browser()?.version() || version;
        const page = await context.newPage();
        let worker;
        if (mode !== 'native') ({ worker } = await configure(context, fixture.origin, { mode }));
        // Same genuine training navigations in every mode; clear HTTP cache afterward.
        const trainingPath = scenario === '/miss' ? '/article' : scenario;
        await page.goto(fixture.origin + trainingPath);
        if (worker) await waitProfile(worker, fixture.origin + trainingPath);
        else await page.waitForTimeout(500);
        await page.goto(fixture.origin + '/');
        if (worker) await waitProfile(worker, fixture.origin + '/');
        else await page.waitForTimeout(500);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.clearBrowserCache');
        await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });
        const perf = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const cpuBefore = await perf();
        const requestStart = fixture.log.length;
        const cdpRecords = new Map();
        cdp.on('Network.requestWillBeSent', e => { if (e.request.url.startsWith(fixture.origin)) cdpRecords.set(e.requestId, { url: e.request.url, type: e.type, bytes: 0, cached: false }); });
        cdp.on('Network.requestServedFromCache', e => { const r=cdpRecords.get(e.requestId); if(r) r.cached=true; });
        cdp.on('Network.responseReceived', e => { const r=cdpRecords.get(e.requestId); if(r) { r.cached ||= Boolean(e.response.fromDiskCache || e.response.fromPrefetchCache); r.fromPrefetchCache = Boolean(e.response.fromPrefetchCache); } });
        cdp.on('Network.loadingFinished', e => { const r=cdpRecords.get(e.requestId); if(r) r.bytes=e.encodedDataLength; });
        await page.addInitScript(() => {
          window.__neuroBench = { lcp: null };
          new PerformanceObserver(list => { window.__neuroBench.lcp = list.getEntries().at(-1)?.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        });
        await page.goto(fixture.origin + '/');
        // Allow the 2.5 s initial sampling window to close identically for all modes.
        await page.waitForTimeout(2700);
        const link = page.locator(scenario === '/no-store' ? '#no-store' : '#target');
        await link.hover();
        await page.waitForTimeout(1000); // Equal prediction lead time in every group.
        const beforeNavigation = fixture.log.length;
        const cpuAtClick = await perf();
        await (scenario === '/miss' ? page.locator('#unknown') : link).click();
        await page.waitForLoadState('load');
        await page.waitForTimeout(700); // Same LCP observation endpoint for every group.
        const metrics = await page.evaluate(() => ({
          fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
          lcp: window.__neuroBench.lcp,
          navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
          resources: performance.getEntriesByType('resource').map(e => ({ name:e.name, bytes:e.transferSize, encodedBodySize:e.encodedBodySize }))
        }));
        if (!metrics.fcp || !metrics.lcp) throw new Error(`Missing paint metrics (${mode})`);
        const cpuAfter = await perf();
        const requests = fixture.log.slice(requestStart).filter(r => r.path !== '/favicon.ico');
        const anticipation = fixture.log.slice(requestStart, beforeNavigation).filter(r => r.purpose.includes('prefetch'));
        const taskDelta = (a,b) => (b.TaskDuration >= a.TaskDuration ? (b.TaskDuration-a.TaskDuration)*1000 : null);
        rows.push({ scenario, trial, mode, fcpMs:metrics.fcp, lcpMs:metrics.lcp,
          taskMs:taskDelta(cpuBefore,cpuAfter), prepTaskMs:taskDelta(cpuBefore,cpuAtClick),
          requests:requests.length, payloadBytes:requests.reduce((s,r)=>s+r.bodyBytes,0),
          speculativeRequests:anticipation.length, speculativePayloadBytes:anticipation.reduce((s,r)=>s+r.bodyBytes,0),
          postClickPayloadBytes:fixture.log.slice(beforeNavigation).reduce((s,r)=>s+r.bodyBytes,0),
          secondarySpeculativeRequests:anticipation.filter(r=>/below|movie/.test(r.path)).length,
          cdpEncodedBytes:[...cdpRecords.values()].reduce((s,r)=>s+r.bytes,0),
          cdpRequests:[...cdpRecords.values()], metrics,
          ledger: worker ? await worker.evaluate(async()=> (await chrome.storage.local.get('ledger')).ledger || null) : null
        });
        console.log(`${scenario} ${trial+1}/${iterations} ${mode}: FCP ${metrics.fcp.toFixed(0)} ms, LCP ${metrics.lcp.toFixed(0)} ms, ${requests.length} requests`);
      } finally { await context?.close(); }
    }
  }
} finally { await fixture.close(); }

const summaries = scenarios.flatMap(scenario => ['native','strict','measured'].map(mode => {
  const group = rows.filter(r=>r.scenario===scenario && r.mode===mode);
  return {scenario,mode,n:group.length,fcpMedian:median(group.map(r=>r.fcpMs)),lcpMedian:median(group.map(r=>r.lcpMs)),
    lcpP75:percentile(group.map(r=>r.lcpMs),.75),payloadMedian:median(group.map(r=>r.payloadBytes)),
    taskMedian:median(group.filter(r=>r.taskMs!==null).map(r=>r.taskMs)),
    requestMedian:median(group.map(r=>r.requests)),speculativeMedian:median(group.map(r=>r.speculativePayloadBytes))};
}));
const report = { at:new Date().toISOString(),browser:version,os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model,
  iterations,fixtureDelayMs:Number(process.env.NEUROLOAD_DELAY||110),leadTimeMs:1000,viewport:'1200x800@1',cpuTimeDomain:'threadTicks',rows,summaries,
  limitations:['Local synthetic fixture; no public-web performance claim.', 'Browser default preload settings; separate fresh profiles; cache cleared after training.', 'CPU proxy is renderer main-thread TaskDuration; extension worker/browser-wide CPU not included.', 'Server payload bytes exclude headers/TLS; CDP bytes may omit speculation work. Both raw series included.', 'Not a universal hard transferred-byte ceiling. Strict mode initiates zero speculative body downloads.', 'No-store tests document memory prefetch reuse separately from HTTP subresource caching.'] };
await mkdir('bench/results',{recursive:true});
await writeFile('bench/results/latest.json',JSON.stringify(report,null,2));
const table = ['| Scenario | Mode | n | Median FCP ms | Median LCP ms | LCP p75 ms | Median body bytes | Median requests | Median main-thread CPU ms |', '|---|---|---:|---:|---:|---:|---:|---:|---:|',
...summaries.map(s=>`| ${s.scenario} | ${s.mode} | ${s.n} | ${s.fcpMedian.toFixed(1)} | ${s.lcpMedian.toFixed(1)} | ${s.lcpP75.toFixed(1)} | ${s.payloadMedian} | ${s.requestMedian} | ${s.taskMedian.toFixed(1)} |`)];
const text = `# NeuroLoad local benchmark\n\n${report.at} · Chromium ${version} · ${report.os} · ${report.cpu}\n\n${table.join('\n')}\n\nBytes include BOTH preparation and navigation. Speculative work is included in the accounting. Strict is the control without speculative downloads.\n\n${report.limitations.map(s=>'- '+s).join('\n')}\n\nRaw data: latest.json. Descriptive small sample; no public-web speed guarantee.\n`;
await writeFile('bench/results/latest.md',text);
if(rows.some(r=>r.secondarySpeculativeRequests)) throw new Error('Secondary resource was speculatively requested');
console.log('Report: bench/results/latest.md');
