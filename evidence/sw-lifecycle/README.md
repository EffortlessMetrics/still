# Disposable browser upgrade and rollback evidence

On 2026-10-15 UTC, the generated worker from combined candidate
`278fc3cf05777d30c552d2b771e408931bf092f6` (tree
`71c1c34c058fa91a99535af54053fde1e7e4400e`) passed a local Chromium
A → B → A lifecycle probe. No runtime repair was warranted. This directory is
an opt-in reproducer and evidence, with no workflow or production input changes.
It closes the local browser execution gap described in
[issue 21 comment 6184067365](https://github.com/EffortlessMetrics/still/issues/21#issuecomment-6184067365).

The assignment is the bounded upgrade/rollback campaign from source thread
`01a10fe7-9e5f-728d-b4a0-038aed109023`. Main remained `d691545`; the combined
owner remained `278fc3c`; PR17 remained open at `c5fec852`; draft PR19 remained
open at `67e5872`. No repository AGENTS.md or .agents skill was present. The
existing PR hold remains: opening a PR would trigger the full preview/production
matrix. No PR, merge, CI dispatch, release, hosting, protection, credential,
security or billing change was made.

## What ran

Node 24.19.0, npm 11.9.0, installed Playwright 1.63.0 and system Chromium
154.0.8037.57, in the selected Linux executor. The final browser process exited 0.
The effective origin was `http://127.0.0.1:39531`, with one retained browser
context, root scope, `reading-worker.js` and `still-starter-reading-` throughout.

`probe.cjs` copies the starter and its frozen installed dependencies to one
unique temporary consumer, then builds two variants with the actual Astro
pipeline and unmodified installed specialist worker. It adds distinct HTML
comments to the home/fallback sources and adds a B-only directory page. A/B
output directories remain immutable; rollback serves the original A output.
This tests output revision lifecycle rather than a library version change.

| Build | Worker revision | Generated worker SHA256 |
| --- | --- | --- |
| A | `10980dc4cb57450eb204` | `39b2586eab8fea74e68a1fc1fb752f80f99733c013d2638b0d63e31b0c21a0ff` |
| B | `999bfcfd661750bca238` | `86052bf6a385cd2a41ae6120390f57c3d7a9a899fe015d97b331e664ab1edfc8` |

The probe explicitly registers the generated worker initially. The starter's
connection/visibility/idle registration eligibility is a separate acceptance
question. Each update is requested through `registration.update()`. Each target
revision is observed in state `installed` while the old revision remains
`activated`, with two old controlled clients. Offline navigation still returns
the old home and unknown-route fallback. Closing one client leaves the update
waiting; closing the last allows natural activation. The probe checks the
revision-selected worker's own state, registration state and controlled page,
then exact offline bytes.

For initial A, activated B and rolled-back A:

- Known home and unknown-route fallback response SHA256 equal the appropriate
  built HTML bytes, through the worker, during actual listener shutdown/socket
  destruction. Restarting the listener restores the selected online bytes.
- Both known and unknown navigations preserve HTTP 503 and its exact body through
  the worker (six responses total). HTTP errors are never replaced with HTML.
- Exactly the current revision's owned cache remains after activation. While an
  update waits, both old and new caches remain.
- A foreign cache and its exact sentinel bytes survive both transitions.
- B-only navigation returns exact B HTML under B; under A it returns exact A
  fallback. After rollback the owned cache has no B-only URL or B revision.

These expectations follow `@effortlessmetrics/astro-offline/src/worker.mjs`:
install writes an immutable revision cache; activate deletes other caches with
its owned prefix. No `skipWaiting`, `clients.claim`, unregister, cache clearing,
worker modification or forced reload/activation is used by this probe. A normal
reload after first install obtains control.

## Reproduce

Use the combined candidate or this evidence branch; production inputs must still
match the combined candidate. The probe checks tracked production paths against
that SHA and records the current HEAD. Install dependencies frozen first. Supply
an already installed Playwright module and a Chromium executable appropriate to
your machine; Playwright is deliberately not added to application dependencies.

```sh
npm ci --ignore-scripts --offline --cache /workspace/.npm-cache
npm_config_cache=/workspace/.npm-cache node --test scripts/offline-routes.test.mjs scripts/verify-delivery.test.mjs
node scripts/verify-delivery.mjs
node scripts/verify-licenses.mjs
PLAYWRIGHT_MODULE=/workspace/still-core/node_modules/playwright CHROMIUM_PATH=/usr/bin/chromium timeout 180s node evidence/sw-lifecycle/probe.cjs
```

Adjust cache/module/executable paths to available local installations. Without a
warmed npm cache, omit `--offline`. The probe needs about 350 MB for a temporary
dependency copy plus two small outputs; the workspace had 30 GiB and /tmp 8.8 GiB
free. No large allocation is needed. Builds have 60-second subprocess deadlines,
observations have 15-second deadlines, and the complete command has a 180-second
outer bound. Normal success/failure closes the browser/server and removes only
the probe's temporary directory.

## Evidence and limits

`browser.jsonl` records revisions, worker hashes/states, cache keys and entries,
response hashes/status/worker provenance and elapsed response times. `focused.log`
records 15/15 passing route/delivery tests on the exact candidate. `delivery.json`
authenticates all three active packages (19/31/12 packaged files), `licenses.log`
records retained notices, and `install.log` records the offline frozen install.
The final browser run used evidence checkout `d522d83a211da1410d6c9207a0539e65372de09f`; its production inputs remain identical to the combined candidate.
`review.txt` and `log-audit.json` contain the independent review and log audit;
the reviewer inspected the final harness and independently asserted its recorded
results, without rerunning Chromium. `SHA256SUMS` binds the published files.

Initial setup attempts are not product findings: a symlinked dependency topology
failed Astro compilation before browser execution, and the first delivery run
could not use `/home/agent/.npm/_cacache`; copying dependencies and using the
existing workspace npm cache resolved those execution problems. An intermediate
probe waited for opportunistic registration before installation; explicit initial
registration makes the final lifecycle acceptance independent of that eligibility.
The final recorded run passed and left no probe temporary directories.

This is local Chromium acceptance with deliberate output revisions. It does not
establish hosted exact-byte behavior, physical network acceptance, other browsers,
package-version migration, stalled-transport timeout/cancellation, or client
registration eligibility. Prior deadline/cancellation evidence remains tied to
its original run/candidate. No broad CI or full preview/production matrix was
rerun for this evidence-only change.

Post-push GitHub Actions visibility: the read-only `gh api` workflow-run lookup
returned `Forbidden`. No alternate access route was attempted. Workflow trigger
inspection supports branch-push safety, but the actual post-push run list remains
unconfirmed. Remote main, combined and PR17/PR19 owner heads were freshly checked
and remain unchanged.
