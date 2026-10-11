import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateConfig } from 'astro/config';
import { canonicalRoute, htmlPages, sitemapRoutes } from './site-output.mjs';

const escapeText = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const escapeXml = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

export async function verifyStarter({ directory, site, production, root = process.cwd() }) {
  const read = (file) => readFile(join(directory, file), 'utf8');
  const origin = new URL(site.origin).origin;
  const robots = production ? 'index,follow' : 'noindex,nofollow';
  const pages = await htmlPages(directory);
  assert.ok(pages.length > 0, 'Build at least one site page before verifying its output');
  for (const {file, route, html} of pages) {
    assert.ok(html.includes(` | ${escapeText(site.name)}</title>`), `${file}: configured title suffix`);
    assert.ok(html.includes(`href="/">${escapeText(site.name)}</a>`), `${file}: configured brand`);
    assert.ok(html.includes(`data-theme-key="${escapeAttribute(site.themeStorageKey)}"`), `${file}: configured theme key`);
    assert.ok(html.includes(`<meta name="robots" content="${robots}">`), `${file}: indexing policy`);
    assert.ok(html.includes(`<link rel="canonical" href="${escapeAttribute(origin + route)}">`), `${file}: canonical URL`);
    assert.ok(html.includes(`<meta property="og:url" content="${escapeAttribute(origin + route)}">`), `${file}: Open Graph URL`);
    const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    for (const link of site.navigation)
      assert.ok(navigation.includes(`<a href="${escapeAttribute(link.href)}">${escapeText(link.label)}</a>`), `${file}: configured navigation`);
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? '';
    assert.ok(footer.includes(`<a href="${escapeAttribute(site.footer.href)}">${escapeText(site.footer.label)}</a>`), `${file}: configured footer`);

    if (html.includes('data-starter-contact-example')) {
      const forms = [...html.matchAll(/<form\b(?=[^>]*\bdata-starter-contact-example\b)[^>]*>[\s\S]*?<\/form>/g)];
      assert.ok(forms.length > 0, `${file}: contact example must be a form`);
      for (const [form] of forms) {
        assert.match(form, /<fieldset\s+disabled(?:="")?>/, `${file}: contact example stays disabled`);
        assert.match(form, /<button\s+type="button"\s+disabled(?:="")?>Sending unavailable<\/button>/);
        assert.doesNotMatch(form, /<form\b[^>]*\baction=/, `${file}: contact example has no backend`);
      }
    }
  }
  assert.equal(await read('robots.txt'), production
    ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n');
  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, /<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.match(sitemap, /<\/urlset>\s*$/, 'Sitemap must be a complete document');
  const locations = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]).sort();
  assert.deepEqual(locations, sitemapRoutes(pages, site).map((route) => escapeXml(origin + route)).sort(),
    'Sitemap must list exactly the emitted site routes, excluding configured fallback/redirect/private paths');

  const receipt = JSON.parse(await read('offline-receipt.json'));
  assert.ok(receipt.urls.includes(canonicalRoute(site.offline.worker.navigationFallback)), 'Configured offline fallback is precached');
  const worker = await read(site.offline.workerFile);
  for (const notice of ['WORKBOX-LICENSE', 'LICENSE-MIT']) {
    const text = await readFile(join(root, 'node_modules/@effortlessmetrics/astro-offline', notice), 'utf8');
    assert.ok(worker.includes(text.trim()), `Keep complete worker ${notice} notice`);
  }
  for (const [font, notice] of [
    ['IBMPlexSans.ttf', 'OFL-Sans.txt'], ['IBMPlexMono-Regular.ttf', 'OFL-Mono.txt'],
  ]) {
    assert.ok(receipt.urls.includes(`/fonts/${font}`), `${font}: offline font delivery`);
    assert.ok((await readFile(join(directory, 'fonts', font))).length > 0, `${font}: emitted font bytes`);
    assert.match(await read(`fonts/${notice}`), /SIL OPEN FONT LICENSE Version 1\.1/);
  }
  assert.ok(receipt.urls.some((url) => /^\/_astro\/prefetch\..*\.js$/.test(url)), 'Native prefetch is included');
  return pages.length;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const root = process.cwd();
  const {default: rawConfig} = await import(pathToFileURL(join(root, 'astro.config.mjs')));
  const config = await validateConfig(rawConfig, root, 'build');
  const {site} = await import(pathToFileURL(join(root, 'site.config.mjs')));
  const production = process.env.PUBLIC_SITE_ENV === 'production';
  const count = await verifyStarter({directory: fileURLToPath(config.outDir), site, production, root});
  console.log(`Starter output passes: ${count} HTML files, ${production ? 'production' : 'preview'} indexing, configured identity/links/sitemap, marked contact examples, offline fallback/fonts and notices.`);
}
