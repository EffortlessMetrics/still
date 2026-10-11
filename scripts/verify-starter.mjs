import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateConfig } from 'astro/config';
import { canonicalRoute, htmlPages, sitemapRoutes } from './site-output.mjs';

/** Match the starter's emitted text encoding for configured consumer labels. */
const escapeText = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
/** Match double-quoted HTML attribute encoding for configuration values. */
const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
/** Encode expected sitemap locations for comparison with generated XML text. */
const escapeXml = (value) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

/** Read attribute names while consuming complete quoted/unquoted HTML values. */
// Unquoted values end at ASCII whitespace or >. Parse-error punctuation such
// as a grave accent or equals sign remains value text in the HTML tokenizer.
const attributeNames = (text) => new Set([...text.matchAll(/([^\t\n\f\r />][^\t\n\f\r />=]*)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"[^"]*"|'[^']*'|[^\t\n\f\r >]+))?/g)]
  .map((match) => match[1].toLowerCase()));

/** Locate static tags/declarations using value boundaries, omitting raw text. */
function markupTags(html) {
  const tags = [];
  const open = /<!--[\s\S]*?-->|<!|<\?|<(\/?)([A-Za-z][^\t\n\f\r />]*)/g;
  for (let match; (match = open.exec(html));) {
    if (match[0].startsWith('<!') || match[0] === '<?') {
      if (!match[0].startsWith('<!--') || match[0] === '<!') {
        const end = html.indexOf('>', open.lastIndex);
        open.lastIndex = end < 0 ? html.length : end + 1;
      }
      tags.push({name:'declaration', closing:false, start:match.index, end:open.lastIndex, attributes:new Set()});
      continue;
    }
    let position = open.lastIndex;
    const attributeStart = position;
    let quote, beforeValue = false, unquotedValue = false;
    for (; position < html.length; position++) {
      const character = html[position];
      if (quote) { if (character === quote) quote = undefined; continue; }
      if (unquotedValue && /[\t\n\f\r ]/.test(character)) unquotedValue = false;
      if (character === '>') break;
      if (unquotedValue) continue;
      if (beforeValue) {
        if (/[\t\n\f\r ]/.test(character)) continue;
        if (character === '"' || character === "'") quote = character;
        else unquotedValue = true;
        beforeValue = false;
      } else if (character === '=') beforeValue = true;
    }
    if (position === html.length) break;
    const name = match[2].toLowerCase();
    tags.push({name, closing: Boolean(match[1]), start: match.index, end: position + 1,
      attributes: attributeNames(html.slice(attributeStart, position))});
    open.lastIndex = position + 1;
    if (!match[1] && /^(script|style|textarea|title|xmp|iframe|noembed|noframes)$/.test(name)) {
      const close = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, 'gi');
      close.lastIndex = open.lastIndex;
      open.lastIndex = close.exec(html)?.index ?? html.length;
    }
  }
  return tags;
}

/** Validate static marked-demo markup; owner service/runtime checks stay separate. */
function verifyContactExamples(html, file) {
  const tags = markupTags(html);
  const demoElements = new Set('fieldset legend label input button textarea a abbr address b blockquote br code dd del div dl dt em h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q s samp small span strong sub sup time u ul var wbr'.split(' '));
  const markers = tags.filter((tag) => tag.attributes.has('data-starter-contact-example'));
  assert.ok(markers.every((tag) => tag.name === 'form' && !tag.closing), `${file}: contact example marker must be on a form`);
  for (const marker of markers) {
    const end = tags.find((tag) => tag.start > marker.start && tag.name === 'form' && tag.closing);
    assert.ok(end, `${file}: contact example must have a complete form`);
    const inside = tags.filter((tag) => tag.start > marker.start && tag.start < end.start && !tag.closing);
    assert.ok(!inside.some((tag) => tag.name === 'form'), `${file}: contact example cannot contain a nested form`);
    const unsupported = inside.find((tag) => !demoElements.has(tag.name));
    assert.ok(!unsupported, `${file}: contact example cannot contain ${unsupported?.name}: retained static demos use ordinary text wrappers, fieldsets, labels, inputs, buttons and textareas`);
    assert.ok(!marker.attributes.has('id'), `${file}: contact example has no form ID for external control association`);
    assert.ok(inside.some((tag) => tag.name === 'fieldset' && tag.attributes.has('disabled')), `${file}: contact example stays disabled`);
    assert.ok(inside.some((tag) => tag.name === 'button' && tag.attributes.has('disabled')), `${file}: contact example must contain an explicitly disabled button`);
    assert.ok(!marker.attributes.has('action'), `${file}: contact example has no backend`);
    // Explicit control attributes avoid fieldset inheritance and its first-legend
    // exemption, and cover controls moved outside the disabled fieldset.
    for (const tag of inside.filter((tag) => /^(input|button|select|textarea)$/.test(tag.name)))
      assert.ok(tag.attributes.has('disabled'), `${file}: every contact example control must be explicitly disabled: ${html.slice(tag.start, tag.end)}`);
  }
}

/** Validate configured consumer output, its required notices and retained demos. */
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

    verifyContactExamples(html, file);
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
