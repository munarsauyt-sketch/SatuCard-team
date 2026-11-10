'use strict';

// One renderer is shared by the live canvas, PNG export, and template thumbnails.
// Photos stay intact: these tools change framing and colour, not their background.
(() => {
  const root = typeof window === 'undefined' ? globalThis : window;
  const templates = {
    studio: { label: 'Студия', description: 'Мягкий свет и спокойный фон', background: '#e7ecdf', accent: '#4e6846', textColor: '#243322' },
    accent: { label: 'Терракота', description: 'Тёплый цвет и выразительные формы', background: '#f4b99f', accent: '#b63b28', textColor: '#42261d' },
    minimal: { label: 'Минимал', description: 'Чистая композиция для каталога', background: '#faf9f6', accent: '#697966', textColor: '#232b24' },
    noir: { label: 'Нуар', description: 'Тёмный фон и золотые детали', background: '#171a1b', accent: '#d8b675', textColor: '#f4ede0' },
    neon: { label: 'Неон', description: 'Светящиеся линии и цифровой ритм', background: '#071522', accent: '#45e5da', textColor: '#eaffff' },
    editorial: { label: 'Журнал', description: 'Крупная типографика и разворот', background: '#eee9df', accent: '#b44836', textColor: '#292720' },
    bloom: { label: 'Цветение', description: 'Пастельная палитра и мягкие круги', background: '#ece3f5', accent: '#8759bd', textColor: '#402c57' },
    bold: { label: 'Постер', description: 'Контраст, крупный текст и характер', background: '#f1f35b', accent: '#ed5d32', textColor: '#20221b' }
  };
  const formats = {
    portrait: { label: 'Пост · 4:5', width: 900, height: 1125, file: '4x5' },
    portrait34: { label: 'Маркетплейс · 3:4', width: 900, height: 1200, file: '3x4' },
    square: { label: 'Каталог · 1:1', width: 900, height: 900, file: '1x1' },
    story: { label: 'История · 9:16', width: 900, height: 1600, file: '9x16' }
  };
  const purposes = { cover: { label: 'Обложка' }, advantages: { label: 'Преимущества' }, specifications: { label: 'Характеристики' }, dimensions: { label: 'Размеры' }, contents: { label: 'Комплектация' }, instructions: { label: 'Инструкция' } };
  const categories = { generic: { label: 'Любой товар' }, electronics: { label: 'Электроника' }, clothing: { label: 'Одежда' }, beauty: { label: 'Красота' }, home: { label: 'Дом' } };
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
    return {
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
      font: source.font === 'dejavu' ? 'dejavu' : 'manrope',
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
  const fontFamily = state => state.font === 'dejavu' ? '"DejaVu Sans", Arial, sans-serif' : 'Manrope, Arial, sans-serif';
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
    let wrapped;
    // Long words, Cyrillic titles and every supplied feature must stay inside their box.
    for (;;) {
      font(ctx, state, size, weight);
      wrapped = lines(ctx, value, rect.width);
      if (wrapped.length * size * spacing <= rect.height || size <= 1) break;
      size -= size > minSize ? 0.5 : 0.25;
    }
    const height = wrapped.length * size * spacing;
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
  function label(ctx, state, value, x, y, color, size = 16) {
    font(ctx, state, size, 750); ctx.fillStyle = color || state.textColor; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(value, x, y);
  }
  function pill(ctx, state, value, x, y, maxWidth, fill, color, size = 18) {
    font(ctx, state, size, 750);
    while (ctx.measureText(value).width + 32 > maxWidth && size > 11) { size -= 0.5; font(ctx, state, size, 750); }
    const width = Math.min(maxWidth, ctx.measureText(value).width + 32);
    const height = size + 22;
    box(ctx, x, y, width, height, height / 2, fill);
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(value, x + 16, y + height / 2); ctx.textBaseline = 'top';
    return { width, height };
  }
  function brand(ctx, state, assets, y = 38) {
    if (!state.showBrand) return;
    let x = 54;
    const image = assets.logo;
    if (image && (image.naturalWidth || image.width) > 0) {
      const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
      const ratio = Math.min(40 / width, 40 / height);
      ctx.drawImage(image, x, y, width * ratio, height * ratio);
      x += 52;
    }
    fitText(ctx, state, state.brandName, { x, y: y + 4, width: 470, height: 32 }, { size: 22, minSize: 16, weight: 800, align: 'left' });
  }

  function background(ctx, state, height) {
    ctx.fillStyle = state.background; ctx.fillRect(0, 0, 900, height);
    const accent = state.accent;
    if (state.template === 'studio') {
      const gradient = ctx.createLinearGradient(0, 0, 900, height);
      gradient.addColorStop(0, rgba('#ffffff', 0.35)); gradient.addColorStop(1, rgba(accent, 0.12));
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 900, height);
      circle(ctx, 865, 220, 285, rgba(accent, 0.06));
      line(ctx, 54, 88, 846, 88, rgba(state.textColor, 0.16));
    } else if (state.template === 'accent') {
      circle(ctx, 800, height * 0.47, 390, rgba(accent, 0.18));
      circle(ctx, 80, height * 0.85, 280, rgba('#ffffff', 0.16));
      ctx.save(); ctx.translate(700, 140); ctx.rotate(-0.25); box(ctx, -150, -35, 310, 90, 12, rgba(accent, 0.13)); ctx.restore();
    } else if (state.template === 'minimal') {
      line(ctx, 54, 88, 846, 88, rgba(state.textColor, 0.2));
      line(ctx, 54, height - 42, 846, height - 42, rgba(state.textColor, 0.14));
    } else if (state.template === 'noir') {
      const gradient = ctx.createRadialGradient(450, height * 0.52, 40, 450, height * 0.52, 760);
      gradient.addColorStop(0, rgba(accent, 0.15)); gradient.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 900, height);
      box(ctx, 24, 24, 852, height - 48, 1, null, rgba(accent, 0.4));
      line(ctx, 54, 88, 846, 88, rgba(accent, 0.42));
    } else if (state.template === 'neon') {
      const gradient = ctx.createRadialGradient(680, height * 0.48, 20, 540, height * 0.48, 690);
      gradient.addColorStop(0, rgba(accent, 0.15)); gradient.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 900, height);
      for (let x = 0; x <= 900; x += 60) line(ctx, x, 0, x, height, rgba(accent, 0.06));
      for (let y = 0; y <= height; y += 60) line(ctx, 0, y, 900, y, rgba(accent, 0.06));
      line(ctx, 54, 88, 846, 88, rgba(accent, 0.55), 2);
      box(ctx, 825, 23, 13, 13, 2, accent); box(ctx, 845, 23, 13, 13, 2, rgba(accent, 0.4));
    } else if (state.template === 'editorial') {
      ctx.fillStyle = rgba(accent, 0.09); ctx.fillRect(450, 0, 450, height);
      line(ctx, 54, 88, 846, 88, state.textColor, 2);
    } else if (state.template === 'bloom') {
      circle(ctx, 910, 190, 310, rgba(accent, 0.12));
      circle(ctx, 35, height * 0.75, 320, rgba('#ffffff', 0.4));
      circle(ctx, 830, height - 70, 220, rgba('#d6b88d', 0.16));
      for (let index = 0; index < 5; index++) circle(ctx, 824 + Math.cos(index * Math.PI * 2 / 5) * 19, 43 + Math.sin(index * Math.PI * 2 / 5) * 19, 13, rgba(accent, 0.55));
      circle(ctx, 824, 43, 10, state.background);
    } else if (state.template === 'bold') {
      ctx.save(); ctx.translate(865, height - 310); ctx.rotate(-0.14);
      ctx.fillStyle = rgba(state.textColor, 0.08); ctx.fillRect(-500, -30, 850, 170); ctx.restore();
      ctx.fillStyle = state.textColor; ctx.fillRect(0, 0, 16, height);
      line(ctx, 54, 88, 846, 88, state.textColor, 3);
    }
  }

  function photo(ctx, state, image, rect) {
    let radius = state.photo.radius;
    if (state.template === 'bloom') radius = Math.max(radius, 42);
    if (state.template === 'editorial') radius = Math.min(radius, 8);
    const dark = !lightColor(state.background);
    const baseFill = dark ? rgba('#ffffff', 0.065) : rgba('#ffffff', state.template === 'minimal' ? 0.38 : 0.56);
    ctx.save();
    if (state.template === 'noir' || state.template === 'neon') {
      ctx.shadowColor = rgba(state.accent, state.template === 'neon' ? 0.3 : 0.15);
      ctx.shadowBlur = state.template === 'neon' ? 30 : 20;
    } else { ctx.shadowColor = rgba(state.textColor, 0.11); ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; }
    box(ctx, rect.x, rect.y, rect.width, rect.height, radius, baseFill);
    ctx.restore();
    ctx.save(); path(ctx, rect.x, rect.y, rect.width, rect.height, radius); ctx.clip();
    let photoScale;
    if (image && (image.naturalWidth || image.width) > 0 && (image.naturalHeight || image.height) > 0) {
      const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
      const radians = state.photo.rotation * Math.PI / 180;
      const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
      const rotatedWidth = width * cos + height * sin, rotatedHeight = width * sin + height * cos;
      // contain fits the rotated photo; cover covers the frame even after rotation.
      const base = state.photo.fit === 'cover' ? Math.max((rect.width * cos + rect.height * sin) / width, (rect.width * sin + rect.height * cos) / height)
        : Math.min(rect.width / rotatedWidth, rect.height / rotatedHeight);
      photoScale = base * state.photo.zoom;
      const centerX = rect.x + rect.width / 2 + (state.photo.x - 50) / 50 * rect.width * 0.35;
      const centerY = rect.y + rect.height / 2 + (state.photo.y - 50) / 50 * rect.height * 0.35;
      ctx.translate(centerX, centerY); ctx.rotate(radians); ctx.scale(state.photo.flip ? -1 : 1, 1);
      const { brightness, contrast, saturation, warmth, blur } = state.photo;
      let filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      if (warmth) filter += ` sepia(${warmth}%)`;
      // Canvas filters operate in output pixels, independently of the drawing transform.
      if (blur) filter += ` blur(${blur * ctx.canvas.width / formats[state.format].width}px)`;
      ctx.filter = filter;
      const drawnWidth = width * photoScale, drawnHeight = height * photoScale;
      ctx.drawImage(image, -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight);
    } else {
      circle(ctx, rect.x + rect.width / 2, rect.y + rect.height / 2 - 25, 30, rgba(state.accent, 0.15));
      label(ctx, state, '+', rect.x + rect.width / 2 - 13, rect.y + rect.height / 2 - 45, state.accent, 38);
      fitText(ctx, state, 'Добавьте фотографию товара', { x: rect.x + 20, y: rect.y + rect.height / 2 + 20, width: rect.width - 40, height: 58 }, { size: 24, align: 'center', color: rgba(state.textColor, 0.6) });
    }
    ctx.restore();
    if (['neon', 'noir', 'bold'].includes(state.template)) {
      ctx.lineWidth = state.template === 'bold' ? 3 : 1.5;
      box(ctx, rect.x - 6, rect.y - 6, rect.width + 12, rect.height + 12, radius + 4, null, rgba(state.template === 'bold' ? state.textColor : state.accent, 0.68));
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
    const photoScale = photo(ctx, state, primary, main);
    badge(ctx, state, main);
    const neutral = { ...state, photo: { ...state.photo, zoom: 1, x: 50, y: 50, rotation: 0, flip: false, warmth: 0, blur: 0 } };
    extra.forEach((image, index) => photo(ctx, neutral, image, secondary[index]));
    return { photoRect: main, photoRects: [main, ...secondary], photoScale };
  }

  const money = value => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₸`;
  function price(ctx, state, rect, options = {}) {
    if (!state.showPrice) return;
    const value = state.price === null ? 'Цена по запросу' : money(state.price);
    const fill = options.plain ? null : state.template === 'bold' || state.template === 'minimal' ? state.textColor : state.accent;
    const color = fill ? (lightColor(fill) ? '#17231b' : '#ffffff') : state.textColor;
    if (fill) box(ctx, rect.x, rect.y, rect.width, rect.height, state.template === 'bold' ? 8 : 18, fill);
    const inset = fill ? 20 : 0;
    const oldHeight = state.oldPrice !== null ? 26 : 0;
    if (state.oldPrice !== null) {
      let oldSize = 18;
      const old = money(state.oldPrice);
      font(ctx, state, oldSize, 500);
      while (ctx.measureText(old).width > rect.width - inset * 2 && oldSize > 12) { oldSize -= 1; font(ctx, state, oldSize, 500); }
      const oldWidth = ctx.measureText(old).width;
      const x = rect.x + inset, y = rect.y + 13;
      ctx.fillStyle = rgba(color, 0.72); ctx.textBaseline = 'top'; ctx.fillText(old, x, y);
      line(ctx, x, y + oldSize * 0.55, x + oldWidth, y + oldSize * 0.55, rgba(color, 0.8), 1.4);
    }
    fitText(ctx, state, value, { x: rect.x + inset, y: rect.y + oldHeight + (fill ? 11 : 4), width: rect.width - inset * 2, height: rect.height - oldHeight - (fill ? 20 : 6) }, { size: options.size || 38, minSize: 17, weight: 850, align: 'left', color, verticalCenter: true });
  }
  function features(ctx, state, rect, vertical = false, hitAreas = []) {
    if (!state.features.length) return;
    if (vertical) {
      const step = rect.height / state.features.length;
      state.features.forEach((feature, index) => {
        const area = { x: rect.x + 22, y: rect.y + index * step + 3, width: rect.width - 22, height: step - 7 };
        circle(ctx, rect.x + 7, rect.y + index * step + 15, 4, state.accent);
        const { fontSize } = fitText(ctx, state, feature, area, { size: 19, minSize: 13, weight: 650, align: 'left' });
        hitAreas.push({ field: 'feature-' + (index + 1), ...area, fontSize });
      });
    } else {
      const gap = 10, width = (rect.width - gap * (state.features.length - 1)) / state.features.length;
      state.features.forEach((feature, index) => {
        const x = rect.x + index * (width + gap);
        const area = { x: x + 15, y: rect.y + 9, width: width - 30, height: rect.height - 18 };
        box(ctx, x, rect.y, width, rect.height, 12, rgba(state.textColor, lightColor(state.background) ? 0.055 : 0.075));
        const { fontSize } = fitText(ctx, state, feature, area, { size: 19, minSize: 12, weight: 650, align: 'center', verticalCenter: true });
        hitAreas.push({ field: 'feature-' + (index + 1), ...area, fontSize });
      });
    }
  }
  function badge(ctx, state, rect) {
    const discount = state.showPrice && state.oldPrice !== null ? `−${Math.max(1, Math.round((1 - state.price / state.oldPrice) * 100))}%` : '';
    if (!state.badge && !discount) return;
    const y = rect.y + 18;
    let x = rect.x + 18;
    if (discount) {
      const result = pill(ctx, state, discount, x, y, 140, state.accent, lightColor(state.accent) ? '#17231b' : '#ffffff', 22);
      x += result.width + 10;
    }
    if (state.badge) pill(ctx, state, state.badge, x, y, rect.width - (x - rect.x) - 18, state.textColor, lightColor(state.textColor) ? '#17231b' : '#ffffff', 16);
  }

  function stackedLayout(ctx, state, assets, height) {
    const hitAreas = [];
    const isSquare = height === 900, isStory = height === 1600;
    const padding = 54, width = 792;
    const titleY = 115;
    const titleHeight = isSquare ? 139 : isStory ? 214 : 173;
    const titleSize = state.template === 'bold' ? (isSquare ? 59 : 78) : state.template === 'minimal' ? 56 : isStory ? 75 : 64;
    const title = state.template === 'bold' || state.template === 'neon' ? state.title.toLocaleUpperCase('ru-RU') : state.title;
    const { height: titleUsed, fontSize: titleFontSize } = fitText(ctx, state, title, { x: padding, y: titleY, width, height: titleHeight }, { size: titleSize, minSize: 30, weight: state.template === 'bold' ? 900 : 800, spacing: 1.08 });
    hitAreas.push({ field: 'product-name', x: padding, y: titleY, width, height: titleUsed });
    const subtitleY = titleY + titleUsed + 13;
    const subtitleUsed = fitText(ctx, state, state.subtitle, { x: padding, y: subtitleY, width, height: isSquare ? 52 : 69 }, { size: 23, minSize: 17, weight: 500, color: rgba(state.textColor, 0.76) }).height;
    if (state.subtitle) hitAreas.push({ field: 'product-subtitle', x: padding, y: subtitleY, width, height: subtitleUsed });
    const top = subtitleY + subtitleUsed + 22;
    const descHeight = state.description ? (isSquare ? 72 : 78) : 0;
    const featureHeight = state.features.length ? (isSquare ? 66 : 68) : 0;
    const priceHeight = state.showPrice ? (state.oldPrice !== null ? 91 : 72) : 0;
    const footerHeight = descHeight + featureHeight + priceHeight + (state.description ? 16 : 0) + (state.features.length ? 16 : 0);
    const photoBottom = height - 54 - footerHeight - 20;
    let photoRect = { x: padding, y: top, width, height: Math.max(140, photoBottom - top) };
    if (state.template === 'minimal') photoRect = { ...photoRect, x: 82, width: 736 };
    if (state.template === 'bloom') photoRect = { ...photoRect, x: 70, width: 760 };
    if (state.template === 'accent') {
      box(ctx, photoRect.x - 14, photoRect.y + 14, photoRect.width, photoRect.height, 28, rgba(state.accent, 0.22));
    }
    const gallery = photoGallery(ctx, state, assets, photoRect);
    let y = photoBottom + 20;
    if (state.description) {
      const area = { x: padding, y, width, height: descHeight };
      const { fontSize } = fitText(ctx, state, state.description, area, { size: 22, minSize: 15, weight: 500, color: rgba(state.textColor, 0.8) });
      hitAreas.push({ field: 'product-description', ...area, fontSize });
      y += descHeight + 16;
    }
    if (state.features.length) {
      features(ctx, state, { x: padding, y, width, height: featureHeight }, false, hitAreas); y += featureHeight + 16;
    }
    if (state.showPrice) {
      const priceWidth = state.oldPrice !== null || state.price !== null && state.price >= 1000000 ? 395 : 335;
      hitAreas.push({ field: 'product-price', x: padding + width - priceWidth, y, width: priceWidth, height: priceHeight });
      price(ctx, state, { x: padding + width - priceWidth, y, width: priceWidth, height: priceHeight }, { plain: state.template === 'minimal', size: state.template === 'bold' ? 45 : 38 });
    }
    return { ...gallery, hitAreas, titleFontSize };
  }

  function editorialLayout(ctx, state, assets, height) {
    const hitAreas = [];
    const square = height === 900, story = height === 1600;
    const x = 54, leftWidth = 350, rightX = 444, rightWidth = 402;
    const titleY = 122, titleHeight = square ? 221 : story ? 345 : 285;
    const { height: titleUsed, fontSize: titleFontSize } = fitText(ctx, state, state.title, { x, y: titleY, width: leftWidth, height: titleHeight }, { size: story ? 68 : 60, minSize: 27, weight: 850, spacing: 1.08 });
    hitAreas.push({ field: 'product-name', x, y: titleY, width: leftWidth, height: titleUsed });
    let y = titleY + titleUsed + 23;
    if (state.subtitle) {
      const { height: used } = fitText(ctx, state, state.subtitle, { x, y, width: leftWidth, height: square ? 84 : 111 }, { size: 22, minSize: 16, weight: 650, align: 'left', color: rgba(state.textColor, 0.8) });
      hitAreas.push({ field: 'product-subtitle', x, y, width: leftWidth, height: used });
      y += used + 23;
    }
    line(ctx, x, y, x + 56, y, state.accent, 3); y += 21;
    const priceHeight = state.showPrice ? state.oldPrice !== null ? 105 : 84 : 0;
    const footerY = height - 60 - priceHeight;
    const descriptionHeight = state.description ? square ? 121 : 154 : 0;
    const featureHeight = state.features.length ? square ? 116 : 149 : 0;
    // The description and features flex to the actual space below the title.
    const available = Math.max(100, footerY - y - 25);
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
    if (state.showPrice) price(ctx, state, { x, y: footerY, width: leftWidth, height: priceHeight }, { plain: true, size: 39 });
    const photoRect = { x: rightX, y: 122, width: rightWidth, height: height - 182 };
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
      hitAreas.push({ field, ...rect, fontSize: metrics.fontSize });
      return metrics;
    };
    label(ctx, state, purposes[state.purpose].label.toLocaleUpperCase('ru-RU'), 54, 111, state.accent, 16);
    const { fontSize: titleFontSize } = area('product-name', state.title, { x: 54, y: 145, width: 792, height: 110 }, { size: 49, weight: 850, spacing: 1.08 });
    area('product-subtitle', state.subtitle, { x: 54, y: 268, width: 792, height: 57 }, { size: 23, weight: 500 });
    const top = state.subtitle ? 348 : 280;
    const footer = height - 145;
    const bottom = state.description ? footer - 105 : footer - 20;
    const bodyHeight = bottom - top;
    const primary = assets.photo || (Array.isArray(assets.photos) ? assets.photos[0] : null);
    const drawPhoto = (image, rect, main = false) => {
      if (main && state.purpose !== 'contents') {
        const gallery = photoGallery(ctx, state, assets, rect);
        photoRects.push(...gallery.photoRects);
        photoScale = gallery.photoScale;
        return;
      }
      // Additional views use neutral framing; dragging and adjustments apply to the primary.
      const scale = photo(ctx, main ? state : { ...state, photo: { ...state.photo, zoom: 1, x: 50, y: 50, rotation: 0, flip: false, warmth: 0, blur: 0 } }, image, rect);
      photoRects.push(rect);
      if (main) {
        photoScale = scale;
        badge(ctx, state, rect);
      }
    };
    const rows = (rect, mode) => {
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
        area('feature-' + (index + 1), value, { x: rect.x + numberWidth, y: y + 9, width: rect.width - numberWidth, height: step - 23 }, { size: mode === 'steps' ? 29 : 27, minSize: 16, align: 'left', verticalCenter: true });
      });
    };
    if (state.purpose === 'advantages') {
      drawPhoto(primary, { x: 54, y: top, width: 432, height: bodyHeight }, true);
      rows({ x: 518, y: top, width: 328, height: bodyHeight }, 'features');
    } else if (['specifications', 'dimensions'].includes(state.purpose)) {
      drawPhoto(primary, { x: 54, y: top, width: 300, height: bodyHeight }, true);
      box(ctx, 380, top, 466, bodyHeight, 20, rgba(state.textColor, 0.045));
      rows({ x: 402, y: top + 12, width: 422, height: bodyHeight - 24 }, 'specs');
    } else if (state.purpose === 'contents') {
      const supplied = Array.isArray(assets.photos) ? assets.photos.filter(Boolean) : [];
      // photos includes the primary image at index 0; assets.photo remains authoritative.
      const extra = supplied.filter(image => image !== primary).slice(0, 2);
      const collageHeight = state.features.length ? bodyHeight * 0.68 : bodyHeight;
      drawPhoto(primary, { x: 54, y: top, width: extra.length ? 510 : 792, height: collageHeight }, true);
      extra.forEach((image, index) => drawPhoto(image, { x: 588, y: top + index * (collageHeight + 18) / extra.length, width: 258, height: (collageHeight - 18 * (extra.length - 1)) / extra.length }));
      if (state.features.length) {
        const y = top + collageHeight + 18, rowHeight = bodyHeight - collageHeight - 18;
        const width = (792 - (state.features.length - 1) * 18) / state.features.length;
        state.features.forEach((value, index) => area('feature-' + (index + 1), value, { x: 54 + index * (width + 18), y, width, height: rowHeight }, { size: 23, minSize: 13, align: 'left' }));
      }
    } else {
      const imageHeight = Math.min(bodyHeight * 0.34, 270);
      drawPhoto(primary, { x: 54, y: top, width: 792, height: imageHeight }, true);
      rows({ x: 54, y: top + imageHeight + 24, width: 792, height: bodyHeight - imageHeight - 24 }, 'steps');
    }
    area('product-description', state.description, { x: 54, y: footer - 88, width: 792, height: 78 }, { size: 22, minSize: 15, weight: 500 });
    if (state.showPrice) {
      price(ctx, state, { x: 451, y: footer + 15, width: 395, height: 91 });
      hitAreas.push({ field: 'product-price', x: 451, y: footer + 15, width: 395, height: 91 });
    }
    return { photoRect: photoRects[0], photoRects, photoScale, hitAreas, titleFontSize };
  }

  function render(canvas, input, assets = {}, options = {}) {
    const state = normalize(input);
    if (!state.title) state.title = 'Название вашего товара';
    const format = formats[state.format];
    const scale = clamp(options.scale, 0.25, 4, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D недоступен.');
    canvas.width = Math.round(format.width * scale); canvas.height = Math.round(format.height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, format.width, format.height);
    ctx.save();
    background(ctx, state, format.height);
    brand(ctx, state, assets);
    const layout = state.purpose === 'cover'
      ? (state.template === 'editorial' ? editorialLayout(ctx, state, assets, format.height) : stackedLayout(ctx, state, assets, format.height))
      : purposeLayout(ctx, state, assets, format.height);
    ctx.restore();
    let titleContrast;
    // Measure Minimal's solid title background. Other templates can vary under the letters.
    if (state.template === 'minimal') {
      const foreground = luminance(state.textColor), background = luminance(state.background);
      titleContrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    }
    return { ...layout, photoRects: layout.photoRects || [layout.photoRect], hitAreas: layout.hitAreas || [], width: format.width, height: format.height, titleContrast };
  }
  root.SATUCARD_RENDERER = { templates, formats, purposes, categories, normalize, render };
})();
