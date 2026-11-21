'use strict';

// One renderer is shared by the live canvas, PNG export, and template thumbnails.
// Annotations and shadows are composited without changing the photo asset.
(() => {
  const root = typeof window === 'undefined' ? globalThis : window;
  const templates = {
    studio:    { label: 'Студия',    description: 'Тёплый свет, мягкий подиум и чистая сетка',        background: '#f2efe9', accent: '#3d5f47', textColor: '#1b241d', priceStyle: 'filled', featureStyle: 'chips',    frame: 'line' },
    accent:    { label: 'Терракота', description: 'Тёплый глиняный тон и архитектурная тень',        background: '#f6e1d3', accent: '#b83e1f', textColor: '#2d1a14', priceStyle: 'filled', featureStyle: 'accent',   shadow: 'deep' },
    minimal:   { label: 'Минимал',   description: 'Музейная белизна и точные разделители',           background: '#faf9f7', accent: '#3d4741', textColor: '#171b18', priceStyle: 'plain',  featureStyle: 'numbered' },
    noir:      { label: 'Нуар',      description: 'Обсидиан, шампанское золото и студийный свет',    background: '#111215', accent: '#d6b16b', textColor: '#f5efe3', priceStyle: 'outline',featureStyle: 'accent',   frame: 'line' },
    neon:      { label: 'Неон',      description: 'Глубокий тёмный неон и техно-сетка',              background: '#08121d', accent: '#2ce4d4', textColor: '#ecfeff', priceStyle: 'filled', featureStyle: 'chips',    titleCase: 'upper' },
    editorial: { label: 'Журнал',    description: 'Асимметричный журнальный разворот',               background: '#f1ece2', accent: '#b44329', textColor: '#221f1a', layout: 'editorial', priceStyle: 'plain', featureStyle: 'numbered' },
    bloom:     { label: 'Цветение',  description: 'Мягкий ирисовый свет и плавная рамка',            background: '#f2ecfa', accent: '#6d45ad', textColor: '#2a1d3e', priceStyle: 'pill',   featureStyle: 'chips' },
    bold:      { label: 'Постер',    description: 'Швейцарский постер и дерзкий контраст',           background: '#edf05a', accent: '#d84522', textColor: '#161714', priceStyle: 'filled', featureStyle: 'accent',   titleCase: 'upper', titleWeight: 'heavy' },
    showcase:  { label: 'Витрина',   description: 'Галерейная рамка и тёплый подиум',                background: '#fbf5ec', accent: '#ab4624', textColor: '#2c1e18', priceStyle: 'filled', featureStyle: 'chips',    frame: 'mat' },
    blueprint: { label: 'Чертёж',    description: 'Инженерная сетка индиго и точный разворот',       background: '#101d3b', accent: '#7ec4ff', textColor: '#eef6ff', layout: 'editorial', priceStyle: 'outline', featureStyle: 'numbered' },
    matcha:    { label: 'Матча',     description: 'Ботанический фон с мягкой студийной аркой',       background: '#edf2e4', accent: '#335936', textColor: '#1c2b1d', priceStyle: 'pill',   featureStyle: 'chips' },
    pop:       { label: 'Поп-арт',   description: 'Ультрамарин, лайм и современная графика',         background: '#1e2ca8', accent: '#e2fd5c', textColor: '#ffffff', priceStyle: 'filled', featureStyle: 'chips',    titleCase: 'upper' },
    graphite:  { label: 'Графит',    description: 'Матовый титан и строгий разворот',                background: '#181b1f', accent: '#90c5d8', textColor: '#f2f4f6', layout: 'editorial', priceStyle: 'filled', featureStyle: 'accent' },
    cloud:     { label: 'Облако',    description: 'Скандинавский воздух и световые кольца',          background: '#edf6fc', accent: '#1f5e99', textColor: '#132d47', priceStyle: 'pill',   featureStyle: 'chips' },
    porcelain: { label: 'Фарфор',    description: 'Фото сверху, фактура бумаги и тонкий контур',     background: '#f8f4ec', accent: '#73583c', textColor: '#2b241c', layout: 'photo-first', surface: 'paper',     frame: 'line', priceStyle: 'plain',   featureStyle: 'numbered' },
    espresso:  { label: 'Эспрессо',  description: 'Фото слева, кофейный свет и паспарту',            background: '#1f1714', accent: '#e2a372', textColor: '#fff2e6', layout: 'photo-left',  surface: 'spotlight', frame: 'mat',  priceStyle: 'outline', featureStyle: 'accent' },
    cobalt:    { label: 'Кобальт',   description: 'Глубокий кобальт и диагональные лучи света',      background: '#132678', accent: '#9fc3ff', textColor: '#f6f8ff', surface: 'rays',      frame: 'line', priceStyle: 'filled',  featureStyle: 'chips' },
    citrus:    { label: 'Цитрус',    description: 'Солнечные блоки и крупное фото сверху',           background: '#fbf0c6', accent: '#be5016', textColor: '#2f2119', layout: 'photo-first', surface: 'blocks',   priceStyle: 'filled',  featureStyle: 'accent' },
    mineral:   { label: 'Минерал',   description: 'Архитектурная сетка и холодный разворот',         background: '#e4ebee', accent: '#3b566b', textColor: '#1c2a35', layout: 'editorial',   surface: 'grid',     priceStyle: 'outline', featureStyle: 'numbered' },
    blush:     { label: 'Румянец',   description: 'Шёлковый градиент и широкое паспарту',            background: '#f8e9ef', accent: '#9b355c', textColor: '#3f2030', surface: 'gradient',  frame: 'mat',  priceStyle: 'pill',    featureStyle: 'chips' },
    midnight:  { label: 'Полночь',   description: 'Бархатная полночь, аура и фото сверху',           background: '#151026', accent: '#c79dff', textColor: '#f8f2ff', layout: 'photo-first', surface: 'rings',    frame: 'none', priceStyle: 'pill',    featureStyle: 'chips' },
    linen:     { label: 'Лён',       description: 'Тёплый лён, фактура бумаги и фото слева',         background: '#efe8da', accent: '#755b2c', textColor: '#2b251b', layout: 'photo-left',  surface: 'paper',    frame: 'none', priceStyle: 'plain',   featureStyle: 'numbered' },
    jade:      { label: 'Нефрит',    description: 'Глубокий нефрит, мягкий луч и разворот',          background: '#0f2f29', accent: '#8fd4b2', textColor: '#edf8f2', layout: 'editorial',   surface: 'spotlight',frame: 'line', priceStyle: 'outline', featureStyle: 'accent' },
    cherry:    { label: 'Вишня',     description: 'Бархатный бордо, цветовые блоки и паспарту',      background: '#65152c', accent: '#ffc2a4', textColor: '#fff5ef', surface: 'blocks',    frame: 'mat',  priceStyle: 'filled',  featureStyle: 'chips' }
  };
  const fonts = {
    manrope: { label: 'Manrope', family: 'Manrope' },
    dejavu: { label: 'DejaVu Sans', family: '"DejaVu Sans"' },
    golos: { label: 'Golos Text', family: '"Golos Text"' },
    noto: { label: 'Noto Serif', family: '"Noto Serif"' },
    plex: { label: 'IBM Plex Mono', family: '"IBM Plex Mono"' }
  };
  const formats = {
    portrait: { label: 'Пост · 4:5', width: 900, height: 1125, file: '4x5' },
    portrait34: { label: 'Маркетплейс · 3:4', width: 900, height: 1200, file: '3x4' },
    square: { label: 'Каталог · 1:1', width: 900, height: 900, file: '1x1' },
    story: { label: 'История · 9:16', width: 900, height: 1600, file: '9x16' }
  };
  const purposes = { cover: { label: 'Обложка' }, advantages: { label: 'Преимущества' }, specifications: { label: 'Характеристики' }, dimensions: { label: 'Размеры' }, contents: { label: 'Комплектация' }, instructions: { label: 'Инструкция' } };
  const categories = { generic: { label: 'Любой товар' }, electronics: { label: 'Электроника' }, clothing: { label: 'Одежда' }, beauty: { label: 'Красота' }, home: { label: 'Дом' } };
  const designChoices = {
    layout: ['template', 'stacked', 'photo-first', 'editorial', 'photo-left'],
    backdrop: ['template', 'solid', 'gradient', 'spotlight', 'mesh', 'grid', 'dots', 'paper'],
    border: ['none', 'line', 'double'],
    photoFrame: ['template', 'none', 'line', 'mat'],
    shadow: ['template', 'none', 'soft', 'deep'],
    titleWeight: ['template', 'medium', 'bold', 'heavy'],
    titleCase: ['template', 'original', 'upper'],
    featureStyle: ['template', 'plain', 'numbered', 'chips', 'accent'],
    priceStyle: ['template', 'plain', 'filled', 'outline', 'pill']
  };
  const clamp = (value, min, max, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const text = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
  const hex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : fallback;
  const amount = value => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0
    ? null : Math.min(999999999.99, Math.round(Number(value) * 100) / 100);

  function normalize(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const template = Object.hasOwn(templates, source.template) ? source.template : 'studio';
    const palette = templates[template];
    const photo = source.photo && typeof source.photo === 'object' ? source.photo : {};
    const price = amount(source.price);
    const old = amount(source.oldPrice);
    const overlay = source.annotations || {};
    const design = {};
    for (const [key, [defaultValue, ...choices]] of Object.entries(designChoices)) {
      const value = source.design?.[key] ?? defaultValue;
      if (choices.includes(value)) design[key] = value;
    }
    const texture = clamp(source.design?.texture, 0, 100, 50);
    if (texture !== 50) design.texture = texture;
    return {
      ...(Object.keys(design).length ? { design } : {}),
      ...(overlay.lens === true || overlay.dimension === true ? { annotations: {
        lens: overlay.lens === true, x: clamp(overlay.x, 0, 100, 50), y: clamp(overlay.y, 0, 100, 50),
        dimension: overlay.dimension === true, vertical: overlay.vertical === true,
        span: clamp(overlay.span, 15, 95, 70), offset: clamp(overlay.offset, 10, 90, 78), label: text(overlay.label, 32)
      } } : {}),
      ...(typeof source.translationOf === 'string' && /^[\w-]{1,64}$/.test(source.translationOf) ? { translationOf: source.translationOf } : {}),
      title: source.title == null ? 'Название вашего товара' : text(source.title, 60),
      subtitle: text(source.subtitle, 90), description: text(source.description, 180),
      price, oldPrice: price !== null && old !== null && old > price ? old : null,
      badge: text(source.badge, 24),
      features: (Array.isArray(source.features) ? source.features : []).slice(0, 3).map(value => text(value, 38)).filter(Boolean),
      purpose: Object.hasOwn(purposes, source.purpose) ? source.purpose : 'cover',
      category: Object.hasOwn(categories, source.category) ? source.category : 'generic',
      brandName: text(source.brandName, 28) || 'SatuCard.', template,
      format: Object.hasOwn(formats, source.format) ? source.format : 'portrait',
      customColors: source.customColors === true,
      background: source.customColors === true ? hex(source.background, palette.background) : palette.background,
      accent: source.customColors === true ? hex(source.accent, palette.accent) : palette.accent,
      textColor: source.customColors === true ? hex(source.textColor, palette.textColor) : palette.textColor,
      font: Object.hasOwn(fonts, source.font) ? source.font : 'manrope',
      textScale: clamp(source.textScale, 80, 120, 100),
      textAlign: source.textAlign === 'center' ? 'center' : 'left',
      showPrice: source.showPrice !== false, showBrand: source.showBrand !== false,
      photo: {
        fit: photo.fit === 'cover' ? 'cover' : 'contain',
        zoom: clamp(photo.zoom, 0.7, 2.5, 1), x: clamp(photo.x, 0, 100, 50), y: clamp(photo.y, 0, 100, 50),
        rotation: clamp(photo.rotation, -180, 180, 0), flip: photo.flip === true,
        brightness: clamp(photo.brightness, 50, 150, 100), contrast: clamp(photo.contrast, 50, 150, 100),
        saturation: clamp(photo.saturation, 0, 180, 100), radius: clamp(photo.radius, 0, 50, 24),
        warmth: clamp(photo.warmth, 0, 60, 0), blur: clamp(photo.blur, 0, 12, 0)
      }
    };
  }

  function rgba(color, alpha) {
    return `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${alpha})`;
  }
  function lightColor(color) {
    const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
    const values = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 0.4;
  }
  function path(ctx, x, y, width, height, radius = 0) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function box(ctx, x, y, width, height, radius, fill, stroke) {
    path(ctx, x, y, width, height, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function circle(ctx, x, y, radius, fill) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  }
  function line(ctx, x1, y1, x2, y2, color, width = 1) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function cornerTicks(ctx, x, y, w, h, len, color, weight = 1.5) {
    line(ctx, x, y, x + len, y, color, weight); line(ctx, x, y, x, y + len, color, weight);
    line(ctx, x + w, y, x + w - len, y, color, weight); line(ctx, x + w, y, x + w, y + len, color, weight);
    line(ctx, x, y + h, x + len, y + h, color, weight); line(ctx, x, y + h, x, y + h - len, color, weight);
    line(ctx, x + w, y + h, x + w - len, y + h, color, weight); line(ctx, x + w, y + h, x + w, y + h - len, color, weight);
  }
  const fontFamily = state => `${fonts[state.font].family}, Arial, sans-serif`;
  function font(ctx, state, size, weight = 600) {
    ctx.font = `${weight} ${size}px ${fontFamily(state)}`;
  }
  function lines(ctx, value, width) {
    const result = [];
    let current = '';
    for (const character of value) {
      if (current && ctx.measureText(current + character).width > width) {
        const split = current.lastIndexOf(' ');
        if (split > 0) { result.push(current.slice(0, split)); current = current.slice(split + 1) + character; }
        else { result.push(current); current = character; }
      } else current += character;
    }
    if (current) result.push(current.trim());
    return result;
  }
  function fitText(ctx, state, value, rect, options = {}) {
    if (!value || rect.height <= 0) return { height: 0, fontSize: 0 };
    let size = (options.size || 28) * state.textScale / 100;
    const minSize = options.minSize || 14;
    const weight = options.weight || 600;
    const spacing = options.spacing || 1.18;
    if (options.wholeWords) {
      font(ctx, state, size, weight);
      const widestWord = Math.max(...value.split(' ').map(word => ctx.measureText(word).width));
      if (widestWord > rect.width) size = Math.max(size * .7, Math.floor(size * rect.width / widestWord));
    }
    let wrapped;
    // Long words, Cyrillic titles and every supplied feature must stay inside their box.
    for (;;) {
      font(ctx, state, size, weight);
      wrapped = lines(ctx, value, rect.width);
      if (wrapped.length * size * spacing <= rect.height || size <= 1) break;
      size -= size > minSize ? 0.5 : 0.25;
    }
    const height = wrapped.length * size * spacing;
    if (options.measureOnly) return { height, fontSize: size };
    ctx.fillStyle = options.color || state.textColor;
    const align = options.align || state.textAlign;
    ctx.textAlign = align; ctx.textBaseline = 'top';
    const x = align === 'center' ? rect.x + rect.width / 2 : rect.x;
    const y = rect.y + (options.verticalCenter ? (rect.height - height) / 2 : 0);
    wrapped.forEach((row, index) => ctx.fillText(row, x, y + index * size * spacing));
    ctx.textAlign = 'left';
    return { height, fontSize: size };
  }

  function luminance(color) {
    const [red, green, blue] = [1, 3, 5].map(index => {
      const channel = parseInt(color.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  function contrastRatio(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function label(ctx, state, value, x, y, color, size = 16) {
    font(ctx, state, size, 700); ctx.fillStyle = color || state.textColor; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(value, x, y);
  }
  function pill(ctx, state, value, x, y, maxWidth, fill, color, size = 18, stroke = null) {
    font(ctx, state, size, 700);
    const padX = 18;
    while (ctx.measureText(value).width + padX * 2 > maxWidth && size > 12) { size -= 0.5; font(ctx, state, size, 700); }
    const width = Math.min(maxWidth, ctx.measureText(value).width + padX * 2);
    const height = Math.max(36, size + 20);
    const r = ['bold', 'blueprint', 'pop'].includes(state.template) ? 8 : height / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    ctx.lineWidth = stroke ? 1.5 : 0;
    box(ctx, x, y, width, height, r, fill, stroke);
    ctx.restore();
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(value, x + padX, y + height / 2 + 0.5);
    ctx.textBaseline = 'top';
    return { width, height };
  }
  function brand(ctx, state, assets, y = 36) {
    if (!state.showBrand) return;
    let x = 54;
    const image = assets.logo;
    if (image && (image.naturalWidth || image.width) > 0) {
      const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
      const ratio = Math.min(38 / width, 38 / height);
      ctx.drawImage(image, x, y, width * ratio, height * ratio);
      x += 50;
    } else {
      // Subtle editorial brand dot mark
      box(ctx, x, y + 11, 10, 10, 3, state.accent);
      x += 20;
    }
    fitText(ctx, state, state.brandName, { x, y: y + 5, width: 470, height: 30 }, { size: 20, minSize: 15, weight: 750, align: 'left', color: rgba(state.textColor, 0.88) });
  }

  function background(ctx, state, height) {
    ctx.fillStyle = state.background; ctx.fillRect(0, 0, 900, height);
    const accent = state.accent;
    const dark = !lightColor(state.background);
    const surface = state.design?.backdrop || templates[state.template].surface;
    if (surface && surface !== 'solid') {
      const intensity = (state.design?.texture ?? 50) / 50;
      const shade = (alpha, color = accent) => rgba(color, Math.min(1, alpha * intensity));
      if (surface === 'gradient') {
        const g1 = ctx.createLinearGradient(0, 0, 900, height);
        g1.addColorStop(0, shade(dark ? .22 : .16));
        g1.addColorStop(0.55, shade(.04));
        g1.addColorStop(1, shade(dark ? .14 : .2));
        ctx.fillStyle = g1; ctx.fillRect(0, 0, 900, height);
        circle(ctx, 820, height * .16, 260, shade(.08, dark ? '#ffffff' : accent));
      } else if (surface === 'spotlight') {
        const g = ctx.createRadialGradient(480, height * .44, 24, 480, height * .44, 660);
        g.addColorStop(0, shade(dark ? .34 : .22));
        g.addColorStop(0.55, shade(dark ? .12 : .07));
        g.addColorStop(1, shade(0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        line(ctx, 54, 86, 846, 86, shade(.35), 1.2);
      } else if (surface === 'mesh') {
        const m1 = ctx.createRadialGradient(140, 160, 20, 140, 160, 520);
        m1.addColorStop(0, shade(dark ? .32 : .24)); m1.addColorStop(1, shade(0));
        ctx.fillStyle = m1; ctx.fillRect(0, 0, 900, height);
        const m2 = ctx.createRadialGradient(820, height * .78, 20, 820, height * .78, 540);
        m2.addColorStop(0, shade(dark ? .24 : .18, dark ? '#ffffff' : state.textColor)); m2.addColorStop(1, shade(0));
        ctx.fillStyle = m2; ctx.fillRect(0, 0, 900, height);
      } else if (surface === 'grid') {
        for (let x = 36; x < 900; x += 48) line(ctx, x, 0, x, height, shade(.13));
        for (let y = 36; y < height; y += 48) line(ctx, 0, y, 900, y, shade(.13));
        cornerTicks(ctx, 30, 30, 840, height - 60, 18, shade(.55), 1.6);
      } else if (surface === 'dots') {
        ctx.fillStyle = shade(.22);
        for (let x = 32; x < 880; x += 28) {
          for (let y = 32; y < height - 20; y += 28) {
            ctx.fillRect(x, y, 2, 2);
          }
        }
      } else if (surface === 'paper') {
        const g = ctx.createLinearGradient(0, 0, 0, height);
        g.addColorStop(0, shade(.06, '#ffffff')); g.addColorStop(1, shade(.07, state.textColor));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        for (let y = 10; y < height; y += 12) line(ctx, 0, y, 900, y, shade(y % 4 ? .025 : .055, state.textColor));
        line(ctx, 54, 86, 846, 86, shade(.42), 1.2);
        line(ctx, 54, height - 34, 846, height - 34, shade(.24), 1);
      } else if (surface === 'rays') {
        const g = ctx.createRadialGradient(640, height * .3, 20, 640, height * .3, 720);
        g.addColorStop(0, shade(.26)); g.addColorStop(1, shade(0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        ctx.save(); ctx.translate(450, height / 2); ctx.rotate(-0.26);
        for (let x = -580; x < 640; x += 135) box(ctx, x, -height, 34, height * 2, 0, shade(.11));
        ctx.restore();
        line(ctx, 54, 86, 846, 86, shade(.45), 1.5);
      } else if (surface === 'blocks') {
        box(ctx, 0, height * .42, 900, height * .36, 0, shade(dark ? .14 : .16));
        box(ctx, 0, 0, 12, height, 0, shade(.78));
        line(ctx, 54, 86, 846, 86, shade(.4), 1.5);
      } else if (surface === 'rings') {
        const glow = ctx.createRadialGradient(450, height * .36, 30, 450, height * .36, 460);
        glow.addColorStop(0, shade(.26)); glow.addColorStop(1, shade(0));
        ctx.fillStyle = glow; ctx.fillRect(0, 0, 900, height);
        for (const [radius, alpha] of [[250, .24], [330, .18], [410, .12]]) {
          ctx.beginPath(); ctx.arc(450, height * .36, radius, 0, Math.PI * 2);
          ctx.strokeStyle = shade(alpha); ctx.lineWidth = 1.8; ctx.stroke();
        }
      }
    } else if (surface !== 'solid') {
      if (state.template === 'studio') {
        const g = ctx.createLinearGradient(0, 0, 900, height);
        g.addColorStop(0, rgba('#ffffff', 0.48)); g.addColorStop(1, rgba(accent, 0.1));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        const halo = ctx.createRadialGradient(780, 180, 20, 780, 180, 420);
        halo.addColorStop(0, rgba(accent, 0.11)); halo.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = halo; ctx.fillRect(0, 0, 900, height);
        line(ctx, 54, 86, 846, 86, rgba(state.textColor, 0.14), 1.2);
        cornerTicks(ctx, 26, 26, 848, height - 52, 16, rgba(accent, 0.38), 1.4);
      } else if (state.template === 'accent') {
        const g = ctx.createLinearGradient(0, 0, 900, height);
        g.addColorStop(0, rgba('#ffffff', 0.24)); g.addColorStop(1, rgba(accent, 0.14));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        circle(ctx, 820, height * 0.42, 330, rgba(accent, 0.12));
        box(ctx, 54, 86, 92, 4, 2, accent);
        line(ctx, 158, 88, 846, 88, rgba(state.textColor, 0.14), 1.2);
      } else if (state.template === 'minimal') {
        // Keep solid title background clean for titleContrast calculation.
        line(ctx, 54, 86, 846, 86, rgba(state.textColor, 0.16), 1.2);
        line(ctx, 54, height - 34, 846, height - 34, rgba(state.textColor, 0.12), 1);
      } else if (state.template === 'noir') {
        const g = ctx.createRadialGradient(450, height * 0.48, 30, 450, height * 0.48, 680);
        g.addColorStop(0, rgba(accent, 0.18)); g.addColorStop(0.6, rgba(accent, 0.05)); g.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        ctx.lineWidth = 1.2;
        box(ctx, 26, 26, 848, height - 52, 8, null, rgba(accent, 0.34));
        line(ctx, 54, 86, 846, 86, rgba(accent, 0.32), 1);
        cornerTicks(ctx, 36, 36, 828, height - 72, 14, rgba(accent, 0.65), 1.5);
      } else if (state.template === 'neon') {
        const g = ctx.createRadialGradient(650, height * 0.46, 20, 520, height * 0.46, 650);
        g.addColorStop(0, rgba(accent, 0.2)); g.addColorStop(0.55, rgba(accent, 0.05)); g.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        for (let x = 45; x < 900; x += 54) line(ctx, x, 0, x, height, rgba(accent, 0.055));
        for (let y = 45; y < height; y += 54) line(ctx, 0, y, 900, y, rgba(accent, 0.055));
        line(ctx, 54, 86, 846, 86, rgba(accent, 0.48), 1.6);
        box(ctx, 796, 46, 50, 8, 4, accent);
      } else if (state.template === 'editorial') {
        ctx.fillStyle = rgba(accent, 0.075); ctx.fillRect(432, 0, 468, height);
        line(ctx, 432, 86, 432, height - 42, rgba(state.textColor, 0.12), 1);
        line(ctx, 54, 86, 846, 86, rgba(state.textColor, 0.72), 1.8);
      } else if (state.template === 'bloom') {
        const g1 = ctx.createRadialGradient(840, 170, 20, 840, 170, 440);
        g1.addColorStop(0, rgba(accent, 0.2)); g1.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = g1; ctx.fillRect(0, 0, 900, height);
        const g2 = ctx.createRadialGradient(90, height * 0.8, 20, 90, height * 0.8, 420);
        g2.addColorStop(0, rgba('#ffffff', 0.58)); g2.addColorStop(1, rgba('#ffffff', 0));
        ctx.fillStyle = g2; ctx.fillRect(0, 0, 900, height);
        ctx.beginPath(); ctx.arc(824, 52, 16, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(accent, 0.45); ctx.lineWidth = 1.8; ctx.stroke();
        circle(ctx, 824, 52, 5, accent);
      } else if (state.template === 'bold') {
        ctx.fillStyle = state.textColor; ctx.fillRect(0, 0, 14, height);
        box(ctx, 54, 84, 792, 3, 0, state.textColor);
        box(ctx, 748, 36, 98, 28, 6, accent);
        ctx.save(); ctx.translate(860, height - 240); ctx.rotate(-0.12);
        ctx.fillStyle = rgba(state.textColor, 0.055); ctx.fillRect(-520, -24, 860, 140); ctx.restore();
      } else if (state.template === 'showcase') {
        const g = ctx.createLinearGradient(0, 0, 0, height);
        g.addColorStop(0, rgba('#ffffff', 0.4)); g.addColorStop(1, rgba(accent, 0.08));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        ctx.lineWidth = 1.5;
        box(ctx, 24, 24, 852, height - 48, 12, null, rgba(accent, 0.34));
        box(ctx, 54, 86, 84, 4, 2, accent);
        line(ctx, 150, 88, 846, 88, rgba(accent, 0.2), 1);
      } else if (state.template === 'blueprint') {
        for (let x = 36; x < 900; x += 54) line(ctx, x, 86, x, height - 30, rgba(accent, 0.095));
        for (let y = 86; y < height - 30; y += 54) line(ctx, 36, y, 864, y, rgba(accent, 0.095));
        ctx.lineWidth = 1.4;
        box(ctx, 24, 24, 852, height - 48, 4, null, rgba(accent, 0.34));
        cornerTicks(ctx, 36, 36, 828, height - 72, 16, rgba(accent, 0.72), 1.6);
      } else if (state.template === 'matcha') {
        box(ctx, 470, height * 0.16, 460, height * 0.86, 230, rgba(accent, 0.095));
        circle(ctx, 60, height * 0.82, 170, rgba('#ffffff', 0.36));
        line(ctx, 54, 86, 846, 86, rgba(accent, 0.24), 1.2);
      } else if (state.template === 'pop') {
        const g = ctx.createRadialGradient(780, height * 0.56, 40, 780, height * 0.56, 460);
        g.addColorStop(0, rgba(accent, 0.22)); g.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        ctx.save(); ctx.translate(820, 62); ctx.rotate(-0.2);
        box(ctx, -46, -16, 92, 24, 12, accent); ctx.restore();
        box(ctx, 54, 86, 792, 2, 0, rgba('#ffffff', 0.26));
        box(ctx, 54, height - 26, 76, 5, 3, accent);
      } else if (state.template === 'graphite') {
        box(ctx, 430, 86, 470, height - 124, 0, rgba(accent, 0.075));
        line(ctx, 54, 86, 846, 86, rgba(accent, 0.48), 1.4);
        line(ctx, 54, height - 38, 846, height - 38, rgba(accent, 0.36), 1.2);
      } else if (state.template === 'cloud') {
        const g = ctx.createLinearGradient(0, 0, 900, height);
        g.addColorStop(0, rgba('#ffffff', 0.7)); g.addColorStop(1, rgba(accent, 0.12));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 900, height);
        for (const [radius, alpha] of [[140, 0.16], [210, 0.12], [280, 0.08]]) {
          ctx.beginPath(); ctx.arc(790, height - 60, radius, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(accent, alpha); ctx.lineWidth = 1.6; ctx.stroke();
        }
        line(ctx, 54, 86, 846, 86, rgba(accent, 0.2), 1);
      }
    }
    if (state.design?.border) {
      ctx.lineWidth = 2;
      box(ctx, 22, 22, 856, height - 44, 6, null, rgba(accent, .72));
      if (state.design.border === 'double') box(ctx, 32, 32, 836, height - 64, 4, null, rgba(accent, .38));
    }
  }

  // Keep a small outline per decoded image. It also works for re-opened PNGs.
  const outlines = new WeakMap();
  function silhouette(image, width, height) {
    if (outlines.has(image)) return outlines.get(image);
    let points = null;
    if (root.document && !image.src?.startsWith?.('data:image/jpeg')) {
      const surface = root.document.createElement('canvas'), ratio = Math.min(1, 160 / Math.max(width, height));
      const w = surface.width = Math.max(1, Math.round(width * ratio));
      const h = surface.height = Math.max(1, Math.round(height * ratio));
      try {
        const scan = surface.getContext('2d', { willReadFrequently: true });
        scan.drawImage(image, 0, 0, w, h);
        const pixels = scan.getImageData(0, 0, w, h).data;
        let clear = 0;
        const edges = [];
        for (let y = 0; y < h; y++) {
          let left = w, right = -1;
          for (let x = 0; x < w; x++) {
            const alpha = pixels[(y * w + x) * 4 + 3];
            if (alpha <= 24) clear++;
            if (alpha >= 128) { left = Math.min(left, x); right = x; }
          }
          if (right >= left) for (const x of [left, right + 1]) {
            edges.push([x / w - .5, y / h - .5], [x / w - .5, (y + 1) / h - .5]);
          }
        }
        if (clear >= w * h * .01 && edges.length) points = edges;
      } catch { /* Images without readable pixels can still be displayed. */ }
    }
    outlines.set(image, points);
    return points;
  }

  function contactShadow(ctx, outline, cx, cy, width, height, angle, flip) {
    if (!outline) return;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const points = outline.map(([u, v]) => {
      const x = u * width * (flip ? -1 : 1), y = v * height;
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    });
    const base = Math.max(...points.map(p => p[1]));
    const band = Math.max(2, Math.min(width, height) * .035);
    const feet = points.filter(p => p[1] >= base - band).map(p => p[0]);
    const left = Math.min(...feet), right = Math.max(...feet);
    const radius = Math.max(band * 2, (right - left) * .64);
    ctx.save(); ctx.translate((left + right) / 2, base - band * .15);
    ctx.scale(radius, Math.max(3, Math.min(radius * .21, band * 1.3)));
    const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    fade.addColorStop(0, 'rgba(24,19,16,.38)'); fade.addColorStop(.5, 'rgba(24,19,16,.18)'); fade.addColorStop(1, 'rgba(24,19,16,0)');
    circle(ctx, 0, 0, 1, fade); ctx.restore();
  }

  function dimensionLine(ctx, state, rect, a) {
    const length = (a.vertical ? rect.height : rect.width) * a.span / 100;
    const cx = rect.x + rect.width * (a.vertical ? a.offset / 100 : .5);
    const cy = rect.y + rect.height * (a.vertical ? .5 : a.offset / 100);
    ctx.save(); ctx.translate(cx, cy);
    if (a.vertical) ctx.rotate(-Math.PI / 2);
    const half = length / 2, arrow = Math.min(12, length / 5);
    for (const [color, thickness] of [['#ffffff', 7], ['#19212a', 3]]) {
      line(ctx, -half, 0, half, 0, color, thickness);
      for (const side of [-1, 1]) for (const dy of [-1, 1]) {
        line(ctx, side * half, 0, side * (half - arrow), dy * arrow * .58, color, thickness);
      }
    }
    if (a.label) {
      const available = Math.max(20, (a.vertical ? rect.height : rect.width) - 12);
      font(ctx, state, 19, 750);
      const w = Math.min(available, ctx.measureText(a.label).width + 18);
      box(ctx, -w / 2, -34, w, 29, 8, '#19212a');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
      ctx.fillText(a.label, 0, -19, Math.max(1, w - 10));
    }
    ctx.restore();
  }

  function photoPlacement(settings, image, rect) {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    const angle = settings.rotation * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle), c = Math.abs(cos), s = Math.abs(sin);
    const base = settings.fit === 'cover' ? Math.max((rect.width*c + rect.height*s)/width, (rect.width*s + rect.height*c)/height)
      : Math.min(rect.width/(width*c + height*s), rect.height/(width*s + height*c));
    const scale = base * settings.zoom, flip = settings.flip ? -1 : 1;
    const centerX = rect.x + rect.width * (.5 + (settings.x - 50) * .007);
    const centerY = rect.y + rect.height * (.5 + (settings.y - 50) * .007);
    return { centerX, centerY, scale, angle,
      toFrame(u, v) {
        const x = (u - .5) * width * scale * flip, y = (v - .5) * height * scale;
        return { x:centerX + x*cos - y*sin, y:centerY + x*sin + y*cos };
      },
      toImage(x, y) {
        const dx = x - centerX, dy = y - centerY;
        return { u:.5 + flip * (dx*cos + dy*sin)/(width*scale), v:.5 + (dy*cos - dx*sin)/(height*scale) };
      }
    };
  }

  function photo(ctx, state, image, rect, primary = false) {
    let radius = state.photo.radius;
    if (state.template === 'bloom') radius = Math.max(radius, 36);
    if (state.template === 'editorial') radius = Math.min(radius, 12);
    if (state.template === 'bold') radius = Math.min(radius, 10);
    const dark = !lightColor(state.background);
    const baseFill = dark ? rgba('#ffffff', 0.055) : rgba('#ffffff', state.template === 'minimal' ? 0.55 : 0.72);
    const frame = state.design?.photoFrame || templates[state.template].frame;
    const shadow = state.design?.shadow || templates[state.template].shadow;
    ctx.save();
    if (shadow === 'deep' || shadow === 'soft') {
      ctx.shadowColor = rgba('#000000', shadow === 'deep' ? .32 : .16);
      ctx.shadowBlur = shadow === 'deep' ? 44 : 24;
      ctx.shadowOffsetY = shadow === 'deep' ? 18 : 10;
    } else if (!shadow && (state.template === 'noir' || state.template === 'neon')) {
      ctx.shadowColor = rgba(state.accent, state.template === 'neon' ? 0.24 : 0.14);
      ctx.shadowBlur = state.template === 'neon' ? 32 : 24;
      ctx.shadowOffsetY = 8;
    } else if (!shadow) {
      ctx.shadowColor = rgba(dark ? '#000000' : state.textColor, dark ? 0.34 : 0.12);
      ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
    }
    if (frame === 'mat') box(ctx, rect.x - 10, rect.y - 10, rect.width + 20, rect.height + 20, radius + 8, dark ? '#f8f2e8' : '#ffffff');
    box(ctx, rect.x, rect.y, rect.width, rect.height, radius, baseFill);
    ctx.restore();
    ctx.save(); path(ctx, rect.x, rect.y, rect.width, rect.height, radius); ctx.clip();
    let photoScale;
    if (image && (image.naturalWidth || image.width) > 0 && (image.naturalHeight || image.height) > 0) {
      const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
      const placement = photoPlacement(state.photo, image, rect);
      const { centerX, centerY, angle: radians } = placement;
      photoScale = placement.scale;
      const { brightness, contrast, saturation, warmth, blur } = state.photo;
      let filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      if (warmth) filter += ` sepia(${warmth}%)`;
      // Canvas filters operate in output pixels, independently of the drawing transform.
      if (blur) filter += ` blur(${blur * ctx.canvas.width / formats[state.format].width}px)`;
      const drawnWidth = width * photoScale, drawnHeight = height * photoScale;
      const drawProduct = () => {
        ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(radians); ctx.scale(state.photo.flip ? -1 : 1, 1);
        ctx.filter = filter; ctx.drawImage(image, -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight); ctx.restore();
      };
      if (shadow !== 'none') contactShadow(ctx, silhouette(image, width, height), centerX, centerY, drawnWidth, drawnHeight, radians, state.photo.flip);
      drawProduct();
      const a = primary && state.annotations;
      if (a?.lens) {
        const r = Math.min(rect.width, rect.height) * .18, pad = r + 3;
        const { x, y } = placement.toFrame(a.x / 100, a.y / 100);
        const cx = Math.min(rect.x + rect.width - pad, Math.max(rect.x + pad, x));
        const cy = Math.min(rect.y + rect.height - pad, Math.max(rect.y + pad, y));
        ctx.save(); circle(ctx, cx, cy, r, state.background); ctx.clip();
        ctx.translate(cx, cy); ctx.scale(2, 2); ctx.translate(-x, -y); drawProduct(); ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = state.accent; ctx.lineWidth = 2; ctx.stroke();
      }
    } else {
      circle(ctx, rect.x + rect.width / 2, rect.y + rect.height / 2 - 25, 30, rgba(state.accent, 0.15));
      label(ctx, state, '+', rect.x + rect.width / 2 - 13, rect.y + rect.height / 2 - 45, state.accent, 38);
      fitText(ctx, state, 'Добавьте фотографию товара', { x: rect.x + 20, y: rect.y + rect.height / 2 + 20, width: rect.width - 40, height: 58 }, { size: 24, align: 'center', color: rgba(state.textColor, 0.6) });
    }
    if (primary && state.annotations?.dimension) dimensionLine(ctx, state, rect, state.annotations);
    ctx.restore();
    // Crisp architectural rim around every photo window
    ctx.lineWidth = 1.25;
    box(ctx, rect.x, rect.y, rect.width, rect.height, radius, null, dark ? rgba('#ffffff', 0.14) : rgba(state.textColor, 0.08));
    if (frame === 'line') {
      ctx.lineWidth = 1.8;
      box(ctx, rect.x - 4, rect.y - 4, rect.width + 8, rect.height + 8, radius + 4, null, rgba(state.accent, .58));
    } else if (!frame && ['neon', 'noir', 'bold'].includes(state.template)) {
      ctx.lineWidth = state.template === 'bold' ? 2.5 : 1.5;
      box(ctx, rect.x - 5, rect.y - 5, rect.width + 10, rect.height + 10, radius + 4, null, rgba(state.template === 'bold' ? state.textColor : state.accent, 0.55));
    }
    return photoScale;
  }

  // Every selected view is visible. Compact frames use a horizontal filmstrip;
  // taller frames reserve a bottom strip while keeping the primary frame draggable.
  function photoGallery(ctx, state, assets, frame) {
    const supplied = Array.isArray(assets.photos) ? assets.photos.filter(Boolean).slice(0, 3) : [];
    const primary = assets.photo || supplied[0];
    const extra = supplied.filter(image => image !== primary).slice(0, 2);
    let main = frame;
    const secondary = [];
    if (extra.length) {
      const gap = 18;
      if (frame.height >= 240) {
        const stripHeight = Math.min(130, frame.height * 0.25);
        main = { ...frame, height: frame.height - stripHeight - gap };
        const width = (frame.width - gap * (extra.length - 1)) / extra.length;
        extra.forEach((image, index) => secondary.push({ x: frame.x + index * (width + gap), y: main.y + main.height + gap, width, height: stripHeight }));
      } else {
        const mainWidth = frame.width * 0.6;
        main = { ...frame, width: mainWidth };
        const width = (frame.width - mainWidth - gap * extra.length) / extra.length;
        extra.forEach((image, index) => secondary.push({ x: frame.x + mainWidth + gap + index * (width + gap), y: frame.y, width, height: frame.height }));
      }
    }
    const photoScale = photo(ctx, state, primary, main, true);
    badge(ctx, state, main);
    const neutral = { ...state, photo: { ...state.photo, zoom: 1, x: 50, y: 50, rotation: 0, flip: false, warmth: 0, blur: 0 } };
    extra.forEach((image, index) => photo(ctx, neutral, image, secondary[index]));
    return { photoRect: main, photoRects: [main, ...secondary], photoScale };
  }

  const money = value => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₸`;
  function price(ctx, state, rect, options = {}) {
    if (!state.showPrice) return;
    const value = state.price === null ? 'Цена по запросу' : money(state.price);
    const tplStyle = templates[state.template].priceStyle;
    const style = state.design?.priceStyle || (options.plain ? 'plain' : (tplStyle || 'filled'));
    const filled = style === 'filled' || style === 'pill';
    const fill = filled ? (['bold', 'minimal'].includes(state.template) ? state.textColor : state.accent) : null;
    const color = fill ? (lightColor(fill) ? '#17201a' : '#ffffff') : state.textColor;
    const radius = style === 'pill' ? rect.height / 2 : ['bold', 'blueprint'].includes(state.template) ? 8 : 16;
    if (fill) {
      ctx.save();
      ctx.shadowColor = rgba(fill, 0.25); ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      box(ctx, rect.x, rect.y, rect.width, rect.height, radius, fill);
      ctx.restore();
      // Subtle top specular hairline on filled price pills
      ctx.lineWidth = 1;
      box(ctx, rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1, Math.max(0, radius - 0.5), null, rgba('#ffffff', 0.2));
    }
    if (style === 'outline') {
      ctx.lineWidth = 2;
      box(ctx, rect.x, rect.y, rect.width, rect.height, 14, rgba(state.accent, 0.08), state.accent);
    }
    const inset = style === 'plain' ? 0 : style === 'pill' ? 30 : 20;
    const oldHeight = state.oldPrice !== null ? 26 : 0;
    if (state.oldPrice !== null) {
      let oldSize = 17;
      const old = money(state.oldPrice);
      font(ctx, state, oldSize, 500);
      while (ctx.measureText(old).width > rect.width - inset * 2 && oldSize > 12) { oldSize -= 1; font(ctx, state, oldSize, 500); }
      const oldWidth = ctx.measureText(old).width;
      const x = rect.x + inset, y = rect.y + (style === 'pill' ? 14 : 11);
      ctx.fillStyle = rgba(color, 0.72); ctx.textBaseline = 'top'; ctx.fillText(old, x, y);
      line(ctx, x, y + oldSize * 0.55, x + oldWidth, y + oldSize * 0.55, rgba(color, 0.8), 1.4);
    }
    fitText(ctx, state, value, { x: rect.x + inset, y: rect.y + oldHeight + (inset ? 10 : 4), width: rect.width - inset * 2, height: rect.height - oldHeight - (inset ? 18 : 6) }, { size: options.size || 38, minSize: 17, weight: 800, align: 'left', color, verticalCenter: true });
  }
  function features(ctx, state, rect, vertical = false, hitAreas = [], size = 19) {
    if (!state.features.length) return;
    const tplStyle = templates[state.template].featureStyle;
    const style = state.design?.featureStyle || (vertical ? (tplStyle === 'numbered' ? 'numbered' : 'bullets') : (tplStyle || 'chips'));
    const count = state.features.length, gap = 12;
    const width = vertical ? rect.width : (rect.width - gap * (count - 1)) / count;
    const step = vertical ? rect.height / count : rect.height;
    const dark = !lightColor(state.background);
    state.features.forEach((feature, index) => {
      const x = rect.x + (vertical ? 0 : index * (width + gap));
      const y = rect.y + (vertical ? index * step : 0);
      const marker = style === 'numbered' ? 36 : style === 'bullets' ? 20 : style === 'accent' ? 14 : 0;
      const inset = style === 'chips' ? 14 : style === 'accent' ? 10 : 0;
      const pad = style === 'chips' ? Math.min(8, step * .16) : Math.min(4, step * .1);
      if (style === 'chips') {
        const h = step - (vertical ? 6 : 0);
        ctx.lineWidth = 1;
        box(ctx, x, y, width, h, 12,
          dark ? rgba('#ffffff', 0.065) : rgba(state.textColor, 0.045),
          dark ? rgba('#ffffff', 0.12) : rgba(state.textColor, 0.1));
        if (!vertical) box(ctx, x + 14, y + 6, 22, 3, 2, rgba(state.accent, 0.85));
      } else if (style === 'accent') {
        const h = step - (vertical ? 8 : 0);
        box(ctx, x, y + 2, width, h - 4, 10, dark ? rgba('#ffffff', 0.04) : rgba(state.textColor, 0.03));
        box(ctx, x, y + 8, 4, Math.max(14, h - 16), 2, state.accent);
      } else if (style === 'bullets') {
        circle(ctx, x + 6, y + Math.min(18, step / 2), 4, state.accent);
      } else if (style === 'numbered') {
        const ny = y + Math.max(2, (step - 24) / 2);
        box(ctx, x, ny, 28, 22, 6, rgba(state.accent, dark ? 0.22 : 0.14));
        label(ctx, state, String(index + 1).padStart(2, '0'), x + 5, ny + 4, state.accent, 13);
      }
      const topExtra = style === 'chips' && !vertical ? 5 : 0;
      const area = { x: x + inset + marker, y: y + pad + topExtra, width: width - 2 * inset - marker, height: Math.max(12, step - 2 * pad - topExtra - (vertical ? 2 : 0)) };
      const { fontSize } = fitText(ctx, state, feature, area, { size, minSize: vertical ? 13 : 12, weight: 600, align: vertical || marker || style === 'chips' ? 'left' : 'center', verticalCenter: style !== 'bullets' });
      hitAreas.push({ field: 'feature-' + (index + 1), ...area, fontSize });
    });
  }
  function badge(ctx, state, rect) {
    const discount = state.showPrice && state.oldPrice !== null ? `−${Math.max(1, Math.round((1 - state.price / state.oldPrice) * 100))}%` : '';
    if (!state.badge && !discount) return;
    const y = rect.y + 18;
    let x = rect.x + 18;
    if (discount) {
      const result = pill(ctx, state, discount, x, y, 148, state.accent, lightColor(state.accent) ? '#17201a' : '#ffffff', 20);
      x += result.width + 10;
    }
    if (state.badge) {
      const bg = lightColor(state.textColor) ? '#14171a' : state.textColor;
      const fg = '#ffffff';
      pill(ctx, state, state.badge, x, y, rect.width - (x - rect.x) - 18, rgba(bg, 0.9), fg, 16, rgba('#ffffff', 0.22));
    }
  }

  const titleWeight = (state, fallback) => ({ medium: 550, bold: 750, heavy: 900 })[state.design?.titleWeight || templates[state.template].titleWeight] || fallback;
  function titleText(state, defaultUpper = false) {
    const tplCase = templates[state.template].titleCase;
    const upper = state.design?.titleCase ? state.design.titleCase === 'upper' : (tplCase ? tplCase === 'upper' : defaultUpper);
    return upper ? state.title.toLocaleUpperCase('ru-RU') : state.title;
  }
  function stackedLayout(ctx, state, assets, height, photoFirst = false) {
    const hitAreas = [];
    const isSquare = height === 900, isStory = height === 1600;
    const padding = 54, width = 792;
    const titleHeight = isSquare ? 139 : isStory ? 214 : 173;
    const subtitleHeight = isSquare ? 52 : 69;
    const descHeight = state.description ? (isSquare ? 72 : 78) : 0;
    const featureHeight = state.features.length ? (isSquare ? 68 : 72) : 0;
    const priceHeight = state.showPrice ? (state.oldPrice !== null ? 91 : 72) : 0;
    const footerHeight = descHeight + featureHeight + priceHeight + (state.description ? 16 : 0) + (state.features.length ? 16 : 0);
    const photoBottom = height - 54 - footerHeight - 20;
    const titleSize = state.template === 'bold' ? (isSquare ? 58 : 74) : state.template === 'minimal' ? 54 : isStory ? 72 : 62;
    const title = titleText(state, ['bold', 'neon'].includes(state.template));
    const titleOptions = { size: titleSize, minSize: 30, weight: titleWeight(state, state.template === 'bold' ? 900 : 750), spacing: 1.07 };
    const subtitleOptions = { size: 22, minSize: 16, weight: 500, color: rgba(state.textColor, 0.72) };
    const titleBox = { x: padding, y: 112, width, height: titleHeight };
    const subtitleBox = { x: padding, y: 0, width, height: subtitleHeight };
    if (photoFirst) {
      const titleUsed = fitText(ctx, state, title, titleBox, { ...titleOptions, measureOnly: true }).height;
      const subtitleUsed = fitText(ctx, state, state.subtitle, subtitleBox, { ...subtitleOptions, measureOnly: true }).height;
      titleBox.y = photoBottom - titleUsed - (subtitleUsed ? subtitleUsed + 12 : 0);
    }
    const titleY = titleBox.y;
    const { height: titleUsed, fontSize: titleFontSize } = fitText(ctx, state, title, titleBox, titleOptions);
    hitAreas.push({ field: 'product-name', x: padding, y: titleY, width, height: titleUsed });
    const subtitleY = titleY + titleUsed + 12;
    const subtitleUsed = fitText(ctx, state, state.subtitle, { ...subtitleBox, y: subtitleY }, subtitleOptions).height;
    if (state.subtitle) hitAreas.push({ field: 'product-subtitle', x: padding, y: subtitleY, width, height: subtitleUsed });
    const top = photoFirst ? 108 : subtitleY + subtitleUsed + 20;
    const frameBottom = photoFirst ? titleY - 22 : photoBottom;
    let photoRect = { x: padding, y: top, width, height: Math.max(140, frameBottom - top) };
    if (state.template === 'minimal') photoRect = { ...photoRect, x: 76, width: 748 };
    if (state.template === 'bloom') photoRect = { ...photoRect, x: 66, width: 768 };
    if (state.template === 'accent') {
      box(ctx, photoRect.x - 10, photoRect.y + 12, photoRect.width, photoRect.height, 26, rgba(state.accent, 0.2));
    }
    const gallery = photoGallery(ctx, state, assets, photoRect);
    let y = photoBottom + 20;
    if (state.description) {
      const area = { x: padding, y, width, height: descHeight };
      const { fontSize } = fitText(ctx, state, state.description, area, { size: 22, minSize: 15, weight: 500, color: rgba(state.textColor, 0.78) });
      hitAreas.push({ field: 'product-description', ...area, fontSize });
      y += descHeight + 16;
    }
    if (state.features.length) {
      features(ctx, state, { x: padding, y, width, height: featureHeight }, false, hitAreas); y += featureHeight + 16;
    }
    if (state.showPrice) {
      const priceWidth = state.oldPrice !== null || state.price !== null && state.price >= 1000000 ? 395 : 335;
      // Subtle architectural balance accent bar left of the price block
      const barW = Math.max(40, width - priceWidth - 36);
      line(ctx, padding, y + priceHeight / 2, padding + barW, y + priceHeight / 2, rgba(state.textColor, 0.14), 1.2);
      box(ctx, padding, y + priceHeight / 2 - 2, 32, 4, 2, state.accent);
      hitAreas.push({ field: 'product-price', x: padding + width - priceWidth, y, width: priceWidth, height: priceHeight });
      price(ctx, state, { x: padding + width - priceWidth, y, width: priceWidth, height: priceHeight }, { plain: state.template === 'minimal', size: state.template === 'bold' ? 44 : 38 });
    }
    return { ...gallery, hitAreas, titleFontSize };
  }

  function editorialLayout(ctx, state, assets, height, photoLeft = false) {
    const hitAreas = [];
    const square = height === 900, story = height === 1600;
    const leftWidth = 348, photoWidth = 424;
    const x = photoLeft ? 498 : 54;
    const photoX = photoLeft ? 54 : 422;
    const titleY = 120, titleHeight = square ? 221 : story ? 345 : 285;
    const { height: titleUsed, fontSize: titleFontSize } = fitText(ctx, state, titleText(state), { x, y: titleY, width: leftWidth, height: titleHeight }, { size: story ? 64 : 56, minSize: 26, weight: titleWeight(state, 800), spacing: 1.07, wholeWords: true });
    hitAreas.push({ field: 'product-name', x, y: titleY, width: leftWidth, height: titleUsed });
    let y = titleY + titleUsed + 20;
    if (state.subtitle) {
      const { height: used } = fitText(ctx, state, state.subtitle, { x, y, width: leftWidth, height: square ? 84 : 111 }, { size: 22, minSize: 15, weight: 600, align: 'left', color: rgba(state.textColor, 0.78) });
      hitAreas.push({ field: 'product-subtitle', x, y, width: leftWidth, height: used });
      y += used + 20;
    }
    box(ctx, x, y, 52, 4, 2, state.accent); y += 22;
    const priceHeight = state.showPrice ? state.oldPrice !== null ? 105 : 84 : 0;
    const footerY = height - 58 - priceHeight;
    const descriptionHeight = state.description ? square ? 121 : 154 : 0;
    const featureHeight = state.features.length ? square ? 116 : 152 : 0;
    // The description and features flex to the actual space below the title.
    const available = Math.max(100, footerY - y - 24);
    const needed = descriptionHeight + featureHeight + (state.description && state.features.length ? 24 : 0);
    const compression = needed ? Math.min(1, available / needed) : 1;
    if (state.description) {
      const h = descriptionHeight * compression;
      const area = { x, y, width: leftWidth, height: h };
      const { fontSize } = fitText(ctx, state, state.description, area, { size: 21, minSize: 13, weight: 500, color: rgba(state.textColor, 0.76), align: 'left' });
      hitAreas.push({ field: 'product-description', ...area, fontSize });
      y += h + (state.features.length ? 24 * compression : 0);
    }
    if (state.features.length) features(ctx, state, { x, y, width: leftWidth, height: featureHeight * compression }, true, hitAreas);
    if (state.showPrice) hitAreas.push({ field: 'product-price', x, y: footerY, width: leftWidth, height: priceHeight });
    if (state.showPrice) price(ctx, state, { x, y: footerY, width: leftWidth, height: priceHeight }, { plain: templates[state.template].priceStyle === 'plain', size: 39 });
    // Keep photo frame at a balanced gallery proportion (3:4 to 5:7) instead of overly narrow slices
    const colTop = 120, colHeight = height - 178;
    const photoHeight = square ? Math.min(colHeight, 560) : story ? Math.min(colHeight, 820) : Math.min(colHeight, 620);
    const photoY = colTop + Math.round((colHeight - photoHeight) * 0.42);
    // Subtle magazine framing hairlines above and below the photo plate
    line(ctx, photoX, colTop + 2, photoX + photoWidth, colTop + 2, rgba(state.textColor, 0.14), 1);
    line(ctx, photoX, height - 60, photoX + photoWidth, height - 60, rgba(state.textColor, 0.14), 1);
    box(ctx, photoX + photoWidth - 36, height - 62, 36, 4, 2, state.accent);
    const photoRect = { x: photoX, y: photoY, width: photoWidth, height: photoHeight };
    const gallery = photoGallery(ctx, state, assets, photoRect);
    return { ...gallery, hitAreas, titleFontSize };
  }

  // Purpose controls composition; template continues to control colour and surface styling.
  function purposeLayout(ctx, state, assets, height) {
    const hitAreas = [], photoRects = [];
    let photoScale;
    const area = (field, value, rect, options = {}) => {
      if (!value) return;
      const metrics = fitText(ctx, state, value, rect, options);
      hitAreas.push({ field, ...rect, height: options.compact ? metrics.height : rect.height, fontSize: metrics.fontSize });
      return metrics;
    };
    label(ctx, state, purposes[state.purpose].label.toLocaleUpperCase('ru-RU'), 54, 103, state.accent, 19);
    const title = area('product-name', state.title, { x: 54, y: 135, width: 792, height: 120 },
      { size: 57, weight: titleWeight(state, 850), spacing: 1.08, compact: true });
    const subtitleY = 135 + title.height + 13;
    const subtitle = area('product-subtitle', state.subtitle, { x: 54, y: subtitleY, width: 792, height: 62 },
      { size: 27, weight: 500, compact: true });
    const top = subtitleY + (subtitle?.height || 0) + 20;
    const priceHeight = state.showPrice ? (state.oldPrice === null ? 74 : 91) : 0;
    const footer = height - 48 - priceHeight;
    const descriptionHeight = state.description ? 74 : 0;
    const descriptionY = footer - descriptionHeight - (priceHeight && descriptionHeight ? 15 : 0);
    const bottom = descriptionY - 18;
    const bodyHeight = bottom - top;
    const primary = assets.photo || (Array.isArray(assets.photos) ? assets.photos[0] : null);
    const extra = (Array.isArray(assets.photos) ? assets.photos : []).filter(image => image && image !== primary).slice(0, 2);
    const drawPhoto = (image, rect, main = false) => {
      if (main && extra.length && state.purpose !== 'contents') {
        const gallery = photoGallery(ctx, state, assets, rect);
        photoRects.push(...gallery.photoRects);
        photoScale = gallery.photoScale;
        return;
      }
      const photoState = main ? state : { ...state, photo: { ...state.photo, zoom: 1, x: 50, y: 50, rotation: 0, flip: false, warmth: 0, blur: 0 } };
      const frame = snugFrame(image, rect, photoState.photo);
      const scale = photo(ctx, photoState, image, frame, main);
      photoRects.push(frame);
      if (main) {
        photoScale = scale;
        badge(ctx, state, frame);
      }
    };
    const rows = (rect, mode) => {
      if (state.design?.featureStyle) {
        features(ctx, state, rect, true, hitAreas, 29);
        return;
      }
      const count = Math.max(1, state.features.length);
      const step = rect.height / count;
      state.features.forEach((value, index) => {
        const y = rect.y + step * index;
        const numberWidth = mode === 'steps' ? 56 : 24;
        if (mode === 'steps') {
          circle(ctx, rect.x + 20, y + 26, 20, state.accent);
          label(ctx, state, String(index + 1), rect.x + 14, y + 15, lightColor(state.accent) ? '#17231b' : '#ffffff', 21);
        } else if (mode === 'specs') {
          line(ctx, rect.x, y + step - 5, rect.x + rect.width, y + step - 5, rgba(state.textColor, 0.18));
          label(ctx, state, String(index + 1).padStart(2, '0'), rect.x, y + 12, state.accent, 13);
        } else circle(ctx, rect.x + 6, y + 23, 5, state.accent);
        area('feature-' + (index + 1), value, { x: rect.x + numberWidth, y: y + 7, width: rect.width - numberWidth, height: step - 14 }, { size: 33, minSize: 19, align: 'left', verticalCenter: true });
      });
    };
    if (state.purpose === 'contents') {
      const rowHeight = state.features.length ? Math.min(116, bodyHeight * 0.28) : 0;
      const collageHeight = bodyHeight - (rowHeight ? rowHeight + 18 : 0);
      drawPhoto(primary, { x: 54, y: top, width: extra.length ? 510 : 792, height: collageHeight }, true);
      extra.forEach((image, index) => drawPhoto(image, { x: 588, y: top + index * (collageHeight + 18) / extra.length, width: 258, height: (collageHeight - 18 * (extra.length - 1)) / extra.length }));
      if (state.features.length) {
        const y = top + collageHeight + 18;
        if (state.design?.featureStyle) features(ctx, state, { x: 54, y, width: 792, height: rowHeight }, false, hitAreas, 29);
        else {
          const width = (792 - (state.features.length - 1) * 18) / state.features.length;
          state.features.forEach((value, index) => {
            const x = 54 + index * (width + 18);
            box(ctx, x, y, width, rowHeight, 14, rgba(state.textColor, 0.07));
            area('feature-' + (index + 1), value, { x: x + 14, y: y + 8, width: width - 28, height: rowHeight - 16 },
              { size: 29, minSize: 17, align: 'left', verticalCenter: true });
          });
        }
      }
    } else if (!state.features.length) {
      drawPhoto(primary, { x: 54, y: top, width: 792, height: bodyHeight }, true);
    } else if (state.purpose === 'instructions' && height > 900) {
      const imageHeight = bodyHeight * 0.55;
      drawPhoto(primary, { x: 54, y: top, width: 792, height: imageHeight }, true);
      rows({ x: 54, y: top + imageHeight + 14, width: 792, height: bodyHeight - imageHeight - 14 }, 'steps');
    } else {
      const mode = state.purpose === 'instructions' ? 'steps' : state.purpose === 'advantages' ? 'features' : 'specs';
      drawPhoto(primary, { x: 54, y: top, width: 416, height: bodyHeight }, true);
      const listHeight = Math.min(bodyHeight, state.features.length * 120 + 24);
      const listTop = top + (bodyHeight - listHeight) / 2;
      box(ctx, 492, listTop, 354, listHeight, 18, rgba(state.textColor, 0.07));
      rows({ x: 506, y: listTop + 12, width: 326, height: listHeight - 24 }, mode);
    }
    area('product-description', state.description, { x: 54, y: descriptionY, width: 792, height: descriptionHeight }, { size: 27, minSize: 18, weight: 500 });
    if (state.showPrice) {
      const rect = { x: 451, y: footer, width: 395, height: priceHeight };
      price(ctx, state, rect);
      hitAreas.push({ field: 'product-price', ...rect });
    }
    return { photoRect: photoRects[0], photoRects, photoScale, hitAreas, titleFontSize: title.fontSize };
  }

  function snugFrame(image, rect, settings) {
    if (!image || settings.fit === 'cover') return rect;
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (!(width > 0 && height > 0)) return rect;
    const angle = settings.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
    const ratio = Math.max(0.45, Math.min(2.5, (width * cos + height * sin) / (width * sin + height * cos)));
    const frameWidth = Math.min(rect.width, rect.height * ratio);
    const frameHeight = frameWidth / ratio;
    return { x: rect.x + (rect.width - frameWidth) / 2, y: rect.y + (rect.height - frameHeight) / 2, width: frameWidth, height: frameHeight };
  }

  function render(canvas, input, assets = {}, options = {}) {
    const state = normalize(input);
    if (!state.title) state.title = 'Название вашего товара';
    const format = formats[state.format];
    const scale = clamp(options.scale, 0.1, 4, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D недоступен.');
    canvas.width = Math.round(format.width * scale); canvas.height = Math.round(format.height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, format.width, format.height);
    ctx.save();
    background(ctx, state, format.height);
    brand(ctx, state, assets);
    const composition = state.design?.layout || templates[state.template].layout || (state.template === 'editorial' ? 'editorial' : 'stacked');
    const layout = state.purpose === 'cover'
      ? (['editorial', 'photo-left'].includes(composition)
        ? editorialLayout(ctx, state, assets, format.height, composition === 'photo-left')
        : stackedLayout(ctx, state, assets, format.height, composition === 'photo-first'))
      : purposeLayout(ctx, state, assets, format.height);
    ctx.restore();
    let titleContrast;
    // Measure Minimal's solid title background. Other templates can vary under the letters.
    if (state.design?.backdrop === 'solid' || (state.template === 'minimal' && !state.design?.backdrop)) {
      titleContrast = contrastRatio(state.textColor, state.background);
    }
    return { ...layout, photoRects: layout.photoRects || [layout.photoRect], hitAreas: layout.hitAreas || [], width: format.width, height: format.height, titleContrast };
  }
  function compareTypeSizes(original, translation) {
    const metrics = layout => new Map([['product-name', layout.titleFontSize],
      ...layout.hitAreas.filter(area => /^feature-[1-3]$/.test(area.field)).map(area => [area.field, area.fontSize])]);
    const ru = metrics(original);
    return [...metrics(translation)].filter(([field, size]) => size > 0 && size < ru.get(field) * .8)
      .map(([field, size]) => ({ field, reduction: Math.round((1 - size / ru.get(field)) * 100) }));
  }
  const templateTone = key => lightColor(templates[key].background) ? 'light' : 'dark';
  root.SATUCARD_RENDERER = { templates, fonts, formats, purposes, categories, designChoices, templateTone, contrastRatio, lightColor, normalize, render, compareTypeSizes, photoPlacement };
})();
