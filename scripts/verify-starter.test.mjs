import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, writeFile, rm, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import offline from 'astromache/static-offline';
import { site as defaults } from '../site.config.mjs';
import { verifyStarter } from './verify-starter.mjs';
import { htmlPages } from './site-output.mjs';
import { isCurrentPage } from '../src/navigation.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const production = process.env.PUBLIC_SITE_ENV === 'production';
const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
const demo = '<form data-starter-contact-example><fieldset disabled><legend>Example</legend><input name="message" disabled/><button type="button" disabled>Sending unavailable</button></fieldset></form>';

/** Let the loopback archive server respond while consumer commands run. */
function runAsync(root, command, args, env = environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: root, env, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', (bytes) => {stdout += bytes;});
    child.stderr.on('data', (bytes) => {stderr += bytes;});
    child.on('error', reject);
    child.on('close', (status) => resolve({status, stdout, stderr}));
  });
}

/** Run consumer CLI checks with the same indexing policy as the parent suite. */
function run(root, command, args) {
  const result = spawnSync(command, args, { cwd: root, env: environment, encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}
/** Include captured CLI output when an isolated consumer command fails. */
function succeeds(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }

/** Author consumer fixture routes without depending on editable sample pages. */
async function writePage(root, file, route, content) {
  const destination = join(root, 'src/pages', file);
  await mkdir(dirname(destination), { recursive: true });
  const layout = relative(dirname(destination), join(root, 'src/layouts/Site.astro')).replaceAll('\\', '/');
  await writeFile(destination, `---\nimport Site from '${layout}';\nimport Page from '@effortlessmetrics/still/page';\n---\n<Site title="Consumer page" description="Consumer-owned example" canonicalPath=${JSON.stringify(route)}><Page><h1>Owner content</h1>${content}</Page></Site>\n`);
}

test('current-page navigation matches same-origin page URLs', () => {
  const origin = 'https://consumer.example.invalid';
  for (const href of ['/sessions/', '/sessions', '/sessions/#schedule', '/sessions/?view=all',
    '/sessions/index.html', '/sessions/index.html#schedule', './index.html', '#schedule',
    origin + '/sessions/', '//consumer.example.invalid/sessions/index.html'])
    assert.equal(isCurrentPage(href, '/sessions/', origin), true, href);
  for (const href of ['/contact/', '/sessions-next/', '/Sessions/', '/sessions/index.html/',
    'https://other.example.invalid/sessions/', '//other.example.invalid/sessions/index.html',
    'http://consumer.example.invalid/sessions/', 'mailto:owner@example.invalid', 'http://['])
    assert.equal(isCurrentPage(href, '/sessions/', origin), false, href);
  assert.equal(isCurrentPage('/index.html#intro', '/', origin), true);
  assert.equal(isCurrentPage('/', '/index.html', origin), true);
});

test('starter regressions follow active bundled and registry dependency delivery', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'still-dependency-delivery-'));
  const receipt = {archives: {}};
  const archives = new Map();
  const requests = new Set();
  const server = createServer((request, response) => {
    const bytes = archives.get(request.url);
    if (request.method !== 'GET' || !bytes) {response.writeHead(404).end(); return;}
    requests.add(request.url);
    response.writeHead(200, {'Content-Type': 'application/octet-stream'}).end(bytes);
  });
  try {
    // Recreate test-only npm archives from the installed packages, without
    // requiring any historical receipt/vendor files. Serve solely on loopback;
    // these archives and registry resolutions are never publication evidence.
    const archiveDirectory = join(temporary, 'archives');
    await mkdir(archiveDirectory);
    for (const name of ['@effortlessmetrics/still', 'astromache', '@effortlessmetrics/astro-offline']) {
      const installed = JSON.parse(await readFile(join(source, 'node_modules', name, 'package.json')));
      assert.equal(installed.name, name);
      const packed = await runAsync(join(source, 'node_modules', name), 'npm',
        ['pack', '--ignore-scripts', '--json', '--pack-destination', archiveDirectory],
        {...environment, npm_config_cache: join(temporary, 'packing-cache')});
      succeeds(packed);
      const archive = JSON.parse(packed.stdout)[0];
      const bytes = await readFile(join(archiveDirectory, archive.filename));
      receipt.archives[name] = {file: archive.filename, version: installed.version,
        sha256: createHash('sha256').update(bytes).digest('hex')};
      archives.set('/' + archive.filename, bytes);
    }
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const registryOrigin = `http://127.0.0.1:${server.address().port}`;
    for (const mode of ['registry-only', 'mixed-relocated']) {
      await t.test(mode, async () => {
        requests.clear();
        const root = join(temporary, mode);
        await mkdir(root);
        for (const file of ['package.json', 'package-lock.json', 'licenses', 'public', 'scripts', 'tsconfig.json', 'src', 'astro.config.mjs', 'site.config.mjs'])
          await cp(join(source, file), join(root, file), {recursive: true});
        const manifest = JSON.parse(await readFile(join(root, 'package.json')));
        const lock = JSON.parse(await readFile(join(root, 'package-lock.json')));
        const activeReceipt = structuredClone(receipt);
        const expectedRequests = [];
        for (const [name, archive] of Object.entries(receipt.archives)) {
          const installed = lock.packages['node_modules/' + name];
          const bytes = archives.get('/' + archive.file.split('/').at(-1));
          assert.equal(installed.version, archive.version);
          installed.integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
          if (mode === 'mixed-relocated' && name !== '@effortlessmetrics/still') {
            const file = 'delivery/' + archive.file.split('/').at(-1);
            await mkdir(join(root, 'delivery'), {recursive: true});
            await writeFile(join(root, file), bytes);
            manifest.dependencies[name] = `file:${file}`;
            installed.resolved = `file:${file}`;
            activeReceipt.archives[name].file = file;
          } else {
            const path = '/' + archive.file.split('/').at(-1);
            manifest.dependencies[name] = archive.version;
            installed.resolved = registryOrigin + path;
            expectedRequests.push(path);
          }
          lock.packages[''].dependencies[name] = manifest.dependencies[name];
        }
        if (mode === 'mixed-relocated')
          await writeFile(join(root, 'STARTER-DELIVERY.json'), JSON.stringify(activeReceipt));
        await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
        await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
        const lockBefore = await readFile(join(root, 'package-lock.json'));
        // Separate cache forces these candidate archives to be fetched from the
        // loopback endpoint even if another qualification already cached them.
        const env = {...environment, npm_config_cache: join(temporary, mode + '-cache')};
        succeeds(await runAsync(root, 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], env));
        assert.deepEqual(await readFile(join(root, 'package-lock.json')), lockBefore, 'Frozen install must not rewrite the lock');
        assert.ok(expectedRequests.every((path) => requests.has(path)), 'Exact registry archives must actually be served');
        for (const name of Object.keys(receipt.archives)) {
          const original = join(source, 'node_modules', name);
          const installed = join(root, 'node_modules', name);
          const files = (await readdir(original, {recursive: true, withFileTypes: true})).filter((entry) => entry.isFile());
          const actual = (await readdir(installed, {recursive: true, withFileTypes: true})).filter((entry) => entry.isFile());
          const path = (entry, directory) => relative(directory, join(entry.parentPath, entry.name));
          assert.deepEqual(actual.map((entry) => path(entry, installed)).sort(), files.map((entry) => path(entry, original)).sort());
          for (const entry of files) {
            const file = path(entry, original);
            assert.deepEqual(await readFile(join(installed, file)), await readFile(join(original, file)), `${name}/${file}: installed candidate bytes`);
          }
        }
        for (const command of ['verify:licenses', 'check', 'build', 'verify:starter'])
          succeeds(await runAsync(root, 'npm', ['run', command], env));
        const childEnvironment = {...env};
        delete childEnvironment.NODE_TEST_CONTEXT;
        const result = await runAsync(root, process.execPath, ['--test', '--test-reporter=tap',
          '--test-name-pattern=isolated owner content', 'scripts/verify-starter.test.mjs'], childEnvironment);
        succeeds(result);
        assert.ok(Number(result.stdout.match(/# pass (\d+)/)?.[1]) > 1, 'The nested starter suite must execute its subtests');
        assert.match(result.stdout, /# fail 0\b/);
        assert.match(result.stdout, /# skipped 0\b/);
        assert.deepEqual(await readFile(join(root, 'package-lock.json')), lockBefore);
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, {recursive: true, force: true});
  }
});

test('isolated owner content, sitemap, output directory and negative controls', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'still-first-use-'));
  try {
    // Content fixtures are independent of the consumer's editable sample pages.
    for (const file of ['package.json', 'package-lock.json', 'licenses', 'public', 'scripts', 'tsconfig.json', 'src/layouts', 'src/styles', 'src/navigation.mjs'])
      await cp(join(source, file), join(root, file), { recursive: true });
    const application = JSON.parse(await readFile(join(root, 'package.json')));
    const bundled = Object.values(application.dependencies).filter((pin) => pin.startsWith('file:'));
    if (bundled.length) {
      await cp(join(source, 'STARTER-DELIVERY.json'), join(root, 'STARTER-DELIVERY.json'));
      for (const pin of bundled) {
        const file = pin.slice('file:'.length);
        await cp(join(source, file), join(root, file), {recursive: true});
      }
    }
    await cp(join(source, 'astro.config.mjs'), join(root, 'astro.base.mjs'));
    const outputConfig = (outDir) => writeFile(join(root, 'astro.config.mjs'), `import config from './astro.base.mjs';\nexport default {...config, outDir: ${JSON.stringify(outDir)}};\n`);
    await outputConfig('./dist/');
    const site = structuredClone(defaults);
    site.origin = 'https://consumer.example.invalid'; site.name = "O'Brien & Co"; site.themeStorageKey = 'consumer-theme';
    site.navigation = [{label: 'Sessions', href: '/sessions/index.html#schedule'}]; site.footer = {label: 'Contact the owner', href: '/contact/'};
    site.offline.cachePrefix = 'consumer-reading-'; site.offline.worker.navigationFallback = '/fallback/index.html';
    site.offline.excludedPages = ['/redirect/']; site.sitemapExcludedPaths = ['/fallback/', '/private/'];
    // This proves that sitemap bytes are finalized BEFORE offline selection.
    site.offline.globPatterns = ['**/*.{html,js,css,json,xml,svg,woff2,ttf}'];
    const saveSite = () => writeFile(join(root, 'site.config.mjs'), 'export const site = ' + JSON.stringify(site) + ';\n');
    await saveSite();
    const manifest = JSON.parse(await readFile(join(root, 'package.json')));
    manifest.private = false; manifest.license = 'MIT';
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json')));
    lock.packages[''].license = 'MIT';
    await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock));
    await writeFile(join(root, 'LICENSE'), 'Owner terms apply only to independently authored content. Reused upstream material keeps its separate grants and notices.\n');
    await writePage(root, 'index.astro', '/', demo);
    await writePage(root, 'workshops.astro', '/sessions/', '<p>A renamed service.</p>');
    await rename(join(root, 'src/pages/workshops.astro'), join(root, 'src/pages/sessions.astro'));
    for (const route of ['fallback', 'private', 'redirect', '404']) await writePage(root, route + '.astro', '/' + route + '/', '<p>Fixture content.</p>');
    await writePage(root, 'contact.astro', '/contact/', '<p><a href="mailto:owner@example.invalid">Email the owner</a></p><form id="owner-contact" action="/owner-contact" method="post"><input name="message"/><button type="submit">Send to owner</button></form><input form="owner-contact" name="outside-message"/><button form="owner-contact" type="submit">Send owner message</button>');
    await mkdir(join(root, 'src/pages/stories'), {recursive: true});
    await writeFile(join(root, 'src/pages/stories/[slug].astro'), `---\nimport Site from '../../layouts/Site.astro';\nimport Page from '@effortlessmetrics/still/page';\nexport function getStaticPaths() {return ['alpha','beta'].map(slug => ({params: {slug}}));}\n---\n<Site title="Story" description="Owner story" canonicalPath={'/stories/'+Astro.params.slug+'/'}><Page><h1>Owner story</h1></Page></Site>\n`);
    await cp(join(source, 'src/pages/robots.txt.ts'), join(root, 'src/pages/robots.txt.ts'));
    succeeds(run(root, 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']));
    succeeds(run(root, 'npm', ['run', 'check']));
    succeeds(run(root, 'npm', ['run', 'build']));
    const directory = join(root, 'dist');
    const options = { directory, site, production, root, base: '/' };

    await t.test('owner licensing, contact replacement and generated/renamed routes pass without template edits', async () => {
      succeeds(run(root, 'npm', ['run', 'verify:licenses']));
      succeeds(run(root, 'npm', ['run', 'verify:starter']));
      assert.equal(await verifyStarter(options), 10);
      const xml = await readFile(join(directory, 'sitemap.xml'), 'utf8');
      const locations = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
      assert.deepEqual(locations, ['/', '/contact/', '/sessions/', '/stories/alpha/', '/stories/beta/'].map((route) => site.origin + route));
      assert.ok(!xml.includes('/workshops/'));
      const worker = await readFile(join(directory, site.offline.workerFile), 'utf8');
      const digests = JSON.parse(worker.match(/const DIGESTS=(\{[^\n]+\});/)[1]);
      assert.equal(digests['/sitemap.xml'], createHash('sha256').update(xml).digest('hex'));
    });

    await t.test('direct verification requires an explicit effective base before reading output', async () => {
      const missingBase = {...options};
      Reflect.deleteProperty(missingBase, 'base');
      for (const omitted of [missingBase, {...options, base: undefined}, {...options, base: null},
        {...missingBase, directory: join(root, 'not-built')}])
        await assert.rejects(verifyStarter(omitted), /Supply the effective Astro base explicitly/);
      assert.equal(await verifyStarter({...options, base: '/'}), 10);
    });

    await t.test('non-root consumer configuration cannot build or certify retained root output', async () => {
      const configFile = join(root, 'astro.config.mjs');
      const configBefore = await readFile(configFile);
      const snapshot = async (target = directory) => {
        const files = [];
        for (const file of (await readdir(target, {recursive: true})).sort())
          if ((await stat(join(target, file))).isFile())
            files.push([file, createHash('sha256').update(await readFile(join(target, file))).digest('hex')]);
        return files;
      };
      const outputBefore = await snapshot();
      try {
        for (const base of ['/docs', '/docs/', '/nested/docs/']) {
          await writeFile(configFile, `import config from './astro.base.mjs';\nexport default {...config, base: ${JSON.stringify(base)}};\n`);
          const built = run(root, 'npm', ['run', 'build']);
          assert.notEqual(built.status, 0, 'Unsupported deployment must fail configuration');
          assert.match(built.stdout + built.stderr, /Still starter requires Astro base "\/"/);
          const verified = run(root, 'npm', ['run', 'verify:starter']);
          assert.notEqual(verified.status, 0, 'Existing root output cannot qualify a non-root consumer');
          assert.match(verified.stdout + verified.stderr, /Still starter requires Astro base "\/"/);
          await assert.rejects(verifyStarter({...options, base}), /non-root base .* is unsupported/);
          assert.deepEqual(await snapshot(), outputBefore, 'Rejection must precede output generation');
        }
        await writeFile(configFile, `import config from './astro.base.mjs';\nexport default {...config, integrations:[...config.integrations, {name:'owner-build-base', hooks:{'astro:config:setup':({command, updateConfig})=>{if(command==='build') updateConfig({base:'/docs/'});}}}]};\n`);
        for (const command of ['build', 'verify:starter']) {
          const result = run(root, 'npm', ['run', command]);
          assert.notEqual(result.status, 0, 'Integration-updated base must reject retained root output');
          assert.match(result.stdout + result.stderr, /Still starter requires Astro base "\/"/);
        }
        assert.deepEqual(await snapshot(), outputBefore, 'Integration-based rejection must preserve output');

        // A build-only setup hook can also restore root and select a different
        // output directory. Verification must use both final values, not raw config.
        await cp(directory, join(root, 'effective-output'), {recursive: true});
        await writeFile(configFile, `import config from './astro.base.mjs';\nlet calls = 0;\nexport default {...config, base:'/docs/', outDir:'./absent-output/', integrations:[...config.integrations, {name:'owner-root-output', hooks:{'astro:config:setup':({command, updateConfig})=>{if(command!=='build' || ++calls!==1) throw new Error('Owner setup must run once in build mode'); updateConfig({base:'/',outDir:new URL('./effective-output/', import.meta.url)});}}}]};\n`);
        succeeds(run(root, 'npm', ['run', 'verify:starter']));
        assert.deepEqual(await snapshot(join(root, 'effective-output')), outputBefore, 'Verification must preserve the effective output');
        assert.deepEqual(await snapshot(), outputBefore, 'Resolving build config must not regenerate output');
      } finally {
        await writeFile(configFile, configBefore);
      }
      succeeds(run(root, 'npm', ['run', 'build']));
      succeeds(run(root, 'npm', ['run', 'verify:starter']));
      assert.deepEqual(await snapshot(), outputBefore, 'Restored root build must preserve every emitted byte');
    });

    const changeHtml = async (dir, update) => {
      const file = join(dir, 'index.html'); await writeFile(file, update(await readFile(file, 'utf8')));
    };
    const changeReceipt = async (dir, remove) => {
      const file = join(dir, 'offline-receipt.json'); const receipt = JSON.parse(await readFile(file));
      receipt.urls = receipt.urls.filter((url) => url !== remove); await writeFile(file, JSON.stringify(receipt));
    };
    const refreshOffline = (dir) => offline(site.offline).hooks['astro:build:done']({dir:pathToFileURL(dir + '/')});
    const changeRuntime = async (dir, update) => {
      const file = join(dir, site.offline.workerFile);
      const worker = await readFile(file, 'utf8');
      const call = worker.match(/\nOfflineRuntime\.installWorker\((.*),REVISION,PREFIX\);\s*$/);
      assert.ok(call);
      const args = JSON.parse('[' + call[1] + ']');
      update(args);
      await writeFile(file, worker.replace(call[0], '\nOfflineRuntime.installWorker(' +
        JSON.stringify(args[0]) + ',' + JSON.stringify(args[1]) + ',REVISION,PREFIX);'));
    };
    const withOffline = (settings) => ({...site, offline:{...site.offline, ...settings}});
    const withWorker = (policy) => withOffline({worker:{...site.offline.worker, ...policy}});
    await t.test('explicitly disabled controls remain valid outside the fieldset and quoted values stay values', async () => {
      const dir = join(root, 'disabled-controls'); await cp(directory, dir, {recursive:true});
      await changeHtml(dir, (html) => html
        .replace('<form data-starter-contact-example', '<form title="action=/example > text" DATA-STARTER-CONTACT-EXAMPLE')
        .replace('</fieldset></form>', '</fieldset><INPUT title="example > text" DISABLED=""/><button disabled type="submit">Unavailable</button><textarea disabled></textarea></form>'));
      await refreshOffline(dir);
      assert.equal(await verifyStarter({...options, directory:dir}), 10);
      await rm(dir, {recursive:true});
    });
    await t.test('consumer demo button label, type and attribute order remain owner-controlled', async () => {
      const dir = join(root, 'owner-demo-button'); await cp(directory, dir, {recursive:true});
      await changeHtml(dir, (html) => html.replace(/<button type="button" disabled(?:="")?>Sending unavailable<\/button>/,
        '<BUTTON DISABLED aria-label="Contact is unavailable" type="submit">Owner contact unavailable</BUTTON>'));
      await refreshOffline(dir);
      assert.equal(await verifyStarter({...options, directory:dir}), 10);
      await rm(dir, {recursive:true});
    });
    await t.test('unmarked owner forms may retain noscript, select and template content', async () => {
      const dir = join(root, 'owner-noscript'); await cp(directory, dir, {recursive:true});
      await changeHtml(dir, (html) => {
        assert.match(html, /<form data-starter-contact-example[\s\S]*?<\/form>/);
        return html.replace(/<form data-starter-contact-example[\s\S]*?<\/form>/, '<form action="/owner-contact"><?owner-note?><!owner-note><!-- Owner comment --><noscript><p>Email the owner when scripting is unavailable.</p></noscript><select name="topic"><option>Owner topic</option></select><template><input name="future"></template><input name="message"><button type="submit">Send</button></form>');
      });
      await refreshOffline(dir);
      assert.equal(await verifyStarter({...options, directory:dir}), 10);
      await rm(dir, {recursive:true});
    });
    const controls = [
      ...['<!-->', '<!--->', '<!-- preceding comment --!>'].map((comment) => [
        `comment ending ${comment} before an enabled marked form`,
        (dir) => changeHtml(dir, (html) => html.replace('<form data-starter-contact-example', comment + '<form data-starter-contact-example')
          .replace('</fieldset></form>', '</fieldset><button type="submit">Send live</button></form>-->')),
        /every contact example control must be explicitly disabled/,
      ]),
      ['empty HTML output', async (dir) => {for (const page of await htmlPages(dir)) await rm(join(dir, page.file));}, /at least one site page/],
      ['wrong canonical URL', (dir) => changeHtml(dir, (html) => html.replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="https://wrong.example.invalid/">')), /canonical URL/],
      ['wrong configured identity', (dir) => changeHtml(dir, (html) => html.replace(/<title>[^<]*<\/title>/, '<title>Wrong owner</title>')), /configured title suffix/],
      ['wrong indexing policy', (dir) => changeHtml(dir, (html) => html.replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${production ? 'noindex,nofollow' : 'index,follow'}">`)), /indexing policy/],
      ['missing configured navigation', (dir) => changeHtml(dir, (html) => html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/, '')), /configured navigation/],
      ['missing current-page navigation state', (dir) => changeHtml(join(dir, 'sessions'), (html) => html.replace(' aria-current="page"', '')), /configured navigation and current page/],
      ['inactive navigation entry marked current', (dir) => changeHtml(dir, (html) => html.replace('<a href="/sessions/index.html#schedule">', '<a href="/sessions/index.html#schedule" aria-current="page">')), /configured navigation and current page/],
      ['stale sitemap route', async (dir) => {const file=join(dir,'sitemap.xml'); await writeFile(file,(await readFile(file,'utf8')).replace('</urlset>','<url><loc>'+site.origin+'/removed/</loc></url></urlset>'));}, /Sitemap must list exactly/],
      ['missing sitemap route', async (dir) => {const file=join(dir,'sitemap.xml'); await writeFile(file,(await readFile(file,'utf8')).replace(/<url><loc>[^<]*<\/loc><\/url>/,''));}, /Sitemap must list exactly/],
      ['incomplete sitemap document', async (dir) => {const file=join(dir,'sitemap.xml'); await writeFile(file,(await readFile(file,'utf8')).replace('</urlset>',''));}, /complete document/],
      ['enabled marked contact example', (dir) => changeHtml(dir, (html) => html.replace(/<fieldset disabled(?:="")?>/,'<fieldset>')), /contact example stays disabled/],
      ['missing disabled demo button', (dir) => changeHtml(dir, (html) => html.replace(/<button type="button" disabled(?:="")?>Sending unavailable<\/button>/, '')), /contact example must contain an explicitly disabled button/],
      ['enabled input outside the disabled fieldset', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input name="live"></form>')), /every contact example control must be explicitly disabled/],
      ['enabled submit outside the disabled fieldset', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><button type="submit">Send live</button></form>')), /every contact example control must be explicitly disabled/],
      ['enabled control in the first legend', (dir) => changeHtml(dir, (html) => html.replace('<legend>', '<legend><input name="live">')), /every contact example control must be explicitly disabled/],
      ['disabled text in an attribute value', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input title="a disabled > control" name="live"></form>')), /every contact example control must be explicitly disabled/],
      ['grave accent in an unquoted value hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input type="submit" data-x=foo`disabled></form>')), /every contact example control must be explicitly disabled/],
      ['equals sign in an unquoted value hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input type="submit" data-x=foo=disabled></form>')), /every contact example control must be explicitly disabled/],
      ['quote in an unquoted value hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input type="submit" data-x=foo"disabled"></form>')), /every contact example control must be explicitly disabled/],
      ['unmatched double quote in an unquoted value hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input type="submit" data-x=foo"disabled></form>')), /every contact example control must be explicitly disabled/],
      ['unmatched single quote in an unquoted value hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', "</fieldset><input type=\"submit\" data-x=foo'disabled></form>")), /every contact example control must be explicitly disabled/],
      ['non-ASCII space in an unquoted value hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input type="submit" data-x=foo\u00a0disabled></form>')), /every contact example control must be explicitly disabled/],
      ['enabled select in marked example', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><select name="live"><option>Live</option></select></form>')), /contact example cannot contain select/],
      ['enabled textarea in marked example', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><textarea name="live"></textarea></form>')), /every contact example control must be explicitly disabled/],
      ['external controls associated with a marked form ID', (dir) => changeHtml(dir, (html) => html.replace('<form data-starter-contact-example', '<form id="starter-demo" data-starter-contact-example').replace('</form>', '</form><input form="starter-demo" name="live"><button form="starter-demo" type="submit">Send live</button>')), /contact example has no form ID/],
      ['uppercase marker with enabled controls', (dir) => changeHtml(dir, (html) => html.replaceAll('data-starter-contact-example', 'DATA-STARTER-CONTACT-EXAMPLE').replaceAll(/ disabled(?:="")?/g, '')), /contact example stays disabled/],
      ['comment form terminator hiding an enabled control', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><!-- </form> --><input name="live"></form>')), /contact example cannot contain declaration/],
      ['processing-instruction bogus comment hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><?bogus </form>><button type="submit">Send live</button></form>')), /contact example cannot contain declaration/],
      ['declaration bogus comment hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><!bogus </form>><button type="submit">Send live</button></form>')), /contact example cannot contain declaration/],
      ['raw textarea form terminator hiding an enabled control', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><textarea disabled></form></textarea><input name="live"></form>')), /every contact example control must be explicitly disabled/],
      ['quoted form terminator hiding an enabled control', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input disabled title="</form>"><input name="live"></form>')), /every contact example control must be explicitly disabled/],
      ['nested form hiding an enabled control', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><form><input name="live"></form></form>')), /contact example cannot contain a nested form/],
      ['noscript form terminator hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><noscript></form></noscript><button type="submit">Send live</button></form>')), /contact example cannot contain noscript/],
      ['noscript native control in a marked example', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><noscript><input name="live"></noscript></form>')), /contact example cannot contain noscript/],
      ['select insertion mode hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><select disabled><option></form></option></select><button type="submit">Send live</button></form>')), /contact example cannot contain select/],
      ['template insertion mode hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><template></form></template><button type="submit">Send live</button></form>')), /contact example cannot contain template/],
      ['object scope hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><object></form></object><button type="submit">Send live</button></form>')), /contact example cannot contain object/],
      ['table scope hiding an enabled submit', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><table><tbody><tr><td></form></td></tr></tbody></table><button type="submit">Send live</button></form>')), /contact example cannot contain table/],
      ['example marker moved off the form', (dir) => changeHtml(dir, (html) => html.replace('<form data-starter-contact-example', '<form').replace('<fieldset disabled', '<fieldset data-starter-contact-example disabled')), /contact example marker must be on a form/],
      ['backend on marked contact example', (dir) => changeHtml(dir, (html) => html.replace('<form data-starter-contact-example','<form action="/api/contact" data-starter-contact-example')), /contact example has no backend/],
      ['missing OFL notice', (dir) => rm(join(dir,'fonts/OFL-Sans.txt')), {code:'ENOENT'}],
      ['missing font bytes', (dir) => rm(join(dir,'fonts/IBMPlexSans.ttf')), {code:'ENOENT'}],
      ['font removed from offline receipt', (dir) => changeReceipt(dir,'/fonts/IBMPlexSans.ttf'), /offline font delivery/],
      ['fallback removed from offline receipt', (dir) => changeReceipt(dir,'/fallback/'), /Configured offline fallback/],
      ['ordinary page removed from offline receipt', (dir) => changeReceipt(dir,'/sessions/'), /emitted HTML \/sessions\/ is missing from the offline precache/],
      ['sitemap-excluded page removed from offline receipt', (dir) => changeReceipt(dir,'/private/'), /emitted HTML \/private\/ is missing from the offline precache/],
      ['ordinary page removed only from runtime entries', (dir) => changeRuntime(dir, ([policy, entries]) => entries.splice(entries.findIndex((entry) => entry.url === '/sessions/'), 1)), /emitted HTML \/sessions\/ is missing from the offline precache/],
      ['extra JSON argument shifts actual runtime parameters', async (dir) => {
        const file = join(dir, site.offline.workerFile);
        const worker = await readFile(file, 'utf8');
        await writeFile(file, worker.replace(/,REVISION,PREFIX\);$/, ',null,REVISION,PREFIX);'));
      }, /Offline runtime must have exactly two JSON install arguments/],
      ['configured cache prefix changed without rebuilding', async () => {}, /Offline cache prefix must match configured/, withOffline({cachePrefix:'changed-consumer-reading-'})],
      ['receipt revision differs from actual worker revision', async (dir) => {
        const file = join(dir, 'offline-receipt.json');
        const receipt = JSON.parse(await readFile(file));
        receipt.revision = '0'.repeat(20); await writeFile(file, JSON.stringify(receipt));
      }, /Offline receipt revision must match worker revision/],
      ['stale runtime digest with valid diagnostic digest', (dir) => changeRuntime(dir, ([policy, entries]) => entries.find((entry) => entry.url === '/sessions/').digest = '0'.repeat(64)), /offline worker digest must match emitted HTML bytes for \/sessions\//],
      ['conflicting normalized runtime duplicate', (dir) => changeRuntime(dir, ([policy, entries]) => entries.push({url:'/x/../sessions/', digest:'0'.repeat(64)})), /Offline runtime URLs must be unique after normalization: \/sessions\//],
      ['extra diagnostic URL outside the runtime manifest', async (dir) => {
        const file = join(dir, site.offline.workerFile);
        const worker = await readFile(file, 'utf8');
        const digests = JSON.parse(worker.match(/const DIGESTS=(\{[^\n]+\});/)[1]);
        digests['/ghost.js'] = '0'.repeat(64);
        await writeFile(file, worker.replace(/const DIGESTS=(\{[^\n]+\});/, 'const DIGESTS=' + JSON.stringify(digests) + ';'));
      }, /Offline diagnostic digests must match the actual runtime manifest/],
      ['extra receipt URL outside the runtime manifest', async (dir) => {
        const file = join(dir, 'offline-receipt.json');
        const receipt = JSON.parse(await readFile(file));
        receipt.urls.push('/ghost.js'); await writeFile(file, JSON.stringify(receipt));
      }, /Offline receipt URLs must match the actual runtime manifest/],
      ['configured fallback changed without rebuilding', async () => {}, /Offline worker policy must match configured/, withWorker({navigationFallback:'/contact/index.html'})],
      ['configured exclusions changed without rebuilding', async () => {}, /Offline worker policy must match configured/, withWorker({excludedPrefixes:['/api/', '/private/']})],
      ['configured page exclusion changed without rebuilding', async () => {}, /Configured excluded page must not be precached: \/private\//, withOffline({excludedPages:['/redirect/', '/private/']})],
      ['runtime corpus contains an excluded endpoint', (dir) => changeRuntime(dir, ([policy]) => policy.excludedPrefixes = ['/api/', '/private/']), /Offline runtime corpus must not contain excluded endpoint: \/private\//, withWorker({excludedPrefixes:['/api/', '/private/']})],
      ['HTML changed after worker generation', (dir) => changeHtml(dir,(html) => html.replace('Owner content','Revised owner content')), /offline worker digest must match emitted HTML bytes for \//],
      ['stale canonical digest masked by a valid index alias', async (dir) => {
        const receiptFile=join(dir,'offline-receipt.json');
        const receipt=JSON.parse(await readFile(receiptFile));
        receipt.urls.push('/sessions/index.html'); await writeFile(receiptFile,JSON.stringify(receipt));
        const workerFile=join(dir,site.offline.workerFile);
        const worker=await readFile(workerFile,'utf8');
        const digests=JSON.parse(worker.match(/const DIGESTS=(\{[^\n]+\});/)[1]);
        digests['/sessions/index.html']=digests['/sessions/']; digests['/sessions/']='0'.repeat(64);
        await writeFile(workerFile,worker.replace(/const DIGESTS=(\{[^\n]+\});/,'const DIGESTS='+JSON.stringify(digests)+';'));
        await changeRuntime(dir, ([policy, entries]) => {
          const canonical = entries.find((entry) => entry.url === '/sessions/');
          entries.push({url:'/sessions/index.html', digest:canonical.digest});
          canonical.digest = '0'.repeat(64);
        });
      }, /offline worker digest must match emitted HTML bytes for \/sessions\//],
      ['missing complete Workbox notice', async (dir) => {const file=join(dir,site.offline.workerFile); await writeFile(file,(await readFile(file,'utf8')).replace(/\/\*! Workbox[\s\S]*?\*\//,''));}, /complete worker WORKBOX-LICENSE/],
      ['missing complete worker owner notice', async (dir) => {const file=join(dir,site.offline.workerFile); await writeFile(file,(await readFile(file,'utf8')).replace(/\/\*! @effortlessmetrics[\s\S]*?\*\//,''));}, /complete worker LICENSE-MIT/],
    ];
    for (const [index, [label, mutate, expected, config = site]] of controls.entries()) {
      await t.test('rejects ' + label, async () => {
        const dir = join(root, 'mutation-' + index); await cp(directory, dir, { recursive: true });
        await mutate(dir); await assert.rejects(verifyStarter({...options, directory: dir, site:config}), expected);
        await rm(dir, {recursive:true});
      });
    }

    await t.test('one-page site and custom string outDir pass; stale dist cannot hide missing actual output', async () => {
      await rm(join(root, 'src/pages'), {recursive:true});
      await writePage(root, 'index.astro', '/', '<p>Owner home and contact details.</p>');
      await cp(join(source, 'src/pages/robots.txt.ts'), join(root, 'src/pages/robots.txt.ts'));
      site.navigation = []; site.footer = {label:'Home',href:'/'};
      site.offline.worker.navigationFallback = '/'; site.offline.excludedPages = []; site.sitemapExcludedPaths = [];
      await saveSite();
      // Leave an otherwise valid one-page build in dist, then build elsewhere.
      succeeds(run(root, 'npm', ['run','build']));
      succeeds(run(root, 'npm', ['run','verify:starter']));
      await outputConfig('./consumer-output/');
      succeeds(run(root, 'npm', ['run','build']));
      const verified = run(root, 'npm', ['run','verify:starter']); succeeds(verified);
      assert.match(verified.stdout, /1 HTML files/);
      const xml = await readFile(join(root,'consumer-output/sitemap.xml'),'utf8');
      assert.ok(xml.includes('<loc>'+site.origin+'/</loc>'));
      await rm(join(root,'consumer-output'), {recursive:true});
      const missing = run(root, 'npm', ['run','verify:starter']);
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /ENOENT/); assert.match(missing.stderr, /consumer-output/);
    });
    await t.test('file output and public HTML retain sitemap basenames but fail incomplete offline coverage', async () => {
      const home = await readFile(join(root, 'dist/index.html'), 'utf8');
      for (const [file, route] of [['search-index.html', '/search-index.html'], ['nested/reindex.html', '/nested/reindex.html'], ['nested/index.html', '/nested/']]) {
        const destination = join(root, 'public', file);
        await mkdir(dirname(destination), {recursive:true});
        await writeFile(destination, home.replaceAll(`content="${site.origin}/"`, `content="${site.origin}${route}"`)
          .replaceAll(`href="${site.origin}/"`, `href="${site.origin}${route}"`));
      }
      await writePage(root, 'file-index.astro', '/file-index.html', '<p>Owner file-format route.</p>');
      await writeFile(join(root, 'astro.config.mjs'), "import config from './astro.base.mjs';\nexport default {...config, outDir:'./dist/', build:{...config.build, format:'file'}};\n");
      succeeds(run(root, 'npm', ['run','build']));
      const verified = run(root, 'npm', ['run','verify:starter']);
      assert.notEqual(verified.status, 0);
      assert.match(verified.stderr, /emitted HTML \/file-index\.html is missing from the offline precache/);
      const xml = await readFile(join(root, 'dist/sitemap.xml'), 'utf8');
      const locations = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
      assert.deepEqual(locations, ['/', '/file-index.html', '/nested/', '/nested/reindex.html', '/search-index.html'].map((route) => site.origin + route));
      const receipt = JSON.parse(await readFile(join(root, 'dist/offline-receipt.json')));
      assert.ok(receipt.urls.includes('/nested/'));
      assert.ok(!receipt.urls.includes('/file-index.html') && !receipt.urls.includes('/search-index.html') && !receipt.urls.includes('/nested/reindex.html'));
    });
    await t.test('owner can deliberately exclude standalone HTML from offline coverage', async () => {
      site.offline.excludedPages = ['/file-index.html','/search-index.html','/nested/reindex.html'];
      await saveSite();
      try {
        succeeds(run(root,'npm',['run','build']));
        const verified=run(root,'npm',['run','verify:starter']); succeeds(verified);
        assert.match(verified.stdout,/5 HTML files/);
        const xml=await readFile(join(root,'dist/sitemap.xml'),'utf8');
        assert.deepEqual([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]),[site.origin+'/',site.origin+'/nested/']);
      } finally {site.offline.excludedPages=[];await saveSite();}
    });
    await t.test('reserved filename sitemap URLs remain encoded while uncached HTML fails verification', async () => {
      const home = await readFile(join(root, 'dist/index.html'), 'utf8');
      const files = [['faq#old.html', '/faq%23old.html'], ['nested/questions?.html', '/nested/questions%3F.html'],
        ['space name.html', '/space%20name.html'], ['100%.html', '/100%25.html'], ['café.html', '/caf%C3%A9.html'], ['a%23b.html', '/a%2523b.html'], ['archive.html/index.html', '/archive.html/']];
      for (const [file, route] of files) {
        const destination = join(root, 'public', file);
        await mkdir(dirname(destination), {recursive:true});
        await writeFile(destination, home.replaceAll(`content="${site.origin}/"`, `content="${site.origin}${route}"`)
          .replaceAll(`href="${site.origin}/"`, `href="${site.origin}${route}"`));
      }
      succeeds(run(root, 'npm', ['run','build']));
      const verified = run(root, 'npm', ['run','verify:starter']);
      assert.notEqual(verified.status, 0);
      assert.match(verified.stderr, /emitted HTML .* is missing from the offline precache/);
      const xml = await readFile(join(root, 'dist/sitemap.xml'), 'utf8');
      const locations = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
      const routes = ['/', '/file-index.html', '/nested/', '/nested/reindex.html', '/search-index.html', ...files.map(([, route]) => route)].sort();
      assert.deepEqual(locations, routes.map((route) => site.origin + route));
      const receipt = JSON.parse(await readFile(join(root, 'dist/offline-receipt.json')));
      assert.ok(receipt.urls.includes('/archive.html/'));
      assert.ok(files.filter(([file]) => !file.endsWith('/index.html')).every(([,route]) => !receipt.urls.includes(route)));
    });
  } finally { await rm(root, {recursive:true,force:true}); }
});
