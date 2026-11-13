import { TEMPLATES, layer, uid, clone, clamp, templateProject } from './video-model.js';
import { scenes, reorderScene, duplicateScene, removeScene, openingVariant, adaptFormat, parseCatalog, catalogProject } from './video-workflow.js';
import { exportVideo } from './video-export.js';
import { inspectFile } from './video-media.js';
import { drawProject } from './video-renderer.js';
import { speechRequest, wavBlob } from './video-speech.js';
import { checkImportQuota } from './video-file-safety.js';

const $=selector=>document.querySelector(selector);
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function fileDownload(blob,name){const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function dataBlob(source){const [header,encoded]=source.split(',');return new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:header.slice(5).split(';')[0]});}
export async function installVideoPlus(api){
  const run=fn=>async event=>{try{await fn(event);}catch(error){api.toast(error.message);}};
  const button=(text,fn)=>{const b=element('button',text,'full subtle');b.type='button';b.addEventListener('click',run(fn));return b;};
  const panel=element('section');panel.dataset.library='workflow';panel.hidden=true;
  panel.innerHTML='<div class="panel-heading"><h1>От товара к истории</h1><span>✦</span></div><p class="muted">Карточка, сцены и готовые варианты рекламы.</p><div class="workflow-tabs"><button data-workflow-tab="scenes">Сцены</button><button data-workflow-tab="cards">Карточки</button><button data-workflow-tab="batch">Каталог</button></div><section data-workflow-page="scenes"><div id="scene-list"></div><label>Переход между сценами<select id="scene-transition"><option value="none">Склейка</option><option value="fade">Растворение</option><option value="slide">Сдвиг</option><option value="wipe">Шторка</option></select></label><h2>Первые секунды</h2><p class="muted">Три подачи одного товара. Изменяется первая сцена.</p><div id="opening-options"></div><h2>Версии для площадок</h2><p class="muted">Адаптация переставляет товар, цену и заголовки. Проверьте композицию перед экспортом.</p><div id="adapt-options"></div></section><section data-workflow-page="cards" hidden><h2>Из сохранённой карточки</h2><p class="muted">Локальные карточки из этого браузера. Фото и данные переносятся в выбранный шаблон.</p><select id="card-template" aria-label="Шаблон для карточки"></select><div id="card-list"></div></section><section data-workflow-page="batch" hidden><h2>Ролики для каталога</h2><p class="muted">До 10 товаров. В поле image укажите точное имя загруженного фото.</p><textarea id="catalog-csv" rows="7" aria-label="Каталог CSV" placeholder="title;price;image;brand&#10;Наушники;24990 ₸;headphones.jpg;Магазин"></textarea><div id="batch-actions"></div><div id="batch-review"></div></section>';
  $('.library').prepend(panel);
  const nav=element('button');nav.dataset.panel='workflow';nav.setAttribute('aria-label','Проекты');nav.innerHTML='<span aria-hidden="true">✦</span>Проекты';$('.rail').prepend(nav);nav.addEventListener('click',()=>api.showPanel('workflow'));
  panel.querySelectorAll('[data-workflow-tab]').forEach(tab=>tab.addEventListener('click',()=>panel.querySelectorAll('[data-workflow-page]').forEach(page=>page.hidden=page.dataset.workflowPage!==tab.dataset.workflowTab)));
  const categories=['Яркие',...new Set(TEMPLATES.filter(t=>t.category!=='Яркие').map(t=>t.category))];
  const filters=$('#template-filters');filters.replaceChildren();for(const category of ['Все',...categories]){const b=element('button',category);b.dataset.filter=category;if(category==='Все')b.className='active';filters.append(b);}
  const search=element('input');search.placeholder='Найти шаблон…';search.setAttribute('aria-label','Поиск шаблона');search.className='template-search';filters.before(search);
  search.addEventListener('input',run(()=>api.searchTemplates(search.value)));
  for(const template of TEMPLATES){const option=element('option',template.name);option.value=template.id;$('#card-template').append(option);}
  function edit(fn){return api.edit(fn);}
  function renderScenes(){
    const root=$('#scene-list');root.replaceChildren();const project=api.project();
    $('#scene-transition').value=project.transition||'none';
    for(const [index,scene]of scenes(project).entries()){
      const card=element('article',undefined,'scene-card');const title=element('button',String(index+1).padStart(2,'0')+' · '+scene.name);title.title=scene.name;title.addEventListener('click',run(()=>api.seek(scene.start+.55)));card.append(title,element('small',scene.start.toFixed(1)+'–'+scene.end.toFixed(1)+' с'));
      const row=element('div',undefined,'button-row');
      for(const [text,action]of [['←',p=>reorderScene(p,scene.id,-1)],['→',p=>reorderScene(p,scene.id,1)],['Копия',p=>duplicateScene(p,scene.id)],['×',p=>removeScene(p,scene.id)]])row.append(button(text,()=>edit(action)));
      card.append(row);root.append(card);
    }
    if(!root.children.length)root.append(element('p','В свободном проекте объедините выбранные слои в сцену.','muted'));
  }
  $('#scene-transition').addEventListener('change',run(()=>edit(p=>p.transition=$('#scene-transition').value)));
  for(const [key,label]of [['detail','Крупный план'],['benefit','Преимущество'],['offer','Предложение']])$('#opening-options').append(button(label,()=>api.replace(openingVariant(api.project(),key))));
  for(const [key,label]of [['vertical','9:16'],['square','1:1'],['wide','16:9']])$('#adapt-options').append(button('Адаптировать в '+label,()=>api.replace(adaptFormat(api.project(),key))));
  $('#opening-options').append(button('Скачать 3 начала · ZIP',()=>exportBatch(['detail','benefit','offer'].map(kind=>openingVariant(api.project(),kind)))));
  $('#adapt-options').append(button('Скачать 3 формата · ZIP',()=>exportBatch(['vertical','square','wide'].map(format=>adaptFormat(api.project(),format)))));

  // Real card data is parsed by the existing validated card project parser.
  async function fromCard(raw){
    const data=window.SATUCARD_PROJECT.parseProject(raw,window.SATUCARD_RENDERER.normalize),s=data.settings;
    const product={title:s.title,price:s.showPrice===false?'':s.price==null?'Цена по запросу':new Intl.NumberFormat('ru').format(s.price)+' ₸',brand:s.showBrand===false?'':s.brandName||'',cta:s.description?.slice(0,120)||'Узнайте больше',features:[...(s.features||[])]};
    while(product.features.length<3)product.features.push('');
    const photoId=data.views?.find(v=>v.id===data.activeViewId)?.photoIds?.[0];
    const source=data.photos?.find(p=>p.id===photoId)?.source||data.photo;
    if(!source)throw new Error('В карточке нет фотографии товара.');
    const file=dataBlob(source),asset={id:uid(),kind:'image',name:'Товар из карточки',duration:0};
    const next=templateProject($('#card-template').value,product,asset.id);next.assets.push(asset);
    if(s.showPrice===false)for(const item of next.layers.filter(i=>i.role==='price'||i.name==='Плашка цены'))item.hidden=true;
    if(s.customColors)for(const item of next.layers.filter(i=>i.name==='Плашка цены'))item.color=s.accent;
    const files=new Map([[asset.id,file]]);
    if(data.logo&&s.showBrand!==false){const logo={id:uid(),kind:'image',name:'Логотип карточки',duration:0};files.set(logo.id,dataBlob(data.logo));next.assets.push(logo);next.layers.push(layer('image',{role:'logo',name:'Логотип',assetId:logo.id,x:.78,y:.04,w:.14,h:.065,fit:'contain',end:next.duration}));}
    if(api.confirmReplace())await api.switchProject(next,files);
  }
  async function loadCards(){
    const list=$('#card-list');list.replaceChildren();const cards=await window.SATUCARD_PROJECT.draftAction('list');
    for(const card of cards.filter(c=>c.payload).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))list.append(button(card.title,()=>fromCard(card.payload)));
    if(!list.children.length)list.append(element('p','Сохранённых карточек пока нет. Создайте карточку в редакторе.','muted'));
  }
  $('#card-list').before(button('Обновить список',loadCards));await loadCards();
  const sourceDraft=new URLSearchParams(location.search).get('fromCard');
  if(sourceDraft){const raw=await window.SATUCARD_PROJECT.draftAction('get',undefined,sourceDraft);if(raw)await fromCard(raw);history.replaceState(null,'',location.pathname);}

  let batch=[];
  $('#batch-actions').append(button('Проверить каталог',async()=>{
    batch=[];$('#batch-review').replaceChildren();
    for(const row of parseCatalog($('#catalog-csv').value)){
      const asset=api.project().assets.find(a=>a.name===row.image&&a.kind==='image');if(!asset)throw new Error('Загрузите фотографию «'+row.image+'» во вкладке Медиа.');
      batch.push(catalogProject(api.project(),row,asset));
    }
    for(const item of batch){await api.media().prepare(item);const card=element('article',undefined,'batch-card');const thumb=element('canvas');thumb.width=135;thumb.height=240;drawProject(thumb,item,api.media(),.8);card.append(thumb,element('strong',item.product.title),element('span',item.product.price));$('#batch-review').append(card);}
    $('#batch-review').append(button('Экспортировать '+batch.length+' роликов · ZIP',()=>exportBatch(batch)));
  }));
  const csvInput=element('input');csvInput.type='file';csvInput.accept='.csv,text/csv';csvInput.hidden=true;panel.append(csvInput);csvInput.addEventListener('change',run(async()=>{if(csvInput.files[0]?.size>100000)throw new Error('CSV до 100 КБ.');$('#catalog-csv').value=await csvInput.files[0].text();csvInput.value='';}));
  $('#batch-actions').append(button('Загрузить CSV',()=>csvInput.click()),button('Скачать пример CSV',()=>fileDownload(new Blob(['\uFEFFtitle;price;image;brand;cta;feature1;feature2;feature3\nМой товар;4900 ₸;photo.jpg;Магазин;Узнать больше;Деталь 1;Деталь 2;Деталь 3'],{type:'text/csv;charset=utf-8'}),'catalog.csv')));
  const batchDialog=element('dialog');batchDialog.innerHTML='<h2>Собираем серию</h2><progress max="1" value="0"></progress><p role="status"></p>';const cancel=button('Отменить',()=>batchAbort?.abort());batchDialog.append(cancel);document.body.append(batchDialog);let batchAbort=null;
  async function exportBatch(projects){
    if(batchAbort)return;api.stop();const snapshots=projects.map(clone),media=api.media(),entries=[];batchAbort=new AbortController();const signal=batchAbort.signal;$('#workspace').inert=true;batchDialog.showModal();
    try{
      for(const [index,p]of snapshots.entries()){
        const blob=await exportVideo(p,media,{height:1280,signal,onProgress:(value,message)=>{batchDialog.querySelector('progress').value=(index+value)/snapshots.length;batchDialog.querySelector('p').textContent=(index+1)+' / '+snapshots.length+' · '+p.name+' · '+message;}});
        if(entries.reduce((sum,e)=>sum+e.bytes.length,0)+blob.size>200*1024*1024)throw new Error('Пакет превышает 200 МБ. Уменьшите число товаров.');
        const name=String(index+1).padStart(2,'0')+'-'+p.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').slice(0,60)+'.mp4';entries.push({name,bytes:new Uint8Array(await blob.arrayBuffer())});
      }
      fileDownload(new Blob([window.SATUCARD_TOOLS.createZip(entries)],{type:'application/zip'}),'SatuCard-video-series.zip');api.toast('Серия готова: '+entries.length+' роликов.');
    }catch(error){if(error.name==='AbortError')api.toast('Пакетный экспорт отменён.');else throw error;}
    finally{batchAbort=null;batchDialog.close();$('#workspace').inert=false;await media.seek(api.project(),api.time(),true);api.draw();}
  }
  batchDialog.addEventListener('cancel',event=>{if(batchAbort){event.preventDefault();batchAbort.abort();}});
  window.addEventListener('beforeunload',event=>{if(batchAbort){event.preventDefault();event.returnValue='';}});

  // Group selected layers and preserve their relative timing during drag.
  const groupBox=element('details',undefined,'layer-groups');groupBox.append(element('summary','Группировка слоёв'));const groupList=element('div');groupBox.append(groupList);
  const sceneGroup=button('Создать сцену из выбранных',()=>groupChecked(true)),linkGroup=button('Связать выбранные слои',()=>groupChecked(false));groupBox.append(linkGroup,sceneGroup,button('Разгруппировать текущий слой',()=>edit(p=>{const item=api.current();if(!item)return;const group=item.group;for(const i of p.layers.filter(i=>i.id===item.id||group&&i.group===group))delete i.group;})));$('[data-workflow-page=scenes]').append(groupBox);
  function groupChecked(scene){const ids=[...groupList.querySelectorAll('input:checked')].map(i=>i.value);if(ids.length<2)throw new Error('Выберите хотя бы два слоя.');return edit(p=>{const group=uid();for(const item of p.layers.filter(i=>ids.includes(i.id)))item[scene?'scene':'group']=group;});}
  function renderGroups(){groupList.replaceChildren();for(const item of api.project().layers){const label=element('label');const input=element('input');input.type='checkbox';input.value=item.id;label.append(input,document.createTextNode(item.name));groupList.append(label);}}

  const mediaPanel=$('[data-library=media]');const treatment=element('details',undefined,'treatment');treatment.append(element('summary','Оформление выбранного товара'),element('p','Удаление работает с однотонным фоном. Исходное фото сохраняется.','muted'));
  const tolerance=element('input');tolerance.type='range';tolerance.min=5;tolerance.max=100;tolerance.value=32;tolerance.setAttribute('aria-label','Допуск удаления фона');treatment.append(tolerance);
  treatment.append(button('Удалить однотонный фон',async()=>{
    const item=api.current();if(item?.type!=='image')throw new Error('Выберите фотографию на монтажной шкале.');if(item.locked)throw new Error('Разблокируйте слой.');
    const version=api.revision(),asset=api.project().assets.find(a=>a.id===item.assetId),image=await api.media().image(asset),canvas=element('canvas'),ratio=Math.min(1,1800/Math.max(image.width,image.height));canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);const result=window.SATUCARD_TOOLS.removeBackground(ctx.getImageData(0,0,canvas.width,canvas.height),canvas.width,canvas.height,Number(tolerance.value));ctx.putImageData(new ImageData(result.data,canvas.width,canvas.height),0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(api.revision()!==version)throw new Error('Слой изменился. Повторите обработку.');
    if(api.current()?.id!==item.id)throw new Error('Выбран другой слой. Повторите обработку.');
    await addMedia(blob,'Товар без фона.png','image',0,()=>{const target=api.current();target.fit='contain';target.shadow=.7;});
  }));mediaPanel.prepend(treatment);
  async function addMedia(blob,name,kind,duration,after){
    const p=api.project();checkImportQuota(p,api.media().files,blob);if(!after&&p.layers.length>=64)throw new Error('Недостаточно места в проекте.');
    const asset={id:uid(),name,kind,duration};api.snapshot();p.assets.push(asset);api.media().files.set(asset.id,blob);
    if(after){const item=api.current();item.assetId=asset.id;after();}
    else p.layers.push(layer(kind,{name,assetId:asset.id,start:0,end:Math.min(p.duration,duration||p.duration),volume:kind==='audio'?1:0,voice:kind==='audio'}));
    await api.media().prepare(p);api.changed({library:true});
  }
  const audioPanel=$('[data-library=audio]'),voice=element('section');voice.innerHTML='<hr><h2>Голос и субтитры</h2><p class="muted">Запишите свой голос или используйте подключённый речевой сервис.</p><label>Язык<select id="voice-language"><option value="ru">Русский</option><option value="kk">Қазақша</option></select></label><textarea id="voice-script" rows="4" maxlength="400" aria-label="Текст озвучки" placeholder="Текст для озвучки…"></textarea><label>Голос<select id="voice-name"><option value="coral">Coral</option><option value="alloy">Alloy</option><option value="sage">Sage</option></select></label><p class="muted">Синтезированный голос создаётся ИИ. Текст или выбранная запись передаются OpenAI только по нажатию кнопки.</p><div id="voice-actions"></div><p id="voice-status" role="status"></p><label class="safe-label"><input type="checkbox" id="ducking"> Приглушать музыку под голос</label>';audioPanel.append(voice);
  $('#ducking').addEventListener('change',run(()=>edit(p=>p.ducking=$('#ducking').checked)));
  let recorder=null,recordingStream=null,recordingTimer=null;
  const record=button('● Записать голос',async()=>{
    if(recorder?.state==='recording'){recorder.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Запись микрофона недоступна в этом браузере.');
    api.stop();recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});const projectId=api.project().id;
    const preferred=['audio/webm;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));recorder=new MediaRecorder(recordingStream,preferred?{mimeType:preferred}:{});const chunks=[];const started=performance.now();
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onstop=run(async()=>{clearTimeout(recordingTimer);recordingStream.getTracks().forEach(t=>t.stop());record.textContent='● Записать голос';$('#voice-status').textContent='Запись завершена';const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});const duration=Math.min(30,(performance.now()-started)/1000);if(api.project().id!==projectId){fileDownload(blob,'voice.webm');return;}await addMedia(blob,'Мой голос', 'audio',duration);});
    recorder.start();record.textContent='■ Остановить запись';$('#voice-status').textContent='Идёт запись · максимум 30 секунд';recordingTimer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},30000);
  });$('#voice-actions').append(record);
  $('#voice-actions').append(button('Создать ИИ-озвучку',async()=>{
    const text=$('#voice-script').value.trim();if(!text)throw new Error('Введите текст озвучки.');const version=api.revision();$('#voice-status').textContent='Создаём озвучку…';
    const blob=await speechRequest({action:'speech',text,voice:$('#voice-name').value,language:$('#voice-language').value});
    if(api.revision()!==version){fileDownload(blob,'voice.mp3');return;}const asset=await inspectFile(new File([blob],'ИИ-озвучка.mp3',{type:'audio/mpeg'}));await addMedia(blob,asset.name,asset.kind,asset.duration);$('#voice-status').textContent='ИИ-озвучка добавлена. Прослушайте результат.';
  }),button('Распознать выбранную дорожку',async()=>{
    const item=api.current();if(!item?.assetId||!['audio','video'].includes(item.type))throw new Error('Выберите аудио или видео на шкале.');const version=api.revision();const buffer=await api.media().decode(api.project().assets.find(a=>a.id===item.assetId));const blob=wavBlob(buffer,item.offset,Math.min(item.end-item.start,30),item.speed??1);$('#voice-status').textContent='Распознаём речь…';
    const result=await speechRequest({action:'transcribe',file:blob,language:$('#voice-language').value});if(version!==api.revision())throw new Error('Проект изменился. Повторите распознавание.');
    const cues=result.segments.map(s=>({start:clamp(item.start+s.start,0,api.project().duration),end:clamp(item.start+s.end,0,api.project().duration),text:s.text.slice(0,500)})).filter(c=>c.end>c.start+.01);
    if(!cues.length)throw new Error('Речь не обнаружена.');api.addLayer(layer('subtitles',{name:'Автосубтитры',cues,end:api.project().duration,x:.1,y:.72,w:.8,h:.13,fontSize:.055,align:'center',background:'#17171e',entrance:'none',exit:'none'}));$('#subtitle-source').value=toSrt(cues);$('#voice-status').textContent='Субтитры готовы. Проверьте текст и таймкоды.';
  }));
  const subtitlePanel=$('[data-library=text]');subtitlePanel.append(button('Редактировать выбранные субтитры',()=>{const item=api.current();if(item?.type!=='subtitles')throw new Error('Выберите слой субтитров.');$('#subtitle-source').value=toSrt(item.cues);}),button('Заменить текст выбранных субтитров',async()=>{const item=api.current();if(item?.type!=='subtitles')throw new Error('Выберите слой субтитров.');if(item.locked)throw new Error('Разблокируйте слой.');const {parseSubtitles}=await import('./video-model.js');const cues=parseSubtitles($('#subtitle-source').value);return edit(p=>p.layers.find(i=>i.id===item.id).cues=cues);}),button('Скачать субтитры SRT',()=>{const item=api.current();if(item?.type!=='subtitles')throw new Error('Выберите слой субтитров.');fileDownload(new Blob([toSrt(item.cues)],{type:'text/plain'}),'subtitles.srt');}));
  const availability=await fetch('/api/video-speech').then(r=>r.ok?r.json():null).catch(()=>null);
  if(!availability?.available){$('#voice-status').textContent='ИИ-подключение подготовлено и пока выключено. Запись голоса работает локально.';[...$('#voice-actions').children].slice(1).forEach(b=>b.disabled=true);}
  function toSrt(cues){const clock=seconds=>new Date(Math.round(seconds*1000)).toISOString().slice(11,23).replace('.',',');return cues.map((cue,index)=>(index+1)+'\n'+clock(cue.start)+' --> '+clock(cue.end)+'\n'+cue.text).join('\n\n');}
  document.addEventListener('video:changed',()=>{renderScenes();renderGroups();$('#ducking').checked=Boolean(api.project().ducking);});renderScenes();renderGroups();
}
