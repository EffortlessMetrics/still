import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, symlink, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const producer = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const fixture = await realpath(await mkdtemp(join(tmpdir(), 'starter-paths-')));
const outsideAlias = join(fixture, 'into-producer');
const insideAlias = join(producer, 'node_modules', basename(fixture));
const leaf = `rejected-${basename(fixture)}`;
const run = destination => spawnSync(process.execPath, [join(producer, 'scripts/create-starter.mjs'), destination], { cwd: producer, encoding: 'utf8' });
await symlink(producer, outsideAlias, 'junction');
try {
  const rejected = run(join(outsideAlias, leaf));
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Destination must be outside the producer checkout/);
  await assert.rejects(access(join(producer, leaf)), { code: 'ENOENT' });
  await mkdir(join(fixture, 'outside'));
  await symlink(join(fixture, 'outside'), insideAlias, 'junction');
  try {
    const accepted = run(join(insideAlias, 'consumer'));
    assert.equal(accepted.status, 0, accepted.stderr);
    const destination = join(fixture, 'outside', 'consumer');
    assert.equal(await realpath(join(insideAlias, 'consumer')), await realpath(destination));
    assert.equal(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')).private, true);
    const refused = run(join(insideAlias, 'consumer'));
    assert.notEqual(refused.status, 0, 'Existing consumer must not be replaced');
    assert.match(refused.stderr, /EEXIST/);
    console.log('Canonical export paths passed: alias into producer refused without writes; alias out accepted; existing consumer refused.');
  } finally { await unlink(insideAlias); }
} finally { await unlink(outsideAlias); }
