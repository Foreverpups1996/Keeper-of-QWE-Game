'use strict';
// ===== Сетевая игра на двоих: WebRTC по код-приглашению (без сервера) =====
// Обмен «код-приглашение» (offer) и «код-ответ» (answer) вручную через буфер обмена.
// Игроки должны быть в одном мире (одинаковый seed). Работает в браузере и лаунчере.

(function () {
  const NAME_KEY = 'qwe_net_name_v1';
  const STUN = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  function enc(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  function dec(str) { return JSON.parse(decodeURIComponent(escape(atob(String(str).trim())))); }
  function waitIce(pc) {
    return new Promise(res => {
      if (!pc || pc.iceGatheringState === 'complete') return res();
      const done = () => { clearTimeout(t); res(); };
      const t = setTimeout(done, 3500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') done(); });
    });
  }
  function hashColor(name) {
    let h = 0; for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(h) % 360}, 70%, 60%)`;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      try { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch (e2) { return false; }
    }
  }

  const Net = {
    active: false, role: null, status: 'idle', pc: null, dc: null,
    code: '', answer: '', name: '', seed: null, err: '',
    remotes: {}, chat: [], timer: null, lastPos: 0,

    init() {
      try { this.name = localStorage.getItem(NAME_KEY) || ('Игрок' + (100 + Math.floor(Math.random() * 900))); } catch (e) { this.name = 'Игрок'; }
    },
    setName(n) { this.name = String(n || '').slice(0, 16) || 'Игрок'; try { localStorage.setItem(NAME_KEY, this.name); } catch (e) {} this.sendHello(); },
    supported() { return typeof RTCPeerConnection !== 'undefined'; },
    setStatus(s) { this.status = s; if (typeof Game !== 'undefined' && Game.mode === 'net') this.draw(); },
    log(msg, color) { if (typeof Game !== 'undefined' && Game.log) Game.log(msg, color || '#9adcff'); },

    // ---------- запуск частей соединения ----------
    _newPc() {
      const pc = new RTCPeerConnection({ iceServers: STUN });
      pc.addEventListener('iceconnectionstatechange', () => {
        const s = pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') this._connected();
        else if (s === 'failed' || s === 'disconnected') { this.log('Соединение потеряно/не удалось', '#ff9b9b'); this.setStatus('error'); }
      });
      return pc;
    },
    _wireChannel(dc) {
      this.dc = dc;
      dc.addEventListener('open', () => this._connected());
      dc.addEventListener('close', () => { this.active = false; this.setStatus('closed'); this.log('Напарник отключился', '#ff9b9b'); });
      dc.addEventListener('message', ev => this.onData(ev.data));
    },
    _connected() {
      if (this.active) return;
      this.active = true;
      this.setStatus('connected');
      this.log('Сетевая игра подключена', '#5be06b');
      this.sendHello();
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 120);
    },

    async host() {
      if (!this.supported()) { this.log('WebRTC не поддерживается', '#ff9b9b'); return; }
      try {
        this.role = 'host'; this.err = '';
        this.pc = this._newPc();
        this._wireChannel(this.pc.createDataChannel('qwe'));
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await waitIce(this.pc);
        this.code = enc(this.pc.localDescription);
        this.setStatus('host-offer');
        this.log('Код-приглашение готов — отправьте его напарнику', '#ffd75e');
      } catch (e) { this.err = e.message; this.setStatus('error'); this.log('Ошибка хоста: ' + e.message, '#ff9b9b'); }
    },

    async join(inviteCode) {
      if (!this.supported()) { this.log('WebRTC не поддерживается', '#ff9b9b'); return; }
      try {
        this.role = 'guest'; this.err = '';
        const desc = dec(inviteCode);
        this.pc = this._newPc();
        this.pc.addEventListener('datachannel', ev => this._wireChannel(ev.channel));
        await this.pc.setRemoteDescription(desc);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await waitIce(this.pc);
        this.answer = enc(this.pc.localDescription);
        this.setStatus('guest-answer');
        this.log('Код-ответ готов — отправьте его хосту', '#ffd75e');
      } catch (e) { this.err = e.message; this.setStatus('error'); this.log('Ошибка подключения: ' + e.message, '#ff9b9b'); }
    },

    async applyAnswer(answerCode) {
      try { await this.pc.setRemoteDescription(dec(answerCode)); this.log('Ответ принят, соединяемся…', '#9adcff'); }
      catch (e) { this.err = e.message; this.log('Неверный код-ответ: ' + e.message, '#ff9b9b'); }
    },

    close() {
      try { this.send({ t: 'bye' }); } catch (e) {}
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      try { this.dc && this.dc.close(); } catch (e) {}
      try { this.pc && this.pc.close(); } catch (e) {}
      this.pc = this.dc = null; this.active = false; this.role = null; this.status = 'idle';
      this.remotes = {}; this.code = ''; this.answer = '';
      this.log('Сетевая игра завершена');
      if (typeof Game !== 'undefined' && Game.mode === 'net') this.draw();
    },

    // ---------- обмен данными ----------
    send(obj) { if (this.dc && this.dc.readyState === 'open') { try { this.dc.send(JSON.stringify(obj)); } catch (e) {} } },
    sendHello() {
      const seed = (typeof world !== 'undefined' && world) ? world.seed : null;
      const p = (typeof player !== 'undefined' && player) ? player : null;
      this.send({ t: 'hello', name: this.name, seed, lvl: p ? p.lvl : 1, x: p ? p.x : 0, y: p ? p.y : 0 });
    },
    tick() {
      if (!this.active || typeof player === 'undefined' || !player) return;
      if (typeof Game === 'undefined' || Game.mode !== 'world') return;
      this.send({ t: 'p', name: this.name, x: player.x, y: player.y, dir: player.dir, lvl: player.lvl, hp: player.hp, maxHp: player.maxHp });
    },
    onData(raw) {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      const now = performance.now();
      if (m.t === 'hello') {
        this.seed = m.seed;
        this.remotes.peer = Object.assign(this.remotes.peer || {}, { name: m.name || 'Напарник', lvl: m.lvl, x: m.x, y: m.y, rx: m.x, ry: m.y, seen: now });
        if (this.role === 'guest' && typeof world !== 'undefined' && world && m.seed != null && world.seed !== m.seed) {
          this.log('Внимание: у вас разный мир (seed). Совместная игра точна только в одном мире.', '#ff9b9b');
        }
        this.log(`${m.name || 'Напарник'} в игре (мир ${m.seed}, ур.${m.lvl})`, '#5be06b');
      } else if (m.t === 'p') {
        const r = this.remotes.peer || (this.remotes.peer = { rx: m.x, ry: m.y });
        r.name = m.name; r.x = m.x; r.y = m.y; r.dir = m.dir; r.lvl = m.lvl; r.hp = m.hp; r.maxHp = m.maxHp; r.seen = now;
        if (r.rx == null) { r.rx = m.x; r.ry = m.y; }
      } else if (m.t === 'chat') {
        this.chat.push(`[${m.name || 'Напарник'}] ${m.text}`);
        if (this.chat.length > 30) this.chat.shift();
        this.log(`<b>${m.name || 'Напарник'}:</b> ${m.text}`, '#cfe');
        if (typeof Game !== 'undefined' && Game.mode === 'net') this.draw();
      } else if (m.t === 'bye') {
        delete this.remotes.peer;
        this.log('Напарник вышел из игры', '#ff9b9b');
      }
    },
    sendChat(text) {
      text = String(text || '').trim();
      if (!text) return;
      this.send({ t: 'chat', name: this.name, text });
      this.chat.push(`[Вы] ${text}`);
      if (this.chat.length > 30) this.chat.shift();
    },

    // ---------- отрисовка удалённых игроков ----------
    drawRemotes(ctx, camX, camY, TS, time) {
      if (!this.active) return;
      const now = performance.now();
      for (const id in this.remotes) {
        const r = this.remotes[id];
        if (!r || now - (r.seen || 0) > 8000) continue;
        r.rx = (r.rx == null ? r.x : r.rx) + (r.x - r.rx) * 0.25;
        r.ry = (r.ry == null ? r.y : r.ry) + (r.y - r.ry) * 0.25;
        const sx = r.rx * TS - camX, sy = r.ry * TS - camY;
        if (sx < -TS || sy < -TS || sx > window.innerWidth + TS || sy > window.innerHeight + TS) continue;
        const col = hashColor(r.name || id);
        drawShape3D(ctx, { shape: 'circle', color: col }, sx + 16, sy + 16 + Math.sin(time * 2) * 1.5, 11,
          { lookX: (r.dir && r.dir[0]) || 0, lookY: (r.dir && r.dir[1]) || 0, h: 7 });
        // имя и полоска HP
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(r.name || id, sx + 16, sy - 12);
        ctx.fillStyle = '#cfe'; ctx.fillText(r.name || id, sx + 16, sy - 12);
        if (r.maxHp) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx + 16 - 13, sy - 6, 26, 4);
          ctx.fillStyle = '#5be06b'; ctx.fillRect(sx + 16 - 13 + 1, sy - 5, 24 * Math.max(0, r.hp / r.maxHp), 2);
        }
      }
    },

    // ---------- панель (N) ----------
    draw() {
      const st = {
        idle: 'Не подключено', 'host-offer': 'Хост: ждём ответ', 'guest-answer': 'Гость: ждём подключения',
        connected: 'Подключено', closed: 'Соединение закрыто', error: 'Ошибка', unsupported: 'Не поддерживается',
      }[this.status] || this.status;
      const peers = this.active ? Object.keys(this.remotes).map(k => this.remotes[k].name || k).join(', ') || '—' : '—';
      let controls = '';
      if (!this.supported()) {
        controls = '<p class="sub">Это устройство не поддерживает WebRTC.</p>';
      } else if (this.status === 'idle' || this.status === 'closed' || this.status === 'error') {
        controls = `
          <div class="setbtns">
            <button class="setbtn big" id="netHost">Создать игру (хост)</button>
            <button class="setbtn big" id="netJoin">Ввести код-приглашение (гость)</button>
          </div>
          <div id="netJoinBox" class="hidden" style="margin-top:10px">
            <label class="small">Вставьте код-приглашение хоста:</label>
            <textarea id="netJoinIn" class="netta" placeholder="код-приглашение…"></textarea>
            <button class="setbtn" id="netJoinGo">Подключиться</button>
          </div>`;
      } else if (this.status === 'host-offer') {
        controls = `
          <label class="small">1. Код-приглашение — отправьте напарнику (сообщением):</label>
          <textarea id="netOffer" class="netta" readonly>${this.code}</textarea>
          <button class="setbtn" id="netCopyOffer">Копировать код-приглашение</button>
          <label class="small" style="display:block;margin-top:12px">2. Вставьте код-ответ от напарника:</label>
          <textarea id="netAnswerIn" class="netta" placeholder="код-ответ гостя…"></textarea>
          <button class="setbtn big" id="netApply">Подключить гостя</button>`;
      } else if (this.status === 'guest-answer') {
        controls = `
          <p class="small">Соединение устанавливается автоматически. Если нет — отправьте хосту этот код-ответ:</p>
          <textarea id="netAnswer" class="netta" readonly>${this.answer}</textarea>
          <button class="setbtn" id="netCopyAnswer">Копировать код-ответ</button>`;
      } else if (this.status === 'connected') {
        controls = `
          <div class="setbtns"><button class="setbtn danger" id="netLeave">Выйти из сети</button></div>
          <div class="small" style="margin-top:8px">Напарники: <b>${peers}</b></div>
          <label class="small" style="display:block;margin-top:10px">Чат:</label>
          <div class="netchat">${this.chat.slice(-12).map(l => `<div>${l}</div>`).join('') || '<div class="sub">тишина…</div>'}</div>
          <div class="setrow"><input type="text" id="netChatIn" class="netinput" placeholder="сообщение…"><button class="setbtn" id="netChatGo">Отправить</button></div>`;
      }

      panelBox.innerHTML = `<span class="close">Esc / N — закрыть</span><h2>Сетевая игра</h2>
        <p class="small">Кооператив по WebRTC без сервера. Оба игрока должны быть в мире с одинаковым seed. Если NAT симметричный, используйте Radmin VPN / локальную сеть.</p>
        <div class="setrow"><label>Ваше имя</label><input type="text" id="netName" class="netinput" value="${this.name}"></div>
        <div class="small">Статус: <b>${st}</b>${this.err ? ' — ' + this.err : ''}</div>
        <div style="margin-top:10px">${controls}</div>`;

      const $ = id => document.getElementById(id);
      const nEl = $('netName'); if (nEl) nEl.onchange = e => this.setName(e.target.value);
      const h = $('netHost'); if (h) h.onclick = () => this.host();
      const j = $('netJoin'); if (j) j.onclick = () => { const b = $('netJoinBox'); if (b) b.classList.toggle('hidden'); };
      const jg = $('netJoinGo'); if (jg) jg.onclick = () => { const t = $('netJoinIn'); if (t && t.value.trim()) this.join(t.value); };
      const co = $('netCopyOffer'); if (co) co.onclick = async () => { this.log(await copyText(this.code) ? 'Код-приглашение скопирован' : 'Не удалось скопировать', '#9adcff'); };
      const ca = $('netCopyAnswer'); if (ca) ca.onclick = async () => { this.log(await copyText(this.answer) ? 'Код-ответ скопирован' : 'Не удалось скопировать', '#9adcff'); };
      const ap = $('netApply'); if (ap) ap.onclick = () => { const t = $('netAnswerIn'); if (t && t.value.trim()) this.applyAnswer(t.value); };
      const lv = $('netLeave'); if (lv) lv.onclick = () => this.close();
      const cg = $('netChatGo'); if (cg) cg.onclick = () => { const t = $('netChatIn'); if (t) { this.sendChat(t.value); t.value = ''; this.draw(); } };
      const ci = $('netChatIn'); if (ci) ci.onkeydown = e => { if (e.key === 'Enter') { this.sendChat(ci.value); ci.value = ''; this.draw(); } };
    },
  };

  Net.init();

  // ---------- интеграция ----------
  if (typeof drawPanel === 'function') {
    const _drawPanel = drawPanel;
    drawPanel = function () {
      if (Game.mode === 'net') return Net.draw();
      return _drawPanel();
    };
  }
  if (typeof panelKey === 'function') {
    const _panelKey = panelKey;
    panelKey = function (code) {
      if (Game.mode === 'net' && (code === 'Escape' || code === 'KeyN')) return closePanel();
      return _panelKey(code);
    };
  }
  if (typeof Game !== 'undefined') {
    Game.mp = {
      get on() { return Net.active; },
      host() { if (typeof openPanel === 'function') openPanel('net'); },
      join() { if (typeof openPanel === 'function') openPanel('net'); },
    };
  }

  window.Net = Net;
  console.log('[NET] сетевая игра загружена: WebRTC по код-приглашению');
})();
