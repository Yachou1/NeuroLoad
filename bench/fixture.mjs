import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

export async function createFixture({ delay = 110, secure = false } = {}) {
  const log = [];
  const files = {}, awaitText = {};
  for (const name of ['index.html','article.html','form.html','rules.html','critical.css','hero.svg','hero.png']) {
    const bytes = await readFile(new URL(`fixtures/${name}`, import.meta.url));
    files[name] = gzipSync(bytes);
    if(name.endsWith('.html')) awaitText[name]=bytes.toString('utf8');
  }
  const routes = { '/':'index.html', '/article':'article.html', '/no-store':'article.html', '/critical.css':'critical.css', '/hero.png':'hero.png', '/below.svg':'hero.svg', '/form':'form.html', '/site-rules':'rules.html' };
  const handler = (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const record = { path, purpose: req.headers['sec-purpose'] || req.headers.purpose || '', at: Date.now(), bodyBytes: 0, status: 200 };
    log.push(record);
    if (path === '/favicon.ico') { res.writeHead(204); res.end(); record.status=204; return; }
    const variants = { '/responsive':'article.html', '/offscreen':'article.html', '/slow':'article.html', '/failure':'article.html', '/opt-out':'index.html', '/heavy':'index.html', '/shared':'index.html', '/nested':'index.html', '/hero-delay.png':'hero.png', '/passive-nofollow':'index.html', '/passive-download':'index.html', '/passive-no-prefetch':'index.html' };
    const name = routes[path] || variants[path] || 'index.html';
    let body = files[name];
    if (variants[path] && name.endsWith('.html')) {
      let text = (awaitText[name] || '');
      if(path==='/responsive') text=text.replace('src="/hero.png"','src="/hero.png" srcset="/hero.png 1x"');
      if(path==='/offscreen') text=text.replace('src="/hero.png"','class="below" src="/hero.png"');
      if(path==='/slow') text=text.replace('/hero.png','/hero-delay.png');
      if(path==='/opt-out') text=text.replace('<body>','<body data-neuroload="off">');
      if(path==='/passive-nofollow') text=text.replace('id="target"','id="target" rel="NOFOLLOW"');
      if(path==='/passive-download') text=text.replace('id="target"','id="target" download');
      if(path==='/passive-no-prefetch') text=text.replace('id="target"','id="target" data-no-prefetch');
      if(path==='/shared') text=text.replace('</head>','<link rel="stylesheet" href="/critical.css"></head>');
      if(path==='/nested') text=text.replace('Ouvrir l’article','<span id="nested-a">Ouvrir</span> <span id="nested-b">l’article</span>');
      if(path==='/heavy') text=text.replace('</body>', '<div hidden id="tree">'+('<i></i>'.repeat(15000))+'</div><script>const tree=document.getElementById("tree");let n=0;const t=setInterval(()=>{for(let i=0;i<30;i++)tree.children[(n++)%15000].replaceChildren(document.createElement("b"));if(n>9000)clearInterval(t);},10);</script></body>');
      body=gzipSync(text);
    }
    const type = name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8';
    const timer = setTimeout(() => {
      if (res.destroyed) return;
      const headers = { 'Content-Type':type, 'Content-Length':body.length, 'Content-Encoding':'gzip', 'Cache-Control': path === '/no-store' ? 'no-store' : 'public, max-age=3600' };
      if (path === '/csp') headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";
      if(path==='/redirect') { res.writeHead(302,{Location:'/article','Cache-Control':'no-store'});res.end();record.status=302;return; }
      const status=path==='/failure'?404:200;record.status=status;
      res.writeHead(status,headers); res.end(body);
    }, path==='/hero-delay.png'?3000:['/critical.css','/hero.png'].includes(path)?delay*2:delay);
    res.on('finish',()=> {record.bodyBytes=body.length;});
    res.on('close',()=>clearTimeout(timer));
  };
  const server=secure?https.createServer({key:await readFile(new URL('fixtures/tls/test-key.pem',import.meta.url)),cert:await readFile(new URL('fixtures/tls/test-cert.pem',import.meta.url))},handler):http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return { origin:secure?`https://public.test:${server.address().port}`:`http://127.0.0.1:${server.address().port}`, log,
    close:()=>new Promise(resolve=> {server.close(resolve);server.closeAllConnections();}) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture=await createFixture(); console.log(`Demo: ${fixture.origin}`);
}
