import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { validateProject } from '../lib/projects.js';

// DOM integration with deterministic raster/network stubs. This does not replace
// real-browser visual QA or a deployed Supabase/OpenAI acceptance test.
const files = ['assets/demo-images.js', 'assets/demo-ceramics.js', 'assets/demo-bag.js', 'assets/demo-jewelry.js', 'assets/demo-decor.js', 'assets/demo-kitchen.js',  'product-samples.js', 'studio-renderer.js', 'studio-project.js', 'studio-tools.js', 'studio-copy.js', 'cloud-projects.js', 'editor.js', 'studio-workflow.js', 'studio-chat.js'];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWuoAAAAASUVORK5CYII=';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { for (let i = 0; i < 80; i++) { if (predicate()) return; await sleep(5); } throw new Error('UI did not settle'); }
async function setup(options = {}) {
  const dom = new JSDOM(readFileSync(new URL('../editor.html', import.meta.url), 'utf8'), { url: options.url || 'https://satucard.test/editor.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window: w } = dom;
  const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => { const data = new Uint8ClampedArray(10 * 10 * 4).fill(255); for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) { const offset = (y * 10 + x) * 4; data[offset] = 20; data[offset + 1] = 40; data[offset + 2] = 70; } return { data, width: 10, height: 10 }; } }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
  w.HTMLCanvasElement.prototype.getContext = () => context;
  w.HTMLCanvasElement.prototype.toDataURL = function(type, quality) { options.raster?.({width:this.width,height:this.height,type,quality}); return type === 'image/jpeg' ? 'data:image/jpeg;base64,/9j/AA==' : png; };
  w.HTMLCanvasElement.prototype.toBlob = function (callback, type) { callback(new Blob(['test raster'], { type })); };
  w.Image = class { naturalWidth = 10; naturalHeight = 10; set src(value) { this.value = value; setTimeout(() => this.onload?.(), options.imageDelay || 0); } };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const downloads = [];
  w.Blob = Blob; w.TextEncoder = TextEncoder; w.Uint8Array = Uint8Array; w.Uint8ClampedArray = Uint8ClampedArray; w.AbortController = AbortController; w.AbortSignal = AbortSignal;
  w.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:test'; }; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.fetch = options.fetch || (async () => Response.json({ available: false }));
  let userId = '11111111-1111-4111-8111-111111111111';
  w.SATUCARD_AUTH = { getSession: async () => ({ user: { id: userId }, access_token: 'fake-token' }) };
  const authChange = id => { userId = id; w.document.dispatchEvent(new w.CustomEvent('satucard:authchange', { detail: { user: id ? { id } : null } })); };
  for (const file of files) w.eval(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  await until(() => w.document.getElementById('editor-form').dataset.editorReady === 'true');
  const $ = id => w.document.getElementById(id);
  const input = (id, value) => { $(id).value = value; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); $(id).dispatchEvent(new w.Event('change', { bubbles: true })); };
  return { dom, w, $, input, downloads, authChange };
}


const proposal = { title: 'Новая чашка', subtitle: 'Лаконичный вариант', description: 'Керамика', features: ['Керамика'], template: 'noir' };
const reply = { reply: 'Предлагаю короче. Можно уточнить оформление.', proposal };
async function chatApp(options = {}) {
  const requests = [];
  const app = await setup({ ...options, fetch: async (url, init = {}) => {
    if (!init.method) return Response.json({ available: options.available !== false, modelVerified: false, provider: options.provider, singleUserPilot: options.singleUserPilot, groqFallbackAvailable: options.groqFallbackAvailable });
    requests.push(JSON.parse(init.body)); return options.reply ? options.reply(init) : Response.json(reply);
  }});
  await until(() => !app.$('ai-chat-recheck').disabled && app.$('ai-chat-setup').hidden === (options.available !== false));
  app.$('open-ai-chat').click();
  return { ...app, requests };
}
function check(app, id, value = true) { app.$(id).checked = value; app.$(id).dispatchEvent(new app.w.Event('input', { bubbles: true })); }
function send(app, text = 'Сделай короче', approve = true) { app.input('ai-chat-input', text); app.$('ai-chat-form').dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true })); if (approve && !app.$('ai-data-consent').hidden) app.$('ai-data-confirm').click(); }
test('visible AI entry, truthful disconnected state and manual editor work without AI', async () => {
  const app = await chatApp({available:false});
  try {
    assert.equal(app.$('ai-chat').hidden,false); assert.equal(app.$('ai-chat-setup').hidden,false);
    send(app); assert.equal(app.$('ai-chat-send').disabled,true); assert.equal(app.requests.length,0);
    app.$('ai-chat-close').click(); assert.equal(app.$('ai-chat').hidden,true); assert.equal(app.w.document.activeElement.id,'open-ai-chat');
    app.input('product-name','Ручной текст'); assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.title,'Ручной текст');
    assert.doesNotMatch(app.w.document.body.textContent,/Terra|gpt-6/i);
  } finally { app.dom.window.close(); }
});
test('conversation has history, no default photo or automatic edits, review and one-step undo', async () => {
  const app = await chatApp();
  try {
    const before = app.w.SATUCARD_EDITOR.snapshot().model.settings;
    send(app); await until(() => !app.$('ai-chat-proposal').hidden);
    assert.equal(app.requests[0].history.length,0); assert.equal(app.requests[0].imageDataUrl,undefined);
    assert.equal(app.requests[0].card.title,before.title); assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.title,before.title);
    assert.equal(app.$('ai-apply').disabled,true); app.$('ai-apply').click(); assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.title,before.title);
    check(app,'ai-reviewed'); app.input('ai-edit-title','Проверенный текст'); assert.equal(app.$('ai-reviewed').checked,false);
    check(app,'ai-apply-template'); check(app,'ai-reviewed'); app.$('ai-apply').click();
    assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.title,'Проверенный текст');
    assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.template,'noir');
    assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.background,before.background);
    send(app,'Теперь ещё короче'); await until(() => app.requests.length===2 && !app.$('ai-chat-proposal').hidden);
    assert.equal(app.requests[1].history.length,2); assert.equal(app.requests[1].history[1].role,'assistant');
    app.$('undo-button').click(); assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.title,before.title);
  } finally { app.dom.window.close(); }
});
test('questions can return no proposal and history is capped at eight messages', async () => {
  const app = await chatApp({reply:async()=>Response.json({reply:'Какие факты проверены?',proposal:null})});
  try {
    for(let i=0;i<7;i++){ send(app,'Какие факты добавить?'); await until(()=>app.requests.length===i+1 && app.$('ai-chat-stop').hidden); }
    assert.equal(app.requests.at(-1).history.length,8); assert.equal(app.$('ai-chat-messages').children.length,8); assert.equal(app.$('ai-chat-proposal').hidden,true);
    app.$('ai-chat-new').click(); send(app); await until(()=>app.requests.length===8); assert.equal(app.requests.at(-1).history.length,0);
  } finally { app.dom.window.close(); }
});
test('photo consent is explicit and only resized JPEG is sent', async () => {
  const rasters=[]; const app=await chatApp({raster:value=>rasters.push(value)});
  try {
    const photo=app.w.SATUCARD_EDITOR.snapshot().images.photo; photo.naturalWidth=2400;photo.naturalHeight=1200;
    check(app,'ai-photo-consent');send(app);await until(()=>app.requests.length===1);
    assert.equal(app.requests[0].imageConsent,true);assert.match(app.requests[0].imageDataUrl,/^data:image\/jpeg;base64,/);
    assert.deepEqual(rasters.find(v=>v.type==='image/jpeg'),{width:768,height:384,type:'image/jpeg',quality:.8});
    app.$('ai-chat-new').click();assert.equal(app.$('ai-photo-consent').checked,false);
  }finally{app.dom.window.close();}
});
for(const action of ['cancel','close','view','edit','auth','facts','photo','pagehide'])test(`late response cannot apply after ${action}`,async()=>{
  let resolve,signal; const app=await chatApp({reply:init=>{signal=init.signal;return new Promise(done=>{resolve=done;});}});
  try{
    send(app);send(app);await until(()=>!!resolve);assert.equal(app.requests.length,1);
    if(action==='cancel')app.$('ai-chat-stop').click();
    if(action==='close')app.$('ai-chat-close').click();
    if(action==='view')app.$('add-view').click();
    if(action==='edit')app.input('product-name','Новый текст');
    if(action==='auth')app.authChange(null);
    if(action==='facts')app.input('ai-facts','Новые факты');
    if(action==='photo')app.$('photo-input').dispatchEvent(new app.w.Event('change'));
    if(action==='pagehide')app.w.dispatchEvent(new app.w.Event('pagehide'));
    assert.equal(signal.aborted,true);resolve(Response.json(reply));await sleep(20);
    assert.equal(app.$('ai-chat-proposal').hidden,true);assert.equal(app.$('ai-reviewed').checked,false);
  }finally{app.dom.window.close();}
});
test('canceled request cannot overwrite a newer response; invalid replies fail closed',async()=>{
  const pending=[];const app=await chatApp({reply:()=>new Promise(done=>pending.push(done))});
  try{
    send(app);await until(()=>pending.length===1);app.$('ai-chat-stop').click();send(app,'Другой вариант');await until(()=>pending.length===2);
    pending[1](Response.json(reply));await until(()=>!app.$('ai-chat-proposal').hidden);pending[0](Response.json({...reply,proposal:{...proposal,title:'Старый'}}));await sleep(20);
    assert.equal(app.$('ai-edit-title').value,proposal.title);
    send(app);await until(()=>pending.length===3);
    assert.deepEqual(app.requests[2].previousProposal, proposal);
    pending[2](Response.json({...reply,proposal:{...proposal,template:'evil'}}));
    await until(()=>/Некорректный/.test(app.$('ai-chat-status').textContent));
    assert.equal(app.$('ai-chat-proposal').hidden,false);
    assert.equal(app.$('ai-edit-template').value,proposal.template);
    assert.equal(app.$('ai-chat-messages').children.length,2);
  }finally{app.dom.window.close();}
});
test('timeouts restore composer; no synthetic offline AI response',async()=>{
  let expire,signal;const app=await chatApp({reply:init=>{signal=init.signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));}});
  try{
    const original=app.w.setTimeout;app.w.setTimeout=(callback,delay,...args)=>{if(delay===75000){expire=callback;return 999;}return original(callback,delay,...args);};
    send(app);await until(()=>!!signal);expire();await until(()=>/истекло/.test(app.$('ai-chat-status').textContent));assert.equal(app.$('ai-chat-input').readOnly,false);assert.equal(app.$('ai-chat-proposal').hidden,true);
  }finally{app.dom.window.close();}
});
test('reset/import boundaries clear facts even when current view id is unchanged',async()=>{
  const app=await chatApp();
  try{
    app.input('ai-facts','Старый товар');app.input('ai-chat-input','Старый запрос');check(app,'ai-photo-consent');
    app.$('reset-button').click();assert.equal(app.$('ai-facts').value,'');assert.equal(app.$('ai-chat-input').value,'');assert.equal(app.$('ai-photo-consent').checked,false);
    const editor = app.w.SATUCARD_EDITOR;
    const saved = editor.snapshot(true).serialized;
    app.input('ai-facts','Другой старый товар');
    await editor.restoreProject(saved);
    assert.equal(app.$('ai-facts').value,'');
  }finally{app.dom.window.close();}
});
test('adding verified facts keeps the question in context and sends the clarification in the same chat', async () => {
  const app = await chatApp({ reply: () => Response.json({ reply: 'Из чего сделана чашка?', proposal: null }) });
  try {
    send(app, 'Собери карточку чашки');
    await until(() => app.$('ai-chat-messages').children.length === 2);
    app.input('ai-facts', 'Материал: керамика');
    assert.equal(app.$('ai-chat-messages').children.length, 2);
    send(app, 'Продолжай');
    await until(() => app.requests.length === 2);
    assert.equal(app.requests[1].history[1].content, 'Из чего сделана чашка?');
    assert.equal(app.requests[1].facts, 'Материал: керамика');
  } finally { app.dom.window.close(); }
});
test('guided build starts clean and applies selected fields without carrying demo data', async () => {
  const app = await chatApp({ provider: 'gemini', singleUserPilot: true });
  try {
    app.$('ai-build-toggle').click();
    assert.equal(app.$('ai-build-name').value, '');
    app.input('ai-build-name', 'Чашка');
    app.input('ai-build-facts', 'Керамика, цвет белый');
    app.$('ai-build-send').click();
    await until(() => !app.$('ai-chat-proposal').hidden && app.$('ai-chat-stop').hidden);
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].mode, 'build');
    assert.equal(app.requests[0].card.title, 'Чашка');
    assert.equal(app.requests[0].card.description, '');
    assert.equal(app.requests[0].facts, 'Керамика, цвет белый');
    const description = app.w.document.querySelector('[data-ai-field="description"]');
    description.click();
    check(app, 'ai-reviewed');
    app.$('ai-apply').click();
    const after = app.w.SATUCARD_EDITOR.snapshot();
    assert.equal(after.sampleKey, null);
    assert.equal(after.model.settings.title, proposal.title);
    assert.equal(after.model.settings.description, '');
    assert.equal(after.model.photoId, null);
  } finally { app.dom.window.close(); }
});
test('Kazakh translation creates a separate copy with one undo, and Groq consent is opt in', async () => {
  const translated = { ...proposal, title: 'Керамика кесе', subtitle: 'Ақ кесе' };
  const app = await chatApp({ provider: 'gemini', singleUserPilot: true, groqFallbackAvailable: true,
    reply: () => Response.json({ reply: 'Аударма дайын.', proposal: translated, providerUsed: 'groq' }) });
  try {
    const before = app.w.SATUCARD_EDITOR.snapshot().model;
    assert.equal(app.$('ai-groq-option').hidden, false);
    assert.equal(app.$('ai-groq-consent').checked, false);
    check(app, 'ai-groq-consent');
    app.$('ai-translate').click();
    assert.equal(app.requests.length, 0);
    app.$('ai-chat-form').requestSubmit();
    await until(() => !app.$('ai-chat-proposal').hidden && app.$('ai-chat-stop').hidden);
    assert.equal(app.requests[0].mode, 'translate');
    assert.equal(app.requests[0].language, 'kk');
    assert.equal(app.requests[0].groqFallbackConsent, true);
    assert.match(app.$('ai-chat-status').textContent, /Groq/);
    check(app, 'ai-reviewed');
    app.$('ai-apply').click();
    const after = app.w.SATUCARD_EDITOR.snapshot().model;
    assert.equal(after.views.length, before.views.length + 1);
    assert.equal(after.views[0].settings.title, before.settings.title);
    assert.equal(after.settings.title, translated.title);
    app.$('undo-button').click();
    assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.views.length, before.views.length);
  } finally { app.dom.window.close(); }
});
test('changing the primary photo via editor API revokes prior consent',async()=>{
  const app=await chatApp();
  try{
    check(app,'ai-photo-consent');await app.w.SATUCARD_EDITOR.replacePhoto(png,app.w.SATUCARD_EDITOR.revision);
    assert.equal(app.$('ai-photo-consent').checked,false);
  }finally{app.dom.window.close();}
});

test('right chat has one persistent entry, readable typography and no blocking overlay', async () => {
  const app = await chatApp({available:false});
  try {
    assert.equal(app.w.document.querySelectorAll('[data-open-ai]').length,1);
    assert.equal(app.$('open-ai-chat').textContent.trim(),'sAI');
    assert.equal(app.$('ai-chat').getAttribute('aria-modal'),'false');
    assert.equal(app.$('ai-chat-backdrop'),null);assert.equal(app.w.document.querySelector('.ai-sidebar-launch'),null);assert.equal(app.$('main').hasAttribute('inert'),false);
    assert.equal(app.w.document.querySelector('.ai-privacy-details'),null);assert.equal(app.$('ai-chat-welcome'),null);
    assert.doesNotMatch(app.$('ai-chat').textContent,/ПОМОЩНИК В РЕДАКТОРЕ|ТЕКУЩАЯ КАРТОЧКА/);
    const css=readFileSync(new URL('../studio-chat.css',import.meta.url),'utf8');assert.match(css,/width: min\(580px/);assert.match(css,/right: 24px/);assert.doesNotMatch(css,/backdrop-filter|body\.ai-chat-open\s*\{\s*overflow/);
    for(const [,size] of css.matchAll(/font-size:\s*(\d+)px/g))assert.ok(Number(size)>=14);
    app.$('ai-chat-input').dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(app.$('ai-chat').hidden,true);assert.equal(app.$('main').hasAttribute('inert'),false);
  }finally{app.dom.window.close();}
});
test('editor remains usable beside the chat, keyboard is not trapped and close restores focus',async()=>{
  const app=await chatApp();
  try{
    assert.equal(app.$('main').hasAttribute('inert'),false);
    app.input('product-name','Редактирование рядом с чатом');
    assert.equal(app.$('ai-chat').hidden,false);assert.equal(app.w.SATUCARD_EDITOR.snapshot().model.settings.title,'Редактирование рядом с чатом');
    const tab=new app.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});
    app.$('ai-chat-new').focus();app.$('ai-chat-new').dispatchEvent(tab);assert.equal(tab.defaultPrevented,false);
    app.$('ai-chat-close').click();assert.equal(app.w.document.activeElement,app.$('open-ai-chat'));assert.equal(app.w.document.body.classList.contains('ai-chat-open'),false);
  }finally{app.dom.window.close();}
});
test('Kazakh language selection still works without suggestion buttons',async()=>{
  const app=await chatApp();
  try{
    app.input('ai-language','kk');assert.equal(app.$('ai-language').value,'kk');
    assert.equal(app.requests.length,0);assert.equal(app.$('ai-chat-messages').children.length,0);send(app);await until(()=>app.requests.length===1);assert.equal(app.requests[0].language,'kk');
  }finally{app.dom.window.close();}
});

test('repeated open cannot leave the editor inert after close',async()=>{
  const app=await chatApp();
  try{app.$('open-ai-chat').click();app.$('open-ai-chat').click();app.$('ai-chat-close').click();assert.equal(app.$('main').hasAttribute('inert'),false);assert.equal(app.$('ai-chat-backdrop'),null);}finally{app.dom.window.close();}
});


test('sAI composer is minimal with an accessible arrow-only send button',async()=>{
  const app=await chatApp();
  try{
    assert.equal(app.$('ai-chat-title').textContent,'sAI');
    assert.equal(app.$('open-ai-chat').getAttribute('aria-label'),'Открыть чат sAI');
    assert.equal(app.$('ai-chat-input').hasAttribute('placeholder'),false);
    assert.equal(app.w.document.querySelector('label[for="ai-chat-input"]').textContent,'Сообщение sAI');
    assert.equal(app.w.document.querySelector('.ai-input-hint'),null);
    assert.equal(app.$('ai-chat-send').textContent.trim(),'↑');
    assert.equal(app.$('ai-chat-send').getAttribute('aria-label'),'Отправить сообщение');
    assert.equal(app.$('ai-chat-send').querySelector('span').getAttribute('aria-hidden'),'true');
    assert.equal(app.$('ai-chat-send').disabled,true);
    app.input('ai-chat-input','Помоги с карточкой');assert.equal(app.$('ai-chat-send').disabled,false);
    app.$('ai-chat-send').click();app.$('ai-data-confirm').click();await until(()=>app.requests.length===1 && app.$('ai-chat-stop').hidden);
    assert.equal(app.requests[0].message,'Помоги с карточкой');
    assert.equal(app.$('ai-chat-messages').lastElementChild.getAttribute('aria-label'),'sAI');
    assert.equal(app.$('ai-chat-send').textContent.trim(),'↑');
  }finally{app.dom.window.close();}
});
test('removed welcome and suggestions stay absent through chat resets and errors',async()=>{
  const app=await chatApp({reply:async()=>Response.json({error:'Попробуйте позже'},{status:429})});
  try{
    const absent=()=>{
      for(const id of ['ai-chat-welcome','ai-chat-prompts','ai-chat-card'])assert.equal(app.$(id),null);
      assert.equal(app.w.document.querySelector('[data-ai-prompt]'),null);
      assert.doesNotMatch(app.$('ai-chat').textContent,/Что изменим в карточке|Изменения — после вашей проверки|Улучшить текст|Выбрать стиль/);
    };
    absent();send(app);await until(()=>/Попробуйте позже/.test(app.$('ai-chat-status').textContent));absent();
    app.$('ai-chat-new').click();absent();
    app.$('ai-chat-close').click();app.$('open-ai-chat').click();absent();
    assert.equal(app.$('ai-photo-consent').checked,false);
    assert.equal(app.w.document.querySelector('.ai-privacy-details'),null);
  }finally{app.dom.window.close();}
});


test('composer starts compact, grows for text and shrinks after clearing',async()=>{
  const app=await chatApp();
  try{
    const input=app.$('ai-chat-input');
    assert.equal(input.rows,1);assert.equal(input.style.height,'44px');
    assert.equal(input.hasAttribute('aria-describedby'),false);
    assert.equal(app.$('ai-chat-privacy'),null);assert.equal(app.w.document.querySelector('.ai-privacy-details'),null);
    assert.doesNotMatch(app.$('ai-chat').textContent,/Тексты отправятся OpenAI|После отправки будут переданы|Переписка не сохраняется после перезагрузки/);
    Object.defineProperty(input,'scrollHeight',{configurable:true,get:()=>input.value ? 200 : 44});
    app.input('ai-chat-input','Длинный запрос');assert.equal(input.style.height,'140px');assert.equal(input.style.overflowY,'auto');
    app.input('ai-chat-input','');assert.equal(input.style.height,'44px');assert.equal(input.style.overflowY,'hidden');
    const css=readFileSync(new URL('../studio-chat.css',import.meta.url),'utf8');
    assert.match(css,/\.ai-input-shell \{ display: flex; align-items: flex-end/);
    assert.doesNotMatch(css,/min-height: (78|62)px|ai-privacy-details/);
  }finally{app.dom.window.close();}
});
test('first-send data consent is contextual, cancelable and never implies photo consent',async()=>{
  const app=await chatApp();
  try{
    assert.equal(app.$('ai-data-consent').hidden,true);send(app,'Первый запрос',false);
    assert.equal(app.requests.length,0);assert.equal(app.$('ai-data-consent').hidden,false);
    assert.match(app.$('ai-data-question').textContent,/OpenAI.*запрос.*карточки.*факты.*историю/);
    app.$('ai-data-cancel').click();assert.equal(app.$('ai-data-consent').hidden,true);assert.equal(app.requests.length,0);
    assert.equal(app.$('ai-chat-input').value,'Первый запрос');
    send(app,'Первый запрос',false);app.$('ai-data-confirm').click();app.$('ai-data-confirm').click();
    await until(()=>app.requests.length===1 && app.$('ai-chat-stop').hidden);
    assert.equal(app.requests[0].imageDataUrl,undefined);assert.equal(app.$('ai-photo-consent').checked,false);
    send(app,'Продолжение',false);await until(()=>app.requests.length===2 && app.$('ai-chat-stop').hidden);
    assert.equal(app.$('ai-data-consent').hidden,true);
    app.$('ai-chat-new').click();send(app,'Другой чат',false);assert.equal(app.$('ai-data-consent').hidden,false);assert.equal(app.requests.length,2);
    app.$('ai-chat-close').click();app.$('open-ai-chat').click();assert.equal(app.$('ai-data-consent').hidden,true);
    app.$('ai-data-confirm').click();assert.equal(app.requests.length,2);
    send(app,'Новый запрос',false);app.input('ai-chat-input','Исправленный запрос');assert.equal(app.$('ai-data-consent').hidden,true);
  }finally{app.dom.window.close();}
});

test('Gemini chat keeps the header clean and links to data terms before sending', async () => {
  const ui = await chatApp({ provider: 'gemini' });
  try {
    assert.doesNotMatch(ui.w.document.querySelector('.ai-chat-header').textContent, /Gemini|подключение/);
    send(ui, 'Первый запрос', false);
    assert.equal(ui.requests.length, 0);
    assert.equal(ui.$('ai-data-consent').hidden, false);
    assert.match(ui.$('ai-data-question').textContent,/Google Gemini/);
    assert.doesNotMatch(ui.$('ai-data-question').textContent,/улучшения продуктов/);
    assert.equal(ui.$('ai-google-data-policy').hidden, false);
    assert.equal(ui.$('ai-google-data-policy').href, 'https://ai.google.dev/gemini-api/terms#unpaid-services');
    assert.match(ui.$('ai-photo-consent').parentElement.textContent,/Google Gemini/);
    assert.equal(ui.$('ai-photo-consent').checked,false);
    assert.equal(ui.$('ai-chat-messages').children.length,0);
  } finally {ui.dom.window.close();}
});

test('Enter submits through consent and Shift+Enter or composition do not send', async () => {
  const app = await chatApp();
  const pressEnter = options => app.$('ai-chat-input').dispatchEvent(
    new app.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options })
  );
  try {
    app.input('ai-chat-input', 'Первый запрос');
    assert.equal(pressEnter({ shiftKey: true }), true);
    assert.equal(pressEnter({ isComposing: true }), true);
    assert.equal(pressEnter({ repeat: true }), false);
    assert.equal(app.$('ai-data-consent').hidden, true);
    assert.equal(pressEnter(), false);
    assert.equal(app.$('ai-data-consent').hidden, false);
    assert.equal(app.requests.length, 0);
    app.$('ai-data-confirm').click();
    await until(() => app.requests.length === 1 && app.$('ai-chat-stop').hidden);
    app.input('ai-chat-input', 'Вторая строка\nПродолжение');
    assert.equal(pressEnter(), false);
    await until(() => app.requests.length === 2 && app.$('ai-chat-stop').hidden);
    assert.equal(app.requests[1].message, 'Вторая строка\nПродолжение');
  } finally { app.dom.window.close(); }
});

test('single-user Gemini pilot sends with Enter without asking again or attaching a photo', async () => {
  const app = await chatApp({ provider: 'gemini', singleUserPilot: true });
  try {
    app.input('ai-chat-input', 'Первый запрос');
    app.$('ai-chat-input').dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await until(() => app.requests.length === 1 && app.$('ai-chat-stop').hidden);
    assert.equal(app.$('ai-data-consent').hidden, true);
    assert.equal(app.requests[0].message, 'Первый запрос');
    assert.equal(app.requests[0].imageDataUrl, undefined);
    assert.equal(app.requests[0].imageConsent, undefined);
  } finally { app.dom.window.close(); }
});
