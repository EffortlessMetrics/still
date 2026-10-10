import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = process.cwd();
const guard = resolve(source, 'scripts/verify-licenses.mjs');
const names = ['astromache', '@effortlessmetrics/still', '@effortlessmetrics/astro-offline'];
test('active delivery and version-independent bundled/registry license fixtures', async () => {
  const actual = spawnSync(process.execPath, [guard], { cwd: source, encoding: 'utf8' });
  assert.equal(actual.status, 0, actual.stderr);
  const root = await mkdtemp(join(tmpdir(), 'still-license-'));
  try {
    for (const file of ['package.json', 'licenses'])
      await cp(join(source, file), join(root, file), { recursive: true });
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const receipt = { archives: {} };
    const versions = {};
    for (const [index, name] of names.entries()) {
      await cp(join(source, 'node_modules', name), join(root, 'node_modules', name), { recursive: true });
      const bytes = await readFile(join(root, 'node_modules', name, 'package.json'));
      versions[name] = JSON.parse(bytes).version;
      // Synthetic consistency bytes, NOT a real npm archive or registry release.
      const file = `library-${index}.fixture`;
      await writeFile(join(root, file), bytes);
      manifest.dependencies[name] = `file:${file}`;
      receipt.archives[name] = { file, version: versions[name], sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    const saveManifest = () => writeFile(join(root, 'package.json'), JSON.stringify(manifest));
    const receiptPath = join(root, 'STARTER-DELIVERY.json');
    const saveReceipt = () => writeFile(receiptPath, JSON.stringify(receipt));
    const run = () => spawnSync(process.execPath, [guard], { cwd: root, encoding: 'utf8' });
    await saveManifest(); await saveReceipt();
    assert.equal(run().status, 0, 'valid synthetic bundled consistency fixture');
    const installedPath = join(root, 'node_modules/astromache/package.json');
    const installedBytes = await readFile(installedPath);
    const installed = JSON.parse(installedBytes);
    const differentVersion = `${Number(installed.version.split('.')[0]) + 1}.0.0`;
    await writeFile(installedPath, JSON.stringify({ ...installed, name: 'different-library' }));
    assert.notEqual(run().status, 0, 'installed package identity must match');
    await writeFile(installedPath, installedBytes);
    const archive = join(root, receipt.archives.astromache.file);
    const bytes = await readFile(archive);
    await writeFile(archive, Buffer.concat([bytes, Buffer.from('corruption')]));
    assert.notEqual(run().status, 0, 'corrupted bundled bytes must fail');
    await writeFile(archive, bytes);
    receipt.archives.astromache.version = differentVersion;
    await saveReceipt();
    assert.notEqual(run().status, 0, 'bundled installed version must match receipt');
    receipt.archives.astromache.version = installed.version;
    receipt.archives.astromache.file = 'other.fixture';
    await saveReceipt();
    assert.notEqual(run().status, 0, 'bundled declared path must match receipt');
    for (const name of names) manifest.dependencies[name] = versions[name];
    await saveManifest(); await rm(receiptPath);
    assert.equal(run().status, 0, 'exact registry fixture works without historical receipt or vendor directory');
    await writeFile(installedPath, JSON.stringify({ ...installed, version: differentVersion }));
    assert.notEqual(run().status, 0, 'dynamically different installed version must fail');
    manifest.dependencies.astromache = differentVersion;
    await saveManifest();
    assert.equal(run().status, 0, 'future matching exact installed version works without receipt');
    manifest.dependencies.astromache = `^${differentVersion}`;
    await saveManifest();
    assert.notEqual(run().status, 0, 'floating registry ranges must fail');
  } finally { await rm(root, { recursive: true, force: true }); }
});
