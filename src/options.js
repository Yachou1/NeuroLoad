import { cleanConfig, safeURL } from './core.js';
const $ = id => document.getElementById(id);
let config,globalAccess=false;
const call = message => chrome.runtime.sendMessage(message);
const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
function read() {
  const c = { ...config, enabled: $('enabled').checked, mode: document.querySelector('[name="mode"]:checked').value, allowLoopback: $('allowLoopback').checked, exclusions: $('exclusions').value.split('\n') };
  for (const key of ['pageKiB', 'hourKiB', 'dayKiB', 'pageRequests', 'hourRequests', 'dayRequests', 'retentionDays']) c[key] = Number($(key).value);
  return cleanConfig(c);
}
function render() {
  $('auto-status').textContent=config.automatic?'Automatic mode is on: recognized sensitive HTTPS sites require temporary consent.':'Automatic mode is off: only manually added sites are included.';
  $('enable-auto').hidden=config.automatic;$('disable-auto').hidden=!config.automatic&&!globalAccess;
  for (const key of ['enabled', 'allowLoopback']) $(key).checked = config[key];
  for (const key of ['pageKiB', 'hourKiB', 'dayKiB', 'pageRequests', 'hourRequests', 'dayRequests', 'retentionDays']) $(key).value = config[key];
  document.querySelector(`[name="mode"][value="${config.mode}"]`).checked = true;
  $('exclusions').value = config.exclusions.join('\n');
  $('sites').replaceChildren();
  $('no-sites').hidden = config.allowedOrigins.length > 0;
  $('no-sites').textContent=config.automatic?'No manually added sites. Automatic mode covers accessible HTTPS sites.':'No sites allowed. NeuroLoad does not observe any pages.';
  for (const origin of config.allowedOrigins) {
    const li = document.createElement('li'), text = document.createElement('span'), button = document.createElement('button');
    text.textContent = origin;
    button.textContent = 'Remove access';
    button.className = 'secondary';
    button.addEventListener('click', async () => {
      config = read();
      config.allowedOrigins = config.allowedOrigins.filter(x => x !== origin);
      const result = await call({ type: 'SAVE', config });
      if (!result.ok) return status('Could not remove this site.', true);
      await chrome.permissions.remove({ origins: [`${origin}/*`] });
      config = result.config;
      render();
      status('Access removed and site data cleared. Reload its tabs.');
    });
    li.append(text, button); $('sites').append(li);
  }
}
async function refresh() {
  const result = await call({ type: 'GET' });
  if (!result?.ok) throw new Error('unavailable');
  config = result.config;
  globalAccess=result.globalAccess===true;
  render();
  $('stats').textContent = `${result.pages} pages · ${result.transitions} transitions`;
  const entries = result.ledger.entries;
  $('usage').textContent = `Reservations over 24 h: ${entries.reduce((s, e) => s + e.requests, 0)} resources · ${Math.ceil(entries.reduce((s, e) => s + e.bytes, 0) / 1024)} estimated KiB. These are not measured network bytes.`;
}
$('add-site').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const raw = new URL($('origin').value.trim());
    const next = read();
    if (!safeURL(raw.origin + '/', { allowLoopback: next.allowLoopback,allowSensitiveHost:true })) return status('Choose a supported HTTPS site. Private areas remain blocked.', true);
    if (next.allowedOrigins.length >= 50) return status('The 50-site limit has been reached.', true);
    // Permission request is directly within this explicit user gesture.
    const granted = await chrome.permissions.request({ origins: [`${raw.origin}/*`] });
    if (!granted) return status('Access was not granted. No changes made.', true);
    next.allowedOrigins = [...new Set([...next.allowedOrigins, raw.origin])];
    const result = await call({ type: 'SAVE', config: next });
    if (!result?.ok) return status('Settings were not saved.', true);
    config = result.config; render(); $('origin').value = '';
    status('Site allowed. Reload its tab to begin.');
  } catch { status('Invalid address or permission unavailable.', true); }
});
$('enable-auto').addEventListener('click',async event=>{
  if(!event.isTrusted)return;
  try{
    const next=read();
    if(!await chrome.permissions.request({origins:['https://*/*']}))return status('Broad access was denied. Automatic mode remains off.',true);
    globalAccess=true;next.automatic=true;
    const result=await call({type:'SAVE',config:next});if(!result?.ok)throw new Error();
    config=result.config;render();status('Automatic mode enabled. Reload existing tabs. Recognized sensitive sites will request your consent.');
  }catch{render();status('Activation unavailable. You can remove broad access using the removal button.',true);}
});
$('disable-auto').addEventListener('click',async()=>{
  try{
    const next=read();next.automatic=false;
    const result=await call({type:'SAVE',config:next});if(!result?.ok)throw new Error();
    const removed=await chrome.permissions.remove({origins:['https://*/*']});
    await refresh();status(removed?'Automatic mode stopped and broad access removed. Reload your tabs.':'Automatic mode stopped. Chrome retains broad access: check the extension permissions.',!removed);
  }catch{status('Could not complete removal. Check the extension permissions in Chrome.',true);}
});
$('save').addEventListener('click', async () => {
  const inputs = [...document.querySelectorAll('input[type="number"]')];
  if (inputs.some(input => !input.reportValidity())) return;
  try {
    const result = await call({ type: 'SAVE', config: read() });
    if (!result?.ok) throw new Error();
    config = result.config; render(); status('Settings saved. Reload allowed tabs.');
  } catch { status('Could not save settings.', true); }
});
$('clear').addEventListener('click', async () => {
  const result = await call({ type: 'CLEAR' });
  if (!result?.ok) return status('Clearing is unavailable.', true);
  await refresh(); status('Learning data and reservations cleared.');
});
refresh().then(() => status('Everything stays on this device.'), () => status('Service unavailable. Reload the extension.', true));
