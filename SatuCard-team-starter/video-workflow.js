import { clone, uid, clamp, layer, validateProject, templateProject } from './video-model.js';

export function scenes(project) {
  return [...new Set(project.layers.map(item=>item.scene).filter(Boolean))].map(id=>{
    const items=project.layers.filter(item=>item.scene===id);
    return {id,start:Math.min(...items.map(i=>i.start)),end:Math.max(...items.map(i=>i.end)),name:items.find(i=>i.name==='Заголовок')?.text||'Сцена',items};
  }).sort((a,b)=>a.start-b.start);
}
function shift(item,delta){item.start+=delta;item.end+=delta;if(item.cues)item.cues=item.cues.map(c=>({...c,start:c.start+delta,end:c.end+delta}));}
export function reorderScene(project,id,direction){
  const list=scenes(project),index=list.findIndex(s=>s.id===id),other=index+direction;
  if(index<0||other<0||other>=list.length)return false;
  const a=list[Math.min(index,other)],b=list[Math.max(index,other)];
  if(Math.abs(a.end-b.start)>.02)throw new Error('Сначала совместите соседние сцены без промежутка.');
  const aDelta=b.end-b.start,bDelta=-(a.end-a.start);
  for(const item of project.layers){if(item.scene===a.id||item.followScene===a.id)shift(item,aDelta);if(item.scene===b.id||item.followScene===b.id)shift(item,bDelta);}
  for(const item of project.layers){item.start=Math.max(0,item.start);item.end=Math.min(project.duration,item.end);}
  validateProject(project);return true;
}
export function duplicateScene(project,id){
  const list=scenes(project),source=list.find(s=>s.id===id);if(!source)return;
  if(list.some(s=>s.id!==id&&s.start<source.end-.001&&s.end>source.start+.001))throw new Error('Сначала разделите перекрывающиеся сцены.');
  const span=source.end-source.start;
  const sourceItems=project.layers.filter(item=>item.scene===id||item.followScene===id);
  if(project.duration+span>30||project.layers.length+sourceItems.length>64)throw new Error('Копия превысит 30 секунд или 64 слоя.');
  const newId='scene-'+uid();
  const copies=sourceItems.map(item=>{const copy=clone(item);copy.id=uid();if(copy.scene)copy.scene=newId;if(copy.followScene)copy.followScene=newId;copy.group=undefined;shift(copy,span);return copy;});
  const later=new Set(list.filter(s=>s.start>=source.end-.001).map(s=>s.id));
  for(const item of project.layers){
    if(later.has(item.scene)||later.has(item.followScene)){shift(item,span);continue;}
    if(item.scene||item.followScene)continue;
    if(item.start>=source.end-.001){shift(item,span);continue;}
    if(item.end>=source.end-.001)item.end+=span;
    if(item.cues)item.cues=item.cues.map(c=>({...c,start:c.start>=source.end?c.start+span:c.start,end:c.end>source.end?c.end+span:c.end}));
  }
  project.layers.push(...copies);project.duration+=span;validateProject(project);
}
export function removeScene(project,id){
  const list=scenes(project),source=list.find(s=>s.id===id);if(!source)return;
  if(list.length<2)throw new Error('Оставьте хотя бы одну сцену.');
  if(list.some(s=>s.id!==id&&s.start<source.end-.001&&s.end>source.start+.001))throw new Error('Сначала разделите перекрывающиеся сцены.');
  const span=source.end-source.start;
  const later=new Set(list.filter(s=>s.start>=source.end-.001).map(s=>s.id));
  const cut=t=>t<=source.start?t:t>=source.end?t-span:source.start;
  project.layers=project.layers.filter(item=>item.scene!==id&&item.followScene!==id);
  for(const item of project.layers){
    if(later.has(item.scene)||later.has(item.followScene)){shift(item,-span);continue;}
    if(item.scene||item.followScene)continue;
    item.start=cut(item.start);item.end=cut(item.end);
    if(item.cues)item.cues=item.cues.map(c=>({...c,start:cut(c.start),end:cut(c.end)})).filter(c=>c.end>c.start+.001);
  }
  project.duration-=span;for(const item of project.layers){item.start=Math.max(0,item.start);item.end=Math.min(item.end,project.duration);}
  project.layers=project.layers.filter(i=>i.end>i.start+.001);
  validateProject(project);
}
export function openingVariant(project,kind){
  const copy=clone(project),first=scenes(copy)[0];if(!first)throw new Error('Выберите шаблон со сценами.');
  const title=first.items.find(i=>i.name==='Заголовок'),hero=first.items.find(i=>i.role==='product');
  if(title){title.text=kind==='offer'?copy.product.price:kind==='benefit'?copy.product.features[0]:copy.product.title;title.role=kind==='offer'?'price':kind==='benefit'?'':'title';title.entrance=kind==='detail'?'rise':'pop';}
  if(hero){hero.motion=kind==='detail'?'zoom':'pan';hero.fit=kind==='detail'?'cover':'contain';}
  copy.id=uid();copy.name=(copy.name+' · '+({detail:'Деталь',benefit:'Преимущество',offer:'Предложение'}[kind])).slice(0,100);return validateProject(copy);
}
export function adaptFormat(project,format){
  const copy=clone(project);copy.format=format;
  for(const scene of scenes(copy)){
    const products=scene.items.filter(i=>i.role==='product');
    for(const item of scene.items){
      let box;
      if(item.name==='Фон сцены')box={x:0,y:0,w:1,h:1};
      else if(item.role==='product')box=format==='wide'?{x:.53,y:.12,w:.42,h:.76}:format==='square'?{x:.42,y:.25,w:.53,h:.57}:{x:.085,y:.35,w:.83,h:.43};
      else if(item.name==='Заголовок')box=format==='wide'?{x:.06,y:.24,w:.42,h:.32,fontSize:.055}:format==='square'?{x:.06,y:.24,w:.33,h:.40,fontSize:.06}:{x:.085,y:.12,w:.83,h:.20,fontSize:.09};
      else if(item.role==='brand')box={x:.06,y:.055,w:.8,h:.04,fontSize:format==='wide'?.02:.028};
      else if(item.role==='price')box={x:.07,y:.84,w:.34,h:.065,fontSize:format==='wide'?.03:.045};
      else if(item.name==='Плашка цены')box={x:.055,y:.825,w:.37,h:.09};
      else if(item.name==='Подпись')box={x:.06,y:.95,w:.88,h:.03,fontSize:.018};
      if(box&&item.role==='product'&&products.length>1){const index=products.indexOf(item);const gap=.02;const full=box.w;box.w=(full-gap*(products.length-1))/products.length;box.x+=index*(box.w+gap);}
      if(box){const old={...item};Object.assign(item,box);const ow=old.w||1,oh=old.h||1;item.keyframes=item.keyframes.map(frame=>({...frame,x:box.x+(frame.x-old.x)*box.w/ow,y:box.y+(frame.y-old.y)*box.h/oh,w:frame.w*box.w/ow,h:frame.h*box.h/oh}));}
    }
  }
  for(const item of copy.layers.filter(i=>i.type==='subtitles'))Object.assign(item,{x:.08,y:.72,w:.84,h:.13,fontSize:format==='wide'?.035:.055});
  return validateProject(copy);
}
export function snapTime(project,value,excludeIds=[],pixels=55){
  const candidates=[0,project.duration,...project.layers.filter(i=>!excludeIds.includes(i.id)).flatMap(i=>[i.start,i.end])];
  const closest=candidates.reduce((a,b)=>Math.abs(b-value)<Math.abs(a-value)?b:a,candidates[0]);
  return Math.abs(closest-value)<8/pixels?closest:value;
}
export function parseCatalog(text){
  if(text.length>100000)throw new Error('Каталог слишком большой.');
  const rows=[];let row=[],cell='',quote=false;
  const delimiter=text.split('\n')[0].includes(';')?';':',';
  for(let i=0;i<=text.length;i++){const c=text[i]??'\n';if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(!quote&&(c===delimiter||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}else cell+=c;}
  if(quote)throw new Error('В CSV не закрыты кавычки.');
  const header=rows.shift()?.map(c=>c.trim().toLowerCase().replace(/^\uFEFF/,''));
  if(!header?.includes('title')||!header.includes('image'))throw new Error('CSV должен содержать столбцы title, price, image.');
  if(!rows.length||rows.length>10)throw new Error('Одна партия — от 1 до 10 товаров.');
  return rows.map((cells,index)=>{
    const item=Object.fromEntries(header.map((h,i)=>[h,(cells[i]||'').trim()]));
    if(!item.title||!item.image||item.title.length>120||String(item.price||'').length>60)throw new Error('Проверьте название и файл фотографии в строке '+(index+2));
    return {title:item.title,price:item.price||'',image:item.image,brand:(item.brand||'').slice(0,80),cta:(item.cta||'Узнайте больше').slice(0,120),features:[item.feature1||'Ваш товар',item.feature2||'Рассмотрите детали',item.feature3||'Выберите свой'].map(s=>s.slice(0,120))};
  });
}
export function catalogProject(base,product,asset){
  const copy=clone(base);copy.id=uid();copy.name=product.title.slice(0,100);copy.product={...product};delete copy.product.image;
  for(const item of copy.layers){const feature=base.product.features.indexOf(item.text);if(feature>=0&&item.type==='text')item.text=copy.product.features[feature];if(['title','price','brand','cta'].includes(item.role))item.text=copy.product[item.role];if(item.role==='product'){item.assetId=asset.id;item.type=asset.kind;item.offset=0;}}
  return validateProject(copy);
}
