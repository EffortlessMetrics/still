import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDelivery, libraries } from './verify-delivery.mjs';

const source = process.cwd();
test('real bundled deliveries bind active manifest, lock, receipt and installed bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'still-delivery-contract-'));
  try {
    for (const file of ['package.json', 'package-lock.json', 'STARTER-DELIVERY.json', 'vendor', 'licenses'])
      await cp(join(source, file), join(root, file), {recursive: true});
    for (const name of libraries)
      await cp(join(source, 'node_modules', name), join(root, 'node_modules', name), {recursive: true});
    await writeFile(join(root, 'owner-content.txt'), 'Private replacement content stays consumer-owned.');
    const preserved = ['owner-content.txt', 'licenses/template/LICENSE-MIT', 'licenses/template/LICENSE-APACHE', 'vendor/effortlessmetrics-still-0.2.1.tgz'];
    const preservedBytes = await Promise.all(preserved.map((file) => readFile(join(root, file))));
    assert.equal(verifyDelivery(root).length, 3);
    const mutate = async (file, change, expected) => {
      const path = join(root, file), original = await readFile(path);
      try {
        await writeFile(path, change(original));
        assert.throws(() => verifyDelivery(root), expected);
      } finally { await writeFile(path, original); }
    };
    const edit = (change) => (bytes) => {
      const value = JSON.parse(bytes); change(value); return JSON.stringify(value);
    };
    const name = libraries[0];
    await t.test('legacy documented audit accepts a stale active pin; active verifier rejects it', async () => {
      const manifestPath = join(root, 'package.json');
      const original = await readFile(manifestPath);
      try {
        await writeFile(manifestPath, edit((value) => {value.dependencies[name] = 'file:vendor/not-installed.tgz';})(original));
        const guide = await readFile(join(source, 'UPGRADING.md'), 'utf8');
        const audit = guide.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/)[1]
          .replace("const name = '@effortlessmetrics/astro-offline'", "const name = '@effortlessmetrics/still'");
        const output = execFileSync(process.execPath, ['--input-type=module', '-e', audit], {cwd: root, encoding:'utf8'});
        assert.match(output, /Verified \d+ packaged files/);
        assert.throws(() => verifyDelivery(root), /active manifest/);
      } finally { await writeFile(manifestPath, original); }
    });
    for (const [label, change, expected] of [
      ['root pin', (v) => {v.packages[''].dependencies[name] = 'file:old.tgz';}, /lock root/],
      ['resolved path', (v) => {v.packages['node_modules/' + name].resolved = 'file:old.tgz';}, /resolved lock path/],
      ['lock version', (v) => {v.packages['node_modules/' + name].version = '0.0.0';}, /lock version/],
      ['lock digest', (v) => {v.packages['node_modules/' + name].integrity = 'sha512-stale';}, /lock integrity/],
    ]) await t.test(label, () => mutate('package-lock.json', edit(change), expected));
    await t.test('receipt digest', () => mutate('STARTER-DELIVERY.json', edit((v) => {v.archives[name].sha256 = '0'.repeat(64);}), /archive SHA256/));
    await t.test('installed runtime bytes', () => mutate('node_modules/' + name + '/src/Layout.astro', (bytes) => Buffer.concat([bytes, Buffer.from('\n<!-- stale -->')]), /installed bytes differ/));
    await t.test('archive corruption', async () => {
      const receipt = JSON.parse(await readFile(join(root, 'STARTER-DELIVERY.json')));
      await mutate(receipt.archives[name].file, (bytes) => Buffer.concat([bytes, Buffer.from('changed')]), /archive SHA256/);
    });
    await t.test('real older archive upgraded through npm and frozen installation', async () => {
      const run = (args) => execFileSync('npm', args, {cwd: root, stdio: 'pipe', timeout: 60000});
      const receipt = JSON.parse(await readFile(join(root, 'STARTER-DELIVERY.json')));
      const accepted = receipt.archives[name];
      const {createHash} = await import('node:crypto');
      const historical = 'vendor/effortlessmetrics-still-0.2.1.tgz';
      const bytes = await readFile(join(root, historical));
      receipt.archives[name] = {file: historical, version: '0.2.1', sha256: createHash('sha256').update(bytes).digest('hex')};
      await writeFile(join(root, 'STARTER-DELIVERY.json'), JSON.stringify(receipt));
      run(['install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', `${name}@file:${historical}`]);
      // Install only the three real packages from authenticated local archives.
      for (const library of libraries) {
        const entry = receipt.archives[library];
        await rm(join(root, 'node_modules', library), {recursive:true, force:true});
        const target = join(root, 'node_modules', library);
        await mkdir(target, {recursive:true});
        execFileSync('tar', ['-xf', join(root, entry.file), '--strip-components=1', '-C', target]);
      }
      assert.equal(verifyDelivery(root)[0].version, '0.2.1');
      receipt.archives[name] = accepted;
      await writeFile(join(root, 'STARTER-DELIVERY.json'), JSON.stringify(receipt));
      run(['install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', `${name}@file:${accepted.file}`]);
      run(['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund']);
      assert.equal(verifyDelivery(root)[0].version, accepted.version);
    });
    assert.equal(verifyDelivery(root).length, 3);
    for (const [index, file] of preserved.entries())
      assert.deepEqual(await readFile(join(root, file)), preservedBytes[index], `${file} must survive upgrade`);
  } finally { await rm(root, {recursive: true, force: true}); }
});
