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

/** Run ownership scenarios in an isolated consumer and remove it after failures. */
async function consumerFixture(action) {
  const root = await mkdtemp(join(tmpdir(), 'still-owner-licenses-'));
  try {
    for (const file of ['package.json', 'licenses', 'vendor', 'STARTER-DELIVERY.json'])
      await cp(join(source, file), join(root, file), { recursive: true });
    for (const name of names)
      await cp(join(source, 'node_modules', name), join(root, 'node_modules', name), { recursive: true });
    const run = () => spawnSync(process.execPath, [guard], { cwd: root, encoding: 'utf8' });
    await action(root, run);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('application terms, privacy and scoped owner notices are independent of retained upstream grants', async () => {
  await consumerFixture(async (root, run) => {
    await writeFile(join(root, 'LICENSE'), 'All rights reserved for independently authored application content. Reused upstream template material retains its separate grants in licenses/template/. Fonts and dependencies retain their own terms.\n');
    const manifest = JSON.parse(await readFile(join(root, 'package.json')));
    for (const choice of [
      { private: true, license: 'UNLICENSED' },
      { private: true, license: 'MIT' },
      { private: false, license: 'LicenseRef-Proprietary' },
    ]) {
      await writeFile(join(root, 'package.json'), JSON.stringify({ ...manifest, ...choice }));
      const result = run();
      assert.equal(result.status, 0, result.stderr);
    }
  });
});

test('owner notices do not replace required template or component notices', async () => {
  await consumerFixture(async (root, run) => {
    await writeFile(join(root, 'LICENSE'), await readFile(join(root, 'licenses/template/LICENSE-MIT')));
    for (const path of ['licenses/template/LICENSE-MIT', 'node_modules/@effortlessmetrics/still/LICENSE-APACHE']) {
      const bytes = await readFile(join(root, path));
      await rm(join(root, path));
      const result = run();
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /ENOENT/);
      await writeFile(join(root, path), bytes);
    }
    const mitPath = join(root, 'node_modules/@effortlessmetrics/still/LICENSE-MIT');
    const mit = await readFile(mitPath, 'utf8');
    await writeFile(mitPath, mit.replace('Steven Zimmerman', 'Unrelated Rights Holder'));
    assert.notEqual(run().status, 0, 'Owner application terms cannot erase upstream attribution');
    await writeFile(mitPath, mit);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  });
});
test('complete Apache terms survive formatting changes; missing patent grants fail in every notice', async () => {
  await consumerFixture(async (root, run) => {
    for (const path of ['licenses/template/LICENSE-APACHE', ...names.map((name) => 'node_modules/' + name + '/LICENSE-APACHE')]) {
      const file = join(root, path);
      const original = await readFile(file, 'utf8');
      const incomplete = original.replace(/3\. Grant of Patent License\.[\s\S]*?(?=4\. Redistribution\.)/, '');
      assert.notEqual(incomplete, original);
      assert.ok(incomplete.length > 1000);
      assert.match(incomplete, /Version 2\.0/);
      assert.match(incomplete, /END OF TERMS AND CONDITIONS/);
      await writeFile(file, incomplete);
      const rejected = run();
      assert.notEqual(rejected.status, 0, path);
      assert.match(rejected.stderr, /complete Apache 2\.0 terms are retained/);
      await writeFile(file, original.replace(/\s+/g, ' \r\n'));
      const formatted = run();
      assert.equal(formatted.status, 0, formatted.stderr);
      await writeFile(file, original);
    }
  });
});
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
