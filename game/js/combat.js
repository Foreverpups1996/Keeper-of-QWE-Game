'use strict';
// ===== Пошаговый бой с набором кода =====
// Ход игрока: выбрать тип атаки (Q/W/E) -> набрать код как можно быстрее.
// Каждая набранная буква наносит урон своего типа; буквы выбранного типа
// получают бонус. Итог умножается на скорость, точность и уязвимость моба.
// Ход моба: игрок набирает короткий код блока, чтобы снизить урон.
// Каждый бой подробно записывается в летопись (History).

const BAL = {
  mainShare: 0.6,        // доля букв выбранного типа в коде
  mainBonus: 1.3,        // множитель для букв выбранного типа
  secondary: 0.7,        // множитель для «примесей»
  timePerChar: 0.6,      // сек на букву (лимит атаки)
  timeBase: 1.2,
  speedBase: 0.5,        // множитель скорости = speedBase + cps*speedK
  speedK: 0.18,
  speedMax: 2.0,
  mistakePenalty: 0.12,  // −12% за каждую ошибку
  accuracyMin: 0.4,
  perfectBonus: 1.2,     // без ошибок и до конца
  blitzBonus: 1.2,       // весь код со скоростью от blitzCps зн/с
  blitzCps: 6,
  defTimePerChar: 0.36,
  defTimeBase: 0.6,
  blockMax: 0.6,         // максимум снижения урона блоком
  // мобы
  mobHp: 3.0,            // общий множитель HP мобов
  mobAtk: 1.7,           // общий множитель урона мобов
  mobHpPerLvl: 0.5,      // +50% HP за уровень
  mobAtkPerLvl: 0.3,     // +30% урона за уровень
  // разница уровней: моб выше игрока — игрок бьёт слабее, моб сильнее
  gapDmg: 0.15,
  gapAtk: 0.12,
  playerDmgPerLvl: 0.4,
};

const Combat = {
  mob: null, phase: 'none', wait: null,
  code: [], hidden: null, pos: 0, mistakes: 0, limit: 0, elapsed: 0,
  attackType: null, focus: false, combo: 0, portraitHit: 0, mouseTX: 0, mouseTY: 0,

  start(mob) {
    this.mob = mob;
    this.focus = false;
    this.combo = 0;
    this.portraitHit = 0;
    this.spores = false;
    this.poison = null;
    this.secondAttack = false;
    this.hexed = false;
    // яд от газовой ловушки переходит в бой
    if (Game.pendingPoison) { this.poison = Game.pendingPoison; Game.pendingPoison = null; }
    const ambush = !!mob.disguised;
    mob.disguised = false; mob.still = false;
    Game.mode = 'combat';
    const best = Game.beast(mob.kind);
    best.seen = true;
    mob.burn = null; mob.bleed = null; mob.fear = false;
    if (player.skill('e_read') || MOB_KINDS[mob.kind].boss) TYPE_KEYS.forEach(t => (best.known[t] = true));
    document.getElementById('combat').classList.remove('hidden');
    Game.log(`На вас напал ${this.mobName()} (ур. ${mob.lvl})!`, '#ff9b9b');
    History.begin(mob);
    if (MOB_KINDS[mob.kind].boss) this.shiftWeakness();
    this.renderEnemy();
    this.renderPlayer();
    if (ambush) {
      History.add({ t: 'ambush' });
      Game.log('Это мимик! Он нападает первым.', '#ff9b9b');
      this.phase = 'result';
      this.stage(`<h2>Сундук ожил! Это мимик!</h2>`);
      return this.after(1.2, () => this.enemyAttack());
    }
    this.toChoose();
  },

  // текущие множители урона моба (у босса меняются каждый ход)
  mult() { return this.mob.multNow || MOB_KINDS[this.mob.kind].mult; },
  shiftWeakness() {
    const vals = [2, 1, 0.25].sort(() => Math.random() - 0.5);
    this.mob.multNow = { Q: vals[0], W: vals[1], E: vals[2] };
  },

  end() {
    document.getElementById('combat').classList.add('hidden');
    Game.mode = 'world';
    this.phase = 'none';
    this.wait = null;
    Game.updateHud();
  },

  mobName() { return (this.mob.elite ? 'Элитный ' : '') + MOB_KINDS[this.mob.kind].name; },
  trait() { return MOB_KINDS[this.mob.kind].trait.id; },
  gap() { return Math.max(0, this.mob.lvl - player.lvl); },

  after(sec, fn) { this.wait = { t: sec, fn }; },
  skipWait() { if (this.wait) { const fn = this.wait.fn; this.wait = null; fn(); } },

  update(dt) {
    if (this.wait) {
      this.wait.t -= dt;
      if (this.wait.t <= 0) this.skipWait();
    }
    this.portraitHit = Math.max(0, (this.portraitHit || 0) - dt * 3);
    // живая 3D-анимация портрета каждый кадр: парение + наклон за мышью + тряска при ударе
    if (this.mob && (this.phase === 'typing' || this.phase === 'defend' || this.phase === 'choose' || this.phase === 'result' || this.phase === 'enemyResult' || this.phase === 'items')) {
      this.animatePortrait(performance.now() / 1000);
    }
    if (this.phase === 'typing' || this.phase === 'defend') {
      this.elapsed += dt;
      const fill = document.getElementById('tFill');
      if (fill) fill.style.width = Math.max(0, 100 * (1 - this.elapsed / this.limit)) + '%';
      if (this.elapsed >= this.limit) {
        if (this.phase === 'typing') this.finishAttack(true); else this.finishDefend(true);
      }
    }
  },

  animatePortrait(time) {
    const m = this.mob;
    if (!m) return;
    const k = MOB_KINDS[m.kind];
    const cv = document.getElementById('cPortrait');
    if (!cv) return;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    // фон-подложка с глубиной
    const bg = c.createRadialGradient(cv.width / 2, cv.height / 2, 6, cv.width / 2, cv.height / 2, 62);
    bg.addColorStop(0, 'rgba(255,255,255,0.07)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = bg;
    c.beginPath(); c.arc(cv.width / 2, cv.height / 2, 62, 0, 7); c.fill();
    const hitShake = this.portraitHit > 0 ? (Math.random() - 0.5) * 14 * this.portraitHit : 0;
    const bob = Math.sin(time * 3 + m.lvl) * 3;
    const tiltX = (this.mouseTX || 0) * 5, tiltY = (this.mouseTY || 0) * 3;
    // тень под портретом
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(cv.width / 2, cv.height - 12, 30, 7, 0, 0, Math.PI * 2); c.fill();
    drawShape3D(c, k.look, cv.width / 2 + hitShake + tiltX, cv.height / 2 - 6 + bob + tiltY, cv.width * 0.30,
      { outline: m.elite ? '#ffd75e' : (k.boss ? '#ff5d5d' : null), lift: Math.abs(Math.sin(time * 2.4)) * 3, h: 12, tiltX, tiltY });
    // элитное кольцо
    if (m.elite || k.boss) {
      c.save();
      c.globalAlpha = 0.55 + 0.3 * Math.sin(time * 5);
      c.strokeStyle = k.boss ? '#ff5d5d' : '#ffd75e';
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(cv.width / 2, cv.height / 2 - 6 + bob * 0.4, 46 + Math.sin(time * 4) * 2, 0, 7); c.stroke();
      c.restore();
    }
  },

  // ---------- рендер ----------
  stage(html) { document.getElementById('cStage').innerHTML = html; },

  renderEnemy() {
    const m = this.mob, k = MOB_KINDS[m.kind], best = Game.beast(m.kind);
    this.animatePortrait(performance.now() / 1000);
    document.getElementById('cName').innerHTML = `${m.elite ? '<span class="elite">Элитный</span> ' : ''}${k.name}<span class="lv">ур. ${m.lvl}</span>` +
      (this.gap() ? `<span class="gap">выше вас на ${this.gap()}</span>` : '');
    document.getElementById('cHpFill').style.width = Math.max(0, 100 * m.hp / m.maxHp) + '%';
    document.getElementById('cHpText').textContent = `${Math.max(0, m.hp)} / ${m.maxHp}`;
    document.getElementById('cWeak').innerHTML = weakHtml(m.kind, best.known, m.multNow) +
      `<span class="w">Бьёт: <b class="t-${k.atkType}">${TYPES[k.atkType].icon} ${TYPES[k.atkType].short}</b> ${this.mobAtk()}</span>` +
      `<span class="w trait" title="${k.trait.desc}">${k.trait.name}</span>` +
      (m.burn ? `<span class="w st">Горит ${m.burn.dmg} (${m.burn.turns})</span>` : '') +
      (m.bleed ? `<span class="w st">Кровоточит ${m.bleed.dmg} (${m.bleed.turns})</span>` : '') +
      (m.fear ? `<span class="w st">В ужасе</span>` : '');
    document.getElementById('cDesc').textContent = `${k.trait.name}: ${k.trait.desc}.` +
      (best.kills > 0 || Object.values(best.known).some(v => v) ? ' ' + k.desc : '');
  },

  renderPlayer() {
    document.getElementById('pHpFill').style.width = Math.max(0, 100 * player.hp / player.maxHp) + '%';
    document.getElementById('pHpText').textContent = `${Math.max(0, player.hp)} / ${player.maxHp}`;
    const buffs = [];
    if (this.focus) buffs.push('Концентрация ×1.5');
    if (this.berserk()) buffs.push('Берсерк ×1.5');
    if (this.poison) buffs.push(`Яд ${this.poison.dmg} (${this.poison.turns})`);
    if (this.spores) buffs.push('Споры в голове');
    document.getElementById('cBuffs').textContent = buffs.join(' · ');
  },

  codeHtml() {
    return `<div class="code" id="codeBox">` + this.code.map((c, i) => {
      const hid = this.hidden && this.hidden.has(i);
      return `<div class="ch t-${c} ${hid ? 'hid' : ''} ${i < this.pos ? 'done' : ''} ${i === this.pos ? 'cur' : ''}">${hid ? '?' : c}</div>`;
    }).join('') + `</div>`;
  },

  refreshCode() {
    const box = document.getElementById('codeBox');
    if (!box) return;
    [...box.children].forEach((el, i) => {
      el.classList.toggle('done', i < this.pos);
      el.classList.toggle('cur', i === this.pos);
    });
    const mis = document.getElementById('misText');
    if (mis) mis.textContent = this.mistakes ? `Ошибок: ${this.mistakes}` : '';
  },

  // ---------- выбор действия ----------
  toChoose() {
    this.secondAttack = false;
    // яд скорпиона действует в начале вашего хода
    if (this.poison) {
      const d = this.poison.dmg;
      player.hp -= d;
      History.add({ t: 'poison', dmg: d, hp: player.hp });
      if (--this.poison.turns <= 0) this.poison = null;
      Game.log(`Яд: −${d} HP`, '#9dff6b');
      Game.updateHud();
      if (player.hp <= 0) { this.renderPlayer(); return this.defeat(); }
    }
    if (this.trait() === 'shift' && this.mob.multNow) { this.shiftWeakness(); this.renderEnemy(); }
    this.phase = 'choose';
    this.renderPlayer();
    const len = this.codeLen();
    this.stage(`
      <h2>Ваш ход</h2>
      <div class="sub">Выберите тип атаки — затем быстро наберите код из ${len} букв</div>
      <div class="choices">
        ${TYPE_KEYS.map(t => `<div class="choice" data-act="${t}"><div class="k t-${t}">${t}</div><div class="n">${TYPES[t].icon} ${TYPES[t].name}</div></div>`).join('')}
      </div>
      <div class="choices">
        <div class="choice small2" data-act="items"><div class="k">4</div><div class="n">Предмет</div></div>
        <div class="choice small2" data-act="flee"><div class="k">5</div><div class="n">Бежать</div></div>
      </div>`);
    this.bindClicks();
  },

  bindClicks() {
    document.querySelectorAll('#cStage [data-act]').forEach(el => {
      el.onclick = () => {
        const a = el.dataset.act;
        if (this.phase !== 'choose' && this.phase !== 'items') return;
        if (TYPES[a]) this.beginAttack(a);
        else if (a === 'items') this.toItems();
        else if (a === 'flee') this.flee();
        else if (a.startsWith('use:')) this.useItem(a.slice(4));
        else if (a === 'back') this.toChoose();
      };
    });
  },

  berserk() { return player.skill('w_berserk') > 0 && player.hp < player.maxHp * 0.35; },
  timeMult() { return 1 + 0.2 * player.skill('e_time'); },
  mobAtk() { return Math.round(this.mob.atk * (1 + BAL.gapAtk * this.gap())); },

  codeLen() { return 6 + Math.min(6, Math.floor((this.mob.lvl - 1) / 2)) + (this.trait() === 'long' ? 3 : 0); },

  genCode(main, len) {
    // ровно ~60% букв основного типа, остальные — примеси, всё перемешано
    const others = TYPE_KEYS.filter(t => t !== main);
    const nMain = Math.round(len * BAL.mainShare);
    const code = [];
    for (let i = 0; i < len; i++) code.push(i < nMain ? main : others[Math.random() < 0.5 ? 0 : 1]);
    for (let i = len - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [code[i], code[j]] = [code[j], code[i]];
    }
    return code;
  },

  // ---------- атака ----------
  beginAttack(type) {
    this.attackType = type;
    this.code = this.genCode(type, this.codeLen());
    this.hidden = null;
    if (this.spores) {
      // споры: 3 буквы скрыты, виден только цвет
      this.hidden = new Set();
      while (this.hidden.size < 3) this.hidden.add(Math.floor(Math.random() * this.code.length));
      this.spores = false;
    }
    this.pos = 0; this.mistakes = 0; this.elapsed = 0;
    this.limit = (BAL.timeBase + this.code.length * BAL.timePerChar) * this.timeMult() *
      (this.trait() === 'heat' ? 0.75 : 1) * (this.hexed ? 0.75 : 1);
    const hexNote = this.hexed;
    this.hexed = false;
    this.freeMiss = player.skill('e_clarity') > 0;
    this.phase = 'ready';
    this.stage(`<h2 class="t-${type}">${TYPES[type].icon} ${TYPES[type].name} атака</h2><div class="big">Готовься…</div>`);
    this.after(0.7, () => {
      this.phase = 'typing';
      this.stage(`<div class="sub">Набирай! <span class="t-${type}">${TYPES[type].short}</span>-буквы сильнее${this.hidden ? ' · <b>споры скрыли 3 буквы</b>' : ''}${hexNote ? ' · <b>проклятие: меньше времени</b>' : ''}</div>
        ${this.codeHtml()}<div class="timer"><div id="tFill"></div></div><div class="mistakes" id="misText"></div>`);
    });
  },

  typeKey(letter) {
    if (this.phase !== 'typing' && this.phase !== 'defend') return;
    if (letter === this.code[this.pos]) {
      this.pos++;
      SFX.key(true);
      this.refreshCode();
      if (this.pos >= this.code.length) {
        if (this.phase === 'typing') this.finishAttack(false); else this.finishDefend(false);
      }
    } else {
      if (this.freeMiss) this.freeMiss = false; else this.mistakes++;
      SFX.key(false);
      // сброс комбо при ошибке
      if (this.phase === 'typing') this.combo = 0;
      this.refreshCode();
      const box = document.getElementById('codeBox');
      if (box) { box.classList.remove('err'); void box.offsetWidth; box.classList.add('err'); }
    }
  },

  finishAttack(timeout) {
    this.phase = 'result';
    const m = this.mob, k = MOB_KINDS[m.kind], best = Game.beast(m.kind);
    const typed = this.code.slice(0, this.pos);
    const t = Math.max(this.elapsed, 0.25);
    const cps = this.pos / t;
    const speedMult = Math.min(BAL.speedMax, BAL.speedBase + cps * BAL.speedK);
    const accuracy = Math.max(BAL.accuracyMin, 1 - BAL.mistakePenalty * this.mistakes);
    const complete = this.pos === this.code.length;
    const perfect = complete && this.mistakes === 0;
    const blitz = complete && cps >= BAL.blitzCps;
    const armor = this.trait() === 'armor' ? 1.5 : 0;

    const lines = [];
    const parts = {};
    let sum = 0;
    for (const ty of TYPE_KEYS) {
      const n = typed.filter(c => c === ty).length;
      if (!n) continue;
      const role = ty === this.attackType ? (ty === 'Q' && player.skill('q_arch') ? 1.6 : BAL.mainBonus) : BAL.secondary;
      const mult = this.mult()[ty];
      const per = Math.max(0.5, player.dmg(ty) - armor);
      const part = n * per * role * mult;
      sum += part;
      parts[ty] = { n, part: +part.toFixed(1) };
      best.known[ty] = true;
      lines.push(`<span class="t-${ty}">${TYPES[ty].icon} ${TYPES[ty].short}</span> ${n} × ${per.toFixed(1)}${armor ? ' (броня)' : ''}` +
        ` × ${role}${ty === this.attackType ? ' (осн.)' : ''} × <span class="x">${mult}</span> ${multWord(mult)} = ${part.toFixed(1)}`);
    }
    let total = sum * speedMult * accuracy;
    const tags = [];
    if (perfect) { total *= BAL.perfectBonus; tags.push('ИДЕАЛЬНО ×' + BAL.perfectBonus); }
    if (blitz) { total *= BAL.blitzBonus; tags.push('МОЛНИЕНОСНО ×' + BAL.blitzBonus); }
    if (this.focus) { total *= 1.5; tags.push('КОНЦЕНТРАЦИЯ ×1.5'); this.focus = false; }
    if (this.berserk()) { total *= 1.5; tags.push('БЕРСЕРК ×1.5'); }
    // комбо за consecutive идеальные атаки
    if (perfect && !timeout) {
      this.combo = (this.combo || 0) + 1;
      if (this.combo >= 2) {
        const cm = Math.min(1.5, 1 + this.combo * 0.08);
        total *= cm;
        tags.push(`КОМБО ×${this.combo} (×${cm.toFixed(2)})`);
      }
    } else if (!perfect) this.combo = 0;
    if (this.gap()) {
      const g = Math.max(0.4, 1 - BAL.gapDmg * this.gap());
      total *= g; tags.push(`УРОВЕНЬ ВРАГА ×${g.toFixed(2)}`);
    }
    if (this.trait() === 'evade' && Math.random() < 0.25) { total *= 0.5; tags.push('УКЛОНЕНИЕ ×0.5'); }
    if (timeout && !complete) tags.push('ВРЕМЯ ВЫШЛО');
    let dmg = Math.round(total);
    // навыки: эхо и статусы
    const echoR = player.skill('q_echo');
    if (dmg > 0 && echoR && Math.random() < 0.15 * echoR) {
      const extra = Math.round(dmg * 0.5);
      dmg += extra; tags.push('ЭХО +' + extra);
    }
    m.hp -= dmg;
    const nMain = typed.filter(c => c === this.attackType).length;
    if (nMain >= 4) {
      const r = { Q: player.skill('q_burn'), W: player.skill('w_bleed'), E: player.skill('e_fear') }[this.attackType];
      if (r && this.attackType === 'Q' && this.mult().Q > 0) { m.burn = { dmg: 4 * r * player.lvl, turns: 2 }; tags.push('ПОДЖОГ'); }
      if (r && this.attackType === 'W' && this.mult().W > 0) { m.bleed = { dmg: 3 * r * player.lvl, turns: 3 }; tags.push('КРОВОТЕЧЕНИЕ'); }
      if (r && this.attackType === 'E' && this.mult().E > 0 && Math.random() < 0.25 * r) { m.fear = true; tags.push('УЖАС'); }
    }
    History.add({
      t: 'attack', type: this.attackType, code: this.code.join(''), len: this.code.length, typed: this.pos,
      hidden: this.hidden ? this.hidden.size : 0, mistakes: this.mistakes, time: +this.elapsed.toFixed(2),
      limit: +this.limit.toFixed(2), cps: +cps.toFixed(2), speedMult: +speedMult.toFixed(2), accuracy: +accuracy.toFixed(2),
      parts, tags, dmg, mobHp: Math.max(0, m.hp),
    });
    if (dmg > 0) this.hitAnim();
    this.portraitHit = dmg > 20 ? 1 : dmg > 0 ? 0.6 : 0.15;
    FX.shake(dmg > 30 ? 0.45 : dmg > 12 ? 0.28 : 0.12);
    SFX.hit(dmg > 20);
    this.renderEnemy();
    this.renderPlayer();
    this.stage(`
      <div class="big" style="color:${dmg > 0 ? '#ffd75e' : '#888'}">${dmg > 0 ? '−' + dmg : 'Мимо!'}</div>
      <div>${tags.map(s => `<span class="tag">${s}</span>`).join('')}</div>
      <div class="bd">${lines.join('<br>') || 'Ни одной буквы…'}<br>
        Скорость: ${cps.toFixed(1)} зн/с → <span class="x">×${speedMult.toFixed(2)}</span> ·
        Точность: ${this.mistakes} ош. → <span class="x">×${accuracy.toFixed(2)}</span></div>
      <div class="cont">Пробел — дальше</div>`);
    Game.log(`Вы нанесли ${dmg} урона (${cps.toFixed(1)} зн/с)`, '#ffd75e');
    this.after(2.6, () => (m.hp <= 0 ? this.victory() : this.enemyTurn()));
  },

  hitAnim() {
    const em = document.getElementById('cPortrait');
    em.classList.remove('hit'); void em.offsetWidth; em.classList.add('hit');
  },

  // ---------- ход врага ----------
  // Шаги хода по очереди: статусы -> регенерация -> страх -> атака
  enemyTurn(step = 0) {
    const m = this.mob, k = MOB_KINDS[m.kind];
    if (step === 0) {
      let dot = 0;
      for (const st of ['burn', 'bleed']) {
        if (!m[st]) continue;
        dot += m[st].dmg;
        if (--m[st].turns <= 0) m[st] = null;
      }
      if (dot > 0) {
        m.hp -= dot;
        History.add({ t: 'dot', dmg: dot, mobHp: Math.max(0, m.hp) });
        this.hitAnim();
        this.renderEnemy();
        this.phase = 'result';
        this.stage(`<div class="big" style="color:#ffb347">−${dot}</div><div class="sub">Урон от горения и кровотечения</div>`);
        Game.log(`Статусы нанесли ${dot} урона`, '#ffb347');
        return this.after(1.1, () => (m.hp <= 0 ? this.victory() : this.enemyTurn(1)));
      }
      step = 1;
    }
    if (step === 1) {
      if (this.trait() === 'regen' && m.hp < m.maxHp) {
        const h = Math.min(m.maxHp - m.hp, Math.round(m.maxHp * 0.06));
        m.hp += h;
        History.add({ t: 'regen', heal: h, mobHp: m.hp });
        this.renderEnemy();
        this.phase = 'result';
        this.stage(`<div class="big" style="color:#6fd66f">+${h}</div><div class="sub">${k.name} регенерирует</div>`);
        return this.after(0.9, () => this.enemyTurn(2));
      }
      step = 2;
    }
    if (m.fear) {
      m.fear = false;
      History.add({ t: 'fear' });
      this.renderEnemy();
      this.phase = 'result';
      this.stage(`<h2>${k.name} в ужасе и пропускает ход!</h2>`);
      return this.after(1.2, () => this.toChoose());
    }
    this.enemyAttack();
  },

  enemyAttack() {
    const m = this.mob, k = MOB_KINDS[m.kind];
    this.phase = 'enemyReady';
    this.stage(`<h2>${k.name} ${this.secondAttack ? 'атакует снова!' : 'атакует!'}</h2>
      <div class="sub">Тип: <b class="t-${k.atkType}">${TYPES[k.atkType].name}</b>. Наберите код блока!</div><div class="big">Блок…</div>`);
    this.after(0.8, () => {
      const len = 4 + Math.min(4, Math.floor(m.lvl / 2));
      this.code = Array.from({ length: len }, () => TYPE_KEYS[Math.floor(Math.random() * 3)]);
      this.hidden = null;
      this.pos = 0; this.mistakes = 0; this.elapsed = 0;
      this.limit = (BAL.defTimeBase + len * BAL.defTimePerChar) * this.timeMult();
      this.freeMiss = player.skill('e_clarity') > 0;
      this.phase = 'defend';
      this.stage(`<div class="sub">БЛОКИРУЙ!</div>${this.codeHtml()}
        <div class="timer"><div id="tFill"></div></div><div class="mistakes" id="misText"></div>`);
    });
  },

  finishDefend() {
    this.phase = 'enemyResult';
    const m = this.mob, k = MOB_KINDS[m.kind];
    const frac = this.pos / this.code.length;
    const block = Math.max(0, BAL.blockMax * frac - 0.1 * this.mistakes);
    const raw = this.mobAtk() * (0.85 + Math.random() * 0.3);
    const dmg = Math.max(1, Math.round(raw * (1 - block)));
    player.hp -= dmg;
    const perfect = frac === 1 && this.mistakes === 0;
    const word = perfect ? 'БЛОК!' : frac >= 0.5 ? 'Частичный блок' : 'Пропущен удар';
    const extras = [];
    if (perfect) {
      let back = 0;
      if (player.skill('q_reflect')) { const r = Math.round(raw * 0.5 * this.mult().Q); back += r; extras.push(`Отражение −${r}`); }
      if (player.skill('w_counter')) { const r = Math.round(3 * player.dmg('W') * this.mult().W); back += r; extras.push(`Контратака −${r}`); }
      if (back > 0) { m.hp -= back; this.hitAnim(); this.renderEnemy(); }
    } else {
      // особенности мобов, срабатывающие на пропущенный удар
      if (this.trait() === 'poison') {
        this.poison = { dmg: Math.max(1, Math.round(this.mobAtk() * 0.3)), turns: 3 };
        extras.push('Отравление');
      }
      if (this.trait() === 'spores') { this.spores = true; extras.push('Споры'); }
      if (this.trait() === 'hex') { this.hexed = true; extras.push('Проклятие'); }
    }
    let again = false;
    if (this.trait() === 'double' && !this.secondAttack && Math.random() < 0.3) { again = true; extras.push('Сейчас укусит ещё раз!'); }
    History.add({
      t: 'defend', code: this.code.join(''), typed: this.pos, mistakes: this.mistakes, time: +this.elapsed.toFixed(2),
      limit: +this.limit.toFixed(2), block: +block.toFixed(2), raw: Math.round(raw), dmg, hp: Math.max(0, player.hp), extras,
    });
    this.renderPlayer();
    this.stage(`<div class="big" style="color:#ff7d7d">−${dmg} HP</div>
      <div><span class="tag">${word}</span> снижено на ${Math.round(block * 100)}%</div>
      ${extras.length ? `<div>${extras.map(e => `<span class="tag">${e}</span>`).join('')}</div>` : ''}
      <div class="cont">Пробел — дальше</div>`);
    Game.log(`${k.name} нанёс вам ${dmg} урона`, '#ff9b9b');
    FX.shake(perfect ? 0.08 : 0.35);
    if (perfect) SFX.key(true); else SFX.hurt();
    Game.updateHud();
    this.after(1.6, () => {
      if (player.hp <= 0) return this.defeat();
      if (m.hp <= 0) return this.victory();
      if (again) { this.secondAttack = true; return this.enemyAttack(); }
      this.toChoose();
    });
  },

  // ---------- предметы ----------
  combatItems() {
    return player.inv.filter(s => ['heal', 'focus', 'scroll'].includes(ITEMS[s.id].kind));
  },

  toItems() {
    this.phase = 'items';
    const list = this.combatItems();
    this.stage(`<h2>Предметы</h2>
      <div class="choices">${list.length ? list.map((s, i) => {
        const it = ITEMS[s.id];
        return `<div class="choice small2" data-act="use:${s.id}"><div class="k">${i + 1}</div><div class="n">${iconHtml(it.look, 18)} ${it.name} ×${s.count}</div></div>`;
      }).join('') : '<div class="sub">Нечего использовать</div>'}</div>
      <div class="choices"><div class="choice small2" data-act="back"><div class="k">Esc</div><div class="n">Назад</div></div></div>`);
    this.bindClicks();
  },

  useItem(id) {
    const it = ITEMS[id];
    if (!Game.removeItem(id)) return;
    History.add({ t: 'item', id });
    if (it.kind === 'heal') {
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + it.heal);
      this.poison = null; // зелье заодно лечит яд
      this.renderPlayer(); Game.updateHud();
      this.phase = 'result';
      this.stage(`<div class="big" style="color:#5be06b">+${player.hp - before} HP</div><div class="sub">${it.name}</div>`);
      this.after(1.0, () => this.enemyTurn());
    } else if (it.kind === 'focus') {
      this.focus = true;
      Game.log('Концентрация: следующая атака ×1.5', '#4fe3ff');
      this.toChoose();
    } else if (it.kind === 'scroll') {
      const best = Game.beast(this.mob.kind);
      TYPE_KEYS.forEach(t => (best.known[t] = true));
      this.renderEnemy();
      Game.log('Уязвимости раскрыты!', '#4fe3ff');
      this.toChoose();
    }
  },

  // ---------- побег / итоги ----------
  flee() {
    const chance = Math.min(0.9, Math.max(0.2, 0.55 + 0.08 * (player.lvl - this.mob.lvl)));
    if (Math.random() < chance) {
      Game.log('Вы сбежали!', '#ccc');
      History.finish('flee');
      this.mob.stun = 4;
      player.invuln = 2;
      this.end();
    } else {
      History.add({ t: 'fleeFail' });
      this.phase = 'result';
      this.stage(`<h2>Не удалось сбежать!</h2>`);
      this.after(0.9, () => this.enemyTurn());
    }
  },

  victory() {
    const m = this.mob, k = MOB_KINDS[m.kind];
    if (this.trait() === 'reassemble' && !m.revived) {
      m.revived = true;
      m.hp = Math.round(m.maxHp * 0.3);
      History.add({ t: 'revive', mobHp: m.hp });
      this.renderEnemy();
      this.phase = 'result';
      this.stage(`<h2>Кости сползаются обратно…</h2><div class="sub">${k.name} собрался заново с ${m.hp} HP!</div>`);
      return this.after(1.5, () => this.enemyTurn());
    }
    this.phase = 'victory';
    const best = Game.beast(m.kind);
    best.kills++;
    const eliteK = m.elite ? 2 : 1;
    const xp = Math.round(k.xp * (1 + 0.5 * (m.lvl - 1)) * eliteK);
    const gold = Math.round((k.gold[0] + Math.random() * (k.gold[1] - k.gold[0])) * (1 + 0.3 * (m.lvl - 1)) * eliteK);
    const loot = rollLoot(m.lvl, Math.random);
    if (m.elite || m.kind === 'mimic') loot.push(...rollLoot(m.lvl + 2, Math.random), weightedPick(LOOT_COMMON, Math.random));
    if (k.boss) {
      loot.push(LOOT_GEAR_T2[Math.floor(Math.random() * 3)], 'bigpotion');
      player.skillPoints++;
      Dungeons.bossKilled();
    }
    player.gold += gold;
    loot.forEach(id => Game.addItem(id));
    world.killMob(m);
    const lvlUp = Game.gainXp(xp);
    History.finish('win', { xp, gold, loot });
    this.renderEnemy();
    SFX.win();
    this.stage(`<h2>Победа!</h2>
      <div class="bd">+${xp} опыта · +${gold} золота${loot.length ? ' · ' + loot.map(id => iconHtml(ITEMS[id].look, 16) + ' ' + ITEMS[id].name).join(', ') : ''}</div>
      ${lvlUp ? `<div class="tag">НОВЫЙ УРОВЕНЬ ${player.lvl}! +1 очко навыков (K)</div>` : ''}
      ${k.boss ? `<div class="tag">СТРАЖ ПОВЕРЖЕН! +1 очко навыков, редкое снаряжение</div>` : ''}
      <div class="cont">Пробел — продолжить</div>`);
  },

  defeat() {
    this.phase = 'defeat';
    const lost = Math.floor(player.gold / 2);
    player.gold -= lost;
    History.finish('loss', { goldLost: lost });
    SFX.lose();
    this.stage(`<h2>Вы пали…</h2><div class="sub">Вы очнулись у точки старта. Потеряно ${lost} золота</div><div class="cont">Пробел — продолжить</div>`);
  },

  // ---------- клавиши ----------
  key(code) {
    const letter = code === 'KeyQ' ? 'Q' : code === 'KeyW' ? 'W' : code === 'KeyE' ? 'E' : null;
    switch (this.phase) {
      case 'choose': {
        const map = { Digit1: 'Q', Digit2: 'W', Digit3: 'E' };
        if (letter || map[code]) this.beginAttack(letter || map[code]);
        else if (code === 'Digit4' || code === 'KeyI') this.toItems();
        else if (code === 'Digit5' || code === 'Escape') this.flee();
        break;
      }
      case 'items': {
        if (code === 'Escape' || code === 'Backspace') { this.toChoose(); break; }
        const m = code.match(/^Digit([1-9])$/);
        if (m) { const s = this.combatItems()[+m[1] - 1]; if (s) this.useItem(s.id); }
        break;
      }
      case 'typing': case 'defend':
        if (letter) this.typeKey(letter);
        break;
      case 'result': case 'enemyResult':
        if (code === 'Space' || code === 'Enter') this.skipWait();
        break;
      case 'victory':
        if (code === 'Space' || code === 'Enter') { this.end(); Game.save(); }
        break;
      case 'defeat':
        if (code === 'Space' || code === 'Enter') { this.end(); Game.respawn(); Game.save(); }
        break;
    }
  },
};

// ===== Летопись боёв =====
// Каждый бой: кто, уровни, снаряжение и навыки, все ходы с кодами, скоростью и уроном, итог.
// Хранится в localStorage и (в приложении) пишется в history\battles.json рядом с игрой.
const HISTORY_KEY = 'qwe_history_v1';
const History = {
  list: [], cur: null,
  load() {
    try { this.list = JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { this.list = []; }
  },
  begin(mob) {
    this.cur = {
      id: Date.now(), date: new Date().toISOString(), seed: world.seed,
      mob: { kind: mob.kind, name: MOB_KINDS[mob.kind].name, lvl: mob.lvl, elite: !!mob.elite, maxHp: mob.maxHp, hp: mob.hp, atk: mob.atk },
      player: {
        lvl: player.lvl, hp: player.hp, maxHp: player.maxHp,
        dmg: Object.fromEntries(TYPE_KEYS.map(t => [t, +player.dmg(t).toFixed(1)])),
        gear: { ...player.gear }, skills: { ...player.skills },
      },
      zone: world.zoneLevel(mob.x, mob.y), biome: TILE_INFO[world.tileAt(mob.x, mob.y)].name, dungeon: !!world.isDungeon,
      events: [], start: performance.now(),
    };
  },
  add(ev) { if (this.cur) this.cur.events.push(ev); },
  finish(result, extra = {}) {
    const c = this.cur;
    if (!c) return;
    c.result = result;
    Object.assign(c, extra);
    c.seconds = Math.round((performance.now() - c.start) / 1000);
    delete c.start;
    c.playerHpEnd = Math.max(0, player.hp);
    const atks = c.events.filter(e => e.t === 'attack');
    c.summary = {
      turns: atks.length,
      avgCps: atks.length ? +(atks.reduce((a, e) => a + e.cps, 0) / atks.length).toFixed(2) : 0,
      mistakes: atks.reduce((a, e) => a + e.mistakes, 0),
      dmgDealt: atks.reduce((a, e) => a + e.dmg, 0),
      dmgTaken: c.events.filter(e => e.t === 'defend').reduce((a, e) => a + e.dmg, 0),
    };
    this.list.push(c);
    if (this.list.length > 300) this.list.splice(0, this.list.length - 300);
    this.cur = null;
    this.save();
  },
  save() {
    const json = JSON.stringify(this.list);
    try { localStorage.setItem(HISTORY_KEY, json); } catch (e) { /* без хранилища */ }
    if (window.qweApp && window.qweApp.saveHistory) window.qweApp.saveHistory(JSON.stringify(this.list, null, 1));
  },
  clear() { this.list = []; this.save(); },
};
History.load();

function multWord(m) {
  if (m === 0) return '(иммун)';
  if (m >= 2) return '(уязвим!)';
  if (m > 1) return '(слабость)';
  if (m < 1) return '(стойкий)';
  return '';
}

function weakHtml(kind, known, override) {
  const k = { mult: override || MOB_KINDS[kind].mult };
  return TYPE_KEYS.map(t => {
    if (!known[t]) return `<span class="w"><span class="t-${t}">${TYPES[t].icon} ${TYPES[t].short}</span> <b class="unk">?</b></span>`;
    const m = k.mult[t];
    const cls = m > 1 ? 'good' : m === 0 ? 'none' : m < 1 ? 'bad' : '';
    return `<span class="w"><span class="t-${t}">${TYPES[t].icon} ${TYPES[t].short}</span> <b class="${cls}">×${m}</b></span>`;
  }).join('');
}

function rollLoot(lvl, rnd) {
  const out = [];
  if (rnd() < 0.45) out.push(weightedPick(LOOT_COMMON, rnd));
  if (rnd() < 0.07 + 0.01 * lvl) {
    const pool = lvl >= 3 && rnd() < 0.4 ? LOOT_GEAR_T2 : LOOT_GEAR_T1;
    out.push(pool[Math.floor(rnd() * pool.length)]);
  }
  return out;
}

// параллакс-наклон портрета за мышью (псевдо-3D в бою)
window.addEventListener('mousemove', e => {
  if (!Combat.mob) return;
  Combat.mouseTX = (e.clientX / window.innerWidth - 0.5) * 2;
  Combat.mouseTY = (e.clientY / window.innerHeight - 0.5) * 2;
});
