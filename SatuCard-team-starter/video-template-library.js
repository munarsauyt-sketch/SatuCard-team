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
export function composeExtra(project,template){
  project.name=template.name;project.templateId=template.id;
  const sceneIds=[...new Set(project.layers.map(i=>i.scene).filter(Boolean))];
  for(const [index,id]of sceneIds.entries()){
    const items=project.layers.filter(i=>i.scene===id),hero=items.find(i=>i.role==='product'),heading=items.find(i=>i.name==='Заголовок'),bg=items.find(i=>i.name==='Фон сцены');
    bg.color=index%2?template.color:template.ink;
    const ink=index%2?template.ink:'#fffdf5';
    for(const item of items.filter(i=>i.type==='text')){item.color=ink;item.background='transparent';}
    for(const item of items.filter(i=>i.name==='Подложка заголовка'))item.hidden=true;
    if(template.layout==='editorial'){Object.assign(hero,{x:.05,y:.12,w:.9,h:.53,rotation:0,radius:0});Object.assign(heading,{x:.07,y:.69,w:.86,h:.12,fontSize:.083,font:'Noto Serif'});}
    if(template.layout==='split'){Object.assign(hero,{x:.31,y:.18,w:.64,h:.58,rotation:index%2?3:-3});Object.assign(heading,{x:.06,y:.12,w:.6,h:.20,fontSize:.11,font:'Golos Text',background:bg.color});}
    if(template.layout==='poster'){Object.assign(hero,{x:.12,y:.36,w:.76,h:.38,rotation:0});Object.assign(heading,{x:.055,y:.14,w:.89,h:.20,fontSize:.13,align:'center',font:'Golos Text'});}
    if(template.layout==='frame'){Object.assign(hero,{x:.05,y:.11,w:.9,h:.66,rotation:0,radius:.12});Object.assign(heading,{x:.10,y:.57,w:.80,h:.14,fontSize:.09,background:template.ink,color:'#fffdf5',font:'Noto Serif'});}
    const plate=items.find(i=>i.name==='Плашка цены'),price=items.find(i=>i.role==='price');
    Object.assign(plate,{x:.48,y:.825,w:.435,h:.066,color:template.color,hidden:false});Object.assign(price,{x:.5,y:.838,w:.395,h:.04,fontSize:.045,color:template.ink,align:'center'});
    for(const item of items.filter(i=>i.role==='product'))item.shadow=.4;
  }
  return project;
}
