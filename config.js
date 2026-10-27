// ============================================================
// Адрес сервера системы. Менять не нужно.
// ============================================================
// Если страница открыта с домена самой системы (ttms.kz или *.workers.dev),
// адрес берётся из самой страницы — так при переезде на свой домен ничего
// не ломается. Со сторонних хостингов (GitHub Pages, Trello Power-Up)
// используется запасной адрес ниже.
(function () {
  var FALLBACK = "https://trello-3d-viewer.azhanbos.workers.dev";
  var OWN = /(^|\.)ttms\.kz$/i.test(location.hostname) || /\.workers\.dev$/i.test(location.hostname);
  window.WORKER_URL = OWN ? (location.origin) : FALLBACK;
})();

// ============================================================
// ЗАЩИТА ВСЕХ ОКОН РАЗОМ (урок 10.2026, «у Ораза вечное Загрузка…»).
// Этот файл подключается КАЖДЫМ окном системы раньше его собственного кода,
// поэтому исправления здесь действуют везде сразу.
// 1) Trello не отвечает на запрос «участники рабочего пространства» человеку,
//    который не состоит в пространстве (только в доске) — запрос висит вечно,
//    и окно навсегда остаётся на «Загрузка…». Ограничиваем его 1,5 секунды.
// 2) Окна сами сообщают о сбоях на сервер (видно в «Здоровье системы»):
//    ошибки скриптов, ответы сервера 5xx, обрывы связи, «Загрузка…» дольше 20 с.
// ============================================================
(function () {
  var MODULE = (location.pathname.split('/').pop() || '?');
  var MEMBER = '';
  var sent = 0, origFetch = window.fetch ? window.fetch.bind(window) : null;
  function report(kind, msg) {
    try {
      if (window.__msReport) { window.__msReport(kind, msg); return; }   // своя доска: у прослойки свой отчёт
      if (!origFetch || sent >= 5) return; sent++;
      origFetch(window.WORKER_URL + '/client-error', { method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ module: MODULE, kind: kind, msg: String(msg || '').slice(0, 300), memberId: MEMBER }) }).catch(function () {});
    } catch (e) {}
  }
  window.__msCfgReport = report;
  window.addEventListener('error', function (e) { report('error', (e && e.message || '') + ' @' + (e && e.lineno || '')); });
  window.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; report('error', 'promise: ' + (r && r.message || r)); });

  // запросы к серверу: обрыв или 5xx — в отчёт (только для нашего сервера)
  if (origFetch && !window.__msCfgFetch) {
    window.__msCfgFetch = 1;
    var wf = window.fetch;
    window.fetch = function (input, init) {
      var u = (typeof input === 'string') ? input : (input && input.url) || '';
      var ours = u.indexOf(window.WORKER_URL) === 0 || u.charAt(0) === '/';
      var p = wf(input, init);
      if (!ours || u.indexOf('/client-error') >= 0) return p;
      var path = u.replace(window.WORKER_URL, '').split('?')[0];
      return p.then(function (r) { if (r && r.status >= 500) report('http', path + ' → HTTP ' + r.status); return r; },
        function (e) { report('http', path + ' → нет связи: ' + (e && e.message || e)); throw e; });
    };
  }

  // Trello: ограничение по времени на «участников пространства» + запоминаем, кто открыл окно
  function patchTrello() {
    var TP = window.TrelloPowerUp;
    if (!TP || !TP.iframe || TP.__msPatched) return;
    TP.__msPatched = 1;
    var orig = TP.iframe;
    TP.iframe = function () {
      var t = orig.apply(TP, arguments);
      try {
        var org = t.organization;
        if (typeof org === 'function') {
          t.organization = function () {
            var p = org.apply(t, arguments);
            return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('organization: нет ответа')); }, 1500); })]);
          };
        }
        if (typeof t.member === 'function') t.member('id').then(function (m) { MEMBER = (m && m.id) || ''; }).catch(function () {});
      } catch (e) {}
      return t;
    };
  }
  patchTrello();

  // сторож: окно 20 с показывает только «Загрузка…» — сообщаем
  setTimeout(function () {
    try {
      var tx = (document.body && document.body.innerText || '').trim();
      if (tx.length < 80 && /Загрузк/.test(tx)) report('stuck', 'висит «Загрузка…» 20 с');
    } catch (e) {}
  }, 20000);
})();
