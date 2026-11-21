import { EXTRA_TEMPLATES, composeExtra } from './video-template-library.js';
import { VIVID_TEMPLATES, composeVivid } from './video-vivid-templates.js';
export const MAX_DURATION = 30;
export const MAX_LAYERS = 64;
export const FORMATS = {
  vertical: { label: '9:16 · Истории', width: 1080, height: 1920 },
  marketplace34: { label: '3:4 · Видеообложка МП', width: 900, height: 1200 },
  square: { label: '1:1 · Каталог', width: 1080, height: 1080 },
  wide: { label: '16:9 · Горизонтальный', width: 1920, height: 1080 },
};
export const DEMOS = {
  'demo-headphones': 'headphones',
  'demo-dark_headphones': 'dark_headphones',
  'demo-ceramics': 'ceramics',
  'demo-sneaker': 'sneaker',
  'demo-skincare': 'skincare',
  'demo-smartwatch': 'smartwatch',
  'demo-perfume': 'perfume',
  'demo-thermos': 'thermos',
  'demo-botanical_oil': 'botanical_oil',
  'demo-decor': 'decor',
  'demo-kitchen': 'kitchen',
  'demo-studio_tea': 'studio_tea',
  'demo-lavender_cream': 'lavender_cream',
  'demo-clay_candle': 'clay_candle',
  'demo-leather_wallet': 'leather_wallet',
  'demo-matcha_set': 'matcha_set',
  'demo-pop_speaker': 'pop_speaker',
  'demo-bag': 'bag',
  'demo-jewelry': 'jewelry',
};
const DEFAULT_DEMO_IDS = ['demo-dark_headphones', 'demo-ceramics', 'demo-sneaker', 'demo-skincare'];
export const VIDEO_TEMPLATE_DEMOS = {
  // 10 base templates
  launch: { assetId: 'demo-dark_headphones', title: 'Беспроводные наушники', price: '29 990 ₸', cta: 'Чистый студийный звук', features: ['Активное шумоподавление', '40 часов без подзарядки', 'Мягкая посадка на весь день'] },
  sale: { assetId: 'demo-bag', title: 'Структурная сумка', price: '19 990 ₸', cta: 'Скидка недели −30%', features: ['Плотная экокожа', 'Держит форму весь день', 'Ремень на плечо в комплекте'] },
  noir: { assetId: 'demo-decor', title: 'Чёрная керамика', price: '22 400 ₸', cta: 'Лимитированная серия', features: ['Ручная формовка', 'Матовая каменная глазурь', 'Акцент для интерьера'] },
  beat: { assetId: 'demo-pop_speaker', title: 'Акустика Pulse Mini', price: '27 500 ₸', cta: 'Звук в твоём ритме', features: ['Глубокий бас 360°', 'Влагозащита корпуса', 'До 18 часов музыки'] },
  benefits: { assetId: 'demo-lavender_cream', title: 'Крем с лавандой', price: '14 900 ₸', cta: 'Нежный уход на ночь', features: ['Шёлковая текстура', 'Увлажнение на 24 часа', 'Без отдушек и парабенов'] },
  collection: { assetId: 'demo-matcha_set', assets: ['demo-matcha_set', 'demo-botanical_oil', 'demo-ceramics', 'demo-studio_tea'], title: 'Чайная коллекция', price: '18 900 ₸', cta: 'Собери свой набор', features: ['Натуральная керамика', 'Подарочная коробка', 'Доставка по Казахстану'] },
  compare: { assetId: 'demo-clay_candle', title: 'Аромасвеча из глины', price: '9 800 ₸', cta: 'Уют с первого вечера', features: ['100% соевый воск', 'Деревянный фитиль', 'До 45 часов горения'] },
  unbox: { assetId: 'demo-thermos', title: 'Термобутылка Frost', price: '13 500 ₸', cta: 'Холод 24 ч · тепло 12 ч', features: ['Сталь 18/8 без запаха', 'Герметичная крышка', 'Матовое покрытие'] },
  review: { assetId: 'demo-skincare', title: 'Сыворотка Glow Drop', price: '16 200 ₸', cta: 'Сияние каждый день', features: ['Витамин C + гиалурон', 'Мгновенно впитывается', 'Подходит под макияж'] },
  minimal: { assetId: 'demo-perfume', title: 'Парфюм Amber Veil', price: '34 900 ₸', cta: 'Шлейф на весь день', features: ['Ноты амбры и кедра', 'Стойкость до 12 часов', 'Флакон 50 мл в футляре'] },
  // 20 extra templates
  beauty: { assetId: 'demo-skincare', title: 'Сыворотка Glow', price: '16 200 ₸', cta: 'Уход нового уровня', features: ['Сияние за 7 дней', 'Лёгкая формула', 'Дерматологически проверено'] },
  tech: { assetId: 'demo-smartwatch', title: 'Смарт-часы Nova Pro', price: '54 900 ₸', cta: 'Контроль и стиль', features: ['AMOLED-экран 120 Гц', 'Титановый корпус', 'До 14 дней без зарядки'] },
  fashion: { assetId: 'demo-bag', title: 'Сумка Lime Line', price: '23 900 ₸', cta: 'Главный акцент сезона', features: ['Чёткая геометрия', 'Удобная застёжка', 'Стильная фурнитура'] },
  food: { assetId: 'demo-kitchen', title: 'Набор для сервировки', price: '18 500 ₸', cta: 'Уютная кухня дома', features: ['Натуральное дерево', 'Прочная глазурь', 'Подходит для посудомойки'] },
  home: { assetId: 'demo-studio_tea', assets: ['demo-studio_tea', 'demo-clay_candle', 'demo-ceramics', 'demo-decor'], title: 'Чайный сервиз', price: '21 900 ₸', cta: 'Атмосфера тёплого дома', features: ['Ручная керамика', 'Чайник и две пиалы', 'Подарочная упаковка'] },
  jewel: { assetId: 'demo-jewelry', title: 'Кольцо Atelier Gold', price: '42 000 ₸', cta: 'Тонкий блеск деталей', features: ['Серебро 925 · позолота', 'Ручная полировка', 'Футляр в комплекте'] },
  sport: { assetId: 'demo-sneaker', title: 'Кроссовки Aero Run', price: '38 900 ₸', cta: 'Лёгкость в каждом шаге', features: ['Дышащая сетка', 'Амортизация пятки', 'Вес всего 240 грамм'] },
  kids: { assetId: 'demo-thermos', title: 'Термос Kids 500', price: '11 400 ₸', cta: 'Удобно в школу и парк', features: ['Не проливается в рюкзаке', 'Безопасная сталь', 'Держит тепло 10 часов'] },
  gift: { assetId: 'demo-perfume', title: 'Подарочный парфюм', price: '34 900 ₸', cta: 'Готовый подарок в коробке', features: ['Авторский аромат', 'Премиальный флакон', 'Открытка в комплекте'] },
  mono: { assetId: 'demo-headphones', title: 'Студийные наушники', price: '24 990 ₸', cta: 'Минимализм и звук', features: ['Сбалансированный бас', 'Складное оголовье', 'Быстрая зарядка USB-C'] },
  cobalt: { assetId: 'demo-smartwatch', title: 'Часы Cobalt Series', price: '59 900 ₸', cta: 'Точность на запястье', features: ['Сапфировое стекло', 'GPS и пульсометр', 'Водозащита 5 ATM'] },
  sage: { assetId: 'demo-botanical_oil', title: 'Масло Botanical', price: '17 800 ₸', cta: 'Чистый природный состав', features: ['Холодный отжим', 'Питает без блеска', 'Стеклянная пипетка'] },
  cafe: { assetId: 'demo-ceramics', title: 'Кружка Espresso', price: '8 900 ₸', cta: 'Идеальное утро с кофе', features: ['Толстые стенки', 'Долго хранит тепло', 'Уникальный узор глазури'] },
  detail: { assetId: 'demo-lavender_cream', title: 'Крем Velvet Calm', price: '14 900 ₸', cta: 'Рассмотрите текстуру', features: ['Экстракт лаванды', 'Снимает сухость', 'Объём 50 мл'] },
  duet: { assetId: 'demo-leather_wallet', assets: ['demo-leather_wallet', 'demo-perfume', 'demo-smartwatch', 'demo-decor'], title: 'Набор аксессуаров', price: '31 900 ₸', cta: 'Идеальный дуэт на каждый день', features: ['Натуральная кожа', 'Тонкий профиль', 'Подарочная упаковка'] },
  weekend: { assetId: 'demo-clay_candle', title: 'Свеча Terracotta', price: '9 800 ₸', cta: 'Предложение выходных', features: ['Тёплый аромат кедра', 'Ручная заливка', 'Скидка до воскресенья'] },
  paper: { assetId: 'demo-leather_wallet', title: 'Картхолдер из кожи', price: '15 900 ₸', cta: 'Крафт и долговечность', features: ['Итальянская кожа', '6 отделений для карт', 'Ровная ручная строчка'] },
  night: { assetId: 'demo-dark_headphones', title: 'Наушники Night Pro', price: '32 900 ₸', cta: 'Ночной релиз в наличии', features: ['Пространственный звук', 'Шумоподавление Pro', 'Кейс для поездок'] },
  ceramic: { assetId: 'demo-ceramics', title: 'Керамика ручной работы', price: '12 400 ₸', cta: 'Живые фактуры дома', features: ['Авторский обжиг', 'Каждое изделие уникально', 'Бережная упаковка'] },
  linen: { assetId: 'demo-studio_tea', title: 'Льняная серия', price: '26 500 ₸', cta: 'Спокойная эстетика', features: ['Природные оттенки', 'Приятная фактура', 'Для уютных встреч'] },
  // 24 vivid templates
  'vivid-orbit-mango': { assetId: 'demo-clay_candle', title: 'Аромасвеча Манго', price: '9 800 ₸', cta: 'Яркий акцент дома', features: ['Натуральный воск', 'Тёплый аромат', '45 часов горения'] },
  'vivid-orbit-electric': { assetId: 'demo-pop_speaker', title: 'Колонка Neon Pulse', price: '27 500 ₸', cta: 'Включай на полную', features: ['Мощный звук 360°', '18 часов работы', 'Защита от брызг'] },
  'vivid-orbit-berry': { assetId: 'demo-lavender_cream', title: 'Крем Berry Velvet', price: '14 900 ₸', cta: 'Мягкость с первого касания', features: ['Лёгкая текстура', 'Питание 24 часа', 'Нежный аромат'] },
  'vivid-orbit-lagoon': { assetId: 'demo-thermos', title: 'Термос Lagoon 750', price: '13 500 ₸', cta: 'Свежесть в пути', features: ['Холод до 24 часов', 'Сталь 18/8', 'Не скользит в руке'] },
  'vivid-sticker-mango': { assetId: 'demo-bag', title: 'Сумка Solar Drop', price: '23 900 ₸', cta: 'Успей забрать', features: ['Сочный цвет', 'Держит форму', 'Доставка сегодня'] },
  'vivid-sticker-electric': { assetId: 'demo-dark_headphones', title: 'Наушники Volt X', price: '29 990 ₸', cta: 'Заряд чистого звука', features: ['Глубокий бас', '40 часов работы', 'Быстрый USB-C'] },
  'vivid-sticker-berry': { assetId: 'demo-sneaker', title: 'Кроссовки Flash', price: '38 900 ₸', cta: 'Скидка на хит', features: ['Лёгкая подошва', 'Дышащий верх', 'Все размеры'] },
  'vivid-sticker-lagoon': { assetId: 'demo-matcha_set', title: 'Набор Matcha Zen', price: '16 900 ₸', cta: 'Ритуал энергии', features: ['Чаша + венчик', 'Натуральный бамбук', 'Стильная коробка'] },
  'vivid-postcard-mango': { assetId: 'demo-skincare', title: 'Сыворотка Glow', price: '16 200 ₸', cta: 'Для сияния кожи', features: ['Витамин C', 'Лёгкое нанесение', 'Заметный эффект'] },
  'vivid-postcard-electric': { assetId: 'demo-headphones', title: 'Аудио Air Studio', price: '24 990 ₸', cta: 'Лёгкость и звук', features: ['Мягкие амбушюры', 'Чистый микрофон', 'Bluetooth 5.3'] },
  'vivid-postcard-berry': { assetId: 'demo-perfume', title: 'Парфюм Rose Gold', price: '34 900 ₸', cta: 'Тонкий шлейф', features: ['Амбра и цветы', 'Стойкость 12 часов', '50 мл в футляре'] },
  'vivid-postcard-lagoon': { assetId: 'demo-studio_tea', title: 'Чайный набор', price: '21 900 ₸', cta: 'Уютная пауза', features: ['Керамика ручной работы', 'Чайник и пиалы', 'Подарочный бокс'] },
  'vivid-ribbon-mango': { assetId: 'demo-kitchen', title: 'Кухонный сет', price: '18 500 ₸', cta: 'Обнови кухню', features: ['Эко-материалы', 'Удобная форма', 'На каждый день'] },
  'vivid-ribbon-electric': { assetId: 'demo-smartwatch', title: 'Смарт-часы Ultra', price: '54 900 ₸', cta: 'Ритм и технологии', features: ['Экран AMOLED', '14 дней автономности', 'Титановый корпус'] },
  'vivid-ribbon-berry': { assetId: 'demo-ceramics', title: 'Керамика Craft', price: '12 400 ₸', cta: 'Характер в деталях', features: ['Ручная работа', 'Плотная глазурь', 'Приятно держать'] },
  'vivid-ribbon-lagoon': { assetId: 'demo-botanical_oil', title: 'Масло Emerald', price: '17 800 ₸', cta: 'Природное сияние', features: ['Органический состав', 'Быстро впитывается', 'Флакон 30 мл'] },
  'vivid-gallery-mango': { assetId: 'demo-leather_wallet', title: 'Кошелёк Terracotta', price: '15 900 ₸', cta: 'Выбор на каждый день', features: ['Натуральная кожа', 'Компактный размер', 'Аккуратная строчка'] },
  'vivid-gallery-electric': { assetId: 'demo-pop_speaker', title: 'Спикер Wave 360', price: '27 500 ₸', cta: 'Музыка повсюду', features: ['Чистый стереозвук', 'Защита IP67', 'Компактный корпус'] },
  'vivid-gallery-berry': { assetId: 'demo-jewelry', title: 'Кольцо Velvet', price: '42 000 ₸', cta: 'Блеск без повода', features: ['Серебро 925', 'Тонкая огранка', 'Фирменный футляр'] },
  'vivid-gallery-lagoon': { assetId: 'demo-decor', title: 'Ваза Studio Dark', price: '22 400 ₸', cta: 'Современный декор', features: ['Матовая фактура', 'Минимализм', 'Ручной обжиг'] },
  'vivid-spotlight-mango': { assetId: 'demo-perfume', title: 'Аромат Sunset', price: '34 900 ₸', cta: 'В центре внимания', features: ['Тёплый шлейф', 'Стойкая формула', 'Флакон 50 мл'] },
  'vivid-spotlight-electric': { assetId: 'demo-smartwatch', title: 'Часы Night Edge', price: '54 900 ₸', cta: 'Новинка сезона', features: ['Яркий дисплей', 'Спортивные режимы', 'Быстрая зарядка'] },
  'vivid-spotlight-berry': { assetId: 'demo-bag', title: 'Сумка Pop Lime', price: '23 900 ₸', cta: 'Смелый силуэт', features: ['Плотная фактура', 'Стильная форма', 'В наличии сейчас'] },
  'vivid-spotlight-lagoon': { assetId: 'demo-dark_headphones', title: 'Наушники Deep Bass', price: '29 990 ₸', cta: 'Погрузись в звук', features: ['Шумоподавление', 'Мягкие амбушюры', '40 часов музыки'] },
};
function shadeHex(hex, delta) {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '151821';
  const part = offset => clamp(parseInt(clean.slice(offset, offset + 2), 16) + delta, 0, 255).toString(16).padStart(2, '0');
  return '#' + part(0) + part(2) + part(4);
}
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
  ...EXTRA_TEMPLATES,
  ...VIVID_TEMPLATES,
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
    offset: 0, volume: 0, fadeIn: .15, fadeOut: .3, hidden: false, locked:false, speed:1, shadow:0, exposure:1, saturation:1, cropX:.5, cropY:.5, ...values,
  };
}
export function emptyProject() {
  return {
    app: 'SatuCardVideo', version: 1, id: uid(), name: 'Новый ролик',
    format: 'vertical', duration: 12, background: '#14161e', fps: 30, bpm: 120,
    product: { title: 'Беспроводные наушники', price: '29 990 ₸', brand: 'YOUR STORE', cta: 'Чистый студийный звук', features: ['Активное шумоподавление', '40 часов без подзарядки', 'Мягкая посадка на весь день'] },
    layers: [], assets: DEFAULT_DEMO_IDS.map(id => ({ id, kind: 'image', name: DEMOS[id], duration: 0 })),
  };
}
export function templateProject(id, product, assetId, demoSet) {
  const template = TEMPLATES.find(item => item.id === id);
  if (!template) throw new Error('Выберите шаблон.');
  const demo = VIDEO_TEMPLATE_DEMOS[id];
  const resolvedAsset = assetId || demo?.assetId || 'demo-dark_headphones';
  const resolvedProduct = product || (demo ? { title: demo.title, price: demo.price, brand: demo.brand || 'YOUR STORE', cta: demo.cta, features: [...demo.features] } : undefined);
  const resolvedSet = demoSet || demo?.assets;
  if(template.vivid)return composeVivid(templateProject(template.base,resolvedProduct,resolvedAsset,resolvedSet),template,layer);
  if(template.base)return composeExtra(templateProject(template.base,resolvedProduct,resolvedAsset,resolvedSet),template);
  const project = emptyProject();
  project.templateId=id;
  if (resolvedSet && resolvedSet.every(item => Object.hasOwn(DEMOS, item))) {
    project.assets = resolvedSet.slice(0, 4).map(demoId => ({ id: demoId, kind: 'image', name: DEMOS[demoId], duration: 0 }));
  } else if (Object.hasOwn(DEMOS, resolvedAsset) && !project.assets.some(item => item.id === resolvedAsset)) {
    project.assets[0] = { id: resolvedAsset, kind: 'image', name: DEMOS[resolvedAsset], duration: 0 };
  }
  if (resolvedProduct) project.product = { ...project.product, ...resolvedProduct };
  project.name = template.name;
  project.background = template.ink;
  project.bpm = id === 'beat' ? 128 : id === 'noir' ? 100 : 120;
  const count = ['benefits', 'collection', 'unbox'].includes(id) ? 4 : id === 'beat' ? 6 : 3;
  project.duration = id === 'beat' ? 11.25 : count * 4;
  const sceneLength = project.duration / count;
  const customAsset = !Object.hasOwn(DEMOS, resolvedAsset);
  const setAssets = resolvedSet || project.assets.map(a => a.id);
  const add = (type, data) => project.layers.push(layer(type, data));
  for (let index = 0; index < count; index++) {
    const start = index * sceneLength, end = start + sceneLength, scene = 'scene-' + index;
    const common = { start, end, scene };
    const light = ['sale', 'minimal', 'review', 'compare'].includes(id);
    const bg = light ? (index % 2 ? '#f7f4ec' : template.color) : index % 2 ? template.ink : shadeHex(template.ink, 10);
    const bgSecond = light ? shadeHex(bg, -18) : shadeHex(bg, -14);
    const ink = light ? template.ink : '#f6f5ef';
    add('shape', { ...common, name: 'Фон сцены', x: 0, y: 0, w: 1, h: 1, color: bg, gradient: light ? 'linear' : 'radial', gradientColor: bgSecond, gradientAngle: 155, entrance: 'none', exit: 'none', radius: 0 });
    const titles = [project.product.title, project.product.features[0], project.product.cta];
    let heading = titles[index % 3];
    if (id === 'sale') heading = index === 0 ? 'Твоя новая находка' : index === 1 ? project.product.title : 'Выбери свой';
    if (id === 'benefits') heading = index === 0 ? project.product.title : project.product.features[index - 1];
    if (id === 'unbox') heading = ['Первое впечатление', 'Ближе к деталям', 'В твоём ритме', project.product.cta][index];
    if (id === 'compare') heading = index === 0 ? 'Посмотри на детали' : index === 1 ? 'До / После' : project.product.cta;
    if (id === 'review') heading = index === 1 ? 'Добавьте реальный отзыв' : titles[index % 3];
    add('text', { ...common, role: index === 0 ? 'title' : index === count - 1 ? 'cta' : '', name: 'Заголовок', text: heading, x: .08, y: .115, w: .84, h: .19, fontSize: .096, color: ink, entrance: id === 'beat' ? 'slide' : 'rise', font: id === 'noir' ? 'Noto Serif' : 'Golos Text' });
    const selected = id === 'collection' ? (customAsset ? resolvedAsset : setAssets[index % setAssets.length]) : resolvedAsset;
    add('image', { ...common, role: 'product', name: 'Товар', assetId: selected, x: .08, y: .335, w: .84, h: .445, radius: .042, shadow: .48, entrance: id === 'beat' ? 'pop' : 'rise', motion: id === 'noir' ? 'pan' : 'zoom', rotation: id === 'beat' && index % 2 ? -3.5 : 0 });
    if (id === 'compare' && index === 1) {
      const original = project.layers.at(-1); original.w = .40; original.motion = 'none';
      add('image', { ...common, role: 'product', name: 'После', assetId: resolvedAsset, x: .52, y: .335, w: .40, h: .445, radius: .042, shadow: .48, entrance: 'wipe', motion: 'zoom' });
    }
    add('text', { ...common, role: 'brand', name: 'Бренд', text: project.product.brand, x: .08, y: .052, w: .84, h: .035, fontSize: .028, color: ink, weight: 600 });
    add('shape', { ...common, name: 'Плашка цены', x: .46, y: .82, w: .46, h: .07, color: light ? template.ink : template.color, radius: .045, shadow: .26, entrance: 'pop' });
    add('text', { ...common, role: 'price', name: 'Цена', text: project.product.price, x: .48, y: .834, w: .42, h: .042, align: 'center', fontSize: .046, color: light ? '#ffffff' : template.ink, entrance: 'pop' });
    add('text', { ...common, name: 'Подпись', text: index === count - 1 ? 'Напиши нам · узнай больше' : 'Товар в центре внимания', x: .08, y: .938, w: .84, h: .03, fontSize: .024, color: ink, weight: 500 });
    styleScene(project,template,index,scene,setAssets,customAsset ? resolvedAsset : null);
  }
  const music=id==='noir'?'soft':id==='beat'?'motion':'pulse';
  add('audio', { name: 'Музыка · ' + MUSIC[music].name, end: project.duration, builtin: music, volume: .32, fadeIn: .4, fadeOut: 1 });
  for (let index = 1; index < count; index++) add('audio', { name: 'Переход', builtin: 'whoosh', followScene:'scene-'+index, start: index * sceneLength - .22, end: index * sceneLength + .3, volume: .35 });
  return project;
}
function styleScene(project,template,index,scene,setAssets,customAsset){
  const items=project.layers.filter(item=>item.scene===scene),start=project.layers.indexOf(items[0]);
  const [bg,heading,hero]=items,brand=items.find(item=>item.role==='brand'),plate=items.find(item=>item.name==='Плашка цены'),price=items.find(item=>item.role==='price');
  const extra=[];
  if(template.id==='launch'){
    bg.color=index%2?'#192038':'#14192b';bg.gradient='radial';bg.gradientColor='#0b0e18';
    Object.assign(hero,{radius:.045,shadow:.55});
    if(index===1){Object.assign(hero,{y:.12,h:.58,rotation:-2,entrance:'wipe'});Object.assign(heading,{y:.72,h:.085,fontSize:.075});}
    if(index===2){Object.assign(hero,{x:.12,y:.23,w:.76,h:.41,rotation:2});Object.assign(heading,{y:.67,h:.12,fontSize:.085});}
  }
  if(template.id==='sale'){
    Object.assign(hero,{y:.27,h:.41,rotation:index%2?-2.5:2.5,radius:.045,shadow:.5,entrance:'pop'});
    Object.assign(heading,{y:.115,h:.13,fontSize:.102});
    Object.assign(plate,{x:.08,y:.725,w:.84,h:.112,radius:.045,shadow:.32});Object.assign(price,{x:.1,y:.75,w:.8,h:.07,fontSize:.082});
  }
  if(template.id==='noir'){
    bg.color='#171411';bg.gradient='linear';bg.gradientColor='#0d0b09';bg.gradientAngle=180;
    Object.assign(hero,{x:.05,y:.095,w:.90,h:.55,radius:.04,shadow:.55,entrance:'fade',motion:'pan'});
    const veil=layer('shape',{name:'Подложка заголовка',scene,start:heading.start,end:heading.end,x:.05,y:.665,w:.90,h:.26,color:'#241f1a',gradient:'linear',gradientColor:'#171411',gradientAngle:160,radius:.04,shadow:.35,entrance:'none',exit:'none'});extra.push(veil);
    Object.assign(heading,{x:.09,y:.69,w:.82,h:.11,align:'center',fontSize:.078,color:'#f6efe3'});
    Object.assign(brand,{y:.04,align:'center',background:'transparent',color:'#d6c2a2'});
    Object.assign(plate,{x:.24,y:.825,w:.52,h:.066,color:'#d4ba94',radius:.045,shadow:.25});Object.assign(price,{x:.26,y:.839,w:.48,color:'#1a1510'});
  }
  if(template.id==='beat'){
    const light=index%2===0;
    bg.color=light?template.color:'#12172b';bg.gradient='linear';bg.gradientColor=light?shadeHex(template.color,-26):'#090c18';bg.gradientAngle=145;
    for(const item of [heading,brand,items.at(-1)])item.color=light?template.ink:'#ffffff';
    Object.assign(heading,{y:index%2?.66:.115,h:.16,fontSize:.12,entrance:'slide'});
    Object.assign(hero,{x:index%2?.12:.08,y:index%2?.14:.32,w:.80,h:.44,rotation:index%2?-4:3,radius:.045,shadow:.52,entrance:'pop'});
    plate.color=light?template.ink:template.color;price.color=light?'#ffffff':template.ink;
  }
  if(template.id==='benefits'){
    bg.color=index%2?'#2c2342':'#1f1830';bg.gradient='radial';bg.gradientColor='#120e1d';
    extra.push(layer('text',{name:'Номер преимущества',scene,start:heading.start,end:heading.end,text:String(index+1).padStart(2,'0'),x:.08,y:.095,w:.32,h:.13,fontSize:.19,color:template.color,entrance:'slide'}));
    Object.assign(heading,{y:.24,h:.13,fontSize:.084});Object.assign(hero,{y:.395,h:.39,radius:.045,shadow:.48,entrance:'wipe'});
  }
  if(template.id==='collection'){
    bg.color=index%2?'#243828':'#19271d';bg.gradient='radial';bg.gradientColor='#0f1811';
    Object.assign(hero,{x:.06,y:.31,w:.57,h:.44,rotation:-2.5,radius:.042,shadow:.52});
    const secondAsset=customAsset || setAssets[(index+1)%setAssets.length];
    extra.push(layer('image',{name:'Второй товар',role:'product',scene,start:hero.start,end:hero.end,assetId:secondAsset,x:.50,y:.44,w:.44,h:.33,rotation:3.5,radius:.042,shadow:.52,entrance:'slide',motion:'pan'}));
    heading.fontSize=.084;
  }
  if(template.id==='compare'&&index===1){
    for(const [text,x]of [['ДО',.10],['ПОСЛЕ',.54]])extra.push(layer('text',{name:'Метка сравнения',scene,start:hero.start,end:hero.end,text,x,y:.71,w:.34,h:.04,fontSize:.034,background:'#201d1a',color:'#ffffff',align:'center'}));
  }
  if(template.id==='unbox'){
    bg.color=index%2?'#223552':'#172336';bg.gradient='radial';bg.gradientColor='#0e1624';
    Object.assign(hero,{x:.06,y:.165,w:.88,h:.52,radius:.042,shadow:.52,motion:'pan',entrance:'wipe'});
    Object.assign(heading,{y:.715,h:.088,fontSize:.074});
    extra.push(layer('text',{name:'Шаг распаковки',scene,start:hero.start,end:hero.end,text:'0'+(index+1)+' / ДЕТАЛИ',x:.08,y:.11,w:.84,h:.028,fontSize:.026,color:template.color}));
  }
  if(template.id==='review'){
    Object.assign(hero,{y:.115,h:.41,radius:.045,shadow:.44,entrance:'fade',motion:'pan'});
    Object.assign(heading,{y:.56,h:.21,fontSize:.082,font:'Noto Serif',text:index===1?'«Добавьте реальный отзыв»':heading.text});
  }
  if(template.id==='minimal'){
    bg.color='#f8f4ec';bg.gradient='linear';bg.gradientColor='#ebe3d4';bg.gradientAngle=165;
    Object.assign(hero,{x:.12,y:.285,w:.76,h:.485,fit:'cover',radius:.042,shadow:.34,motion:'zoom',entrance:'fade'});
    Object.assign(heading,{y:.125,h:.125,fontSize:.076,align:'center',font:'Noto Serif'});plate.hidden=true;
    Object.assign(price,{x:.1,y:.83,w:.8,align:'center',fontSize:.052,color:template.ink});
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
  if(value.transition!==undefined&&!['none','fade','slide','wipe'].includes(value.transition))throw new Error('Неизвестный переход.');
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
    for(const key of ['scene','followScene','role'])if(item[key]!==undefined&&(typeof item[key]!=='string'||item[key].length>80))throw new Error('Некорректная связь слоя.');
    for(const key of ['hidden','locked','voice'])if(item[key]!==undefined&&typeof item[key]!=='boolean')throw new Error('Некорректный флаг слоя.');
    if(item.gradient!==undefined&&!['none','linear','radial'].includes(item.gradient))throw new Error('Некорректный градиент.');
    if(item.gradientColor!==undefined&&!safeColor(item.gradientColor))throw new Error('Некорректный цвет градиента.');
    if(item.gradientAngle!==undefined&&!number(item.gradientAngle,-360,360))throw new Error('Некорректный угол градиента.');
    for(const [key,min,max]of [['speed',.25,4],['shadow',0,1],['exposure',.2,2],['saturation',0,2],['cropX',0,1],['cropY',0,1]])if(item[key]!==undefined&&!number(item[key],min,max))throw new Error('Некорректная обработка медиа.');
    if(item.freeze!==undefined&&!number(item.freeze,0,3600))throw new Error('Некорректный стоп-кадр.');
    if(item.group!==undefined&&!validId(item.group))throw new Error('Некорректная группа.');
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
