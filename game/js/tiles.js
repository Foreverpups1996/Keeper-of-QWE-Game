'use strict';
// ===== Отрисовка клеток мира: плоский цвет + псевдо-3D объём, свет и глубина =====
function shade([r, g, b], v) {
  return `rgb(${Math.max(0, Math.min(255, r + v)) | 0},${Math.max(0, Math.min(255, g + v)) | 0},${Math.max(0, Math.min(255, b + v)) | 0})`;
}

// мягкая тень под объектом внутри клетки (дерево, камень, сундук нарисуется отдельно)
function tileShadow(ctx, sx, sy, w = 20) {
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath(); ctx.ellipse(sx + 16, sy + 25, w / 2, 5, 0, 0, Math.PI * 2); ctx.fill();
}
// верхний свет / нижняя тень клетки — даёт ощущение рельефа
function tileBevel(ctx, sx, sy, top = 'rgba(255,255,255,0.07)', bottom = 'rgba(0,0,0,0.18)') {
  ctx.fillStyle = top; ctx.fillRect(sx, sy, TS, 2);
  ctx.fillStyle = bottom; ctx.fillRect(sx, sy + TS - 2, TS, 2);
}

function drawTile(ctx, t, sx, sy, x, y, time = 0) {
  const info = TILE_INFO[t];
  const n = hash2(x, y, 7);
  // базовый градиент вместо плоской заливки — свет сверху
  const base = shade(info.color, (n - 0.5) * 14);
  const g = ctx.createLinearGradient(sx, sy, sx, sy + TS);
  g.addColorStop(0, shade(info.color, (n - 0.5) * 14 + 10));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(info.color, (n - 0.5) * 14 - 12));
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, TS, TS);
  const n2 = hash2(x, y, 13);
  const n3 = hash2(x, y, 29);
  switch (t) {
    case T.DEEP: case T.WATER: {
      // глубина: тёмная подложка + движущиеся блики (время приходит из render)
      const ph = Math.sin(time * 1.5 + x * 0.7 + y * 0.4);
      const ph2 = Math.cos(time * 1.1 + y * 0.9 + x * 0.3);
      ctx.fillStyle = t === T.DEEP ? 'rgba(0,0,20,0.25)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(sx, sy + TS - 8, TS, 8);
      if (n2 < 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.20)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const ox = sx + 6 + ph * 3, oy = sy + 10 + n * 12;
        ctx.moveTo(ox, oy); ctx.quadraticCurveTo(ox + 5, oy - 4, ox + 10, oy); ctx.quadraticCurveTo(ox + 15, oy + 4, ox + 20, oy);
        ctx.stroke();
      }
      if (n3 < 0.3) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath(); ctx.arc(sx + 16 + ph2 * 4, sy + 16 + ph * 3, 1.4, 0, 7); ctx.fill();
      }
      break;
    }
    case T.GRASS: {
      tileBevel(ctx, sx, sy);
      // объёмные травинки с тенью
      if (n2 < 0.3) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(sx + 9 + n * 14, sy + 12 + n2 * 30, 2, 6);
        ctx.fillStyle = n3 > 0.5 ? '#3f9b3a' : '#55b04a';
        ctx.fillRect(sx + 8 + n * 14, sy + 10 + n2 * 30, 2, 6);
        ctx.fillRect(sx + 12 + n * 14, sy + 12 + n2 * 30, 2, 5);
      } else if (n2 > 0.96) {
        tileShadow(ctx, sx, sy, 10);
        ctx.fillStyle = n > 0.5 ? '#ffe36b' : '#ff8fd0';
        ctx.beginPath(); ctx.arc(sx + 16, sy + 14, 3, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(sx + 15, sy + 13, 1, 0, 7); ctx.fill();
      }
      break;
    }
    case T.FOREST: {
      tileBevel(ctx, sx, sy);
      if (n2 < 0.6) {
        tileShadow(ctx, sx, sy, 26);
        // ствол с объёмом: тёмный бок + светлая кромка
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx + 15, sy + 19, 5, 10);
        ctx.fillStyle = '#5a3d22'; ctx.fillRect(sx + 14, sy + 18, 4, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(sx + 14, sy + 18, 1.5, 10);
        // крона в 2 слоя для 3D: тёмный низ + светлый верх
        const rr = 10 + n * 3;
        ctx.fillStyle = shade([22, 66, 30], (n - 0.5) * 20);
        ctx.beginPath(); ctx.arc(sx + 16, sy + 15, rr, 0, 7); ctx.fill();
        const gg = ctx.createRadialGradient(sx + 13, sy + 11, 2, sx + 16, sy + 14, rr);
        gg.addColorStop(0, shade([52, 130, 58], 14));
        gg.addColorStop(1, shade([34, 96, 42], (n - 0.5) * 30 - 8));
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(sx + 16, sy + 14, rr * 0.92, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.arc(sx + 12.5, sy + 10.5, 3.6, 0, 7); ctx.fill();
      }
      break;
    }
    case T.SAND:
      tileBevel(ctx, sx, sy, 'rgba(255,255,255,0.12)', 'rgba(120,90,40,0.25)');
      if (n2 < 0.3) { ctx.fillStyle = 'rgba(150,120,60,0.4)'; ctx.fillRect(sx + n * 26, sy + n2 * 80, 2, 2); }
      if (n2 > 0.965) {
        tileShadow(ctx, sx, sy, 16);
        // кактус с объёмом
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx + 15, sy + 9, 4, 18);
        ctx.fillStyle = '#5c8f3a'; ctx.fillRect(sx + 14, sy + 8, 4, 18); ctx.fillRect(sx + 9, sy + 12, 4, 7); ctx.fillRect(sx + 19, sy + 10, 4, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(sx + 14, sy + 8, 1.5, 18);
      }
      break;
    case T.SWAMP:
      if (n2 < 0.45) {
        // лужа с отражением
        ctx.fillStyle = 'rgba(20,35,28,0.8)';
        ctx.beginPath(); ctx.ellipse(sx + 16, sy + 19, 10, 5.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(150,200,180,0.18)';
        ctx.beginPath(); ctx.ellipse(sx + 13, sy + 17.5, 5, 2, -0.3, 0, 7); ctx.fill();
      } else if (n2 > 0.85) {
        tileShadow(ctx, sx, sy, 14);
        ctx.fillStyle = '#2c441f'; ctx.fillRect(sx + 11, sy + 9, 2, 14); ctx.fillRect(sx + 17, sy + 7, 2, 16);
        ctx.fillStyle = '#4a7038'; ctx.fillRect(sx + 10, sy + 8, 2, 14); ctx.fillRect(sx + 16, sy + 6, 2, 16);
      } else tileBevel(ctx, sx, sy);
      break;
    case T.ROCK: {
      // 3D гора: 3 грани
      tileShadow(ctx, sx, sy, 30);
      const px = sx + 14 + n * 6;
      // тёмная правая грань
      ctx.fillStyle = shade([62, 60, 58], (n - 0.5) * 16);
      ctx.beginPath(); ctx.moveTo(px, sy + 4); ctx.lineTo(sx + TS - 2, sy + TS); ctx.lineTo(px + 2, sy + TS); ctx.fill();
      // основная левая грань
      ctx.fillStyle = shade([104, 100, 96], (n - 0.5) * 20);
      ctx.beginPath(); ctx.moveTo(sx + 2, sy + TS); ctx.lineTo(px, sy + 4); ctx.lineTo(px + 2, sy + TS); ctx.fill();
      // снежная шапка-свет
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.moveTo(px - 4, sy + 12); ctx.lineTo(px, sy + 4); ctx.lineTo(px + 4, sy + 12); ctx.lineTo(px + 2, sy + 14); ctx.lineTo(px, sy + 12); ctx.lineTo(px - 2, sy + 14); ctx.fill();
      break;
    }
    case T.SNOW:
      tileBevel(ctx, sx, sy, 'rgba(255,255,255,0.35)', 'rgba(140,160,190,0.35)');
      if (n2 < 0.15) { ctx.fillStyle = 'rgba(150,170,200,0.55)'; ctx.fillRect(sx + n * 24, sy + n2 * 150, 3, 2); }
      if (n2 > 0.95) {
        tileShadow(ctx, sx, sy, 22);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.moveTo(sx + 17, sy + 5); ctx.lineTo(sx + 27, sy + 25); ctx.lineTo(sx + 7, sy + 25); ctx.fill();
        ctx.fillStyle = '#2f5d4a';
        ctx.beginPath(); ctx.moveTo(sx + 16, sy + 4); ctx.lineTo(sx + 26, sy + 24); ctx.lineTo(sx + 6, sy + 24); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.moveTo(sx + 16, sy + 4); ctx.lineTo(sx + 20, sy + 12); ctx.lineTo(sx + 12, sy + 12); ctx.fill();
      }
      break;
    case T.DFLOOR:
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TS - 1, TS - 1);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(sx + 1, sy + 1, TS - 2, 2);
      if (n2 < 0.12) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx + 6 + n * 16, sy + 8 + n2 * 80, 5, 3); }
      if (n3 > 0.93) { ctx.fillStyle = 'rgba(120,140,255,0.08)'; ctx.beginPath(); ctx.arc(sx + 16, sy + 16, 8, 0, 7); ctx.fill(); }
      break;
    case T.DWALL: {
      // стена с высотой: верхняя грань светлая, боковая тёмная
      ctx.fillStyle = '#17141d'; ctx.fillRect(sx, sy, TS, TS);
      const hh = 8;
      ctx.fillStyle = shade([52, 48, 62], (n - 0.5) * 12);
      ctx.fillRect(sx, sy, TS, TS - hh);
      ctx.fillStyle = shade([66, 62, 78], 8);
      ctx.fillRect(sx, sy, TS, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(sx, sy + TS - hh, TS, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(sx + (n > 0.5 ? 2 : 16), sy + 5, 14, 2);
      break;
    }
    case T.CAVE: {
      tileBevel(ctx, sx, sy);
      tileShadow(ctx, sx, sy, 26);
      // арка с глубиной: внешнее свечение + тёмный провал + красная метка
      const ag = ctx.createRadialGradient(sx + 16, sy + 16, 2, sx + 16, sy + 16, 16);
      ag.addColorStop(0, '#000'); ag.addColorStop(1, '#241a14');
      ctx.fillStyle = '#2b211b';
      ctx.beginPath(); ctx.moveTo(sx + 2, sy + 29); ctx.lineTo(sx + 2, sy + 14);
      ctx.arc(sx + 16, sy + 14, 14, Math.PI, 0); ctx.lineTo(sx + 30, sy + 29); ctx.fill();
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.moveTo(sx + 4, sy + 28); ctx.lineTo(sx + 4, sy + 14);
      ctx.arc(sx + 16, sy + 14, 12, Math.PI, 0); ctx.lineTo(sx + 28, sy + 28); ctx.fill();
      const pulse = 0.6 + 0.4 * Math.sin(time * 3 + x + y);
      ctx.fillStyle = `rgba(220,60,50,${0.65 + pulse * 0.35})`;
      ctx.fillRect(sx + 13, sy + 5, 6, 3);
      ctx.fillStyle = `rgba(255,120,80,${0.25 * pulse})`;
      ctx.beginPath(); ctx.arc(sx + 16, sy + 16, 15, 0, 7); ctx.fill();
      break;
    }
    case T.STAIRS: {
      // лестница в перспективе: ступени с боковой гранью
      for (let i = 0; i < 4; i++) {
        const w = 24 - i * 4, y0 = sy + 6 + i * 6, x0 = sx + 4 + i * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 + 1, y0 + 2, w, 3);
        ctx.fillStyle = shade([150, 128, 96], 6 - i * 4); ctx.fillRect(x0, y0, w, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x0, y0, w, 1);
      }
      const bob = Math.sin(time * 2.5) * 2;
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.moveTo(sx + 16, sy + 1 + bob); ctx.lineTo(sx + 21, sy + 6 + bob); ctx.lineTo(sx + 11, sy + 6 + bob); ctx.fill();
      ctx.fillStyle = 'rgba(255,215,94,0.25)';
      ctx.beginPath(); ctx.arc(sx + 16, sy + 8 + bob, 9, 0, 7); ctx.fill();
      break;
    }
    default:
      tileBevel(ctx, sx, sy);
  }
}

// Динамическая вода/блеск поверх статичных чанков — вызывается каждый кадр для видимых клеток
function drawTileOverlay(ctx, t, sx, sy, x, y, time) {
  if (t === T.WATER || t === T.DEEP) {
    const ph = Math.sin(time * 2 + x * 0.8 + y * 0.5);
    ctx.fillStyle = `rgba(255,255,255,${t === T.WATER ? 0.10 + ph * 0.05 : 0.06})`;
    ctx.fillRect(sx + 4 + ph * 3, sy + 8, 12, 1.6);
  }
}
