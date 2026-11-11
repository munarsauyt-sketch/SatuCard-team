'use strict';

// Demonstration data, not a shop inventory. Keep the gallery and editor in sync.
// Prices are illustrative; factual specifications belong to the seller.
window.SATUCARD_SAMPLES = {
  headphones: { label: 'Наушники', title: 'Беспроводные наушники', headline: 'Звук без границ', price: 24990, category: 'electronics', subtitle: 'Музыка в вашем ритме', description: '', features: ['Беспроводное подключение', 'Мягкие амбушюры', 'Современный дизайн'], badge: 'Ваш следующий выбор' },
  sneaker: { label: 'Кроссовки', title: 'Кроссовки Daily', headline: 'Лёгкость в каждом шаге', price: 32500, category: 'clothing', subtitle: 'Ваш повседневный стиль', description: '', features: ['Для повседневных образов', 'Лаконичный силуэт', 'Выберите свой размер'], badge: 'Новая коллекция' },
  skincare: { label: 'Косметика', title: 'Сыворотка для лица', headline: 'Время для себя', price: 8900, category: 'beauty', subtitle: 'Ваш ритуал ухода', description: '', features: ['Ежедневный уход', 'Удобный флакон', 'Подробнее о составе'], badge: 'Маленький ритуал' },
  ceramics: { photo: { fit: 'cover', y: 20 }, label: 'Посуда', title: 'Керамическая чашка', headline: 'Пауза со вкусом', price: 4900, category: 'home', subtitle: 'Детали уютного утра', description: '', features: ['Для любимого напитка', 'На каждый день', 'Деталь вашего стола'], badge: 'Для дома' },
  bag: { photo: { fit: 'contain' }, label: 'Сумки', title: 'Сумка на каждый день', headline: 'Всё нужное рядом', price: 18900, category: 'clothing', subtitle: 'Акцент вашего образа', description: '', features: ['Повседневный образ', 'Ваш городской стиль', 'Внимание к деталям'], badge: 'Аксессуары' },
  jewelry: { label: 'Украшения', title: 'Кулон с цепочкой', headline: 'Особенная деталь', price: 12900, category: 'clothing', subtitle: 'Лаконичный акцент', description: '', features: ['Выразительная форма', 'Завершённый образ', 'Для особых моментов'], badge: 'Коллекция деталей' },
  decor: { label: 'Декор', title: 'Декоративная ваза', headline: 'Дом в деталях', price: 6900, category: 'home', subtitle: 'Настроение вашего пространства', description: '', features: ['Для вашего интерьера', 'Мягкий акцент', 'Место для вдохновения'], badge: 'Уютная коллекция' },
  kitchen: { label: 'Для кухни', title: 'Кухонный органайзер', headline: 'Всё на своём месте', price: 5900, category: 'home', subtitle: 'Порядок на вашей кухне', description: '', features: ['Всё под рукой', 'Для кухонных принадлежностей', 'Порядок на столе'], badge: 'На каждый день' }
};

// Recognize original demo JPEGs after portable project restore.
window.SATUCARD_SAMPLE_DIGESTS = {
  "756d6b2f10e3ceb12591684f5982da4647fc2fcee5c7886cf4b92430a23d1c4e": "headphones",
  "edcdff3d5c0942f98800d85d2af2b719071a46155a97d3c98386b4c38e81dd93": "sneaker",
  "2e20f161c9245b48100372972f87a34d7c6840959014b4e7e94d26fb94d85a5c": "skincare",
  "8ceb98aec56627216739212933d72dda37cdbe39b52c22a19256689e94fc1a9a": "ceramics",
  "8db5eb601dbb21b503cae5d65c70fb5374e54767deddc1f86b4a83f4eb396c8e": "bag",
  "b537f119e77423c4c114cce24c132167f036fe571c6bddb4f6be8b054912c74a": "jewelry",
  "eac5a5d5f2dc81a63eda90124368616505de6ab677477a3fa03b3869e152d0a9": "decor",
  "b83ffe9e04b4a25976fb1d5bc110a40996265ee2a975dc15e0e86f75592c7574": "kitchen"
};
