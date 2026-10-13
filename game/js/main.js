'use strict';
// ===== Основной цикл: меню, мир, игрок, мобы, интерфейс, сохранение =====
const TS = 32; // размер клетки в пикселях
const SAVE_KEY = 'qwe_save_v1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// Масштаб под разрешение экрана: на телефонах с плотными экранами картинка резкая,
// логика отрисовки при этом всегда идёт в CSS-пикселях.
let DPR = 1;

let world = null;
let player = null;

function makePlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y, rx: spawn.x, ry: spawn.y,
    hp: 60, maxHp: 60, lvl: 1, xp: 0, gold: 0, invuln: 0, moveCd: 0, dir: [0, 1],
    stamina: 100, maxStamina: 100, dashCd: 0, dashFx: 0, bob: 0, stepAcc: 0,
    inv: [{ id: 'potion', count: 3 }, { id: 'scroll', count: 1 }],
    gear: { weapon: null, focus: null, charm: null },
    skills: {}, skillPoints: 1,
    skill(id) { return this.skills[id] || 0; },
    // урон за одну букву данного типа
    dmg(t) {
      let d = 3 + (this.lvl - 1) * BAL.playerDmgPerLvl;
      d += this.skill({ Q: 'q_power', W: 'w_power', E: 'e_power' }[t]);
      for (const slot in this.gear) {
        const g = this.gear[slot];
        if (g && ITEMS[g].bonus[t]) d += ITEMS[g].bonus[t];
      }
      return d;
    },
    recalcMaxHp() {
      const old = this.maxHp;
      this.maxHp = 60 + (this.lvl - 1) * 12 + 15 * this.skill('w_hp');
      if (this.maxHp > old) this.hp += this.maxHp - old;
      this.hp = Math.min(this.hp, this.maxHp);
    },
  };
}

const Game = {
  mode: 'menu', // menu | world | combat | inventory | bestiary | skills | history | help | quests | net | settings
  bestiary: {},
  beast(kind) {
    if (!this.bestiary[kind]) this.bestiary[kind] = { seen: false, kills: 0, known: { Q: false, W: false, E: false } };
    return this.bestiary[kind];
  },
  log(text, color) {
    const box = document.getElementById('log');
    const d = document.createElement('div');
    d.innerHTML = text;
    if (color) d.style.color = color;
    box.appendChild(d);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => (d.style.opacity = '0'), 5000);
    setTimeout(() => d.remove(), 6200);
  },
  addItem(id) {
    const s = player.inv.find(o => o.id === id && ITEMS[id].kind !== 'gear');
    if (s) s.count++; else player.inv.push({ id, count: 1 });
  },
  removeItem(id) {
    const i = player.inv.findIndex(o => o.id === id);
    if (i < 0) return false;
    if (--player.inv[i].count <= 0) player.inv.splice(i, 1);
    return true;
  },
  xpNeed() { return 20 + player.lvl * 25; },
  maxLevel() { return (typeof MAX_LEVEL !== 'undefined') ? MAX_LEVEL : Infinity; },
  atMaxLevel() { return player.lvl >= this.maxLevel(); },
  gainXp(n) {
    const cap = this.maxLevel();
    if (player.lvl >= cap) { player.xp = 0; this.updateHud(); return false; } // опыт за уровень не идёт
    player.xp += n;
    let up = false;
    while (player.lvl < cap && player.xp >= this.xpNeed()) {
      player.xp -= this.xpNeed();
      player.lvl++;
      player.skillPoints++;
      player.recalcMaxHp();
      player.hp = player.maxHp;
      up = true;
      this.log(`Новый уровень ${player.lvl}! Есть очко талантов, нажмите K`, '#ffd75e');
      FX.burst(player.x + 0.5, player.y + 0.3, 26, ['#ffd75e', '#fff6c8', '#ffb347'], 4);
      FX.text(player.x + 0.5, player.y - 0.4, `УР. ${player.lvl}!`, '#ffd75e', 18);
      SFX.levelup();
      FX.shake(0.25);
    }
    if (player.lvl >= cap) { player.xp = 0; this.log(`Достигнут максимальный уровень ${cap}.`, '#ffd75e'); }
    this.updateHud();
    return up;
  },
  respawn() {
    if (world.isDungeon) { world = Dungeons.overworld; Dungeons.cur = null; Dungeons.overworld = null; }
    player.x = player.rx = world.spawn.x;
    player.y = player.ry = world.spawn.y;
    player.hp = player.maxHp;
    player.invuln = 2;
    this.updateHud();
  },
  // смерть вне боя (например, от ловушки)
  die(reason) {
    const lost = Math.floor(player.gold / 2);
    player.gold -= lost;
    this.log(`Вы погибли (${reason}). Потеряно ${lost} золота.`, '#ff7d7d');
    FX.burst(player.x + 0.5, player.y + 0.5, 30, ['#ff5d5d', '#5a0f0f', '#888'], 4);
    FX.shake(0.8);
    SFX.lose();
    this.respawn();
    this.save();
  },
  updateHud() {
    if (!player) return;
    document.getElementById('hpFill').style.width = Math.max(0, 100 * player.hp / player.maxHp) + '%';
    document.getElementById('hpText').textContent = `${Math.max(0, player.hp)} / ${player.maxHp}`;
    const st = document.getElementById('stFill');
    if (st) {
      st.style.width = Math.max(0, 100 * player.stamina / player.maxStamina) + '%';
      const dash = document.getElementById('dashText');
      if (dash) {
        dash.textContent = player.dashCd > 0 ? `Рывок… ${player.dashCd.toFixed(1)}с` : 'Пробел — рывок · Shift — бег';
        dash.style.color = player.dashCd > 0 ? '#778' : (player.stamina < 25 ? '#ff9b7d' : '#9adcff');
      }
    }
    document.getElementById('lvlText').textContent = `Ур.${player.lvl}`;
    const xpMax = this.atMaxLevel();
    document.getElementById('xpFill').style.width = xpMax ? '100%' : 100 * player.xp / this.xpNeed() + '%';
    document.getElementById('xpText').textContent = xpMax ? 'МАКС' : `${player.xp} / ${this.xpNeed()}`;
    document.getElementById('goldText').textContent = `Золото: ${player.gold}`;
    document.getElementById('dmgText').innerHTML = TYPE_KEYS.map(t =>
      `<span class="t-${t}">${t}:${player.dmg(t).toFixed(1)}</span>`).join(' ') +
      (player.skillPoints ? ` <span class="sp">+${player.skillPoints} навык (K)</span>` : '');
  },

  // ---------- сохранение ----------
  save() {
    if (!player || !world) return;
    // в подземелье сохраняем мир сверху, а игрока ставим у входа
    const ow = world.isDungeon ? Dungeons.overworld : world;
    const pos = world.isDungeon ? { x: world.entrance.x, y: world.entrance.y + 1 } : player;
    const data = {
      seed: ow.seed, bestiary: this.bestiary,
      dead: [...ow.dead], opened: [...ow.opened],
      p: {
        x: pos.x, y: pos.y, hp: player.hp, lvl: player.lvl, xp: player.xp, gold: player.gold,
        inv: player.inv, gear: player.gear, skills: player.skills, skillPoints: player.skillPoints,
      },
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* нет хранилища — играем без сохранения */ }
  },
  loadData() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  },
  newGame(seed) {
    world = new World(seed || Math.floor(Math.random() * 1e9));
    player = makePlayer(world.spawn);
    this.bestiary = {};
    this.startPlaying();
    openPanel('help');
    this.log('Добро пожаловать! Найдите мобов за пределами стартовой поляны.', '#cfe');
    this.save();
  },
  continueGame() {
    const d = this.loadData();
    if (!d) return this.newGame();
    world = new World(d.seed);
    d.dead.forEach(id => world.dead.add(id));
    d.opened.forEach(id => world.opened.add(id));
    player = makePlayer(world.spawn);
    Object.assign(player, d.p);
    player.rx = player.x; player.ry = player.y;
    // совместимость со старыми сохранениями (до патча с выносливостью/рывком)
    if (player.stamina == null) player.stamina = player.maxStamina = 100;
    if (player.dashCd == null) player.dashCd = 0;
    if (player.dashFx == null) player.dashFx = 0;
    if (player.bob == null) player.bob = 0;
    player.maxHp = 0; player.recalcMaxHp(); player.hp = Math.min(d.p.hp, player.maxHp);
    player.invuln = 2;
    this.bestiary = d.bestiary || {};
    this.startPlaying();
    this.log('Игра загружена', '#cfe');
  },
  startPlaying() {
    Menu.hide();
    this.mode = 'world';
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('hudRight').classList.remove('hidden');
    document.getElementById('hint').classList.remove('hidden');
    this.updateHud();
  },
};

// ===== Главное меню / пауза =====
const Menu = {
  sel: 0, items: [],
  show() {
    Game.mode = 'menu';
    const hasSave = !!Game.loadData();
    const inGame = !!world;
    this.items = [];
    if (inGame) this.items.push(['Продолжить', () => { Menu.hide(); Game.mode = 'world'; }]);
    else if (hasSave) this.items.push(['Продолжить', () => Game.continueGame()]);
    this.items.push(['Новая игра', () => {
      if ((inGame || hasSave) && !confirm('Начать новый мир? Текущее сохранение будет потеряно.')) return;
      Game.newGame();
    }]);
    if (inGame) this.items.push(['Сохранить', () => { Game.save(); Game.log('Сохранено', '#cfe'); Menu.hide(); Game.mode = 'world'; }]);
    this.items.push(['Сетевая игра', () => {
      if (!world) { if (hasSave) Game.continueGame(); else Game.newGame(); }
      Menu.hide();
      openPanel('net');
    }]);
    this.items.push(['Как играть', () => { Menu.hide(); openPanel('help'); }]);
    this.items.push(['Выход', () => { Game.save(); window.close(); }]);
    this.sel = 0;
    document.getElementById('menu').classList.remove('hidden');
    this.draw();
  },
  hide() { document.getElementById('menu').classList.add('hidden'); },
  draw() {
    // кнопки создаются один раз; при наведении меняется только подсветка,
    // иначе элемент под курсором пересоздаётся и клик теряется
    const box = document.getElementById('menuItems');
    box.innerHTML = this.items.map(([t], i) => `<div class="mitem" data-i="${i}">${t}</div>`).join('');
    box.querySelectorAll('.mitem').forEach(el => {
      el.onclick = () => this.items[+el.dataset.i][1]();
      el.onmouseenter = () => { this.sel = +el.dataset.i; this.highlight(); };
    });
    this.highlight();
  },
  highlight() {
    document.querySelectorAll('#menuItems .mitem').forEach((el, i) => el.classList.toggle('sel', i === this.sel));
  },
  key(code) {
    if (code === 'ArrowDown' || code === 'KeyS') { this.sel = (this.sel + 1) % this.items.length; this.highlight(); }
    else if (code === 'ArrowUp' || code === 'KeyW') { this.sel = (this.sel + this.items.length - 1) % this.items.length; this.highlight(); }
    else if (code === 'Enter' || code === 'Space') this.items[this.sel][1]();
    else if (code === 'Escape' && world) { this.hide(); Game.mode = 'world'; }
  },
};

// ===== Ввод =====
const held = new Set();
const DIRS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
// e.code не зависит от раскладки — Q/W/E работают и на русской (Й/Ц/У)
window.addEventListener('keydown', e => {
  // когда фокус в поле ввода (код-приглашение/чат/имя) — не перехватываем клавиши
  const tgt = e.target;
  if (tgt && tgt.tagName && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat && Game.mode !== 'world') return;
  held.add(e.code);
  if (Game.mode === 'menu') return Menu.key(e.code);
  if (Game.mode === 'combat') return Combat.key(e.code);
  if (Game.mode === 'trap') return Trap.key(e.code);
  if (Game.mode !== 'world') return panelKey(e.code);
  if (e.code === 'KeyI' || e.code === 'Tab') openPanel('inventory');
  else if (e.code === 'KeyB') openPanel('bestiary');
  else if (e.code === 'KeyK') openPanel('skills');
  else if (e.code === 'KeyL') openPanel('history');
  else if (e.code === 'KeyU') openPanel('quests');
  else if (e.code === 'KeyN') openPanel('net');
  else if (e.code === 'KeyH') openPanel('help');
  else if (e.code === 'Space') tryDash();
  else if (e.code === 'Escape') Menu.show();
});
window.addEventListener('keyup', e => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
window.addEventListener('beforeunload', () => Game.save());

// ===== Движение =====
function tryDash() {
  if (!player || player.dashCd > 0 || player.stamina < 20) {
    if (player && player.stamina < 20) Game.log('Нет сил для рывка (нужно 20 выносливости)', '#9adcff');
    return;
  }
  const [dx, dy] = player.dir;
  let nx = player.x, ny = player.y, dist = 0;
  for (let i = 1; i <= 3; i++) {
    const tx = player.x + dx * i, ty = player.y + dy * i;
    if (!world.walkable(tx, ty) || world.mobAt(tx, ty)) break;
    nx = tx; ny = ty; dist = i;
  }
  if (!dist) { Game.log('Некуда рвануть!', '#778'); return; }
  player.x = nx; player.y = ny;
  player.stamina = Math.max(0, player.stamina - 20);
  player.dashCd = 2.2;
  player.dashFx = 0.35;
  player.invuln = Math.max(player.invuln, 0.5);
  FX.dust(player.x + 0.5, player.y + 0.5, 10);
  FX.burst(player.x + 0.5, player.y + 0.5, 8, ['#4fe3ff', '#ffffff'], 3);
  FX.shake(0.18);
  SFX.dash();
  const ch = world.chestAt(nx, ny);
  if (ch) openChest(ch);
  const tile = world.tileAt(nx, ny);
  if (world.isDungeon) {
    if (tile === T.STAIRS) return Dungeons.exit();
    const trap = world.trapAt(nx, ny);
    if (trap) Trap.trigger(trap);
  } else if (tile === T.CAVE) Dungeons.enter(nx, ny);
  Game.updateHud();
}
function tryMove(dx, dy) {
  const nx = player.x + dx, ny = player.y + dy;
  player.dir = [dx, dy];
  const mob = world.mobAt(nx, ny);
  if (mob) { if (player.invuln <= 0) Combat.start(mob); return; }
  if (!world.walkable(nx, ny)) return;
  player.x = nx; player.y = ny;
  player.bob += 1;
  player.stepAcc += 1;
  if (player.stepAcc >= 3) { player.stepAcc = 0; SFX.step(); }
  // пыль из-под ног: чаще при беге
  const running = held.has('ShiftLeft') || held.has('ShiftRight');
  if (Math.random() < (running ? 0.5 : 0.18)) FX.dust(nx + 0.5, ny + 0.6, running ? 3 : 1);
  const ch = world.chestAt(nx, ny);
  if (ch) openChest(ch);
  const tile = world.tileAt(nx, ny);
  if (world.isDungeon) {
    if (tile === T.STAIRS) return Dungeons.exit();
    const trap = world.trapAt(nx, ny);
    if (trap) Trap.trigger(trap);
  } else if (tile === T.CAVE) {
    Dungeons.enter(nx, ny);
  }
}

function openChest(ch) {
  world.removeChest(ch);
  const rnd = Math.random;
  const lvl = world.zoneLevel(ch.x, ch.y);
  // сундуки подземелий богаче, сундук босса — самый богатый
  const rich = ch.big ? 4 : world.isDungeon ? 2 : 1;
  const gold = Math.round((5 + rnd() * 10) * lvl * rich);
  player.gold += gold;
  const loot = [weightedPick(LOOT_COMMON, rnd)];
  if (rnd() < 0.5 || rich > 1) loot.push(weightedPick(LOOT_COMMON, rnd));
  if (ch.big) loot.push(LOOT_GEAR_T2[Math.floor(rnd() * 3)]);
  if (rnd() < 0.25 * rich) {
    const pool = lvl >= 3 && rnd() < 0.5 ? LOOT_GEAR_T2 : LOOT_GEAR_T1;
    loot.push(pool[Math.floor(rnd() * pool.length)]);
  }
  loot.forEach(id => Game.addItem(id));
  Game.log(`Сундук: +${gold} золота, ${loot.map(id => iconHtml(ITEMS[id].look, 14) + ' ' + ITEMS[id].name).join(', ')}`, '#ffe8a0');
  FX.burst(ch.x + 0.5, ch.y + 0.5, 18, ['#ffd75e', '#fff6c8', '#b9823f'], 3);
  FX.text(ch.x + 0.5, ch.y - 0.2, `+${gold}`, '#ffd75e', 16);
  FX.shake(0.12);
  SFX.chest();
  Game.updateHud();
  Game.save();
}

function updateWorld(dt) {
  FX.update(dt);
  DayNight.update(dt);
  if (world.isDungeon) world.reveal(player.x, player.y);
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, (player.dashCd || 0) - dt);
  player.dashFx = Math.max(0, (player.dashFx || 0) - dt);
  // выносливость: бег тратит, покой восстанавливает
  const wantRun = held.has('ShiftLeft') || held.has('ShiftRight');
  if (wantRun && player.stamina > 1) player._running = true; else player._running = false;
  if (player._running) player.stamina = Math.max(0, player.stamina - dt * 16);
  else player.stamina = Math.min(player.maxStamina, player.stamina + dt * 14);
  player.moveCd -= dt;
  if (player.moveCd <= 0) {
    for (const code in DIRS) {
      if (held.has(code)) {
        const running = player._running && player.stamina > 1;
        tryMove(...DIRS[code]);
        player.moveCd = running ? 0.07 : 0.12;
        // бег оставляет след пыли
        if (running && Math.random() < 0.6) FX.dust(player.x + 0.5, player.y + 0.7, 2);
        break;
      }
    }
  }
  // тихий худ-таймер для выносливости
  hudStaminaTimer -= dt;
  if (hudStaminaTimer <= 0) { Game.updateHud(); hudStaminaTimer = 0.25; }
  // атмосфера: светлячки ночью, угли в подземелье
  ambientTimer -= dt;
  if (ambientTimer <= 0) {
    ambientTimer = world.isDungeon ? 0.25 : 0.4;
    if (world.isDungeon) FX.embers(player.x + 0.5, player.y + 0.5, 1);
    else {
      const ov = DayNight.overlay();
      if (ov.dark > 0.15 && Math.random() < 0.7) FX.firefly(player.x + 0.5, player.y + 0.5);
      else if (Math.random() < 0.15) FX.dust(player.x + (Math.random() - 0.5) * 10, player.y + (Math.random() - 0.5) * 8, 1);
    }
  }
  if (Game.mode !== 'world') return;

  // медленное восстановление HP вне боя (1% в секунду), если за вами никто не гонится
  if (player.hp < player.maxHp && !world.mobs.some(m => m.chasing)) {
    player.regenAcc = (player.regenAcc || 0) + dt * player.maxHp * 0.01;
    if (player.regenAcc >= 1) { const h = Math.floor(player.regenAcc); player.regenAcc -= h; player.hp = Math.min(player.maxHp, player.hp + h); Game.updateHud(); }
  }

  // мобы рядом с игроком
  for (const m of world.mobs) {
    if (m.still) { m.chasing = false; continue; } // мимики не двигаются
    const dx = player.x - m.x, dy = player.y - m.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 30) continue;
    m.stun = Math.max(0, m.stun - dt);
    m.moveT -= dt;
    m.chasing = dist <= 6 && m.stun <= 0 && player.invuln <= 0;
    if (m.moveT > 0) continue;
    m.moveT = m.chasing ? 0.45 : 0.8 + Math.random() * 1.2;
    let step;
    if (m.chasing) {
      const opts = [];
      if (dx) opts.push([Math.sign(dx), 0]);
      if (dy) opts.push([0, Math.sign(dy)]);
      if (Math.abs(dy) > Math.abs(dx)) opts.reverse();
      step = opts.find(([sx, sy]) => canMobStep(m, m.x + sx, m.y + sy));
    } else if (Math.random() < 0.6) {
      const [sx, sy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
      if (Math.abs(m.x + sx - m.homeX) + Math.abs(m.y + sy - m.homeY) <= (m.homeR || 5) && canMobStep(m, m.x + sx, m.y + sy)) step = [sx, sy];
    }
    if (!step) continue;
    const nx = m.x + step[0], ny = m.y + step[1];
    if (nx === player.x && ny === player.y) {
      if (player.invuln <= 0 && m.stun <= 0) { Combat.start(m); return; }
      continue;
    }
    m.x = nx; m.y = ny;
  }
}

function canMobStep(m, x, y) {
  if (!world.walkable(x, y) || world.mobAt(x, y) || world.chestAt(x, y)) return false;
  return world.distFromSpawn(x, y) >= 7; // мобы не заходят в безопасную зону
}

// таймеры атмосферы и HUD
let hudStaminaTimer = 0, ambientTimer = 0;

// ===== Отрисовка =====
const PLAYER_LOOK = { shape: 'circle', color: '#3d7bff' };
const CHEST_LOOK = { shape: 'square', color: '#b9823f' };

function render(time) {
  const w = window.innerWidth, h = window.innerHeight;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, w, h);
  if (!world) return renderMenuBg(time);
  // тряска экрана от FX
  const camBaseX = player.rx * TS + TS / 2 - w / 2;
  const camBaseY = player.ry * TS + TS / 2 - h / 2;
  const camX = camBaseX + (FX.shakeX || 0);
  const camY = camBaseY + (FX.shakeY || 0);
  const x0 = Math.floor(camX / TS), y0 = Math.floor(camY / TS);
  const x1 = Math.ceil((camX + w) / TS), y1 = Math.ceil((camY + h) / TS);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // земля рисуется из готовых картинок чанков (быстро даже без видеокарты)
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++)
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++)
      ctx.drawImage(chunkCanvas(cx, cy), Math.round(cx * CHUNK * TS - camX), Math.round(cy * CHUNK * TS - camY));
  // динамический блеск воды поверх чанков
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const t = world.tileAt(tx, ty);
      if (t === T.WATER || t === T.DEEP) drawTileOverlay(ctx, t, tx * TS - camX, ty * TS - camY, tx, ty, time);
    }

  // сундуки — объёмные, с парением и блеском
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++)
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++)
      for (const ch of world.getChunk(cx, cy).chests) {
        const bobY = Math.sin(time * 2.2 + ch.x * 1.7 + ch.y) * 2;
        const sx = ch.x * TS - camX + 16, sy = ch.y * TS - camY + 16 + bobY;
        // золотое свечение
        ctx.save();
        const gl = ctx.createRadialGradient(sx, sy, 2, sx, sy, 26);
        gl.addColorStop(0, ch.big ? 'rgba(255,215,94,0.35)' : 'rgba(255,215,94,0.18)');
        gl.addColorStop(1, 'rgba(255,215,94,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(sx, sy, 26, 0, 7); ctx.fill();
        ctx.restore();
        drawShape3D(ctx, CHEST_LOOK, sx, sy, ch.big ? 12 : 9, { h: 7, lift: 0 });
        ctx.fillStyle = '#ffd75e'; ctx.fillRect(sx - 8, sy - 5, 16, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(sx - 1.5, sy - 9, 3, 3);
        if (ch.big) {
          ctx.font = 'bold 13px sans-serif';
          ctx.fillStyle = '#ffd75e';
          ctx.fillText('★', sx, sy - 16 + Math.sin(time * 3) * 2);
        }
      }

  // мобы — псевдо-3D с тенью, прыжком, полоской HP
  const viewLim = weatherViewLimit();
  for (const m of world.mobs) {
    m.rx += (m.x - m.rx) * 0.25; m.ry += (m.y - m.ry) * 0.25;
    const sx = m.rx * TS - camX, sy = m.ry * TS - camY;
    if (sx < -TS || sy < -TS || sx > w + TS || sy > h + TS) continue;
    // туман/дождь режут обзор: далёкие мобы не видны
    if (!world.isDungeon && viewLim < 90 && (Math.abs(m.x - player.x) + Math.abs(m.y - player.y)) > viewLim) continue;
    if (m.disguised) { // мимик выглядит как сундук
      const bobY = Math.sin(time * 2 + m.homeX) * 1.5;
      drawShape3D(ctx, CHEST_LOOK, sx + 16, sy + 16 + bobY, 9, { h: 7 });
      ctx.fillStyle = '#ffd75e'; ctx.fillRect(sx + 8, sy + 14 + bobY, 16, 3);
      continue;
    }
    const look = MOB_KINDS[m.kind].look;
    const dx = player.x - m.x, dy = player.y - m.y, d = Math.hypot(dx, dy) || 1;
    const hop = Math.abs(Math.sin(time * 5 + m.homeX * 2 + m.homeY)) * (m.chasing ? 4 : 2);
    const squash = m.chasing ? Math.sin(time * 10 + m.homeX) * 0.5 : 0;
    drawShape3D(ctx, look, sx + 16, sy + 16 + Math.sin(time * 4 + m.homeX) * 1.5, m.boss ? 15 : 11,
      { lookX: m.chasing ? dx / d : 0, lookY: m.chasing ? dy / d : 0, alpha: m.kind === 'ghost' ? 0.85 : 1, outline: m.elite ? '#ffd75e' : (m.boss ? '#ff5d5d' : null), lift: hop, squash, h: m.boss ? 9 : 5 });
    // элитное свечение
    if (m.elite || m.boss) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 4);
      ctx.strokeStyle = m.boss ? '#ff5d5d' : '#ffd75e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + 16, sy + 12, (m.boss ? 20 : 15), 0, 7); ctx.stroke();
      ctx.restore();
    }
    // мини-полоска HP над мобом (видно состояние без входа в бой)
    if (m.hp < m.maxHp || m.chasing || m.boss || m.elite) {
      const bw = m.boss ? 36 : 26;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx + 16 - bw / 2, sy - 2, bw, 5);
      ctx.fillStyle = m.hp / m.maxHp > 0.5 ? '#5be06b' : m.hp / m.maxHp > 0.25 ? '#ffb347' : '#ff5d5d';
      ctx.fillRect(sx + 16 - bw / 2 + 1, sy - 1, (bw - 2) * Math.max(0, m.hp / m.maxHp), 3);
    }
    const danger = m.lvl - player.lvl;
    ctx.font = 'bold 10px sans-serif';
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(m.lvl, sx + 28, sy + 3);
    ctx.fillStyle = danger >= 2 ? '#ff5d5d' : danger >= 1 ? '#ffb347' : danger <= -2 ? '#9aa' : '#fff';
    ctx.fillText(m.lvl, sx + 28, sy + 3);
    if (m.chasing) {
      const jb = Math.sin(time * 8) * 2;
      ctx.font = 'bold 15px sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('!', sx + 16, sy - 8 + jb);
      ctx.fillStyle = '#ff4d4d'; ctx.fillText('!', sx + 16, sy - 8 + jb);
    }
  }

  // другие игроки в сети (кооператив) — под локальным игроком
  if (typeof Net !== 'undefined' && Net.active) Net.drawRemotes(ctx, camX, camY, TS, time);

  // игрок — объёмный, наклоняется по движению, след рывка
  player.rx += (player.x - player.rx) * 0.35; player.ry += (player.y - player.ry) * 0.35;
  const moving = Math.hypot(player.x - player.rx, player.y - player.ry) > 0.02;
  const runBob = moving ? Math.abs(Math.sin(time * (player._running ? 14 : 10))) * 3 : Math.sin(time * 2) * 1.2;
  const px = player.rx * TS - camX + 16, py = player.ry * TS - camY + 16;
  // след рывка
  if (player.dashFx > 0) {
    ctx.save();
    ctx.globalAlpha = player.dashFx * 2;
    ctx.strokeStyle = '#4fe3ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(px - player.dir[0] * 46, py - player.dir[1] * 46); ctx.lineTo(px, py); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = player.invuln > 0 && Math.floor(time * 10) % 2 ? 0.45 : 1;
  drawShape3D(ctx, PLAYER_LOOK, px, py - runBob * 0.4, 11, {
    lookX: player.dir[0], lookY: player.dir[1],
    tiltX: player.dir[0] * 2.5, tiltY: player.dir[1] * 1.5,
    lift: runBob * 0.7 + (player.dashFx > 0 ? 4 : 0),
    squash: moving ? Math.sin(time * (player._running ? 14 : 10)) * 0.6 : 0,
    h: 7,
  });
  // козырёк-направление
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(px + player.dir[0] * 7, py - runBob * 0.4 - 4 + player.dir[1] * 7, 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#3d7bff';
  ctx.beginPath(); ctx.arc(px + player.dir[0] * 7 + 1, py - runBob * 0.4 - 4 + player.dir[1] * 7 + 1, 1.6, 0, 7); ctx.fill();
  ctx.restore();

  // ловушки (видимые или уже сработавшие) — пульсируют
  if (world.isDungeon) {
    for (const t of world.traps) {
      if (!t.visible) continue;
      const sx = t.x * TS - camX, sy = t.y * TS - camY;
      const pulse = t.armed ? 0.45 + 0.25 * Math.sin(time * 5 + t.x + t.y) : 0.2;
      ctx.fillStyle = t.armed ? `rgba(255,70,70,${pulse})` : 'rgba(150,150,150,0.3)';
      // объёмные шипы: тень + грань
      for (let i = 0; i < 3; i++) {
        const bx = sx + 6 + i * 8;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.moveTo(bx - 1, sy + 25); ctx.lineTo(bx + 5, sy + 13); ctx.lineTo(bx + 9, sy + 25); ctx.fill();
        ctx.fillStyle = t.armed ? `rgba(255,90,90,${0.5 + pulse * 0.5})` : 'rgba(150,150,150,0.4)';
        ctx.beginPath(); ctx.moveTo(bx, sy + 24); ctx.lineTo(bx + 4, sy + 12); ctx.lineTo(bx + 8, sy + 24); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.moveTo(bx + 4, sy + 12); ctx.lineTo(bx + 5.5, sy + 17); ctx.lineTo(bx + 2.5, sy + 17); ctx.fill();
      }
    }
  }

  // частицы и всплывающие цифры поверх мира
  FX.draw(ctx, camX, camY - 16, TS);

  // свет: факел в подземелье / день-ночь + виньетка снаружи
  ctx.drawImage(world.isDungeon ? torch(w, h, time) : vignette(w, h), 0, 0);
  if (!world.isDungeon) {
    const dnOn = (typeof Settings === 'undefined') || (Settings.data.daynight !== false);
    const ov = DayNight.overlay();
    if (dnOn && ov.dark > 0.02) {
      ctx.fillStyle = `rgba(8,12,40,${ov.dark})`;
      ctx.fillRect(0, 0, w, h);
    }
    // тёплый свет дня
    if (dnOn) {
      const dayGlow = ctx.createRadialGradient(w / 2, h * 0.25, 10, w / 2, h * 0.25, Math.max(w, h) * 0.7);
      dayGlow.addColorStop(0, 'rgba(255,240,200,0.06)');
      dayGlow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = dayGlow; ctx.fillRect(0, 0, w, h);
    }
    drawWeather(w, h, time);
  }
}

// Погода в открытом мире: дождь (штрихи) и туман (молочная пелена, режет обзор)
function drawWeather(w, h, time) {
  if (typeof Game === 'undefined') return;
  if (Game.weather === 'rain') {
    ctx.save();
    ctx.fillStyle = 'rgba(20,30,55,0.18)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(170,200,255,0.35)';
    ctx.lineWidth = 1.2;
    const count = 90, t = time * 900;
    for (let i = 0; i < count; i++) {
      const seed = i * 97.13;
      const x = ((seed * 7.3 + t * 0.6) % (w + 40)) - 20;
      const y = ((seed * 3.1 + t) % (h + 40)) - 20;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke();
    }
    // вспышки-лужи на «земле» не рисуем — обходятся штрихами
    ctx.restore();
  } else if (Game.weather === 'fog') {
    ctx.save();
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.12, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(190,200,215,0.05)');
    g.addColorStop(0.6, 'rgba(180,190,210,0.28)');
    g.addColorStop(1, 'rgba(170,180,200,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // плавающие клочья тумана
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 3; i++) {
      const y = h * (0.3 + i * 0.22) + Math.sin(time * 0.5 + i * 2) * 14;
      ctx.fillStyle = '#c8d2e0';
      ctx.beginPath(); ctx.ellipse((w / 2) + Math.sin(time * 0.3 + i) * w * 0.25, y, w * 0.55, 46, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

// насколько сильно погода режет обзор (0 — ясно, 1 — плотный туман)
function weatherViewLimit() {
  if (typeof Game === 'undefined') return 99;
  if (Game.weather === 'fog') return 7;  // дальше — мобы скрыты
  if (Game.weather === 'rain') return 14;
  return 99;
}

// в подземелье темно: видно только вокруг игрока (с мерцанием факела)
let _torch = null, _torchW = 0, _torchH = 0, _torchT = 0;
function torch(w, h, time = 0) {
  // перерисовываем ~10 раз в секунду ради мерцания — дёшево, т.к. один градиент
  if (_torch && _torchW === w && _torchH === h && time - _torchT < 0.09) return _torch;
  _torchT = time;
  _torchW = w; _torchH = h;
  if (!_torch) _torch = document.createElement('canvas');
  _torch.width = w; _torch.height = h;
  const c = _torch.getContext('2d');
  const flick = Math.sin(time * 9) * 0.5 + Math.sin(time * 23 + 1.7) * 0.3 + Math.sin(time * 5.3) * 0.2;
  const r1 = TS * (2.6 + flick * 0.35), r2 = TS * (8.2 + flick * 0.6);
  const g = c.createRadialGradient(w / 2, h / 2, r1, w / 2, h / 2, r2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(10,4,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0.94)');
  c.clearRect(0, 0, w, h);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // тёплое свечение вокруг игрока
  const warm = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, r1 * 1.6);
  warm.addColorStop(0, `rgba(255,170,80,${0.10 + flick * 0.02})`);
  warm.addColorStop(1, 'rgba(255,170,80,0)');
  c.fillStyle = warm; c.fillRect(0, 0, w, h);
  return _torch;
}

// кеш отрисованных чанков земли
const chunkCache = new Map();
function chunkCanvas(cx, cy) {
  const key = world.seed + ':' + cx + ',' + cy;
  let cv = chunkCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = CHUNK * TS;
  const c = cv.getContext('2d');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const tiles = world.getChunk(cx, cy).tiles;
  for (let y = 0; y < CHUNK; y++)
    for (let x = 0; x < CHUNK; x++)
      drawTile(c, tiles[y * CHUNK + x], x * TS, y * TS, cx * CHUNK + x, cy * CHUNK + y);
  chunkCache.set(key, cv);
  if (chunkCache.size > 80) chunkCache.delete(chunkCache.keys().next().value);
  return cv;
}

let _vig = null;
function vignette(w, h) {
  if (_vig && _vig.width === w && _vig.height === h) return _vig;
  _vig = document.createElement('canvas');
  _vig.width = w; _vig.height = h;
  const c = _vig.getContext('2d');
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  return _vig;
}

// фон главного меню: плавающие объёмные фигуры мобов + параллакс и туман
const menuBg = Array.from({ length: 30 }, (_, i) => ({
  kind: Object.keys(MOB_KINDS)[i % Object.keys(MOB_KINDS).length], x: Math.random(), y: Math.random(), s: 10 + Math.random() * 30, v: 0.008 + Math.random() * 0.03,
  ph: Math.random() * 6.28, depth: 0.3 + Math.random() * 0.7,
}));
function renderMenuBg(time) {
  const w = window.innerWidth, h = window.innerHeight;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#141828'); g.addColorStop(0.6, '#0d0f14'); g.addColorStop(1, '#080a10');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // дальний туман
  ctx.fillStyle = 'rgba(80,100,180,0.05)';
  for (let i = 0; i < 4; i++) {
    const y = h * (0.2 + i * 0.2) + Math.sin(time * 0.4 + i * 2) * 12;
    ctx.beginPath(); ctx.ellipse(w / 2, y, w * 0.7, 40, 0, 0, 7); ctx.fill();
  }
  const sorted = menuBg.slice().sort((a, b) => a.depth - b.depth);
  for (const b of sorted) {
    b.y -= (b.v * b.depth) / 60;
    if (b.y < -0.1) { b.y = 1.1; b.x = Math.random(); }
    const lift = Math.abs(Math.sin(time * 1.5 + b.ph)) * 6;
    drawShape3D(ctx, MOB_KINDS[b.kind].look, b.x * w + Math.sin(time * 0.5 + b.s + b.ph) * 26 * b.depth, b.y * h - lift,
      b.s, { alpha: 0.10 + b.depth * 0.22, shadow: false, h: b.s * 0.4, lift });
  }
}

// ===== Миникарта =====
const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
const mmImg = mctx.createImageData(120, 120);
function renderMinimap() {
  for (let y = 0; y < 120; y++)
    for (let x = 0; x < 120; x++) {
      const wx = player.x - 60 + x, wy = player.y - 60 + y;
      const t = world.tileAt(wx, wy);
      const c = world.isDungeon && !world.isSeen(wx, wy) ? [8, 8, 10] : TILE_INFO[t].color, i = (y * 120 + x) * 4;
      mmImg.data[i] = c[0]; mmImg.data[i + 1] = c[1]; mmImg.data[i + 2] = c[2]; mmImg.data[i + 3] = 255;
    }
  mctx.putImageData(mmImg, 0, 0);
  mctx.fillStyle = '#ff3b3b';
  const vlim = weatherViewLimit();
  for (const m of world.mobs) {
    const md = Math.abs(m.x - player.x) + Math.abs(m.y - player.y);
    if (m.disguised || (world.isDungeon && md > 8) || (!world.isDungeon && vlim < 90 && md > vlim)) continue;
    const x = m.x - player.x + 60, y = m.y - player.y + 60;
    if (x >= 0 && y >= 0 && x < 120 && y < 120) mctx.fillRect(x - 1, y - 1, 2, 2);
  }
  const sx = world.spawn.x - player.x + 60, sy = world.spawn.y - player.y + 60;
  mctx.fillStyle = '#ffd75e'; mctx.fillRect(sx - 2, sy - 2, 4, 4);
  mctx.fillStyle = '#fff'; mctx.fillRect(58, 58, 4, 4);
  const t = world.tileAt(player.x, player.y);
  const weather = (typeof Game !== 'undefined' && Game.weather && typeof WEATHERS !== 'undefined' && WEATHERS[Game.weather])
    ? ' · ' + WEATHERS[Game.weather].name : '';
  document.getElementById('posText').textContent = world.isDungeon
    ? `Подземелье ур.${world.level} · лестница наверх — жёлтая точка`
    : `${DayNight.label()}${weather} · ${TILE_INFO[t].name} · зона ур.${world.zoneLevel(player.x, player.y)} · (${player.x - world.spawn.x}, ${player.y - world.spawn.y})`;
}

// ===== Панели: инвентарь, бестиарий, навыки, помощь =====
const panel = document.getElementById('panel'), panelBox = document.getElementById('panelBox');

function openPanel(name) {
  Game.mode = name;
  panel.classList.remove('hidden');
  drawPanel();
}
function closePanel() { Game.mode = 'world'; panel.classList.add('hidden'); }

function drawPanel() {
  if (Game.mode === 'inventory') {
    panelBox.innerHTML = `<span class="close">Esc / I — закрыть</span><h2>Инвентарь</h2>
      <div class="stats">HP ${player.hp}/${player.maxHp} · Ур. ${player.lvl} · Золото ${player.gold} · Урон за букву:
        ${TYPE_KEYS.map(t => `<span class="t-${t}">${TYPES[t].icon} ${player.dmg(t).toFixed(1)}</span>`).join(' ')}</div>
      <div class="gear">${Object.keys(SLOT_NAMES).map(s => {
        const g = player.gear[s];
        return `<div class="slot">${SLOT_NAMES[s]}:<br>${g ? `${iconHtml(ITEMS[g].look, 18)} <b>${ITEMS[g].name}</b>` : '<span style="color:#667">пусто</span>'}</div>`;
      }).join('')}</div>
      <div class="inv">${player.inv.map((s, i) => {
        const it = ITEMS[s.id];
        return `<div class="item" data-i="${i}"><span class="num">${i < 9 ? i + 1 : ''}</span>${iconHtml(it.look, 22)} <b>${it.name}</b>${s.count > 1 ? ' ×' + s.count : ''}<div class="d">${it.desc}</div></div>`;
      }).join('') || '<div class="sub">Пусто</div>'}</div>
      <p class="small">Цифра или клик — использовать / надеть.</p>`;
    panelBox.querySelectorAll('.item').forEach(el => (el.onclick = () => useFromInventory(+el.dataset.i)));
  } else if (Game.mode === 'bestiary') {
    const kinds = Object.keys(MOB_KINDS).filter(k => Game.beast(k).seen);
    panelBox.innerHTML = `<span class="close">Esc / B — закрыть</span><h2>Бестиарий</h2>
      <p class="small">Уязвимости открываются, когда вы бьёте моба буквами соответствующего типа (или свитком прозрения).</p>
      ${kinds.map(k => {
        const b = Game.beast(k), mk = MOB_KINDS[k];
        return `<div class="beast">${iconHtml(mk.look, 40)}<div><b>${mk.name}</b> · побеждено: ${b.kills}
          <div class="weak">${weakHtml(k, b.known)}</div>${b.kills ? `<div class="desc">${mk.desc}</div>` : ''}</div></div>`;
      }).join('') || '<p>Вы ещё никого не встретили.</p>'}
      <p class="small">Всего видов: ${Object.keys(MOB_KINDS).length}, встречено: ${kinds.length}</p>`;
  } else if (Game.mode === 'skills') {
    panelBox.innerHTML = `<span class="close">Esc / K — закрыть</span><h2>Навыки</h2>
      <div class="stats">Свободных очков: <b class="sp">${player.skillPoints}</b> · очко даётся за каждый уровень. Клик по навыку — вложить очко.</div>
      <div class="tree">${SKILL_TREE.map(br => `
        <div class="branch"><div class="bname t-${br.type}">${TYPES[br.type].icon} ${br.name}</div>
        ${br.nodes.map((n, i) => {
          const r = player.skill(n.id);
          const open = i === 0 || player.skill(br.nodes[i - 1].id) > 0;
          const can = open && r < n.max && player.skillPoints > 0;
          return `<div class="node ${r ? 'has' : ''} ${open ? '' : 'locked'} ${can ? 'can' : ''}" data-id="${n.id}" style="--c:${TYPES[br.type].color}">
            <div class="nn">${n.name} <span class="rk">${r}/${n.max}</span></div><div class="d">${n.desc(r)}</div></div>`;
        }).join('<div class="link"></div>')}</div>`).join('')}</div>`;
    panelBox.querySelectorAll('.node.can').forEach(el => (el.onclick = () => learnSkill(el.dataset.id)));
  } else if (Game.mode === 'history') {
    drawHistory();
  } else if (Game.mode === 'help') {
    panelBox.innerHTML = `<span class="close">Esc / H — закрыть</span><div class="help"><h2>Как играть</h2>
      <p><kbd>WASD</kbd> / стрелки — ходить. <kbd>Shift</kbd> — бег (тратит выносливость EN). <kbd>Пробел</kbd> — рывок на 3 клетки (20 EN, 2.2с перезарядка, даёт неуязвимость). Исследуйте мир, открывайте сундуки, ищите мобов. Чем дальше от старта, тем сильнее мобы. Ночью появляются светлячки, днём видно дальше.</p>
      <p><b>Бой.</b> В свой ход выберите тип атаки клавишей:</p>
      <ul>
        <li><kbd>Q</kbd> <span class="t-Q">✦ Магия</span></li>
        <li><kbd>W</kbd> <span class="t-W">▲ Физический</span></li>
        <li><kbd>E</kbd> <span class="t-E">◉ Психический</span></li>
      </ul>
      <p>Появится код, например <b><span class="t-W">W</span><span class="t-Q">Q</span><span class="t-W">WW</span><span class="t-E">E</span><span class="t-W">W</span></b>. Наберите его как можно быстрее и без ошибок. Каждая буква бьёт своим типом урона, буквы выбранного типа сильнее (×1.3), остальные слабее (×0.7).</p>
      <p>Итоговый урон × <b>скорость</b> (знаков в секунду) × <b>точность</b> (−12% за ошибку) × <b>уязвимость моба</b> (×2 уязвим, ×0.5 стойкий, ×0 иммунитет). Бонусы: без ошибок ×1.25, скорость от 6 зн/с ×1.2.</p>
      <p>В ход врага наберите короткий <b>код блока</b>, чтобы снизить урон до 60%.</p>
      <p><b>Подземелья</b> — тёмные арки с красной меткой. Внутри темно, есть ловушки (наступили — быстро наберите код, чтобы увернуться), сундуки и мимики, особые мобы и босс <b>Страж глубин</b>, у которого уязвимости меняются каждый ход. Выход — по лестнице, на которой вы появились.</p>
      <p>У каждого вида мобов есть <b>особенность</b> (яд, регенерация, двойной укус, броня…) — она видна в бою. Мобы с золотой обводкой — <b>элитные</b>: сильнее, но награда двойная. Если моб выше вас по уровню, вы бьёте его слабее, а он вас сильнее. Серия идеальных атак даёт <b>комбо-множитель</b>.</p>
      <p><kbd>4</kbd> — предмет, <kbd>5</kbd> — сбежать, <kbd>Пробел</kbd> — пропустить итог (в мире — рывок).</p>
      <p><kbd>I</kbd> — инвентарь, <kbd>K</kbd> — навыки, <kbd>B</kbd> — бестиарий, <kbd>L</kbd> — летопись боёв, <kbd>H</kbd> — справка, <kbd>Esc</kbd> — меню, <kbd>F11</kbd> — полный экран. Игра сохраняется сама. Раскладка не важна.</p></div>`;
  }
}

function learnSkill(id) {
  if (player.skillPoints <= 0) return;
  for (const br of SKILL_TREE) {
    const i = br.nodes.findIndex(n => n.id === id);
    if (i < 0) continue;
    const n = br.nodes[i];
    if (player.skill(id) >= n.max) return;
    if (i > 0 && !player.skill(br.nodes[i - 1].id)) return;
    player.skills[id] = player.skill(id) + 1;
    player.skillPoints--;
    player.recalcMaxHp();
    Game.log(`Изучено: ${n.name} (${player.skill(id)}/${n.max})`, '#ffd75e');
    Game.updateHud();
    Game.save();
    drawPanel();
    return;
  }
}

function useFromInventory(i) {
  const s = player.inv[i];
  if (!s) return;
  const it = ITEMS[s.id];
  if (it.kind === 'heal') {
    if (player.hp >= player.maxHp) { Game.log('Здоровье и так полное'); return; }
    Game.removeItem(s.id);
    player.hp = Math.min(player.maxHp, player.hp + it.heal);
    Game.log(`${it.name}: +${it.heal} HP`, '#5be06b');
    FX.burst(player.x + 0.5, player.y + 0.3, 14, ['#5be06b', '#c8ffb8'], 2.5);
    FX.text(player.x + 0.5, player.y - 0.3, `+${it.heal}`, '#5be06b', 16);
    SFX.potion();
  } else if (it.kind === 'gear') {
    const old = player.gear[it.slot];
    Game.removeItem(s.id);
    player.gear[it.slot] = s.id;
    if (old) Game.addItem(old);
    Game.log(`Надето: ${iconHtml(it.look, 14)} ${it.name}`, '#ffe8a0');
  } else {
    Game.log(`${it.name} можно использовать только в бою`);
    return;
  }
  Game.updateHud();
  drawPanel();
}

function panelKey(code) {
  const closeKeys = { inventory: ['KeyI', 'Tab'], bestiary: ['KeyB'], skills: ['KeyK'], help: ['KeyH'], history: ['KeyL'] };
  if (code === 'Escape' || (closeKeys[Game.mode] || []).includes(code) || (Game.mode === 'help' && code === 'Space')) return closePanel();
  const m = code.match(/^Digit([1-9])$/);
  if (m && Game.mode === 'inventory') useFromInventory(+m[1] - 1);
}

// ===== Летопись боёв (L) =====
let histOpen = null;
function drawHistory() {
  const L = History.list;
  const wins = L.filter(b => b.result === 'win').length, losses = L.filter(b => b.result === 'loss').length;
  const atks = L.flatMap(b => b.events.filter(e => e.t === 'attack'));
  const avg = f => atks.length ? (atks.reduce((a, e) => a + f(e), 0) / atks.length) : 0;
  const best = atks.reduce((a, e) => (e.typed === e.len && e.cps > a ? e.cps : a), 0);
  const byType = TYPE_KEYS.map(t => `<span class="t-${t}">${TYPES[t].short} ${atks.filter(e => e.type === t).length}</span>`).join(' ');
  const resName = { win: 'Победа', loss: 'Поражение', flee: 'Побег' };
  const evLine = e => {
    switch (e.t) {
      case 'attack': return `<span class="t-${e.type}">${TYPES[e.type].short}</span> <code>${e.code}</code> набрано ${e.typed}/${e.len}` +
        `${e.hidden ? ` (скрыто ${e.hidden})` : ''}, ${e.time}с из ${e.limit}с, <b>${e.cps} зн/с</b>, ошибок ${e.mistakes} → <b class="hdmg">−${e.dmg}</b>` +
        `${e.tags.length ? ' · ' + e.tags.join(', ') : ''} · у врага ${e.mobHp} HP`;
      case 'defend': return `Блок <code>${e.code}</code> ${e.typed}/${e.code.length}, ${e.time}с, ошибок ${e.mistakes}: удар ${e.raw}, снижено ${Math.round(e.block * 100)}% → <b class="htaken">−${e.dmg}</b> · у вас ${e.hp} HP${e.extras.length ? ' · ' + e.extras.join(', ') : ''}`;
      case 'dot': return `Горение/кровотечение: −${e.dmg}`;
      case 'regen': return `Регенерация врага: +${e.heal}`;
      case 'poison': return `Яд: <b class="htaken">−${e.dmg}</b>`;
      case 'fear': return 'Враг в ужасе, пропустил ход';
      case 'item': return `Предмет: ${ITEMS[e.id].name}`;
      case 'fleeFail': return 'Побег не удался';
      case 'ambush': return 'Засада мимика: враг ударил первым';
      case 'revive': return `Враг собрался заново: ${e.mobHp} HP`;
      default: return e.t;
    }
  };
  panelBox.innerHTML = `<span class="close">Esc / L — закрыть</span><h2>Летопись боёв</h2>
    <div class="hstats">
      <div><b>${L.length}</b><span>боёв</span></div><div><b>${wins}</b><span>побед</span></div><div><b>${losses}</b><span>поражений</span></div>
      <div><b>${avg(e => e.cps).toFixed(1)}</b><span>ср. зн/с</span></div><div><b>${best.toFixed(1)}</b><span>рекорд зн/с</span></div>
      <div><b>${avg(e => e.mistakes).toFixed(1)}</b><span>ошибок за код</span></div><div><b>${Math.round(avg(e => e.dmg))}</b><span>ср. урон</span></div>
    </div>
    <div class="small" style="margin:6px 0 10px">Атаки по типам: ${byType}. Летопись сохраняется в файл history/battles.json в папке игры.</div>
    ${L.slice().reverse().slice(0, 60).map(b => `
      <div class="hrow ${b.result}" data-id="${b.id}">
        <div class="hhead">${iconHtml(MOB_KINDS[b.mob.kind].look, 20)} <b>${b.mob.elite ? 'Элитный ' : ''}${b.mob.name}</b> ур.${b.mob.lvl}
          <span class="small">vs вы ур.${b.player.lvl}</span>
          <span class="res">${resName[b.result] || b.result}</span>
          <span class="small">${b.summary.turns} ход. · ${b.summary.avgCps} зн/с · нанесено ${b.summary.dmgDealt} · получено ${b.summary.dmgTaken} · ${b.seconds}с</span></div>
        ${histOpen === b.id ? `<ol class="hev">${b.events.map(e => `<li>${evLine(e)}</li>`).join('')}</ol>` : ''}
      </div>`).join('') || '<p>Пока не было ни одного боя.</p>'}`;
  panelBox.querySelectorAll('.hrow').forEach(el => (el.onclick = () => {
    histOpen = histOpen === +el.dataset.id ? null : +el.dataset.id;
    drawHistory();
  }));
}

// ===== Цикл =====
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); // выше 2 — только расход батареи
  canvas.width = Math.round(window.innerWidth * DPR);
  canvas.height = Math.round(window.innerHeight * DPR);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  _torch = null; _vig = null; // оверлеи пересоздадутся под новый размер
}
window.addEventListener('resize', resize);
resize();

let last = performance.now(), mmTimer = 0, saveTimer = 30;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (Game.mode === 'world') updateWorld(dt);
  else if (Game.mode === 'combat') { Combat.update(dt); FX.update(dt); }
  else if (Game.mode === 'trap') { Trap.update(dt); FX.update(dt); }
  else { FX.update(dt); }
  render(now / 1000);
  if (world) {
    mmTimer -= dt;
    if (mmTimer <= 0) { renderMinimap(); mmTimer = 0.5; }
    saveTimer -= dt;
    if (saveTimer <= 0 && Game.mode === 'world') { Game.save(); saveTimer = 30; }
  }
  requestAnimationFrame(frame);
}

// ?seed=123 в адресе сразу запускает новый мир с этим seed (для тестов)
const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
if (urlSeed) Game.newGame(urlSeed); else Menu.show();
requestAnimationFrame(frame);

// для отладки в консоли
window.__game = { get world() { return world; }, get player() { return player; }, Game, Combat };
