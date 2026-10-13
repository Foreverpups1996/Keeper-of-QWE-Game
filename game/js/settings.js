'use strict';
// ===== Настройки, экспорт/импорт сохранения =====
// Загружается последним: патчит меню и панели, чтобы добавить экран «Настройки».
// Хранит параметры в localStorage (qwe_settings_v1) и сразу применяет их.

(function () {
  const KEY = 'qwe_settings_v1';
  const saveKeyName = (typeof SAVE_KEY !== 'undefined') ? SAVE_KEY : 'qwe_save_v1';
  const historyKeyName = (typeof HISTORY_KEY !== 'undefined') ? HISTORY_KEY : 'qwe_history_v1';

  const DEFAULTS = { volume: 0.7, uiScale: 1, shake: true, daynight: true };
  const Settings = {
    data: Object.assign({}, DEFAULTS),
    load() {
      try { Object.assign(this.data, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
      this.data.volume = clamp(+this.data.volume, 0, 1, DEFAULTS.volume);
      this.data.uiScale = clamp(+this.data.uiScale, 0.8, 1.4, DEFAULTS.uiScale);
      this.data.shake = this.data.shake !== false;
      this.data.daynight = this.data.daynight !== false;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {} },
    set(k, v) { this.data[k] = v; this.save(); this.apply(); },
    apply() {
      // громкость
      if (typeof SFX !== 'undefined') SFX.master = this.data.volume;
      // масштаб интерфейса (только HUD/лог — canvas не трогаем)
      try { document.documentElement.style.setProperty('--ui', String(this.data.uiScale)); } catch (e) {}
    },
  };
  function clamp(v, a, b, d) { if (!isFinite(v)) return d; return v < a ? a : v > b ? b : v; }

  Settings.load();
  Settings.apply();
  window.Settings = Settings;

  // ---------- экспорт / импорт / сброс ----------
  function capPlugin(name) {
    try {
      const C = window.Capacitor;
      if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
      return (C.Plugins && C.Plugins[name]) || null;
    } catch (e) { return null; }
  }

  function download(name, text) {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    } catch (e) { return false; }
  }

  // Нативный экспорт (Capacitor/iOS): пишем файл в кэш и открываем системный
  // лист «Поделиться» — из него сохранение можно сохранить в «Файлы», отправить и т.п.
  async function nativeExport(name, text) {
    const FS = capPlugin('Filesystem');
    const Share = capPlugin('Share');
    if (!FS || !Share) return false;
    try {
      const res = await FS.writeFile({ path: name, data: text, directory: 'CACHE', recursive: true });
      await Share.share({ title: name, files: [res.uri] });
      return true;
    } catch (e) { return false; }
  }

  async function exportSave() {
    const payload = {
      app: 'Keeper of QWE', type: 'save', date: new Date().toISOString(),
      save: localStorage.getItem(saveKeyName),
      history: localStorage.getItem(historyKeyName),
      settings: Settings.data,
    };
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const name = `keeper-of-qwe-save-${stamp}.json`;
    const text = JSON.stringify(payload, null, 2);
    if (await nativeExport(name, text)) { Game.log('Сохранение готово к отправке: ' + name, '#5be06b'); return; }
    if (download(name, text)) Game.log('Сохранение выгружено: ' + name, '#5be06b');
    else Game.log('Не удалось выгрузить сохранение', '#ff9b9b');
  }

  function importSave(cb) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if (!obj || (obj.type !== 'save' && !obj.save)) throw new Error('неверный файл');
          if (typeof obj.save === 'string') localStorage.setItem(saveKeyName, obj.save);
          else if (obj.save) localStorage.setItem(saveKeyName, JSON.stringify(obj.save));
          if (typeof obj.history === 'string') localStorage.setItem(historyKeyName, obj.history);
          if (obj.settings) { Object.assign(Settings.data, obj.settings); Settings.save(); Settings.apply(); }
          Game.log('Сохранение импортировано. Перезапуск…', '#5be06b');
          if (cb) cb(true);
          setTimeout(() => location.reload(), 600);
        } catch (e) {
          Game.log('Импорт не удался: ' + e.message, '#ff9b9b');
          if (cb) cb(false);
        }
      };
      reader.onerror = () => { Game.log('Не удалось прочитать файл', '#ff9b9b'); if (cb) cb(false); };
      reader.readAsText(f);
    };
    input.click();
  }

  function resetProgress() {
    if (!confirm('Сбросить весь прогресс? Сохранение, летопись и достижения будут удалены.')) return;
    let removed = 0;
    try {
      // все игровые ключи этого приложения
      for (const k of Object.keys(localStorage)) {
        if (k.indexOf('qwe_') === 0) { localStorage.removeItem(k); removed++; }
      }
    } catch (e) {}
    Game.log('Прогресс сброшен (' + removed + ' записей). Перезапуск…', '#ff9b9b');
    setTimeout(() => location.reload(), 600);
  }

  // ---------- экран настроек ----------
  function drawSettings() {
    const s = Settings.data;
    const pct = Math.round(s.volume * 100);
    panelBox.innerHTML = `<span class="close">Esc — закрыть</span><h2>Настройки</h2>
      <div class="setrow">
        <label>Громкость звука</label>
        <input type="range" id="setVol" min="0" max="100" step="5" value="${pct}">
        <span class="setval" id="setVolV">${pct}%</span>
      </div>
      <div class="setrow">
        <label>Масштаб интерфейса</label>
        <input type="range" id="setUi" min="80" max="140" step="5" value="${Math.round(s.uiScale * 100)}">
        <span class="setval" id="setUiV">${Math.round(s.uiScale * 100)}%</span>
      </div>
      <div class="setrow">
        <label>Тряска экрана</label>
        <button class="setbtn" id="setShake">${s.shake ? 'Вкл' : 'Выкл'}</button>
      </div>
      <div class="setrow">
        <label>Эффект дня и ночи</label>
        <button class="setbtn" id="setDn">${s.daynight ? 'Вкл' : 'Выкл'}</button>
      </div>
      <h2 style="margin-top:20px">Сохранение</h2>
      <div class="setbtns">
        <button class="setbtn big" id="setExport">Экспорт в файл</button>
        <button class="setbtn big" id="setImport">Импорт из файла</button>
        <button class="setbtn big danger" id="setReset">Сбросить прогресс</button>
      </div>
      <p class="small">Экспорт сохраняет прогресс, летопись и настройки в один JSON-файл. Импорт заменяет текущие данные.</p>`;

    const $ = id => document.getElementById(id);
    $('setVol').oninput = e => {
      const v = (+e.target.value) / 100;
      $('setVolV').textContent = e.target.value + '%';
      Settings.set('volume', v);
    };
    $('setUi').oninput = e => {
      const v = Math.round((+e.target.value)) / 100;
      $('setUiV').textContent = e.target.value + '%';
      Settings.set('uiScale', v);
    };
    $('setShake').onclick = e => { Settings.set('shake', !s.shake); e.target.textContent = s.shake ? 'Вкл' : 'Выкл'; };
    $('setDn').onclick = e => { Settings.set('daynight', !s.daynight); e.target.textContent = s.daynight ? 'Вкл' : 'Выкл'; };
    $('setExport').onclick = exportSave;
    $('setImport').onclick = () => importSave();
    $('setReset').onclick = resetProgress;
  }

  // патчим панели, если они уже определены
  if (typeof drawPanel === 'function') {
    const _drawPanel = drawPanel;
    drawPanel = function () {
      if (Game.mode === 'settings') return drawSettings();
      return _drawPanel();
    };
  }
  if (typeof panelKey === 'function') {
    const _panelKey = panelKey;
    panelKey = function (code) {
      if (Game.mode === 'settings' && (code === 'Escape' || code === 'KeyO')) return closePanel();
      return _panelKey(code);
    };
  }

  // пункт «Настройки» в главном меню
  if (typeof Menu !== 'undefined') {
    const _show = Menu.show.bind(Menu);
    Menu.show = function () {
      _show();
      if (!this.items.some(it => it[0] === 'Настройки')) {
        this.items.splice(Math.max(0, this.items.length - 1), 0, ['Настройки', () => { Menu.hide(); openPanel('settings'); }]);
        this.draw();
      }
    };
    // Главное меню рисуется при загрузке main.js — до этого патча.
    // Перерисовываем открытое стартовое меню, чтобы пункт появился и в нём.
    try {
      const menuEl = document.getElementById('menu');
      if (typeof Game !== 'undefined' && Game.mode === 'menu' && menuEl && !menuEl.classList.contains('hidden')) Menu.show();
    } catch (e) {}
  }

  console.log('[SETTINGS] загружены: громкость, масштаб UI, тряска, день/ночь, экспорт/импорт/сброс');
})();
