import { resolve } from 'node:path';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve('.work/browsers');
const { chromium } = await import('playwright');

export async function launch({ extension = true, profile = '', headless = true, fixtureOrigin, extensionPath = 'extension', testGlobalAccess=false,ignoreHTTPSErrors=false,extraArgs=[] } = {}) {
  let path = resolve(extensionPath);
  if (extension && fixtureOrigin) {
    // Isolated harness: pre-grant exactly the local fixture. Chrome host-permission
    // prompts cannot be accepted by Playwright in headless automation.
    path = resolve('.work/test-extensions', `${process.pid}-${new URL(fixtureOrigin).port}`);
    await cp(extensionPath, path, { recursive: true });
    const manifest = JSON.parse(await readFile(resolve(path, 'manifest.json'), 'utf8'));
    manifest.host_permissions = [`${fixtureOrigin}/*`];
    if(testGlobalAccess)manifest.host_permissions.push('https://*/*');
    await writeFile(resolve(path, 'manifest.json'), JSON.stringify(manifest));
  }
  return chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless,
    executablePath: process.env.CHROME_PATH || undefined,
    viewport: { width: 1200, height: 800 },ignoreHTTPSErrors,
    args: [...(extension ? [`--disable-extensions-except=${path}`, `--load-extension=${path}`] : ['--disable-extensions']),...extraArgs],
  });
}
export async function workerFor(context) {
  return context.serviceWorkers()[0] || context.waitForEvent('serviceworker');
}
export async function configure(context, origin, overrides = {}) {
  const worker = await workerFor(context);
  const extensionId = new URL(worker.url()).hostname;
  const deadline = Date.now() + 5000;
  while (!await worker.evaluate(async () => Boolean((await chrome.storage.local.get('config')).config))) {
    if (Date.now() > deadline) throw new Error('Extension installation did not finish');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  // Test-only setup through privileged automation; never shipped to the extension.
  await worker.evaluate(async ({ origin, overrides }) => {
    if (!await chrome.permissions.contains({ origins: [`${origin}/*`] })) throw new Error('Fixture host not granted');
    const { config = {} } = await chrome.storage.local.get('config');
    await chrome.storage.local.set({ config: { ...config, ...overrides, allowedOrigins: [origin], allowLoopback: true } });
  }, { origin, overrides });
  const options = await context.newPage();
  options.setDefaultTimeout(10000);
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.waitForFunction(() => document.getElementById('status').textContent !== 'Loading…');
  await options.evaluate(() => document.getElementById('save').click());
  await options.waitForFunction(() => document.getElementById('status').textContent.startsWith('Settings saved'), { timeout: 10000 });
  await options.close();
  return { worker, extensionId };
}
export async function waitProfile(worker, url, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await worker.evaluate(async url => Boolean((await chrome.storage.local.get('model')).model?.pages[url]), url)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`No learned profile for ${url}`);
}
export async function train(page, worker, origin, target = '/article') {
  await page.goto(origin + target);
  await waitProfile(worker, origin + target);
  await page.goto(origin + '/');
  await waitProfile(worker, origin + '/');
}
export async function writeReport(path, text) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, text);
}
