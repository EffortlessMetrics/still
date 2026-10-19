import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The starter's links and pinned offline preset share origin-root URLs. */
export function assertRootBase(base = '/') {
  if (base !== '/') throw new Error(
    `Still starter requires Astro base "/"; non-root base ${JSON.stringify(base)} is unsupported. ` +
    'Links, metadata, assets and the pinned offline corpus require coordinated base-path support.');
}

/** Map emitted index.html paths to the directory URLs used by the starter. */
export const canonicalRoute = (path) => path.replace(/(^|\/)index\.html$/, '$1');

/** Read emitted HTML with encoded URL segments, preserving both 404 copies. */
export async function htmlPages(directory) {
  const files = (await readdir(directory, { recursive: true }))
    .filter((file) => file.endsWith('.html')).sort();
  const pages = await Promise.all(files.map(async (file) => {
    if (!(await stat(join(directory, file))).isFile()) return null;
    const path = file.split(sep).map(encodeURIComponent).join('/');
    return {
      file,
      route: path === '404.html' ? '/404/' : canonicalRoute('/' + path),
      html: await readFile(join(directory, file), 'utf8'),
    };
  }));
  return pages.filter((page) => page !== null);
}

/** Select unique emitted routes while honoring consumer sitemap exclusions. */
export function sitemapRoutes(pages, site) {
  const excluded = new Set([
    '/404/',
    ...(site.offline.excludedPages ?? []),
    ...(site.sitemapExcludedPaths ?? []),
  ]);
  return [...new Set(pages.map((page) => page.route))]
    .filter((route) => !excluded.has(route)).sort();
}

/** Encode public origin/route text as XML without changing the underlying URL. */
const escapeXml = (text) => text.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

/** Emit sitemap bytes before offline generation so the final XML can be cached. */
export default function sitemap(site) {
  return {
    name: 'still-starter-sitemap',
    hooks: {
      'astro:config:done': ({ config }) => assertRootBase(config.base),
      'astro:build:done': async ({ dir }) => {
        const directory = fileURLToPath(dir);
        const origin = new URL(site.origin).origin;
        const routes = sitemapRoutes(await htmlPages(directory), site);
        const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          routes.map((route) => `<url><loc>${escapeXml(origin + route)}</loc></url>`).join('') + '</urlset>';
        await writeFile(join(directory, 'sitemap.xml'), xml);
      },
    },
  };
}
