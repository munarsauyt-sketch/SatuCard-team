// Real-time 3D modeled exploded product card showcase for SatuCard.
// Lazily loads the local CSP-safe Three.js bundle only on desktop viewports.

const VENDOR_URL = './assets/vendor/three/three.bundle.min.js';

let threePromise;
function loadThree() {
  return threePromise ??= import(VENDOR_URL);
}

const CARD_PX_W = 900;
const CARD_PX_H = 1125;
const WORLD_W = 2.40;
const WORLD_H = 3.00;
const PX_TO_WORLD = WORLD_W / CARD_PX_W; // 1 / 375

const STYLE_MATERIALS = {
  studio: {
    chassisColor: 0xf2efe9,
    metalColor: 0xc9c2b4,
    metalRoughness: 0.24,
    metalness: 0.86,
    bezelColor: 0xc4bdb0,
    bezelRoughness: 0.20,
    bezelMetalness: 0.90,
    accentColor: 0x3d5f47,
    accentMetalness: 0.44,
    accentRoughness: 0.28,
    priceSideColor: 0x31503b,
    priceRoughness: 0.20,
    glassTint: 0xffffff,
    pinColor: 0xa9a293,
    studCoreColor: 0x3d5f47,
    rimLightColor: 0xfff0d8,
    rimIntensityLight: 1.35,
    rimIntensityDark: 2.25,
    haloColorLight: 0xbcb4a6,
    haloColorDark: 0x707a90
  },
  noir: {
    chassisColor: 0x111215,
    metalColor: 0xd6b16b,
    metalRoughness: 0.20,
    metalness: 0.94,
    bezelColor: 0xdcb976,
    bezelRoughness: 0.16,
    bezelMetalness: 0.95,
    accentColor: 0xd6b16b,
    accentMetalness: 0.92,
    accentRoughness: 0.20,
    priceSideColor: 0xd6b16b,
    priceRoughness: 0.18,
    glassTint: 0xfff6e5,
    pinColor: 0xd6b16b,
    studCoreColor: 0xf4dca4,
    rimLightColor: 0xffe2a8,
    rimIntensityLight: 1.80,
    rimIntensityDark: 2.90,
    haloColorLight: 0x9b8969,
    haloColorDark: 0xc8a666
  },
  bold: {
    chassisColor: 0xedf05a,
    metalColor: 0x181a17,
    metalRoughness: 0.24,
    metalness: 0.80,
    bezelColor: 0x1d1f1b,
    bezelRoughness: 0.20,
    bezelMetalness: 0.86,
    accentColor: 0x161714,
    accentMetalness: 0.58,
    accentRoughness: 0.26,
    priceSideColor: 0x161714,
    priceRoughness: 0.16,
    glassTint: 0xfaffdd,
    pinColor: 0x262824,
    studCoreColor: 0xd84522,
    rimLightColor: 0xf4ffbd,
    rimIntensityLight: 1.45,
    rimIntensityDark: 2.45,
    haloColorLight: 0x9e9f72,
    haloColorDark: 0xa4a957
  }
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function easeOutQuint(t) {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 5);
}

function easeInOutCubic(t) {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function rectToWorld(r) {
  return {
    w: r.width * PX_TO_WORLD,
    h: r.height * PX_TO_WORLD,
    cx: (r.x + r.width / 2 - CARD_PX_W / 2) * PX_TO_WORLD,
    cy: (CARD_PX_H / 2 - (r.y + r.height / 2)) * PX_TO_WORLD
  };
}

function roundedRectShape(THREE, w, h, r) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw * 0.98, hh * 0.98);
  shape.moveTo(-hw + cr, -hh);
  shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh);
  shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return shape;
}

function createExtrudedSlab(THREE, w, h, depth, radius, bevelSize, bevelThickness) {
  const shape = roundedRectShape(
    THREE,
    Math.max(0.02, w - bevelSize * 2),
    Math.max(0.02, h - bevelSize * 2),
    Math.max(0.008, radius - bevelSize * 0.6)
  );
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.004, depth),
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 3,
    curveSegments: 12
  });
  geo.center();
  return geo;
}

function createHollowFrame(THREE, outerW, outerH, outerR, holeCx, holeCy, holeW, holeH, holeR, depth, bevelSize, bevelThickness) {
  const shape = roundedRectShape(THREE, outerW, outerH, outerR);
  const hole = new THREE.Path();
  const hw = holeW / 2;
  const hh = holeH / 2;
  const cr = Math.min(holeR, hw * 0.96, hh * 0.96);
  hole.moveTo(holeCx - hw + cr, holeCy - hh);
  hole.quadraticCurveTo(holeCx - hw, holeCy - hh, holeCx - hw, holeCy - hh + cr);
  hole.lineTo(holeCx - hw, holeCy + hh - cr);
  hole.quadraticCurveTo(holeCx - hw, holeCy + hh, holeCx - hw + cr, holeCy + hh);
  hole.lineTo(holeCx + hw - cr, holeCy + hh);
  hole.quadraticCurveTo(holeCx + hw, holeCy + hh, holeCx + hw, holeCy + hh - cr);
  hole.lineTo(holeCx + hw, holeCy - hh + cr);
  hole.quadraticCurveTo(holeCx + hw, holeCy - hh, holeCx + hw - cr, holeCy - hh);
  hole.lineTo(holeCx - hw + cr, holeCy - hh);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.004, depth),
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 3,
    curveSegments: 12
  });
  geo.computeBoundingBox();
  const zMid = (geo.boundingBox.min.z + geo.boundingBox.max.z) / 2;
  geo.translate(0, 0, -zMid);
  return geo;
}

function createRoundedFaceGeo(THREE, w, h, radius) {
  const shape = roundedRectShape(THREE, w, h, radius);
  const geo = new THREE.ShapeGeometry(shape, 12);
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = (pos.getX(i) + w / 2) / w;
    uvs[i * 2 + 1] = (pos.getY(i) + h / 2) / h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function makeCanvasTexture(THREE, canvas, maxAnisotropy) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy || 4);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function drawRoundedRect2D(ctx, x, y, w, h, r) {
  const cr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + cr, y);
  ctx.lineTo(x + w - cr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
  ctx.lineTo(x + w, y + h - cr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
  ctx.lineTo(x + cr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
  ctx.lineTo(x, y + cr);
  ctx.quadraticCurveTo(x, y, x + cr, y);
  ctx.closePath();
}

function buildStudioEnvironment(THREE, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();

  // Neutral-warm studio cyclorama dome
  const roomGeo = new THREE.BoxGeometry(24, 16, 24);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0xeeebe4, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(roomGeo, roomMat));

  // Primary overhead softbox
  const keyPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  keyPanel.position.set(-4.2, 7.0, 5.8);
  keyPanel.lookAt(0, 0, 0);
  envScene.add(keyPanel);

  // Vertical right rim strip-light (sharp metallic chamfer reflection)
  const rimStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 11.5),
    new THREE.MeshBasicMaterial({ color: 0xf8fbff })
  );
  rimStrip.position.set(8.4, 1.5, 3.4);
  rimStrip.lookAt(0, 0, 0);
  envScene.add(rimStrip);

  // Warm back-left architectural kicker
  const backStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 9),
    new THREE.MeshBasicMaterial({ color: 0xffebd0 })
  );
  backStrip.position.set(-7.6, 2.2, -5.0);
  backStrip.lookAt(0, 0, 0);
  envScene.add(backStrip);

  // Clean bounce reflector underneath
  const bounce = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshBasicMaterial({ color: 0xd8d2c8 })
  );
  bounce.position.set(0, -6.5, 0);
  bounce.rotation.x = -Math.PI / 2;
  envScene.add(bounce);

  // Architectural dark contrast flags for crisp metal specular gradient
  const flagLeft = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 12),
    new THREE.MeshBasicMaterial({ color: 0x22242c })
  );
  flagLeft.position.set(-10.5, 0, 1);
  flagLeft.lookAt(0, 0, 0);
  envScene.add(flagLeft);

  const flagRight = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 11),
    new THREE.MeshBasicMaterial({ color: 0x25262e })
  );
  flagRight.position.set(10.5, -1, -4.5);
  flagRight.lookAt(0, 0, 0);
  envScene.add(flagRight);

  const rt = pmrem.fromScene(envScene, 0.032);
  pmrem.dispose();
  envScene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  return rt;
}

function createBackplateCanvas(templateName, state) {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1125;
  const ctx = c.getContext('2d');
  const dark = templateName === 'noir' || templateName === 'bold';
  const baseBg = templateName === 'noir' ? '#14151a' : templateName === 'bold' ? '#1b1d19' : '#e8e4dc';
  const ink = dark ? 'rgba(245, 240, 230, 0.76)' : 'rgba(28, 34, 30, 0.62)';
  const subtle = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(20, 24, 22, 0.08)';
  const accent = state.accent || '#3d5f47';

  ctx.fillStyle = baseBg;
  ctx.fillRect(0, 0, 900, 1125);

  ctx.strokeStyle = subtle;
  ctx.lineWidth = 1;
  for (let x = 90; x < 900; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, 1065); ctx.stroke();
  }
  for (let y = 90; y < 1125; y += 90) {
    ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(840, y); ctx.stroke();
  }

  ctx.strokeStyle = dark ? 'rgba(214, 177, 107, 0.36)' : 'rgba(61, 95, 71, 0.28)';
  ctx.lineWidth = 2;
  drawRoundedRect2D(ctx, 56, 56, 788, 1013, 28);
  ctx.stroke();

  ctx.save();
  ctx.translate(450, 520);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  drawRoundedRect2D(ctx, -46, -46, 92, 92, 22);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 34px Manrope, Arial, sans-serif';
  ctx.fillText('SatuCard.', 450, 622);
  ctx.font = '500 18px Manrope, Arial, sans-serif';
  ctx.fillStyle = dark ? 'rgba(245, 240, 230, 0.46)' : 'rgba(28, 34, 30, 0.42)';
  ctx.fillText('STUDIO CARD · 4:5 · PNG', 450, 666);

  return c;
}

function createCleanBackdropCanvas(state, scale) {
  const c = document.createElement('canvas');
  c.width = Math.round(CARD_PX_W * scale);
  c.height = Math.round(CARD_PX_H * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = state.background;
  ctx.fillRect(0, 0, 900, 1125);

  if (state.template === 'studio') {
    const g = ctx.createRadialGradient(540, 420, 40, 480, 540, 760);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.56)');
    g.addColorStop(0.55, 'rgba(61, 95, 71, 0.04)');
    g.addColorStop(1, 'rgba(61, 95, 71, 0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 900, 1125);
  } else if (state.template === 'noir') {
    const g = ctx.createRadialGradient(450, 460, 30, 450, 540, 740);
    g.addColorStop(0, 'rgba(214, 177, 107, 0.18)');
    g.addColorStop(0.55, 'rgba(214, 177, 107, 0.05)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 900, 1125);
  } else if (state.template === 'bold') {
    const g = ctx.createLinearGradient(0, 0, 900, 1125);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    g.addColorStop(0.6, 'rgba(237, 240, 90, 0)');
    g.addColorStop(1, 'rgba(22, 23, 20, 0.09)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 900, 1125);
  }

  ctx.strokeStyle = state.template === 'noir'
    ? 'rgba(214, 177, 107, 0.28)'
    : state.template === 'bold'
      ? 'rgba(22, 23, 20, 0.24)'
      : 'rgba(61, 95, 71, 0.20)';
  ctx.lineWidth = 1.5;
  drawRoundedRect2D(ctx, 28, 28, 844, 1069, 18);
  ctx.stroke();

  return c;
}

function createTitleBarFromMaster(masterCanvas, state, titleRect, subtitleRect) {
  const scale = masterCanvas.width / CARD_PX_W;
  const topY = Math.max(0, titleRect.y - 12);
  const bottomY = Math.min(CARD_PX_H, (subtitleRect ? subtitleRect.y + subtitleRect.height : titleRect.y + titleRect.height) + 14);
  const boxRect = { x: 44, y: topY, width: 812, height: Math.max(92, bottomY - topY) };

  const c = document.createElement('canvas');
  c.width = Math.round(boxRect.width * scale);
  c.height = Math.round(boxRect.height * scale);
  const ctx = c.getContext('2d');
  // 100% pixel-identical crop from SATUCARD_RENDERER master canvas!
  ctx.drawImage(
    masterCanvas,
    Math.round(boxRect.x * scale), Math.round(boxRect.y * scale),
    Math.round(boxRect.width * scale), Math.round(boxRect.height * scale),
    0, 0, c.width, c.height
  );

  // Subtle architectural glass bevel border on the cropped typography plaque
  ctx.scale(scale, scale);
  const stroke = state.template === 'noir'
    ? 'rgba(214, 177, 107, 0.36)'
    : state.template === 'bold'
      ? 'rgba(22, 23, 20, 0.28)'
      : 'rgba(61, 95, 71, 0.22)';
  drawRoundedRect2D(ctx, 1, 1, boxRect.width - 2, boxRect.height - 2, 18);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  return { canvas: c, rect: boxRect };
}

function createBadgeCanvas(state) {
  const label = state.badge || 'Новая коллекция';
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);

  ctx.font = '700 16px Manrope, Arial, sans-serif';
  const textW = ctx.measureText(label).width;
  const pillW = Math.min(234, Math.ceil(textW + 36));
  const pillH = 38;
  const r = state.template === 'bold' ? 8 : pillH / 2;

  c.width = Math.round(pillW * 2);
  c.height = Math.round(pillH * 2);
  ctx.setTransform(2, 0, 0, 2, 0, 0);

  const bg = state.template === 'noir' ? '#1b1d22' : '#181e1a';
  drawRoundedRect2D(ctx, 0.75, 0.75, pillW - 1.5, pillH - 1.5, r);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = state.template === 'noir' ? 'rgba(214, 177, 107, 0.55)' : 'rgba(255, 255, 255, 0.28)';
  ctx.stroke();

  ctx.font = '700 16px Manrope, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, 18, pillH / 2 + 0.5);

  return { canvas: c, width: pillW, height: pillH };
}

function cropCanvas(sourceCanvas, rect, scale = sourceCanvas.width / CARD_PX_W) {
  const c = document.createElement('canvas');
  const sx = Math.max(0, Math.round(rect.x * scale));
  const sy = Math.max(0, Math.round(rect.y * scale));
  const sw = Math.max(2, Math.round(rect.width * scale));
  const sh = Math.max(2, Math.round(rect.height * scale));
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d');
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

function createFloorShadowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(256, 256, 12, 256, 256, 248);
  g.addColorStop(0, 'rgba(18, 16, 14, 0.34)');
  g.addColorStop(0.28, 'rgba(18, 16, 14, 0.22)');
  g.addColorStop(0.58, 'rgba(18, 16, 14, 0.08)');
  g.addColorStop(0.84, 'rgba(18, 16, 14, 0.02)');
  g.addColorStop(1, 'rgba(18, 16, 14, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createOpticalGlintTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 640;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 640);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
  g.addColorStop(0.24, 'rgba(255, 255, 255, 0.04)');
  g.addColorStop(0.48, 'rgba(255, 255, 255, 0.16)');
  g.addColorStop(0.62, 'rgba(255, 255, 255, 0.0)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 640);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export async function mountHero3D({ container, rendererApi, sample, image, initialStyle = 'studio', onStageReady, onExplodeChange, onFallback }) {
  let THREE;
  try {
    THREE = await loadThree();
  } catch (err) {
    onFallback?.(err);
    return null;
  }

  let glRenderer;
  try {
    glRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power'
    });
  } catch (err) {
    onFallback?.(err);
    return null;
  }

  const maxAnisotropy = glRenderer.capabilities.getMaxAnisotropy();
  // The drawing-buffer budget is applied after measuring the viewport in resize().
  glRenderer.outputColorSpace = THREE.SRGBColorSpace;
  // Khronos PBR Neutral keeps product whites bright and brand colors faithful
  glRenderer.toneMapping = THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
  glRenderer.toneMappingExposure = 1.04;
  glRenderer.shadowMap.enabled = true;
  glRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvas = glRenderer.domElement;
  canvas.className = 'hero-3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Интерактивная 3D-модель карточки товара «${sample.title || 'Парфюм Atelier 100 мл'}»`);
  container.innerHTML = '';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const environmentTarget = buildStudioEnvironment(THREE, glRenderer);
  scene.environment = environmentTarget.texture;

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 40);
  camera.position.set(0, 0.16, 7.5);
  camera.lookAt(0, -0.02, 0);

  // Clean architectural studio lighting — overhead key light prevents angular floor shadows
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd8d1c6, 0.78);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffcf6, 1.38);
  keyLight.position.set(-1.35, 7.4, 3.6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(512, 512);
  keyLight.shadow.camera.near = 2.0;
  keyLight.shadow.camera.far = 16;
  const shadowSpan = 3.0;
  keyLight.shadow.camera.left = -shadowSpan;
  keyLight.shadow.camera.right = shadowSpan;
  keyLight.shadow.camera.top = shadowSpan;
  keyLight.shadow.camera.bottom = -shadowSpan;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.022;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xf2f6ff, 0.56);
  fillLight.position.set(4.5, 2.4, 4.4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xfff0d8, 1.35);
  rimLight.position.set(3.8, 3.2, -3.6);
  scene.add(rimLight);

  const frontSpecLight = new THREE.PointLight(0xffffff, 1.5, 12, 2);
  frontSpecLight.position.set(-1.5, 2.1, 3.6);
  scene.add(frontSpecLight);

  // Studio floor + soft diffused contact shadow + subtle architectural calibration ring
  const floorGroup = new THREE.Group();
  floorGroup.position.set(0, -1.78, 0);
  scene.add(floorGroup);

  const realShadowMat = new THREE.ShadowMaterial({ opacity: 0.055 });
  const realShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), realShadowMat);
  realShadowPlane.rotation.x = -Math.PI / 2;
  realShadowPlane.receiveShadow = true;
  floorGroup.add(realShadowPlane);

  const softShadowTex = createFloorShadowTexture(THREE);
  const softShadowMat = new THREE.MeshBasicMaterial({
    map: softShadowTex,
    transparent: true,
    opacity: 0.78,
    depthWrite: false
  });
  const softShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.3), softShadowMat);
  softShadowPlane.rotation.x = -Math.PI / 2;
  softShadowPlane.position.y = 0.003;
  floorGroup.add(softShadowPlane);

  const coreShadowMat = new THREE.MeshBasicMaterial({
    map: softShadowTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const coreShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.95), coreShadowMat);
  coreShadowPlane.rotation.x = -Math.PI / 2;
  coreShadowPlane.position.y = 0.005;
  floorGroup.add(coreShadowPlane);

  // Architectural brushed-metal studio podium halo ring
  const haloMat = new THREE.MeshStandardMaterial({
    color: 0xbcb4a6,
    metalness: 0.85,
    roughness: 0.28,
    transparent: true,
    opacity: 0.42
  });
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.50, 0.008, 8, 64), haloMat);
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.y = 0.012;
  floorGroup.add(haloRing);

  const innerHaloMat = new THREE.MeshStandardMaterial({
    color: 0xbcb4a6,
    metalness: 0.78,
    roughness: 0.34,
    transparent: true,
    opacity: 0.20
  });
  const innerHaloRing = new THREE.Mesh(new THREE.TorusGeometry(1.20, 0.0045, 6, 64), innerHaloMat);
  innerHaloRing.rotation.x = Math.PI / 2;
  innerHaloRing.position.y = 0.010;
  floorGroup.add(innerHaloRing);

  function makeCardState(template, opts = {}) {
    return rendererApi.normalize({
      ...sample,
      template,
      format: 'portrait',
      font: 'manrope',
      showBrand: false,
      ...opts
    });
  }

  function bakeStyleAssets(template) {
    // Preview textures only; downloaded product cards keep their export resolution.
    const scale = 1.5;
    const state = makeCardState(template);
    const masterCanvas = document.createElement('canvas');
    const layout = rendererApi.render(masterCanvas, state, { photo: image }, { scale });

    const noBadgeState = makeCardState(template, { badge: '' });
    const noBadgeCanvas = document.createElement('canvas');
    rendererApi.render(noBadgeCanvas, noBadgeState, { photo: image }, { scale });

    const photoCanvas = cropCanvas(noBadgeCanvas, layout.photoRect);
    const backdropCanvas = createCleanBackdropCanvas(state, scale);
    const backplateCanvas = createBackplateCanvas(template, state);

    const findHit = name => layout.hitAreas.find(a => a.field === name);
    const titleHit = findHit('product-name') || { x: 54, y: 112, width: 792, height: 70 };
    const subtitleHit = findHit('product-subtitle') || { x: 54, y: 194, width: 792, height: 28 };
    const priceHit = findHit('product-price') || { x: 511, y: 999, width: 335, height: 72 };

    const featureY = priceHit.y - 16 - 72;
    const featColW = (792 - 24) / 3;
    const featureRects = [0, 1, 2].map(idx => ({
      x: 54 + idx * (featColW + 12),
      y: featureY,
      width: featColW,
      height: 72
    }));
    const featureCanvases = featureRects.map(r => cropCanvas(masterCanvas, r));
    const priceCanvas = cropCanvas(masterCanvas, priceHit);
    const titlePack = createTitleBarFromMaster(masterCanvas, state, titleHit, subtitleHit);
    const badgePack = createBadgeCanvas(state);

    return {
      state,
      layout,
      masterCanvas,
      backdropCanvas,
      backplateCanvas,
      photoCanvas,
      photoRect: layout.photoRect,
      titleCanvas: titlePack.canvas,
      titleRect: titlePack.rect,
      badgeCanvas: badgePack.canvas,
      badgeRect: {
        x: layout.photoRect.x + 18,
        y: layout.photoRect.y + 18,
        width: badgePack.width,
        height: badgePack.height
      },
      featureRects,
      featureCanvases,
      priceRect: priceHit,
      priceCanvas
    };
  }

  let activeStyle = STYLE_MATERIALS[initialStyle] ? initialStyle : 'studio';
  let baked = bakeStyleAssets(activeStyle);
  const ownedTextures = [];
  const trackTex = tex => { ownedTextures.push(tex); return tex; };

  const assemblyRoot = new THREE.Group();
  assemblyRoot.position.set(0, 0.06, 0);
  scene.add(assemblyRoot);

  const sty = STYLE_MATERIALS[activeStyle];

  // Shared reactive PBR materials
  const chassisSideMat = new THREE.MeshPhysicalMaterial({
    color: sty.metalColor,
    metalness: sty.metalness,
    roughness: sty.metalRoughness,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.45
  });
  const chassisBodyFrontMat = new THREE.MeshStandardMaterial({
    color: sty.chassisColor,
    roughness: 0.42,
    metalness: 0.06
  });
  const bezelMetalMat = new THREE.MeshPhysicalMaterial({
    color: sty.bezelColor,
    metalness: sty.bezelMetalness,
    roughness: sty.bezelRoughness,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.60
  });
  const accentMetalMat = new THREE.MeshPhysicalMaterial({
    color: sty.accentColor,
    metalness: sty.accentMetalness,
    roughness: sty.accentRoughness,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.40
  });
  const priceSideMat = new THREE.MeshPhysicalMaterial({
    color: sty.priceSideColor,
    metalness: 0.35,
    roughness: sty.priceRoughness,
    clearcoat: 0.88,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.45
  });
  const crystalEdgeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.12,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.90,
    envMapIntensity: 1.65
  });
  const pinMetalMat = new THREE.MeshStandardMaterial({
    color: sty.pinColor,
    metalness: 0.92,
    roughness: 0.18,
    envMapIntensity: 1.55
  });
  const studCoreMat = new THREE.MeshPhysicalMaterial({
    color: sty.studCoreColor,
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 0.75
  });

  // Helper to create crisp self-balanced printed graphic material (faithful whites & brand colors!)
  function makePrintedFaceMaterial(tex, { physical = false, clearcoat = 0.24, roughness = 0.34, lift = 0.32 } = {}) {
    if (physical) {
      return new THREE.MeshPhysicalMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: lift,
        roughness,
        metalness: 0.02,
        clearcoat,
        clearcoatRoughness: 0.26,
        transparent: true,
        opacity: 1
      });
    }
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: lift,
      roughness,
      metalness: 0.03,
      transparent: true,
      opacity: 1
    });
  }

  // =========================================================================
  // LAYER 0 — CNC-MILLED CARD CHASSIS MONOLITH & MASTER LAMINATED FACE
  // =========================================================================
  const layerChassis = new THREE.Group();
  assemblyRoot.add(layerChassis);

  const CHASSIS_DEPTH = 0.068;
  const CHASSIS_BEVEL = 0.018;
  const CHASSIS_HALF_Z = CHASSIS_DEPTH / 2 + CHASSIS_BEVEL;
  const chassisGeo = createExtrudedSlab(THREE, WORLD_W, WORLD_H, CHASSIS_DEPTH, 0.11, CHASSIS_BEVEL, CHASSIS_BEVEL);
  const chassisMesh = new THREE.Mesh(chassisGeo, [chassisBodyFrontMat, chassisSideMat]);
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  layerChassis.add(chassisMesh);

  const backTex = trackTex(makeCanvasTexture(THREE, baked.backplateCanvas, maxAnisotropy));
  const backplateMat = makePrintedFaceMaterial(backTex, { roughness: 0.42, lift: 0.20 });
  backplateMat.transparent = false;
  const backFaceGeo = createRoundedFaceGeo(THREE, WORLD_W - 0.044, WORLD_H - 0.044, 0.088);
  const backFaceMesh = new THREE.Mesh(backFaceGeo, backplateMat);
  backFaceMesh.rotation.y = Math.PI;
  backFaceMesh.position.z = -(CHASSIS_HALF_Z + 0.002);
  layerChassis.add(backFaceMesh);

  const frontFaceGeo = createRoundedFaceGeo(THREE, WORLD_W - 0.036, WORLD_H - 0.036, 0.09);
  const backdropTex = trackTex(makeCanvasTexture(THREE, baked.backdropCanvas, maxAnisotropy));
  const backdropFaceMat = makePrintedFaceMaterial(backdropTex, { roughness: 0.48, lift: 0.26 });
  backdropFaceMat.transparent = false;
  const backdropFaceMesh = new THREE.Mesh(frontFaceGeo, backdropFaceMat);
  backdropFaceMesh.position.z = CHASSIS_HALF_Z + 0.0015;
  backdropFaceMesh.receiveShadow = true;
  layerChassis.add(backdropFaceMesh);

  const masterTex = trackTex(makeCanvasTexture(THREE, baked.masterCanvas, maxAnisotropy));
  const masterFaceMat = makePrintedFaceMaterial(masterTex, { physical: true, clearcoat: 0.26, roughness: 0.34, lift: 0.34 });
  masterFaceMat.opacity = 0;
  masterFaceMat.depthWrite = false;
  const masterFaceMesh = new THREE.Mesh(frontFaceGeo, masterFaceMat);
  masterFaceMesh.position.z = CHASSIS_HALF_Z + 0.004;
  layerChassis.add(masterFaceMesh);

  // =========================================================================
  // LAYER 1 — SWISS-ALIGNED CORNER GUIDE PINS & CNC CORNER FASTENERS
  // =========================================================================
  // Aligned dead-center onto the 4 curved corners of the outer CNC bezel!
  const pinCorners = [
    [-WORLD_W / 2 + 0.058,  WORLD_H / 2 - 0.058],
    [ WORLD_W / 2 - 0.058,  WORLD_H / 2 - 0.058],
    [-WORLD_W / 2 + 0.058, -WORLD_H / 2 + 0.058],
    [ WORLD_W / 2 - 0.058, -WORLD_H / 2 + 0.058]
  ];
  const guidePins = [];
  const cornerStuds = [];
  const pinUnitGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 8);
  pinUnitGeo.rotateX(Math.PI / 2);

  const studCollarGeo = new THREE.TorusGeometry(0.028, 0.0065, 6, 16);
  const studBodyGeo = new THREE.CylinderGeometry(0.021, 0.024, 0.026, 12);
  studBodyGeo.rotateX(Math.PI / 2);
  const studCoreGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.030, 10);
  studCoreGeo.rotateX(Math.PI / 2);

  for (const [px, py] of pinCorners) {
    const pin = new THREE.Mesh(pinUnitGeo, pinMetalMat);
    pin.position.set(px, py, 0);
    assemblyRoot.add(pin);
    guidePins.push(pin);

    const studGroup = new THREE.Group();
    studGroup.position.set(px, py, 0);
    studGroup.add(new THREE.Mesh(studBodyGeo, bezelMetalMat));
    const collar = new THREE.Mesh(studCollarGeo, bezelMetalMat);
    collar.position.z = 0.009;
    studGroup.add(collar);
    const core = new THREE.Mesh(studCoreGeo, studCoreMat);
    core.position.z = 0.004;
    studGroup.add(core);
    assemblyRoot.add(studGroup);
    cornerStuds.push(studGroup);
  }

  // =========================================================================
  // LAYER 2 — ARCHITECTURAL INNER MAT & VIEWFINDER CORNER BRACKETS
  // =========================================================================
  const layerInnerMat = new THREE.Group();
  assemblyRoot.add(layerInnerMat);

  const photoW = rectToWorld(baked.photoRect);
  const innerMatGeo = createHollowFrame(
    THREE,
    WORLD_W - 0.13, WORLD_H - 0.13, 0.082,
    photoW.cx, photoW.cy, photoW.w + 0.044, photoW.h + 0.044, 0.072,
    0.016, 0.005, 0.005
  );
  const innerMatMesh = new THREE.Mesh(innerMatGeo, accentMetalMat);
  innerMatMesh.castShadow = true;
  layerInnerMat.add(innerMatMesh);

  const bracketThickness = 0.015;
  const bracketLen = 0.16;
  const bracketDepth = 0.018;
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const bx = photoW.cx + sx * (photoW.w / 2 + 0.054);
    const by = photoW.cy + sy * (photoW.h / 2 + 0.054);
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(bracketLen, bracketThickness, bracketDepth), bezelMetalMat);
    hBar.position.set(bx - sx * bracketLen / 2, by, 0.018);
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(bracketThickness, bracketLen, bracketDepth), bezelMetalMat);
    vBar.position.set(bx, by - sy * bracketLen / 2, 0.018);
    layerInnerMat.add(hBar, vBar);
  }

  // =========================================================================
  // LAYER 3 — THICK BEVELED 3D PRODUCT PHOTO SLAB (Кроссовки Daily)
  // =========================================================================
  const layerPhoto = new THREE.Group();
  assemblyRoot.add(layerPhoto);

  const PHOTO_DEPTH = 0.036;
  const PHOTO_BEVEL = 0.011;
  const PHOTO_HALF_Z = PHOTO_DEPTH / 2 + PHOTO_BEVEL;
  const photoSlabGeo = createExtrudedSlab(THREE, photoW.w, photoW.h, PHOTO_DEPTH, 0.064, PHOTO_BEVEL, PHOTO_BEVEL);
  const photoSlabMesh = new THREE.Mesh(photoSlabGeo, [chassisBodyFrontMat, crystalEdgeMat]);
  photoSlabMesh.position.set(photoW.cx, photoW.cy, 0);
  photoSlabMesh.castShadow = true;
  photoSlabMesh.receiveShadow = true;
  layerPhoto.add(photoSlabMesh);

  const photoFaceGeo = createRoundedFaceGeo(THREE, photoW.w - 0.022, photoW.h - 0.022, 0.056);
  const photoTex = trackTex(makeCanvasTexture(THREE, baked.photoCanvas, maxAnisotropy));
  const photoFaceMat = makePrintedFaceMaterial(photoTex, { physical: true, clearcoat: 0.22, roughness: 0.34, lift: 0.34 });
  const photoFaceMesh = new THREE.Mesh(photoFaceGeo, photoFaceMat);
  photoFaceMesh.position.set(photoW.cx, photoW.cy, PHOTO_HALF_Z + 0.002);
  layerPhoto.add(photoFaceMesh);

  const photoTrimGeo = createHollowFrame(
    THREE,
    photoW.w + 0.026, photoW.h + 0.026, 0.070,
    0, 0, photoW.w - 0.006, photoW.h - 0.006, 0.060,
    0.022, 0.005, 0.005
  );
  const photoTrimMesh = new THREE.Mesh(photoTrimGeo, bezelMetalMat);
  photoTrimMesh.position.set(photoW.cx, photoW.cy, 0.008);
  layerPhoto.add(photoTrimMesh);

  // =========================================================================
  // LAYER 3B — FLOATING 3D BADGE CAPSULE («Новая коллекция»)
  // =========================================================================
  const layerBadge = new THREE.Group();
  assemblyRoot.add(layerBadge);

  const badgeW = rectToWorld(baked.badgeRect);
  const badgeSlabGeo = createExtrudedSlab(THREE, badgeW.w, badgeW.h, 0.024, badgeW.h * 0.48, 0.007, 0.007);
  const badgeSideMat = new THREE.MeshPhysicalMaterial({
    color: 0x202422,
    metalness: 0.65,
    roughness: 0.24,
    clearcoat: 0.7,
    transparent: true,
    opacity: 1
  });
  const badgeSlabMesh = new THREE.Mesh(badgeSlabGeo, [badgeSideMat, bezelMetalMat]);
  badgeSlabMesh.position.set(badgeW.cx, badgeW.cy, 0);
  badgeSlabMesh.castShadow = true;
  layerBadge.add(badgeSlabMesh);

  const badgeFaceGeo = createRoundedFaceGeo(THREE, badgeW.w - 0.012, badgeW.h - 0.012, (badgeW.h - 0.012) * 0.48);
  const badgeTex = trackTex(makeCanvasTexture(THREE, baked.badgeCanvas, maxAnisotropy));
  const badgeFaceMat = makePrintedFaceMaterial(badgeTex, { roughness: 0.30, lift: 0.32 });
  const badgeFaceMesh = new THREE.Mesh(badgeFaceGeo, badgeFaceMat);
  badgeFaceMesh.position.set(badgeW.cx, badgeW.cy, 0.012 + 0.007 + 0.002);
  layerBadge.add(badgeFaceMesh);

  // =========================================================================
  // LAYER 4 — FLOATING FROSTED-CRYSTAL 3D TYPOGRAPHY BAR
  // =========================================================================
  const layerTitle = new THREE.Group();
  assemblyRoot.add(layerTitle);

  const titleW = rectToWorld(baked.titleRect);
  const titleSlabGeo = createExtrudedSlab(THREE, titleW.w, titleW.h, 0.024, 0.048, 0.008, 0.008);
  const titleGlassMat = new THREE.MeshPhysicalMaterial({
    color: sty.glassTint,
    metalness: 0.08,
    roughness: 0.16,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.42
  });
  const titleSlabMesh = new THREE.Mesh(titleSlabGeo, [titleGlassMat, crystalEdgeMat]);
  titleSlabMesh.position.set(titleW.cx, titleW.cy, 0);
  titleSlabMesh.castShadow = true;
  layerTitle.add(titleSlabMesh);

  const titleFaceGeo = createRoundedFaceGeo(THREE, titleW.w - 0.012, titleW.h - 0.012, 0.044);
  const titleTex = trackTex(makeCanvasTexture(THREE, baked.titleCanvas, maxAnisotropy));
  const titleFaceMat = makePrintedFaceMaterial(titleTex, { roughness: 0.34, lift: 0.34 });
  const titleFaceMesh = new THREE.Mesh(titleFaceGeo, titleFaceMat);
  titleFaceMesh.position.set(titleW.cx, titleW.cy, 0.012 + 0.008 + 0.0025);
  layerTitle.add(titleFaceMesh);

  // =========================================================================
  // LAYER 5 — THREE STAGGERED PHYSICAL 3D FEATURE TILES
  // =========================================================================
  const featureLayers = [];
  const featureFaceMats = [];
  const featureBodyMat = new THREE.MeshPhysicalMaterial({
    color: sty.chassisColor,
    metalness: 0.18,
    roughness: 0.30,
    clearcoat: 0.45,
    transparent: true,
    opacity: 1
  });

  baked.featureRects.forEach((fRect, idx) => {
    const fGroup = new THREE.Group();
    assemblyRoot.add(fGroup);
    const fw = rectToWorld(fRect);
    const fSlabGeo = createExtrudedSlab(THREE, fw.w, fw.h, 0.028, 0.032, 0.007, 0.007);
    const fSlab = new THREE.Mesh(fSlabGeo, [featureBodyMat, bezelMetalMat]);
    fSlab.position.set(fw.cx, fw.cy, 0);
    fSlab.castShadow = true;
    fGroup.add(fSlab);

    const fFaceGeo = createRoundedFaceGeo(THREE, fw.w - 0.012, fw.h - 0.012, 0.026);
    const fTex = trackTex(makeCanvasTexture(THREE, baked.featureCanvases[idx], maxAnisotropy));
    const fFaceMat = makePrintedFaceMaterial(fTex, { roughness: 0.36, lift: 0.34 });
    featureFaceMats.push(fFaceMat);
    const fFace = new THREE.Mesh(fFaceGeo, fFaceMat);
    fFace.position.set(fw.cx, fw.cy, 0.014 + 0.007 + 0.002);
    fGroup.add(fFace);

    const pip = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.012, 0.012), accentMetalMat);
    pip.position.set(fw.cx - fw.w / 2 + 0.082, fw.cy + fw.h / 2 - 0.022, 0.026);
    fGroup.add(pip);

    featureLayers.push(fGroup);
  });

  // =========================================================================
  // LAYER 6 — HERO 3D PRICE MONOLITH (32 500 ₸) + EXTRUDED BALANCE BAR
  // =========================================================================
  const layerPrice = new THREE.Group();
  assemblyRoot.add(layerPrice);

  const priceW = rectToWorld(baked.priceRect);
  const PRICE_DEPTH = 0.054;
  const PRICE_BEVEL = 0.014;
  const priceSlabGeo = createExtrudedSlab(THREE, priceW.w, priceW.h, PRICE_DEPTH, 0.044, PRICE_BEVEL, PRICE_BEVEL);
  const priceSlabMesh = new THREE.Mesh(priceSlabGeo, [priceSideMat, priceSideMat]);
  priceSlabMesh.position.set(priceW.cx, priceW.cy, 0);
  priceSlabMesh.castShadow = true;
  priceSlabMesh.receiveShadow = true;
  layerPrice.add(priceSlabMesh);

  const priceFaceGeo = createRoundedFaceGeo(THREE, priceW.w - 0.018, priceW.h - 0.018, 0.036);
  const priceTex = trackTex(makeCanvasTexture(THREE, baked.priceCanvas, maxAnisotropy));
  const priceFaceMat = makePrintedFaceMaterial(priceTex, { physical: true, clearcoat: 0.72, roughness: 0.22, lift: 0.36 });
  const priceFaceMesh = new THREE.Mesh(priceFaceGeo, priceFaceMat);
  priceFaceMesh.position.set(priceW.cx, priceW.cy, PRICE_DEPTH / 2 + PRICE_BEVEL + 0.0022);
  layerPrice.add(priceFaceMesh);

  const layerBalanceBar = new THREE.Group();
  assemblyRoot.add(layerBalanceBar);
  const barLeftX = (54 - CARD_PX_W / 2) * PX_TO_WORLD;
  const barFullW = (792 - baked.priceRect.width - 36) * PX_TO_WORLD;
  const hairlineRod = new THREE.Mesh(new THREE.BoxGeometry(barFullW, 0.009, 0.016), bezelMetalMat);
  hairlineRod.position.set(barLeftX + barFullW / 2, priceW.cy, 0);
  const accentSlug = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.028), accentMetalMat);
  accentSlug.position.set(barLeftX + 0.07, priceW.cy, 0.006);
  layerBalanceBar.add(hairlineRod, accentSlug);

  // =========================================================================
  // LAYER 7 — SLEEK CNC OUTER BEZEL RING & OPTICAL CRYSTAL SHIELD
  // =========================================================================
  const layerBezel = new THREE.Group();
  assemblyRoot.add(layerBezel);

  // Sleek machined bezel: hairline anodized rim when docked, precision watch bezel when exploded
  const outerBezelGeo = createHollowFrame(
    THREE,
    WORLD_W + 0.030, WORLD_H + 0.030, 0.122,
    0, 0, WORLD_W - 0.038, WORLD_H - 0.038, 0.092,
    0.024, 0.0065, 0.0065
  );
  const outerBezelMesh = new THREE.Mesh(outerBezelGeo, bezelMetalMat);
  outerBezelMesh.castShadow = true;
  layerBezel.add(outerBezelMesh);

  const opticalGlintTex = trackTex(createOpticalGlintTexture(THREE));
  const opticalGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: opticalGlintTex,
    roughness: 0.06,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    envMapIntensity: 1.85
  });
  const opticalGlassMesh = new THREE.Mesh(
    createRoundedFaceGeo(THREE, WORLD_W - 0.036, WORLD_H - 0.036, 0.092),
    opticalGlassMat
  );
  opticalGlassMesh.position.z = 0.005;
  layerBezel.add(opticalGlassMesh);

  // =========================================================================
  // DYNAMIC THEME + STYLE MATERIAL SYNC
  // =========================================================================
  function isDarkTheme() {
    return document.documentElement.dataset.theme === 'dark';
  }

  function applyThemeLighting() {
    const dark = isDarkTheme();
    const spec = STYLE_MATERIALS[activeStyle];
    glRenderer.toneMappingExposure = dark ? 1.12 : 1.04;
    hemiLight.intensity = dark ? 0.64 : 0.78;
    keyLight.intensity = dark ? 1.52 : 1.38;
    fillLight.intensity = dark ? 0.66 : 0.56;
    rimLight.color.setHex(spec.rimLightColor);
    rimLight.intensity = dark ? spec.rimIntensityDark : spec.rimIntensityLight;
    realShadowMat.opacity = dark ? 0.16 : 0.055;
    softShadowMat.opacity = dark ? 0.92 : 0.74;
    coreShadowMat.opacity = dark ? 0.62 : 0.36;
    haloMat.color.setHex(dark ? spec.haloColorDark : spec.haloColorLight);
    haloMat.opacity = dark ? 0.48 : 0.38;
    innerHaloMat.color.setHex(dark ? spec.haloColorDark : spec.haloColorLight);
    innerHaloMat.opacity = dark ? 0.24 : 0.18;
  }

  function replaceTexture(mat, canvasSource) {
    const old = mat.map;
    const fresh = trackTex(makeCanvasTexture(THREE, canvasSource, maxAnisotropy));
    mat.map = fresh;
    if ('emissiveMap' in mat && mat.emissiveMap) {
      mat.emissiveMap = fresh;
    }
    mat.needsUpdate = true;
    if (old) {
      old.dispose();
      const idx = ownedTextures.indexOf(old);
      if (idx >= 0) ownedTextures.splice(idx, 1);
    }
  }

  function setStyle(template) {
    if (disposed || !STYLE_MATERIALS[template] || template === activeStyle) return;
    activeStyle = template;
    baked = bakeStyleAssets(template);
    const spec = STYLE_MATERIALS[template];

    replaceTexture(masterFaceMat, baked.masterCanvas);
    replaceTexture(backdropFaceMat, baked.backdropCanvas);
    replaceTexture(backplateMat, baked.backplateCanvas);
    replaceTexture(photoFaceMat, baked.photoCanvas);
    replaceTexture(titleFaceMat, baked.titleCanvas);
    replaceTexture(badgeFaceMat, baked.badgeCanvas);
    replaceTexture(priceFaceMat, baked.priceCanvas);
    featureFaceMats.forEach((m, idx) => replaceTexture(m, baked.featureCanvases[idx]));

    chassisBodyFrontMat.color.setHex(spec.chassisColor);
    chassisSideMat.color.setHex(spec.metalColor);
    chassisSideMat.metalness = spec.metalness;
    chassisSideMat.roughness = spec.metalRoughness;
    bezelMetalMat.color.setHex(spec.bezelColor);
    bezelMetalMat.metalness = spec.bezelMetalness;
    bezelMetalMat.roughness = spec.bezelRoughness;
    accentMetalMat.color.setHex(spec.accentColor);
    accentMetalMat.metalness = spec.accentMetalness;
    accentMetalMat.roughness = spec.accentRoughness;
    priceSideMat.color.setHex(spec.priceSideColor);
    priceSideMat.roughness = spec.priceRoughness;
    featureBodyMat.color.setHex(spec.chassisColor);
    titleGlassMat.color.setHex(spec.glassTint);
    pinMetalMat.color.setHex(spec.pinColor);
    studCoreMat.color.setHex(spec.studCoreColor);
    applyThemeLighting();

    const label = rendererApi.templates[template]?.label || 'Студия';
    const priceLabel = new Intl.NumberFormat('ru-RU').format(baked.state.price ?? 44900);
    canvas.setAttribute('aria-label', `Интерактивная 3D-модель карточки товара «${baked.state.title}» — ${priceLabel} ₸ (${label})`);

    stylePulse = 1.0;
    requestRender();
  }

  // =========================================================================
  // CHOREOGRAPHY, SCROLL EXPLOSION, POINTER DRAG & INTERACTIVE LOOP
  // =========================================================================
  const INTRO_HOLD_MS = 640;
  const INTRO_ASSEMBLE_MS = 1850;
  const FRAME_INTERVAL_MS = 1000 / 60;
  const FRAME_TOLERANCE_MS = 0.5;

  let disposed = false;
  let rafId = 0;
  let nextRenderAt = null;
  let prevNow = 0;
  let isVisible = true;
  let introStart = 0;
  let introDone = false;
  let wheelExplode = 0;
  let reportedExploded = false;
  let stylePulse = 0;
  let forcedPose = null;

  let currentExplode = 0.96;
  let currentYaw = -0.58;
  let currentPitch = 0.16;
  let currentCamZ = 7.45;

  let hoverX = 0;
  let hoverY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragYawOffset = 0;
  let dragPitchOffset = 0;
  let dragVelocityX = 0;
  let lastDragTime = 0;
  let dragReturnTimer = 0;

  function requestRender() {
    if (disposed || !isVisible || document.hidden || rafId) return;
    if (window.__SATUCARD_HERO_STATE?.webglActive) window.__SATUCARD_HERO_STATE.idleSleeping = false;
    rafId = requestAnimationFrame(tick);
  }

  function cancelRender() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    nextRenderAt = null;
    prevNow = 0;
  }

  function applyLayerStack(explodeVal, pulseOffset = 0) {
    const e = clamp(explodeVal + pulseOffset * 0.24, 0, 1.15);

    const eBack = smoothstep(0.0, 0.92, e);
    const eMat = smoothstep(0.04, 0.94, e);
    const ePhoto = smoothstep(0.06, 0.95, e);
    const eBadge = smoothstep(0.10, 0.98, e);
    const eTitle = smoothstep(0.08, 0.96, e);
    const ePrice = smoothstep(0.05, 1.0, e);
    const eBezel = smoothstep(0.02, 0.98, e);

    const zChassis = -0.024 - 0.88 * eBack;
    const zInnerMat = 0.002 - 0.50 * eMat;
    const zPhoto = 0.006 - 0.14 * ePhoto;
    const zBadge = 0.014 + 0.18 * eBadge;
    const zTitle = 0.012 + 0.30 * eTitle;
    const zBalance = 0.012 + 0.54 * ePrice;
    const zPrice = 0.016 + 0.78 * ePrice;
    const zBezel = 0.022 + 0.98 * eBezel;
    const zStud = 0.032 + 1.07 * eBezel;

    layerChassis.position.z = zChassis;
    layerInnerMat.position.z = zInnerMat;
    layerPhoto.position.z = zPhoto;
    layerBadge.position.z = zBadge;
    layerTitle.position.z = zTitle;
    layerBalanceBar.position.z = zBalance;
    layerPrice.position.z = zPrice;
    layerBezel.position.z = zBezel;

    featureLayers.forEach((fGroup, i) => {
      const fProg = smoothstep(0.08 + i * 0.035, 0.98, e);
      fGroup.position.z = 0.012 + (0.44 + i * 0.085) * fProg;
    });

    // Guide pins span cleanly from chassis front right into every corner fastener stud
    const pinStart = zChassis + CHASSIS_HALF_Z;
    const pinEnd = zStud - 0.008;
    const pinSpan = Math.max(0.001, pinEnd - pinStart);
    const pinMid = (pinEnd + pinStart) / 2;
    const pinVisible = e > 0.05;
    guidePins.forEach(pin => {
      pin.visible = pinVisible;
      pin.scale.z = pinSpan;
      pin.position.z = pinMid;
    });

    const studVisible = e > 0.04;
    const studScale = smoothstep(0.04, 0.24, e);
    cornerStuds.forEach(stud => {
      stud.visible = studVisible;
      stud.position.z = zStud;
      stud.scale.setScalar(Math.max(0.001, studScale));
    });

    // Overlap master face to 100% opacity BEFORE sub-layers hide -> zero mid-dock ghosting!
    const masterOpacity = 1 - smoothstep(0.024, 0.085, e);
    const subVisibility = smoothstep(0.006, 0.028, e);

    masterFaceMesh.visible = masterOpacity > 0.005;
    masterFaceMat.opacity = masterOpacity;

    const showSubs = subVisibility > 0.005;
    layerInnerMat.visible = showSubs;
    layerPhoto.visible = showSubs;
    layerBadge.visible = showSubs;
    layerTitle.visible = showSubs;
    layerBalanceBar.visible = showSubs;
    layerPrice.visible = showSubs;
    featureLayers.forEach(fg => { fg.visible = showSubs; });

    photoFaceMat.opacity = subVisibility;
    titleFaceMat.opacity = subVisibility;
    titleGlassMat.opacity = 0.42 * smoothstep(0.06, 0.32, e);
    badgeFaceMat.opacity = subVisibility;
    badgeSideMat.opacity = subVisibility;
    priceFaceMat.opacity = subVisibility;
    featureBodyMat.opacity = subVisibility;
    featureFaceMats.forEach(m => { m.opacity = subVisibility; });

    opticalGlassMat.opacity = 0.03 + 0.18 * smoothstep(0.08, 0.72, e);
    outerBezelMesh.position.z = -0.018 * (1 - smoothstep(0.0, 0.18, e));

    // Soft studio contact shadows widen dynamically underneath the exploded layers
    softShadowPlane.scale.set(1 + 0.42 * e, 1 + 0.56 * e, 1);
    coreShadowPlane.scale.set(1 + 0.34 * e, 1 + 0.85 * e, 1);
  }

  let viewportWidth = 0;
  let viewportHeight = 0;
  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    const w = Math.max(260, Math.round(rect.width));
    const h = Math.max(280, Math.round(rect.height));
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(500000 / (w * h)));
    if (w === viewportWidth && h === viewportHeight && ratio === glRenderer.getPixelRatio()) return;
    viewportWidth = w;
    viewportHeight = h;
    camera.aspect = w / h;
    const aspectFit = camera.aspect < 0.92 ? (0.92 / camera.aspect) : 1.0;
    camera.userData.baseZ = 7.45 * aspectFit;
    camera.updateProjectionMatrix();
    glRenderer.setPixelRatio(ratio);
    glRenderer.setSize(w, h, false);
    requestRender();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const io = new IntersectionObserver(entries => {
    isVisible = entries.some(entry => entry.isIntersecting);
    if (!isVisible) {
      cancelRender();
    } else if (isVisible) {
      requestRender();
    }
  }, { rootMargin: '60px' });
  io.observe(container);

  function onVisibilityChange() {
    if (document.hidden) {
      cancelRender();
    } else if (!document.hidden && isVisible) {
      requestRender();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  const themeObserver = new MutationObserver(() => {
    applyThemeLighting();
    requestRender();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  applyThemeLighting();

  function onPointerMove(ev) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    hoverX = clamp(((ev.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    hoverY = clamp(((ev.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    if (isDragging) {
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      dragStartX = ev.clientX;
      dragStartY = ev.clientY;
      dragYawOffset = clamp(dragYawOffset + dx * 0.0085, -Math.PI, Math.PI);
      dragPitchOffset = clamp(dragPitchOffset + dy * 0.0055, -0.45, 0.45);
      dragVelocityX = dx * 0.004;
      lastDragTime = performance.now();
    }
    requestRender();
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    isDragging = true;
    introDone = true;
    forcedPose = null;
    clearTimeout(dragReturnTimer);
    dragStartX = ev.clientX;
    dragStartY = ev.clientY;
    dragVelocityX = 0;
    lastDragTime = performance.now();
    canvas.setPointerCapture?.(ev.pointerId);
    container.classList.add('is-dragging');
    requestRender();
  }

  function onPointerUp(ev) {
    if (!isDragging) return;
    isDragging = false;
    lastDragTime = performance.now();
    canvas.releasePointerCapture?.(ev.pointerId);
    container.classList.remove('is-dragging');
    clearTimeout(dragReturnTimer);
    dragReturnTimer = setTimeout(requestRender, 1850);
    requestRender();
  }

  function onPointerLeave() {
    hoverX = 0;
    hoverY = 0;
    requestRender();
  }

  function onWindowPointerMove(ev) {
    if (isDragging && ev.target !== canvas) onPointerMove(ev);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

  function onContextLost(ev) {
    ev.preventDefault();
    cancelRender();
    onFallback?.(new Error('WebGL context lost'));
  }
  canvas.addEventListener('webglcontextlost', onContextLost);

  function setExploded(next) {
    wheelExplode = next ? 1 : 0;
    introDone = true;
    forcedPose = null;
    reportedExploded = Boolean(next);
    onExplodeChange?.(reportedExploded);
    requestRender();
  }

  function setPose(pose) {
    forcedPose = pose ? { ...pose } : null;
    if (forcedPose) {
      introDone = true;
      currentExplode = forcedPose.explode ?? currentExplode;
      currentYaw = forcedPose.yaw ?? currentYaw;
      currentPitch = forcedPose.pitch ?? currentPitch;
    }
    requestRender();
  }

  function tick(now) {
    rafId = 0;
    if (disposed || !isVisible || document.hidden) return;

    nextRenderAt ??= now;
    const elapsed = now + FRAME_TOLERANCE_MS - nextRenderAt;
    if (elapsed < 0) {
      requestRender();
      return;
    }
    // Keep the 60 FPS cadence on high-refresh screens and skip missed frames.
    nextRenderAt += (Math.floor(elapsed / FRAME_INTERVAL_MS) + 1) * FRAME_INTERVAL_MS;

    const dt = prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 0.016;
    prevNow = now;
    if (!introStart) introStart = now;

    const baseZ = camera.userData.baseZ || 7.45;
    let targetExplode = 0;
    let targetYaw = -0.14;
    let targetPitch = 0.045;
    let targetCamZ = baseZ;
    let phase = 'ready';
    let keepRunning = false;

    if (forcedPose) {
      phase = 'custom';
      targetExplode = forcedPose.explode ?? 0;
      targetYaw = forcedPose.yaw ?? -0.14;
      targetPitch = forcedPose.pitch ?? 0.045;
      targetCamZ = baseZ + targetExplode * 0.44;
      currentExplode = targetExplode;
      currentYaw = targetYaw;
      currentPitch = targetPitch;
      currentCamZ = targetCamZ;
    } else if (!introDone) {
      keepRunning = true;
      const elapsed = now - introStart;
      if (elapsed < INTRO_HOLD_MS) {
        phase = 'animating';
        const holdU = elapsed / INTRO_HOLD_MS;
        currentExplode = 0.96;
        currentYaw = -0.60 + holdU * 0.05;
        currentPitch = 0.165 - holdU * 0.01;
        currentCamZ = baseZ + 0.34;
      } else {
        const u = clamp01((elapsed - INTRO_HOLD_MS) / INTRO_ASSEMBLE_MS);
        if (u >= 1) {
          introDone = true;
          phase = 'ready';
        } else {
          phase = 'animating';
        }
        const eAssemble = easeInOutCubic(u);
        const eOrbit = easeOutQuint(u);
        currentExplode = 0.96 * (1 - eAssemble);
        currentYaw = -0.55 + (-0.14 - (-0.55)) * eOrbit;
        currentPitch = 0.155 + (0.045 - 0.155) * eOrbit;
        currentCamZ = baseZ + 0.34 * (1 - eOrbit);
      }
    } else {
      targetExplode = wheelExplode * 0.96;

      const baseYaw = -0.14 - 0.44 * wheelExplode;
      const basePitch = 0.045 + 0.115 * wheelExplode;

      if (!isDragging) {
        if (Math.abs(dragVelocityX) > 0.0004) {
          dragYawOffset += dragVelocityX * dt * 60;
          dragVelocityX *= Math.pow(0.06, dt);
          keepRunning = true;
        } else {
          dragVelocityX = 0;
        }
        if (now - lastDragTime > 1800 && (Math.abs(dragYawOffset) > 0.0008 || Math.abs(dragPitchOffset) > 0.0008)) {
          dragYawOffset += (0 - dragYawOffset) * Math.min(1, dt * 2.6);
          dragPitchOffset += (0 - dragPitchOffset) * Math.min(1, dt * 2.6);
          keepRunning = true;
        }
      } else {
        keepRunning = true;
      }

      targetYaw = baseYaw + hoverX * 0.12 + dragYawOffset;
      targetPitch = basePitch + hoverY * 0.075 + dragPitchOffset;
      targetCamZ = baseZ + targetExplode * 0.40;

      const damp = 1 - Math.exp(-7.8 * dt);
      currentExplode += (targetExplode - currentExplode) * damp;
      currentYaw += (targetYaw - currentYaw) * (isDragging ? 0.35 : damp);
      currentPitch += (targetPitch - currentPitch) * (isDragging ? 0.35 : damp);
      currentCamZ += (targetCamZ - currentCamZ) * damp;

      if (
        Math.abs(currentExplode - targetExplode) > 0.0008 ||
        Math.abs(currentYaw - targetYaw) > 0.0008 ||
        Math.abs(currentPitch - targetPitch) > 0.0008 ||
        Math.abs(currentCamZ - targetCamZ) > 0.001
      ) {
        keepRunning = true;
      } else {
        currentExplode = targetExplode;
        currentYaw = targetYaw;
        currentPitch = targetPitch;
        currentCamZ = targetCamZ;
      }
    }

    if (stylePulse > 0.001) {
      stylePulse = Math.max(0, stylePulse - dt * 2.6);
      keepRunning = true;
    }
    const pulseWave = Math.sin(Math.PI * stylePulse);

    assemblyRoot.position.y = 0.06;
    assemblyRoot.rotation.y = currentYaw + pulseWave * 0.14;
    assemblyRoot.rotation.x = currentPitch;
    camera.position.z = currentCamZ;

    frontSpecLight.position.x = -1.5 + Math.sin(currentYaw * 2.2) * 1.9 + hoverX * 1.1;
    frontSpecLight.position.y = 2.1 - hoverY * 0.8;

    haloRing.rotation.z = currentYaw * 0.35;

    applyLayerStack(currentExplode, pulseWave);
    glRenderer.render(scene, camera);

    window.__SATUCARD_HERO_STATE = {
      mode: '3d-webgl',
      phase,
      explode: Number(currentExplode.toFixed(4)),
      wheelExplode: Number(wheelExplode.toFixed(4)),
      yawDeg: Number((currentYaw * 180 / Math.PI).toFixed(2)),
      pitchDeg: Number((currentPitch * 180 / Math.PI).toFixed(2)),
      manualExplode: reportedExploded,
      style: activeStyle,
      webglActive: true,
      idleSleeping: !keepRunning
    };

    if (keepRunning) {
      requestRender();
    }
  }

  applyLayerStack(currentExplode, 0);
  assemblyRoot.rotation.y = currentYaw;
  assemblyRoot.rotation.x = currentPitch;
  camera.position.z = (camera.userData.baseZ || 7.45) + 0.34;
  glRenderer.render(scene, camera);

  onStageReady?.();
  requestRender();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelRender();
    clearTimeout(dragReturnTimer);
    ro.disconnect();
    io.disconnect();
    themeObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    ownedTextures.forEach(t => t.dispose());
    environmentTarget.dispose();
    keyLight.shadow.dispose();
    softShadowTex.dispose();
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else if (obj.material) obj.material.dispose();
    });
    glRenderer.dispose();
    glRenderer.forceContextLoss();
    canvas.remove();
    if (window.__SATUCARD_HERO_3D === controller) delete window.__SATUCARD_HERO_3D;
  }

  const controller = {
    setStyle,
    setExploded,
    toggleExploded: () => setExploded(!reportedExploded),
    isExploded: () => reportedExploded,
    setPose,
    dispose
  };
  window.__SATUCARD_HERO_3D = controller;
  return controller;
}
