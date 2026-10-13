import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the installed candidate's routing boundary. Real worker install,
// integrity, activation and reconnect remain browser acceptance requirements.
const worker = await readFile(new URL('../node_modules/@effortlessmetrics/astro-offline/src/worker.mjs', import.meta.url), 'utf8');
function fixture({dual = false, stripQuery = false} = {}) {
  const routes = [];
  class PrecacheController {
    addToCacheList(entries) { this.entries = new Map(entries.map(entry => [entry.url, entry])); }
    getCacheKeyForURL(path) { return this.entries.has(path) ? path : undefined; }
    async matchPrecache(path) {
      return this.entries.has(path) ? new Response(path.endsWith('/index.html') ? 'exact file' : 'directory page') : undefined;
    }
  }
  const scope = vm.createContext({URL, Response, Request, AbortController, setTimeout, clearTimeout,
    self: {location: {origin: 'https://consumer.example'}, addEventListener() {}},
    PrecacheController, clientsClaim() { throw new Error('No forced client control'); },
    registerRoute(match, handle) { routes.push({match, handle}); },
    fetch: async () => { throw new TypeError('Offline fixture'); }});
  vm.runInContext(worker.replace(/^import .*;\n/gm, '').replace('export function installWorker', 'function installWorker'), scope);
  const directories = ['/', '/sessions/', '/nested/sessions/', '/with.dot/'];
  scope.installWorker({navigationStrategy: 'network-first', stripQuery, excludedPrefixes: ['/private/']},
    [...directories, ...(dual ? directories.map(path => path + 'index.html') : [])]
      .map(url => ({url, digest: '0'.repeat(64)})), 'fixture', 'consumer-fixture-');
  return {route: routes[0], input: (path, mode = 'navigate', method = 'GET') => ({
    url: new URL(path, 'https://consumer.example'), request: {url: new URL(path, 'https://consumer.example').href, mode, method}})};
}

test('installed offline candidate resolves explicit index documents from directory-only corpus', async () => {
  const {route, input} = fixture();
  for (const path of ['/index.html', '/sessions/index.html', '/nested/sessions/index.html', '/with.dot/index.html']) {
    assert.equal(route.match(input(path)), true, `${path} must match its verified directory`);
    const response = await route.handle(input(path));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'directory page');
  }
  assert.equal(route.match(input('/sessions/')), true);
  const redirect = await route.handle(input('/sessions'));
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://consumer.example/sessions/');
});

test('installed offline candidate keeps a distinct exact file before its directory alias', async () => {
  const {route, input} = fixture({dual: true});
  for (const path of ['/index.html', '/sessions/index.html', '/nested/sessions/index.html', '/with.dot/index.html'])
    assert.equal(await (await route.handle(input(path))).text(), 'exact file', 'Exact cached file must win');
  assert.equal(await (await route.handle(input('/sessions/'))).text(), 'directory page');
  assert.equal(route.match(input('/sessions/index.html', 'cors')), true, 'Existing exact-file resource matches are retained');
});

test('installed offline aliases retain method, origin, query, exclusion and resource guards', () => {
  const {route, input} = fixture();
  for (const path of ['/sessions/index.html?q=1', '/private/index.html', '/api/index.html', '/sessions/other.html', '/sessions/index.html/', 'https://other.example/sessions/index.html'])
    assert.equal(route.match(input(path)), false, path);
  assert.equal(route.match(input('/sessions/index.html', 'cors')), false);
  assert.equal(route.match(input('/sessions/index.html', 'navigate', 'POST')), false);
  const stripped = fixture({stripQuery: true});
  assert.equal(stripped.route.match(stripped.input('/sessions/index.html?q=1')), true);
});
