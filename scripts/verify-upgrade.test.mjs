import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, writeFile, rm, statfs, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { site as defaults } from '../site.config.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Snapshot all editable source/delivery bytes, without generated/install output.
async function snapshot(root, prefix = '') {
  const files = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    if (['node_modules', 'owner-output', '.astro'].includes(entry.name)) continue;
    assert.ok(!entry.isSymbolicLink(), 'No source links in disposable consumer');
    const file = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, await snapshot(root, file + '/'));
    else files[file] = digest(await readFile(join(root, file)));
  }
  return files;
}

test('starter tooling migration preserves owner source and hashes the final sitemap', { timeout: 180_000 }, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'still-config-upgrade-'));
  const root = join(temporary, 'consumer');
  const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1',
    npm_config_cache: join(temporary, 'cache') };
  function run(args) {
    const result = spawnSync('npm', ['--cache', environment.npm_config_cache, ...args], { cwd: root, env: environment,
      encoding: 'utf8', timeout: 60_000 });
    assert.ifError(result.error);
    return result;
  }
  const succeeds = (result) => assert.equal(result.status, 0, result.stdout + result.stderr);
  const treeBytes = async (directory) => {
    let bytes = 0;
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const file = join(directory, entry.name);
      bytes += entry.isDirectory() ? await treeBytes(file) : (await lstat(file)).size;
    }
    return bytes;
  };
  const census = async (stage) => {
    const space = await statfs(root);
    t.diagnostic(`${stage}: fixture/cache ${await treeBytes(temporary)} bytes; filesystem available ${space.bavail * space.bsize} bytes`);
  };
  try {
    await mkdir(root);
    for (const file of ['package.json', 'package-lock.json', 'STARTER-DELIVERY.json',
      'vendor', 'licenses', 'public', 'src', 'scripts', 'tsconfig.json'])
      await cp(join(source, file), join(root, file), { recursive: true });

    // A real pre-current-state adapter: no helper import or navigation slot.
    // Keep owner content, control IDs and styles through the bounded migration.
    const layoutFile = join(root, 'src/layouts/Site.astro');
    const legacyLayout = (await readFile(join(source, 'scripts/fixtures/navigation-legacy-site.astro.txt'), 'utf8'))
      .replaceAll('site-theme-toggle', 'owner-theme-toggle')
      .replace('<slot/>', '<slot/>\n<p class="owner-layout-note">Owner layout note</p>');
    assert.ok(legacyLayout.includes('links={site.navigation}'));
    assert.ok(!legacyLayout.includes('isCurrentPage'));
    await writeFile(layoutFile, legacyLayout);
    await rm(join(root, 'src/navigation.mjs'));
    const styleFile = join(root, 'src/styles/starter.css');
    const currentRule = 'nav a[aria-current="page"]{text-decoration:underline;}\n';
    const currentStyles = await readFile(styleFile, 'utf8');
    assert.ok(currentStyles.includes(currentRule));
    const legacyStyles = currentStyles.replace(currentRule, '') +
      '\n.owner-layout-note{color:var(--text);}\n';
    await writeFile(styleFile, legacyStyles);

    // Exercise a real independent bundled Still version update as well as the
    // optional tooling adoption. Authenticate the new bytes against its receipt;
    // the retained 0.2.1 archive supplies the disposable prior-version control.
    const name = '@effortlessmetrics/still';
    const receipt = JSON.parse(await readFile(join(root, 'STARTER-DELIVERY.json')));
    const accepted = structuredClone(receipt.archives[name]);
    const acceptedComparison = structuredClone(receipt.sourceComparisons[name]);
    assert.equal(digest(await readFile(join(root, accepted.file))), accepted.sha256);
    assert.equal(accepted.version, '0.2.2', 'Update this historical migration control for a new accepted delivery');
    const oldFile = 'vendor/effortlessmetrics-still-0.2.1.tgz';
    const oldBytes = await readFile(join(root, oldFile));
    receipt.archives[name] = {file: oldFile, version: '0.2.1', sha256: digest(oldBytes)};
    delete receipt.sourceComparisons[name];
    const manifest = JSON.parse(await readFile(join(root, 'package.json')));
    const originalDependencies = structuredClone(manifest.dependencies);
    manifest.dependencies[name] = 'file:' + oldFile;
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json')));
    lock.packages[''].dependencies[name] = manifest.dependencies[name];
    Object.assign(lock.packages['node_modules/' + name], {version: '0.2.1',
      resolved: manifest.dependencies[name],
      integrity: 'sha512-' + createHash('sha512').update(oldBytes).digest('base64')});
    const writeJSON = (file, value) => writeFile(join(root, file), JSON.stringify(value, null, 2) + '\n');
    await writeJSON('package.json', manifest);
    await writeJSON('package-lock.json', lock);
    await writeJSON('STARTER-DELIVERY.json', receipt);

    // Shape of the pre-emitted-sitemap standalone config at e2261fb, with
    // real owner customization instead of restoring neutral template defaults.
    const site = structuredClone(defaults);
    site.origin = 'https://owner.example';
    site.name = 'Owner & Partners';
    site.themeStorageKey = 'owner-theme';
    site.navigation = [{ label: 'Owner journal', href: '/journal/' }];
    site.footer = { label: 'Owner contact', href: '/contact/' };
    site.sitemapExcludedPaths = ['/owner-note/'];
    site.offline.cachePrefix = 'owner-reading-';
    site.offline.workerFile = 'owner-worker.js';
    site.offline.globPatterns = ['**/*.{html,js,css,json,svg,woff2,ttf,xml}'];
    site.offline.maxResources = 125;
    site.offline.maxBytes = 6 * 1024 * 1024;
    site.offline.worker.excludedPrefixes = ['/api/', '/private/'];
    const writeSite = () => writeFile(join(root, 'site.config.mjs'),
      'export const site = ' + JSON.stringify(site, null, 2) + ';\n');
    await writeSite();
    await writeFile(join(root, 'owner-integration.mjs'), `import {writeFile} from 'node:fs/promises';
export default () => ({name:'owner-integration',hooks:{'astro:build:done':async ({dir}) => {
  await writeFile(new URL('owner-build.txt', dir), 'owner integration retained');
}}});\n`);
    const legacyConfig = `import {defineConfig} from 'astro/config';
import offline from 'astromache/static-offline';
import {site} from './site.config.mjs';
import owner from './owner-integration.mjs';
export default defineConfig({site:site.origin,output:'static',outDir:'./owner-output',
  prefetch:{prefetchAll:false},integrations:[owner(),offline(site.offline)]});\n`;
    await writeFile(join(root, 'astro.config.mjs'), legacyConfig);
    await writeFile(join(root, 'src/pages/sitemap.xml.ts'), `import type {APIContext} from 'astro';
export function GET({site}:APIContext) {return new Response(
  '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  ['/','/workshops/','/project-support/','/contact/'].map(route => '<url><loc>'+site!.origin+route+'</loc></url>').join('') + '</urlset>');}\n`);
    for (const [file, route] of [['journal.astro', '/journal/'], ['owner-note.astro', '/owner-note/']]) {
      await writeFile(join(root, 'src/pages', file), `---
import Site from '../layouts/Site.astro';
import Page from '@effortlessmetrics/still/page';
---
<Site title="Owner record" description="Owner prose" canonicalPath="${route}"><Page><h1>Owner-authored content</h1></Page></Site>\n`);
    }
    await writeFile(join(root, 'public/owner.txt'), 'Owner asset: retain exact bytes\n');
    const before = await snapshot(root);
    await census('before install');
    succeeds(run(['ci', '--ignore-scripts']));
    succeeds(run(['run', 'verify:licenses']));
    succeeds(run(['install', '--save-exact', '--ignore-scripts', name + '@file:' + accepted.file]));
    receipt.archives[name] = accepted;
    receipt.sourceComparisons[name] = acceptedComparison;
    await writeJSON('STARTER-DELIVERY.json', receipt);
    succeeds(run(['ci', '--ignore-scripts']));
    const upgradedManifest = JSON.parse(await readFile(join(root, 'package.json')));
    assert.deepEqual(upgradedManifest.dependencies, originalDependencies, 'Only Still returns to its accepted new pin');
    assert.equal(JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'))).version, accepted.version);
    succeeds(run(['run', 'verify:licenses']));
    const afterLibraryUpdate = await snapshot(root);
    assert.deepEqual(Object.keys(before).filter((file) => before[file] !== afterLibraryUpdate[file]).sort(),
      ['STARTER-DELIVERY.json', 'package-lock.json', 'package.json'], 'Library update preserves all owner source/config');
    assert.deepEqual(Object.keys(afterLibraryUpdate).filter((file) => !(file in before)), []);
    succeeds(run(['run', 'build']));
    const missingHelper = run(['run', 'verify:starter']);
    assert.notEqual(missingHelper.status, 0, 'Tooling adoption needs its reviewed helper');
    assert.match(missingHelper.stdout + missingHelper.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.match(missingHelper.stdout + missingHelper.stderr, /navigation\.mjs/);
    await cp(join(source, 'src/navigation.mjs'), join(root, 'src/navigation.mjs'));
    const legacyAdapter = run(['run', 'verify:starter']);
    assert.notEqual(legacyAdapter.status, 0, 'A helper alone does not migrate the owner adapter');
    assert.match(legacyAdapter.stdout + legacyAdapter.stderr, /configured navigation and current page/);
    const navigationSlot = '<Fragment slot="navigation">' +
      "{site.navigation.map(link => <a href={link.href} aria-current={isCurrentPage(link.href, canonicalPath, origin) ? 'page' : undefined}>{link.label}</a>)}</Fragment>\n";
    const migratedLayout = legacyLayout
      .replace("import {site} from '../../site.config.mjs';",
        "import {site} from '../../site.config.mjs';\nimport {isCurrentPage} from '../navigation.mjs';")
      .replace(' links={site.navigation}', '')
      .replace('<svg slot="theme"', navigationSlot + '<svg slot="theme"');
    await writeFile(layoutFile, migratedLayout);
    await writeFile(styleFile, legacyStyles + currentRule);
    succeeds(run(['run', 'build']));
    const legacy = run(['run', 'verify:starter']);
    assert.notEqual(legacy.status, 0, 'Legacy sitemap must fail current tooling');
    assert.match(legacy.stdout + legacy.stderr, /Sitemap must list exactly the emitted site routes/);
    t.diagnostic('Missing helper and historical adapter fail independently; scoped adapter/style migration preserves owner content and theme IDs');
    t.diagnostic('Still 0.2.1 to 0.2.2 archive update: frozen install/license/build pass; legacy sitemap still rejects missing owner route');

    // Apply only the documented migration. All other Astro/site options remain.
    const migratedConfig = legacyConfig
      .replace("import offline", "import sitemap from './scripts/site-output.mjs';\nimport offline")
      .replace('owner(),offline(site.offline)', 'owner(),sitemap(site),offline(site.offline)');
    await writeFile(join(root, 'astro.config.mjs'), migratedConfig);
    site.sitemapExcludedPaths.push('/offline/');
    await writeSite();
    await rm(join(root, 'src/pages/sitemap.xml.ts'));
    succeeds(run(['run', 'check']));
    succeeds(run(['run', 'build']));
    succeeds(run(['run', 'verify:starter']));
    const output = join(root, 'owner-output');
    const sitemap = await readFile(join(output, 'sitemap.xml'));
    assert.match(sitemap.toString(), /https:\/\/owner.example\/journal\//);
    assert.ok(!sitemap.toString().includes('/owner-note/'));
    assert.ok(!sitemap.toString().includes('/offline/'));
    const sitemapDigest = async (required = true) => {
      const worker = await readFile(join(output, site.offline.workerFile), 'utf8');
      const [, argumentsJSON] = worker.match(/\nOfflineRuntime\.installWorker\((.*),REVISION,PREFIX\);\s*$/);
      const [, entries] = JSON.parse('[' + argumentsJSON + ']');
      const entry = entries.find(({ url }) => url === '/sitemap.xml');
      if (required) assert.ok(entry, 'Owner XML glob must select the final sitemap');
      assert.ok(entries.some(({ url }) => url === '/owner-note/'), 'Sitemap exclusion does not waive offline coverage');
      return entry?.digest;
    };
    assert.equal(await sitemapDigest(), digest(sitemap), 'Worker hashes final sitemap');
    assert.equal(await readFile(join(output, 'owner-build.txt'), 'utf8'), 'owner integration retained');
    assert.equal(await readFile(join(output, 'owner.txt'), 'utf8'), 'Owner asset: retain exact bytes\n');
    const after = await snapshot(root);
    assert.deepEqual(Object.keys(before).filter((file) => before[file] !== after[file]).sort(),
      ['STARTER-DELIVERY.json', 'astro.config.mjs', 'package-lock.json', 'package.json', 'site.config.mjs',
        'src/layouts/Site.astro', 'src/pages/sitemap.xml.ts', 'src/styles/starter.css']);
    assert.deepEqual(Object.keys(after).filter((file) => !(file in before)), ['src/navigation.mjs']);
    assert.equal(await readFile(layoutFile, 'utf8'), migratedLayout);
    assert.equal(await readFile(styleFile, 'utf8'), legacyStyles + currentRule);
    const journal = await readFile(join(output, 'journal/index.html'), 'utf8');
    assert.ok(journal.includes('id="owner-theme-toggle"'));
    assert.ok(journal.includes('Owner layout note'));
    assert.ok(journal.includes('<a href="/journal/" aria-current="page">Owner journal</a>'));
    // Prove the merge did not reset nested offline policy, identity or exclusions.
    const actual = (await import(pathToFileURL(join(root, 'site.config.mjs')))).site;
    assert.deepEqual(actual, site);
    t.diagnostic('Migrated config/adapter: check/build/verification pass; only reviewed library records, configs, helper, bounded adapter/style edits and retired sitemap source change');

    // Reverse ordering must omit the final sitemap digest, even when HTML checks
    // alone pass. This discriminates the documented build-hook ordering rule.
    await writeFile(join(root, 'astro.config.mjs'), migratedConfig
      .replace('sitemap(site),offline(site.offline)', 'offline(site.offline),sitemap(site)'));
    succeeds(run(['run', 'build']));
    assert.notEqual(await sitemapDigest(false), digest(await readFile(join(output, 'sitemap.xml'))),
      'Reversed integration order must omit the final XML bytes');
    t.diagnostic('Reversed order: final sitemap is absent from worker corpus');
    await census('after controls');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
