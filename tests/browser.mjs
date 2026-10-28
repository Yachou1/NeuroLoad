import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createFixture } from '../bench/fixture.mjs';
import { launch, configure, train, workerFor } from '../bench/browser.mjs';

const fixture = await createFixture({ delay: 45 });
let context;
const checks = [], errors = [];
const check = (name, fn) => Promise.resolve().then(fn).then(() => { checks.push(name); console.log(`PASS ${name}`); });
try {
  context = await launch({ fixtureOrigin: fixture.origin });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const { worker, extensionId } = await configure(context, fixture.origin, { mode: 'measured' });
  await check('fixture grant and registered isolated content script', async () => {
    const registered = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    assert.equal(registered.length, 1, JSON.stringify(await worker.evaluate(async () => ({ data: await chrome.storage.local.get('config'), grants: await chrome.permissions.getAll() }))));
    assert.equal(registered[0].world, 'ISOLATED');
    assert.deepEqual(registered[0].matches, [fixture.origin + '/*']);
  });
  await train(page, worker, fixture.origin);
  await check('real viewport learning excludes secondary resources', async () => {
    const model = await worker.evaluate(async () => (await chrome.storage.local.get('model')).model);
    const profile = model.pages[fixture.origin + '/article'];
    assert.ok(profile.documentBytes > 0);
    assert.ok(profile.resources.some(r => r.kind === 'style'));
    assert.ok(profile.resources.some(r => r.kind === 'image'), JSON.stringify(profile));
    assert.ok(profile.resources.every(r => !r.url.includes('below') && !r.url.includes('movie')));
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await page.reload();
  await page.waitForTimeout(900);
  const start = fixture.log.length;
  await check('trusted hover performs document-only speculation plus critical subresources', async () => {
    await page.locator('#target').hover();
    await page.waitForFunction(() => document.querySelectorAll('[data-neuroload="hint"]').length >= 2);
    await page.waitForTimeout(650);
    const records = fixture.log.slice(start);
    assert.ok(records.some(r => r.path === '/article' && r.purpose.includes('prefetch')), JSON.stringify(records));
    assert.ok(records.some(r => r.path === '/critical.css'));
    assert.ok(records.some(r => r.path === '/hero.png'));
    assert.ok(!records.some(r => /below|movie/.test(r.path)));
    assert.ok(!await page.locator('script[type="speculationrules"]').evaluate(el => 'prerender' in JSON.parse(el.textContent)));
    const actual = await worker.evaluate(async () => (await chrome.storage.local.get('ledger')).ledger);
    assert.ok(actual.entries.length === 1 && actual.entries[0].requests <= 4);
  });
  await check('one plan per document despite further hover', async () => {
    const count = await page.locator('[data-neuroload="hint"]').count();
    await page.locator('#unknown').hover(); await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-neuroload="hint"]').count(), count);
  });
  await check('initial preload is reused by real navigation without hidden rendering', async () => {
    const count = fixture.log.filter(r => r.path === '/critical.css').length;
    await page.locator('#target').click();
    await page.waitForLoadState('load');
    assert.equal(fixture.log.filter(r => r.path === '/critical.css').length, count);
    assert.ok(await page.locator('h1').textContent());
  });
  await check('options page renders and saves strict mode', async () => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByText('Everything stays on this device.', { exact: true }).waitFor();
    await options.locator('[name="mode"][value="strict"]').check();
    await options.locator('#save').click();
    await options.getByText('Settings saved. Reload allowed tabs.', { exact: true }).waitFor();
    await mkdir('.work', { recursive: true });
    await options.screenshot({ path: '.work/options.png', fullPage: true });
    await options.close();
    await page.goto(fixture.origin + '/');
    await page.waitForTimeout(950);
    const n = fixture.log.length;
    await page.locator('#target').hover(); await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-neuroload="hint"]').count(), 0);
    assert.equal(fixture.log.slice(n).filter(r => r.purpose.includes('prefetch')).length, 0);
  });
  await check('unknown, parameterized, sensitive and cross-origin links emit no hints in measured mode', async () => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByText('Everything stays on this device.', { exact: true }).waitFor();
    await options.locator('[name="mode"][value="measured"]').check();
    await options.locator('#save').click();
    await options.getByText('Settings saved. Reload allowed tabs.', { exact: true }).waitFor();
    await options.close();
    await worker.evaluate(() => chrome.storage.local.remove('ledger'));
    await page.goto(fixture.origin + '/'); await page.waitForTimeout(900);
    const before = fixture.log.length;
    await page.locator('#target').dispatchEvent('pointerover', { pointerType: 'mouse' });
    await page.waitForTimeout(300);
    for (const id of ['query', 'sensitive', 'cross', 'unknown']) {
      await page.locator('#' + id).hover(); await page.waitForTimeout(300);
    }
    assert.equal(await page.locator('[data-neuroload="hint"]').count(), 0);
    assert.equal(fixture.log.slice(before).filter(r=>r.purpose.includes('prefetch')).length,0);
  });
  await check('sensitive URLs and password forms are never learned', async () => {
    await page.goto(fixture.origin + '/form'); await page.waitForTimeout(900);
    await page.locator('#target').hover(); await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-neuroload="hint"]').count(), 0);
    await page.goto(fixture.origin + '/account'); await page.waitForTimeout(500);
    const model = await worker.evaluate(async () => (await chrome.storage.local.get('model')).model);
    assert.ok(!model.pages[fixture.origin + '/form']);
    assert.ok(!model.pages[fixture.origin + '/account']);
  });
  await check('existing site rules and an offline connection suppress speculation', async () => {
    await page.goto(fixture.origin + '/site-rules'); await page.waitForTimeout(900);
    await page.locator('#target').hover(); await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-neuroload="hint"]').count(), 0);
    await page.goto(fixture.origin + '/'); await page.waitForTimeout(900);
    await context.setOffline(true);
    await page.locator('#target').hover(); await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-neuroload="hint"]').count(), 0);
    await context.setOffline(false);
  });
  await check('removing allowed origin deletes its local data and unregisters content script', async () => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByText('Everything stays on this device.', { exact: true }).waitFor();
    const removed = await options.evaluate(async () => {
      const result = await chrome.runtime.sendMessage({ type: 'GET' });
      result.config.allowedOrigins = [];
      return chrome.runtime.sendMessage({ type: 'SAVE', config: result.config });
    });
    assert.equal(removed.ok, true);
    assert.equal((await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length, 0);
    assert.equal(await worker.evaluate(async () => Object.keys((await chrome.storage.local.get('model')).model.pages).length), 0);
    await options.close();
  });
  await check('unmodified production extension starts without any site access', async () => {
    const production = await launch();
    try {
      const productionWorker = await workerFor(production);
      const id = new URL(productionWorker.url()).hostname;
      const options = await production.newPage();
      await options.goto(`chrome-extension://${id}/options.html`);
      await options.getByText('Everything stays on this device.', { exact: true }).waitFor();
      assert.equal(await options.locator('[name="mode"][value="strict"]').isChecked(), true);
      const grants = await productionWorker.evaluate(() => chrome.permissions.getAll());
      assert.deepEqual(grants.origins || [], []);
      assert.deepEqual(await productionWorker.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
      await options.screenshot({ path: '.work/options-default.png', fullPage: true });
      const ordinary = await production.newPage();
      await ordinary.goto(fixture.origin + '/'); await ordinary.waitForTimeout(600);
      assert.equal(await ordinary.locator('[data-neuroload="hint"]').count(), 0);
      const stored = await productionWorker.evaluate(() => chrome.storage.local.get('model'));
      assert.equal(Object.keys(stored.model.pages).length, 0);
    } finally { await production.close(); }
  });
  assert.deepEqual(errors, []);
  console.log(`${checks.length} browser checks passed. Chromium ${context.browser()?.version() || 'persistent'}`);
  await writeFile('.work/browser-results.json', JSON.stringify({ checks, errors, browser: context.browser()?.version(), at: new Date().toISOString() }, null, 2));
} finally { await context?.close(); await fixture.close(); }
