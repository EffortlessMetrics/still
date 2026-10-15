import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, lstatSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {evidencePath} from './route.mjs';

// Parse and authenticate recorded evidence; never execute probes or install browser tooling.
export function validate(cwd = process.cwd()) {
  const files = execFileSync('git', ['ls-files', '-z', '--', 'evidence/'], {cwd, encoding: 'utf8'}).split('\0').filter(Boolean);
  const covered = new Set();
  // Check every inode before reading any manifest target.
  for (const file of files) {
    assert(evidencePath(file), `Unreviewed evidence namespace: ${file}`);
    assert(lstatSync(resolve(cwd, file)).isFile(), `Evidence must be a regular file: ${file}`);
  }
  for (const file of files) {
    const source = readFileSync(resolve(cwd, file), 'utf8');
    if (/\.(mjs|cjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', resolve(cwd, file)], {stdio: 'pipe'});
    if (file.endsWith('.json')) JSON.parse(source);
    if (file.endsWith('.jsonl')) for (const line of source.trim().split('\n')) JSON.parse(line);
    if (file.endsWith('/SHA256SUMS')) {
      for (const line of source.trim().split('\n')) {
        const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
        assert(match && !['.', '..'].includes(match[2]), `Invalid digest record: ${file}`);
        const target = dirname(file) + '/' + match[2];
        assert(files.includes(target), `Digest target is not tracked: ${target}`);
        assert(!covered.has(target), `Duplicate digest: ${target}`);
        const actual = createHash('sha256').update(readFileSync(resolve(cwd, target))).digest('hex');
        assert.equal(actual, match[1], `Digest mismatch: ${target}`);
        covered.add(target);
      }
    }
  }
  for (const file of files) if (!file.endsWith('/SHA256SUMS')) assert(covered.has(file), `Missing digest: ${file}`);
  // An absent corpus is legitimate for initial policy integration, but is visible in the result.
  return {files: files.length, authenticated: covered.size};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(validate()));
