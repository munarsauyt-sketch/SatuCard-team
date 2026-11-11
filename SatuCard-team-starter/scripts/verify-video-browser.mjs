import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve,extname,sep } from 'node:path';
import { existsSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const artifacts=resolve(process.env.VIDEO_ARTIFACTS||root+'/../../../outputs/video-studio');
mkdirSync(artifacts,{recursive:true});
const origin='http://127.0.0.1:8792';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'";
const errors=[];
async function context(width){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  context.on('page',page=>{page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')console.log('Browser console:',msg.text());});page.on('dialog',dialog=>dialog.accept());});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    const path=resolve(root,'.'+url.pathname);
    if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404,body:''});
    return route.fulfill({path,contentType:mime[extname(path)],headers:{'Content-Security-Policy':csp}});
  });
  return context;
}
try{
  const desktop=await context(1512),page=await desktop.newPage();
  await page.goto(origin+'/video.html');await page.locator('body[data-ready=true]').waitFor({timeout:30000});
  await page.screenshot({path:artifacts+'/studio-desktop.png',fullPage:true});
  assert.equal(await page.locator('.template-card').count(),10);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1512);
  await page.getByRole('button',{name:'Бренд',exact:true}).click();
  await page.locator('[name=title]').fill('Жаңа өнім — новый товар');await page.locator('[name=brand]').fill('Satu Store');await page.locator('[name=features]').fill('Сильный звук\nЛёгкий корпус\nВаш выбор');await page.getByRole('button',{name:'Обновить ролик'}).click();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Сохранено на устройстве');
  await page.reload();await page.locator('body[data-ready=true]').waitFor();
  assert.equal(await page.locator('[name=title]').inputValue(),'Жаңа өнім — новый товар');
  await page.getByRole('button',{name:'Текст',exact:true}).click();await page.locator('#add-text').click();
  await page.locator('[data-property=text]').fill('Новая сцена');await page.locator('[data-property=text]').dispatchEvent('change');
  await page.locator('[data-property=x]').fill('15');await page.locator('[data-property=x]').dispatchEvent('change');
  await page.getByRole('button',{name:/Ключевой кадр в/}).click();assert.equal(await page.locator('.keyframe-chip').count(),1);
  await page.locator('#next').click();await page.getByRole('button',{name:/Ключевой кадр в/}).click();assert.equal(await page.locator('.keyframe-chip').count(),2);
  await page.locator('#duplicate').click();await page.locator('#undo').click();await page.locator('#redo').click();
  await page.getByRole('button',{name:'Медиа',exact:true}).click();await page.locator('#media-input').setInputFiles(root+'/assets/images/ceramics.jpg');
  await page.waitForFunction(()=>document.querySelectorAll('.media-card').length===5);
  await page.locator('.media-card').last().getByRole('button',{name:'Заменить товар'}).click();
  await page.getByRole('button',{name:'Текст',exact:true}).click();
  await page.locator('#subtitle-source').fill('1\n00:00:00,000 --> 00:00:02,000\nӘдемі өнім. Новый взгляд.');await page.locator('#subtitle-add').click();
  await page.locator('#format').selectOption('square');await page.locator('#format').selectOption('wide');await page.locator('#format').selectOption('vertical');
  const projectDownload=page.waitForEvent('download');await page.locator('#save-file').click();const projectFile=await projectDownload;await projectFile.saveAs(artifacts+'/tested-project.satuvideo.json');
  await page.locator('#play').click();await page.waitForTimeout(300);await page.locator('#play').click();
  await page.locator('#export').click();await page.locator('#export-start').click();
  await page.locator('#export-download').waitFor({state:'visible',timeout:120000});
  const mp4Download=page.waitForEvent('download');await page.locator('#export-download').click();const mp4File=await mp4Download;await mp4File.saveAs(artifacts+'/tested-video.mp4');
  await page.locator('#export-result').evaluate(video=>new Promise((resolve,reject)=>{const done=()=>resolve();if(video.readyState>=1)return done();video.onloadedmetadata=done;video.onerror=()=>reject(new Error('MP4 не декодируется'));}));
  const metadata=await page.locator('#export-result').evaluate(video=>({duration:video.duration,width:video.videoWidth,height:video.videoHeight}));
  assert.ok(Math.abs(metadata.duration-12)<.2);assert.equal(metadata.height,1280);assert.equal(metadata.width,720);console.log('MP4',metadata);
  await page.locator('#export-close').click();
  // The portable project restores embedded media into a fresh browser profile.
  const fresh=await context(1440),other=await fresh.newPage();await other.goto(origin+'/video.html');await other.locator('body[data-ready=true]').waitFor();
  await other.locator('#project-input').setInputFiles(artifacts+'/tested-project.satuvideo.json');await other.waitForFunction(()=>document.querySelectorAll('.media-card').length===5);
  assert.equal(await other.locator('[name=title]').inputValue(),'Жаңа өнім — новый товар');
  await other.locator('#export').click();await other.locator('#export-start').click();await other.locator('#export-cancel').click();await other.waitForFunction(()=>document.querySelector('#export-status').textContent.includes('отменён'));
  await other.locator('#export-close').click();assert.equal(await other.locator('#workspace').evaluate(el=>el.inert),false);
  const clip=process.env.VIDEO_TEST_CLIP||root+'/tests/fixtures/video-source.mp4';
  if(clip){
    await other.getByRole('button',{name:'Медиа',exact:true}).click();await other.locator('#media-input').setInputFiles(clip);
    await other.waitForFunction(()=>document.querySelectorAll('.media-card').length===6);
    await other.locator('.media-card').last().getByRole('button',{name:'＋ В ролик',exact:true}).click();
    await other.locator('[data-property=volume]').fill('80');await other.locator('[data-property=volume]').dispatchEvent('change');
    await other.locator('[data-property=start]').fill('0');await other.locator('[data-property=start]').dispatchEvent('change');
    await other.locator('#duration').fill('3');await other.locator('#duration').dispatchEvent('change');
    const handle=other.locator('.clip.selected .trim-handle.left');await handle.scrollIntoViewIfNeeded();const bounds=await handle.boundingBox();
    await other.mouse.move(bounds.x+3,bounds.y+8);await other.mouse.down();await other.mouse.move(bounds.x+20,bounds.y+8,{steps:5});await other.mouse.up();
    assert.ok(Number(await other.locator('[data-property=start]').inputValue())>.2);
    await other.locator('#ruler').click({position:{x:110,y:8}});await other.locator('#split').click();
    await other.locator('#export').click();await other.locator('#export-start').click();await other.locator('#export-download').waitFor({state:'visible',timeout:120000});
    const downloaded=other.waitForEvent('download');await other.locator('#export-download').click();await (await downloaded).saveAs(artifacts+'/tested-video-source.mp4');await other.locator('#export-close').click();
    console.log('Video import, audio, drag trim, split and re-export passed.');
  }
  await fresh.close();
  const mobile=await context(390),phone=await mobile.newPage();await phone.goto(origin+'/video.html');await phone.locator('body[data-ready=true]').waitFor();
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),390);
  await phone.screenshot({path:artifacts+'/studio-mobile.png',fullPage:true});
  await phone.getByRole('button',{name:'Текст',exact:true}).click();await phone.locator('#add-text').click();assert.ok(await phone.locator('[data-property=text]').isVisible());
  await mobile.close();await desktop.close();assert.deepEqual(errors,[]);console.log('Video studio browser workflows passed. Artifacts:',artifacts);
}finally{await browser.close();}
