/** Match page identity while preserving configured link destinations. */
export function isCurrentPage(href, canonicalPath, origin) {
  const page = new URL(canonicalPath, origin);
  const pagePath = (pathname) => pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
  try {
    const link = new URL(href, page);
    return link.origin === page.origin && pagePath(link.pathname) === pagePath(page.pathname);
  } catch {
    return false;
  }
}
