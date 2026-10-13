'use strict';
// ===== Квесты: стартовые, сюжетная цепочка, ежедневные и повторяемые =====
// Загружается после main.js/combat.js и патчит панели/хуки, добавляя систему заданий.
// Состояние квестов хранится отдельно (qwe_quests_v1) и привязано к seed мира.

(function () {
  const KEY = 'qwe_quests_v1';

  // Типы: killAny | kill(kind) | boss | elite | level | gold | item(item)
  const QUESTS = [
    // --- сюжетная цепочка (стартовая выдаётся автоматически) ---
    { id: 's1', type: 'killAny', n: 3, title: 'Первые шаги', desc: 'победите 3 мобов', auto: true, next: 's2', reward: { xp: 40, gold: 20 } },
    { id: 's2', type: 'kill', kind: 'slime', n: 5, title: 'Слизневая поляна', desc: 'победите 5 слизней', next: 's3', reward: { xp: 70, gold: 35, item: 'potion' } },
    { id: 's3', type: 'kill', kind: 'wolf', n: 4, title: 'Волчья тропа', desc: 'победите 4 волков', next: 's4', reward: { xp: 90, gold: 50, item: 'bigpotion' } },
    { id: 's4', type: 'kill', kind: 'golem', n: 3, title: 'Каменные стражи', desc: 'разбейте 3 голема', next: 's5', reward: { xp: 150, gold: 80, sp: 1 } },
    { id: 's5', type: 'boss', n: 1, title: 'Первый страж', desc: 'победите любого босса', next: 's6', reward: { xp: 250, gold: 150, item: 'bigpotion' } },
    { id: 's6', type: 'level', n: 10, title: 'Опытный боец', desc: 'достигните 10 уровня', reward: { gold: 200, sp: 1 } },
    // --- побочные / повторяемые ---
    { id: 'c_potion', type: 'item', item: 'potion', n: 10, title: 'Запасливый', desc: 'соберите 10 зелий', repeat: true, reward: { xp: 80, gold: 40 } },
    { id: 'c_shard', type: 'item', item: 'shard', n: 1, title: 'Осколок звезды', desc: 'найдите осколок звезды', auto: true, reward: { xp: 200, gold: 100, sp: 1 } },
    { id: 'g_gold', type: 'gold', n: 500, title: 'Богач', desc: 'накопите 500 золота', auto: true, reward: { xp: 120, gold: 60 } },
    // --- ежедневные (обновляются раз в сутки) ---
    { id: 'd_kill', type: 'killAny', n: 15, title: 'Дневная охота', desc: 'победите 15 мобов', daily: true, reward: { xp: 150, gold: 90 } },
    { id: 'd_elite', type: 'elite', n: 2, title: 'Убийца элиты', desc: 'победите 2 элитных мобов', daily: true, reward: { xp: 180, gold: 120, item: 'bigpotion' } },
  ];
  const BY_ID = {};
  QUESTS.forEach(q => (BY_ID[q.id] = q));

  const Quests = {
    state: null,
    day() { return Math.floor(Date.now() / 86400000); },
    blank(seed) { return { seed, taken: {}, done: {}, prog: {}, day: this.day() }; },
    load() { try { this.state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.state = null; } },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {} },

    // вызывается при старте игры (новая или продолжение)
    ensureState() {
      if (typeof world === 'undefined' || !world) return;
      if (!this.state || this.state.seed !== world.seed) this.state = this.blank(world.seed);
      const d = this.day();
      if (this.state.day !== d) { // сброс ежедневных заданий
        this.state.day = d;
        for (const q of QUESTS) if (q.daily) { delete this.state.done[q.id]; this.state.prog[q.id] = 0; }
      }
      for (const q of QUESTS) if ((q.auto || q.repeat || q.daily) && !this.state.done[q.id]) this.grant(q.id);
      this.save();
      this.updateTracker();
    },

    grant(id) {
      const q = BY_ID[id];
      if (!q || !this.state || this.state.taken[id]) return;
      this.state.taken[id] = true;
      this.state.prog[id] = this.state.prog[id] || 0;
      if (!this.state.done[id]) Game.log(`Новое задание: ${q.title} — ${q.desc}`, '#ffd75e');
      this.save();
      this.updateTracker();
    },

    advance(q, inc) {
      if (!this.state.taken[q.id]) return;
      this.state.prog[q.id] = (this.state.prog[q.id] || 0) + inc;
      if (this.state.prog[q.id] >= q.n) this.complete(q);
    },

    _lock: {},
    complete(q) {
      if (!this.state || !this.state.taken[q.id] || this._lock[q.id]) return;
      this._lock[q.id] = true;
      try {
        // Снимаем с активных ДО выдачи наград: награды (опыт/предметы) ре-ентрантно
        // вызывают tick()/onItem(), которые иначе засчитали бы это же задание снова
        // (убегание: сундук -> золото -> награда +120 опыта -> tick -> снова «выполнено»…).
        if (q.repeat) this.state.prog[q.id] = 0;             // повторяемые остаются активными
        else { this.state.done[q.id] = true; delete this.state.taken[q.id]; }
        const r = q.reward || {};
        const parts = [];
        if (r.xp) { Game.gainXp(r.xp); parts.push(`+${r.xp} опыта`); }
        if (r.gold) { player.gold += r.gold; parts.push(`+${r.gold} золота`); }
        if (r.sp) { player.skillPoints += r.sp; parts.push(`+${r.sp} очко навыков`); }
        if (r.item) { Game.addItem(r.item); parts.push(ITEMS[r.item].name); }
        Game.log(`Задание выполнено: ${q.title} — ${parts.join(', ')}`, '#5be06b');
        if (typeof SFX !== 'undefined' && SFX.win) SFX.win();
        if (q.next) this.grant(q.next);                      // сюжетная цепочка
        this.save();
        this.updateTracker();
        if (Game.updateHud) Game.updateHud();
      } finally {
        delete this._lock[q.id];
      }
    },

    // --- события мира ---
    onKill(m) {
      if (!this.state || !m) return;
      const info = MOB_KINDS[m.kind] || {};
      for (const q of QUESTS) {
        if (!this.state.taken[q.id]) continue;
        if (q.type === 'killAny') this.advance(q, 1);
        else if (q.type === 'kill' && q.kind === m.kind) this.advance(q, 1);
        else if (q.type === 'elite' && m.elite) this.advance(q, 1);
        else if (q.type === 'boss' && info.boss) this.advance(q, 1);
      }
      this.tick();
    },
    onItem(id) {
      if (!this.state) return;
      for (const q of QUESTS) {
        if (!this.state.taken[q.id]) continue;
        if (q.type === 'item' && q.item === id) this.advance(q, 1);
      }
      this.save();
      this.updateTracker();
    },
    // сверяет «текущее значение» заданиям на уровень и золото
    tick() {
      if (!this.state || typeof player === 'undefined' || !player) return;
      for (const q of QUESTS) {
        if (!this.state.taken[q.id]) continue;
        if (q.type === 'level') { this.state.prog[q.id] = player.lvl; if (player.lvl >= q.n) this.complete(q); }
        else if (q.type === 'gold') { this.state.prog[q.id] = player.gold; if (player.gold >= q.n) this.complete(q); }
      }
      this.save();
      this.updateTracker();
    },

    progress(q) {
      const cur = this.state ? (this.state.prog[q.id] || 0) : 0;
      if (q.type === 'level' && typeof player !== 'undefined' && player) return { cur: player.lvl, need: q.n };
      if (q.type === 'gold' && typeof player !== 'undefined' && player) return { cur: player.gold, need: q.n };
      return { cur, need: q.n };
    },
    activeList() {
      if (!this.state) return [];
      return QUESTS.filter(q => this.state.taken[q.id]);
    },

    // --- отрисовка панели (U) ---
    draw() {
      if (!this.state) this.ensureState();
      const active = this.activeList();
      const doneCount = this.state ? Object.keys(this.state.done).length : 0;
      const row = q => {
        const p = this.progress(q);
        const pct = Math.max(0, Math.min(100, 100 * p.cur / p.need));
        const kind = q.daily ? 'Ежедневное' : q.repeat ? 'Повторяемое' : q.next !== undefined || q.auto ? 'Сюжет' : 'Задание';
        return `<div class="qrow">
          <div class="qhead"><b>${q.title}</b> <span class="tag">${kind}</span></div>
          <div class="small">${q.desc} — <b>${p.cur}/${p.need}</b></div>
          <div class="qbar"><div style="width:${pct}%"></div></div>
        </div>`;
      };
      const storyDone = ['s1', 's2', 's3', 's4', 's5', 's6'].filter(id => this.state.done[id]).length;
      panelBox.innerHTML = `<span class="close">Esc / U — закрыть</span><h2>Задания</h2>
        <p class="small">Выполнено заданий: <b>${doneCount}</b> · сюжет: <b>${storyDone}/6</b>. Задания выдаются автоматически и видны в углу экрана.</p>
        ${active.map(row).join('') || '<p class="sub">Активных заданий нет.</p>'}`;
    },

    // --- компактный трекер на HUD ---
    updateTracker() {
      const el = document.getElementById('questTracker');
      if (!el) return;
      if (!this.state || typeof player === 'undefined' || !player || (typeof Game !== 'undefined' && Game.mode !== 'world')) {
        el.classList.add('hidden'); el.innerHTML = ''; return;
      }
      const active = this.activeList().slice(0, 3);
      if (!active.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.classList.remove('hidden');
      el.innerHTML = active.map(q => {
        const p = this.progress(q);
        const pct = Math.max(0, Math.min(100, 100 * p.cur / p.need));
        return `<div class="qt"><div class="qtt"><b>${q.title}</b><span>${p.cur}/${p.need}</span></div><div class="qtb"><div style="width:${pct}%"></div></div></div>`;
      }).join('');
    },
  };

  Quests.load();

  // ---------- патчи интеграции (в стиле settings.js) ----------
  if (typeof drawPanel === 'function') {
    const _drawPanel = drawPanel;
    drawPanel = function () {
      if (Game.mode === 'quests') return Quests.draw();
      return _drawPanel();
    };
  }
  if (typeof panelKey === 'function') {
    const _panelKey = panelKey;
    panelKey = function (code) {
      if (Game.mode === 'quests' && (code === 'Escape' || code === 'KeyU')) return closePanel();
      return _panelKey(code);
    };
  }
  if (typeof Game !== 'undefined') {
    if (typeof Game.startPlaying === 'function') {
      const _sp = Game.startPlaying;
      Game.startPlaying = function () { _sp.apply(this, arguments); try { Quests.ensureState(); } catch (e) {} };
    }
    if (typeof Game.addItem === 'function') {
      const _ai = Game.addItem;
      Game.addItem = function (id) { _ai.apply(this, arguments); try { Quests.onItem(id); } catch (e) {} };
    }
    if (typeof Game.gainXp === 'function') {
      const _gx = Game.gainXp;
      Game.gainXp = function (n) { const r = _gx.apply(this, arguments); try { Quests.tick(); } catch (e) {} return r; };
    }
  }
  if (typeof Combat !== 'undefined' && typeof Combat.victory === 'function') {
    const _v = Combat.victory;
    Combat.victory = function () {
      const r = _v.apply(this, arguments);
      try { if (this.phase === 'victory' && this.mob) Quests.onKill(this.mob); } catch (e) {}
      return r;
    };
  }
  if (typeof openChest === 'function') {
    const _oc = openChest;
    openChest = function (ch) { const r = _oc.apply(this, arguments); try { Quests.tick(); } catch (e) {} return r; };
  }

  window.Quests = Quests;

  // если мир уже идёт (например, ?seed=…), инициализируемся сразу
  try {
    if (typeof player !== 'undefined' && player && typeof Game !== 'undefined' && Game.mode === 'world') Quests.ensureState();
  } catch (e) {}

  console.log('[QUESTS] система заданий загружена: сюжет, ежедневные, повторяемые');
})();
