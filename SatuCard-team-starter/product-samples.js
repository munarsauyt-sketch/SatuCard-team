'use strict';

// Demonstration data, not a shop inventory. Keep the gallery and editor in sync.
// Prices are illustrative; factual specifications belong to the seller.
window.SATUCARD_SAMPLES = {
  headphones: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Наушники светлые', title: 'Беспроводные наушники', headline: 'Звук без границ', price: 24990, category: 'electronics', subtitle: 'Музыка в вашем ритме', description: '', features: ['Беспроводное подключение', 'Мягкие амбушюры', 'Современный дизайн'], badge: 'Ваш следующий выбор' },
  dark_headphones: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Наушники тёмные', title: 'Беспроводные наушники', headline: 'Чистый звук в тишине', price: 29990, category: 'electronics', subtitle: 'Активное шумоподавление', description: '', features: ['До 36 ч без подзарядки', 'Мягкие амбушюры', 'Матовый корпус'], badge: 'Хит продаж' },
  sneaker: { photo: { fit: 'cover', y: 50 }, orientation: 'vertical', label: 'Кроссовки', title: 'Кроссовки Daily', headline: 'Лёгкость в каждом шаге', price: 32500, category: 'clothing', subtitle: 'Ваш повседневный стиль', description: '', features: ['Для повседневных образов', 'Лаконичный силуэт', 'Выберите свой размер'], badge: 'Новая коллекция' },
  skincare: { photo: { fit: 'cover', y: 58 }, orientation: 'vertical', label: 'Косметика', title: 'Сыворотка для лица', headline: 'Время для себя', price: 8900, category: 'beauty', subtitle: 'Ваш ритуал ухода', description: '', features: ['Ежедневный уход', 'Удобный флакон', 'Подробнее о составе'], badge: 'Маленький ритуал' },
  ceramics: { photo: { fit: 'cover', y: 42 }, orientation: 'vertical', label: 'Посуда', title: 'Керамическая чашка', headline: 'Пауза со вкусом', price: 4900, category: 'home', subtitle: 'Детали уютного утра', description: '', features: ['Для любимого напитка', 'На каждый день', 'Деталь вашего стола'], badge: 'Для дома' },
  bag: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Сумки', title: 'Сумка на каждый день', headline: 'Всё нужное рядом', price: 18900, category: 'clothing', subtitle: 'Акцент вашего образа', description: '', features: ['Повседневный образ', 'Ваш городской стиль', 'Внимание к деталям'], badge: 'Аксессуары' },
  jewelry: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Украшения', title: 'Кулон с цепочкой', headline: 'Особенная деталь', price: 12900, category: 'clothing', subtitle: 'Лаконичный акцент', description: '', features: ['Выразительная форма', 'Завершённый образ', 'Для особых моментов'], badge: 'Коллекция деталей' },
  decor: { photo: { fit: 'cover', y: 55 }, orientation: 'vertical', label: 'Декор', title: 'Декоративная ваза', headline: 'Дом в деталях', price: 6900, category: 'home', subtitle: 'Настроение вашего пространства', description: '', features: ['Для вашего интерьера', 'Мягкий акцент', 'Место для вдохновения'], badge: 'Уютная коллекция' },
  kitchen: { photo: { fit: 'cover', y: 38 }, orientation: 'vertical', label: 'Для кухни', title: 'Кухонный органайзер', headline: 'Всё на своём месте', price: 5900, category: 'home', subtitle: 'Порядок на вашей кухне', description: '', features: ['Всё под рукой', 'Для кухонных принадлежностей', 'Порядок на столе'], badge: 'На каждый день' },
  studio_tea: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Чайный набор', title: 'Керамический чайный набор', headline: 'Тихое утро дома', price: 11900, category: 'home', subtitle: 'Чайник и чашка из каменной керамики', description: '', features: ['Матовая глазурь', 'Ручка из ореха', 'Подарочная упаковка'], badge: 'Ручная работа' },
  perfume: { photo: { fit: 'cover', y: 52 }, orientation: 'vertical', label: 'Парфюм', title: 'Парфюм Atelier 100 мл', headline: 'Тёплый древесный шлейф', price: 21500, category: 'beauty', subtitle: 'Амбра, кедр и тёплые специи', description: '', features: ['Флакон из янтарного стекла', 'Стойкий аромат', 'Крышка из дерева'], badge: 'Лимитировано' },
  smartwatch: { photo: { fit: 'cover', y: 50 }, orientation: 'vertical', label: 'Смарт-часы', title: 'Смарт-часы Pulse Pro', headline: 'Точность в каждом дне', price: 44900, category: 'electronics', subtitle: 'Титановый корпус и яркий дисплей', description: '', features: ['Защита от воды', 'Уведомления и спорт', 'Удобный ремешок'], badge: 'Новинка' },
  thermos: { photo: { fit: 'cover', y: 50 }, orientation: 'vertical', label: 'Термобутылка', title: 'Термобутылка Nord 750 мл', headline: 'Температура на весь день', price: 7900, category: 'home', subtitle: 'Матовая сталь и герметичная крышка', description: '', features: ['Двойные стенки', 'Не проливается', 'Удобная ручка'], badge: 'Для поездок' },
  botanical_oil: { photo: { fit: 'cover', y: 52 }, orientation: 'vertical', label: 'Масло для лица', title: 'Масло для лица Botanical', headline: 'Природное сияние кожи', price: 9400, category: 'beauty', subtitle: 'Лёгкая текстура с пипеткой', description: '', features: ['Стеклянный флакон 30 мл', 'Быстро впитывается', 'На каждый день'], badge: 'Уход' },
  lavender_cream: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Крем для лица', title: 'Крем для лица Bloom', headline: 'Нежное увлажнение', price: 7600, category: 'beauty', subtitle: 'Лёгкий дневной уход', description: '', features: ['Матовая баночка 50 мл', 'Комфортная текстура', 'Подходит под макияж'], badge: 'Нежный уход' },
  clay_candle: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Аромасвеча', title: 'Аромасвеча Terracotta', headline: 'Уют тёплого вечера', price: 6400, category: 'home', subtitle: 'Соевый воск в керамическом стакане', description: '', features: ['Хлопковый фитиль', 'Дубовая крышка', 'Многоразовая форма'], badge: 'Для уюта' },
  leather_wallet: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Картхолдер', title: 'Кожаный картхолдер', headline: 'Компактная классика', price: 13500, category: 'clothing', subtitle: 'Натуральная кожа и ровная строчка', description: '', features: ['Помещается в карман', 'Отделения для карт', 'Тёплый коньячный тон'], badge: 'Аксессуары' },
  matcha_set: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Набор Матча', title: 'Набор для чая Матча', headline: 'Ритуал спокойного утра', price: 14900, category: 'home', subtitle: 'Керамическая чаша и бамбуковый венчик', description: '', features: ['Чаша ручной работы', 'Венчик из бамбука', 'Готовый подарок'], badge: 'Чайный ритуал' },
  pop_speaker: { photo: { fit: 'cover' }, orientation: 'horizontal', label: 'Колонка', title: 'Колонка Pulse Mini', headline: 'Громкий ритм повсюду', price: 19900, category: 'electronics', subtitle: 'Компактный Bluetooth-звук 360°', description: '', features: ['Чистый бас', 'Тканевый корпус', 'Удобно брать с собой'], badge: 'Хит' }
};

// Curated 1:1 matching between each of the 24 card templates and a color- & orientation-matched product.
// Vertical/editorial templates (editorial, blueprint, graphite, espresso, mineral, linen, jade)
// are always paired with true portrait 2:3 product photography.
window.SATUCARD_TEMPLATE_SAMPLES = {
  studio:    'studio_tea',
  neon:      'dark_headphones',
  editorial: 'perfume',
  bold:      'bag',
  noir:      'jewelry',
  bloom:     'lavender_cream',
  accent:    'clay_candle',
  minimal:   'headphones',
  showcase:  'leather_wallet',
  blueprint: 'smartwatch',
  matcha:    'matcha_set',
  pop:       'pop_speaker',
  graphite:  'decor',
  cloud:     'sneaker',
  porcelain: 'kitchen',
  espresso:  'ceramics',
  cobalt:    'smartwatch',
  citrus:    'perfume',
  mineral:   'thermos',
  blush:     'lavender_cream',
  midnight:  'dark_headphones',
  linen:     'skincare',
  jade:      'botanical_oil',
  cherry:    'jewelry'
};

// Recognize original demo JPEGs after portable project restore.
window.SATUCARD_SAMPLE_DIGESTS = {
  "756d6b2f10e3ceb12591684f5982da4647fc2fcee5c7886cf4b92430a23d1c4e": "headphones",
  "d1f309003886ebe5405929647dc2a1e8145cd220fe0cb2aa0799a1146d6de782": "dark_headphones",
  "edcdff3d5c0942f98800d85d2af2b719071a46155a97d3c98386b4c38e81dd93": "sneaker",
  "2e20f161c9245b48100372972f87a34d7c6840959014b4e7e94d26fb94d85a5c": "skincare",
  "8ceb98aec56627216739212933d72dda37cdbe39b52c22a19256689e94fc1a9a": "ceramics",
  "8db5eb601dbb21b503cae5d65c70fb5374e54767deddc1f86b4a83f4eb396c8e": "bag",
  "b537f119e77423c4c114cce24c132167f036fe571c6bddb4f6be8b054912c74a": "jewelry",
  "eac5a5d5f2dc81a63eda90124368616505de6ab677477a3fa03b3869e152d0a9": "decor",
  "b83ffe9e04b4a25976fb1d5bc110a40996265ee2a975dc15e0e86f75592c7574": "kitchen",
  "de6a42ded78e364fe0dcb715364fc8c744d1dae79bca2fa220c85cd38c494453": "studio_tea",
  "ffdb9a91a5403ffc17e860f37f4f8503c894c435a359ffffcf10dd07e7525636": "perfume",
  "1bf4326cee35558295da897a0cfbdb00d25fa15121f0eaf63422374649a2cbb4": "smartwatch",
  "93383706b6444241ea13d2d537ea0b93338c0a70067e0df0418c42c3f76c8847": "thermos",
  "decd42266b99db6032e8ab6ba6c95fc04937bc84884f45a89c18b4669ff51be3": "botanical_oil",
  "acbbedb6b943cc47cd14cf17dd4ce624d79c008879e326806c6dbdc9b350c5dd": "lavender_cream",
  "13206fc636adb58a98e7357efece623d16a4d300936c5486d730e4c2c53e0ff6": "clay_candle",
  "ca486df3df695c202287ace0975576c2390a18fd1b3f341156fbde5f920b258a": "leather_wallet",
  "2f9cbc1e4c4535dad8d86efbe87f1c7b9158d3ff4eac8d45908257a76ea0ad83": "matcha_set",
  "e082b039260eaba9e767665078b386887afa1477981381fe744e4aae13dec9af": "pop_speaker"
};
