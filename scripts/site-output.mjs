import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const canonicalRoute = (path) => path.replace(/index\.html$/, '');

export async function htmlPages(directory) {
  const files = (await readdir(directory, { recursive: true }))
    .filter((file) => file.endsWith('.html')).sort();
  return Promise.all(files.map(async (file) => {
    const path = file.replaceAll('\\', '/');
    return {
      file,
      route: path === '404.html' ? '/404/' : canonicalRoute('/' + path),
      html: await readFile(join(directory, file), 'utf8'),
    };
  }));
}

export function sitemapRoutes(pages, site) {
  const excluded = new Set([
    '/404/',
    ...(site.offline.excludedPages ?? []),
    ...(site.sitemapExcludedPaths ?? []),
  ]);
  return [...new Set(pages.map((page) => page.route))]
    .filter((route) => !excluded.has(route)).sort();
}

const escapeXml = (text) => text.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);

// Runs before offline generation so a consumer may also precache sitemap.xml.
export default function sitemap(site) {
  return {
    name: 'still-starter-sitemap',
    hooks: {
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
