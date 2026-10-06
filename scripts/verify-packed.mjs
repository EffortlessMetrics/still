import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const npm = 'npm';
const npmArgs = process.platform === 'win32' ? [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')] : [];
function run(command, args, cwd, capture = false, env = process.env) {
  const commandArgs = command === npm ? [...npmArgs, ...args] : args;
  const result = spawnSync(command === npm && process.platform === 'win32' ? process.execPath : command, commandArgs, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  assert.equal(result.status, 0, capture ? result.stderr : `${command} ${args.join(' ')} failed`);
  return result.stdout;
}
run(process.execPath, ['scripts/audit-boundary.mjs'], root);
const temporary = await mkdtemp(path.join(tmpdir(), 'still-packed-'));
try {
  const output = JSON.parse(run(npm, ['pack', '--workspace', '@effortlessmetrics/still', '--ignore-scripts', '--json', '--pack-destination', temporary], root, true))[0];
  const source = JSON.parse(await readFile(path.join(root, 'source-files.json'), 'utf8'));
  const expected = source.filter(file => file.startsWith('packages/still/')).map(file => file.slice('packages/still/'.length)).sort();
  assert.deepEqual(output.files.map(file => file.path).sort(), expected, 'Archive must contain only the complete reviewed package');
  const archive = path.join(temporary, output.filename);
  const consumer = path.join(temporary, 'consumer');
  for (const file of source.filter(file => file.startsWith('starter/'))) {
    const target = path.join(consumer, file.slice('starter/'.length));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
  }
  const manifestPath = path.join(consumer, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.dependencies['@effortlessmetrics/still'] = `file:../${output.filename}`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  run(npm, ['install', '--no-audit', '--no-fund'], consumer);
  run(npm, ['ci', '--no-audit', '--no-fund'], consumer);
  const installedPath = path.join(consumer, 'node_modules/@effortlessmetrics/still');
  assert((await realpath(installedPath)).startsWith(consumer), 'Consumer must not resolve a workspace symlink');
  const installed = JSON.parse(await readFile(path.join(installedPath, 'package.json'), 'utf8'));
  assert.equal(installed.repository.url, 'git+https://github.com/EffortlessMetrics/still.git');
  assert.equal(installed.homepage, 'https://github.com/EffortlessMetrics/still#readme');
  run(npm, ['run', 'check'], consumer);
  run(npm, ['run', 'build'], consumer);
  run(npm, ['run', 'test:browser'], root, false, { ...process.env, STILL_PACKED_CONSUMER: consumer });
  console.log(JSON.stringify({ version: installed.version, files: expected, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), isolatedInstall: 'passed', lockedReinstall: 'passed', types: 'passed', build: 'passed', browser: 'passed' }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
