import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const digest = (bytes, algorithm, encoding) => createHash(algorithm).update(bytes).digest(encoding);
export const libraries = ['@effortlessmetrics/still', 'astromache', '@effortlessmetrics/astro-offline'];

/** Bind bundled delivery evidence to the active consumer, without installing it. */
export function verifyDelivery(root = process.cwd(), names = libraries) {
  root = realpathSync(root);
  const application = json(join(root, 'package.json'));
  const lock = json(join(root, 'package-lock.json'));
  const receipt = json(join(root, 'STARTER-DELIVERY.json'));
  return names.map((name) => {
    const declared = application.dependencies?.[name];
    const delivery = receipt.archives?.[name];
    assert.ok(delivery, `${name}: bundled delivery receipt required`);
    assert.equal(typeof delivery.file, 'string', `${name}: archive path required`);
    assert.ok(!isAbsolute(delivery.file) && !delivery.file.includes('\\') &&
      delivery.file.split('/').every((part) => part && part !== '.' && part !== '..'), `${name}: archive path must be relative and contained`);
    assert.equal(declared, `file:${delivery.file}`, `${name}: active manifest must match receipt`);
    assert.equal(lock.packages?.['']?.dependencies?.[name], declared, `${name}: lock root must match active manifest`);
    const locked = lock.packages?.[`node_modules/${name}`];
    assert.ok(locked, `${name}: installed lock entry required`);
    assert.equal(locked.resolved, declared, `${name}: resolved lock path must match active archive`);
    assert.equal(locked.version, delivery.version, `${name}: lock version must match receipt`);
    const contained = (file) => {
      const actual = realpathSync(file);
      const path = relative(root, actual);
      assert.ok(path !== '..' && !path.startsWith('../') && !isAbsolute(path), `${name}: delivered and installed paths must stay inside consumer`);
      return actual;
    };
    const archive = contained(join(root, delivery.file));
    const bytes = readFileSync(archive);
    assert.equal(digest(bytes, 'sha256', 'hex'), delivery.sha256, `${name}: archive SHA256 must match receipt`);
    assert.equal(locked.integrity, 'sha512-' + digest(bytes, 'sha512', 'base64'), `${name}: lock integrity must match archive`);
    const tar = (...args) => execFileSync('tar', args, {encoding: 'utf8'}).trim().split(/\r?\n/);
    const members = tar('-tf', archive);
    assert.ok(tar('-tvf', archive).every((line) => line[0] === '-' || line[0] === 'd'), `${name}: archive permits only regular files and directories`);
    assert.equal(new Set(members).size, members.length, `${name}: duplicate archive members`);
    for (const member of members)
      assert.ok(member.startsWith('package/') && !member.includes('\\') &&
        !member.split('/').some((part) => part === '..' || part === '.'), `${name}: unsafe archive member`);
    const files = members.filter((member) => !member.endsWith('/'));
    assert.ok(files.includes('package/package.json'), `${name}: packed manifest required`);
    const packedBytes = (member) => execFileSync('tar', ['-xOf', archive, member]);
    const packed = JSON.parse(packedBytes('package/package.json'));
    assert.equal(packed.name, name, `${name}: packed name must match dependency`);
    assert.equal(packed.version, delivery.version, `${name}: packed version must match receipt`);
    for (const member of files) {
      const installed = contained(join(root, 'node_modules', name, member.slice(8)));
      assert.deepEqual(readFileSync(installed), packedBytes(member), `${name}: installed bytes differ: ${member}`);
    }
    return {name, version: packed.version, sha256: delivery.sha256, files: files.length};
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(verifyDelivery(), null, 2));
