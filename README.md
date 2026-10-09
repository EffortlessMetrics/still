# Still service-site starter

A neutral, standalone default with verified offline caching and connection-aware native intent prefetch enabled. Shared components keep their established npm names/imports; canonical static precache setup uses the unpublished astromache 0.2.2 core preset. Cache integrity and lifecycle remain owned by offline 0.1.4.

Use Node 24.19.x. Run npm ci --ignore-scripts, npm run check, npm run build and npm run dev. Exact active archive hashes are in STARTER-DELIVERY.json. These expanded candidates are not yet registry releases.

Replace neutral content/branding and edit site.config.mjs. Keep API and host redirect URLs out of the precache using excludedPages and excludedPrefixes. Query policy is explicitly stripQuery:false. Registration uses /reading-worker.js at root scope; coordinate any worker filename/scope edit with the small layout registration call. Natural activation waits for existing clients; no forced reload or activation occurs.

Static HTML must remain byte-identical to selected build output. _headers supplies no-transform on compatible static hosts; host Functions and other serving products require equivalent policy. Hosted exact-byte and fresh install/offline/reconnect checks remain NOT RUN. Local browser acceptance is not deployment approval.

Owner code is MIT OR Apache-2.0; retain packaged OFL font notices and Workbox MIT notices. Private content/history and producer qualification infrastructure are not part of this starter.

## Source ownership

Reusable components are maintained in [astromache-core](https://github.com/EffortlessMetrics/astromache-core) and [still-core](https://github.com/EffortlessMetrics/still-core). Offline and static-search remain independent specialist libraries. This template has its own editable routes/content/configuration; private sites consume the libraries independently. GitHub template copies include only this small starter, vendored candidates and license notices. No producer qualification infrastructure or private source/history is included.
