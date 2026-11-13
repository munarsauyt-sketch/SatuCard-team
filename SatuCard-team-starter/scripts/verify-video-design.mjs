import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const artifacts=resolve(process.env.VIDEO_ARTIFACTS||root+'/../../../outputs/video-studio');
await mkdir(artifacts,{recursive:true});
const origin='http://127.0.0.1:8793';
const config=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8'));
const headers=config.routes[0].headers;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml'};
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1380,height:1000}}),errors=[];
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/design-preview.html')return route.fulfill({contentType:'text/html',headers,body:'<!doctype html><html lang="ru"><meta charset="utf-8"><title>Новые шаблоны SatuCard Video</title><link rel="stylesheet" href="editor-fonts.css"><body></body></html>'});
    const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404,body:''});
    return route.fulfill({path,contentType:mime[extname(path)],headers});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/design-preview.html');
  await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;padding:36px;background:#14121c;color:#fff;font:14px Manrope,sans-serif}h1{font-size:32px;letter-spacing:-1px;margin:0 0 8px}p{color:#bcb3cc;margin:0 0 28px}#sheet{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:24px 18px}article{min-width:0}canvas{display:block;width:100%;height:auto;border-radius:12px;border:1px solid #5c4969}strong{display:block;margin-top:9px;font-size:11px;line-height:1.5}small{color:#bfb2d3;font-size:10px}'});
  const result=await page.evaluate(async()=>{
    const {TEMPLATES,templateProject,validateProject}=await import('./video-model.js');
    const {MediaStore}=await import('./video-media.js');const {drawProject}=await import('./video-renderer.js');const {exportVideo}=await import('./video-export.js');
    await Promise.all([document.fonts.load('750 30px "Golos Text"'),document.fonts.load('700 30px "Noto Serif"'),document.fonts.load('600 30px "Manrope"')]);
    const heading=document.createElement('h1');heading.textContent='24 новых ярких шаблона';
    const note=document.createElement('p');note.textContent='SatuCard Video · 6 композиций × 4 палитры · каждый элемент можно изменить';
    const sheet=document.createElement('div');sheet.id='sheet';document.body.append(heading,note,sheet);
    const store=new MediaStore(),exports=[];let sample;
    const vivid=TEMPLATES.filter(t=>t.vivid);
    for(const template of vivid){
      const project=templateProject(template.id);validateProject(project);await store.prepare(project);
      const article=document.createElement('article'),canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;
      // Draw every scene to exercise its geometry, then use the first for the contact sheet.
      for(const time of [.9,4.9,8.9])drawProject(canvas,project,store,time);
      drawProject(canvas,project,store,.9);
      const name=document.createElement('strong');name.textContent=template.name;const category=document.createElement('small');category.textContent='12 секунд · 9:16 · Яркие';article.append(canvas,name,category);sheet.append(article);
      if(template.id.endsWith('-mango')){
        const full=exports.length===0;
        if(!full){project.duration=1;project.layers=project.layers.filter(i=>i.start<1);for(const item of project.layers)item.end=Math.min(1,item.end);}
        validateProject(project);const blob=await exportVideo(project,store,{height:1280});
        const video=document.createElement('video'),url=URL.createObjectURL(blob);video.muted=true;video.src=url;
        await new Promise((done,fail)=>{video.onloadeddata=done;video.onerror=()=>fail(new Error('Exported video did not decode'));});
        exports.push({id:template.id,bytes:blob.size,duration:video.duration,width:video.videoWidth,height:video.videoHeight});
        if(full){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));sample=btoa(binary);}
        video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
      }
    }
    store.dispose();return {count:vivid.length,exports,sample};
  });
  assert.equal(result.count,24);assert.equal(result.exports.length,6);
  for(const item of result.exports){assert.ok(item.bytes>1000);assert.equal(item.width,720);assert.equal(item.height,1280);assert.ok(Math.abs(item.duration-(item.id===result.exports[0].id?12:1))<.2);}
  await page.screenshot({path:resolve(artifacts,'colorful-templates.png'),fullPage:true});
  await writeFile(resolve(artifacts,'colorful-orbit-sample.mp4'),Buffer.from(result.sample,'base64'));delete result.sample;
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/video-guide.html');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash)),[]);
    await page.screenshot({path:resolve(artifacts,'guide-'+width+'.png')});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));console.log('All new layouts render/export/decode; guide fits 390px and 1440px.');
}finally{await browser.close();}
