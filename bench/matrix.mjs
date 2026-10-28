import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createFixture} from './fixture.mjs';
import {launch,configure,waitProfile} from './browser.mjs';

const iterations=Number(process.env.NEUROLOAD_RUNS||5);
assert.ok(Number.isInteger(iterations)&&iterations>=2&&iterations<=30);
const baseline=process.env.NEUROLOAD_BASELINE;
if(baseline) await readFile(resolve(baseline,'manifest.json'));
const cases={
 cold:{target:'/article',source:'/',lead:1000},
 'no-store':{target:'/no-store',source:'/',lead:1000},
 warm:{target:'/article',source:'/',lead:1000,warm:true},
 glance:{target:'/article',source:'/',lead:300,miss:true},
 short:{target:'/article',source:'/',lead:300},
 heavy:{target:'/article',source:'/heavy',lead:1000},
 miss:{target:'/article',source:'/',lead:1000,miss:true}
};
const selected=process.env.NEUROLOAD_CASES?.split(',')||Object.keys(cases);
assert.ok(selected.every(key=>cases[key]));
const groups=baseline?['native','baseline','strict','optimized']:['native','strict','optimized'];
const fixture=await createFixture({delay:Number(process.env.NEUROLOAD_DELAY||110)});
const rows=[];
let browser;
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const fingerprints={optimized:{manifest:await hash('extension/manifest.json'),content:await hash('extension/content.js'),background:await hash('extension/background.js'),core:await hash('extension/core.js')}};
if(baseline)fingerprints.baseline={manifest:await hash(resolve(baseline,'manifest.json')),content:await hash(resolve(baseline,'content.js')),background:await hash(resolve(baseline,'background.js')),core:await hash(resolve(baseline,'core.js'))};
await mkdir('bench/results',{recursive:true});
const checkpoint=async()=>writeFile('bench/results/matrix-checkpoint.json',JSON.stringify({at:new Date().toISOString(),iterations,groups,selected,fingerprints,rows},null,2));
try{
 for(const name of selected)for(let trial=0;trial<iterations;trial++){
  // Rotate and reverse group order; never run timed Chrome sessions in parallel.
  const offset=trial%groups.length;
  let order=[...groups.slice(offset),...groups.slice(0,offset)];if(trial%2)order.reverse();
  for(const group of order){
   const scenario=cases[name];let context;
   try{
    context=await launch({extension:group!=='native',fixtureOrigin:fixture.origin,extensionPath:group==='baseline'?baseline:'extension'});
    browser=context.browser().version();
    const page=await context.newPage();let worker;
    if(group!=='native')({worker}=await configure(context,fixture.origin,{mode:group==='strict'?'strict':'measured'}));
    await page.goto(fixture.origin+scenario.target);
    if(worker)await waitProfile(worker,fixture.origin+scenario.target);else await page.waitForTimeout(500);
    await page.goto(fixture.origin+scenario.source);
    if(worker)await waitProfile(worker,fixture.origin+scenario.source);else await page.waitForTimeout(500);
    const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
    if(!scenario.warm)await cdp.send('Network.clearBrowserCache');
    await cdp.send('Performance.enable',{timeDomain:'threadTicks'});
    const perf=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    const cpu0=await perf(),mark=fixture.log.length;
    await page.addInitScript(()=>{
     window.__matrix={lcp:null};
     new PerformanceObserver(list=>{window.__matrix.lcp=list.getEntries().at(-1)?.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
    });
    await page.goto(fixture.origin+scenario.source);await page.waitForTimeout(2700);
    await page.mouse.move(1100,700);
    const link=page.locator(scenario.target==='/no-store'?'#no-store':'#target');
    await link.hover();await page.waitForTimeout(scenario.lead);
    if(scenario.miss){await page.mouse.move(1100,700);await page.waitForTimeout(1000-scenario.lead);}
    const clickMark=fixture.log.length,cpuClick=await perf();
    await (scenario.miss?page.locator('#unknown'):link).click();await page.waitForLoadState('load');await page.waitForTimeout(700);
    const metric=await page.evaluate(()=>({fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,lcp:window.__matrix.lcp,navigation:performance.getEntriesByType('navigation')[0]?.toJSON()}));
    assert.ok(metric.fcp>0&&metric.lcp>0,`Missing paints ${name}/${group}`);
    const cpu1=await perf();
    const requests=fixture.log.slice(mark).filter(r=>r.path!=='/favicon.ico');
    const spec=fixture.log.slice(mark,clickMark).filter(r=>r.purpose.includes('prefetch'));
    const delta=(a,b)=>b.TaskDuration>=a.TaskDuration?(b.TaskDuration-a.TaskDuration)*1000:null;
    const row={scenario:name,trial,group,fcpMs:metric.fcp,lcpMs:metric.lcp,taskMs:delta(cpu0,cpu1),prepTaskMs:delta(cpu0,cpuClick),
     requests:requests.length,payloadBytes:requests.reduce((s,r)=>s+r.bodyBytes,0),speculativeRequests:spec.length,speculativePayloadBytes:spec.reduce((s,r)=>s+r.bodyBytes,0),
     secondarySpeculativeRequests:spec.filter(r=>/below|movie/.test(r.path)).length,
     speculativePaths:spec.map(r=>r.path),serverRequests:requests,navigation:metric.navigation,
     ledger:worker?await worker.evaluate(async()=> (await chrome.storage.local.get('ledger')).ledger||null):null};
    assert.equal(row.secondarySpeculativeRequests,0);
    if(group==='strict')assert.equal(row.speculativeRequests,0);
    if(group==='optimized'&&name==='glance')assert.ok(!row.speculativePaths.includes('/hero.png')&&!row.speculativePaths.includes('/critical.css'));
    rows.push(row);await checkpoint();
    console.log(`${name} ${trial+1}/${iterations} ${group}: LCP ${row.lcpMs.toFixed(0)}ms, CPU ${row.taskMs?.toFixed(1)}ms, ${row.payloadBytes} B, spec ${row.speculativePaths.join(',')||'none'}`);
   }finally{await context?.close();}
  }
 }
}finally{await fixture.close();}
const median=v=>{v=[...v].sort((a,b)=>a-b);const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
const summaries=selected.flatMap(scenario=>groups.map(group=>{
 const a=rows.filter(r=>r.scenario===scenario&&r.group===group),sorted=a.map(r=>r.lcpMs).sort((a,b)=>a-b);
 return{scenario,group,n:a.length,fcpMedian:median(a.map(r=>r.fcpMs)),lcpMedian:median(a.map(r=>r.lcpMs)),lcpP75:sorted[Math.ceil(a.length*.75)-1],taskMedian:median(a.filter(r=>r.taskMs!==null).map(r=>r.taskMs)),payloadMedian:median(a.map(r=>r.payloadBytes)),speculativeMedian:median(a.map(r=>r.speculativePayloadBytes)),requestMedian:median(a.map(r=>r.requests))};
}));
const report={at:new Date().toISOString(),browser,os:`${os.platform()} ${os.release()}`,cpu:os.cpus()[0]?.model,iterations,groups,selected,fingerprints,fixtureDelayMs:Number(process.env.NEUROLOAD_DELAY||110),viewport:'1200x800@1',cpuTimeDomain:'threadTicks',summaries,rows,
 limitations:['Synthetic local fixture, small descriptive sample; no public-web speed claim.','CPU covers the renderer main thread including preparation, not all Chrome or the extension worker.','Network counts complete gzip bodies received by the server, excluding headers/TLS.','Glance: 300ms hover, then departure; short: navigate after 300ms. Staging trades short-lead latency for lower wasted bytes.','Warm: native HTTP cache retained after identical training.','Native preloading settings remain at fresh-profile defaults.','New profiles per sequence; counterbalanced group order. Native host-grant prompts are not automated.']};
await writeFile('bench/results/matrix.json',JSON.stringify(report,null,2));
const lines=['| Case | Group | n | Median FCP ms | Median LCP ms | LCP p75 | Median CPU ms | Median body bytes | Median speculative bytes |','|---|---|---:|---:|---:|---:|---:|---:|---:|',...summaries.map(s=>`| ${s.scenario} | ${s.group} | ${s.n} | ${s.fcpMedian.toFixed(1)} | ${s.lcpMedian.toFixed(1)} | ${s.lcpP75.toFixed(1)} | ${s.taskMedian.toFixed(1)} | ${s.payloadMedian} | ${s.speculativeMedian} |`)];
await writeFile('bench/results/matrix.md',`# NeuroLoad 0.1 / optimized comparison\n\n${report.at} · Chrome for Testing ${browser} · ${report.os}\n\n${lines.join('\n')}\n\n${report.limitations.map(s=>'- '+s).join('\n')}\n`);
console.log(`Matrix complete: ${rows.length} navigations`);
