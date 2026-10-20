import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat,cp,mkdtemp,symlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const root=process.env.AUDIT_ROOT ?? '/workspace/still-integration-audit';
const output=process.env.AUDIT_OUTPUT ?? '/workspace/shared/still-integrated-main-20261020';
const production=process.env.PUBLIC_SITE_ENV==='production';
const mode=production?'production':'preview';
const {site}=await import(pathToFileURL(root+'/site.config.mjs'));
const {verifyStarter}=await import(pathToFileURL(root+'/scripts/verify-starter.mjs'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const temporary=await mkdtemp('/tmp/still-composed-deployment-');
const proof={candidate:'c1455ab4a7519e0e1ddd5b811c76ada6bf915f6c',tree:'fd6cb3b73e0f0fcba336dc45d8517de41cc953dd',mode,node:process.version,commands:[],checks:[]};
async function snapshot(directory){
  const files=[];
  for(const file of (await readdir(directory,{recursive:true})).sort()) if((await stat(join(directory,file))).isFile()) files.push([file,hash(await readFile(join(directory,file)))]);
  return files;
}
function cli(label,args,expected,pattern){
  const result=spawnSync(process.execPath,args,{cwd:temporary,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},encoding:'utf8',timeout:20000});
  assert.ifError(result.error);
  proof.commands.push({label,args,status:result.status,stdout:result.stdout,stderr:result.stderr});
  if(expected==='pass') assert.equal(result.status,0,result.stdout+result.stderr);
  else {assert.notEqual(result.status,0,label);assert.match(result.stdout+result.stderr,pattern);}
}
try{
  const original=await snapshot(root+'/dist');
  proof.buildOutput=original;
  const options={directory:root+'/dist',root,site,production,base:'/'};
  assert.equal(await verifyStarter(options),7);
  const missing={...options};delete missing.base;
  for(const optionsWithoutEffectiveBase of [missing,{...options,base:undefined},{...options,base:null}])
    await assert.rejects(verifyStarter(optionsWithoutEffectiveBase),/Supply the effective Astro base explicitly/);
  for(const base of ['/docs/','/contact/','/nested/docs/']) await assert.rejects(verifyStarter({...options,base}),/non-root base .* is unsupported/);
  proof.checks.push('Root output passes; omitted/undefined/null and non-root direct API bases reject');

  for(const file of ['scripts','site.config.mjs','src']) await cp(join(root,file),join(temporary,file),{recursive:true});
  await cp(root+'/astro.config.mjs',temporary+'/astro.base.mjs');
  await symlink(root+'/node_modules',temporary+'/node_modules','dir');
  await cp(root+'/dist',temporary+'/accepted-output',{recursive:true});
  await cp(root+'/dist',temporary+'/dist',{recursive:true});
  const config=source=>writeFile(temporary+'/astro.config.mjs',"import config from './astro.base.mjs';\n"+source+'\n');
  await config("export default {...config, outDir:'./accepted-output/'};");
  cli('effective root/output pass',['scripts/verify-starter.mjs'],'pass');
  await config("export default {...config, base:'/docs/', outDir:'./accepted-output/'};");
  cli('retained root output rejects non-root config',['scripts/verify-starter.mjs'],'reject',/Still starter requires Astro base "\/"/);
  const astroManifest=JSON.parse(await readFile(root+'/node_modules/astro/package.json','utf8'));
  cli('build rejects non-root before touching output',[join(root,'node_modules/astro',astroManifest.bin.astro),'build'],'reject',/Still starter requires Astro base "\/"/);
  await config("let calls=0;export default {...config, base:'/docs/',outDir:'./missing/',integrations:[...config.integrations,{name:'composed-owner-root',hooks:{'astro:config:setup':({command,updateConfig})=>{if(command!=='build'||++calls!==1) throw new Error('Owner setup must run once in build mode');updateConfig({base:'/',outDir:new URL('./accepted-output/',import.meta.url)});}}}]};");
  cli('effective integration root/output override passes',['scripts/verify-starter.mjs'],'pass');
  assert.deepEqual(await snapshot(temporary+'/accepted-output'),original);
  await config("export default {...config,outDir:'./missing/'};");
  cli('stale default dist cannot substitute for configured missing output',['scripts/verify-starter.mjs'],'reject',/ENOENT.*missing/);
  proof.checks.push('CLI respects effective build-only owner setup once, root base and outDir; retained dist cannot hide missing effective output');

  const source=await readFile(temporary+'/scripts/verify-starter.mjs','utf8');
  const historical=source.replace('root = process.cwd(), base })','root = process.cwd(), base = \'/\' })');
  assert.notEqual(historical,source,'Mutation must change the direct API default');
  await writeFile(temporary+'/scripts/verifier-old-base-control.mjs',historical);
  const old=await import(pathToFileURL(temporary+'/scripts/verifier-old-base-control.mjs'));
  assert.equal(await old.verifyStarter(missing),7,'Former default falsely certifies omitted effective deployment base');
  proof.checks.push('Discriminating old-base control certifies omitted effective base; current code rejects the identical call');

  const contact=temporary+'/accepted-output/contact/index.html';
  const contactOriginal=await readFile(contact,'utf8');
  const fixtureOptions={...options,directory:temporary+'/accepted-output'};
  for(const [name,mutate,expected] of [
    ['missing active navigation',html=>html.replace('href="/contact/" aria-current="page"','href="/contact/"'),/contact\/index.html: configured navigation and current page/],
    ['false active navigation',html=>html.replace('href="/workshops/"','href="/workshops/" aria-current="page"'),/contact\/index.html: configured navigation and current page/],
    ['enabled retained demo control',html=>html.replace('name="email" type="email" autocomplete="email" disabled','name="email" type="email" autocomplete="email"'),/every contact example control must be explicitly disabled/],
  ]){
    const changed=mutate(contactOriginal);assert.notEqual(changed,contactOriginal,name+' mutation must apply');
    await writeFile(contact,changed);
    await assert.rejects(verifyStarter(fixtureOptions),expected);
    proof.checks.push('Mutated composed contact output rejected: '+name);
    await writeFile(contact,contactOriginal);
  }
  assert.equal(await verifyStarter(fixtureOptions),7);
  assert.deepEqual(await snapshot(temporary+'/accepted-output'),original);
  assert.deepEqual(await snapshot(root+'/dist'),original);
  proof.checks.push('All generated bytes unchanged after verification and rejected configuration/build probes');
  console.log(JSON.stringify({mode,checks:proof.checks,commands:proof.commands.length},null,2));
}finally{
  proof.finishedUTC=new Date().toISOString();
  await writeFile(output+'/'+mode+'-deployment.json',JSON.stringify(proof,null,2)+'\n');
  await rm(temporary,{recursive:true,force:true});
}
