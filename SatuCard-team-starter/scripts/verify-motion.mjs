import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.env.MOTION_OUTPUT_DIR || resolve(tmpdir(), 'satucard-motion');
await mkdir(out, { recursive: true });
const origin = 'http://localhost:8788';
const mime = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf' };
const browser = await chromium.launch({ headless:true, channel:process.env.BROWSER_CHANNEL || 'chrome' });
const results = [];
async function setup(width, theme='dark', language='ru', reducedMotion='no-preference') {
  const context=await browser.newContext({viewport:{width,height:960},isMobile:width<500,hasTouch:width<500,reducedMotion});
  await context.addInitScript(({theme,language})=>{localStorage.setItem('satucard-theme',theme);localStorage.setItem('satucard-interface-language',language);}, {theme,language});
  let chatMode='success', release, requests=[];
  await context.route('**/*', async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin) {
      if(url.hostname.endsWith('.supabase.co')){
        if(url.pathname.endsWith('/settings'))return route.fulfill({json:{external:{google:true},mailer_autoconfirm:false}});
        await new Promise(r=>setTimeout(r,250));
        return route.fulfill({status:400,json:{error_code:'invalid_credentials'}});
      }
      return route.abort();
    }
    if(url.pathname==='/api/chat'){
      if(req.method()==='GET')return route.fulfill({json:{available:true,hasAccess:true,provider:'openai'}});
      requests.push(req.postDataJSON());
      if(chatMode==='hold') await new Promise(r=>{release=r;});
      try {return await route.fulfill(chatMode==='error'?{status:429,json:{error:'Тест: лимит исчерпан'}}:{json:{reply:'Тестовый ответ.',proposal:null}});}catch{return;}
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{available:false,projects:[]}});
    const file=resolve(root,'.'+url.pathname);
    if(!file.startsWith(root.replace(/[\\/]$/,'')+sep)||!existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({path:file,contentType:mime[extname(file)]||'application/octet-stream'});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  return {context,page,errors,requests,setMode:v=>{chatMode=v;},release:()=>release?.()};
}
async function layout(page,label) {
  const bad=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{
    const r=e.getBoundingClientRect(),c=getComputedStyle(e);
    return r.width>0 && r.right>document.documentElement.clientWidth+2 && c.visibility!=='hidden' && !e.closest('[hidden],.mk-morph-tooltip');
  }).map(e=>e.id||e.className?.baseVal||e.className||e.tagName).slice(0,8));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1), label+' horizontal overflow '+JSON.stringify(bad));
  const chat=page.locator('#ai-chat:visible');
  if(await chat.count()){
    const box=await chat.boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=page.viewportSize().width+1,label+' composer clipped');
  }
}
async function idle(page) {
  await page.mouse.move(0,0);
  await page.waitForFunction(()=>window.__SATUCARD_MOTION_KIT?.activeTickers()===0,{},{timeout:7000});
}
try {
  for(const width of [320,390,768,1440]) for(const theme of ['dark','light']){
    const app=await setup(width,theme,theme==='light'?'kk':'ru'),{page}=app;
    for(const name of ['pricing','editor','auth']){
      await page.goto(origin+'/'+name+'.html?theme='+theme);
      if(name==='editor')await page.locator('#editor-form[data-editor-ready=true]').waitFor();
      await page.waitForFunction(()=>window.__SATUCARD_MOTION_KIT);
      await idle(page);await layout(page,name+' '+width+' '+theme);
      const expected=theme==='light'?'kk':'ru';assert.equal(await page.locator('html').getAttribute('lang'),expected);
      if(name==='pricing'){
        await page.locator('[data-billing-cycle=yearly]').click();await idle(page);
        assert.equal(await page.locator('#sai-price-drum').getAttribute('aria-label'),'59880 ₸');
        assert.match(await page.locator('#sai-plan-cta').getAttribute('href'),/plan=max_yearly/);
        assert.match(await page.locator('[data-plan=basic] .pricing-button').getAttribute('href'),/basic_yearly/);
        await page.locator('[data-sai-plan=basic]').click();await idle(page);
        assert.equal(await page.locator('#sai-price-drum').getAttribute('aria-label'),'18000 ₸');
        await page.locator('[data-billing-cycle=yearly]').focus();await page.keyboard.press('ArrowLeft');await idle(page);
        assert.equal(await page.locator('#sai-price-drum').getAttribute('aria-label'),'1500 ₸');
        await page.locator('[data-billing-cycle=yearly]').click();
        await page.locator('[data-sai-plan=max]').click();await idle(page);
      }
      if(name==='editor'){
        await page.locator('#quick-product-name').fill('Тестовая чашка');
        await page.locator('#quick-product-price').fill('4500');
        await page.locator('#quick-card-format').selectOption('square');
        assert.equal(await page.locator('#product-name').inputValue(),'Тестовая чашка');
        assert.equal(await page.locator('#product-price').inputValue(),'4500');
        assert.equal(await page.locator('#card-format').inputValue(),'square');
        await page.locator('#quick-product-price').fill('bad');
        assert.ok(await page.locator('#quick-price-error').textContent());
        await page.locator('#quick-product-price').fill('4500');
        await page.locator('#tab-templates').click();
        assert.equal(await page.locator('#panel-templates').isVisible(),true);
        await page.locator('#tab-photo').click();
        await page.locator('#photo-input').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('x')});
        await page.waitForFunction(()=>document.getElementById('upload-own-photo').dataset.importState==='error');
        const upload=page.locator('#upload-own-photo'), photo=resolve(root,'assets/images/ceramics.jpg');
        if(width<=390)assert.ok((await upload.boundingBox()).width>=250,'Upload target should occupy its own row');
        if(theme==='dark'){
          const image=(await readFile(photo)).toString('base64');
          await upload.evaluate((button,image)=>{
            const transfer=new DataTransfer(),bytes=Uint8Array.from(atob(image),c=>c.charCodeAt(0));
            transfer.items.add(new File([bytes],'ceramics.jpg',{type:'image/jpeg'}));
            button.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
          },image);
        }else{
          const chooser=page.waitForEvent('filechooser');
          await upload.click();await (await chooser).setFiles(photo);
        }
        await page.waitForFunction(()=>document.getElementById('upload-own-photo').dataset.importState==='done');
        assert.equal(await upload.locator('.motion-drop-ring circle').getAttribute('stroke-dashoffset'),'0');
        await page.locator('#quick-product-name').fill('Чашка');
        await page.locator('#quick-product-price').fill('4500');
        if(width===390||width===1440){
          const download=page.waitForEvent('download');await page.locator('#download-button').click();const file=await download;assert.match(file.suggestedFilename(),/\.png$/);
        }
        await page.evaluate(()=>scrollTo(0,0));
      }
      if(name==='auth'){
        await page.locator('#auth-submit').click();
        assert.equal(await page.locator('#auth-email').getAttribute('aria-invalid'),'true');
        await page.locator('#auth-email').fill('buyer@example.test');
        await page.locator('#auth-password').fill('testpassword');
        await page.locator('[data-password-toggle=auth-password]').click();
        assert.equal(await page.locator('#auth-password').getAttribute('type'),'text');
        await page.locator('[data-password-toggle=auth-password]').click();
        await page.locator('#auth-submit').click();
        await page.waitForFunction(()=>document.getElementById('auth-card-content').getAttribute('aria-busy')==='false' && document.getElementById('auth-notice').classList.contains('error'));
        assert.equal(await page.locator('#auth-submit').isEnabled(),true);
        await page.locator('#auth-signup-tab').click();
        assert.equal(await page.locator('#auth-confirm').isVisible(),true);
        await page.locator('#auth-login-tab').click();
        await page.evaluate(()=>scrollTo(0,0));
      }
      await idle(page);await layout(page,name+' after '+width+' '+theme);
      if(width===390||width===1440)await page.screenshot({path:resolve(out,name+'-'+width+'-'+theme+'.png')});
      const menu=page.locator('[data-menu-toggle]');
      if(await menu.isVisible())await menu.click();
      const nav=page.locator('#main-nav');
      const firstLink=nav.locator('a').first();
      assert.equal(await nav.locator('a').count(),5);
      assert.equal(await firstLink.innerText(),expected==='kk'?'Басты бет':'Главная');
      assert.equal(await firstLink.isVisible(),true);
      assert.equal(await nav.locator('a > svg, a[data-morph-tip]').count(),0);
      await layout(page,name+' with navigation open '+width+' '+theme);
      assert.equal(await page.locator('.interface-language select').isVisible(),true);
      const language=await page.locator('html').getAttribute('lang');
      await page.locator('.interface-language select').selectOption(language==='kk'?'ru':'kk');
      assert.notEqual(await page.locator('html').getAttribute('lang'),language);
      if(await menu.isVisible())await page.keyboard.press('Escape');
      await page.locator('[data-theme-toggle]').click();
      assert.notEqual(await page.locator('html').getAttribute('data-theme'),theme);
      assert.deepEqual(app.errors,[], name+' browser errors');
      results.push({name,width,theme,ok:true});
    }
    await app.context.close();
    console.log('Responsive, theme, language and flows passed:',width,theme);
  }
  for(const width of [390,1440]){
    const app=await setup(width),{page}=app;
    for (const name of ['video','video-guide']){
      await page.goto(origin+'/'+name+'.html?theme=dark',{waitUntil:'domcontentloaded'});
      const nav=page.locator('header nav');
      await nav.waitFor({state:'attached'});
      assert.equal(await nav.locator('a').first().innerText(),'Главная');
      assert.equal(await nav.locator('a > svg, a[data-morph-tip]').count(),0);
      assert.equal(await page.locator('script[src*="motion-"]').count(),0);
      await layout(page,name+' '+width);
    }
    await page.goto(origin+'/editor.html?theme=dark');
    await page.locator('#editor-form[data-editor-ready=true]').waitFor();
    await page.evaluate(()=>{
      window.SATUCARD_AUTH.getSession=async()=>({access_token:'test',user:{id:'test-user'}});
      document.dispatchEvent(new CustomEvent('satucard:authchange',{detail:{user:{id:'test-user'}}}));
    });
    await page.locator('#open-ai-chat').click();
    await page.locator('.motion-tag-suggestions button').first().click();
    await page.locator('#ai-tag-input').fill('Без обещаний');
    await page.locator('#ai-tag-input').press('Enter');
    await page.locator('#ai-chat-input').fill('Сделай текст короче');
    await page.locator('#ai-chat-send').click();
    await page.locator('#ai-data-confirm').click();
    await page.waitForFunction(()=>document.querySelector('#ai-chat-messages').textContent.includes('Тестовый ответ'));
    assert.match(app.requests[0].message,/Инструкции по стилю: Без эмодзи; Без обещаний/);
    await page.locator('.motion-tag button').last().click();
    app.setMode('hold');
    await page.locator('#ai-chat-input').fill('Ещё вариант');
    await page.locator('#ai-chat-send').click();await page.locator('#ai-chat-stop').waitFor();
    await page.locator('#ai-chat-stop').click();app.release();
    assert.equal(await page.locator('#ai-chat-input').getAttribute('readonly'),null);
    app.setMode('error');
    await page.locator('#ai-chat-input').fill('Проверь описание');
    await page.locator('#ai-chat-send').click();
    await page.waitForFunction(()=>document.getElementById('ai-chat-status').textContent.includes('лимит исчерпан'));
    await idle(page);await layout(page,'sAI '+width);
    await page.screenshot({path:resolve(out,'prompt-'+width+'.png')});
    await page.locator('#ai-chat-new').click();
    assert.equal(await page.locator('.motion-tag').count(),0);
    assert.deepEqual(app.errors,[]);
    await app.context.close();console.log('Prompt tags, consent, reply, stop and error passed:',width);
  }
  const reduced=await setup(390,'dark','ru','reduce');
  await reduced.page.goto(origin+'/pricing.html?theme=dark');
  await reduced.page.locator('[data-billing-cycle=yearly]').click();await idle(reduced.page);
  assert.equal(await reduced.page.locator('#sai-price-drum').getAttribute('aria-label'),'59880 ₸');
  await reduced.context.close();
  await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));
  console.log('Motion QA complete. Remote auth/payment/AI calls were mocked; no live writes.');
} finally {await browser.close();}
