import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { site } from '../site.config.mjs';

// Small emitted-output smoke check; browser/runtime qualification belongs upstream.
const dist = join(process.cwd(), 'dist');
const read = (file) => readFile(join(dist, file), 'utf8');
const escapeText = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const origin = new URL(site.origin).origin;
const production = process.env.PUBLIC_SITE_ENV === 'production';
const robots = production ? 'index,follow' : 'noindex,nofollow';
const pages = (await readdir(dist, { recursive: true })).filter((file) => file.endsWith('.html'));
assert.ok(pages.length >= 6, 'Build the starter before verifying its output');
for (const file of pages) {
  const html = await read(file);
  const path = file.replaceAll('\\', '/');
  const route = path === '404.html' ? '/404/' : '/' + path.replace(/index\.html$/, '');
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
}
assert.equal(await read('robots.txt'), production
  ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n');
const contact = await read('contact/index.html');
assert.match(contact, /<fieldset\s+disabled(?:="")?>/, 'Contact example stays disabled');
assert.match(contact, /<button\s+type="button"\s+disabled(?:="")?>Sending unavailable<\/button>/);
assert.doesNotMatch(contact, /<form\b[^>]*\baction=/, 'No contact backend is configured');

const receipt = JSON.parse(await read('offline-receipt.json'));
const worker = await read(site.offline.workerFile);
assert.match(worker, /Workbox[^\n]*MIT license/, 'Keep bundled Workbox notices');
for (const [font, notice] of [
  ['IBMPlexSans.ttf', 'OFL-Sans.txt'], ['IBMPlexMono-Regular.ttf', 'OFL-Mono.txt'],
]) {
  assert.ok(receipt.urls.includes(`/fonts/${font}`), `${font}: offline font delivery`);
  assert.match(await read(`fonts/${notice}`), /SIL OPEN FONT LICENSE Version 1\.1/);
}
assert.ok(receipt.urls.some((url) => /^\/_astro\/prefetch\..*\.js$/.test(url)), 'Native prefetch is included');
console.log(`Starter output passes: ${pages.length} HTML files, ${production ? 'production' : 'preview'} indexing, configured identity/links, disabled contact, offline fonts and notices.`);
