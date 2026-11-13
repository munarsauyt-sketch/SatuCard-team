import { TEMPLATES, MUSIC, FORMATS, DEMOS, MAX_LAYERS, clamp, clone, uid, layer, emptyProject, templateProject, validateProject, frameAt, parseSubtitles, fitToBeats } from './video-model.js';
import { MediaStore, inspectFile, mixAudio, detectBeats } from './video-media.js';
import { drawProject, hitLayer } from './video-renderer.js';
import { saveProject, loadProject, packProject, unpackProject, saveBrand, loadBrand } from './video-storage.js';
import { exportVideo } from './video-export.js';
import { installVideoPlus } from './video-plus.js';
import { snapTime } from './video-workflow.js';
import { checkImportQuota } from './video-file-safety.js';
import { installVideoHelp } from './video-help.js';

const $=selector=>document.querySelector(selector);
const canvas=$('#preview'),dialog=$('#export-dialog');
let project=templateProject('launch'),media=new MediaStore(),time=.7,selected=null,activeFrame=null;
let history=[],future=[],playing=false,playStart=0,audioNode=null,audioBuffer=null,audioRevision=-1;
let revision=0,savedRevision=-1,saveTimer,saveQueue=Promise.resolve(),toastTimer,beats=[],busy=false,exporting=false,controller=null,resultUrl=null,projectOperation=0;
let pixels=55,trackLabel=matchMedia('(max-width:620px)').matches?105:145;

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function handle(error){console.error(error);toast(error.message||'Не удалось выполнить действие.');}
function safely(action){return event=>{try{return Promise.resolve(action(event)).catch(handle);}catch(error){handle(error);}};}
const on=(selector,event,action)=>$(selector).addEventListener(event,safely(action));
const current=()=>project.layers.find(item=>item.id===selected);
const seconds=value=>Number(value.toFixed(3));
const clock=value=>{const minutes=Math.floor(value/60);return String(minutes).padStart(2,'0')+':'+value.toFixed(2).padStart(5,'0');};
function stop(){playing=false;audioNode?.stop();audioNode=null;media.pause();$('#play').textContent='▶';$('#play').setAttribute('aria-label','Воспроизвести');}
function snapshot(){stop();history.push(clone(project));if(history.length>40)history.shift();future=[];}
function scheduleSave(){
  revision++;$('#save-status').textContent='Сохраняем…';clearTimeout(saveTimer);
  saveTimer=setTimeout(persist,250);
}
function persist(){
  clearTimeout(saveTimer);
  const version=revision,copy=clone(project),files=new Map(media.files);
  saveQueue=saveQueue.catch(()=>{}).then(()=>saveProject(copy,files)).then(()=>{
    savedRevision=Math.max(savedRevision,version);
    if(version===revision)$('#save-status').textContent='Сохранено на устройстве';
  }).catch(error=>{$('#save-status').textContent='Не сохранено · скачайте файл проекта';toast('Браузер не смог сохранить черновик. Скачайте файл проекта: '+error.message);});
  return saveQueue;
}
function changed({inspector=true,library=false}={}){
  time=clamp(time,0,project.duration);
  validateProject(project);scheduleSave();renderTimeline();if(inspector)renderInspector();if(library)renderMedia();renderControls();draw();
  document.dispatchEvent(new Event('video:changed'));
}
function draw(){
  const size=FORMATS[project.format],ratio=540/Math.max(size.width,size.height);
  const width=Math.round(size.width*ratio),height=Math.round(size.height*ratio);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;fitStage();}
  drawProject(canvas,project,media,Math.min(time,project.duration-.001),{safe:$('#safe-zones').checked,selected});
  $('#time-display').textContent=clock(time)+' / '+clock(project.duration);
  $('#playhead').style.left=(trackLabel+time*pixels)+'px';
}
function fitStage(){
  const stage=$('.stage'),style=getComputedStyle(stage),format=FORMATS[project.format];
  const availableWidth=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const availableHeight=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  const scale=Math.max(.01,Math.min(availableWidth/format.width,availableHeight/format.height));
  canvas.style.width=Math.floor(format.width*scale)+'px';canvas.style.height=Math.floor(format.height*scale)+'px';
}
new ResizeObserver(fitStage).observe($('.stage'));
async function seek(next){stop();time=clamp(next,0,project.duration);activeFrame=null;await media.seek(project,Math.min(time,project.duration-.001),true);draw();renderInspector();}
function renderControls(){
  $('#project-name').value=project.name;$('#format').value=project.format;$('#duration').value=project.duration;$('#fps').value=project.fps;$('#bpm').value=project.bpm;
  $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;
  for(const id of ['split','duplicate','layer-down','layer-up','delete-layer'])$('#'+id).disabled=!current();
  $('#layer-count').textContent=project.layers.length+' слоёв';
}
function select(id,{jump=false}={}){
  selected=id;activeFrame=null;const item=current();
  if(jump&&item&&(time<item.start||time>=item.end)){time=Math.min(item.end-.05,item.start+.5);media.seek(project,time,true).then(draw).catch(handle);}
  renderInspector();renderTimeline();renderControls();draw();
}
function showPanel(name){document.querySelectorAll('[data-panel]').forEach(button=>button.classList.toggle('active',button.dataset.panel===name));document.querySelectorAll('[data-library]').forEach(panel=>panel.hidden=panel.dataset.library!==name);}
document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>showPanel(button.dataset.panel)));

function productForm(){for(const [key,value]of Object.entries(project.product))$('#product-form').elements[key].value=Array.isArray(value)?value.join('\n'):value;}
async function switchProject(next,files=new Map(media.files),expectedRevision=revision){
  const operation=++projectOperation;
  validateProject(next);stop();const replacement=new MediaStore();replacement.files=files;
  try{await replacement.prepare(next);}catch(error){replacement.dispose();throw error;}
  if(operation!==projectOperation||revision!==expectedRevision){replacement.dispose();throw new Error('Во время загрузки проект изменился. Последние правки сохранены; повторите открытие.');}
  media.dispose();media=replacement;project=next;selected=null;activeFrame=null;time=Math.min(.7,project.duration/2);history=[];future=[];beats=[];
  productForm();changed({library:true});await persist();
}
function confirmReplace(){return !project.layers.length||confirm('Заменить текущий ролик? Черновик будет перезаписан. Чтобы сохранить его отдельно, сначала скачайте файл проекта.');}
async function chooseTemplate(id){
  if(!confirmReplace())return;
  const next=templateProject(id,project.product);
  next.assets=clone(project.assets);
  const own=project.layers.find(item=>item.role==='product'&&!DEMOS[item.assetId]);
  if(own)for(const item of next.layers.filter(item=>item.role==='product')){item.assetId=own.assetId;item.type=own.type;}
  await switchProject(next);toast('Шаблон «'+next.name+'» готов. Замените товар во вкладке «Медиа».');
}
let activeTemplateFilter='Все',activeTemplateQuery='',templateGeneration=0;
const templateMedia=new MediaStore();
async function renderTemplates(filter=activeTemplateFilter,query=activeTemplateQuery){
  activeTemplateFilter=filter;activeTemplateQuery=query;
  const generation=++templateGeneration;
  const list=$('#template-list');list.replaceChildren();
  document.querySelector('[data-library="templates"] .panel-heading>span').textContent=TEMPLATES.length;
  for(const template of TEMPLATES.filter(item=>(filter==='Все'||item.category===filter)&&[item.name,item.note,item.category].some(text=>text.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())))){
    const button=document.createElement('button');button.className='template-card';button.title=template.note;
    const thumb=document.createElement('canvas');thumb.width=216;thumb.height=288;
    const temp=templateProject(template.id);await templateMedia.prepare(temp);
    if(generation!==templateGeneration)return;
    // Thumbnails show the entire portrait at the same crop as the editor.
    const portrait=document.createElement('canvas');portrait.width=216;portrait.height=384;
    drawProject(portrait,temp,templateMedia,.9);thumb.getContext('2d').drawImage(portrait,0,0,216,384,0,-25,216,384);
    const title=document.createElement('strong');title.textContent=template.name;
    const note=document.createElement('small');note.textContent=temp.duration+' сек · '+template.category;
    button.append(thumb,title,note);button.addEventListener('click',safely(()=>chooseTemplate(template.id)));list.append(button);
  }
  if(!list.children.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Шаблоны не найдены. Измените поиск или категорию.';list.append(empty);}
}
$('#template-filters').addEventListener('click',safely(async event=>{const button=event.target.closest('[data-filter]');if(!button)return;$('#template-filters').querySelectorAll('button').forEach(item=>item.classList.toggle('active',item===button));await renderTemplates(button.dataset.filter);}));
on('#blank-project','click',async()=>{if(confirmReplace()){const next=emptyProject();next.product=clone(project.product);next.assets=clone(project.assets);await switchProject(next);showPanel('media');}});

function addLayer(item){
  if(project.layers.length>=MAX_LAYERS)throw new Error('В проекте может быть до '+MAX_LAYERS+' слоёв.');
  snapshot();project.layers.push(item);selected=item.id;activeFrame=null;changed();
}
function insertAsset(asset,{replace=false,logo=false}={}){
  const end=Math.min(project.duration,time+(asset.duration||4));
  if(replace){
    const targets=project.layers.filter(item=>item.role==='product');
    if(!targets.length)throw new Error('В этом ролике нет слоёв товара. Добавьте медиа как новый слой.');
    snapshot();for(const item of targets){item.assetId=asset.id;item.type=asset.kind;item.offset=0;item.volume=0;}selected=targets[0].id;changed();media.prepare(project).then(draw).catch(handle);toast('Товар заменён во всех сценах.');return;
  }
  const start=time>=project.duration-.1?0:time;
  const item=layer(asset.kind,{name:logo?'Логотип':asset.name.slice(0,100),assetId:asset.id,start,end:Math.max(start+.1,end),x:logo?.08:.1,y:logo?.04:.32,w:logo?.16:.8,h:logo?.08:.45,fit:logo?'contain':'cover',volume:asset.kind==='audio'?.7:0,role:logo?'logo':''});
  if(logo)item.end=project.duration;
  addLayer(item);media.prepare(project).then(draw).catch(handle);
}
function renderMedia(){
  const list=$('#media-list');list.replaceChildren();
  for(const asset of project.assets){
    const card=document.createElement('div');card.className='media-card';
    if(asset.kind==='image'){const image=document.createElement('img');image.src=media.url(asset);image.alt=asset.name;card.append(image);}
    else{const symbol=document.createElement('span');symbol.className='media-symbol';symbol.textContent=asset.kind==='video'?'▶':'♫';card.append(symbol);}
    const name=document.createElement('strong');name.textContent=asset.name;name.title=asset.name;
    const add=document.createElement('button');add.className='full';add.textContent='＋ В ролик';add.addEventListener('click',safely(()=>insertAsset(asset)));card.append(name,add);
    if(asset.kind!=='audio'){const replace=document.createElement('button');replace.className='full subtle';replace.textContent='Заменить товар';replace.addEventListener('click',safely(()=>insertAsset(asset,{replace:true})));card.append(replace);}
    list.append(card);
  }
}
async function importFiles(files,logo=false){
  const projectId=project.id;
  for(const file of files){
    checkImportQuota(project,media.files,file);
    const asset=await inspectFile(file);if(logo&&asset.kind!=='image')throw new Error('Для логотипа выберите изображение.');
    if(asset.kind==='image'){const check=new Image(),url=URL.createObjectURL(file);try{check.src=url;await check.decode();if(check.naturalWidth*check.naturalHeight>40e6)throw new Error('Изображение слишком большое: до 40 мегапикселей.');}finally{URL.revokeObjectURL(url);}}
    if(project.id!==projectId)throw new Error('Ролик изменился во время загрузки. Добавьте файлы в текущий проект заново.');
    // Decoding yields to other imports; re-read both limits immediately at commit.
    checkImportQuota(project,media.files,file);
    snapshot();media.files.set(asset.id,file);project.assets.push(asset);
    changed({library:true});await persist();if(logo)insertAsset(asset,{logo:true});
  }
  showPanel('media');toast(logo?'Логотип добавлен.':'Медиа загружены. Добавьте их в ролик или замените товар.');
}
on('#import-media','click',()=>$('#media-input').click());on('#import-audio','click',()=>$('#media-input').click());
on('#media-input','change',async event=>{try{await importFiles([...event.target.files]);}finally{event.target.value='';}});
on('#brand-logo','click',()=>$('#logo-input').click());on('#logo-input','change',async event=>{try{await importFiles([...event.target.files],true);}finally{event.target.value='';}});
on('#add-text','click',()=>addLayer(layer('text',{name:'Ваш заголовок',text:'Скажите главное',start:Math.min(time,project.duration-.1),end:project.duration,x:.1,y:.15,w:.8,h:.2,fontSize:.09})));
on('#add-shape','click',()=>addLayer(layer('shape',{name:'Цветная плашка',start:Math.min(time,project.duration-.1),end:project.duration,x:.12,y:.4,w:.76,h:.18,color:$('#brand-color').value})));
on('#subtitle-import','click',()=>$('#srt-input').click());
on('#srt-input','change',async event=>{const file=event.target.files[0];if(file){if(file.size>300000)throw new Error('Файл субтитров — до 300 КБ.');$('#subtitle-source').value=await file.text();}event.target.value='';});
on('#subtitle-add','click',()=>{const cues=parseSubtitles($('#subtitle-source').value).filter(cue=>cue.start<project.duration).map(cue=>({...cue,end:Math.min(cue.end,project.duration)}));if(!cues.length)throw new Error('Таймкоды выходят за длину ролика.');addLayer(layer('subtitles',{name:'Субтитры',cues,end:project.duration,x:.10,y:.72,w:.80,h:.13,fontSize:.055,align:'center',background:'#17171e',entrance:'none',exit:'none'}));});

for(const [key,music]of Object.entries(MUSIC)){
  const button=document.createElement('button');button.className='music-card';
  button.innerHTML='<span class="music-art">♫</span><span><strong></strong><small></small></span><span class="plus">＋</span>';
  button.querySelector('strong').textContent=music.name;button.querySelector('small').textContent=music.bpm+' BPM · оригинальный синтез';
  button.addEventListener('click',safely(()=>{addLayer(layer('audio',{name:music.name,builtin:key,end:project.duration,volume:.35,fadeIn:.3,fadeOut:.8}));project.bpm=music.bpm;changed();}));$('#music-list').append(button);
}
for(const [key,name]of Object.entries({whoosh:'↝ Свип',impact:'✦ Удар',tap:'· Клик',chime:'✧ Звон'})){
  const button=document.createElement('button');button.textContent=name;button.addEventListener('click',safely(()=>{const start=Math.min(time,project.duration-.1);addLayer(layer('audio',{name,builtin:key,start,end:Math.min(project.duration,start+.7),volume:.4,fadeIn:0,fadeOut:.1}));}));$('#sfx-list').append(button);
}
on('#bpm','change',()=>{snapshot();project.bpm=clamp(Number($('#bpm').value)||120,40,240);beats=[];changed();});
on('#detect-beats','click',async()=>{
  stop();const item=project.layers.find(item=>item.type==='audio'&&!item.hidden&&item.volume>0);
  if(!item)throw new Error('Добавьте музыкальную дорожку.');
  const buffer=await mixAudio({...project,layers:[item]},media);beats=detectBeats(buffer);
  if(beats.length<2)throw new Error('Биты не найдены. Используйте сетку BPM или другую дорожку.');
  $('#beat-status').textContent='Найдено '+beats.length+' акцентов. Они отмечены на шкале.';renderTimeline();
});
on('#fit-beats','click',()=>{if(!project.layers.some(item=>item.scene))throw new Error('Автомонтаж работает со сценами шаблона. Отдельные слои можно двигать вручную.');snapshot();const grid=beats.length?beats:Array.from({length:Math.ceil(project.duration*project.bpm/60)+1},(_,index)=>index*60/project.bpm).filter(t=>t<=project.duration);fitToBeats(project,[0,...grid,project.duration]);changed();toast('Границы сцен привязаны к ритму.');});

on('#product-form','submit',event=>{
  event.preventDefault();const data=new FormData(event.target);snapshot();
  project.product={title:String(data.get('title')),price:String(data.get('price')),brand:String(data.get('brand')),cta:String(data.get('cta')),features:String(data.get('features')).split('\n').filter(Boolean).slice(0,3).map(text=>text.slice(0,120))};
  while(project.product.features.length<3)project.product.features.push('Ваше преимущество');
  for(const item of project.layers)if(['title','price','brand','cta'].includes(item.role))item.text=project.product[item.role];
  const titles=project.layers.filter(item=>item.name==='Заголовок'&&!item.role);
  titles.forEach((item,index)=>{if(item.text!=='До / После')item.text=project.product.features[index%3];});changed();toast('Содержание обновлено, монтаж сохранён.');
});
on('#brand-save','click',async()=>{const logoLayer=project.layers.findLast(item=>item.role==='logo'),asset=project.assets.find(item=>item.id===logoLayer?.assetId);await saveBrand({name:project.product.brand,color:$('#brand-color').value,font:$('#brand-font').value,logo:asset?{asset:clone(asset),file:media.files.get(asset.id)}:null});toast('Стиль и логотип магазина сохранены в браузере.');});
on('#brand-apply','click',async()=>{
  const style=await loadBrand().catch(()=>null);
  const addLogo=style?.logo&&!project.layers.some(item=>item.role==='logo');
  if(addLogo&&(project.layers.length>=MAX_LAYERS||project.assets.length>=40))throw new Error('Для логотипа нужно освободить один слой и исходник.');
  snapshot();if(style?.name){project.product.brand=style.name;for(const item of project.layers.filter(item=>item.role==='brand'))item.text=style.name;}
  for(const item of project.layers){if(item.type==='text'||item.type==='subtitles')item.font=$('#brand-font').value;if(item.name==='Плашка цены')item.color=$('#brand-color').value;}
  if(addLogo){const {asset,file}=style.logo;if(!project.assets.some(item=>item.id===asset.id))project.assets.push(clone(asset));if(file)media.files.set(asset.id,file);project.layers.push(layer('image',{name:'Логотип',role:'logo',assetId:asset.id,x:.08,y:.04,w:.16,h:.08,end:project.duration,fit:'contain'}));}
  await media.prepare(project);productForm();changed({library:true});toast('Стиль применён.');
});

function control(label,key,{type='number',value,min,max,step,options}={}){
  const wrap=document.createElement('label');wrap.append(document.createTextNode(label));
  const input=document.createElement(options?'select':type==='textarea'?'textarea':'input');
  if(options)for(const [val,title]of options){const option=document.createElement('option');option.value=val;option.textContent=title;input.append(option);}
  else if(type!=='textarea')input.type=type;
  input.dataset.property=key;input.value=value??'';
  if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;
  if(type==='text')input.maxLength=100;if(type==='textarea'){input.maxLength=3000;input.rows=3;}
  wrap.append(input);return wrap;
}
function renderInspector(){
  const root=$('#inspector-content'),item=current();root.replaceChildren();
  if(!item){const empty=document.createElement('p');empty.className='empty-inspector';empty.textContent='Выберите объект на холсте или слой на монтажной шкале.';root.append(empty);return;}
  root.append(control('Название слоя','name',{type:'text',value:item.name}));
  const timing=document.createElement('div');timing.className='property-grid';
  timing.append(control('Начало, с','start',{value:seconds(item.start),min:0,max:project.duration-.02,step:.01}),control('Конец, с','end',{value:seconds(item.end),min:.02,max:project.duration,step:.01}));root.append(timing);
  const visibility=document.createElement('button');visibility.className='full subtle';visibility.textContent=item.hidden?'◉ Показать слой':'◌ Скрыть слой';visibility.addEventListener('click',()=>{snapshot();item.hidden=!item.hidden;changed();});root.append(visibility);
  const lock=document.createElement('button');lock.className='full subtle';lock.textContent=item.locked?'Разблокировать слой':'Заблокировать слой';lock.addEventListener('click',()=>{snapshot();item.locked=!item.locked;changed();});root.append(lock);
  if(item.locked)return;
  if(item.type==='text')root.append(control('Текст','text',{type:'textarea',value:item.text}));
  if(item.type!=='audio'){
    const state=activeFrame!==null?item.keyframes[activeFrame]:item;
    const grid=document.createElement('div');grid.className='property-grid';
    for(const [key,label,min,max]of [['x','X, %',-300,300],['y','Y, %',-300,300],['w','Ширина, %',.5,600],['h','Высота, %',.5,600],['rotation','Поворот, °',-360,360],['opacity','Непрозрачность, %',0,100]])grid.append(control(label,key,{value:seconds(state[key]*(key==='rotation'?1:100)),min,max,step:1}));
    root.append(grid);
    if(['text','subtitles'].includes(item.type)){
      root.append(control('Шрифт','font',{value:item.font,options:['Golos Text','Manrope','Noto Serif','IBM Plex Mono'].map(v=>[v,v])}));
      const textGrid=document.createElement('div');textGrid.className='property-grid';textGrid.append(control('Размер, % ширины','fontSize',{value:seconds(item.fontSize*100),min:.8,max:50,step:.1}),control('Цвет текста','color',{type:'color',value:item.color}),control('Выравнивание','align',{value:item.align,options:[['left','Слева'],['center','По центру'],['right','Справа']]}),control('Насыщенность','weight',{value:item.weight,options:[400,500,600,700,750,800,900].map(v=>[v,v])}));root.append(textGrid);
      const bg=document.createElement('button');bg.className='full subtle';bg.textContent=item.background==='transparent'?'＋ Подложка текста':'Убрать подложку';bg.addEventListener('click',()=>{snapshot();item.background=item.background==='transparent'?'#17171e':'transparent';changed();});root.append(bg);
    }
    if(item.type==='shape'){
      root.append(control('Цвет','color',{type:'color',value:item.color}),control('Заливка','gradient',{value:item.gradient||'none',options:[['none','Однотонная'],['linear','Линейный градиент'],['radial','Радиальный свет']]}));
      if(item.gradient&&item.gradient!=='none')root.append(control('Второй цвет','gradientColor',{type:'color',value:item.gradientColor||item.color}),control('Угол градиента, °','gradientAngle',{value:item.gradientAngle??45,min:-360,max:360,step:5}));
    }
    if(['image','video'].includes(item.type))root.append(control('Вписывание','fit',{value:item.fit,options:[['cover','Заполнить'],['contain','Вписать целиком']]}));
    if(['image','video'].includes(item.type)){
      const effects=document.createElement('div');effects.className='property-grid';
      for(const [key,label,value,min,max]of [['cropX','Кадр X',item.cropX??.5,0,1],['cropY','Кадр Y',item.cropY??.5,0,1],['shadow','Тень',item.shadow??0,0,1],['exposure','Яркость',item.exposure??1,.2,2],['saturation','Насыщенность',item.saturation??1,0,2]])effects.append(control(label,key,{value,min,max,step:.05}));root.append(effects);
    }
    root.append(document.createElement('hr'));
    root.append(control('Появление','entrance',{value:item.entrance,options:[['none','Без эффекта'],['fade','Проявление'],['rise','Подъём'],['slide','Сдвиг'],['pop','Масштаб'],['wipe','Открытие медиа']]}),control('Движение','motion',{value:item.motion,options:[['none','Статично'],['zoom','Приближение'],['pan','Панорама']]}),control('Исчезновение','exit',{value:item.exit,options:[['none','Без эффекта'],['fade','Плавное']]}));
    const keyButton=document.createElement('button');keyButton.className='full subtle';keyButton.textContent='◇ Ключевой кадр в '+clock(time);keyButton.addEventListener('click',safely(()=>{
      if(time<item.start||time>item.end)throw new Error('Поставьте курсор внутри выбранного слоя.');if(item.keyframes.length>=60)throw new Error('Можно до 60 ключевых кадров на слой.');
      snapshot();const state=frameAt({...item,entrance:'none',exit:'none'},time),t=clamp((time-item.start)/(item.end-item.start),0,1);
      const frame={t,ease:'smooth'};for(const key of ['x','y','w','h','rotation','opacity'])frame[key]=state[key];
      const existing=item.keyframes.findIndex(value=>Math.abs(value.t-t)<.002);if(existing>=0)item.keyframes[existing]=frame;else item.keyframes.push(frame);
      item.keyframes.sort((a,b)=>a.t-b.t);activeFrame=item.keyframes.indexOf(frame);changed();
    }));root.append(keyButton);
    if(item.keyframes.length){
      const row=document.createElement('div');row.className='small-row';
      item.keyframes.forEach((frame,index)=>{const button=document.createElement('button');button.className='keyframe-chip'+(activeFrame===index?' active':'');button.textContent='◇ '+clock(item.start+frame.t*(item.end-item.start));button.addEventListener('click',async()=>{stop();activeFrame=index;time=item.start+frame.t*(item.end-item.start);await media.seek(project,time,true);renderInspector();draw();});row.append(button);});root.append(row);
      if(activeFrame!==null){root.append(control('Кривая движения','ease',{value:item.keyframes[activeFrame].ease,options:[['linear','Линейная'],['smooth','Плавная'],['out','С замедлением']]}));const remove=document.createElement('button');remove.className='full subtle';remove.textContent='Удалить этот ключ';remove.addEventListener('click',()=>{snapshot();item.keyframes.splice(activeFrame,1);activeFrame=null;changed();});root.append(remove);}
    }
  }
  if(item.type==='audio'||item.type==='video'){
    root.append(control('Скорость','speed',{value:item.speed??1,min:.25,max:4,step:.25}));
    if(item.type==='video'){const freeze=document.createElement('button');freeze.className='full subtle';freeze.textContent=item.freeze===undefined?'Стоп-кадр в текущей позиции':'Вернуть движение';freeze.addEventListener('click',()=>{snapshot();if(item.freeze===undefined)item.freeze=item.offset+Math.max(0,time-item.start)*(item.speed??1);else delete item.freeze;changed();media.seek(project,time,true).then(draw).catch(handle);});root.append(freeze);}
    root.append(document.createElement('hr'));
    const grid=document.createElement('div');grid.className='property-grid';grid.append(control('Громкость, %','volume',{value:Math.round(item.volume*100),min:0,max:200,step:5}),control('Исходник от, с','offset',{value:item.offset,min:0,max:3600,step:.1}),control('Нарастание, с','fadeIn',{value:item.fadeIn,min:0,max:10,step:.1}),control('Затухание, с','fadeOut',{value:item.fadeOut,min:0,max:10,step:.1}));root.append(grid);
  }
}
$('#inspector-content').addEventListener('change',safely(async event=>{
  const input=event.target,key=input.dataset.property,item=current();if(!item||!key)return;
  const textKeys=['text','name','font','align','fit','entrance','motion','exit','color','ease','gradient','gradientColor'];
  let value=textKeys.includes(key)?input.value:Number(input.value);
  if(typeof value==='number'&&!Number.isFinite(value))return;
  if(['x','y','w','h','opacity','volume','fontSize'].includes(key))value/=100;
  if(key==='start')value=clamp(value,0,item.end-.02);if(key==='end')value=clamp(value,item.start+.02,project.duration);
  snapshot();const target=activeFrame!==null&&['x','y','w','h','rotation','opacity','ease'].includes(key)?item.keyframes[activeFrame]:item;
  const previous=target[key];target[key]=value;
  try{validateProject(project);}catch(error){target[key]=previous;history.pop();renderInspector();throw error;}
  changed();await media.seek(project,time,true);draw();
}));

function renderTimeline(){
  const width=trackLabel+project.duration*pixels+35;
  $('#timeline-inner').style.width=width+'px';$('#ruler').style.marginLeft=trackLabel+'px';
  const ruler=$('#ruler');ruler.replaceChildren();
  for(let tick=0;tick<=project.duration;tick++){const mark=document.createElement('span');mark.className='ruler-tick';mark.style.left=tick*pixels+'px';mark.textContent=String(tick).padStart(2,'0')+'s';ruler.append(mark);}
  const grid=beats.length?beats:Array.from({length:Math.ceil(project.duration*project.bpm/60)},(_,index)=>index*60/project.bpm);
  for(const beat of grid){if(beat>project.duration)continue;const mark=document.createElement('span');mark.className='beat-tick';mark.style.left=beat*pixels+'px';ruler.append(mark);}
  const tracks=$('#tracks');tracks.replaceChildren();
  for(const item of [...project.layers].reverse()){
    const row=document.createElement('div');row.className='track'+(item.id===selected?' selected':'');
    const name=document.createElement('button');name.className='track-name';name.textContent=(item.hidden?'○ ':item.type==='audio'?'♫ ':item.type==='text'?'T ':'▧ ')+item.name;name.title=item.name;name.addEventListener('click',()=>select(item.id,{jump:true}));
    const clip=document.createElement('div');clip.className='clip '+item.type+(item.id===selected?' selected':'');clip.dataset.layer=item.id;clip.style.left=(trackLabel+item.start*pixels)+'px';clip.style.width=Math.max(8,(item.end-item.start)*pixels)+'px';clip.style.opacity=item.hidden?.35:1;clip.tabIndex=0;clip.setAttribute('role','button');clip.setAttribute('aria-label',item.name+', '+seconds(item.start)+'–'+seconds(item.end)+' секунд');
    const title=document.createElement('span');title.className='clip-text';title.textContent=item.text||item.name;
    for(const side of ['left','right']){const handle=document.createElement('span');handle.className='trim-handle '+side;handle.dataset.trim=side;clip.append(handle);}
    clip.append(title);clip.addEventListener('pointerdown',event=>timelineDrag(event,item,clip));clip.addEventListener('keydown',event=>{if(event.key==='Enter')select(item.id,{jump:true});});row.append(name,clip);tracks.append(row);
    decorateClip(clip,item);
  }
  draw();
}
const clipPreviews=new Map();
async function decorateClip(clip,item){
  const store=media,asset=project.assets.find(a=>a.id===item.assetId);
  if(asset?.kind==='image'){
    const image=document.createElement('img');image.className='clip-thumb';image.alt='';image.src=store.url(asset);clip.prepend(image);return;
  }
  if(item.type==='video'){
    const video=store.visual(project,item);if(video?.readyState>=2){const image=document.createElement('canvas');image.width=100;image.height=40;image.className='clip-thumb';image.getContext('2d').drawImage(video,0,0,100,40);clip.prepend(image);}return;
  }
  if(item.type!=='audio')return;
  const key=(item.assetId||item.builtin)+':'+item.offset+':'+(item.end-item.start)+':'+(item.speed??1);
  if(!clipPreviews.has(key)){
    const copy=clone(item);copy.start=0;copy.end=item.end-item.start;copy.volume=1;copy.hidden=false;
    clipPreviews.set(key,mixAudio({...clone(project),duration:copy.end,layers:[copy],ducking:false},store));
    if(clipPreviews.size>80)clipPreviews.delete(clipPreviews.keys().next().value);
  }
  try{const buffer=await clipPreviews.get(key);if(!buffer||!clip.isConnected)return;const wave=document.createElement('canvas');wave.width=256;wave.height=24;wave.className='waveform';const ctx=wave.getContext('2d'),data=buffer.getChannelData(0);ctx.strokeStyle='#c4f9dc';ctx.beginPath();for(let x=0;x<256;x++){let peak=0;const a=Math.floor(x*data.length/256),b=Math.floor((x+1)*data.length/256);for(let i=a;i<b;i+=Math.max(1,Math.floor((b-a)/80)))peak=Math.max(peak,Math.abs(data[i]));const height=Math.max(1,peak*11);ctx.moveTo(x,12-height);ctx.lineTo(x,12+height);}ctx.stroke();clip.prepend(wave);}catch{clipPreviews.delete(key);}
}
function timelineDrag(event,item,clip){
  if(event.button!==0||exporting||item.locked)return;event.preventDefault();stop();selected=item.id;activeFrame=null;renderInspector();renderControls();
  const mode=event.target.dataset.trim,originX=event.clientX,start=item.start,end=item.end,offset=item.offset,prior=clone(project);let moved=false;
  const linked=item.group?project.layers.filter(i=>i.group===item.group):[item];
  if(linked.some(i=>i.locked))return;
  const originals=new Map(linked.map(i=>[i.id,{start:i.start,end:i.end}]));
  clip.setPointerCapture(event.pointerId);
  const move=next=>{
    let delta=(next.clientX-originX)/pixels;if(Math.abs(delta)<.015&&!moved)return;moved=true;
    const snap=value=>next.altKey?value:snapTime(project,value,linked.map(i=>i.id),pixels);
    if(mode==='left'){item.start=seconds(clamp(snap(start+delta),Math.max(0,start-offset/(item.speed??1)),end-.1));item.offset=Math.max(0,offset+(item.start-start)*(item.speed??1));}
    else if(mode==='right')item.end=seconds(clamp(snap(end+delta),start+.1,project.duration));
    else{delta=snap(start+delta)-start;delta=clamp(delta,-Math.min(...[...originals.values()].map(i=>i.start)),project.duration-Math.max(...[...originals.values()].map(i=>i.end)));for(const target of linked){const old=originals.get(target.id);target.start=seconds(old.start+delta);target.end=seconds(old.end+delta);const node=document.querySelector('[data-layer="'+target.id+'"]');if(node)node.style.left=(trackLabel+target.start*pixels)+'px';}}
    clip.style.left=(trackLabel+item.start*pixels)+'px';clip.style.width=Math.max(8,(item.end-item.start)*pixels)+'px';draw();
  };
  const endDrag=next=>{
    clip.removeEventListener('pointermove',move);clip.removeEventListener('pointerup',endDrag);clip.removeEventListener('pointercancel',endDrag);
    if(next.type==='pointercancel')project=prior;
    else if(moved){history.push(prior);if(history.length>40)history.shift();future=[];changed();}
    else select(item.id,{jump:true});
    renderTimeline();renderInspector();
  };
  clip.addEventListener('pointermove',move);clip.addEventListener('pointerup',endDrag);clip.addEventListener('pointercancel',endDrag);
}
$('#ruler').addEventListener('pointerdown',safely(event=>seek((event.clientX-$('#ruler').getBoundingClientRect().left)/pixels)));
on('#timeline-zoom','input',()=>{pixels=Number($('#timeline-zoom').value);renderTimeline();});
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||exporting)return;stop();const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
  const item=hitLayer(project,time,x,y);select(item?.id||null);if(!item)return;
  const prior=clone(project),baseX=item.x,baseY=item.y,frames=clone(item.keyframes);let moved=false;
  canvas.setPointerCapture(event.pointerId);
  const move=next=>{const dx=(next.clientX-event.clientX)/rect.width,dy=(next.clientY-event.clientY)/rect.height;if(!moved&&Math.abs(dx)+Math.abs(dy)<.005)return;moved=true;item.x=clamp(baseX+dx,-3,3);item.y=clamp(baseY+dy,-3,3);item.keyframes=frames.map(frame=>({...frame,x:clamp(frame.x+dx,-3,3),y:clamp(frame.y+dy,-3,3)}));draw();};
  const done=next=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',done);canvas.removeEventListener('pointercancel',done);if(next.type==='pointercancel'){project=prior;renderInspector();draw();}else if(moved){history.push(prior);future=[];changed();}};
  canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',done);canvas.addEventListener('pointercancel',done);
});
function removeLayer(){if(!current()||current().locked)return;snapshot();project.layers=project.layers.filter(item=>item.id!==selected);selected=null;changed();}
on('#delete-layer','click',removeLayer);
on('#duplicate','click',()=>{if(!current())return;const copy=clone(current());copy.id=uid();copy.name=(copy.name+' · копия').slice(0,100);delete copy.scene;addLayer(copy);media.prepare(project).then(draw).catch(handle);});
on('#split','click',()=>{
  const item=current();if(!item||item.locked||time<=item.start+.05||time>=item.end-.05)throw new Error('Разблокируйте слой и поставьте курсор внутри него.');
  if(project.layers.length>=MAX_LAYERS)throw new Error('Достигнут лимит слоёв.');
  snapshot();const right=clone(item);right.id=uid();right.start=time;right.offset+=(time-item.start)*(item.speed??1);right.name=(right.name+' · 2').slice(0,100);delete right.scene;delete item.scene;
  // Resample keyframes into both pieces so cutting preserves the animated pose.
  const original=clone(item),pose=at=>{const state=frameAt({...original,entrance:'none',exit:'none'},at);return Object.fromEntries(['x','y','w','h','rotation','opacity'].map(key=>[key,state[key]]));};
  const cut=(part,a,b)=>{if(!original.keyframes.length)return;const times=[a,...original.keyframes.map(frame=>original.start+frame.t*(original.end-original.start)).filter(t=>t>a&&t<b),b];part.keyframes=times.map(at=>({t:(at-a)/(b-a),ease:'linear',...pose(at)}));};
  item.end=time;item.exit='none';right.entrance='none';cut(item,item.start,time);cut(right,time,right.end);project.layers.splice(project.layers.indexOf(item)+1,0,right);selected=right.id;changed();media.prepare(project).then(draw).catch(handle);
});
for(const [id,delta]of [['layer-up',1],['layer-down',-1]])on('#'+id,'click',()=>{const index=project.layers.findIndex(item=>item.id===selected),next=index+delta;if(index<0||next<0||next>=project.layers.length)return;snapshot();[project.layers[index],project.layers[next]]=[project.layers[next],project.layers[index]];changed();});
async function undo(redo=false){const stack=redo?future:history;if(!stack.length)return;stop();(redo?history:future).push(clone(project));project=stack.pop();selected=null;activeFrame=null;time=clamp(time,0,project.duration);await media.prepare(project);productForm();changed({library:true});}
on('#undo','click',()=>undo());on('#redo','click',()=>undo(true));
on('#project-name','change',()=>{snapshot();project.name=$('#project-name').value.trim().slice(0,100)||'Новый ролик';changed();});
on('#format','change',()=>{snapshot();project.format=$('#format').value;changed();});
on('#fps','change',()=>{snapshot();project.fps=Number($('#fps').value);changed();});
on('#duration','change',()=>{
  const duration=clamp(Number($('#duration').value)||12,.5,30);
  if(duration<project.duration&&!confirm('Укоротить ролик? Слои за новой границей будут обрезаны.')){renderControls();return;}
  snapshot();project.duration=duration;project.layers=project.layers.filter(item=>item.start<duration-.02);
  for(const item of project.layers){item.end=Math.min(duration,item.end);if(item.type==='subtitles')item.cues=item.cues.filter(cue=>cue.start<duration).map(cue=>({...cue,end:Math.min(cue.end,duration)}));}
  time=Math.min(time,duration);changed();
});
on('#safe-zones','change',draw);on('#previous','click',()=>seek(time-1/project.fps));on('#next','click',()=>seek(time+1/project.fps));
async function play(){
  if(playing){stop();return;}if(busy)return;busy=true;
  try{
    media.context ||=new AudioContext();await media.context.resume();
    if(audioRevision!==revision){audioBuffer=await mixAudio(project,media);audioRevision=revision;}
    if(time>=project.duration-.03)time=0;
    if(audioBuffer){audioNode=media.context.createBufferSource();audioNode.buffer=audioBuffer;audioNode.connect(media.context.destination);audioNode.start(0,time);}
    playing=true;playStart=performance.now()-time*1000;$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','Пауза');requestAnimationFrame(tick);
  }finally{busy=false;}
}
let seeking=false;
function tick(now){if(!playing)return;time=Math.min(project.duration,(now-playStart)/1000);if(!seeking){seeking=true;media.seek(project,time,false,true).catch(error=>{stop();handle(error);}).finally(()=>{seeking=false;});}draw();if(time>=project.duration){stop();return;}requestAnimationFrame(tick);}
on('#play','click',play);
document.addEventListener('keydown',safely(async event=>{
  if(exporting||document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable]'))return;
  if(event.code==='Space'){event.preventDefault();await play();}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();await undo(event.shiftKey);}
  else if(['Delete','Backspace'].includes(event.key)&&current()){event.preventDefault();removeLayer();}
  else if(event.key==='ArrowRight'){event.preventDefault();await seek(time+(event.shiftKey?1:1/project.fps));}
  else if(event.key==='ArrowLeft'){event.preventDefault();await seek(time-(event.shiftKey?1:1/project.fps));}
}));

function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const filename=()=>project.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').trim().slice(0,70)||'SatuCard';
async function saveFile(){stop();const copy=clone(project),files=new Map(media.files),name=filename();await persist();download(await packProject(copy,files),name+'.satuvideo.json');toast('Проект с исходными медиа сохранён в файл.');}
on('#save-file','click',saveFile);on('#save-file-mobile','click',saveFile);
on('#open-project','click',()=>$('#project-input').click());
on('#project-input','change',async event=>{const file=event.target.files[0],expectedRevision=revision;try{if(file&&confirmReplace()){const saved=await unpackProject(file);await switchProject(saved.project,saved.files,expectedRevision);toast('Проект открыт.');}}finally{event.target.value='';}});
on('#export','click',()=>{
  stop();$('#export-progress').hidden=true;$('#export-start').hidden=false;$('#export-start').disabled=false;$('#export-status').textContent='';$('#export-download').hidden=true;$('#export-result').hidden=true;$('#export-close').disabled=false;dialog.showModal();
});
dialog.addEventListener('cancel',event=>{if(exporting)event.preventDefault();});
on('#export-cancel','click',()=>{controller?.abort();$('#export-status').textContent='Останавливаем экспорт…';});
on('#export-start','click',async()=>{
  if(exporting)return;stop();exporting=true;controller=new AbortController();
  $('#workspace').inert=true;$('#export-close').disabled=true;$('#export-cancel').hidden=false;$('#export-start').disabled=true;$('#export-progress').hidden=false;$('#export-progress').value=0;$('#export-quality').disabled=true;
  try{
    await document.fonts.ready;
    const blob=await exportVideo(clone(project),media,{height:Number($('#export-quality').value),signal:controller.signal,onProgress:(value,message)=>{$('#export-progress').value=value;$('#export-status').textContent=message;}});
    if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=URL.createObjectURL(blob);
    $('#export-progress').value=1;$('#export-status').textContent='Готово · '+(blob.size/1024/1024).toFixed(1)+' МБ';
    $('#export-result').src=resultUrl;$('#export-result').hidden=false;
    const link=$('#export-download');link.href=resultUrl;link.download=filename()+'.mp4';link.hidden=false;$('#export-start').hidden=true;
  }catch(error){$('#export-status').textContent=error.name==='AbortError'?'Экспорт отменён. Проект сохранён.':error.message;}
  finally{exporting=false;controller=null;$('#workspace').inert=false;$('#export-close').disabled=false;$('#export-start').disabled=false;$('#export-cancel').hidden=true;$('#export-quality').disabled=false;await media.seek(project,time,true);draw();}
});
dialog.addEventListener('close',()=>$('#export-result').pause());
window.addEventListener('beforeunload',event=>{if(savedRevision<revision||exporting){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();persist();}});
window.addEventListener('resize',()=>{const label=matchMedia('(max-width:620px)').matches?105:145;if(label!==trackLabel){trackLabel=label;renderTimeline();}});

async function replaceProject(next,keepSelection=false){
  const expectedRevision=revision;
  validateProject(next);
  await media.prepare(next);
  if(revision!==expectedRevision)throw new Error('Проект изменился. Повторите действие.');
  snapshot();project=next;time=Math.min(time,project.duration-.01);
  if(!keepSelection||!project.layers.some(item=>item.id===selected))selected=null;
  activeFrame=null;productForm();changed({library:true});
}

async function init(){
  try{const saved=await loadProject();if(saved){project=saved.project;media.files=saved.files;}}catch(error){handle(error);}
  await Promise.all([document.fonts.load('750 30px "Golos Text"'),document.fonts.load('600 30px "Manrope"'),document.fonts.load('700 30px "Noto Serif"'),document.fonts.load('400 20px "IBM Plex Mono"')]);
  const brand=await loadBrand().catch(()=>null);if(brand){$('#brand-color').value=brand.color;$('#brand-font').value=brand.font;}
  await media.prepare(project);await media.seek(project,time,true);productForm();renderControls();renderInspector();renderTimeline();renderMedia();await renderTemplates();
  await installVideoPlus({project:()=>project,media:()=>media,current,time:()=>time,revision:()=>revision,snapshot,changed,seek,stop,draw,toast,showPanel,confirmReplace,switchProject,addLayer,searchTemplates:query=>renderTemplates(undefined,query),replace:replaceProject,edit:fn=>{const next=clone(project);fn(next);return replaceProject(next,true);}});
  installVideoHelp({showPanel,stop});
  scheduleSave();await persist();document.body.dataset.ready='true';
}
init().catch(error=>{$('#save-status').textContent='Ошибка загрузки';handle(error);});
