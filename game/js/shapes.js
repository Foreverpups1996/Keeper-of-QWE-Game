'use strict';
// ===== Минималистичная графика из фигур =====
// Всё в игре (мобы, игрок, предметы, сундуки) рисуется этими функциями.
// look = { shape, color, eyes? }

function shapePath(c, shape, x, y, r) {
  c.beginPath();
  switch (shape) {
    case 'circle': c.arc(x, y, r, 0, Math.PI * 2); break;
    case 'blob': // полукруг-капля (слизень)
      c.moveTo(x - r, y + r * 0.6);
      c.bezierCurveTo(x - r, y - r * 1.1, x + r, y - r * 1.1, x + r, y + r * 0.6);
      c.closePath(); break;
    case 'square': c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
    case 'triangle':
      c.moveTo(x, y - r); c.lineTo(x + r * 0.95, y + r * 0.75); c.lineTo(x - r * 0.95, y + r * 0.75); c.closePath(); break;
    case 'diamond':
      c.moveTo(x, y - r); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.8, y); c.closePath(); break;
    case 'pentagon': case 'hexagon': {
      const n = shape === 'pentagon' ? 5 : 6;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / n;
        i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.closePath(); break;
    }
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath(); break;
    case 'drop': // пламя
      c.moveTo(x, y - r * 1.1);
      c.bezierCurveTo(x + r * 1.1, y - r * 0.1, x + r * 0.8, y + r, x, y + r);
      c.bezierCurveTo(x - r * 0.8, y + r, x - r * 1.1, y - r * 0.1, x, y - r * 1.1);
      c.closePath(); break;
    case 'arch': // призрак: купол с волнистым низом
      c.moveTo(x - r * 0.85, y + r * 0.9);
      c.lineTo(x - r * 0.85, y - r * 0.1);
      c.arc(x, y - r * 0.1, r * 0.85, Math.PI, 0);
      c.lineTo(x + r * 0.85, y + r * 0.9);
      for (let i = 0; i < 3; i++) {
        const x0 = x + r * 0.85 - (i + 1) * r * 0.567;
        c.quadraticCurveTo(x0 + r * 0.28, y + r * 0.5, x0, y + r * 0.9);
      }
      c.closePath(); break;
    case 'cross':
      c.rect(x - r * 0.3, y - r, r * 0.6, r * 2); c.rect(x - r, y - r * 0.3, r * 2, r * 0.6); break;
    case 'blade': // вытянутый ромб (оружие)
      c.moveTo(x + r * 0.9, y - r * 0.9); c.lineTo(x + r * 0.2, y + r * 0.1); c.lineTo(x - r * 0.9, y + r * 0.9);
      c.lineTo(x - r * 0.1, y - r * 0.2); c.closePath(); break;
    case 'ring':
      c.arc(x, y, r, 0, Math.PI * 2); c.moveTo(x + r * 0.5, y); c.arc(x, y, r * 0.5, 0, Math.PI * 2, true); break;
    case 'rect':
      c.rect(x - r * 0.7, y - r * 0.95, r * 1.4, r * 1.9); break;
    default: c.arc(x, y, r, 0, Math.PI * 2);
  }
}

function hexRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function rgbStr([r, g, b], a = 1) { return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function shadeHex(hex, amt) {
  try {
    const [r, g, b] = hexRgb(hex);
    return rgbStr([Math.max(0, Math.min(255, r + amt)), Math.max(0, Math.min(255, g + amt)), Math.max(0, Math.min(255, b + amt))]);
  } catch (e) { return hex; }
}

// Мягкая эллиптическая тень — ключ к ощущению 3D сверху
function drawShadow(c, x, y, r, alpha = 0.28, squashY = 0.32) {
  c.save();
  c.fillStyle = `rgba(0,0,0,${alpha})`;
  c.beginPath(); c.ellipse(x, y + r * 0.95, r * (0.85 + r * 0.008), r * squashY, 0, 0, Math.PI * 2); c.fill();
  // контактное ядро тени (темнее под центром)
  c.fillStyle = `rgba(0,0,0,${alpha * 0.7})`;
  c.beginPath(); c.ellipse(x, y + r * 0.95, r * 0.45, r * 0.17, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawShape(c, look, x, y, r, opts = {}) {
  drawShape3D(c, look, x, y, r, opts);
}

// Псевдо-3D: боковая грань (экструзия вниз) + верхняя грань с градиентом + блик + глаза
function drawShape3D(c, look, x, y, r, opts = {}) {
  const color = look.color;
  const h = opts.h != null ? opts.h : Math.max(3, r * 0.38); // высота выдавливания
  const leanX = (opts.lookX || 0) * r * 0.1 + (opts.tiltX || 0);
  const leanY = (opts.lookY || 0) * r * 0.06 + (opts.tiltY || 0);
  const squash = opts.squash || 0; // -1..1: приседание/растяжение при прыжке/беге
  const ry = r * (1 - squash * 0.12);
  const rx = r * (1 + squash * 0.12);
  c.save();
  if (opts.alpha != null) c.globalAlpha *= opts.alpha;
  if (opts.shadow !== false) {
    const shScale = 1 - Math.min(0.35, (opts.lift || 0) * 0.05);
    drawShadow(c, x, y, r * shScale, 0.3 * (opts.alpha != null ? opts.alpha : 1));
  }
  const topY = y - h * 0.35 - (opts.lift || 0);
  const sideY = y + h * 0.3 - (opts.lift || 0) * 0.4;
  // --- боковая грань: тянем контур вниз ---
  c.save();
  shapePath(c, look.shape, x + leanX * 0.4, sideY, rx > ry ? rx : r);
  c.fillStyle = shadeHex(color, -52);
  c.fill('evenodd');
  // вертикальные рёбра-блики по бокам для объёма
  c.globalAlpha *= 0.35;
  c.fillStyle = '#000';
  c.fillRect(x - rx * 0.85 + leanX * 0.4, sideY - ry * 0.6, rx * 0.3, h * 0.9 + ry * 0.6);
  c.restore();
  // --- верхняя грань с объёмным градиентом ---
  const g = c.createLinearGradient(x - rx, topY - ry, x + rx, topY + ry);
  g.addColorStop(0, shadeHex(color, 42));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shadeHex(color, -38));
  shapePath(c, look.shape, x + leanX, topY, (rx + ry) / 2);
  c.fillStyle = g;
  c.fill('evenodd');
  c.lineWidth = Math.max(1.5, r * (opts.outline ? 0.2 : 0.12));
  c.strokeStyle = opts.outline || 'rgba(0,0,0,0.45)';
  c.stroke();
  // верхняя кромка-свет (фейковый источник света слева-сверху)
  c.save();
  c.globalAlpha *= 0.5;
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = Math.max(1, r * 0.07);
  c.beginPath(); c.arc(x + leanX, topY, ((rx + ry) / 2) * 0.82, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
  c.restore();
  // блик
  const a = c.globalAlpha;
  c.globalAlpha = a * 0.28;
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(x - rx * 0.3 + leanX, topY - ry * 0.35, rx * 0.18, 0, Math.PI * 2); c.fill();
  c.globalAlpha = a;
  if (look.eyes) {
    const ey = topY + (look.shape === 'triangle' ? ry * 0.15 : look.shape === 'blob' ? ry * 0.05 : -ry * 0.1);
    const dx = (opts.lookX || 0) * r * 0.12, dy = (opts.lookY || 0) * r * 0.12;
    // глазницы с объёмом
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.arc(x - rx * 0.28 + dx, ey + dy + 1.5, rx * 0.19, 0, 7); c.arc(x + rx * 0.28 + dx, ey + dy + 1.5, rx * 0.19, 0, 7); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(x - rx * 0.28 + dx, ey + dy, rx * 0.17, 0, 7); c.arc(x + rx * 0.28 + dx, ey + dy, rx * 0.17, 0, 7); c.fill();
    c.fillStyle = '#111';
    c.beginPath(); c.arc(x - rx * 0.28 + dx * 1.6, ey + dy * 1.6, rx * 0.08, 0, 7); c.arc(x + rx * 0.28 + dx * 1.6, ey + dy * 1.6, rx * 0.08, 0, 7); c.fill();
    // блик в глазах
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(x - rx * 0.28 + dx * 1.6 - 1, ey + dy * 1.6 - 1, rx * 0.025, 0, 7); c.arc(x + rx * 0.28 + dx * 1.6 - 1, ey + dy * 1.6 - 1, rx * 0.025, 0, 7); c.fill();
  }
  c.restore();
}

// Иконка для HTML-интерфейса: рисуем фигуру в маленький canvas и кешируем как картинку
const _iconCache = new Map();
function iconURL(look, size) {
  const key = look.shape + look.color + (look.eyes ? 1 : 0) + size;
  let url = _iconCache.get(key);
  if (!url) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size * 2; // x2 для чёткости
    drawShape(cv.getContext('2d'), look, size, size * 0.95, size * 0.72, { shadow: false });
    url = cv.toDataURL();
    _iconCache.set(key, url);
  }
  return url;
}
function iconHtml(look, size = 22) {
  return `<img class="ico" src="${iconURL(look, size)}" width="${size}" height="${size}" alt="">`;
}
