import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync, renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {route} from './route.mjs';

const events = JSON.parse(readFileSync(new URL('./fixtures/events.json', import.meta.url)));
function history(fn) {
  const cwd = mkdtempSync(join(tmpdir(), 'still-route-'));
  const git = (...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
  const put = (path, text = path) => {mkdirSync(dirname(join(cwd,path)),{recursive:true});writeFileSync(join(cwd,path),text);};
  const commit = () => {git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD');};
  try {git('init','-q');put('src/page.astro');put('evidence/sw-lifecycle/probe.cjs','const x=1;');const base=commit(); fn({cwd,git,put,commit,base});}
  finally {rmSync(cwd,{recursive:true,force:true});}
}
function both(base, head, cwd, product) {
  for(const fixture of events) {
    const event=JSON.parse(JSON.stringify(fixture.event).replaceAll('BASE',base).replaceAll('HEAD',head));
    assert.equal(route(fixture.name,event,cwd).product,product, fixture.name);
  }
}
test('draft PR and main push evidence changes avoid product matrix',()=>history(({cwd,put,commit,base})=>{
  put('evidence/sw-failed-precache/probe.mjs','const x=2;');both(base,commit(),cwd,false);
}));
test('every product boundary and unknown namespace fails closed, including mixed changes',()=>{
  for(const path of ['src/page.astro','public/_headers','vendor/new.tgz','licenses/template/LICENSE','scripts/offline-routes.test.mjs','package.json','package-lock.json','STARTER-DELIVERY.json','SOURCE-PROVENANCE.json','astro.config.mjs','site.config.mjs','tsconfig.json','.github/workflows/starter.yml','ci/proportional-evidence/route.mjs','README.md','evidence/unknown/probe.mjs']) {
    history(({cwd,put,commit,base})=>{put(path,'changed');put('evidence/sw-lifecycle/new.log');both(base,commit(),cwd,true);});
  }
});
test('deletion and evidence rename stay narrow; product moved into evidence is full',()=>{
  history(({cwd,commit,base})=>{rmSync(join(cwd,'evidence/sw-lifecycle/probe.cjs'));both(base,commit(),cwd,false);});
  history(({cwd,commit,base})=>{renameSync(join(cwd,'evidence/sw-lifecycle/probe.cjs'),join(cwd,'evidence/sw-lifecycle/renamed.cjs'));both(base,commit(),cwd,false);});
  history(({cwd,put,commit,base})=>{put('evidence/sw-lifecycle/page.astro');renameSync(join(cwd,'src/page.astro'),join(cwd,'evidence/sw-lifecycle/page.astro'));both(base,commit(),cwd,true);});
});
test('malformed, zero, missing, stale head, empty and unsupported events fail closed',()=>history(({cwd,base})=>{
  both(base,base,cwd,true);
  for(const event of [{},{before:'0'.repeat(40),after:base},{before:'a'.repeat(40),after:base},{before:base,after:'a'.repeat(40)},{before:'HEAD',after:base}]) assert.equal(route('push',event,cwd).product,true);
  assert.equal(route('workflow_dispatch',{},cwd).product,true);
  assert.equal(route('pull_request',{},cwd).product,true);
}));
test('PR uses merge base; main push compares complete before/after history',()=>history(({cwd,git,put,commit,base})=>{
  put('evidence/sw-lifecycle/new.log');const head=commit();
  git('checkout','-qb','base-moved',base);put('src/base-change.astro');const moved=commit();git('checkout','-q','--detach',head);
  assert.equal(route('pull_request',{pull_request:{base:{sha:moved},head:{sha:head}}},cwd).product,false);
  assert.equal(route('push',{before:moved,after:head},cwd).product,true);
}));
