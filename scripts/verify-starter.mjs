import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isCurrentPage } from '../src/navigation.mjs';
import { getViteConfig } from 'astro/config';
import { assertRootBase, canonicalRoute, htmlPages, sitemapRoutes } from './site-output.mjs';

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
  const open = /<!--|<!|<\?|<(\/?)([A-Za-z][^\t\n\f\r />]*)/g;
  for (let match; (match = open.exec(html));) {
    if (match[0].startsWith('<!') || match[0] === '<?') {
      if (match[0] === '<!--') {
        // HTML also ends comments at an initial > or ->, and at --!>.
        // A normal-terminator-only search could swallow a following live form.
        const rest = html.slice(open.lastIndex);
        const abrupt = rest.match(/^(?:>|->)/);
        const end = /--!?>/.exec(rest);
        open.lastIndex += abrupt?.[0].length ?? (end ? end.index + end[0].length : rest.length);
      } else {
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
export async function verifyStarter({ directory, site, production, root = process.cwd(), base }) {
  assert.equal(typeof base, 'string', 'Supply the effective Astro base explicitly before verifying output');
  assertRootBase(base);
  const read = (file) => readFile(join(directory, file), 'utf8');
  const origin = new URL(site.origin).origin;
  const robots = production ? 'index,follow' : 'noindex,nofollow';
  const pages = await htmlPages(directory);
  assert.ok(pages.length > 0, 'Build at least one site page before verifying its output');
  for (const {file, route, html} of pages) {
    // Comments, raw text, attribute values and inert template contents are not page metadata.
    const metadataTags = new Set();
    let templateDepth = 0;
    for (const tag of markupTags(html)) {
      if (tag.name === 'template') templateDepth = tag.closing ? Math.max(0, templateDepth - 1) : templateDepth + 1;
      else if (!templateDepth && !tag.closing && (tag.name === 'link' || tag.name === 'meta'))
        metadataTags.add(html.slice(tag.start, tag.end));
    }
    assert.ok(html.includes(` | ${escapeText(site.name)}</title>`), `${file}: configured title suffix`);
    assert.ok(html.includes(`href="/">${escapeText(site.name)}</a>`), `${file}: configured brand`);
    assert.ok(html.includes(`data-theme-key="${escapeAttribute(site.themeStorageKey)}"`), `${file}: configured theme key`);
    assert.ok(html.includes(`<meta name="robots" content="${robots}">`), `${file}: indexing policy`);
    assert.ok(metadataTags.has(`<link rel="canonical" href="${escapeAttribute(origin + route)}">`), `${file}: canonical URL`);
    assert.ok(metadataTags.has(`<meta property="og:url" content="${escapeAttribute(origin + route)}">`), `${file}: Open Graph URL`);
    const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    for (const link of site.navigation) {
      const current = isCurrentPage(link.href, route, origin) ? ' aria-current="page"' : '';
      assert.ok(navigation.includes(`<a href="${escapeAttribute(link.href)}"${current}>${escapeText(link.label)}</a>`), `${file}: configured navigation and current page`);
    }
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
  const manifest = worker.match(/const DIGESTS=(\{[^\n]+\});/);
  assert.ok(manifest, 'Generated worker must contain its offline digest manifest');
  // Read the pinned integration's JSON arguments, never execute worker code.
  const runtime = worker.match(/\nOfflineRuntime\.installWorker\((.*),REVISION,PREFIX\);\s*$/);
  assert.ok(runtime, 'Generated worker must contain its offline runtime install arguments');
  const args = JSON.parse('[' + runtime[1] + ']');
  assert.equal(args.length, 2, 'Offline runtime must have exactly two JSON install arguments');
  const [policy, entries] = args;
  assert.ok(Array.isArray(entries), 'Offline runtime entries must be an array');
  const identity = worker.match(/^const REVISION=("[a-f0-9]{20}");const PREFIX=("(?:\\.|[^"\\])*");/m);
  assert.ok(identity, 'Generated worker must contain its offline revision and cache prefix');
  assert.equal(JSON.parse(identity[1]), receipt.revision, 'Offline receipt revision must match worker revision');
  assert.equal(JSON.parse(identity[2]), site.offline.cachePrefix,
    'Offline cache prefix must match configured site.offline.cachePrefix; rebuild after changing cache ownership');
  const expectedPolicy = {...site.offline.worker,
    navigationFallback: site.offline.worker?.navigationFallback?.replace(/index\.html$/, '')};
  assert.deepEqual(policy, JSON.parse(JSON.stringify(expectedPolicy)),
    'Offline worker policy must match configured site.offline.worker; rebuild after changing offline policy');
  const normalize = (value) => {
    assert.equal(typeof value, 'string', 'Offline manifest URLs must be strings');
    const url = new URL(value, origin);
    assert.ok(value.startsWith('/') && url.origin === origin && !url.search && !url.hash,
      'Offline manifest URLs must be same-origin paths without query or fragment');
    return url.pathname;
  };
  const uniqueManifest = (items, label) => {
    const result = new Map();
    for (const [url, digest] of items) {
      const path = normalize(url);
      assert.ok(!result.has(path), `${label} URLs must be unique after normalization: ${path}`);
      result.set(path, digest);
    }
    return result;
  };
  const receiptUrls = new Set(uniqueManifest(receipt.urls.map((url) => [url, null]), 'Offline receipt').keys());
  const digests = uniqueManifest(Object.entries(JSON.parse(manifest[1])), 'Offline diagnostic');
  const runtimeDigests = uniqueManifest(entries.map((entry) => {
    assert.match(entry.digest, /^[a-f0-9]{64}$/, 'Offline runtime entries must have SHA256 digests');
    return [entry.url, entry.digest];
  }), 'Offline runtime');
  const excluded = (path) => path === '/api' ||
    ['/api/', ...(policy.excludedPrefixes ?? [])].some((prefix) => path.startsWith(prefix));
  for (const path of runtimeDigests.keys())
    assert.ok(!excluded(path), `Offline runtime corpus must not contain excluded endpoint: ${path}`);
  for (const {file, route} of pages) {
    if ((site.offline.excludedPages ?? []).includes(route) || route === '/api' ||
        ['/api/', ...(site.offline.worker.excludedPrefixes ?? [])].some((prefix) => route.startsWith(prefix))) continue;
    // The pinned worker recognizes directory URLs and their index.html aliases.
    // Sitemap exclusions alone never remove a page's offline requirement.
    const aliases = route.endsWith('/') ? [route, route + 'index.html'] : [route];
    const cached = aliases.filter((url) => receiptUrls.has(url) && runtimeDigests.has(url));
    assert.ok(cached.length, `${file}: emitted HTML ${route} is missing from the offline precache; use directory output or deliberately exclude this route in site.offline`);
    const digest = createHash('sha256').update(await readFile(join(directory, file))).digest('hex');
    assert.ok(cached.every((url) => runtimeDigests.get(url) === digest && digests.get(url) === digest), `${file}: offline worker digest must match emitted HTML bytes for ${route}`);
  }
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
  assert.deepEqual([...receiptUrls].sort(), [...runtimeDigests.keys()].sort(),
    'Offline receipt URLs must match the actual runtime manifest');
  assert.deepEqual([...digests].sort(), [...runtimeDigests].sort(),
    'Offline diagnostic digests must match the actual runtime manifest');
  for (const page of site.offline.excludedPages ?? []) {
    const route = canonicalRoute(page);
    const aliases = route.endsWith('/') ? [route, route + 'index.html'] : [route];
    assert.ok(aliases.every((url) => !runtimeDigests.has(normalize(url))),
      `Configured excluded page must not be precached: ${route}; rebuild after changing site.offline.excludedPages`);
  }
  return pages.length;
}

/** Resolve build configuration through Astro, including owner integration setup. */
export async function verificationConfig(root) {
  let effective;
  const capture = {name: 'still-starter-verification-config', hooks: {
    'astro:config:done': ({config}) => { effective = config; },
  }};
  // Astro's public tooling API uses build-mode setup and then config:done,
  // without building pages or rewriting the output this verifier must inspect.
  await getViteConfig({}, {root, configFile: 'astro.config.mjs', integrations: [capture]})({
    mode: 'production', command: 'build',
  });
  assert.ok(effective, 'Astro must provide the effective build configuration');
  return effective;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const root = process.cwd();
  const config = await verificationConfig(root);
  const {site} = await import(pathToFileURL(join(root, 'site.config.mjs')));
  const production = process.env.PUBLIC_SITE_ENV === 'production';
  const count = await verifyStarter({directory: fileURLToPath(config.outDir), site, production, root, base: config.base});
  console.log(`Starter output passes: ${count} HTML files, ${production ? 'production' : 'preview'} indexing, configured identity/links/sitemap, marked contact examples, offline page digests/fallback/fonts and notices.`);
}
