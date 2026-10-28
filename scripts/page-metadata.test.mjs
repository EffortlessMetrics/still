import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePageMetadata } from '../src/page-metadata.mjs';

test('page metadata requires nonblank title and description', () => {
  assert.doesNotThrow(() => validatePageMetadata({ title: 'A page', description: 'A useful description' }));
  for (const field of ['title', 'description']) {
    for (const value of ['', ' \n\t', undefined, null, 42]) {
      const metadata = { title: 'A page', description: 'A useful description', [field]: value };
      assert.throws(() => validatePageMetadata(metadata), new RegExp(`Page ${field} must be a non-empty string`));
    }
  }
});

test('Astro build rejects a page with a blank description', async () => {
  const { mkdtemp, cp, readFile, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(), 'still-metadata-'));
  try {
    for (const path of ['src', 'scripts', 'public', 'astro.config.mjs', 'site.config.mjs', 'package.json', 'tsconfig.json']) {
      await cp(resolve(path), join(root, path), { recursive: true });
    }
    const copy = spawnSync('cp', ['-a', '--reflink=auto', resolve('node_modules'), join(root, 'node_modules')]);
    assert.equal(copy.status, 0, String(copy.stderr));
    const page = join(root, 'src/pages/index.astro');
    const source = await readFile(page, 'utf8');
    assert.match(source, /description="[^"]+"/);
    await writeFile(page, source.replace(/description="[^"]+"/, 'description="   "'));
    const build = spawnSync(process.execPath, [resolve('node_modules/.bin/astro'), 'build'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    });
    assert.notEqual(build.status, 0, build.stdout + build.stderr);
    assert.match(build.stdout + build.stderr, /Page description must be a non-empty string/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
