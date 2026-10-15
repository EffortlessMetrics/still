import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root = fileURLToPath(new URL('../..', import.meta.url));
const verified = '11cd1a04c87add5f9787f5c079a1efb13ed3b8d6';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
assert.equal(git('diff',verified,'--','src','public','scripts','vendor','licenses','astro.config.mjs','site.config.mjs','package.json','package-lock.json','STARTER-DELIVERY.json'),'');
assert.ok(process.env.PLAYWRIGHT_MODULE,'Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
assert.ok(process.env.CHROMIUM_PATH,'Set CHROMIUM_PATH to an existing browser executable');
const {chromium} = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const {generateOfflineWorker} = await import(pathToFileURL(root + '/node_modules/@effortlessmetrics/astro-offline/src/integration.mjs'));
const fixture = await mkdtemp(join(process.env.FIXTURE_ROOT || tmpdir(),'still-failed-precache-'));
console.log('fixture',fixture);
const prefix = 'task33-reading-';
const receipts = {};
const workers = {};
for (const version of ['old', 'new']) {
  await writeFile(fixture + '/index.html', '<!doctype html><title>' + version + '</title><h1>' + version + '</h1>');
  await writeFile(fixture + '/asset.txt', version + ' asset');
  await writeFile(fixture + '/a-ok.txt', version + ' verified first');
  receipts[version] = await generateOfflineWorker(fixture, {cachePrefix:prefix, globPatterns:['*.html','*.txt'],maxBytes:10000,worker:{navigationStrategy:'cache-first'}});
  workers[version] = await readFile(fixture + '/sw.js');
}
console.log('workers generated');
let version = 'old';
let corrupt = false;
let served = [];
let observePartial;
let partial;
const server = createServer(async (req,res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  served.push({version,path,corrupt});
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type',path === '/sw.js' ? 'text/javascript' : path.endsWith('.txt') ? 'text/plain' : 'text/html');
  if (path === '/sw.js') return res.end(workers[version]);
  if (path === '/a-ok.txt') return res.end(version + ' verified first');
  if (path === '/asset.txt') {
    if (corrupt) partial=await observePartial();
    return res.end(corrupt ? 'corrupt asset' : version + ' asset');
  }
  res.end('<!doctype html><title>' + version + '</title><h1>' + version + '</h1>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
console.log('browser launched');
const watchdog=setTimeout(()=>{console.error('probe timed out');server.closeAllConnections();void browser.close();},90000);
const results = [];
try {
  for (const failed of [true,false]) {
    console.log('case starting',failed);version='old'; corrupt=false; served=[];
    const context=await browser.newContext();
    const page=await context.newPage();
    await page.goto(origin);console.log('page ready');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js'); await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('initial activation timeout')),15000))]);});
    await page.reload();
    await page.evaluate(async()=>{const c=await caches.open('foreign-cache');await c.put('/foreign',new Response('foreign preserved'));});
    const snapshot=()=>page.evaluate(async()=>Object.fromEntries(await Promise.all((await caches.keys()).map(async name=>{const c=await caches.open(name);return [name,await Promise.all((await c.keys()).map(async r=>[r.url,await (await c.match(r)).text()]))];}))));
    console.log('controlled');const before=await snapshot();
    assert.ok(before[prefix+receipts.old.revision]);
    version='new';corrupt=failed;
    observePartial=async()=>{
      for(let attempt=0;attempt<100;attempt++) {
        const cache=await snapshot();
        if(cache[prefix+receipts.new.revision]?.some(([url,body])=>new URL(url).pathname==='/a-ok.txt'&&body==='new verified first')) return cache;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw Error('new cache never contained verified first entry');
    };
    const state=await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      const found=new Promise(resolve=>registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker.addEventListener('statechange',()=>{if(['installed','redundant'].includes(worker.state))resolve(worker.state);});
      },{once:true}));
      await registration.update();
      return await Promise.race([found,new Promise((_,reject)=>setTimeout(()=>reject(Error('update state timeout')),20000))]);
    });
    console.log('update state',state);const after=await snapshot();
    let activated;
    assert.deepEqual(after[prefix+receipts.old.revision],before[prefix+receipts.old.revision]);
    assert.deepEqual(after['foreign-cache'],before['foreign-cache']);
    assert.equal(state,failed?'redundant':'installed');
    assert.equal(Object.hasOwn(after,prefix+receipts.new.revision),!failed);
    if(failed) assert.ok(partial[prefix+receipts.new.revision].length>0);
    assert.ok(served.some(r=>r.version==='new'&&r.path==='/asset.txt'));
    await context.setOffline(true);
    await page.goto(origin+'/index.html');
    assert.equal(await page.title(),'old');
    await context.setOffline(false);
    if (!failed) {
      await page.close();
      // Observe natural cleanup before opening a replacement controlled client.
      const workersByRevision=await Promise.all(context.serviceWorkers().map(async worker=>({worker,revision:await worker.evaluate(()=>REVISION).catch(()=>null)})));
      const newWorker=workersByRevision.find(value=>value.revision===receipts.new.revision)?.worker;
      assert.ok(newWorker,'new revision worker must be observable');
      let cleaned=false;
      for(let attempt=0;attempt<100;attempt++){
        if(await newWorker.evaluate(async oldName=>!(await caches.keys()).includes(oldName),prefix+receipts.old.revision)){cleaned=true;break;}
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      assert.ok(cleaned,'natural activation must remove old cache');
      const next=await context.newPage();
      await next.goto(origin);
      await next.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active?.state==='activated'&&!r.waiting;});
      const names=await next.evaluate(()=>caches.keys());
      assert.ok(!names.includes(prefix+receipts.old.revision));
      assert.ok(names.includes(prefix+receipts.new.revision));
      assert.ok(names.includes('foreign-cache'));
      activated=await next.evaluate(async()=>Object.fromEntries(await Promise.all((await caches.keys()).map(async name=>{const c=await caches.open(name);return [name,await Promise.all((await c.keys()).map(async r=>[r.url,await (await c.match(r)).text()]))];}))));
      await context.setOffline(true);
      await next.goto(origin+'/index.html');
      assert.equal(await next.title(),'new');
    }
    results.push({case:failed?'partially populated failed digest before activation':'successful update negative control',state,before,partial:failed?partial:undefined,after,activated,offlineTitle:failed?'old':'new',requests:served});
    await context.close();
  }
  const result={verified,checkout:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),observedAt:new Date().toISOString(),browser:browser.version(),runtime:process.version,workerSha256:createHash('sha256').update(await readFile(root+'/node_modules/@effortlessmetrics/astro-offline/src/worker.mjs')).digest('hex'),generatedWorkerSha256:Object.fromEntries(Object.entries(workers).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),receipts,results};
  await writeFile(fixture+'/evidence.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:true,fixture,browser:result.browser,runtime:result.runtime,receipts,cases:results.map(r=>({case:r.case,state:r.state}))},null,2));
} finally {clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}




