// Geometry stays in editable layers; no remote artwork or extra fonts are needed.
const palettes = [
  ['mango', 'Манго', '#ff593c', '#ffd438', '#42207a'],
  ['electric', 'Электрик', '#5733ef', '#28edce', '#22154e'],
  ['berry', 'Ягодный', '#ed347c', '#b6ff68', '#441653'],
  ['lagoon', 'Лагуна', '#067b94', '#ffe071', '#123f52'],
];
const layouts = [
  ['orbit', 'Цветная орбита', 'Круги, градиент и товар крупным планом'],
  ['sticker', 'Стикер-поп', 'Наклейки, смелая рамка и контрастная цена'],
  ['postcard', 'Яркая открытка', 'Фото в рамке на сочном цветном фоне'],
  ['ribbon', 'Цветной поток', 'Диагональные ленты и крупная типографика'],
  ['gallery', 'Поп-галерея', 'Асимметричные блоки и чистая витрина'],
  ['spotlight', 'В центре света', 'Радиальный свет и округлая сцена'],
];
export const VIVID_TEMPLATES = layouts.flatMap(([layout, name, note]) =>
  palettes.map(([palette, label, color, accent, ink]) => ({
    id: `vivid-${layout}-${palette}`, name: `${name} · ${label}`, note,
    category: 'Яркие', base: 'launch', vivid: true, layout, color, accent, ink,
  })));

export function composeVivid(project, template, makeLayer) {
  project.name = template.name;
  project.templateId = template.id;
  project.background = template.ink;
  project.transition = 'fade';
  const ids = [...new Set(project.layers.map(item => item.scene).filter(Boolean))];
  for (const [index, scene] of ids.entries()) {
    const items = project.layers.filter(item => item.scene === scene);
    const bg = items.find(item => item.name === 'Фон сцены');
    const hero = items.find(item => item.role === 'product');
    const heading = items.find(item => item.name === 'Заголовок');
    const brand = items.find(item => item.role === 'brand');
    const price = items.find(item => item.role === 'price');
    const plate = items.find(item => item.name === 'Плашка цены');
    const caption = items.find(item => item.name === 'Подпись');
    const common = { scene, start: bg.start, end: bg.end, entrance: 'none', exit: 'none' };
    Object.assign(bg, { color: template.color, gradient: 'linear', gradientColor: template.ink, gradientAngle: 35 + index * 55 });
    Object.assign(hero, { x: .12, y: .36, w: .76, h: .39, rotation: index % 2 ? -3 : 3, radius: .045, shadow: .45, entrance: 'pop', motion: 'zoom' });
    Object.assign(heading, { x: .08, y: .13, w: .84, h: .18, fontSize: .105, color: '#ffffff', font: 'Golos Text', align: 'left', background: template.ink, entrance: 'rise' });
    Object.assign(brand, { color: '#ffffff', background: template.ink, x: .08, y: .055, w: .84, h: .035 });
    Object.assign(plate, { x: .40, y: .82, w: .52, h: .08, color: template.accent, rotation: 0, radius: .035 });
    Object.assign(price, { x: .42, y: .84, w: .48, h: .045, color: template.ink, fontSize: .052, align: 'center', background: 'transparent' });
    Object.assign(caption, { x: .08, y: .94, w: .84, color: '#ffffff', background: template.ink });
    const decorations = [];
    const shape = values => decorations.push(makeLayer('shape', { ...common, name: 'Цветной акцент', color: template.accent, ...values }));
    if (template.layout === 'orbit') {
      shape({ x: .32, y: .28, w: .84, h: .48, radius: .5, rotation: -12 });
      shape({ x: -.12, y: .65, w: .40, h: .225, radius: .5, color: template.ink });
      shape({ x: .04, y: .33, w: .16, h: .09, radius: .5, color: '#ffffff' });
      Object.assign(hero, { x: .12, y: .37, w: .76, h: .37, rotation: -4 + index * 4 });
    } else if (template.layout === 'sticker') {
      bg.gradient = 'none';
      shape({ x: .055, y: .335, w: .89, h: .45, rotation: -5, radius: .04 });
      shape({ x: .76, y: .31, w: .16, h: .09, rotation: 22, color: '#ffffff' });
      shape({ x: .06, y: .78, w: .22, h: .045, rotation: -12, color: template.ink });
      Object.assign(hero, { x: .10, y: .36, w: .8, h: .40, rotation: 2 });
      Object.assign(heading, { align: 'center', entrance: 'pop', fontSize: .12 });
    } else if (template.layout === 'postcard') {
      shape({ x: .08, y: .29, w: .84, h: .50, color: '#fff8e9', rotation: -3, radius: .012 });
      shape({ x: .35, y: .28, w: .30, h: .035, rotation: -3 });
      shape({ x: .04, y: .81, w: .22, h: .07, rotation: 10, color: template.ink });
      Object.assign(hero, { x: .12, y: .34, w: .76, h: .39, rotation: -3, radius: 0 });
      Object.assign(heading, { y: .12, h: .14, font: 'Noto Serif', fontSize: .095 });
    } else if (template.layout === 'ribbon') {
      shape({ x: -.2, y: .34, w: 1.4, h: .18, rotation: -25 });
      shape({ x: -.18, y: .66, w: 1.36, h: .065, rotation: -25, color: '#ffffff' });
      shape({ x: .02, y: .31, w: .22, h: .025, color: template.ink });
      Object.assign(hero, { x: .18, y: .34, w: .68, h: .43, rotation: 6, entrance: 'slide' });
      Object.assign(heading, { x: .06, w: .88, fontSize: .115 });
    } else if (template.layout === 'gallery') {
      bg.gradient = 'none';
      shape({ x: .50, y: 0, w: .50, h: .81, color: template.ink, radius: 0 });
      shape({ x: .06, y: .33, w: .88, h: .46, color: template.accent, radius: .10 });
      shape({ x: .07, y: .82, w: .21, h: .08, color: '#ffffff', radius: .04 });
      Object.assign(hero, { x: .10, y: .36, w: .8, h: .40, rotation: 0, entrance: 'wipe' });
      Object.assign(heading, { x: .06, y: .12, w: .88, fontSize: .11 });
    } else {
      bg.gradient = 'radial'; bg.gradientColor = template.accent;
      shape({ x: .04, y: .30, w: .92, h: .49, color: template.ink, radius: .5 });
      shape({ x: .80, y: .25, w: .14, h: .079, color: '#ffffff', radius: .5 });
      shape({ x: .04, y: .79, w: .20, h: .025, color: template.accent });
      Object.assign(hero, { x: .12, y: .36, w: .76, h: .38, rotation: 0, radius: .13, entrance: 'fade' });
      Object.assign(heading, { align: 'center', fontSize: .10 });
    }
    // Accents sit below the product and the solid-backed type for legibility.
    project.layers.splice(project.layers.indexOf(bg) + 1, 0, ...decorations);
  }
  return project;
}
