'use strict';

(() => {
  const nameInput = document.querySelector('#brand-name');
  const logoInput = document.querySelector('#brand-logo');
  const logoStatus = document.querySelector('#brand-logo-status');
  const removeButton = document.querySelector('#brand-logo-remove');
  const colorEnabled = document.querySelector('#brand-color-enabled');
  const colorInput = document.querySelector('#brand-color');

  let logo = null;
  let logoVersion = 0;

  const notifyEditor = () => {
    document.dispatchEvent(new Event('satucard:brand-change'));
  };

  const showLogoError = (message) => {
    logoStatus.textContent = message;
    logoStatus.classList.add('error');
    logoInput.value = '';
  };

  function draw(ctx, ink) {
    const label = nameInput.value.trim() || 'SatuCard.';
    let textX = 60;

    if (logo) {
      const box = 46;
      const scale = Math.min(
        box / logo.naturalWidth,
        box / logo.naturalHeight
      );
      const width = logo.naturalWidth * scale;
      const height = logo.naturalHeight * scale;

      ctx.drawImage(
        logo,
        60 + (box - width) / 2,
        42 + (box - height) / 2,
        width,
        height
      );
      textX = 118;
    }

    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '750 23px Manrope, Arial, sans-serif';
    ctx.fillText(label, textX, 48, logo ? 490 : 550);
  }

  function tagColors(theme) {
    if (!colorEnabled.checked) {
      return { fill: theme.tag, text: theme.tagText };
    }

    const hex = colorInput.value;
    const channels = hex.slice(1).match(/.{2}/g).map(
      part => parseInt(part, 16) / 255
    );
    const linear = channels.map(value =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4
    );
    const luminance =
      linear[0] * 0.2126 +
      linear[1] * 0.7152 +
      linear[2] * 0.0722;

    return {
      fill: hex,
      text: luminance > 0.179 ? '#000000' : '#ffffff'
    };
  }

  function reset() {
    logoVersion++;
    logo = null;
    logoInput.value = '';
    removeButton.disabled = true;
    colorInput.disabled = true;
    logoStatus.textContent = 'Необязательно · PNG, JPG или WebP до 2 МБ.';
    logoStatus.classList.remove('error');
  }

  nameInput.addEventListener('input', notifyEditor);

  colorEnabled.addEventListener('change', () => {
    colorInput.disabled = !colorEnabled.checked;
    notifyEditor();
  });

  colorInput.addEventListener('input', notifyEditor);

  logoInput.addEventListener('change', () => {
    const file = logoInput.files[0];
    if (!file) return;

    const version = ++logoVersion;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showLogoError('Выберите логотип в формате PNG, JPG или WebP.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showLogoError('Логотип должен быть не больше 2 МБ.');
      return;
    }

    logoStatus.textContent = 'Загружаем логотип…';
    logoStatus.classList.remove('error');

    const reader = new FileReader();

    reader.onload = () => {
      if (version !== logoVersion) return;

      const image = new Image();
      image.onload = () => {
        if (version !== logoVersion) return;

        logo = image;
        removeButton.disabled = false;
        logoStatus.textContent = `Загружен логотип: ${file.name}`;
        notifyEditor();
      };
      image.onerror = () => {
        if (version === logoVersion) {
          showLogoError('Не удалось открыть логотип. Выберите другой файл.');
        }
      };
      image.src = reader.result;
    };

    reader.onerror = () => {
      if (version === logoVersion) {
        showLogoError('Не удалось прочитать файл логотипа.');
      }
    };

    reader.readAsDataURL(file);
  });

  removeButton.addEventListener('click', () => {
    logoVersion++;
    logo = null;
    logoInput.value = '';
    removeButton.disabled = true;
    logoStatus.textContent = 'Логотип убран.';
    logoStatus.classList.remove('error');
    notifyEditor();
  });

  window.SATUCARD_BRAND = { draw, tagColors, reset };
})();
