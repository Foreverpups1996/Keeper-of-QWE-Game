'use strict';
// ===== Подземелья =====
// Вход — тёмная арка в мире. Внутри: комнаты и коридоры, ловушки (обезвреживаются
// быстрым набором кода), сундуки и мимики, особые мобы и босс «Страж глубин»
// в дальней комнате. Подземелье генерируется из seed входа, так что каждое своё.

const DW = 64, DH = 44;

class Dungeon {
  constructor(seed, level, entrance, id) {
    this.isDungeon = true;
    this.seed = seed | 0;
    this.level = level;
    this.entrance = entrance; // {x, y} в мире
    this.id = id;
    this.grid = new Uint8Array(DW * DH).fill(T.DWALL);
    this.mobs = [];
    this.chests = [];
    this.traps = [];
    this.dead = new Set();
    this.opened = new Set();
    this.chunks = new Map();
    this.seen = new Uint8Array(DW * DH); // туман: что игрок уже видел
    this.generate();
  }

  // ---------- генерация ----------
  generate() {
    const rnd = mulberry32(this.seed);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const rooms = [];
    for (let tries = 0; tries < 300 && rooms.length < 11; tries++) {
      const w = ri(6, 12), h = ri(5, 8);
      const x = ri(1, DW - w - 2), y = ri(1, DH - h - 2);
      if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
      rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    }
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.set(x, y, T.DFLOOR);
    // коридоры: каждую комнату соединяем с ближайшей из уже соединённых (+ пара петель)
    const corridor = [];
    const carve = (a, b) => {
      let x = a.cx, y = a.cy;
      const horizFirst = rnd() < 0.5;
      const step = (tx, ty) => {
        while (x !== tx) { x += Math.sign(tx - x); if (this.get(x, y) === T.DWALL) { this.set(x, y, T.DFLOOR); corridor.push([x, y]); } }
        while (y !== ty) { y += Math.sign(ty - y); if (this.get(x, y) === T.DWALL) { this.set(x, y, T.DFLOOR); corridor.push([x, y]); } }
      };
      if (horizFirst) { step(b.cx, y); step(b.cx, b.cy); } else { step(x, b.cy); step(b.cx, b.cy); }
    };
    const linked = [rooms[0]];
    for (const r of rooms.slice(1)) {
      const near = linked.reduce((a, o) => (Math.hypot(o.cx - r.cx, o.cy - r.cy) < Math.hypot(a.cx - r.cx, a.cy - r.cy) ? o : a));
      carve(r, near);
      linked.push(r);
    }
    for (let i = 0; i < 2 && rooms.length > 3; i++) carve(rooms[ri(0, rooms.length - 1)], rooms[ri(0, rooms.length - 1)]);

    // старт и босс: босс в самой дальней (по пути) комнате
    const start = rooms[0];
    this.set(start.cx, start.cy, T.STAIRS);
    this.spawn = { x: start.cx + 1, y: start.cy };
    const dist = this.bfs(start.cx, start.cy);
    const bossRoom = rooms.slice(1).reduce((a, r) => (dist[r.cy * DW + r.cx] > dist[a.cy * DW + a.cx] ? r : a), rooms[1]);
    this.rooms = rooms;
    this.bossRoom = bossRoom;

    const lvl = this.level;
    const usedTiles = new Set([`${start.cx},${start.cy}`, `${this.spawn.x},${this.spawn.y}`]);
    const freeTile = r => {
      for (let t = 0; t < 40; t++) {
        const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1);
        if (!usedTiles.has(`${x},${y}`) && this.get(x, y) === T.DFLOOR) { usedTiles.add(`${x},${y}`); return [x, y]; }
      }
      return null;
    };
    const addMob = (kind, x, y, mlvl, extra = {}) => {
      const id = `${this.id}:m${this.mobs.length}`;
      const m = makeMob(id, kind, mlvl, x, y, extra.elite);
      Object.assign(m, extra);
      this.mobs.push(m);
      return m;
    };

    // босс + большой сундук
    const boss = addMob('warden', bossRoom.cx, bossRoom.cy, lvl + 2, { elite: false, boss: true, homeR: 2 });
    boss.maxHp = boss.hp = Math.round(boss.maxHp * 1.3);
    usedTiles.add(`${bossRoom.cx},${bossRoom.cy}`);
    const bc = freeTile(bossRoom);
    if (bc) this.chests.push({ id: `${this.id}:boss`, x: bc[0], y: bc[1], big: true });

    // остальные комнаты
    for (const r of rooms) {
      if (r === start || r === bossRoom) continue;
      const roll = rnd();
      if (roll < 0.45) { // логово
        const n = ri(2, 3);
        for (let i = 0; i < n; i++) { const p = freeTile(r); if (p) addMob(weightedPick(DUNGEON_MOBS, rnd), p[0], p[1], lvl + (rnd() < 0.25 ? 1 : 0)); }
      } else if (roll < 0.75) { // сокровищница: сундуки, часть — мимики, вокруг ловушки
        const n = ri(1, 3);
        for (let i = 0; i < n; i++) {
          const p = freeTile(r);
          if (!p) continue;
          if (rnd() < 0.35) addMob('mimic', p[0], p[1], lvl, { disguised: true, still: true });
          else this.chests.push({ id: `${this.id}:c${this.chests.length}`, x: p[0], y: p[1] });
        }
        for (let i = 0; i < 3; i++) { const p = freeTile(r); if (p) this.addTrap(p[0], p[1], rnd); }
      } else { // зал ловушек с наградой
        for (let i = 0; i < ri(4, 7); i++) { const p = freeTile(r); if (p) this.addTrap(p[0], p[1], rnd); }
        const p = freeTile(r);
        if (p) this.chests.push({ id: `${this.id}:c${this.chests.length}`, x: p[0], y: p[1] });
        const q = freeTile(r);
        if (q) addMob(weightedPick(DUNGEON_MOBS, rnd), q[0], q[1], lvl);
      }
    }
    // ловушки в коридорах
    for (const [x, y] of corridor) if (rnd() < 0.045 && !usedTiles.has(`${x},${y}`)) this.addTrap(x, y, rnd);
  }

  addTrap(x, y, rnd) {
    const types = Object.keys(TRAPS);
    this.traps.push({ x, y, type: types[Math.floor(rnd() * types.length)], armed: true, visible: rnd() < 0.3 });
  }

  bfs(sx, sy) {
    const d = new Int32Array(DW * DH).fill(-1);
    const q = [[sx, sy]]; d[sy * DW + sx] = 0;
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= DW || ny >= DH || d[ny * DW + nx] >= 0 || this.get(nx, ny) === T.DWALL) continue;
        d[ny * DW + nx] = d[y * DW + x] + 1;
        q.push([nx, ny]);
      }
    }
    return d;
  }

  get(x, y) { return x < 0 || y < 0 || x >= DW || y >= DH ? T.DWALL : this.grid[y * DW + x]; }
  set(x, y, t) { if (x >= 0 && y >= 0 && x < DW && y < DH) this.grid[y * DW + x] = t; }

  // ---------- тот же интерфейс, что у World ----------
  tileAt(x, y) { return this.get(x, y); }
  walkable(x, y) { return TILE_INFO[this.get(x, y)].walk; }
  zoneLevel() { return this.level; }
  distFromSpawn() { return 999; }
  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let tiles = this.chunks.get(key);
    if (!tiles) {
      tiles = new Uint8Array(CHUNK * CHUNK);
      for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) tiles[y * CHUNK + x] = this.get(cx * CHUNK + x, cy * CHUNK + y);
      this.chunks.set(key, tiles);
    }
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    return { tiles, chests: this.chests.filter(c => c.x >= x0 && c.x < x0 + CHUNK && c.y >= y0 && c.y < y0 + CHUNK) };
  }
  chestAt(x, y) { return this.chests.find(c => c.x === x && c.y === y) || null; }
  removeChest(ch) { this.chests = this.chests.filter(c => c !== ch); this.opened.add(ch.id); }
  mobAt(x, y) { for (const m of this.mobs) if (m.x === x && m.y === y) return m; return null; }
  killMob(m) { this.dead.add(m.id); this.mobs = this.mobs.filter(o => o !== m); }
  reveal(px, py, r = 6) {
    for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++)
      if (x >= 0 && y >= 0 && x < DW && y < DH && (x - px) ** 2 + (y - py) ** 2 <= r * r) this.seen[y * DW + x] = 1;
  }
  isSeen(x, y) { return x >= 0 && y >= 0 && x < DW && y < DH && this.seen[y * DW + x] === 1; }
  trapAt(x, y) { return this.traps.find(t => t.x === x && t.y === y && t.armed) || null; }
}

// ===== Вход / выход =====
const Dungeons = {
  overworld: null,
  cur: null,

  enter(x, y) {
    const id = `d${x},${y}`;
    if (world.opened.has(id)) { Game.log('Это подземелье уже зачищено. Здесь тихо.', '#aab'); return; }
    const lvl = world.zoneLevel(x, y) + 1;
    this.overworld = world;
    this.cur = new Dungeon(hash2(x, y, world.seed + 777) * 4294967296, lvl, { x, y }, id);
    world = this.cur;
    player.x = player.rx = world.spawn.x;
    player.y = player.ry = world.spawn.y;
    player.invuln = 1;
    Game.log(`Вы спустились в подземелье (ур. ${lvl}). Осторожно: ловушки! Страж глубин ждёт в дальнем зале.`, '#ff9b9b');
    Game.updateHud();
  },

  exit() {
    if (!this.cur) return;
    const d = this.cur;
    world = this.overworld;
    player.x = player.rx = d.entrance.x;
    player.y = player.ry = d.entrance.y + 1;
    if (!world.walkable(player.x, player.y)) { player.y = d.entrance.y; }
    player.invuln = 2;
    this.cur = null;
    this.overworld = null;
    Game.log('Вы вышли на поверхность', '#cfe');
    Game.save();
  },

  bossKilled() {
    if (!this.cur) return;
    this.overworld.opened.add(this.cur.id);
    Game.log('Страж глубин повержен! Подземелье зачищено.', '#ffd75e');
  },
};

// ===== Ловушки: быстрый набор кода, чтобы увернуться =====
const Trap = {
  trap: null, code: [], pos: 0, mistakes: 0, elapsed: 0, limit: 0, phase: 'none', wait: 0,

  trigger(trap) {
    this.trap = trap;
    SFX.trap();
    trap.visible = true;
    const len = Math.min(7, 4 + Math.floor(world.level / 3));
    this.code = Array.from({ length: len }, () => TYPE_KEYS[Math.floor(Math.random() * 3)]);
    this.pos = 0; this.mistakes = 0; this.elapsed = -0.5; // полсекунды на реакцию
    this.limit = 0.6 + len * 0.36;
    this.phase = 'typing';
    Game.mode = 'trap';
    const box = document.getElementById('trap');
    box.classList.remove('hidden');
    document.getElementById('trapTitle').textContent = `Ловушка: ${TRAPS[trap.type].name}!`;
    document.getElementById('trapSub').textContent = `Наберите код, чтобы увернуться (${TRAPS[trap.type].desc})`;
    this.draw();
  },

  draw() {
    document.getElementById('trapCode').innerHTML = this.code.map((c, i) =>
      `<div class="ch t-${c} ${i < this.pos ? 'done' : ''} ${i === this.pos ? 'cur' : ''}">${c}</div>`).join('');
  },

  update(dt) {
    if (this.phase === 'typing') {
      this.elapsed += dt;
      document.getElementById('trapFill').style.width = Math.max(0, Math.min(100, 100 * (1 - this.elapsed / this.limit))) + '%';
      if (this.elapsed >= this.limit) this.finish();
    } else if (this.phase === 'result') {
      this.wait -= dt;
      if (this.wait <= 0) this.close();
    }
  },

  key(code) {
    const letter = code === 'KeyQ' ? 'Q' : code === 'KeyW' ? 'W' : code === 'KeyE' ? 'E' : null;
    if (this.phase === 'result' && (code === 'Space' || code === 'Enter')) return this.close();
    if (this.phase !== 'typing' || !letter) return;
    if (letter === this.code[this.pos]) {
      this.pos++;
      this.draw();
      if (this.pos >= this.code.length) this.finish();
    } else {
      this.mistakes++;
      const b = document.getElementById('trapCode');
      b.classList.remove('err'); void b.offsetWidth; b.classList.add('err');
    }
  },

  finish() {
    this.phase = 'result';
    this.wait = 1.6;
    const t = this.trap;
    t.armed = false;
    const frac = this.pos / this.code.length;
    const ok = frac === 1 && this.mistakes <= 1;
    const half = !ok && frac >= 0.5;
    let msg;
    if (ok) {
      const xp = 3 + world.level * 2;
      msg = `Увернулись! +${xp} опыта`;
      Game.gainXp(xp);
    } else {
      const k = half ? 0.5 : 1;
      if (t.type === 'spikes') {
        const d = Math.round(player.maxHp * 0.15 * k); player.hp -= d; msg = `Шипы: −${d} HP`;
      } else if (t.type === 'gas') {
        const d = Math.round(player.maxHp * 0.1 * k); player.hp -= d;
        Game.pendingPoison = { dmg: Math.max(2, Math.round(player.maxHp * 0.04)), turns: 3 };
        msg = `Газ: −${d} HP, яд в следующем бою`;
      } else if (t.type === 'alarm') {
        let n = 0;
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) {
          if (n >= (half ? 1 : 2)) break;
          const x = player.x + dx, y = player.y + dy;
          if (!world.walkable(x, y) || world.mobAt(x, y)) continue;
          const m = makeMob(`${world.id}:alarm${Date.now()}${n}`, weightedPick(DUNGEON_MOBS, Math.random), world.level, x, y);
          world.mobs.push(m); n++;
        }
        msg = `Тревога! Прибежали стражи: ${n}`;
      } else if (t.type === 'teleport') {
        const rooms = world.rooms.filter(r => r !== world.bossRoom);
        const r = rooms[Math.floor(Math.random() * rooms.length)];
        for (let i = 0; i < 30; i++) {
          const x = r.x + Math.floor(Math.random() * r.w), y = r.y + Math.floor(Math.random() * r.h);
          if (world.walkable(x, y) && !world.mobAt(x, y) && !world.chestAt(x, y)) { player.x = player.rx = x; player.y = player.ry = y; break; }
        }
        msg = 'Вас перенесло в другую комнату!';
      }
      if (half) msg += ' (частично увернулись)';
    }
    player.invuln = Math.max(player.invuln, 1);
    document.getElementById('trapSub').textContent = msg;
    Game.log(msg, ok ? '#7dff8b' : '#ff9b9b');
    if (typeof FX !== 'undefined') {
      FX.shake(ok ? 0.1 : 0.4);
      if (!ok && player) FX.text(player.x + 0.5, player.y - 0.3, msg.split(':')[0], '#ff7d7d', 14);
      if (ok) SFX.win(); else SFX.hurt();
    }
    Game.updateHud();
  },

  close() {
    this.phase = 'none';
    document.getElementById('trap').classList.add('hidden');
    Game.mode = 'world';
    if (player.hp <= 0) Game.die('ловушка');
  },
};
