const {chromium} = require(process.env.STILL_PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
// Instrumentation is served only by this disposable loopback experiment.
// Installed/package/generated worker files remain unchanged on disk.
const instrumentation = `
self.__retention = {incoming: [], outgoing: []};
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  const record = {path: new URL(event.request.url).pathname, aborted: event.request.signal.aborted};
  self.__retention.incoming.push(record);
  event.request.signal.addEventListener('abort', () => {record.aborted = true;}, {once:true});
});
const originalFetch = self.fetch.bind(self);
self.fetch = (request, options) => {
  if (request instanceof Request && request.mode === 'navigate') {
    const record = {path: new URL(request.url).pathname, aborted: options?.signal?.aborted};
    self.__retention.outgoing.push(record);
    options?.signal?.addEventListener('abort', () => {record.aborted = true;}, {once:true});
  }
  return originalFetch(request, options);
};
`;
const root = path.resolve(process.cwd(), 'dist');
const sockets = new Set(), requests = [];
let mode = 'normal', server, port, onlineContactHits = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 3000) {
  const start = performance.now();
  while (!fn()) {assert.ok(performance.now() - start < timeout, 'bounded observation timed out'); await sleep(10);}
  return fn();
}
async function start() {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const tracked = ['/contact/', '/unknown-probe/', '/api/probe/'].includes(url.pathname);
    if (tracked && mode === 'hang') {
      const record = {url: url.pathname, opened: performance.now()}; requests.push(record);
      res.on('close', () => {record.closed = performance.now();});
      return;
    }
    if (tracked && mode === 'stream') {
      const record = {url:url.pathname, opened:performance.now(), bytes:0}; requests.push(record);
      res.writeHead(200, {'content-type':'text/html', 'cache-control':'no-store'});
      const chunk = '<html><body>' + 'x'.repeat(1000);
      res.write(chunk); record.bytes += Buffer.byteLength(chunk);
      const timer = setInterval(() => {res.write('x'.repeat(1024)); record.bytes += 1024;}, 25);
      const limit = setTimeout(() => res.end('</body></html>'), 1500);
      res.on('close', () => {record.closed=performance.now(); clearInterval(timer); clearTimeout(limit);});
      return;
    }
    if (tracked && mode === '503') {res.writeHead(503, {'content-type': 'text/plain'}); res.end('unchanged upstream 503'); return;}
    const contactHit = url.pathname === '/contact/' ? ++onlineContactHits : undefined;
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + '/') && file !== root) {res.writeHead(400); res.end(); return;}
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      let body = await fs.readFile(file);
      if (url.pathname === '/reading-worker.js') body = Buffer.concat([Buffer.from(instrumentation), body]);
      const mime = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      res.writeHead(200, {'content-type': mime, 'cache-control':'no-store', ...(contactHit ? {'x-probe-network-id':String(contactHit)} : {})}); res.end(body);
    } catch {res.writeHead(404); res.end('not found');}
  });
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  await new Promise(resolve => server.listen(port || 0, '127.0.0.1', resolve));
  port = server.address().port;
}
async function stop() {
  const stopped = new Promise(resolve => server.close(resolve));
  for (const socket of sockets) socket.destroy();
  await stopped;
}
(async () => {
  await start();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({executablePath: process.env.STILL_CHROMIUM || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  try {
    const context = await browser.newContext();
    const page = await context.newPage(), peer = await context.newPage();
    await page.goto(base);
    await page.evaluate(async () => {await navigator.serviceWorker.register('/reading-worker.js'); await navigator.serviceWorker.ready;});
    await page.reload(); await peer.goto(base);
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    assert.ok(await peer.evaluate(() => !!navigator.serviceWorker.controller));
    console.log(JSON.stringify({browser:browser.version(), worker:await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)}));
    // A bypassed same-origin fetch is the immediate-cancellation control.
    mode = 'hang';
    await peer.evaluate(() => {window.probe = new AbortController(); window.probeResult = fetch('/api/probe/', {signal:window.probe.signal}).catch(e => e.name);});
    const direct = await until(() => requests.at(-1)?.url === '/api/probe/' && requests.at(-1));
    const directAbort = performance.now();
    await peer.evaluate(() => window.probe.abort());
    await until(() => direct.closed);
    assert.ok(direct.closed - directAbort < 500);
    console.log(JSON.stringify({control:'excluded direct fetch abort',closeAfterAbortMs:direct.closed-directAbort}));
    const expected = await fs.readFile(path.join(root, 'contact/index.html'), 'utf8');
    const fallback = await fs.readFile(path.join(root, 'offline/index.html'), 'utf8');
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const target of ['/contact/', '/unknown-probe/']) {
        mode = 'hang';
        const before = requests.length;
        const pending = page.goto(base + target).then(() => 'completed', e => e.message);
        const hung = await until(() => requests.length > before && requests.at(-1));
        const superseded = performance.now();
        const healthy = await page.goto(base + '/workshops/');
        assert.equal(healthy.status(), 200);
        assert.match(await pending, /ERR_ABORTED|interrupted/);
        await sleep(150);
        assert.equal(hung.closed, undefined, 'Superseded worker fetch remains open during immediate cancellation window');
        await until(() => hung.closed);
        assert.ok(hung.closed - hung.opened >= 700 && hung.closed - hung.opened < 2500);
        console.log(JSON.stringify({cycle,target,supersession:'ERR_ABORTED',socketMs:hung.closed-hung.opened,closeAfterSupersessionMs:hung.closed-superseded}));

        const start = requests.length;
        const timed = page.goto(base + target);
        const attempt = await until(() => requests.length > start && requests.at(-1));
        const peerResponse = await peer.goto(base + '/project-support/');
        assert.equal(peerResponse.status(), 200);
        const cached = await timed;
        assert.equal(cached.status(),200);
        assert.equal(await cached.text(), target === '/contact/' ? expected : fallback);
        await until(() => attempt.closed);
        assert.ok(attempt.closed - attempt.opened >= 700 && attempt.closed-attempt.opened < 2500);
        console.log(JSON.stringify({cycle,target,deadline:'cached bytes match',peer:'healthy',socketMs:attempt.closed-attempt.opened}));
      }
      mode = '503';
      for (const target of ['/contact/', '/unknown-probe/']) {
        const response = await page.goto(base + target);
        assert.equal(response.status(),503); assert.equal(await response.text(),'unchanged upstream 503');
      }
      mode = 'normal';
      await stop();
      for (const [target, body] of [['/contact/', expected], ['/unknown-probe/', fallback]]) {
        const response = await page.goto(base + target);
        assert.equal(response.status(),200); assert.equal(await response.text(),body);
      }
      await start();
      const hitsBefore = onlineContactHits;
      const recovered = await page.goto(base + '/contact/');
      assert.equal(recovered.status(),200); assert.equal(await recovered.text(), expected);
      assert.ok(onlineContactHits > hitsBefore);
      assert.equal(recovered.headers()['x-probe-network-id'], String(onlineContactHits));
      console.log(JSON.stringify({cycle,http503:'unchanged known+unknown',tcpDisconnect:'cached known+fallback',reconnect:'online'}));
    }
    const observation = await context.serviceWorkers()[0].evaluate(() => self.__retention);
    const incoming = observation.incoming.filter(record => ['/contact/', '/unknown-probe/'].includes(record.path));
    const outgoing = observation.outgoing.filter(record => ['/contact/', '/unknown-probe/'].includes(record.path));
    assert.equal(incoming.length, 27);
    assert.equal(outgoing.length, 27);
    assert.equal(incoming.filter(record => record.aborted).length, 0);
    assert.equal(outgoing.filter(record => record.aborted).length, 12);
    console.log(JSON.stringify({incomingSignals:incoming.length, incomingAborted:0, outgoingDeadlineAborted:12, hangingResponseBodyBytes:0}));
    for (const target of ['/contact/', '/unknown-probe/']) {
      mode = 'stream';
      const before = requests.length;
      const streaming = page.goto(base + target).then(() => 'completed', e => e.message);
      await until(() => requests.length > before);
      const record = requests.at(-1);
      await sleep(100);
      const cancelled = performance.now();
      await page.goto('about:blank');
      const navigationOutcome = await streaming;
      assert.equal(page.url(), 'about:blank');
      await until(() => record.closed);
      console.log(JSON.stringify({stream:target, navigationOutcome, closeAfterSupersessionMs:record.closed-cancelled, lifetimeMs:record.closed-record.opened, bytesWritten:record.bytes, serverSafetyLimitMs:1500}));
    }
    console.log('PASS: incoming/outgoing signal observation and bounded streaming observations; six supersessions retain fetch until deadline; six overlapping deadline/recovery cases; three 503/disconnect/reconnect cycles.');
  } finally {await browser.close(); await stop();}
})().catch(error => {console.error(error); process.exitCode = 1;});
