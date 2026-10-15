import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validate} from './validate.mjs';
function corpus(fn) {
  const cwd=mkdtempSync(join(tmpdir(),'still-evidence-'));
  const dir=join(cwd,'evidence/sw-lifecycle');
  const git=(...args)=>execFileSync('git',args,{cwd,stdio:'pipe'});
  const put=(name,body)=>writeFileSync(join(dir,name),body);
  const seal=()=>{const names=['probe.cjs','result.json','browser.jsonl'];put('SHA256SUMS',names.map(name=>createHash('sha256').update(readFileSync(join(dir,name))).digest('hex')+'  '+name).join('\n')+'\n');git('add','.');};
  try {git('init','-q');mkdirSync(dir,{recursive:true});put('probe.cjs','throw Error("MUST NOT EXECUTE");');put('result.json','{"passed":true}');put('browser.jsonl','{"event":"a"}\n{"event":"b"}\n');seal();fn({cwd,dir,put,seal,git});}
  finally {rmSync(cwd,{recursive:true,force:true});}
}
test('authenticates corpus and syntax without executing probes',()=>corpus(({cwd})=>assert.deepEqual(validate(cwd),{files:4,authenticated:3})));
test('corrupt evidence is rejected',()=>corpus(({cwd,put})=>{put('result.json','{}');assert.throws(()=>validate(cwd),/Digest mismatch/);}));
test('invalid JS, JSON and JSONL fail even with matching digests',()=>{
  for(const [name,body] of [['probe.cjs','const = ;'],['result.json','{oops}'],['browser.jsonl','{}\ninvalid']]) corpus(({cwd,put,seal})=>{put(name,body);seal();assert.throws(()=>validate(cwd));});
});
test('unlisted, missing, traversal and duplicate digest records fail',()=>{
  corpus(({cwd,put,git})=>{put('unlisted.log','x');git('add','.');assert.throws(()=>validate(cwd),/Missing digest/);});
  corpus(({cwd,put})=>{put('SHA256SUMS','a'.repeat(64)+'  missing.log\n');assert.throws(()=>validate(cwd),/not tracked/);});
  corpus(({cwd,put})=>{put('SHA256SUMS','a'.repeat(64)+'  ../escape\n');assert.throws(()=>validate(cwd),/Invalid digest/);});
  corpus(({cwd,dir,put})=>{const manifest=readFileSync(join(dir,'SHA256SUMS'),'utf8');put('SHA256SUMS',manifest+manifest);assert.throws(()=>validate(cwd),/Duplicate digest/);});
});
test('tracked symlinks are rejected',()=>corpus(({cwd,dir,git})=>{rmSync(join(dir,'probe.cjs'));symlinkSync('/etc/passwd',join(dir,'probe.cjs'));git('add','.');assert.throws(()=>validate(cwd),/regular file/);}));
