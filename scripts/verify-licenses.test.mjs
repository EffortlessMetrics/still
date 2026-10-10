import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = process.cwd();
test('bundled integrity and future exact registry pins retain license boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'still-license-'));
  try {
    for (const file of ['package.json', 'STARTER-DELIVERY.json', 'licenses', 'vendor'])
      await cp(join(source, file), join(root, file), { recursive: true });
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    for (const name of ['astromache', '@effortlessmetrics/still', '@effortlessmetrics/astro-offline'])
      await cp(join(source, 'node_modules', name), join(root, 'node_modules', name), { recursive: true });
    const run = () => spawnSync(process.execPath, [resolve(source, 'scripts/verify-licenses.mjs')], { cwd: root, encoding: 'utf8' });
    assert.equal(run().status, 0, 'valid bundled mode');
    const installedPath = join(root, 'node_modules/astromache/package.json');
    const installedBytes = await readFile(installedPath);
    const wrongIdentity = JSON.parse(installedBytes);
    wrongIdentity.name = 'different-library';
    await writeFile(installedPath, JSON.stringify(wrongIdentity));
    assert.notEqual(run().status, 0, 'installed package name must match required dependency');
    await writeFile(installedPath, installedBytes);
    const archive = join(root, 'vendor/astromache-0.2.6.tgz');
    const bytes = await readFile(archive);
    await writeFile(archive, Buffer.concat([bytes, Buffer.from('corruption')]));
    assert.notEqual(run().status, 0, 'corrupted bundled archive must fail');
    await writeFile(archive, bytes);
    const receiptPath = join(root, 'STARTER-DELIVERY.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.archives.astromache.version = '0.2.8';
    await writeFile(receiptPath, JSON.stringify(receipt));
    assert.notEqual(run().status, 0, 'bundled installed version must match receipt');
    receipt.archives.astromache.version = '0.2.6';
    receipt.archives.astromache.file = 'vendor/other.tgz';
    await writeFile(receiptPath, JSON.stringify(receipt));
    assert.notEqual(run().status, 0, 'bundled declared path must match receipt');
    for (const name of ['astromache', '@effortlessmetrics/still', '@effortlessmetrics/astro-offline']) {
      const installed = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'));
      manifest.dependencies[name] = installed.version;
    }
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
    // Installed candidate bytes stand in for a future exact registry installation;
    // this test performs no registry publication or download.
    await rm(join(root, 'STARTER-DELIVERY.json'));
    assert.equal(run().status, 0, 'registry mode must not require historical delivery receipt');
    manifest.dependencies.astromache = '0.2.8';
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
    assert.notEqual(run().status, 0, 'declared exact version must match installed version');
    manifest.dependencies.astromache = '^0.2.6';
    await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
    assert.notEqual(run().status, 0, 'floating registry ranges must fail');
  } finally { await rm(root, { recursive: true, force: true }); }
});
