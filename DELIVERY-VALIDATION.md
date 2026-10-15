# Validate an active bundled upgrade

Run from the application root on Node 24.19.x with npm and `tar` available:

```sh
npm ci --ignore-scripts
node scripts/verify-delivery.mjs
node --test scripts/verify-delivery.test.mjs
```

The verifier binds each of the three bundled libraries to the active dependency
path, root lock pin, resolved lock path, locked version, receipt SHA256, lock
SHA512, packed name/version and every installed packaged file. It reads local
bytes only and does not install, publish or contact a registry. Unlike the older
inline byte audit in UPGRADING.md, it rejects a changed active pin with stale
receipt/lock/install evidence. The regression executes that older audit as a
passing negative control, then requires the new verifier to reject the same
consumer. It also exercises a real retained Still 0.2.1 to accepted 0.2.2 update
and frozen installation, with corrupted lock, receipt, archive and runtime controls.
Tests use a disposable directory and the configured npm cache; warm that cache
with the frozen install first. Registry dependencies are outside this bundled
verifier's contract; use exact registry installation/integrity evidence separately.

For an upgrade, retain the previous archive, manifest, lock and receipt. Obtain
independently accepted new bytes and digest; save them at a new archive path,
update only that library's pin/lock/receipt and review the diff. Invalidate old
source comparisons and acceptance claims as described in UPGRADING.md. Install
frozen, run this verifier and license checks, then run affected build, browser and
worker acceptance. A byte audit does not establish browser or hosted acceptance.
Keep the historical archive immutable; do not repack current core under an
accepted archive's existing identity, even when package versions match.

| Owner | Changes and evidence |
| --- | --- |
| `still-core` | Reusable components, package exports/types and CSS; immutable candidate payload, compatibility fixtures, source provenance and accepted archive receipt. Its frozen historical upgrade fixture does not qualify today's template or a private consumer. |
| `still` template | Editable starter adapters/configuration and local verification tools, including this optional byte audit. Merge tooling deliberately; PR17 separately covers sitemap/config migration and PR19 the origin-root contract. Do not copy a complete starter over an application. |
| Each consumer | Select exact independently accepted archives; update its own manifest, lock and receipt; retain content, assets, chosen application terms and upstream/font notices; qualify its own configuration, contact/offline policy, output and browser lifecycle. Private business delivery uses its existing `DEPENDENCY-DELIVERY.json` and dependency-identity verifier rather than this starter receipt format. |

This change neither updates library versions nor adopts the later same-version
core source into accepted deliveries. Licenses remain checked by
`npm run verify:licenses` and `npm run test:licenses`; their application-ownership
and exact-registry semantics are unchanged. Hosted acceptance and recovery remain
consumer gates. No deployment, registry publication or production rollback is
performed by these commands.
