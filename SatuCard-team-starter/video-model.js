export const MAX_DURATION = 30;
export const MAX_LAYERS = 64;
export const FORMATS = {
  vertical: { label: '9:16 · Истории', width: 1080, height: 1920 },
  square: { label: '1:1 · Каталог', width: 1080, height: 1080 },
  wide: { label: '16:9 · Горизонтальный', width: 1920, height: 1080 },
};
export const DEMOS = {
  'demo-headphones': 'headphones', 'demo-ceramics': 'ceramics',
  'demo-sneaker': 'sneaker', 'demo-skincare': 'skincare',
};
export const MUSIC = { pulse: { name: 'Pulse', bpm: 120 }, soft: { name: 'Soft', bpm: 100 }, motion: { name: 'Motion', bpm: 128 } };
export const TEMPLATES = [
  { id: 'launch', name: 'Новый дроп', note: 'Крупный товар и энергичная типографика', color: '#b8c5ff', ink: '#15182c', category: 'Товар' },
  { id: 'sale', name: 'Большая скидка', note: 'Контрастный оффер и новая цена', color: '#ecfa8b', ink: '#202618', category: 'Акция' },
  { id: 'noir', name: 'Тихая роскошь', note: 'Тёмный фон и плавные движения', color: '#bca88b', ink: '#201d1a', category: 'Товар' },
  { id: 'beat', name: 'В ритме', note: 'Быстрые сцены под музыкальный бит', color: '#8ca2fa', ink: '#101c49', category: 'Акция' },
  { id: 'benefits', name: 'Три причины', note: 'По одному преимуществу в кадре', color: '#d0bfed', ink: '#30273f', category: 'Товар' },
  { id: 'collection', name: 'Коллекция', note: 'Несколько товаров в одной истории', color: '#c8dbc4', ink: '#273b29', category: 'Каталог' },
  { id: 'compare', name: 'До / После', note: 'Два кадра и наглядное сравнение', color: '#ead2bb', ink: '#432e23', category: 'История' },
  { id: 'unbox', name: 'Распаковка', note: 'Детали, движение и короткие подписи', color: '#d6dded', ink: '#263c5d', category: 'История' },
  { id: 'review', name: 'Живой отзыв', note: 'Цитата и крупный план', color: '#f1cdd6', ink: '#512d3a', category: 'История' },
  { id: 'minimal', name: 'Чистый кадр', note: 'Светлая композиция без суеты', color: '#e8e4d7', ink: '#34352c', category: 'Товар' },
];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = () => crypto.randomUUID();
export function layer(type, values = {}) {
  return {
    id: uid(), type, name: type === 'text' ? 'Текст' : type === 'audio' ? 'Звук' : 'Медиа',
    start: 0, end: 5, x: .1, y: .1, w: .8, h: .5, rotation: 0, opacity: 1,
    color: '#f7f6f2', background: 'transparent', text: '', font: 'Golos Text', fontSize: .075,
    align: 'left', weight: 750, radius: .025, fit: 'cover',
    entrance: 'fade', exit: 'fade', motion: 'none', keyframes: [],
    offset: 0, volume: 0, fadeIn: .15, fadeOut: .3, hidden: false, ...values,
  };
}
export function emptyProject() {
  return {
    app: 'SatuCardVideo', version: 1, id: uid(), name: 'Новый ролик',
    format: 'vertical', duration: 12, background: '#14161e', fps: 30, bpm: 120,
    product: { title: 'Беспроводные наушники', price: '24 990 ₸', brand: 'YOUR STORE', cta: 'Найди свой ритм', features: ['Твой звук', 'Твой стиль', 'Твой выбор'] },
    layers: [], assets: Object.keys(DEMOS).map(id => ({ id, kind: 'image', name: DEMOS[id], duration: 0 })),
  };
}
export function templateProject(id, product, assetId = 'demo-headphones') {
  const template = TEMPLATES.find(item => item.id === id);
  if (!template) throw new Error('Выберите шаблон.');
  const project = emptyProject();
  if (product) project.product = { ...project.product, ...product };
  project.name = template.name;
  project.background = template.ink;
  project.bpm = id === 'beat' ? 128 : id === 'noir' ? 100 : 120;
  const count = ['benefits', 'collection', 'unbox'].includes(id) ? 4 : id === 'beat' ? 6 : 3;
  project.duration = id === 'beat' ? 11.25 : count * 4;
  const sceneLength = project.duration / count;
  const add = (type, data) => project.layers.push(layer(type, data));
  for (let index = 0; index < count; index++) {
    const start = index * sceneLength, end = start + sceneLength, scene = 'scene-' + index;
    const common = { start, end, scene };
    const light = ['sale', 'minimal', 'review', 'compare'].includes(id);
    const bg = light ? (index % 2 ? '#f7f5ee' : template.color) : index % 2 ? template.ink : '#151821';
    const ink = light ? template.ink : '#f6f5ef';
    add('shape', { ...common, name: 'Фон сцены', x: 0, y: 0, w: 1, h: 1, color: bg, entrance: 'none', exit: 'none', radius: 0 });
    const titles = [project.product.title, project.product.features[0], project.product.cta];
    let heading = titles[index % 3];
    if (id === 'sale') heading = index === 0 ? 'Твоя новая находка' : index === 1 ? project.product.title : 'Выбери свой';
    if (id === 'benefits') heading = index === 0 ? project.product.title : project.product.features[index - 1];
    if (id === 'unbox') heading = ['Первое впечатление', 'Ближе к деталям', 'В твоём ритме', project.product.cta][index];
    if (id === 'compare') heading = index === 0 ? 'Посмотри на детали' : index === 1 ? 'До / После' : project.product.cta;
    if (id === 'review') heading = index === 1 ? 'Добавьте реальный отзыв' : titles[index % 3];
    add('text', { ...common, role: index === 0 ? 'title' : index === count - 1 ? 'cta' : '', name: 'Заголовок', text: heading, x: .085, y: .12, w: .83, h: .2, fontSize: .1, color: ink, entrance: id === 'beat' ? 'slide' : 'rise', font: id === 'noir' ? 'Noto Serif' : 'Golos Text' });
    const selected = id === 'collection' ? ['demo-headphones', 'demo-skincare', 'demo-sneaker', assetId][index] : assetId;
    add('image', { ...common, role: 'product', name: 'Товар', assetId: selected, x: .085, y: .35, w: .83, h: .43, entrance: id === 'beat' ? 'pop' : 'rise', motion: id === 'noir' ? 'pan' : 'zoom', rotation: id === 'beat' && index % 2 ? -4 : 0 });
    if (id === 'compare' && index === 1) {
      const original = project.layers.at(-1); original.w = .40; original.motion = 'none';
      add('image', { ...common, role: 'product', name: 'После', assetId, x: .515, y: .35, w: .4, h: .43, entrance: 'wipe', motion: 'zoom' });
    }
    add('text', { ...common, role: 'brand', name: 'Бренд', text: project.product.brand, x: .085, y: .055, w: .8, h: .035, fontSize: .028, color: ink, weight: 600 });
    add('shape', { ...common, name: 'Плашка цены', x: .48, y: .825, w: .435, h: .066, color: light ? template.ink : template.color, radius: .025, entrance: 'pop' });
    add('text', { ...common, role: 'price', name: 'Цена', text: project.product.price, x: .50, y: .838, w: .395, h: .04, align: 'center', fontSize: .045, color: light ? '#ffffff' : template.ink, entrance: 'pop' });
    add('text', { ...common, name: 'Подпись', text: index === count - 1 ? 'Напиши нам · узнай больше' : 'Товар в центре внимания', x: .085, y: .94, w: .83, h: .03, fontSize: .024, color: ink, weight: 500 });
    styleScene(project,template,index,scene);
  }
  const music=id==='noir'?'soft':id==='beat'?'motion':'pulse';
  add('audio', { name: 'Музыка · ' + MUSIC[music].name, end: project.duration, builtin: music, volume: .32, fadeIn: .4, fadeOut: 1 });
  for (let index = 1; index < count; index++) add('audio', { name: 'Переход', builtin: 'whoosh', followScene:'scene-'+index, start: index * sceneLength - .22, end: index * sceneLength + .3, volume: .35 });
  return project;
}
function styleScene(project,template,index,scene){
  const items=project.layers.filter(item=>item.scene===scene),start=project.layers.indexOf(items[0]);
  const [bg,heading,hero]=items,brand=items.find(item=>item.role==='brand'),plate=items.find(item=>item.name==='Плашка цены'),price=items.find(item=>item.role==='price');
  const extra=[];
  if(template.id==='launch'){
    if(index===1){Object.assign(hero,{y:.13,h:.58,rotation:-2,entrance:'wipe'});Object.assign(heading,{y:.72,h:.085,fontSize:.075});}
    if(index===2){Object.assign(hero,{x:.15,y:.24,w:.7,h:.40,rotation:2});Object.assign(heading,{y:.67,h:.12,fontSize:.085});}
  }
  if(template.id==='sale'){
    Object.assign(hero,{y:.28,h:.40,rotation:index%2?-3:3,entrance:'pop'});
    Object.assign(heading,{y:.12,h:.13,fontSize:.105});
    Object.assign(plate,{x:.085,y:.73,w:.83,h:.115});Object.assign(price,{x:.1,y:.755,w:.8,h:.07,fontSize:.085});
  }
  if(template.id==='noir'){
    Object.assign(hero,{x:0,y:0,w:1,h:.74,radius:0,entrance:'fade',motion:'pan'});
    const veil=layer('shape',{name:'Подложка заголовка',scene,start:heading.start,end:heading.end,x:0,y:.61,w:1,h:.39,color:'#201d1a',radius:0,entrance:'none',exit:'none'});extra.push(veil);
    Object.assign(heading,{y:.66,h:.12,align:'center',fontSize:.085});brand.background='#201d1a';
    Object.assign(plate,{x:.28,y:.825,w:.44});Object.assign(price,{x:.30,w:.40});
  }
  if(template.id==='beat'){
    const light=index%2===0;bg.color=light?template.color:'#121722';
    for(const item of [heading,brand,items.at(-1)])item.color=light?template.ink:'#ffffff';
    Object.assign(heading,{y:index%2?.66:.12,h:.17,fontSize:.13,entrance:'slide'});
    Object.assign(hero,{x:index%2?.14:.06,y:index%2?.15:.33,w:.82,h:.43,rotation:index%2?-6:4,entrance:'pop'});
    plate.color=light?template.ink:template.color;price.color=light?'#ffffff':template.ink;
  }
  if(template.id==='benefits'){
    extra.push(layer('text',{name:'Номер преимущества',scene,start:heading.start,end:heading.end,text:String(index+1).padStart(2,'0'),x:.08,y:.105,w:.3,h:.13,fontSize:.20,color:template.color,entrance:'slide'}));
    Object.assign(heading,{y:.245,h:.13,fontSize:.085});Object.assign(hero,{y:.40,h:.38,entrance:'wipe'});
  }
  if(template.id==='collection'){
    Object.assign(hero,{x:.06,y:.33,w:.57,h:.42,rotation:-3});
    const assetId=['demo-skincare','demo-sneaker','demo-ceramics','demo-headphones'][index];
    extra.push(layer('image',{name:'Второй товар',role:'product',scene,start:hero.start,end:hero.end,assetId,x:.51,y:.45,w:.43,h:.31,rotation:4,entrance:'slide',motion:'pan'}));
    heading.fontSize=.085;
  }
  if(template.id==='compare'&&index===1){
    for(const [text,x]of [['ДО',.10],['ПОСЛЕ',.54]])extra.push(layer('text',{name:'Метка сравнения',scene,start:hero.start,end:hero.end,text,x,y:.69,w:.33,h:.04,fontSize:.035,background:'#201d1a',color:'#ffffff',align:'center'}));
  }
  if(template.id==='unbox'){
    Object.assign(hero,{x:0,y:.16,w:1,h:.53,radius:0,motion:'pan',entrance:'wipe'});
    Object.assign(heading,{y:.72,h:.085,fontSize:.072});
    extra.push(layer('text',{name:'Шаг распаковки',scene,start:hero.start,end:hero.end,text:'0'+(index+1)+' / ДЕТАЛИ',x:.085,y:.11,w:.8,h:.025,fontSize:.026,color:template.color}));
  }
  if(template.id==='review'){
    Object.assign(hero,{y:.12,h:.40,entrance:'fade',motion:'pan'});
    Object.assign(heading,{y:.56,h:.20,fontSize:.085,font:'Noto Serif',text:index===1?'«Добавьте реальный отзыв»':heading.text});
  }
  if(template.id==='minimal'){
    bg.color='#f7f5ef';Object.assign(hero,{x:.12,y:.31,w:.76,h:.45,fit:'contain',radius:0,motion:'none',entrance:'fade'});
    Object.assign(heading,{y:.15,h:.12,fontSize:.075,align:'center'});plate.hidden=true;
    Object.assign(price,{x:.1,w:.8,align:'center',color:template.ink});
  }
  // Media precedes typography so layouts may overlap without obscuring titles.
  const media=items.filter(item=>['image','video'].includes(item.type));
  const other=items.filter(item=>item!==bg&&!media.includes(item));
  project.layers.splice(start,items.length,bg,...media,...extra,...other);
}
const validId = value => typeof value === 'string' && /^[\w-]{1,80}$/.test(value) && !['constructor','prototype','__proto__'].includes(value);
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const safeColor = value => typeof value === 'string' && (/^#[0-9a-f]{6}$/i.test(value) || value === 'transparent');
export function validateProject(value) {
  if (value?.app !== 'SatuCardVideo' || value.version !== 1 || !validId(value.id) || typeof value.format!=='string' || !Object.hasOwn(FORMATS,value.format) ||
      typeof value.name !== 'string' || value.name.length > 100 || !number(value.duration, .5, MAX_DURATION) ||
      ![24, 30, 60].includes(value.fps) || !number(value.bpm, 40, 240) || !safeColor(value.background) ||
      !Array.isArray(value.layers) || value.layers.length > MAX_LAYERS || !Array.isArray(value.assets) || value.assets.length > 40) throw new Error('Некорректный проект SatuCard Video.');
  const assets = new Set();
  if (!value.product || !['title','price','brand','cta'].every(key=>typeof value.product[key]==='string'&&value.product[key].length<=120) ||
      !Array.isArray(value.product.features) || value.product.features.length!==3 || value.product.features.some(text=>typeof text!=='string'||text.length>120)) throw new Error('Некорректные данные товара.');
  for (const asset of value.assets) {
    if (!validId(asset.id) || assets.has(asset.id) || !['image', 'video', 'audio'].includes(asset.kind) || typeof asset.name !== 'string' || asset.name.length > 200 || !number(asset.duration, 0, 3600) || Object.hasOwn(DEMOS,asset.id)&&asset.kind!=='image') throw new Error('Некорректные медиа проекта.');
    assets.add(asset.id);
  }
  const ids = new Set();
  for (const item of value.layers) {
    if (!validId(item.id) || ids.has(item.id) || !['image','video','text','shape','audio','subtitles'].includes(item.type) ||
        !number(item.start, 0, value.duration) || !number(item.end, item.start + .02, value.duration + .001) ||
        !['x','y'].every(key => number(item[key], -3, 3)) || !['w','h'].every(key => number(item[key], .005, 6)) ||
        !number(item.rotation, -360, 360) || !number(item.opacity, 0, 1) || !safeColor(item.color) || !safeColor(item.background) ||
        !number(item.fontSize, .008, .5) || !number(item.volume, 0, 2) || !number(item.offset, 0, 3600) ||
        !number(item.fadeIn, 0, 10) || !number(item.fadeOut, 0, 10) || !number(item.radius, 0, .5) ||
        typeof item.text !== 'string' || item.text.length > 3000 || typeof item.name !== 'string' || item.name.length > 100 ||
        !['Golos Text','Manrope','Noto Serif','IBM Plex Mono'].includes(item.font) || !['left','center','right'].includes(item.align) ||
        ![400,500,600,650,700,750,800,900].includes(item.weight) || !['cover','contain'].includes(item.fit) ||
        !['none','fade','rise','slide','pop','wipe'].includes(item.entrance) || !['none','fade'].includes(item.exit) ||
        !['none','zoom','pan'].includes(item.motion) || (item.assetId && !assets.has(item.assetId)) ||
        (item.builtin && (!Object.hasOwn({ ...MUSIC, whoosh:1, impact:1, tap:1, chime:1 }, item.builtin)||item.offset>30))) throw new Error('Некорректный слой проекта.');
    ids.add(item.id);
    if (['image','video'].includes(item.type) && !item.assetId || item.type==='audio' && !item.assetId && !item.builtin) throw new Error('Не указан исходник слоя.');
    if (item.assetId) {
      const kind=value.assets.find(asset=>asset.id===item.assetId).kind;
      if (kind!==item.type) throw new Error('Тип слоя не совпадает с исходником.');
    }
    if (!Array.isArray(item.keyframes) || item.keyframes.length > 60) throw new Error('Слишком много ключевых кадров.');
    for (const frame of item.keyframes) {
      if (!number(frame.t,0,1) || !['linear','smooth','out'].includes(frame.ease) || !['x','y'].every(key=>number(frame[key],-3,3)) ||
          !['w','h'].every(key=>number(frame[key],.005,6)) || !number(frame.opacity,0,1) || !number(frame.rotation,-360,360)) throw new Error('Некорректный ключевой кадр.');
    }
    if (item.type === 'subtitles' && (!Array.isArray(item.cues) || item.cues.length > 200 || item.cues.some(cue => !number(cue.start,0,30) || !number(cue.end,cue.start+.01,30) || typeof cue.text!=='string' || cue.text.length>500))) throw new Error('Некорректные субтитры.');
  }
  return clone(value);
}
export function frameAt(item, time) {
  const progress = clamp((time - item.start) / (item.end - item.start), 0, 1);
  const frames = [...item.keyframes].sort((a,b)=>a.t-b.t);
  let state = { ...item };
  if (frames.length) {
    const before = frames.filter(frame=>frame.t<=progress).at(-1) || frames[0];
    const after = frames.find(frame=>frame.t>=progress) || frames.at(-1);
    let ratio = after.t === before.t ? 0 : (progress-before.t)/(after.t-before.t);
    if (after.ease === 'smooth') ratio = ratio*ratio*(3-2*ratio);
    if (after.ease === 'out') ratio = 1-(1-ratio)**3;
    for (const key of ['x','y','w','h','rotation','opacity']) state[key] = before[key]+(after[key]-before[key])*ratio;
  }
  const enter = clamp((time-item.start)/Math.min(.5,(item.end-item.start)/3),0,1);
  const eased = 1-(1-enter)**3;
  if (item.entrance !== 'none') state.opacity *= eased;
  if (item.entrance === 'rise') state.y += (1-eased)*.08;
  if (item.entrance === 'slide') state.x += (1-eased)*.18;
  if (item.entrance === 'pop') { state.w *= .78+.22*eased; state.h *= .78+.22*eased; }
  if (item.exit === 'fade') state.opacity *= clamp((item.end-time)/.3,0,1);
  return { ...state, progress, enter: eased };
}
export function parseSubtitles(source) {
  const clock = raw => raw.replace(',', '.').split(':').reduce((total, part)=>total*60+Number(part),0);
  const result = [];
  for (const block of source.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    const index = lines.findIndex(line=>line.includes('-->'));
    if (index < 0) continue;
    const match = /([\d:]+[.,]\d+)\s*-->\s*([\d:]+[.,]\d+)/.exec(lines[index]);
    if (!match) continue;
    const start=clock(match[1]), end=clock(match[2]);
    const text=lines.slice(index+1).join('\n').replace(/<[^>]*>/g,'').slice(0,500);
    if (Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&start<30&&end>start&&text) result.push({start,end:Math.min(end,30),text});
  }
  if (!result.length || result.length>200) throw new Error('Нужны субтитры SRT/VTT с таймкодами в пределах 30 секунд.');
  return result;
}
export function fitToBeats(project, beatTimes) {
  if (!beatTimes.length) throw new Error('Добавьте музыку и определите ритм.');
  const scenes = [...new Set(project.layers.filter(item=>item.scene).map(item=>item.scene))];
  const groups = scenes.map(id=>({id,items:project.layers.filter(item=>item.scene===id)}));
  const nearest = time=>beatTimes.reduce((best,beat)=>Math.abs(beat-time)<Math.abs(best-time)?beat:best,time===0?0:beatTimes[0]);
  for (const group of groups) {
    const start=Math.min(...group.items.map(item=>item.start)), end=Math.max(...group.items.map(item=>item.end));
    const nextStart=clamp(nearest(start),0,project.duration-.2), nextEnd=clamp(nearest(end),nextStart+.2,project.duration);
    for (const item of group.items) {
      const span=end-start;
      const a=(item.start-start)/span, b=(item.end-start)/span;
      item.start=nextStart+a*(nextEnd-nextStart); item.end=nextStart+b*(nextEnd-nextStart);
    }
  }
  for(const item of project.layers.filter(item=>item.followScene)){
    const scene=project.layers.filter(layer=>layer.scene===item.followScene);
    if(!scene.length)continue;
    const boundary=Math.min(...scene.map(layer=>layer.start));
    item.start=Math.max(0,boundary-.22);item.end=Math.min(project.duration,boundary+.3);
  }
}
