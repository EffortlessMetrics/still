import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the installed candidate's routing boundary. Real worker install,
// integrity, activation and reconnect remain browser acceptance requirements.
const worker = await readFile(new URL('../node_modules/@effortlessmetrics/astro-offline/src/worker.mjs', import.meta.url), 'utf8');
function fixture({dual = false, stripQuery = false, transport = {}, policy = {}} = {}) {
  const routes = [];
  const cacheReads = [];
  class PrecacheController {
    addToCacheList(entries) { this.entries = new Map(entries.map(entry => [entry.url, entry])); }
    getCacheKeyForURL(path) { return this.entries.has(path) ? path : undefined; }
    async matchPrecache(path) {
      cacheReads.push(path);
      return this.entries.has(path) ? new Response(path.endsWith('/index.html') ? 'exact file' : 'directory page') : undefined;
    }
  }
  const scope = vm.createContext({URL, Response, Request, AbortController, setTimeout, clearTimeout,
    self: {location: {origin: 'https://consumer.example'}, addEventListener() {}},
    PrecacheController, clientsClaim() { throw new Error('No forced client control'); },
    registerRoute(match, handle) { routes.push({match, handle}); },
    fetch: async () => { throw new TypeError('Offline fixture'); }, ...transport});
  vm.runInContext(worker.replace(/^import .*;\n/gm, '').replace('export function installWorker', 'function installWorker'), scope);
  const directories = ['/', '/sessions/', '/nested/sessions/', '/with.dot/', '/offline/'];
  scope.installWorker({navigationStrategy: 'network-first', stripQuery, excludedPrefixes: ['/private/'], ...policy},
    [...directories, ...(dual ? directories.map(path => path + 'index.html') : [])]
      .map(url => ({url, digest: '0'.repeat(64)})), 'fixture', 'consumer-fixture-');
  return {route: routes[0], routes, cacheReads, input: (path, mode = 'navigate', method = 'GET') => ({
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

// Control a hung transport without sleeps or a real network. Each call keeps its
// own deadline and signal, so overlapping attempts can expose cross-talk.
function interruptedTransport() {
  const deadlines = new Map();
  const calls = [];
  let nextID = 0;
  return {calls, deadlines, transport: {
    setTimeout(callback, delay) {
      assert.equal(delay, 37, 'Configured navigation deadline must be used');
      deadlines.set(++nextID, callback);
      return nextID;
    },
    clearTimeout(id) { deadlines.delete(id); },
    fetch(request, options) {
      return new Promise((resolve, reject) => {
        const call = {request, options, resolve, reject, deadline: nextID};
        calls.push(call);
        options.signal.throwIfAborted();
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {once: true});
      });
    },
  }, expire(call) {
    const callback = deadlines.get(call.deadline);
    assert.ok(callback, 'Request still owns a pending deadline');
    deadlines.delete(call.deadline);
    callback();
  }};
}

for (const target of ['precache', 'fallback']) {
  test(`installed offline ${target} route isolates interrupted navigation and repeated recovery`, {timeout: 2000}, async () => {
    const network = interruptedTransport();
    const {routes, input, cacheReads} = fixture({transport: network.transport,
      policy: {navigationTimeoutMs: 37, navigationFallback: '/offline/'}});
    // Use the same routing order as Workbox: known pages first, fallback second.
    const path = target === 'precache' ? '/sessions/index.html' : '/unavailable/';
    const navigate = () => {
      const args = input(path);
      const route = routes.find(route => route.match(args));
      assert.equal(route, routes[target === 'precache' ? 0 : 1]);
      return route.handle(args);
    };
    for (let cycle = 0; cycle < 3; cycle++) {
      const interrupted = navigate();
      const first = network.calls.at(-1);
      const recovering = navigate();
      const second = network.calls.at(-1);
      assert.notEqual(first.options.signal, second.options.signal);
      assert.equal(network.deadlines.size, 2);
      network.expire(first);
      assert.equal(first.options.signal.aborted, true);
      assert.equal(second.options.signal.aborted, false, 'One timeout must not abort another navigation');
      assert.equal(await (await interrupted).text(), 'directory page');
      assert.equal(network.deadlines.size, 1);
      const online = new Response(`reconnected ${cycle}`, {headers: {'x-fixture': 'online'}});
      second.resolve(online);
      assert.equal(await recovering, online, 'Online response must be returned unchanged');
      assert.equal(network.deadlines.size, 0, 'Successful navigation must clear its deadline');
      assert.equal(second.options.signal.aborted, false);

      // Retry a real transport rejection after the preceding timeout/reconnect.
      const offline = navigate();
      network.calls.at(-1).reject(new TypeError('Disconnected again'));
      assert.equal(await (await offline).text(), 'directory page');
      assert.equal(network.deadlines.size, 0, 'Transport failure must clear its deadline');

      const errorNavigation = navigate();
      const httpError = new Response('server unavailable', {status: 503});
      network.calls.at(-1).resolve(httpError);
      assert.equal(await errorNavigation, httpError, 'HTTP errors must not be hidden by cached HTML');
      assert.equal(network.deadlines.size, 0);
    }
    assert.deepEqual(cacheReads, Array.from({length: 6}, () => target === 'precache'
      ? ['/sessions/index.html', '/sessions/'] : ['/offline/']).flat(),
    'Only failed attempts consult the intended cached document');
    assert.equal(network.calls.length, 12, 'Every repeated navigation retries transport');
    if (target === 'precache')
      assert.ok(network.calls.every(call => call.options.cache === 'no-cache'));
  });
}

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
