# Failed precache before activation

This opt-in local browser experiment extends the successful A/B/A lifecycle
evidence at `11cd1a04c87add5f9787f5c079a1efb13ed3b8d6`. It changes no runtime,
vendor archive, application dependency, workflow or production input. No runtime
defect was reproduced, so no runtime fix or required browser regression was added.

The experiment uses the installed specialist's actual `generateOfflineWorker`
and bundled Workbox 7.4.1 runtime. Two three-file corpora have distinct verified
digests. A local server keeps one origin, worker URL, scope and ownership prefix.
Each case starts with a fresh disposable browser context, installs old output,
obtains control by ordinary reload and seeds a foreign-cache sentinel.

In the failure case, the server withholds the corrupt `/asset.txt` response until
the browser cache contains `/a-ok.txt` with the exact new verified bytes. The
replacement worker becomes redundant. The partially populated new revision cache
is removed; the old and foreign cache entries remain byte-identical. The old
document remains readable offline. In the successful negative control, the same
new worker and expected corpus receive correct bytes, wait while the old client
remains, then activate naturally after it closes. The old cache is removed and
the new document works offline. No skipWaiting, client claiming, cache clearing
or unregister is used.

## Reproduce

Use Node 24.19.x and a frozen installation (`npm ci --ignore-scripts`). Supply an
existing Playwright module and Chrome/Chromium executable. Example PowerShell:

```powershell
$env:PLAYWRIGHT_MODULE='H:\Temp\still-task33-browser-tools\node_modules\playwright\index.mjs'
$env:CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:FIXTURE_ROOT='H:\Temp'
node evidence/sw-failed-precache/probe.mjs
```

The probe retains its unique fixture directory and prints its path. It writes
`evidence.json` only after all assertions pass. It checks tracked production inputs
against verified11cd1a04 and records actual checkout/tree, browser/runtime, worker
hashes, revisions, request observations, and before/partial/after/activated cache
contents. A browser watchdog bounds the exercised section to 90 seconds.

## Evidence and limits

Windows desktop, system Chromium 155.0.8059.40, Playwright 1.58.2, Node 24.19.0.
The exact installed worker SHA256 is
`6f96bfccdc437421ce15748c5a8cf30a9fa0386eafd5d5f200742aa29f06aaec`;
the accepted archive SHA256 is
`e8cb8779d076896e437fb309a5c3ce2d15d5620a1e1d0508d614ff6f09d17a06`.
The delivery audit authenticates all three installed packages (19/31/12 files).
Focused existing routing tests pass 5/5. These results do not requalify the full
preview/production matrix. Prior A/B/A results retain their original identities.

This establishes failed integrity precache after partial population before
activation. It does not establish browser/process termination, crash durability,
physical disconnection, hosting behavior, another browser, arbitrary corpus size,
or initial registration eligibility. It uses a minimal direct-generation fixture
and cache-first routing, rather than rebuilding the complete starter; lifecycle
handlers are the same accepted delivered code. Earlier machine-local successful
experiments informed the portable probe. Stalled portable reruns were stopped
only by confirmed task-owned PID and are not treated as passing evidence.

The initial resource snapshot showed CPU 100%, 32 logical processors, about
119 GiB free physical memory, 88 GiB commit headroom and 2.26 TB free on H:.
No Cargo invocation or expensive qualification ran. Resources are isolated under
H:\Temp\still-task33-*; other worktrees and caches were not changed. No global
configuration, release, deployment, credentials or protections were changed.

Earlier delegated-work reports deferred PR creation until a coordinated late
integration gate because opening a PR to main runs the full preview/production
matrix. This is a qualification scheduling dependency, not a verified user hold.
Current authorization covers scoped owned-repository draft PRs. Coordinate this
evidence with the delivery integration owner to avoid duplicate broad runs.
This evidence lane is not a competing runtime fix. Process interruption remains
untested.

Tracking correction: the earlier scheduling limit appears in issue 20 comment
6182035717 (EffortlessSteven, 2026-10-15 01:08:58 UTC), and the explicit phrase
"PR HOLD retained because opening launches full matrix" appears in comment
6182433600 (same account, 01:41:32 UTC). These delegated-work reports targeted
integrate/delivery-interrupted-navigation at 278fc3cf05777d30c552d2b771e408931bf092f6;
no direct user instruction establishing a continuing publication hold was found.
The prior version of this evidence README incorrectly promoted that scheduling
limit into a continuing user hold. No such authorization hold is asserted here.

Final portable run exited 0 and passed both browser cases. browser.json is the
complete final run at fixture H:\Temp\still-failed-precache-VPYJfv. The final
probe's successful-control race was repaired by observing natural old-cache
cleanup from the new worker before opening a replacement client. Two intermediate
portable runs failed the premature cleanup assertion; those are harness failures,
not runtime findings. Two stalled attempts were stopped only by owned PID.
The final independent reviewer inspected source/results, recalculated identities
and verified Git provenance; it did not independently rerun Chromium.

Dependency provisioning used npm 11.18.0 under host Node26.5 with engine warnings
and ignore-scripts; the frozen lock installation completed with 592 packages,
zero audit findings. All recorded final probes/audits/tests used Node24.19.0.

