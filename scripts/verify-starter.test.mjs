import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { site as defaults } from '../site.config.mjs';
import { verifyStarter } from './verify-starter.mjs';
import { htmlPages } from './site-output.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const production = process.env.PUBLIC_SITE_ENV === 'production';
const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
const demo = '<form data-starter-contact-example><fieldset disabled><legend>Example</legend><input name="message" disabled/><button type="button" disabled>Sending unavailable</button></fieldset></form>';

function run(root, command, args) {
  const result = spawnSync(command, args, { cwd: root, env: environment, encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}
function succeeds(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }

async function writePage(root, file, route, content) {
  const destination = join(root, 'src/pages', file);
  await mkdir(dirname(destination), { recursive: true });
  const layout = relative(dirname(destination), join(root, 'src/layouts/Site.astro')).replaceAll('\\', '/');
  await writeFile(destination, `---\nimport Site from '${layout}';\nimport Page from '@effortlessmetrics/still/page';\n---\n<Site title="Consumer page" description="Consumer-owned example" canonicalPath=${JSON.stringify(route)}><Page><h1>Owner content</h1>${content}</Page></Site>\n`);
}

test('isolated owner content, sitemap, output directory and negative controls', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'still-first-use-'));
  try {
    // Content fixtures are independent of the consumer's editable sample pages.
    for (const file of ['package.json', 'package-lock.json', 'vendor', 'licenses', 'STARTER-DELIVERY.json', 'public', 'scripts', 'tsconfig.json', 'src/layouts', 'src/styles'])
      await cp(join(source, file), join(root, file), { recursive: true });
    await cp(join(source, 'astro.config.mjs'), join(root, 'astro.base.mjs'));
    const outputConfig = (outDir) => writeFile(join(root, 'astro.config.mjs'), `import config from './astro.base.mjs';\nexport default {...config, outDir: ${JSON.stringify(outDir)}};\n`);
    await outputConfig('./dist/');
    const site = structuredClone(defaults);
    site.origin = 'https://consumer.example.invalid'; site.name = "O'Brien & Co"; site.themeStorageKey = 'consumer-theme';
    site.navigation = [{label: 'Sessions', href: '/sessions/'}]; site.footer = {label: 'Contact the owner', href: '/contact/'};
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
    await writePage(root, 'contact.astro', '/contact/', '<p><a href="mailto:owner@example.invalid">Email the owner</a></p><form action="/owner-contact" method="post"><input name="message"/><button type="submit">Send to owner</button></form>');
    await mkdir(join(root, 'src/pages/stories'), {recursive: true});
    await writeFile(join(root, 'src/pages/stories/[slug].astro'), `---\nimport Site from '../../layouts/Site.astro';\nimport Page from '@effortlessmetrics/still/page';\nexport function getStaticPaths() {return ['alpha','beta'].map(slug => ({params: {slug}}));}\n---\n<Site title="Story" description="Owner story" canonicalPath={'/stories/'+Astro.params.slug+'/'}><Page><h1>Owner story</h1></Page></Site>\n`);
    await cp(join(source, 'src/pages/robots.txt.ts'), join(root, 'src/pages/robots.txt.ts'));
    succeeds(run(root, 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']));
    succeeds(run(root, 'npm', ['run', 'check']));
    succeeds(run(root, 'npm', ['run', 'build']));
    const directory = join(root, 'dist');
    const options = { directory, site, production, root };

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

    const changeHtml = async (dir, update) => {
      const file = join(dir, 'index.html'); await writeFile(file, update(await readFile(file, 'utf8')));
    };
    const changeReceipt = async (dir, remove) => {
      const file = join(dir, 'offline-receipt.json'); const receipt = JSON.parse(await readFile(file));
      receipt.urls = receipt.urls.filter((url) => url !== remove); await writeFile(file, JSON.stringify(receipt));
    };
    await t.test('explicitly disabled controls remain valid outside the fieldset and quoted values stay values', async () => {
      const dir = join(root, 'disabled-controls'); await cp(directory, dir, {recursive:true});
      await changeHtml(dir, (html) => html
        .replace('<form data-starter-contact-example', '<form title="action=/example > text" data-starter-contact-example')
        .replace('</fieldset></form>', '</fieldset><INPUT title="example > text" DISABLED=""/><button disabled type="submit">Unavailable</button><select disabled><option>Example</option></select><textarea disabled></textarea></form>'));
      assert.equal(await verifyStarter({...options, directory:dir}), 10);
      await rm(dir, {recursive:true});
    });
    const controls = [
      ['empty HTML output', async (dir) => {for (const page of await htmlPages(dir)) await rm(join(dir, page.file));}, /at least one site page/],
      ['wrong canonical URL', (dir) => changeHtml(dir, (html) => html.replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="https://wrong.example.invalid/">')), /canonical URL/],
      ['wrong configured identity', (dir) => changeHtml(dir, (html) => html.replace(/<title>[^<]*<\/title>/, '<title>Wrong owner</title>')), /configured title suffix/],
      ['wrong indexing policy', (dir) => changeHtml(dir, (html) => html.replace(/<meta name="robots"[^>]*>/, `<meta name="robots" content="${production ? 'noindex,nofollow' : 'index,follow'}">`)), /indexing policy/],
      ['missing configured navigation', (dir) => changeHtml(dir, (html) => html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/, '')), /configured navigation/],
      ['stale sitemap route', async (dir) => {const file=join(dir,'sitemap.xml'); await writeFile(file,(await readFile(file,'utf8')).replace('</urlset>','<url><loc>'+site.origin+'/removed/</loc></url></urlset>'));}, /Sitemap must list exactly/],
      ['missing sitemap route', async (dir) => {const file=join(dir,'sitemap.xml'); await writeFile(file,(await readFile(file,'utf8')).replace(/<url><loc>[^<]*<\/loc><\/url>/,''));}, /Sitemap must list exactly/],
      ['incomplete sitemap document', async (dir) => {const file=join(dir,'sitemap.xml'); await writeFile(file,(await readFile(file,'utf8')).replace('</urlset>',''));}, /complete document/],
      ['enabled marked contact example', (dir) => changeHtml(dir, (html) => html.replace(/<fieldset disabled(?:="")?>/,'<fieldset>')), /contact example stays disabled/],
      ['enabled input outside the disabled fieldset', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input name="live"></form>')), /every contact example control must be explicitly disabled/],
      ['enabled submit outside the disabled fieldset', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><button type="submit">Send live</button></form>')), /every contact example control must be explicitly disabled/],
      ['enabled control in the first legend', (dir) => changeHtml(dir, (html) => html.replace('<legend>', '<legend><input name="live">')), /every contact example control must be explicitly disabled/],
      ['disabled text in an attribute value', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><input title="a disabled > control" name="live"></form>')), /every contact example control must be explicitly disabled/],
      ['enabled select in marked example', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><select name="live"><option>Live</option></select></form>')), /every contact example control must be explicitly disabled/],
      ['enabled textarea in marked example', (dir) => changeHtml(dir, (html) => html.replace('</fieldset></form>', '</fieldset><textarea name="live"></textarea></form>')), /every contact example control must be explicitly disabled/],
      ['backend on marked contact example', (dir) => changeHtml(dir, (html) => html.replace('<form data-starter-contact-example','<form action="/api/contact" data-starter-contact-example')), /contact example has no backend/],
      ['missing OFL notice', (dir) => rm(join(dir,'fonts/OFL-Sans.txt')), {code:'ENOENT'}],
      ['missing font bytes', (dir) => rm(join(dir,'fonts/IBMPlexSans.ttf')), {code:'ENOENT'}],
      ['font removed from offline receipt', (dir) => changeReceipt(dir,'/fonts/IBMPlexSans.ttf'), /offline font delivery/],
      ['fallback removed from offline receipt', (dir) => changeReceipt(dir,'/fallback/'), /Configured offline fallback/],
      ['missing complete Workbox notice', async (dir) => {const file=join(dir,site.offline.workerFile); await writeFile(file,(await readFile(file,'utf8')).replace(/\/\*! Workbox[\s\S]*?\*\//,''));}, /complete worker WORKBOX-LICENSE/],
      ['missing complete worker owner notice', async (dir) => {const file=join(dir,site.offline.workerFile); await writeFile(file,(await readFile(file,'utf8')).replace(/\/\*! @effortlessmetrics[\s\S]*?\*\//,''));}, /complete worker LICENSE-MIT/],
    ];
    for (const [index, [label, mutate, expected]] of controls.entries()) {
      await t.test('rejects ' + label, async () => {
        const dir = join(root, 'mutation-' + index); await cp(directory, dir, { recursive: true });
        await mutate(dir); await assert.rejects(verifyStarter({...options, directory: dir}), expected);
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
  } finally { await rm(root, {recursive:true,force:true}); }
});
