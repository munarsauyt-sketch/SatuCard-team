'use strict';

(() => {
  function generateCardQrSvg(text) {
    const rawBytes = Array.from(new TextEncoder().encode(String(text || 'https://satucard.kz')));
    const versions = [
      [1, 19, 7, [], 1],
      [2, 34, 10, [6, 18], 1],
      [3, 55, 15, [6, 22], 1],
      [4, 80, 20, [6, 26], 1],
      [5, 108, 26, [6, 30], 1],
      [6, 136, 36, [6, 34], 2]
    ];
    const spec = versions.find(v => rawBytes.length + 2 <= v[1]);
    const data = spec ? rawBytes : rawBytes.slice(0, 134);
    const [ver, totalData, totalEc, alignPos, blocks] = spec || versions[versions.length - 1];
    const size = 17 + ver * 4;

    const gfExp = new Uint8Array(512);
    const gfLog = new Uint8Array(256);
    for (let x = 1, i = 0; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x = x & 0x80 ? ((x << 1) ^ 0x11d) : (x << 1);
    }
    for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
    const gfMul = (a, b) => (a && b ? gfExp[gfLog[a] + gfLog[b]] : 0);

    function rsEncode(blockData, ecLen) {
      let gen = [1];
      for (let i = 0; i < ecLen; i++) {
        const next = new Array(gen.length + 1).fill(0);
        const root = gfExp[i];
        for (let j = 0; j < gen.length; j++) {
          next[j] ^= gen[j];
          next[j + 1] ^= gfMul(gen[j], root);
        }
        gen = next;
      }
      const res = new Uint8Array(ecLen);
      for (const byte of blockData) {
        const factor = byte ^ res[0];
        res.copyWithin(0, 1);
        res[ecLen - 1] = 0;
        for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
      }
      return Array.from(res);
    }

    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(data.length, 8);
    for (const b of data) pushBits(b, 8);
    pushBits(0, Math.min(4, totalData * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      codewords.push(v);
    }
    const pads = [0xec, 0x11];
    while (codewords.length < totalData) codewords.push(pads[codewords.length % 2]);

    const perBlockData = Math.floor(totalData / blocks);
    const perBlockEc = Math.floor(totalEc / blocks);
    const dataBlocks = [], ecBlocks = [];
    for (let b = 0, offset = 0; b < blocks; b++) {
      const slice = codewords.slice(offset, offset + perBlockData);
      offset += perBlockData;
      dataBlocks.push(slice);
      ecBlocks.push(rsEncode(slice, perBlockEc));
    }
    const stream = [];
    for (let i = 0; i < perBlockData; i++) for (const blk of dataBlocks) stream.push(blk[i]);
    for (let i = 0; i < perBlockEc; i++) for (const blk of ecBlocks) stream.push(blk[i]);

    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const fixed = Array.from({ length: size }, () => Array(size).fill(false));
    const setFixed = (r, c, v) => {
      if (r >= 0 && r < size && c >= 0 && c < size) { grid[r][c] = v ? 1 : 0; fixed[r][c] = true; }
    };
    function finder(r0, c0) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
            (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setFixed(r0 + r, c0 + c, on);
        }
      }
    }
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      setFixed(6, i, i % 2 === 0);
      setFixed(i, 6, i % 2 === 0);
    }
    for (const r of alignPos) {
      for (const c of alignPos) {
        if (fixed[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            setFixed(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }
    setFixed(size - 8, 8, true);
    for (let i = 0; i < 9; i++) {
      if (i !== 6) { setFixed(8, i, false); setFixed(i, 8, false); }
    }
    for (let i = 0; i < 8; i++) { setFixed(8, size - 1 - i, false); setFixed(size - 1 - i, 8, false); }

    let bitIdx = 0, up = true;
    for (let c = size - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (let i = 0; i < size; i++) {
        const r = up ? size - 1 - i : i;
        for (let dc = 0; dc < 2; dc++) {
          const cc = c - dc;
          if (fixed[r][cc]) continue;
          const byte = stream[bitIdx >> 3] || 0;
          grid[r][cc] = (byte >> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
        }
      }
      up = !up;
    }

    const formatBits = mask => {
      let val = ((0b01 << 3) | mask) << 10;
      const poly = 0b10100110111;
      for (let i = 14; i >= 10; i--) if ((val >> i) & 1) val ^= poly << (i - 10);
      return (((0b01 << 3) | mask) << 10 | val) ^ 0b101010000010010;
    };
    const maskFn = [
      (r, c) => (r + c) % 2 === 0,
      r => r % 2 === 0,
      (_, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0
    ];
    let bestGrid = null, bestPenalty = Infinity;
    for (let m = 0; m < maskFn.length; m++) {
      const candidate = grid.map((row, r) => row.map((v, c) => (fixed[r][c] ? v : v ^ (maskFn[m](r, c) ? 1 : 0))));
      const fmt = formatBits(m);
      for (let i = 0; i < 6; i++) candidate[8][i] = candidate[size - 1 - i][8] = (fmt >> (14 - i)) & 1;
      candidate[8][7] = candidate[size - 7][8] = (fmt >> 8) & 1;
      candidate[8][8] = candidate[8][size - 8] = (fmt >> 7) & 1;
      candidate[7][8] = candidate[8][size - 7] = (fmt >> 6) & 1;
      for (let i = 9; i < 15; i++) {
        const bit = (fmt >> (14 - i)) & 1;
        candidate[14 - i][8] = candidate[8][size - 15 + i] = bit;
      }
      let dark = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += candidate[r][c];
      const penalty = Math.abs((dark * 100) / (size * size) - 50);
      if (penalty < bestPenalty) { bestPenalty = penalty; bestGrid = candidate; }
    }

    const rects = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (bestGrid[r][c]) rects.push(`M${c + 2},${r + 2}h1v1h-1z`);
      }
    }
    const dim = size + 4;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="200" height="200" role="img" aria-label="QR-код"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${rects.join('')}" fill="#000000"/></svg>`;
  }

  window.SATUCARD_QR = { generateCardQrSvg };

  const id = new URLSearchParams(location.search).get('id');
  const title = document.querySelector('#card-title');
  const status = document.querySelector('#card-status');
  const content = document.querySelector('#shared-card-content');
  const page = document.querySelector('.shared-card-main');
  const loading = document.querySelector('#card-loading');
  const errorPanel = document.querySelector('#card-error');
  const copy = document.querySelector('#card-copy-link');
  const shareStatus = document.querySelector('#card-share-status');
  const qrToggle = document.querySelector('#card-qr-toggle');
  const qrBox = document.querySelector('#card-qr-box');
  const qrSvg = document.querySelector('#card-qr-svg');
  const qrDownload = document.querySelector('#card-qr-download');
  const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  if (!copy || !title || !status || !content || !page || !loading || !errorPanel) return;

  const shareUrl = id ? new URL('api/share?id=' + encodeURIComponent(id), location.href).href : location.href;
  let qrObjectUrl = null;
  qrToggle?.addEventListener('click', () => {
    if (!qrBox) return;
    const willOpen = qrBox.hidden;
    qrBox.hidden = !willOpen;
    qrToggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen && qrSvg && !qrSvg.firstChild) {
      const svgText = generateCardQrSvg(shareUrl);
      qrSvg.innerHTML = svgText;
      if (qrDownload) {
        if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
        qrObjectUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
        qrDownload.href = qrObjectUrl;
      }
    }
  });

  document.querySelector('#card-retry')?.addEventListener('click', () => location.reload());
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareStatus.textContent = 'Ссылка скопирована. Ею можно поделиться.';
    } catch (_) {
      shareStatus.textContent = 'Скопируйте ссылку из адресной строки браузера.';
    }
  });

  function showError() {
    loading.hidden = true;
    errorPanel.hidden = false;
    page.dataset.state = 'error';
  }

  if (!id) {
    title.textContent = 'Ссылка на карточку неполная';
    status.textContent = 'Откройте ссылку, которую вы получили после публикации.';
    showError();
    return;
  }

  fetch(`api/card?id=${encodeURIComponent(id)}`)
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось открыть карточку.');
      return data;
    })
    .then(card => {
      title.textContent = card.title;
      document.title = `${card.title} — SatuCard`;
      document.querySelector('#card-image').src = card.imageUrl;
      document.querySelector('#card-image').alt = `Карточка товара «${card.title}»`;
      document.querySelector('#card-image-link').href = card.imageUrl;
      document.querySelector('#card-price').textContent = `${formatter.format(Number(card.price))} ₸`;
      document.querySelector('#card-old-price').textContent = card.oldPrice === null
        ? ''
        : `${formatter.format(Number(card.oldPrice))} ₸`;
      document.querySelector('#card-brand').textContent = card.brandName || 'Карточка создана в SatuCard';
      document.querySelector('.shared-brand-row').hidden = card.showBrand === false;
      document.querySelector('.shared-price-block').hidden = card.showPrice === false || card.price === null;
      const contact = document.createElement('a');
      if (card.contactUrl) {
        try {
          const url = new URL(card.contactUrl);
          if (url.protocol === 'https:') {
            const host = url.hostname.toLowerCase();
            const isWhatsApp = host === 'wa.me' || host === 'whatsapp.com' || host.endsWith('.whatsapp.com');
            if (isWhatsApp && !url.searchParams.has('text')) {
              const priceNote = card.showPrice !== false && card.price != null ? ` (${formatter.format(Number(card.price))} ₸)` : '';
              url.searchParams.set('text', `Здравствуйте! Интересует товар «${card.title}»${priceNote}: ${shareUrl}`);
            }
            contact.id = isWhatsApp ? 'card-whatsapp-link' : 'card-contact-link';
            contact.href = url.href;
            contact.className = 'button button-dark';
            contact.rel = 'noopener noreferrer';
            contact.target = '_blank';
            contact.textContent = isWhatsApp ? 'Написать в WhatsApp ↗' : 'Связаться с продавцом ↗';
            document.querySelector('.shared-card-actions').prepend(contact);
          }
        } catch (_) {}
      }
      status.textContent = '';
      loading.hidden = true;
      page.dataset.state = 'ready';
      content.hidden = false;
    })
    .catch(error => {
      title.textContent = 'Карточка недоступна';
      status.textContent = error.message || 'Попробуйте открыть ссылку позже.';
      showError();
    });
})();
