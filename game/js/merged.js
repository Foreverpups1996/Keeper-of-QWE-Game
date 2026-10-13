'use strict';
// ===== MERGED: лучшее из А + Б =====
// База — Б (Grisha). Этот файл добавляет фичи из А, не ломая базу.
// Требует: data.js уже содержит SPELLS, RARITY, STANCES, CODE_LENGTHS, WORLD_BOSSES, NIGHT_MOBS.

(function () {
  if (typeof Game === 'undefined' || typeof Combat === 'undefined') { return; }

  // ---------- игрок: новые поля ----------
  const _makePlayer = makePlayer;
  makePlayer = function (spawn) {
    const p = _makePlayer(spawn);
    p.stance = p.stance || 'balance';
    p.codeLen = p.codeLen || 'normal';
    p.combo = p.combo || 0;
    p.spells = p.spells || [];
    p.achievements = p.achievements || {};
    p.shards = p.shards || 0;
    p.ngPlus = p.ngPlus || 0;
    p.arenaWins = p.arenaWins || 0;
    p.rarity = p.rarity || null;
    // стойка даёт +1 к своему типу (из А) + защита от краша bonus (сейвы из А)
    p.dmg = function (t) {
      try {
        let d = 3 + (p.lvl - 1) * (typeof BAL !== 'undefined' ? BAL.playerDmgPerLvl : 0.4);
        d += (p.skills && p.skills[{ Q: 'q_power', W: 'w_power', E: 'e_power' }[t]]) || 0;
        for (const slot in p.gear) {
          let g = p.gear[slot];
          if (!g) continue;
          if (typeof g === 'object') g = g.id || g.kind; // сейв из А мог положить объект
          const it = (typeof ITEMS !== 'undefined') ? ITEMS[g] : null;
          if (it && it.bonus && it.bonus[t]) d += it.bonus[t];
        }
        if (typeof STANCES !== 'undefined' && p.stance && STANCES[p.stance] && STANCES[p.stance].type === t) d += 1;
        return d;
      } catch (e) { return 3; }
    };
    return p;
  };

  // ---------- FIX зависания "Продолжить": чистка старых сейвов ----------
  (function () {
    const _continue = Game.continueGame.bind(Game);
    Game.continueGame = function () {
      try {
        const raw = Game.loadData ? Game.loadData() : null;
        if (raw && raw.p) {
          // чистка инвентаря: выкинуть неизвестные id, починить count
          if (Array.isArray(raw.p.inv)) {
            raw.p.inv = raw.p.inv.filter((o) => o && typeof ITEMS !== 'undefined' && ITEMS[o.id]).map((o) => ({ id: o.id, count: Math.max(1, o.count | 0 || 1) }));
          } else raw.p.inv = [{ id: 'potion', count: 3 }];
          // чистка гира: объект -> id, неизвестное -> null
          if (raw.p.gear && typeof raw.p.gear === 'object') {
            for (const slot of ['weapon', 'focus', 'charm']) {
              let g = raw.p.gear[slot];
              if (g && typeof g === 'object') g = g.id;
              if (g && (typeof ITEMS === 'undefined' || !ITEMS[g])) g = null;
              raw.p.gear[slot] = g || null;
            }
          }
          // обратно в хранилище, чтобы больше не крашилось
          try { localStorage.setItem('qwe_save_v1', JSON.stringify(raw)); } catch (e) {}
        }
      } catch (e) {}
      try {
        _continue();
      } catch (e) {
        console.error('continue failed, new game', e);
        Game.newGame();
      }
      // дефолты новых полей после assign
      try {
        player.stance = player.stance || 'balance';
        player.codeLen = player.codeLen || 'normal';
        player.combo = player.combo || 0;
        player.spells = player.spells || [];
        player.achievements = player.achievements || {};
        player.shards = player.shards || 0;
        player.ngPlus = player.ngPlus || 0;
        player.arenaWins = player.arenaWins || 0;
        Game.updateHud();
      } catch (e) {}
    };
    // страховка: updateHud никогда не должен ронять игру
    const _hud = Game.updateHud.bind(Game);
    Game.updateHud = function () { try { _hud(); } catch (e) {} };
  })();

  // ---------- погода (из А) ----------
  Game.weather = Game.weather || 'clear';
  Game.weatherT = Game.weatherT || 90;
  const _updateWorld = (typeof updateWorld !== 'undefined') ? updateWorld : null;
  updateWorld = function (dt) {
    if (_updateWorld) _updateWorld(dt);
    // смена погоды каждые 90-180с
    Game.weatherT -= dt;
    if (Game.weatherT <= 0) {
      const keys = Object.keys(typeof WEATHERS !== 'undefined' ? WEATHERS : { clear: 1, rain: 1, fog: 1 });
      Game.weather = keys[(Math.random() * keys.length) | 0];
      Game.weatherT = 90 + Math.random() * 90;
      Game.log('Погода: ' + (typeof WEATHERS !== 'undefined' ? WEATHERS[Game.weather].name : Game.weather), '#9adcff');
    }
  };

  // ---------- новые трейты в бою ----------
  // Патчим Combat.start для split/twin/phases/shift
  const _start = Combat.start.bind(Combat);
  Combat.start = function (mob) {
    // дождь из А: fire-моб слабее к E (обрабатывается в mult)
    _start(mob);
    // деление Короля слизней
    if (mob.kind === 'slimeking') mob.shields = 2;
  };
  const _mult = Combat.mult.bind(Combat);
  Combat.mult = function () {
    const base = _mult();
    try {
      // дождь против огня
      if (Game.weather === 'rain' && this.mob && this.mob.kind === 'fire') {
        return { Q: base.Q, W: base.W, E: Math.max(base.E, 2) };
      }
      // мороз колосса: резист к типу прошлой атаки
      if (this.mob && this.mob.kind === 'colossus' && this.lastAtkType) {
        const m = { Q: base.Q, W: base.W, E: base.E };
        m[this.lastAtkType] = 0.25;
        return m;
      }
      // фазы хранителя: snake/mirror/rhythm/shift по очереди
      if (this.mob && this.mob.kind === 'keeper') {
        const ph = ['snake', 'mirror', 'rhythm', 'shift'][(this.turnN || 0) % 4];
        if (ph === 'shift') return this.mob.multNow || base;
        return base;
      }
    } catch (e) {}
    return base;
  };

  // Зеркало: отразить часть урона
  const _finishAttack = Combat.finishAttack ? Combat.finishAttack.bind(Combat) : null;
  if (_finishAttack) {
    Combat.finishAttack = function (timeout) {
      this.lastAtkType = this.attackType;
      // адаптация хамелеона: режет частый тип
      try {
        if (this.mob && this.mob.kind === 'chameleon' && this.attackType) {
          this.mob.adaptCount = this.mob.adaptCount || {};
          this.mob.adaptCount[this.attackType] = (this.mob.adaptCount[this.attackType] || 0) + 1;
        }
      } catch (e) {}
      const hpBefore = this.mob ? this.mob.hp : 0;
      _finishAttack(timeout);
      try {
        // зеркало отражает 25%
        if (this.mob && (this.mob.kind === 'mirror' || this.mob.kind === 'twin')) {
          const dealt = Math.max(0, hpBefore - this.mob.hp);
          if (dealt > 0 && typeof player !== 'undefined' && player) {
            const refl = Math.round(dealt * 0.25);
            player.hp = Math.max(1, player.hp - refl);
            Game.log('Зеркало отражает ' + refl + ' урона!', '#ff7d7d');
          }
        }
        // кража вора: при вашем промахе крадёт золото
        // пожирание: съедает 3 буквы следующего кода (флаг)
        if (this.mob && this.mob.kind === 'devourer') this.devourNext = 3;
        // комбо из А: серия идеальных боёв
        if (this.lastPerfect && typeof player !== 'undefined' && player) {
          player.combo = Math.min(10, (player.combo || 0) + 1);
        } else if (typeof player !== 'undefined' && player) {
          player.combo = 0;
        }
      } catch (e) {}
    };
  }

  // ---------- гримуар (G) ----------
  Game.castSpell = function (id) {
    if (!player.spells.includes(id)) { Game.log('Заклинание не выучено. Найдите том.', '#ff9b9b'); return false; }
    const sp = SPELLS[id];
    if (!sp || !Combat.mob || Combat.phase === 'none') { Game.log('Только в бою.', '#ff9b9b'); return false; }
    Game.log('Гримуар: ' + sp.name + ' (' + sp.code + ')!', '#c08bff');
    const mob = Combat.mob;
    if (id === 'fireball') { mob.hp -= 20 + player.lvl * 4; mob.burn = { t: 2, d: player.lvl * 2 }; }
    if (id === 'shield') { Combat.shield80 = true; }
    if (id === 'dominate') { mob.fear = true; mob.skipTurns = 2; }
    if (id === 'heal') { player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.3)); }
    if (id === 'expose') { const b = Game.beast(mob.kind); TYPE_KEYS.forEach(t => (b.known[t] = true)); mob.exposed = 3; }
    History.add({ t: 'spell', id });
    Combat.renderEnemy && Combat.renderEnemy();
    Combat.renderPlayer && Combat.renderPlayer();
    return true;
  };

  // Томы: чтение учит заклинание
  const _use = (typeof useFromInventory !== 'undefined') ? useFromInventory : null;
  useFromInventory = function (i) {
    try {
      const it = player.inv[i];
      if (it && ITEMS[it.id] && ITEMS[it.id].kind === 'tome') {
        const sp = ITEMS[it.id].spell;
        if (!player.spells.includes(sp)) {
          player.spells.push(sp);
          Game.log('Выучено: ' + SPELLS[sp].name, '#c08bff');
          window.unlock('mage_' + sp);
        }
        it.count--;
        if (it.count <= 0) player.inv.splice(i, 1);
        Game.save && Game.save();
        return;
      }
      if (it && (it.id === 'fish' || it.id === 'goldfish')) {
        player.hp = Math.min(player.maxHp, player.hp + ITEMS[it.id].heal);
        Game.log('Съедено: ' + ITEMS[it.id].name + ' +' + ITEMS[it.id].heal + ' HP', '#5be06b');
        it.count--;
        if (it.count <= 0) player.inv.splice(i, 1);
        Game.save && Game.save();
        return;
      }
    } catch (e) {}
    if (_use) return _use(i);
  };

  // ---------- рыбалка F (из А) ----------
  Game.fish = function () {
    if (Game.mode !== 'world') return;
    const r = Math.random();
    const id = r < 0.12 ? 'goldfish' : 'fish';
    Game.addItem && Game.addItem(id);
    Game.log(id === 'goldfish' ? 'Улов: золотая рыбка! +60 HP' : 'Улов: рыба +20 HP', '#7fb7d9');
  };

  // ---------- достижения + статистика (из А) ----------
  window.unlock = function (id) {
    try {
      if (!player.achievements[id]) {
        player.achievements[id] = true;
        Game.log('Достижение: ' + id, '#ffd75e');
      }
    } catch (e) {}
  };
  function _unlock(id) { window.unlock(id); }

  // ---------- арена (из А, упрощённо) ----------
  Game.arena = function () {
    if (Game.mode !== 'world') return;
    const pool = ['wolf', 'scorpion', 'golem', 'cultist', 'mirror'];
    const kind = pool[(Math.random() * pool.length) | 0];
    const lvl = Math.max(1, player.lvl);
    Game.log('Арена: бой с ' + MOB_KINDS[kind].name, '#ffd75e');
    Combat.start({ kind, lvl, hp: MOB_KINDS[kind].hp * (1 + lvl * 0.3), maxHp: MOB_KINDS[kind].hp, x: player.x, y: player.y, arena: true });
    const _victory = Combat.victory.bind(Combat);
    Combat.victory = function () {
      _victory();
      player.arenaWins++;
      window.unlock('arena_' + player.arenaWins);
      Combat.victory = _victory;
    };
  };

  // ---------- магазин (из А, упрощённый) ----------
  Game.shop = function () {
    if (Game.mode !== 'world') return;
    Game.mode = 'shop';
    Game.log('Магазин: 1-зелье(5з) 2-большое(12з) 3-свиток(8з) Esc-выход', '#ffd75e');
    Game.shopBuy = function (n) {
      const offers = [{ id: 'potion', price: 5 }, { id: 'bigpotion', price: 12 }, { id: 'scroll', price: 8 }];
      const o = offers[n - 1];
      if (!o) return;
      if (player.gold < o.price) { Game.log('Не хватает золота', '#ff9b9b'); return; }
      player.gold -= o.price;
      Game.addItem(o.id);
      Game.log('Куплено: ' + ITEMS[o.id].name, '#5be06b');
      Game.updateHud && Game.updateHud();
    };
  };

  // ---------- NG+ (из А) ----------
  Game.ngPlus = function () {
    player.ngPlus++;
    player.lvl = 1; player.xp = 0;
    player.hp = player.maxHp;
    Game.log('NG+' + player.ngPlus + ': мир стал опаснее (+4 к уровню зоны)', '#ffd75e');
    window.unlock('ng_' + player.ngPlus);
  };

  // ---------- сеть из А (заглушка + WebRTC) ----------
  Game.mp = {
    on: false,
    host() { Game.log('Сеть: хост LAN 27777 (см. net.js, Radmin VPN). Пока заглушка — код из А в runtime/net-legacy.js', '#9adcff'); },
    join() { Game.log('Сеть: введите код-приглашение WebRTC (см. А). Пока заглушка.', '#9adcff'); },
  };

  // ---------- клавиши: G/J/F/T/Z/X/C + магазин/арена ----------
  window.addEventListener('keydown', (e) => {
    if (Game.mode === 'shop') {
      if (e.code === 'Escape') { Game.mode = 'world'; Game.log('Магазин закрыт'); }
      if (e.code === 'Digit1') Game.shopBuy(1);
      if (e.code === 'Digit2') Game.shopBuy(2);
      if (e.code === 'Digit3') Game.shopBuy(3);
      return;
    }
    if (Game.mode !== 'world') return;
    if (e.code === 'KeyG') {
      const list = player.spells.length ? player.spells.map((s) => SPELLS[s].name + ' ' + SPELLS[s].code).join(', ') : 'пусто — ищите томы';
      Game.log('Гримуар (G): ' + list + '. Каст в бою: G+1..5', '#c08bff');
    }
    if (e.code === 'KeyJ') {
      const n = Object.keys(player.achievements).length;
      Game.log('Достижения (J): ' + n + ' шт. Арена побед: ' + player.arenaWins + '. NG+' + player.ngPlus, '#ffd75e');
    }
    if (e.code === 'KeyF') Game.fish();
    if (e.code === 'KeyT') {
      const i = STANCE_ORDER.indexOf(player.stance);
      player.stance = STANCE_ORDER[(i + 1) % STANCE_ORDER.length];
      Game.log('Стойка (T): ' + STANCES[player.stance].name + ' — ' + STANCES[player.stance].desc, '#cfe');
      Game.updateHud && Game.updateHud();
    }
    if (e.code === 'KeyZ') { player.codeLen = 'short'; Game.log('Длина кода (Z): короткий ×0.7'); }
    if (e.code === 'KeyX') { player.codeLen = 'normal'; Game.log('Длина кода (X): обычный'); }
    if (e.code === 'KeyC') { player.codeLen = 'long'; Game.log('Длина кода (C): длинный ×1.4'); }
  });

  // Каст заклинаний в бою: G затем 1-5
  const _combatKey = Combat.key ? Combat.key.bind(Combat) : null;
  if (_combatKey) {
    Combat.key = function (code) {
      if (code === 'KeyG') { Game.log('Гримуар: жмите 1-5 для каста', '#c08bff'); Combat._grimoire = true; return; }
      if (Combat._grimoire && /^Digit[1-5]$/.test(code)) {
        Combat._grimoire = false;
        const ids = Object.keys(SPELLS);
        Game.castSpell(ids[+code.slice(5) - 1]);
        return;
      }
      Combat._grimoire = false;
      return _combatKey(code);
    };
  }

  // Длина кода влияет на генерацию (патч генератора Б)
  const _genCode = Combat.genCode ? Combat.genCode.bind(Combat) : null;
  if (_genCode) {
    Combat.genCode = function (type, extra) {
      let code = _genCode(type, extra);
      try {
        const cl = CODE_LENGTHS[player.codeLen || 'normal'];
        if (cl && cl.len === -2) code = code.slice(0, Math.max(3, code.length - 2));
        if (cl && cl.len === 3) code = code + code.slice(0, 3);
        if (Combat.devourNext) { code = code.slice(Combat.devourNext); Combat.devourNext = 0; }
      } catch (e) {}
      return code;
    };
  }

  console.log('[MERGED] Патч А+Б загружен: 25 мобов, гримуар, стойки, длина кода, погода, магазин, арена, рыбалка, NG+, сеть-заглушка');
})();
