import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const workflow=readFileSync(new URL('./starter.yml.proposed',import.meta.url),'utf8');
const live=readFileSync(new URL('../../.github/workflows/starter.yml',import.meta.url),'utf8');
test('proposal preserves current triggers, read-only permissions and complete product matrix',()=>{
  assert.equal(workflow.split('jobs:\n')[0],live.split('jobs:\n')[0]);
  const product=workflow.slice(workflow.indexOf('  starter:\n'),workflow.indexOf('  qualification:\n'));
  assert.equal(product.replace("    needs: route\n    if: needs.route.outputs.product != 'false'\n",''),live.slice(live.indexOf('  starter:\n')));
  assert(!/pull_request_target|workflow_dispatch|secrets:|id-token:|deploy|environment:/.test(workflow.replaceAll('site-environment:','matrix-key:')));
  assert.equal((workflow.match(/- run: npm ci --ignore-scripts/g)||[]).length,1);
  assert.equal((workflow.match(/- run: npm run build/g)||[]).length,1);
  assert(workflow.includes('fetch-depth: 0'));
  assert(workflow.includes('if: always()\n    needs: [route, evidence, starter]'));
});
test('real aggregate shell rejects failures, cancellations, missing output and incorrect skips',()=>{
  const shell=workflow.split('      - run: |\n')[1].split('\n').map(line=>line.slice(10)).join('\n');
  for(const route of ['success','failure','cancelled','skipped']) for(const evidence of ['success','failure','cancelled','skipped']) for(const product of ['true','false','']) for(const starter of ['success','failure','cancelled','skipped']) {
    const expected=route==='success' && evidence==='success' && (product==='true'&&starter==='success'||product==='false'&&starter==='skipped');
    let passed=true;
    try {execFileSync('bash',['--noprofile','--norc','-e','-c',shell],{env:{ROUTE_RESULT:route,EVIDENCE_RESULT:evidence,PRODUCT:product,STARTER_RESULT:starter},stdio:'pipe'});} catch {passed=false;}
    assert.equal(passed,expected,JSON.stringify({route,evidence,product,starter}));
  }
});
