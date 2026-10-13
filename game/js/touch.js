'use strict';
// ===== Сенсорное управление (Android-сборка): аналоговый стик + кнопки =====
// Загружается последним, после main.js. На десктопе без тачскрина ничего не делает
// (включается принудительно параметром ?touch=1 — для проверки).
(function () {
  function params() { try { return new URLSearchParams(location.search); } catch (e) { return null; } }
  const q = params();
  const force = q && q.get('touch') === '1';
  const isTouch = force || ('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0);
  if (!isTouch) return;

  window.addEventListener('contextmenu', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

  function mode() { try { return Game.mode; } catch (e) { return 'menu'; } }
  function tap(code) {
    try {
      const init = { code: code, bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent('keydown', init));
      window.dispatchEvent(new KeyboardEvent('keyup', init));
    } catch (e) { /* старые WebView */ }
  }

  const DV = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
  let toggleRun = false, stickRun = false, curKey = null;
  function applyRun() {
    try {
      if (toggleRun || stickRun) held.add('ShiftLeft');
      else held.delete('ShiftLeft');
    } catch (e) { /* игра ещё не загружена */ }
  }
  function setDirKey(code) {
    try {
      if (code === curKey) return;
      if (curKey) held.delete(curKey);
      curKey = code;
      if (code) {
        const m = mode();
        if (m === 'combat' || m === 'trap') { curKey = null; return; }
        held.add(code);
        if (m === 'world' && typeof player !== 'undefined' && player && DV[code]) player.dir = DV[code].slice();
        if (m === 'menu' && (code === 'KeyW' || code === 'KeyS')) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true, cancelable: true }));
        }
      }
    } catch (e) { /* игра ещё не загружена */ }
  }

  function build() {
    try {
      document.body.classList.add('touch');
      const ui = document.createElement('div');
      ui.id = 'touchUI';
      ui.innerHTML =
        '<div class="tcluster">' +
          '<div id="stick"><div id="stickKnob"></div></div>' +
        '</div>' +
        '<div class="tcluster">' +
          '<div class="trow">' +
            '<button class="tbtn tqwe t-Q" data-tap="KeyQ">Q</button>' +
            '<button class="tbtn tqwe t-W" data-tap="KeyW">W</button>' +
            '<button class="tbtn tqwe t-E" data-tap="KeyE">E</button>' +
          '</div>' +
          '<div class="trow"><button class="tbtn taction" data-tap="Space">⚡ ДЕЙСТВИЕ</button></div>' +
          '<div class="trow tsmall">' +
            '<button class="tbtn" data-tap="Digit4" title="Предмет">4 🧪</button>' +
            '<button class="tbtn" data-tap="Digit5" title="Сбежать">5 🏃</button>' +
            '<button class="tbtn" id="tRun" title="Бег">БЕГ</button>' +
            '<button class="tbtn" data-tap="KeyI" title="Инвентарь">🎒</button>' +
            '<button class="tbtn" data-tap="KeyK" title="Таланты">🌟</button>' +
            '<button class="tbtn" data-tap="Escape" title="Меню / назад">≡</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ui);

      // --- аналоговый стик ---
      const stick = ui.querySelector('#stick');
      const knob = ui.querySelector('#stickKnob');
      let stickId = null, scx = 0, scy = 0, sR = 40;
      const DEAD = 0.22; // мёртвая зона (доля радиуса)
      function release() {
        stickId = null;
        setDirKey(null);
        stickRun = false; applyRun();
        knob.style.transform = 'translate(0px,0px)';
        stick.classList.remove('active');
      }
      function handle(dx, dy) {
        const len = Math.hypot(dx, dy);
        if (len < sR * DEAD) {
          setDirKey(null);
          stickRun = false; applyRun();
          knob.style.transform = 'translate(0px,0px)';
          return;
        }
        const k = Math.min(len, sR) / (len || 1);
        knob.style.transform = 'translate(' + (dx * k).toFixed(1) + 'px,' + (dy * k).toFixed(1) + 'px)';
        const code = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'KeyD' : 'KeyA') : (dy > 0 ? 'KeyS' : 'KeyW');
        setDirKey(code);
        stickRun = len > sR * 0.85; // дожал до края — бег
        applyRun();
      }
      stick.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (stickId !== null) return;
        stickId = e.pointerId;
        try { stick.setPointerCapture(e.pointerId); } catch (err) { /* нет захвата */ }
        const r = stick.getBoundingClientRect();
        scx = r.left + r.width / 2; scy = r.top + r.height / 2; sR = r.width / 2;
        stick.classList.add('active');
        handle(e.clientX - scx, e.clientY - scy);
      });
      stick.addEventListener('pointermove', function (e) {
        if (e.pointerId !== stickId) return;
        e.preventDefault();
        handle(e.clientX - scx, e.clientY - scy);
      });
      const endEv = function (e) { if (e.pointerId === stickId) { e.preventDefault(); release(); } };
      stick.addEventListener('pointerup', endEv);
      stick.addEventListener('pointercancel', endEv);

      // --- одиночные нажатия ---
      ui.querySelectorAll('[data-tap]').forEach(function (b) {
        const k = b.getAttribute('data-tap');
        const go = function (e) {
          e.preventDefault();
          b.classList.add('hit');
          setTimeout(function () { b.classList.remove('hit'); }, 120);
          tap(k);
        };
        b.addEventListener('touchstart', go, { passive: false });
        b.addEventListener('mousedown', go);
      });
      // --- БЕГ — тумблер ---
      const run = ui.querySelector('#tRun');
      const flip = function (e) {
        e.preventDefault();
        toggleRun = !toggleRun;
        run.classList.toggle('held', toggleRun);
        applyRun();
      };
      run.addEventListener('touchstart', flip, { passive: false });
      run.addEventListener('mousedown', flip);
    } catch (e) { /* не критично */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
