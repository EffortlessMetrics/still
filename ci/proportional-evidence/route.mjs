import {execFileSync} from 'node:child_process';
import {readFileSync, appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Deliberately small allowlist. New namespaces and CI policy changes need full qualification.
export const evidencePath = path => /^evidence\/(sw-lifecycle|sw-failed-precache)\/[^\0]+$/.test(path)
  && !path.split('/').some(part => part === '..' || part === '.');
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
export function route(eventName, event, cwd = process.cwd()) {
  const full = reason => ({product: true, reason, paths: []});
  try {
    let base, head, comparison;
    if (eventName === 'pull_request') {
      ({base: {sha: base}, head: {sha: head}} = event.pull_request);
      comparison = '...';
    } else if (eventName === 'push') {
      ({before: base, after: head} = event);
      comparison = '..';
    } else return full('unsupported event');
    if (!sha(base) || !sha(head)) return full('missing or invalid commit identity');
    const git = args => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    if (git(['rev-parse', 'HEAD']).trim() !== head) return full('checkout differs from event head');
    // --no-renames includes both old and new paths: moving product into evidence cannot hide it.
    const paths = git(['diff', '--no-renames', '--name-only', '-z', base + comparison + head, '--']).split('\0').filter(Boolean);
    if (!paths.length) return full('empty diff');
    return {product: !paths.every(evidencePath), reason: paths.every(evidencePath) ? 'allowlisted evidence only' : 'product or unknown path', paths};
  } catch {
    return full('event or Git comparison unavailable');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try { result = route(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))); }
  catch { result = {product: true, reason: 'unreadable event', paths: []}; }
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `product=${result.product}\n`);
}
