'use strict';
// ===== Процедурная генерация мира =====
// Бесконечный мир из чанков 16×16. Рельеф, влажность и температура —
// три слоя шума (fBm поверх value noise). Всё детерминировано от seed.

const CHUNK = 16;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, SWAMP: 5, ROCK: 6, SNOW: 7, DFLOOR: 8, DWALL: 9, CAVE: 10, STAIRS: 11 };
const TILE_INFO = [
  { name: 'Глубокая вода', walk: false, color: [24, 56, 112] },
  { name: 'Вода',          walk: false, color: [40, 96, 168] },
  { name: 'Пески',         walk: true,  color: [216, 196, 128], biome: 'sand' },
  { name: 'Луг',           walk: true,  color: [96, 164, 72],   biome: 'grass' },
  { name: 'Лес',           walk: true,  color: [58, 122, 58],   biome: 'forest' },
  { name: 'Болото',        walk: true,  color: [74, 92, 64],    biome: 'swamp' },
  { name: 'Скалы',         walk: false, color: [112, 108, 104] },
  { name: 'Снега',         walk: true,  color: [226, 233, 242], biome: 'snow' },
  { name: 'Подземелье',    walk: true,  color: [62, 58, 68] },
  { name: 'Стена',         walk: false, color: [24, 22, 28] },
  { name: 'Вход в подземелье', walk: true, color: [70, 56, 44] },
  { name: 'Лестница наверх', walk: true, color: [120, 104, 80] },
];

function hash2(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, s, oct) {
  let sum = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 1013);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

// растягиваем распределение fBm (оно жмётся к 0.5)
function stretch(v, k) { return Math.max(0, Math.min(1, (v - 0.5) * k + 0.5)); }

class World {
  constructor(seed) {
    this.seed = seed | 0;
    this.chunks = new Map();
    this.mobs = [];
    this.dead = new Set();
    this.opened = new Set();
    this.spawn = this.findSpawn();
  }

  genTile(x, y) {
    const s = this.seed;
    const h = stretch(fbm(x / 56, y / 56, s, 5), 1.7);
    const m = stretch(fbm(x / 90 + 500, y / 90, s + 77, 4), 2.0);
    const t = stretch(fbm(x / 140, y / 140 + 900, s + 191, 3), 2.0);
    if (h < 0.24) return T.DEEP;
    if (h < 0.32) return T.WATER;
    if (h < 0.345) return T.SAND;
    if (h > 0.79) return T.ROCK;
    if (t < 0.24 || (h > 0.72 && t < 0.4)) return T.SNOW;
    if (m < 0.38 && t > 0.58) return T.SAND;
    if (m > 0.6 && h < 0.55) return T.SWAMP;
    if (m > 0.50) return T.FOREST;
    return T.GRASS;
  }

  findSpawn() {
    // спираль от (0,0) до первого луга, окружённого проходимыми клетками
    for (let r = 0; r < 400; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.genTile(dx, dy) !== T.GRASS) continue;
          let ok = true;
          for (let k = 0; k < 4 && ok; k++) {
            const [ox, oy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][k];
            if (!TILE_INFO[this.genTile(dx + ox, dy + oy)].walk) ok = false;
          }
          if (ok) return { x: dx, y: dy };
        }
      }
    }
    return { x: 0, y: 0 };
  }

  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c) return c;
    c = { cx, cy, tiles: new Uint8Array(CHUNK * CHUNK), chests: [] };
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < CHUNK; x++)
        c.tiles[y * CHUNK + x] = this.genTile(cx * CHUNK + x, cy * CHUNK + y);
    this.chunks.set(key, c);
    this.populate(c);
    return c;
  }

  tileAt(x, y) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const c = this.getChunk(cx, cy);
    return c.tiles[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
  }

  walkable(x, y) { return TILE_INFO[this.tileAt(x, y)].walk; }

  distFromSpawn(x, y) { return Math.hypot(x - this.spawn.x, y - this.spawn.y); }

  // Уровень зоны растёт с удалением от точки старта
  zoneLevel(x, y) { return 1 + Math.floor(this.distFromSpawn(x, y) / 45); }

  populate(c) {
    const rnd = mulberry32(hash2(c.cx, c.cy, this.seed + 4242) * 4294967296);
    // мобы
    const attempts = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < attempts; i++) {
      const lx = Math.floor(rnd() * CHUNK), ly = Math.floor(rnd() * CHUNK);
      const x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly;
      const tile = c.tiles[ly * CHUNK + lx];
      const biome = TILE_INFO[tile].biome;
      const id = `m${c.cx},${c.cy},${i}`;
      if (!biome || this.dead.has(id)) continue;
      if (this.distFromSpawn(x, y) < 9) continue; // безопасная зона вокруг старта
      const kind = weightedPick(BIOME_MOBS[biome], rnd);
      const lvl = Math.max(1, this.zoneLevel(x, y) + (rnd() < 0.2 ? 1 : 0) - (rnd() < 0.2 ? 1 : 0));
      this.mobs.push(makeMob(id, kind, lvl, x, y));
    }
    // вход в подземелье (~6% чанков, не у самого старта)
    if (rnd() < 0.06) {
      const lx = 2 + Math.floor(rnd() * (CHUNK - 4)), ly = 2 + Math.floor(rnd() * (CHUNK - 4));
      const x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly;
      const tl = c.tiles[ly * CHUNK + lx];
      if (TILE_INFO[tl].walk && tl !== T.SAND && this.distFromSpawn(x, y) > 18) c.tiles[ly * CHUNK + lx] = T.CAVE;
    }
    // сундук
    if (rnd() < 0.28) {
      const lx = Math.floor(rnd() * CHUNK), ly = Math.floor(rnd() * CHUNK);
      if (TILE_INFO[c.tiles[ly * CHUNK + lx]].walk) {
        const id = `c${c.cx},${c.cy}`;
        if (!this.opened.has(id)) c.chests.push({ id, x: c.cx * CHUNK + lx, y: c.cy * CHUNK + ly });
      }
    }
  }

  chestAt(x, y) {
    const c = this.getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    return c.chests.find(ch => ch.x === x && ch.y === y) || null;
  }

  removeChest(ch) {
    const c = this.getChunk(Math.floor(ch.x / CHUNK), Math.floor(ch.y / CHUNK));
    c.chests = c.chests.filter(o => o !== ch);
    this.opened.add(ch.id);
  }

  mobAt(x, y) {
    for (const m of this.mobs) if (m.x === x && m.y === y) return m;
    return null;
  }

  killMob(m) {
    this.dead.add(m.id);
    this.mobs = this.mobs.filter(o => o !== m);
  }
}

// Живучесть и сила растут с уровнем; 12% мобов — элитные (больше HP и урона, лучше награда)
function makeMob(id, kind, lvl, x, y, elite = Math.random() < 0.12) {
  const k = MOB_KINDS[kind];
  const maxHp = Math.round(k.hp * BAL.mobHp * (1 + BAL.mobHpPerLvl * (lvl - 1)) * (elite ? 1.6 : 1));
  return {
    id, kind, lvl, x, y, rx: x, ry: y, homeX: x, homeY: y, elite,
    hp: maxHp, maxHp,
    atk: Math.round(k.atk * BAL.mobAtk * (1 + BAL.mobAtkPerLvl * (lvl - 1)) * (elite ? 1.3 : 1)),
    moveT: Math.random(), stun: 0, chasing: false,
  };
}
