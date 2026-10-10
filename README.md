# Still service-site starter

A neutral, standalone default with verified offline caching and connection-aware native intent prefetch enabled. Shared components keep their established npm names/imports; canonical static precache setup uses the unpublished astromache 0.2.6 core preset. Cache integrity and lifecycle remain owned by offline 0.1.4.

Use Node 24.19.x. Run npm ci --ignore-scripts, npm run check, npm run build and npm run dev. Exact active archive hashes are in STARTER-DELIVERY.json. These expanded candidates are not yet registry releases.

Replace neutral content/branding and edit site.config.mjs. Keep API and host redirect URLs out of the precache using excludedPages and excludedPrefixes. Query policy is explicitly stripQuery:false. Registration follows site.offline.workerFile at root scope; edit that setting to rename the generated and registered worker together, and update the worker path in public/_headers to preserve its no-cache policy. Scope remains configured in the small layout registration call. Natural activation waits for existing clients; no forced reload or activation occurs.

Static HTML must remain byte-identical to selected build output. _headers supplies no-transform on compatible static hosts; host Functions and other serving products require equivalent policy. Hosted exact-byte and fresh install/offline/reconnect checks remain NOT RUN. Local browser acceptance is not deployment approval.

Owner code is MIT OR Apache-2.0; retain packaged OFL font notices and Workbox MIT notices. Private content/history and producer qualification infrastructure are not part of this starter.

## Source ownership

Reusable components are maintained in [astromache-core](https://github.com/EffortlessMetrics/astromache-core) and [still-core](https://github.com/EffortlessMetrics/still-core). Offline and static-search remain independent specialist libraries. This template has its own editable routes/content/configuration; private sites consume the libraries independently. GitHub template copies include only this small starter, vendored candidates and license notices. No producer qualification infrastructure or private source/history is included.

## License scope when adapting a starter

The upstream owner grants MIT OR Apache-2.0 for this public template/library code and its original neutral examples. This grant does not license a consumer's replacement articles, photographs, branding, application additions or other independently owned material. Font files retain their OFL terms; dependencies retain their own licenses.

When creating your application, choose its package metadata and code/content license deliberately rather than inheriting the template's license field as a blanket declaration. A private application may use `UNLICENSED` for its own package while retaining the required upstream copyright and license notices for reused code, fonts and dependencies. Do not remove those notices or imply that private content became MIT-licensed merely by consuming a library.

The application package starts as `UNLICENSED`. There is no blanket root site license. Required upstream template notices are retained under `licenses/template/`; those terms license upstream template material only.

## Upgrading shared libraries

Keep the application private and UNLICENSED, preserve scoped template notices and OFL font notices, and upgrade each library independently. For a bundled candidate, replace its exact vendor archive, dependency path and lockfile; update STARTER-DELIVERY.json with the reviewed archive path, SHA256 and version. Run npm ci --ignore-scripts, npm run verify:licenses, npm run test:licenses, npm run check and npm run build.

After an explicitly approved registry release exists, replace a library's file dependency with its exact published version and regenerate package-lock.json. Future registry upgrades need only the exact version and lockfile updates; historical bundled delivery receipts stay unchanged. The license guard requires the installed version to equal that exact pin and retains the library's MIT OR Apache-2.0 notices. Regression fixtures use installed candidate bytes to test registry mode; they do not demonstrate or perform npm publication.

Offline revisions follow emitted output digests: a package version change alone may leave output and worker revision unchanged. Compare generated worker/output before deploying, then verify natural activation, offline reading and reconnect on the actual host. To roll back, restore the prior dependency/lock and matching bundled receipt/archive when applicable, rebuild and review output. Deployment or DNS rollback cannot guarantee rollback of already controlled browser clients; retain the lifecycle and hosted acceptance gates.

Update libraries when a relevant fix or feature is needed; versions need not be leveled across different libraries or consumers. This starter retains its qualified AstroMache 0.2.6 navigation/offline default; the 0.2.7 Article geometry repair does not require an upgrade here.
