# Combined delivery/navigation review

Reviewed 2026-10-15 UTC for the authorized release-readiness campaign, source
thread `01a10fe7-9e5f-728d-b4a0-038aed109023`, issues [20](https://github.com/EffortlessMetrics/still/issues/20)
and [21](https://github.com/EffortlessMetrics/still/issues/21).

Subject: `278fc3cf05777d30c552d2b771e408931bf092f6`, tree
`71c1c34c058fa91a99535af54053fde1e7e4400e`, branch
`integrate/delivery-interrupted-navigation`. Main remained
`d691545985cb20ab3848d34cb323bf224b5132b4`. Original owner refs remained
`43de3da23515090f0490d27a6bc9ca6af5ccc0d9` and
`1c91d8f2324bba88c7b877c2f75c905ad0da9272`.
Fresh issue comments and open PRs confirmed PR17 owns config migration and PR19
base guards. No repository AGENTS.md was present. This isolated review branch
adds evidence only; it does not alter those refs or the reviewed source.

## Decision and cause

No blocking finding in the combined source changes. All four changed source
files equal their respective original owner blobs. The delivery verifier binds
the active manifest, root lock pin, resolved path, version, receipt/archive hashes,
packed manifest and installed packaged bytes. Its controls distinguish the older
audit's stale-manifest false positive from the new rejection and exercise a real
0.2.1 to 0.2.2 upgrade. The route tests distinguish independent navigation deadlines,
cleanup, fallback selection and unchanged online responses.

Immediate browser cancellation propagation is **not established and did not occur
in this probe**. Six superseded navigations produced ERR_ABORTED while their worker
upstream connections remained open for 999.6–1004.8 ms from request arrival,
993.3–998.7 ms after supersession. An excluded `/api/` fetch aborted through its
own signal closed in 3.1 ms. Thus browser navigation cancellation and worker fetch
cancellation must remain separate claims.

Source inspection explains the guaranteed bound: both network-first handlers
create a fresh AbortController and pass its deadline signal to fetch, with a
default 1000 ms timeout and finally-block cleanup. They do not combine the incoming
request signal with that controller. The probe observes external socket lifetime;
it does not establish whether Chromium aborts the worker's incoming Request.signal.
Simply forwarding that signal is therefore not a demonstrated repair.

No runtime/archive repair is warranted by the requested investigation: cached
recovery remains correct and transport is bounded by the accepted timeout.
If prompt cancellation becomes a requirement, the specialist astro-offline owner
must first observe the incoming worker signal and qualify a repair in a newly
accepted immutable delivery. Do not repack the existing 0.1.5 archive.

## Fresh exact-subject evidence

Node 24.19.0, npm 11.9.0, Playwright 1.63.0, actual `/usr/bin/chromium`
154.0.8037.57, headless Linux loopback. Unmodified generated worker SHA256:
`70f2d6bed95c6b97eaaa12fcf8a60c119a202468d2733fd5b16a5122d9c4b6a8`.
Installed worker source SHA256:
`6f96bfccdc437421ce15748c5a8cf30a9fa0386eafd5d5f200742aa29f06aaec`.

- Offline frozen installation passed using `/workspace/.npm-cache`.
- Delivery + route tests: 15/15 passed; license regressions: 8/8 passed.
- Delivery audit authenticated 19/31/12 packaged files; license verifier passed.
- Preview build and verify:starter passed, including seven HTML files.
- Browser: activated worker controls two tabs. Three cycles for each known and
  unknown route verify supersession, deadline socket closure, healthy concurrent
  peer navigation, and exact cached page/fallback response bytes. Three further
  cycles verify unchanged HTTP503 body/status for both routes, real TCP listener
  shutdown/socket destruction, cached known/fallback bytes, listener restart and
  fresh online response. A server-issued increasing response marker distinguishes
  reconnect network success from a cache-only response.

`probe.cjs` and `browser.log` preserve the bounded discriminator; `focused.log`,
`licenses.log`, `delivery.json` and `verify-output.log` preserve fresh results.
Browser log SHA256:
`9b85e26d88a7f35cede9127ec0d027c833ce0e06cd3af2766a5bc21ba83d0b17`.
The reviewer independently reran these checks and inspected source/counterexamples;
no second reviewer identity is claimed for this follow-up.

Reproduce from the repository root after the warm frozen install and preview build:

```sh
npm_config_cache=/workspace/.npm-cache npm ci --offline --ignore-scripts
npm_config_cache=/workspace/.npm-cache node --test scripts/verify-delivery.test.mjs scripts/offline-routes.test.mjs
ASTRO_TELEMETRY_DISABLED=1 PUBLIC_SITE_ENV=preview npm run build
ASTRO_TELEMETRY_DISABLED=1 PUBLIC_SITE_ENV=preview npm run verify:starter
STILL_PLAYWRIGHT_MODULE=/workspace/still-core/node_modules/playwright timeout 55s node reviews/2026-10-15-navigation-abort/probe.cjs
```

The browser module is an already installed test tool; this adds no project dependency.
The probe expects the recorded delayed-cancellation behavior; a future immediate
cancellation repair should change its observation assertions deliberately.

## Limits and holds

This is source and local Chromium evidence, not hosted qualification. Other
browsers, physical network loss, upgrade/rollback activation, production build and
the full combined starter matrix were not rerun here. Prior results retain their
original candidate identities. No release, deployment, merge, PR creation, broad
early CI, credential, hosting or protection change occurred. The PR hold remains:
the workflow runs on main pushes and PRs to main; integration owner must coordinate
the late gate and refresh ownership, required checks/reviews/threads before acting.
The shell GitHub API route returned Forbidden; connected GitHub reads succeeded,
and that access error is not a test result.
