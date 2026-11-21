import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const root=fileURLToPath(new URL('..',import.meta.url));
const out=resolve(process.env.HERO_PERF_OUTPUT || resolve(tmpdir(),'satucard-hero-performance'));
const origin='http://127.0.0.1:8794';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'});
const report={samples:[],checks:[]};
await mkdir(out,{recursive:true});
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await ctx.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:{available:false,projects:[]}});
  const file=resolve(root,'.'+url.pathname);
  if(!file.startsWith(resolve(root)+sep)||!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:mime[extname(file)]});
 });
 await ctx.addInitScript(()=>{
  window.__heroPerf={frames:0,renderers:[]};
  window.__THREE_DEVTOOLS__=new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe',event=>{
   const renderer=event.detail;if(!renderer.isWebGLRenderer)return;
   window.__heroPerf.renderers.push(renderer);
   const render=renderer.render;
   renderer.render=function(...args){window.__heroPerf.frames++;return render.apply(this,args);};
  });
 });
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const idle=()=>page.waitForFunction(()=>window.__SATUCARD_HERO_STATE?.idleSleeping);
 const sample=async(name,move=false)=>{
  const result=await page.evaluate(async({name,move})=>{
   const perf=window.__heroPerf,startFrames=perf.frames,start=performance.now();
   const canvas=document.querySelector('.hero-3d-canvas'),box=canvas?.getBoundingClientRect();
   while(performance.now()-start<1100) {
    if(move){const t=(performance.now()-start)/150;canvas.dispatchEvent(new PointerEvent('pointermove',{
     clientX:box.x+box.width*(.5+.2*Math.sin(t)),clientY:box.y+box.height*(.5+.15*Math.cos(t)),bubbles:true
    }));}
    await new Promise(r=>setTimeout(r,16));
   }
   const renderer=perf.renderers.at(-1);
   return {name,frames:perf.frames-startFrames,ms:performance.now()-start,
    triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,
    pixels:renderer.domElement.width*renderer.domElement.height,textures:renderer.info.memory.textures};
  },{name,move});
  report.samples.push(result);console.log(JSON.stringify(result));return result;
 };
 await page.goto(origin+'/index.html');await idle();
 assert.equal((await sample('idle')).frames,0);
 let moving=await sample('hover',true);
 assert.ok(moving.frames>5&&moving.frames<=Math.ceil(moving.ms*32/1000)+1,'Hover rendering must stay within 30fps budget');
 assert.ok(moving.triangles<9000,'Assembled geometry budget');
 assert.ok(moving.pixels<=500000,'Retina drawing-buffer budget');
 await page.mouse.move(0,0);await idle();
 await page.locator('#hero-explode-toggle').click();await idle();
 assert.equal((await sample('exploded-idle')).frames,0);
 moving=await sample('exploded-hover',true);
 assert.ok(moving.frames>5&&moving.frames<=Math.ceil(moving.ms*32/1000)+1,'Exploded hover rendering budget');
 assert.ok(moving.triangles<30000,'Exploded geometry budget');
 await page.mouse.move(0,0);await idle();

 // Hidden-tab event is simulated to exercise our scheduler, independent of browser throttling.
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,value:true});
  document.dispatchEvent(new Event('visibilitychange'));
  window.__SATUCARD_HERO_3D.setExploded(false);
 });
 assert.equal((await sample('simulated-hidden-tab')).frames,0);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 await idle();

 await page.evaluate(()=>scrollTo({top:document.querySelector('#quick-start').offsetTop+innerHeight,behavior:'instant'}));
 await page.waitForTimeout(200);
 await page.evaluate(()=>window.__SATUCARD_HERO_3D.setExploded(true));
 assert.equal((await sample('offscreen')).frames,0);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await idle();
 for(let i=0;i<3;i++){
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>window.__SATUCARD_HERO_STATE?.mode==='2d-canvas');
  assert.equal(await page.locator('.hero-3d-canvas').count(),0);
  assert.ok(await page.evaluate(()=>window.__heroPerf.renderers.every(r=>r.getContext().isContextLost())),'Disposed contexts must be released');
  await page.setViewportSize({width:1440,height:900});
  await idle();
  assert.equal(await page.locator('.hero-3d-canvas').count(),1);
 }
 report.checks.push('Three desktop/mobile cycles release all old WebGL contexts');
 const initialTextures=await page.evaluate(()=>window.__heroPerf.renderers.at(-1).info.memory.textures);
 for(const style of ['noir','bold','studio','noir','bold','studio']){
  await page.locator('[data-cover-style='+style+']').click();await idle();
  assert.equal(await page.evaluate(()=>window.__heroPerf.renderers.at(-1).info.memory.textures),initialTextures);
 }
 report.checks.push('Style changes keep texture count stable');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>window.__SATUCARD_HERO_STATE?.mode==='2d-canvas');
 assert.ok(await page.evaluate(()=>window.__heroPerf.renderers.every(r=>r.getContext().isContextLost())));
 await page.emulateMedia({reducedMotion:'no-preference'});await idle();
 await page.evaluate(()=>window.__heroPerf.renderers.at(-1).forceContextLoss());
 await page.waitForFunction(()=>window.__SATUCARD_HERO_STATE?.mode==='2d-canvas');
 assert.equal(await page.locator('#cover-card').isVisible(),true);
 report.checks.push('Reduced motion and lost WebGL context retain the 2D card');
 assert.deepEqual(errors,[]);
 report.checks.push('No uncaught browser errors');
 await writeFile(resolve(out,'hero-performance.json'),JSON.stringify(report,null,2));
 console.log('PASS: frame, pixel, geometry budgets; idle/offscreen/visibility; context and texture lifecycle.');
 await ctx.close();
} finally {await browser.close();}

