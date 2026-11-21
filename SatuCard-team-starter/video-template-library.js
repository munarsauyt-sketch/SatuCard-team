// Distinct compositions for seller categories, with editable geometry and type.
export const EXTRA_TEMPLATES=[
  ['beauty','Beauty editorial','Косметика','minimal','#f4d9d0','#4b2934','editorial'],
  ['tech','Tech launch','Техника','launch','#93e4ee','#102b33','split'],
  ['fashion','Fashion cut','Одежда','beat','#d4ef7b','#222816','poster'],
  ['food','Вкус в деталях','Еда','minimal','#f4bd76','#432a1a','frame'],
  ['home','Тёплый дом','Дом','collection','#e0c6a8','#403229','editorial'],
  ['jewel','Jewel atelier','Украшения','noir','#d9c198','#222022','frame'],
  ['sport','Move faster','Спорт','beat','#ff9a61','#301f21','split'],
  ['kids','Маленькие открытия','Детям','benefits','#b1d6ee','#29455b','poster'],
  ['gift','Идея для подарка','Подарки','sale','#edb8c7','#522e43','frame'],
  ['mono','Монохром','Товар','minimal','#dedede','#171717','poster'],
  ['cobalt','Cobalt studio','Товар','launch','#c9d5ff','#182b8b','split'],
  ['sage','Sage story','Товар','minimal','#dce6cd','#344333','editorial'],
  ['cafe','Coffee break','Еда','unbox','#d7ae87','#33231d','split'],
  ['detail','Макро: детали','Товар','unbox','#c4b9de','#2d2540','frame'],
  ['duet','Дуэт товаров','Каталог','collection','#d8d4fa','#35304d','poster'],
  ['weekend','Weekend offer','Акция','sale','#f6de79','#382f17','editorial'],
  ['paper','Бумажная история','История','review','#e9e1cd','#3c352c','frame'],
  ['night','Night drop','Акция','beat','#c1a1ff','#20162f','editorial'],
  ['ceramic','Ceramic objects','Дом','minimal','#d7bca5','#46372b','split'],
  ['linen','Льняной свет','Одежда','noir','#e7dcc8','#3e3b32','poster'],
].map(([id,name,category,base,color,ink,layout])=>({id,name,category,base,color,ink,layout,note:category+' · '+name}));
function shade(hex,delta){
  const clean=/^#[0-9a-f]{6}$/i.test(hex)?hex.slice(1):'191b22';
  const ch=o=>Math.max(0,Math.min(255,parseInt(clean.slice(o,o+2),16)+delta)).toString(16).padStart(2,'0');
  return '#'+ch(0)+ch(2)+ch(4);
}
export function composeExtra(project,template){
  project.name=template.name;project.templateId=template.id;
  project.background=template.ink;
  const sceneIds=[...new Set(project.layers.map(i=>i.scene).filter(Boolean))];
  for(const [index,id]of sceneIds.entries()){
    const items=project.layers.filter(i=>i.scene===id),hero=items.find(i=>i.role==='product'),heading=items.find(i=>i.name==='Заголовок'),bg=items.find(i=>i.name==='Фон сцены');
    const light=index%2===1;
    bg.color=light?template.color:template.ink;
    bg.gradient=light?'linear':'radial';
    bg.gradientColor=light?shade(template.color,-18):shade(template.ink,-16);
    bg.gradientAngle=150;
    const ink=light?template.ink:'#fffdf5';
    for(const item of items.filter(i=>i.type==='text')){item.color=ink;item.background='transparent';}
    for(const item of items.filter(i=>i.name==='Подложка заголовка'||i.name==='Номер преимущества'||i.name==='Шаг распаковки'))item.hidden=true;
    const second=items.find(i=>i.name==='Второй товар');
    if(template.layout==='editorial'){
      if(second){
        Object.assign(hero,{x:.06,y:.115,w:.56,h:.50,rotation:-2,radius:.042,fit:'cover'});
        Object.assign(second,{x:.48,y:.225,w:.46,h:.40,rotation:3,radius:.042,shadow:.5,fit:'cover'});
      }else{
        Object.assign(hero,{x:.06,y:.115,w:.88,h:.53,rotation:0,radius:.042,fit:'cover'});
      }
      Object.assign(heading,{x:.07,y:.68,w:.86,h:.12,fontSize:.082,align:'left',font:'Noto Serif'});
    }
    if(template.layout==='split'){
      Object.assign(hero,{x:.33,y:.20,w:.61,h:.55,rotation:index%2?2.5:-2.5,radius:.042,fit:'cover'});
      Object.assign(heading,{x:.06,y:.115,w:.58,h:.21,fontSize:.098,align:'left',font:'Golos Text',background:bg.color});
    }
    if(template.layout==='poster'){
      if(second){
        Object.assign(hero,{x:.07,y:.345,w:.55,h:.41,rotation:-2.5,radius:.045,fit:'cover'});
        Object.assign(second,{x:.49,y:.415,w:.44,h:.35,rotation:3.5,radius:.045,shadow:.5,fit:'cover'});
      }else{
        Object.assign(hero,{x:.09,y:.345,w:.82,h:.415,rotation:0,radius:.045,fit:'cover'});
      }
      Object.assign(heading,{x:.06,y:.125,w:.88,h:.19,fontSize:.115,align:'center',font:'Golos Text'});
    }
    if(template.layout==='frame'){
      Object.assign(hero,{x:.06,y:.105,w:.88,h:.66,rotation:0,radius:.06,fit:'cover'});
      Object.assign(heading,{x:.10,y:.575,w:.80,h:.13,fontSize:.084,align:'center',background:template.ink,color:'#fffdf5',font:'Noto Serif'});
    }
    const plate=items.find(i=>i.name==='Плашка цены'),price=items.find(i=>i.role==='price');
    const plateColor=light?template.ink:template.color;
    const priceInk=light?'#fffdf5':template.ink;
    Object.assign(plate,{x:.46,y:.82,w:.46,h:.07,color:plateColor,radius:.045,shadow:.28,hidden:false});
    Object.assign(price,{x:.48,y:.834,w:.42,h:.042,fontSize:.046,color:priceInk,align:'center'});
    for(const item of items.filter(i=>i.role==='product'))item.shadow=.5;
  }
  return project;
}
