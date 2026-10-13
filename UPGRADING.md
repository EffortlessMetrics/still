# Verify and upgrade a bundled library

Run these examples from the application root with Node 24.19.x. The optional
provenance audit also uses Git and `tar`; normal builds need no producer checkout.
The examples audit the current offline candidate without changing its version.
Use a separately reviewed archive, digest and source comparison for a real upgrade.
Do not infer a source revision from a package version.

## Check the delivered bytes

The following checks the receipt's SHA256, the lockfile's SHA512 and every regular
packaged file against the frozen install. It does not contact or publish to a registry.
Run `npm ci --ignore-scripts` first if dependencies are not installed.

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const name = '@effortlessmetrics/astro-offline';
const receipt = JSON.parse(readFileSync('STARTER-DELIVERY.json', 'utf8'));
const archive = receipt.archives[name];
const bytes = readFileSync(archive.file);
const sha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256, archive.sha256, 'Archive differs from reviewed receipt');
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
assert.equal(lock.packages['node_modules/' + name].integrity,
  'sha512-' + createHash('sha512').update(bytes).digest('base64'));
const entries = execFileSync('tar', ['-tzf', archive.file], {encoding: 'utf8'})
  .trim().split('\n').filter(path => !path.endsWith('/'));
for (const path of entries) {
  assert.ok(path.startsWith('package/') && !path.split('/').includes('..'));
  const packed = execFileSync('tar', ['-xOzf', archive.file, path]);
  assert.deepEqual(readFileSync(join('node_modules', name, path.slice(8))), packed,
    'Installed file differs from archive: ' + path);
}
assert.equal(JSON.parse(readFileSync(join('node_modules', name, 'package.json'))).version,
  archive.version);
console.log(`Verified ${entries.length} packaged files; SHA256 ${sha256}`);
NODE
```

## Check the recorded producer source

The receipt records a comparison baseline at offline producer commit
`26ad83656f19a73e84d294e87672cb949bf614e3`, tree
`49876b4afd30659fff9367e14654204bb3690b24`. Eleven non-manifest files match
exactly. The archive's parsed manifest matches after omitting the source's
`packageManager: pnpm@10.28.0`; key order and final newline also differ.
This delivery was freshly packed from that exact candidate source with pnpm 10.28.0;
its digest identifies the shared producer delivery qualified in astro-offline PR4.
The prior archive remains at `vendor/effortlessmetrics-astro-offline-0.1.4.tgz`
for rollback. The new unpublished patch candidate is 0.1.5; the prior 0.1.4 bytes remain unchanged;
no registry version has been replaced.

Set `STILL_OFFLINE_SOURCE_DIR` to an existing authorized producer checkout or bare
clone to reuse it. Otherwise this command creates a disposable clone outside the
application and removes it on success or failure. The subshell preserves your
checkout, environment and exit traps. No producer install, build or publication
is performed.

```sh
(
if [ -z "${STILL_OFFLINE_SOURCE_DIR:-}" ]; then
  STILL_OFFLINE_TEMP_DIR=$(mktemp -d) || exit
  trap 'rm -rf -- "$STILL_OFFLINE_TEMP_DIR"' EXIT
  STILL_OFFLINE_SOURCE_DIR=$STILL_OFFLINE_TEMP_DIR
  git clone --no-checkout https://github.com/EffortlessMetrics/astro-offline.git "$STILL_OFFLINE_SOURCE_DIR" || exit
fi
export STILL_OFFLINE_SOURCE_DIR
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const name = '@effortlessmetrics/astro-offline';
const receipt = JSON.parse(readFileSync('STARTER-DELIVERY.json', 'utf8'));
const comparison = receipt.sourceComparisons[name];
const archive = receipt.archives[name];
assert.match(comparison.commit, /^[a-f0-9]{40}$/);
assert.match(comparison.tree, /^[a-f0-9]{40}$/);
assert.equal(createHash('sha256').update(readFileSync(archive.file)).digest('hex'),
  comparison.archiveSha256, 'Comparison belongs to different archive bytes');
assert.equal(comparison.archiveSha256, archive.sha256);
const git = (...args) => execFileSync('git', ['-C', process.env.STILL_OFFLINE_SOURCE_DIR, ...args]);
assert.equal(git('rev-parse', comparison.commit + '^{tree}').toString().trim(), comparison.tree);
const entries = execFileSync('tar', ['-tzf', archive.file], {encoding: 'utf8'})
  .trim().split('\n').filter(path => !path.endsWith('/'));
let matched = 0;
for (const path of entries) {
  assert.ok(path.startsWith('package/') && !path.split('/').includes('..'));
  const file = path.slice(8);
  const packed = execFileSync('tar', ['-xOzf', archive.file, path]);
  const source = git('show', comparison.commit + ':' + file);
  if (file === 'package.json') {
    const actual = JSON.parse(packed), expected = JSON.parse(source);
    for (const [field, value] of Object.entries(comparison.omittedManifestFields)) {
      assert.equal(expected[field], value);
      assert.ok(!Object.hasOwn(actual, field));
      delete expected[field];
    }
    assert.deepEqual(actual, expected, 'Unrecorded manifest difference');
  } else {
    assert.deepEqual(packed, source, 'Source file differs: ' + file);
    matched++;
  }
}
assert.equal(entries.length, comparison.packagedFiles);
assert.equal(matched, comparison.byteIdenticalFiles);
console.log(`Verified source comparison: ${comparison.commit}, ${matched} byte-identical files`);
NODE
)
```

## Replace one independently reviewed archive

Keep the previous archive and its receipt/lock record for rollback. Save the new
archive at a new versioned path. Verify its digest against the independently
reviewed value before installing; obtaining that value from the same unverified
download is not independent review. This runnable example retains the current pin:

```sh
export STILL_UPGRADE_ARCHIVE=vendor/effortlessmetrics-astro-offline-0.1.5.tgz
export STILL_UPGRADE_SHA256=e8cb8779d076896e437fb309a5c3ce2d15d5620a1e1d0508d614ff6f09d17a06
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
assert.equal(createHash('sha256').update(readFileSync(process.env.STILL_UPGRADE_ARCHIVE)).digest('hex'),
  process.env.STILL_UPGRADE_SHA256, 'Archive differs from independently reviewed digest');
NODE
npm install --save-exact --ignore-scripts "@effortlessmetrics/astro-offline@file:${STILL_UPGRADE_ARCHIVE}"
```

For a real replacement, update only that library's `archives` path/version/SHA256
in `STARTER-DELIVERY.json`, review the dependency and regenerated lockfile, and
replace or remove its old `sourceComparisons` entry. Record new commit/tree and
manifest differences only after actual source comparison. Keep other library pins
independent. Do not reuse this archive's comparison for a different digest, label
an equivalent source tree as a proven packing origin, or copy historical `PASS`
qualification to new bytes. Set `localBrowserAcceptance` and `hostedAcceptance` to
`NOT RUN` after replacing an archive until the corresponding checks are executed.
Retain your application's chosen terms and the template/component/font notices.

Run a fresh frozen install and the documented check/build/verification/test commands
in both preview and production. Then compare worker/output before any deployment,
and perform fresh install, offline navigation and reconnect on the actual host.
The examples above establish byte/source equivalence only. Browser lifecycle and
hosted acceptance remain separate gates. Restore the prior archive, receipt and lock,
rebuild and check matching output for rollback; controlled clients may retain a newer
worker even after a deployment rollback.
