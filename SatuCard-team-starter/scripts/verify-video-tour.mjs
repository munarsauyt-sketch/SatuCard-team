import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve, extname, sep } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),origin='http://127.0.0.1:8794';
const artifacts=resolve(process.env.VIDEO_ARTIFACTS||root+'/../../../outputs/video-tour');mkdirSync(artifacts,{recursive:true});
const headers=JSON.parse(readFileSync(root+'/vercel.json','utf8')).routes[0].headers;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const errors=[];
async function open(viewport,{storage=true}={}){
  const context=await browser.newContext({viewport,acceptDownloads:true});
  if(!storage)await context.addInitScript(()=>{Storage.prototype.getItem=Storage.prototype.setItem=function(){throw new DOMException('Storage blocked','SecurityError');};});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{available:false,projects:[]}});
    const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404,body:''});
    return route.fulfill({path,contentType:mime[extname(path)],headers});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(origin+'/video.html');await page.locator('body[data-ready=true]').waitFor();await page.locator('#video-help-tour').waitFor();return {context,page};
}
async function geometry(page,step){
  await page.waitForFunction(expected=>{
    const p=document.querySelector('#video-help-tour'),h=document.querySelector('.video-tour-highlight');
    return p?.dataset.step===String(expected)&&h&&!h.hidden;
  },step);
  const state=await page.evaluate(()=>{
    const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const p=document.querySelector('#video-help-tour'),t=document.querySelector('.video-tour-target'),h=document.querySelector('.video-tour-highlight');
    const a=box(p),b=box(h),overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    return {panel:a,target:box(t),highlight:b,overlap,width:innerWidth,height:innerHeight,inert:document.querySelector('#workspace').inert,modal:!!document.querySelector('dialog[open]'),overflow:document.documentElement.scrollWidth};
  });
  const detail=JSON.stringify({step,...state});
  assert.ok(state.panel.left>=0&&state.panel.top>=0&&state.panel.right<=state.width+1&&state.panel.bottom<=state.height+1,detail);
  assert.ok(state.highlight.width>10&&state.highlight.height>10,detail);assert.equal(state.overlap,0,detail);
  assert.ok(!state.inert&&!state.modal,detail);assert.equal(state.overflow,state.width,detail);
}
try{
  for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844},{width:700,height:500}]){
    const {context,page}=await open(viewport),tour=page.locator('#video-help-tour');
    await geometry(page,1);await page.screenshot({path:artifacts+`/tour-${viewport.width}-templates.png`});
    for(let step=2;step<=9;step++){
      await tour.getByRole('button',{name:'Далее →',exact:true}).click();await geometry(page,step);
      if(step===2){await page.screenshot({path:artifacts+`/tour-${viewport.width}-upload.png`});const chooser=page.waitForEvent('filechooser');await page.locator('#import-media').click();await (await chooser).setFiles([]);}
      if(step===3){
        await page.locator('#product-form [name=title]').fill('Мой товар во время обучения');
        assert.equal(await page.locator('#product-form [name=title]').inputValue(),'Мой товар во время обучения');
        await page.keyboard.press('Space');assert.equal(await page.locator('#play').getAttribute('aria-label'),'Воспроизвести');
        await page.screenshot({path:artifacts+`/tour-${viewport.width}-product.png`});
      }
      if(step===5){await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#play').getAttribute('aria-label')==='Пауза');await page.locator('#play').click();}
      if(step===8){const downloaded=page.waitForEvent('download');await page.locator(viewport.width<=900?'#save-file-mobile':'#save-file').click();assert.equal(await (await downloaded).failure(),null);}
    }
    // Native export dialog still works above the nonmodal tour; Escape closes it first.
    await page.locator('#export').click();await page.locator('#export-dialog').waitFor();await page.keyboard.press('Escape');
    assert.ok(await tour.isVisible());await geometry(page,9);
    await tour.getByRole('button',{name:'Назад',exact:true}).click();await geometry(page,8);
    await tour.getByRole('button',{name:'Далее →',exact:true}).click();await tour.getByRole('button',{name:'Завершить ✓',exact:true}).click();
    assert.ok(await tour.isHidden());assert.equal(await page.locator('.video-tour-target').count(),0);assert.ok(await page.locator('.video-tour-highlight').isHidden());
    await page.reload();await page.locator('body[data-ready=true]').waitFor();assert.ok(await tour.isHidden());
    await page.getByRole('button',{name:'Помощь',exact:true}).click();await geometry(page,1);
    await page.getByRole('button',{name:'Медиа',exact:true}).click();await geometry(page,2);
    await page.setViewportSize({width:viewport.width>900?390:1440,height:844});await geometry(page,2);
    await page.keyboard.press('Escape');assert.ok(await tour.isHidden());await context.close();console.log('Contextual tour passed:',viewport);
  }
  const {context,page}=await open({width:390,height:844},{storage:false});await geometry(page,1);await page.getByRole('button',{name:'Закрыть инструктаж'}).click();assert.ok(await page.locator('#video-help-tour').isHidden());await context.close();
  assert.deepEqual(errors,[]);console.log('First-visit, repeat, storage failure, live controls, resize and export-dialog checks passed.');
}finally{await browser.close();}
