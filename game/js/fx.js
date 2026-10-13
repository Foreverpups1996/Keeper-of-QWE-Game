'use strict';
// ===== FX: частицы, всплывающий урон, тряска экрана, процедурный звук, день/ночь =====
// Никаких внешних ассетов — всё рисуется и синтезируется кодом, работает офлайн.

const FX = {
  parts: [],   // мировые частицы {x,y,z,vx,vy,vz,life,maxLife,color,size,grav}
  texts: [],   // всплывающие цифры {x,y,vy,life,maxLife,str,color,size}
  trauma: 0,
  time: 0,
  shakeX: 0, shakeY: 0,

  spawn(o) {
    if (this.parts.length > 600) this.parts.shift();
    this.parts.push(Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.6, maxLife: 0.6, color: '#fff', size: 3, grav: 0 }, o));
  },
  burst(px, py, n, colors, speed = 3, z = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random() * 0.6) * speed;
      this.spawn({
        x: px, y: py, z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1,
        vz: 2 + Math.random() * 3, grav: -9,
        life: 0.5 + Math.random() * 0.5, maxLife: 0.9,
        color: colors[(Math.random() * colors.length) | 0],
        size: 2 + Math.random() * 3,
      });
    }
  },
  dust(px, py, n = 4) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: px + (Math.random() - 0.5) * 0.6, y: py + (Math.random() - 0.5) * 0.6, z: 0.1,
        vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 0.8 + Math.random(),
        grav: -2, life: 0.4 + Math.random() * 0.3, maxLife: 0.7,
        color: 'rgba(200,190,170,0.7)', size: 2 + Math.random() * 2.5,
      });
    }
  },
  embers(px, py, n = 1) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: px + (Math.random() - 0.5) * 8, y: py + (Math.random() - 0.5) * 8, z: 0,
        vx: (Math.random() - 0.5) * 0.4, vy: -0.5 - Math.random() * 0.5, vz: 0.6 + Math.random(),
        grav: 0.4, life: 1.5 + Math.random() * 1.5, maxLife: 3,
        color: Math.random() < 0.5 ? '#ffb347' : '#ff6a3d', size: 1.5 + Math.random() * 1.5,
      });
    }
  },
  firefly(px, py) {
    this.spawn({
      x: px + (Math.random() - 0.5) * 14, y: py + (Math.random() - 0.5) * 10, z: 0.5 + Math.random(),
      vx: (Math.random() - 0.5) * 0.7, vy: (Math.random() - 0.5) * 0.7, vz: Math.sin(Math.random() * 6) * 0.3,
      grav: 0, life: 2.5 + Math.random() * 2, maxLife: 4.5,
      color: '#cfff8a', size: 1.8, glow: true,
    });
  },
  text(x, y, str, color = '#ffd75e', size = 15) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, vy: -1.6, life: 1.1, maxLife: 1.1, str, color, size });
  },
  shake(a) {
    if (typeof Settings !== 'undefined' && Settings.data && Settings.data.shake === false) return;
    this.trauma = Math.min(1, this.trauma + a);
  },

  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    this.shakeX = sh * 14 * (Math.random() * 2 - 1);
    this.shakeY = sh * 14 * (Math.random() * 2 - 1);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vz += (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.7; p.vy *= 0.7; }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= (1 - dt * 1.5);
    }
  },

  // Рисуем частицы поверх мира. camX/camY — в пикселях, TS — размер клетки.
  draw(ctx, camX, camY, TSref) {
    const TS = TSref || 32;
    for (const p of this.parts) {
      const sx = p.x * TS - camX;
      const sy = p.y * TS - camY - (p.z || 0) * TS * 0.55;
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = p.glow ? (0.4 + 0.6 * Math.abs(Math.sin(FX.time * 4 + p.x))) * a : a;
      if (p.glow) {
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      }
      // псевдо-3D: чем выше z, тем меньше и прозрачнее тень под частицей
      if ((p.z || 0) > 0.15 && !p.glow) {
        ctx.globalAlpha = 0.25 * a;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(p.x * TS - camX, p.y * TS - camY + 8, p.size * 0.9, p.size * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(sx, sy, p.size * (1 + (p.z || 0) * 0.15), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.max(0, Math.min(1, t.life / t.maxLife));
      const sx = t.x * TS - camX, sy = t.y * TS - camY;
      const pop = 1 + (1 - a) * 0.1;
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(t.size * pop)}px "Segoe UI", sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.str, sx, sy);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, sx, sy);
    }
    ctx.restore();
  },
};

// ===== День/ночь в открытом мире (цикл ~4 мин, ночью темнее + виньетка холоднее) =====
const DayNight = {
  t: 0.3, // 0..1, 0.3 = утро
  update(dt) { this.t = (this.t + dt / 240) % 1; },
  // возвращает {dark: 0..1, tint} для оверлея
  overlay() {
    // день: 0.2..0.7 светло; ночь: темно
    const day = Math.cos((this.t - 0.3) * Math.PI * 2); // 1 днём, -1 ночью
    const dark = Math.max(0, Math.min(0.55, -day * 0.45 + 0.08));
    const cold = Math.max(0, -day);
    return { dark, cold };
  },
  label() {
    const h = Math.floor(this.t * 24);
    const m = Math.floor((this.t * 24 - h) * 60);
    const hh = String(h).padStart(2, '0'), mm = String(m).padStart(2, '0');
    const night = Math.cos((this.t - 0.3) * Math.PI * 2) < -0.2;
    return `${night ? '🌙' : '☀️'} ${hh}:${mm}`;
  },
};

// ===== Процедурные звуки (WebAudio, без файлов) =====
const SFX = {
  ctx: null,
  enabled: true,
  master: 1,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; }
  },
  vol(v) { return v * (this.master == null ? 1 : this.master); },
  tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    vol = this.vol(vol);
    if (vol <= 0) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur = 0.15, vol = 0.08, low = 400) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    vol = this.vol(vol);
    if (vol <= 0) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t0);
  },
  key(ok) { this.tone(ok ? 520 + Math.random() * 120 : 140, ok ? 0.07 : 0.12, ok ? 'square' : 'sawtooth', ok ? 0.045 : 0.07, ok ? 120 : -40); },
  hit(big) { this.noise(big ? 0.25 : 0.15, big ? 0.14 : 0.09, big ? 900 : 1400); this.tone(big ? 90 : 130, 0.18, 'sawtooth', 0.09, -40); },
  hurt() { this.tone(180, 0.25, 'sawtooth', 0.1, -90); this.noise(0.2, 0.1, 600); },
  chest() { this.tone(660, 0.1, 'triangle', 0.08); setTimeout(() => this.tone(880, 0.14, 'triangle', 0.08), 90); },
  levelup() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.09), i * 90)); },
  step() { this.noise(0.05, 0.025, 500); },
  dash() { this.noise(0.22, 0.1, 2200); this.tone(220, 0.2, 'sine', 0.07, 320); },
  trap() { this.tone(300, 0.3, 'sawtooth', 0.1, -180); },
  win() { [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.09), i * 110)); },
  lose() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'sawtooth', 0.08), i * 140)); },
  potion() { this.tone(440, 0.15, 'sine', 0.08, 220); },
};
window.addEventListener('pointerdown', () => SFX.ensure(), { once: true });
window.addEventListener('keydown', () => SFX.ensure(), { once: true });
