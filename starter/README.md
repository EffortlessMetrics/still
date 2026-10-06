# Clear Current: neutral Still starter

A complete small static service-site example, independent of any existing business consumer: compact two-offer home, three-column workshops, two-column project support, disabled informational contact form, 404, robots and sitemap. Content, routes, pricing language, favicon and font choice belong to this starter. Still provides the actual shared service-site layout, typography scale, responsive composition, theme behavior and components.

From the repository root use Node 24.19.x, npm install, npm run check and npm run build. The workspace links @effortlessmetrics/still through its explicit 0.2.0 dependency; no registry copy is required for development. npm run dev --workspace starter opens the local Astro development server. No qualification compiler patch or Vite override is used.

Set astro.config.mjs site to your real origin; canonical URLs, robots and the sitemap use that single configuration. Review all neutral content and replace the sample identity. Preview builds use noindex/nofollow and disallow crawling; PUBLIC_SITE_ENV=production enables indexing only when intentionally configured. A sitemap is generated from these four public content routes. Do not deploy the reserved example origin.

The contact form is deliberately disabled, has no endpoint, and sends/stores/queues nothing. Enabling a real contact service requires your own configuration and privacy copy. No search, offline worker, analytics or third-party runtime requests are included.

Starter code and original favicon are MIT OR Apache-2.0, matching the repository notices. Self-hosted IBM Plex Sans and Mono are unmodified SIL OFL 1.1 font files; both full notices and pinned upstream provenance are retained in public/fonts.

The source directory is a workspace example, not an independently installable registry starter while 0.2.0 remains unpublished. For a portable standalone delivery run `npm run verify:packed -- --export ../still-starter-delivery` from the repository root, choosing a new destination. The exported directory contains the exact candidate archive and a complete `consumer` with an explicit relative archive dependency and its own lockfile. Enter `consumer` and run `npm ci`, `npm run check`, `npm run build` or `npm run dev`. Copy or zip the entire exported directory, including the archive; no public registry candidate is assumed.
