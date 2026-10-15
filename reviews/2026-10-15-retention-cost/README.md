# Navigation retention: contract and resource decision

2026-10-15 UTC. Authorized bounded follow-up to evidence
`74d10f14370bd36435d250d2cc189f2e84d258da`, campaign source thread
`01a10fe7-9e5f-728d-b4a0-038aed109023`.

## Decision

No runtime or archive repair is justified by this evidence. The delivered offline
README explicitly defines network-first fallback on transport failure or timeout
(default 1000 ms); it does not promise immediate cancellation on navigation
supersession. The measured waiting-for-headers retention satisfies that contract.
It consumes connection/request state for roughly one additional second per
superseded attempt. These probes do not demonstrate material bandwidth, CPU,
memory growth or user-facing contention. This is not a claim that retained work
is free, or that arbitrary workloads cannot suffer contention.

The smallest apparent source change, combining incoming Request.signal with the
existing deadline, cannot repair this observed Chromium case: instrumentation
recorded 27 relevant incoming signals and **zero aborts**, while all 12 hanging
upstream fetches aborted at their independent deadlines. Six of those were
superseded and six deliberately waited for cached recovery. A global latest-request
controller would wrongly couple separate clients. Shortening the configured
navigation timeout would change the accepted online/offline tradeoff without
measured justification. A new prompt-cancellation requirement needs specialist
runtime design and a newly qualified immutable delivery, not a repack of 0.1.5.

Clarification of the earlier evidence: the deadline bounds waiting for response
headers in these tests, not every response body's lifetime. fetch resolves after
headers, then finally clears the timer. In a bounded streaming counterexample,
superseding the committed document closed upstream in 7.84 ms (known page) and
4.98 ms (unknown route), after 118.74/111.65 ms total. Each server attempted 5108
body bytes before closure; the safety cutoff was 1500 ms and was not reached.
These are server write counts, not client-consumed byte measurements. A completed
original goto in this phase is expected: the document had already committed;
about:blank became the final page. Body cancellation is distinct from incoming
Request.signal cancellation.

## Subject, ownership and protections

Isolated worktree `/workspace/still-retention`, branch
`review/navigation-retention-cost-20261015`, starts at the supplied evidence commit.
Runtime subject remains combined candidate
`278fc3cf05777d30c552d2b771e408931bf092f6`, tree
`71c1c34c058fa91a99535af54053fde1e7e4400e`.
Fresh remote reads confirmed main `d691545985cb20ab3848d34cb323bf224b5132b4`,
original delivery owner `43de3da23515090f0490d27a6bc9ca6af5ccc0d9`, navigation owner
`1c91d8f2324bba88c7b877c2f75c905ad0da9272`, combined and evidence refs unchanged.
Current native issues 20/21 preserve the combined integration owner and PR hold;
open PR17 owns config migration, PR19 base guards. The recorded lifecycle follow-up
was blocked at provisioning, not a failed lifecycle test. No overlapping runtime
writer was identified. No repository AGENTS.md or local skill instructions exist
in this standalone checkout. The engineering delivery skill guided this bounded
investigation; no extra gate was invented.

Only this evidence directory is added. Source, worker, dependency pins, archives,
activation/cache cleanup, and all original branches remain unchanged. The workflow
runs on main pushes and PRs to main, so this branch push does not request broad CI.
The explicit PR hold remains. No PR, merge, release, deployment, protection,
credential, billing or security configuration action is part of this task.

## Fresh proof and reproduction

Node 24.19.0, npm 11.9.0, Playwright 1.63.0, actual headless
`/usr/bin/chromium` 154.0.8037.57, Linux loopback. Warm offline frozen install added
594 packages; worktree including dependencies measured 308 MB. Existing workspace
npm cache and Playwright were reused; no new project dependency was introduced.

- `focused.log`: installed route suite PASS 5/5, including separate deadlines,
  cleanup, unchanged online responses and repeated recovery.
- `build.log`, `verify.log`: preview build and seven-page output verification PASS.
- `baseline.log`: supplied uninstrumented browser probe PASS; six supersessions
  retained upstream for 999.44–1001.08 ms, total 6.0028 request-seconds; excluded
  direct fetch abort closed in 3.98 ms.
- `instrumented.log`: disposable instrumentation plus the same six supersessions,
  six concurrent-peer deadline cases, and three HTTP503/disconnect/reconnect cycles
  PASS; 27 incoming/outgoing observations, zero incoming aborts, 12 deadline aborts;
  two bounded streaming observations above. Hanging responses sent no body bytes.
- Delivery audit authenticated 19/31/12 packaged files; license verification PASS.
  Installed offline worker SHA256
  `6f96bfccdc437421ce15748c5a8cf30a9fa0386eafd5d5f200742aa29f06aaec`;
  accepted offline archive
  `e8cb8779d076896e437fb309a5c3ce2d15d5620a1e1d0508d614ff6f09d17a06`;
  generated worker on disk
  `70f2d6bed95c6b97eaaa12fcf8a60c119a202468d2733fd5b16a5122d9c4b6a8`.

`probe.cjs` prepends observation code only in its disposable server's worker
response. Package and generated files on disk stay byte-identical. Separate
uninstrumented baseline results distinguish actual delivery proof from observer
results. No production worker modification is proposed.

From repository root:

```sh
npm_config_cache=/workspace/.npm-cache npm ci --offline --ignore-scripts
node --test scripts/offline-routes.test.mjs
ASTRO_TELEMETRY_DISABLED=1 PUBLIC_SITE_ENV=preview npm run build
ASTRO_TELEMETRY_DISABLED=1 PUBLIC_SITE_ENV=preview npm run verify:starter
node scripts/verify-delivery.mjs
node scripts/verify-licenses.mjs
STILL_PLAYWRIGHT_MODULE=/workspace/still-core/node_modules/playwright timeout 55s node reviews/2026-10-15-navigation-abort/probe.cjs
STILL_PLAYWRIGHT_MODULE=/workspace/still-core/node_modules/playwright timeout 55s node reviews/2026-10-15-retention-cost/probe.cjs
```

Independent review is recorded in `review.txt`, including fresh focused execution,
a synthetic incoming-abort discriminator, final probe review and evidence limits.

## Limits and experiment corrections

No full preview/production matrix, hosted acceptance, other browser, physical
network, upgrade/rollback activation or stale-cache transition was run. Existing
proof retains its original candidate identity. Worker install/control occurs here,
but a single immutable worker does not qualify updates or rollback. Server CPU
may continue after socket closure; neither direct nor worker socket timings prove
server computation cancellation. No CPU/memory profiling or bandwidth workload
was attempted.

An exploratory six-tab burst did not reliably cancel all navigations before their
deadlines: competing goto commands raced; explicit stop also observed an already
completed navigation. Those attempts are inconclusive harness observations, not
product failures or concurrency proof, and were removed from the final small
probe. An initial streaming assertion incorrectly required ERR_ABORTED after a
committed navigation; the final probe instead records its outcome and verifies
that about:blank is the final document. Final passing logs come from the corrected
probe. There is no claim of six simultaneous retained requests or measured pool
contention.

The shell GitHub API returned `Post https://api.github.com/graphql: Forbidden`.
That route was not retried or circumvented; already available connected GitHub
reads supplied current issues/comments/PR state. Git fetch and scoped branch push
use the repository's functioning Git transport. The API denial is an access
limitation, not a test finding; this task does not require an API write.
