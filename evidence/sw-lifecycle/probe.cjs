// Run after a frozen install. PLAYWRIGHT_MODULE must resolve an installed Playwright.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {createHash} = require('node:crypto');
const {spawnSync, execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = path.resolve(__dirname, '../..');
const sha = b => createHash('sha256').update(b).digest('hex');
const log = (event, data = {}) => console.log(JSON.stringify({event, ...data}));
const deadline = async (label, fn) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(`Timed out: ${label}`);
};
(async () => {
  const candidate = execFileSync('git', ['rev-parse','HEAD'], {cwd:source,encoding:'utf8'}).trim();
  assert.equal(execFileSync('git',['diff','278fc3cf05777d30c552d2b771e408931bf092f6','--','src','public','scripts','vendor','licenses','astro.config.mjs','site.config.mjs','package.json','package-lock.json','STARTER-DELIVERY.json'], {cwd:source,encoding:'utf8'}), '');
  log('candidate',{commit:candidate, tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:source,encoding:'utf8'}).trim(), productionCandidate:'278fc3cf05777d30c552d2b771e408931bf092f6', productionTree:'71c1c34c058fa91a99535af54053fde1e7e4400e'});
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'still-sw-lifecycle-'));
  let browser, server;
  const sockets = new Set();
  let served = 'A', mode = 'online', port;
  try {
    const root = path.join(temporary, 'consumer');
    await fs.mkdir(root);
    for (const name of ['src','public','scripts','vendor','licenses','astro.config.mjs','site.config.mjs','tsconfig.json','package.json','package-lock.json','STARTER-DELIVERY.json'])
      await fs.cp(path.join(source, name), path.join(root, name), {recursive: true});
    await fs.cp(path.join(source, 'node_modules'), path.join(root, 'node_modules'), {recursive:true});
    const builds = {};
    const originals = {};
    for (const name of ['index.astro','offline.astro']) originals[name] = await fs.readFile(path.join(root,'src/pages',name), 'utf8');
    for (const phase of ['A','B']) {
      for (const [name, contents] of Object.entries(originals))
        await fs.writeFile(path.join(root,'src/pages',name), contents + `\n<!-- lifecycle ${phase} ${name} -->\n`);
      if (phase === 'B') await fs.writeFile(path.join(root,'src/pages/b-only.astro'), '<html><head><title>B only</title></head><body>B-only precached document</body></html>');
      const result = spawnSync(process.execPath, [path.join(root,'node_modules/astro/bin/astro.mjs'), 'build'], {
        cwd: root, env: {...process.env, ASTRO_TELEMETRY_DISABLED:'1', PUBLIC_SITE_ENV:'preview'}, encoding:'utf8', timeout:60000});
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const directory = path.join(temporary, phase);
      await fs.rename(path.join(root,'dist'), directory);
      const worker = await fs.readFile(path.join(directory,'reading-worker.js'));
      const revision = /const REVISION="([^"]+)"/.exec(worker.toString())[1];
      builds[phase] = {directory, revision, worker:sha(worker), home:await fs.readFile(path.join(directory,'index.html')), fallback:await fs.readFile(path.join(directory,'offline/index.html'))};
      log('build', {phase, revision, workerSha256:sha(worker), homeSha256:sha(builds[phase].home), fallbackSha256:sha(builds[phase].fallback)});
    }
    assert.notEqual(builds.A.revision, builds.B.revision);
    assert.notEqual(builds.A.worker, builds.B.worker);
    const handler = async (req,res) => {
      try {
        const url = new URL(req.url, 'http://fixture');
        if (mode === '503' && url.pathname !== '/reading-worker.js') {
          res.writeHead(503, {'content-type':'text/html', 'cache-control':'no-store'}); res.end('fixture HTTP 503 unchanged'); return;
        }
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        assert.ok(!relative.split('/').includes('..'));
        const filename = path.join(builds[served].directory, relative + (url.pathname.endsWith('/') ? 'index.html' : ''));
        const bytes = await fs.readFile(filename);
        res.writeHead(200, {'content-type': filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'cache-control':'no-store'});
        res.end(bytes);
      } catch { res.writeHead(404); res.end('fixture missing'); }
    };
    const start = async () => {
      server = http.createServer(handler);
      server.on('connection', socket => {sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
      await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port || 0,'127.0.0.1',resolve);});
      port = server.address().port;
    };
    const stop = async () => { const closed = new Promise(r => server.close(r)); for (const socket of sockets) socket.destroy(); await closed; };
    await start();
    const origin = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
    const context = await browser.newContext({serviceWorkers:'allow'});
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(15000);
    log('runtime',{node:process.version, browser:browser.version(), origin, candidate, productionCandidate:'278fc3cf05777d30c552d2b771e408931bf092f6'});
    const workerFor = async phase => {
      for (const worker of context.serviceWorkers()) {
        try { if (await worker.evaluate('REVISION') === builds[phase].revision) return worker; } catch {}
      }
    };
    const active = async phase => {
      const worker = await workerFor(phase);
      if (!worker) return false;
      try {return await worker.evaluate('self.serviceWorker.state === "activated" && self.registration.active?.state === "activated" && !self.registration.waiting');} catch {return false;}
    };
    const snapshot = async (page, label) => {
      const state = await page.evaluate(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        const cacheKeys = await caches.keys();
        const cacheEntries = {};
        for (const key of cacheKeys) cacheEntries[key] = (await (await caches.open(key)).keys()).map(r=>r.url).sort();
        return {controller:navigator.serviceWorker.controller?.scriptURL, active:r?.active?.state, waiting:r?.waiting?.state, cacheKeys:cacheKeys.sort(), cacheEntries};
      });
      const workers = [];
      for (const worker of context.serviceWorkers()) {
        try {workers.push(await worker.evaluate('({revision:REVISION, ownState:self.serviceWorker?.state, scriptURL:self.location.href})'));} catch {}
      }
      log('state',{label,...state,workers}); return state;
    };
    const navigate = async (page, route, expected, status = 200) => {
      const before = Date.now();
      const response = await page.goto(origin + route, {waitUntil:'domcontentloaded'});
      assert.equal(response.status(),status);
      const body = await response.body();
      assert.equal(sha(body),sha(expected));
      log('response',{phase:served, mode, route, status:response.status(), fromServiceWorker:response.fromServiceWorker(), sha256:sha(body), elapsedMs:Date.now()-before});
      return response;
    };
    const probes = async (page, phase, label) => {
      mode = '503';
      for (const route of ['/','/unknown/']) assert.equal((await navigate(page, route, Buffer.from('fixture HTTP 503 unchanged'), 503)).fromServiceWorker(),true);
      mode = 'offline'; await stop();
      for (const [route,bytes] of [['/',builds[phase].home],['/unknown/',builds[phase].fallback],['/b-only/', phase === 'B' ? await fs.readFile(path.join(builds.B.directory,'b-only/index.html')) : builds[phase].fallback]]) {
        const response = await navigate(page,route,bytes); assert.equal(response.fromServiceWorker(),true);
      }
      const state = await snapshot(page,label);
      assert.deepEqual(state.cacheKeys.filter(k=>k.startsWith('still-starter-reading-')), ['still-starter-reading-' + builds[phase].revision]);
      assert.equal(await page.evaluate(async()=>await (await (await caches.open('foreign-sentinel')).match('/sentinel')).text()),'preserve foreign bytes');
      if (phase === 'A') assert.ok(!Object.entries(state.cacheEntries).filter(([k])=>k.startsWith('still-starter-reading-')).flatMap(([,v])=>v).some(u=>new URL(u).pathname === '/b-only/'));
      mode = 'online'; await start();
      await navigate(page,'/',builds[phase].home);
    };
    let page = await context.newPage();
    await navigate(page,'/',builds.A.home);
    // Lifecycle probe explicitly registers; connection-aware idle eligibility is a separate client concern.
    await page.evaluate(()=>navigator.serviceWorker.register('/reading-worker.js',{scope:'/',updateViaCache:'none'}));
    await deadline('initial A active',()=>active('A'));
    await page.reload({waitUntil:'domcontentloaded'});
    assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
    await page.evaluate(async()=>{const cache=await caches.open('foreign-sentinel');await cache.put('/sentinel',new Response('preserve foreign bytes'));});
    await probes(page,'A','initial A');
    for (const [from,to] of [['A','B'],['B','A']]) {
      // Two old clients must block natural activation of the installed update.
      const peer = await context.newPage(); await navigate(peer,'/',builds[from].home);
      served = to;
      await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
      await deadline(`${to} waiting`, async()=>await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return r.waiting?.state==='installed';}));
      assert.ok(await workerFor(to));
      const waiting = await snapshot(page,`${from}->${to} waiting with two clients`);
      assert.deepEqual(waiting.cacheKeys.filter(k=>k.startsWith('still-starter-reading-')).sort(),[from,to].map(p=>'still-starter-reading-'+builds[p].revision).sort());
      mode = 'offline'; await stop();
      await navigate(page,'/',builds[from].home);
      await page.close();
      assert.equal(await peer.evaluate(async()=>(await navigator.serviceWorker.getRegistration()).waiting?.state),'installed');
      await navigate(peer,'/unknown/',builds[from].fallback);
      await peer.close();
      await deadline(`${to} natural activation`,()=>active(to));
      log('naturalActivation',{from,to,revision:builds[to].revision, allOldClientsClosed:true});
      mode = 'online'; await start();
      page = await context.newPage();
      await navigate(page,'/',builds[to].home);
      assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));
      await probes(page,to,`${from}->${to} activated`);
    }
    log('PASS',{transitions:'A->B->A', unregisterCalls:0, forcedActivationCalls:0, cacheClearCalls:0});
  } finally {
    if (browser) await browser.close();
    if (server?.listening) {for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}
    await fs.rm(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
