import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '/workspace/dev-tools/browser/node_modules/playwright/index.mjs';

const root = process.env.AUDIT_ROOT ?? '/workspace/still-integration-audit';
const output = process.env.AUDIT_OUTPUT ?? '/workspace/shared/still-integrated-main-20261020';
const mode = process.env.PUBLIC_SITE_ENV === 'production' ? 'production' : 'preview';
const origin = 'http://127.0.0.1:4321';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({headless:true, executablePath:'/workspace/dev-tools/chrome-156.0.8078.4/chrome-linux64/chrome'});
browser.on('disconnected',()=>console.log('browser closed'));
const results = {mode, candidate:'c1455ab4a7519e0e1ddd5b811c76ada6bf915f6c', tree:'fd6cb3b73e0f0fcba336dc45d8517de41cc953dd', browser:browser.version(), node:process.version, observations:[], controls:[], browserErrors:[], blockedRequests:[]};
const check = (condition, description) => assert.ok(condition, description);

async function state(page, current) {
  const actual = await page.locator('nav a[aria-current]').evaluateAll(links => links.map(a => ({href:a.getAttribute('href'), state:a.getAttribute('aria-current'), decoration:getComputedStyle(a).textDecorationLine})));
  assert.deepEqual(actual.map(({href,state})=>({href,state})), current ? [{href:current,state:'page'}] : []);
  if(current) check(actual[0].decoration.includes('underline'), 'Current page is underlined');
}
async function enlarge(page,font) {
  await page.locator('html').evaluate((el,size)=>el.style.setProperty('font-size',`${size}px`,'important'),font);
}

async function layout(page) {
  return page.evaluate(() => {
    const form = document.querySelector('.sample-form');
    const elements = [form,...form.querySelectorAll('fieldset, legend, label, input, textarea, button')];
    const bounds = elements.map(el => {const r=el.getBoundingClientRect();return {tag:el.tagName,left:r.left,right:r.right,width:r.width,client:el.clientWidth,scroll:el.scrollWidth};});
    return {viewport:innerWidth,document:document.documentElement.scrollWidth,bounds,
      disabled:[...form.querySelectorAll('input,textarea,button')].every(el=>el.hasAttribute('disabled') && el.matches(':disabled')),
      noBackend:!form.hasAttribute('action') && !form.hasAttribute('id'),
      described:form.getAttribute('aria-describedby')==='sample-notice' && !!document.querySelector('#sample-notice')};
  });
}
function fits(metrics) {
  check(metrics.document<=metrics.viewport, 'Document fits viewport');
  for(const b of metrics.bounds) {
    check(b.left>=-1 && b.right<=metrics.viewport+1, `${b.tag} fits viewport`);
    check(b.scroll<=b.client+1, `${b.tag} contents fit`);
  }
  check(metrics.disabled && metrics.noBackend && metrics.described, 'Contact demo remains disabled and described');
}
async function skipState(page) {
  return page.locator('.skip').evaluate(el => {const r=el.getBoundingClientRect();const s=getComputedStyle(el);return {top:r.top,bottom:r.bottom,height:r.height,outline:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth)};});
}
async function brandHit(page) {
  return page.locator('.wordmark').evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===el || el.contains(hit);});
}
async function pressToContact(page) {
  for(let i=0;i<8;i++) {
    if(await page.locator('nav a[href="/contact/"]').evaluate(el=>el===document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail('Contact navigation link must be keyboard reachable');
}
async function negative(name, callback) {
  let failed=false;
  try {await callback();} catch(error) {if(error.code!=='ERR_ASSERTION') throw error;failed=true;results.controls.push({name,failedAsExpected:true,assertion:error.message});}
  check(failed, `${name}: control must fail`);
}

try {
  for(const scenario of [
    {width:320,font:32,javaScriptEnabled:true,colorScheme:'light',route:'/contact/'},
    {width:320,font:32,javaScriptEnabled:false,colorScheme:'dark',route:'/contact/index.html?via=integration'},
    {width:390,font:16,javaScriptEnabled:true,colorScheme:'dark',route:'/contact/index.html?via=integration'},
    {width:1280,font:32,javaScriptEnabled:false,colorScheme:'light',route:'/contact/'},
  ]) {
    console.log('start',JSON.stringify(scenario));
    const context=await browser.newContext({...scenario,viewport:{width:scenario.width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
    context.setDefaultTimeout(5000);
    context.setDefaultNavigationTimeout(10000);
    await context.route('**/*', route=>{
      if(new URL(route.request().url()).origin===origin) return route.continue();
      results.blockedRequests.push(route.request().url());return route.abort();
    });
    const page=await context.newPage();
    page.on('pageerror', error=>results.browserErrors.push(String(error)));
    const requests=[];
    page.on('request', req=>requests.push({method:req.method(),url:req.url()}));
    const response=await page.goto(origin+scenario.route);
    assert.equal(response.status(),200);
    const html=await response.body();
    assert.equal(hash(html),hash(await readFile(root+'/dist/contact/index.html')), 'Served contact bytes match build exactly');
    await enlarge(page,scenario.font);
    await page.waitForFunction(()=>document.fonts.status==='loaded',undefined,{timeout:5000});
    await page.evaluate(()=>scrollTo(0,0));
    await state(page,'/contact/');
    const initialSkip=await skipState(page);
    check(initialSkip.bottom<=0, 'Unfocused skip link entirely hidden');
    check(await brandHit(page), 'Brand hit target not intercepted');
    const metrics=await layout(page);fits(metrics);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip').evaluate(el=>el===document.activeElement),true, 'First tab focuses skip link');
    const focusedSkip=await skipState(page);
    check(focusedSkip.top>=0 && focusedSkip.bottom<=900 && focusedSkip.outline!=='none' && focusedSkip.outlineWidth>0,'Focused skip visible with outline');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('main').evaluate(el=>el===document.activeElement),true,'Skip enters main landmark');
    check((await skipState(page)).bottom<=0,'Skip hides on blur');
    await page.keyboard.press('Tab');
    const focused=await page.evaluate(()=>({tag:document.activeElement.tagName,href:document.activeElement.getAttribute('href'),text:document.activeElement.textContent}));
    assert.deepEqual(focused,{tag:'A',href:'/',text:'Return to the overview'},'Disabled form controls skipped');
    await Promise.all([page.waitForURL(origin+'/'),page.keyboard.press('Enter')]);
    await state(page,null);
    await enlarge(page,scenario.font);
    await pressToContact(page);
    await Promise.all([page.waitForURL(origin+'/contact/'),page.keyboard.press('Enter')]);
    await state(page,'/contact/');
    await enlarge(page,scenario.font);
    fits(await layout(page));
    await page.goto(origin+'/contact/index.html?via=integration#sample-notice');
    await state(page,'/contact/');
    if(scenario.width===320 && scenario.javaScriptEnabled) {
      await enlarge(page,32);
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:output+'/'+mode+'-contact-320-200.png',fullPage:true});
      const oldSkip=await page.addStyleTag({content:'.skip:not(:focus){top:-100px;transform:none}'});
      await negative('pre-PR25 skip offset',async()=>{check((await skipState(page)).bottom<=0,'Unfocused skip link entirely hidden');});
      const overlap=await skipState(page);
      check(!(await brandHit(page)),'Old skip control intercepts brand');
      await oldSkip.evaluate(el=>el.remove());
      const oldForm=await page.addStyleTag({content:'.sample-form{overflow-wrap:normal}'});
      const oldMetrics=await layout(page);
      await negative('pre-PR22 contact wrapping',async()=>fits(oldMetrics));
      await oldForm.evaluate(el=>el.remove());
      await page.locator('nav a[aria-current]').evaluate(el=>el.removeAttribute('aria-current'));
      await negative('pre-PR24 absent current state',async()=>state(page,'/contact/'));
      results.controls.push({name:'baseline measurements',oldSkip:overlap,oldContact:oldMetrics});
    }
    check(requests.every(req=>req.method==='GET'),'No contact submission');
    results.observations.push({scenario,servedContactSHA256:hash(html),initialSkip,focusedSkip,contact:metrics,keyboardJourney:'skip → main → return (disabled controls skipped) → home → nav Contact → contact; query/index/fragment current state preserved',requests:requests.length});
    await context.close();
    console.log('passed',JSON.stringify(scenario));
  }
  assert.deepEqual(results.browserErrors,[]);
  assert.deepEqual(results.blockedRequests,[]);
  console.log(JSON.stringify({mode,browser:results.browser,composedScenarios:results.observations.length,discriminatingControls:results.controls.filter(c=>c.failedAsExpected).length,errors:results.browserErrors.length},null,2));
} finally {
  results.finishedUTC=new Date().toISOString();
  await writeFile(output+'/'+mode+'-browser.json',JSON.stringify(results,null,2)+'\n');
  await browser.close();
}
