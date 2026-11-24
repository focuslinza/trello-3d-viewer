// ============================================================================
// ОКНО «ВНЕСТИ ОПЛАТУ» (решение Асхата, 11.2026) — одно на все окна системы
// (Бухгалтерия, окно счёта, просмотр счёта).
// Отметка «оплачен» вносится суммой: сколько, когда, каким способом и куда.
// Показывает сумму заказа, уже внесённые оплаты, остаток и остаток ПОСЛЕ этой оплаты.
// Оплату, внесённую не учредителем, подтверждает учредитель; в работу — от 50% подтверждённой.
// Использование: openPayDialog({ cardId, title, onDone: function(summary){…} })
// summary = { total, paidSum, rest, paidFlag, payments:[…], moved, moveReason }
// ============================================================================
(function () {
  var W = function () { return (window.CONFIG && window.CONFIG.WORKER_URL) || window.WORKER_URL || ''; };
  var METHODS = [
    ['cash', 'Наличные'],
    ['person', 'Перевод физлицу'],
    ['ip', 'Счёт ИП «MetalShop»'],
    ['too', 'Счёт ТОО «TTMS»'],
    ['firdaus', 'Счёт ИП «FIRDAUS»']
  ];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { n = Math.round((+n || 0) * 100) / 100; var s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return s; }
  // ПОДТВЕРЖДЕНИЕ УЧРЕДИТЕЛЕМ (07.11.2026): сервер узнаёт учредителя по личному токену.
  // На своей доске он уже есть; в окнах Trello — один раз вставить свою личную ссылку.
  // ВХОД ЧЕРЕЗ TRELLO (решение Асхата, 11.11.2026): учредитель и бухгалтер один раз нажимают
  // «Разрешить» в окне Trello; дальше сервер сам проверяет у Trello, кто подтверждает оплату.
  var TT = { started: false, api: null, tok: null, mid: null, ready: Promise.resolve() };
  function ttInit() {
    if (TT.started) return; TT.started = true;
    try {
      if (window.__msMemberId) TT.mid = window.__msMemberId;
      if (!(window.TrelloPowerUp && window.parent !== window)) return;
      // аккаунт Trello, под которым открыто окно, — по нему сервер узнаёт учредителя и бухгалтера
      try { window.TrelloPowerUp.iframe().member('id').then(function (m) { if (m && m.id) TT.mid = m.id; }).catch(function () {}); } catch (e) {}
      TT.ready = fetch(W() + '/trello-app-key').then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.key) return;
        try {
          TT.api = window.TrelloPowerUp.iframe({ appKey: j.key, appName: 'MetalShop MES' }).getRestApi();
          return TT.api.getToken().then(function (t) { TT.tok = t || null; }).catch(function () {});
        } catch (e) { TT.api = null; }
      }).catch(function () {});
    } catch (e) {}
  }
  function ttLogin() {
    if (!TT.api) return Promise.reject(new Error('Вход через Trello недоступен в этом окне'));
    return TT.api.authorize({ scope: 'read', expiration: 'never' }).then(function () { return TT.api.getToken(); }).then(function (t) { TT.tok = t || null; return TT.tok; });
  }
  function TOK() { try { return localStorage.getItem('ms_board_token') || ''; } catch (e) { return ''; } }
  // кто открыл окно: своё окно Trello, либо родительское окно того же сайта (счёт внутри
  // «Бухгалтерии» открыт во вложенной рамке — там Trello не отвечает, а родитель знает)
  function upMid() {
    var w = window;
    for (var i = 0; i < 4; i++) {
      try { if (w.__msMemberId) return w.__msMemberId; } catch (e) { return ''; }
      if (!w.parent || w.parent === w) break;
      w = w.parent;
    }
    return '';
  }
  function hdr() { var h = { 'Content-Type': 'application/json' }; var t = TOK(); if (t) h['X-MS-Token'] = t; if (TT.tok) h['X-Trello-Token'] = TT.tok; var mid = TT.mid || upMid(); if (mid) h['X-Trello-Member'] = mid; return h; }
  function askFounderLink() {
    var v = prompt('Подтверждать оплаты может только учредитель или бухгалтер.\n\nВставьте свою личную ссылку входа (из «Зарплата» → 📱, или ссылку своей доски). Это нужно сделать один раз на этом компьютере.');
    if (!v) return false;
    var m = String(v).match(/(?:#mt=|[?&]token=|[?&]bt=)([A-Za-z0-9]{16,})/) || String(v).trim().match(/^([A-Za-z0-9]{16,})$/);
    if (!m) { alert('Не нашёл в ссылке ключ входа. Скопируйте ссылку целиком.'); return false; }
    try { localStorage.setItem('ms_board_token', m[1]); } catch (e) { alert('Браузер не дал сохранить ключ.'); return false; }
    return true;
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function css() {
    if (document.getElementById('payDlgCss')) return;
    var st = document.createElement('style'); st.id = 'payDlgCss';
    st.textContent =
      '.pdl-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:300;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 12px}' +
      '.pdl{background:var(--bg,#1d2125);border:1px solid var(--line,#3a414a);border-radius:12px;max-width:560px;width:100%;padding:18px 20px;color:var(--txt,#dee4ea);font-size:13.5px;box-shadow:0 10px 40px rgba(0,0,0,.5)}' +
      '.pdl h3{margin:0 0 4px;font-size:16px}.pdl .sub{color:var(--muted,#9fadbc);font-size:12.5px;margin-bottom:12px}' +
      '.pdl .kp{display:flex;gap:10px;margin-bottom:12px}.pdl .kp div{flex:1;background:var(--bg2,#22272b);border:1px solid var(--line,#3a414a);border-radius:8px;padding:8px 10px}' +
      '.pdl .kp b{display:block;font-size:17px;margin-top:2px}.pdl .kp span{font-size:11px;color:var(--muted,#9fadbc);text-transform:uppercase;letter-spacing:.3px}' +
      '.pdl table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12.5px}.pdl td{padding:5px 6px;border-bottom:1px solid var(--line,#3a414a)}' +
      '.pdl tr.vd td{color:var(--muted,#9fadbc);text-decoration:line-through}' +
      '.pdl .lbl{font-size:11px;color:var(--muted,#9fadbc);text-transform:uppercase;letter-spacing:.3px;margin:8px 0 4px}' +
      '.pdl input[type=text],.pdl input[type=date],.pdl input[type=number]{width:100%;box-sizing:border-box;padding:8px 10px;background:var(--bg2,#22272b);border:1px solid var(--line,#3a414a);border-radius:8px;color:inherit;font-size:14px}' +
      '.pdl .ms{display:flex;flex-wrap:wrap;gap:6px}.pdl .ms span{padding:7px 11px;border:1px solid var(--line,#3a414a);border-radius:8px;cursor:pointer;background:var(--bg2,#22272b)}' +
      '.pdl .ms span.on{border-color:#579dff;background:#274469;color:#cfe1ff}' +
      '.pdl .row2{display:flex;gap:10px}.pdl .row2>div{flex:1}' +
      '.pdl .after{margin-top:10px;padding:8px 10px;border-radius:8px;background:var(--bg2,#22272b)}' +
      '.pdl .bar2{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:14px}' +
      // кнопки «Закрыть» нет (решение Асхата, 24.11.2026): окно закрывается щелчком вне его или Esc; на телефоне кнопка остаётся
      '@media (min-width:641px){.pdl #pdC,.pdl #ipC{display:none}}' +
      '.pdl .b{padding:8px 14px;border-radius:8px;border:1px solid var(--line,#3a414a);background:var(--bg2,#22272b);color:inherit;cursor:pointer;font-size:13.5px}' +
      '.pdl .b.pr{background:#1f6ce8;border-color:#1f6ce8;color:#fff}.pdl .b:disabled{opacity:.6;cursor:default}' +
      '.pdl .x{background:none;border:none;color:var(--muted,#9fadbc);cursor:pointer;font-size:14px}.pdl .x:hover{color:#f87168}' +
      '.pdl .err{color:#f87168;margin-right:auto;font-size:12.5px}';
    document.head.appendChild(st);
  }
  // плашка «ждут подтверждения» для Бухгалтерии: renderPendingPayments(el, onChange)
  window.renderPendingPayments = function (el, onChange) {
    if (!el) return;
    fetch(W() + '/payments-pending').then(function (r) { return r.json(); }).then(function (j) {
      var rows = (j && j.rows) || [], lab = (j && j.labeled) || [];
      if (!rows.length && !lab.length) { el.innerHTML = ''; return; }
      function btn(cardId, number, name) {
        return '<button type="button" data-pcard="' + esc(cardId) + '" data-ptitle="' + esc((number ? '№' + number + ' ' : '') + String(name || '').slice(0, 40)) + '" style="padding:4px 10px;border-radius:7px;border:1px solid #2e5c44;background:#1c3329;color:#4bce97;cursor:pointer;font-size:12.5px">Оплата</button>';
      }
      el.innerHTML = '<div style="margin:8px 0 12px;padding:10px 12px;border:1px solid #5a4a2a;background:#2b2516;border-radius:10px">' +
        '<b style="color:#e8c07d">⏳ Оплаты ждут подтверждения (учредитель или бухгалтер): ' + (rows.length + lab.length) + '</b>' +
        '<div style="font-size:12px;color:var(--muted,#9fadbc);margin:2px 0 6px">Пока оплата не подтверждена, она не считается и заказ в работу не идёт.</div>' +
        rows.map(function (r) {
          return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-top:1px solid #3a3322;font-size:13px">' +
            '<span style="flex:1">' + (r.number ? '№' + esc(r.number) + ' · ' : '') + esc(String(r.name || '').slice(0, 60)) + ' — <b>' + money(r.amount) + ' ₸</b> · ' + esc(r.method) + (r.person ? ' (' + esc(r.person) + ')' : '') +
            ' <span style="color:var(--muted,#9fadbc)">· ' + esc(r.date) + (r.by ? ' · внёс ' + esc(r.by) : '') + '</span></span>' + btn(r.cardId, r.number, r.name) + '</div>';
        }).join('') +
        lab.map(function (r) {
          return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-top:1px solid #3a3322;font-size:13px">' +
            '<span style="flex:1">' + (r.number ? '№' + esc(r.number) + ' · ' : '') + esc(String(r.name || '(нет расчёта)').slice(0, 60)) +
            ' — <b style="color:#f87168">метка «' + esc(r.label || 'Оплата есть') + '», сумма не внесена</b>' +
            (r.total ? ' · заказ ' + money(r.total) + ' ₸' : '') + (r.noCalc && r.name ? ' · <span style="color:#e2b203">нет расчёта</span>' : '') + (r.legacy ? ' · старая отметка «оплачен»' : '') +
            ' <span style="color:var(--muted,#9fadbc)">' + (r.by ? '· метку поставил ' + esc(r.by) : '') + (r.at ? ' · ' + esc(r.at) : '') + '</span></span>' + btn(r.cardId, r.number, r.name) + '</div>';
        }).join('') + '</div>';
      [].forEach.call(el.querySelectorAll('[data-pcard]'), function (b) {
        b.onclick = function () { window.openPayDialog({ cardId: b.getAttribute('data-pcard'), title: b.getAttribute('data-ptitle'), onDone: function () { window.renderPendingPayments(el, onChange); if (onChange) onChange(); } }); };
      });
    }).catch(function () { el.innerHTML = ''; });
  };
  window.openPayDialog = function (opts) {
    css(); ttInit();
    var cardId = opts.cardId, S = null, method = '', busy = false;
    var ov = document.createElement('div'); ov.className = 'pdl-ov';
    ov.innerHTML = '<div class="pdl"><div class="sub">Загрузка оплат…</div></div>';
    document.body.appendChild(ov);
    function toast(msg, warn) {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;padding:10px 18px;border-radius:8px;font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);background:' + (warn ? '#533f04;color:#f5cd47' : '#1c3329;color:#4bce97') + ';border:1px solid ' + (warn ? '#7f5f01' : '#2e5c44');
      document.body.appendChild(t); setTimeout(function () { t.remove(); }, warn ? 6000 : 3000);
    }
    // silent — окно не закрыто, а сменилось другим (оплата по всему счёту): onClose не зовём, иначе окно-хозяин закроется вместе с новым окном
    function close(silent) { ov.remove(); document.removeEventListener('keydown', onKey); if (!silent && opts.onClose) try { opts.onClose(); } catch (x) {} }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    function draw() {
      // ЯСНО, ЗА ЧТО ОПЛАТА (решение Асхата, 19.11.2026): один заказ / счёт с одним заказом / счёт с несколькими
      var multi = S.invoiceNumber && S.invoiceOrders > 1;
      var h = '<h3>Оплата одного заказа' + (opts.title ? ' · ' + esc(opts.title) : '') + '</h3>' +
        '<div class="sub">' + (S.invoiceNumber ? (multi ? 'Заказ входит в счёт № ' + esc(S.invoiceNumber) + ' вместе с другими (' + S.invoiceOrders + ' заказов в счёте). Здесь оплата зачтётся <b>только этому заказу</b>.'
            : 'Счёт № ' + esc(S.invoiceNumber) + ' — в нём только этот заказ, оплата заказа и есть оплата счёта.') : 'Счёт по заказу ещё не выставлен — сумма берётся из расчёта.') + '</div>' +
        (multi ? '<div style="margin:-4px 0 10px"><button class="b" id="pdToInv" type="button" style="border-color:#1f845a;color:#4bce97">₸ Внести оплату по всему счёту № ' + esc(S.invoiceNumber) + '</button></div>' : '') +
        '<div class="kp"><div><span>' + (S.byInvoice ? 'Сумма по счёту' : 'Сумма заказа') + '</span><b>' + money(S.total) + ' ₸</b>' + (S.byInvoice ? '<div style="font-size:11.5px;color:#9fadbc">с налогом · расчёт ' + money(S.calcTotal) + ' ₸</div>' : '') + '</div>' +
        '<div><span>Оплачено (подтв.)</span><b style="color:#4bce97">' + money(S.paidSum) + ' ₸</b>' + (S.pendingSum > 0 ? '<div style="font-size:11.5px;color:#e8c07d">+ ' + money(S.pendingSum) + ' ₸ ждёт подтв.</div>' : '') + '</div>' +
        '<div><span>Остаток</span><b style="color:' + (S.rest > 0 ? '#e8c07d' : '#4bce97') + '">' + money(S.rest) + ' ₸</b></div></div>';
      // В РАБОТУ — ТОЛЬКО ПРИ ОПЛАТЕ ОТ 50% (решение Асхата, 07.11.2026)
      if (S.total > 0 && !S.pastGate) {
        var _min = 0.5, _paid = (S.payments || []).length ? S.paidSum : (S.paidFlag ? S.total : 0), _pct = Math.round(_paid / S.total * 100);
        var _need = Math.max(0, Math.ceil(S.total * _min - _paid));
        h += _need > 0
          ? '<div style="margin:8px 0;padding:8px 10px;border-radius:8px;background:#3a2226;color:#f3b3b3;font-size:13px">⛔ Пока в работу нельзя: подтверждено ' + _pct + '%. В работу — после подтверждённой оплаты от 50% суммы (от ' + money(Math.ceil(S.total * _min)) + ' ₸).' + (S.pendingSum > 0 ? ' Внесённые, но не подтверждённые оплаты не считаются — их подтверждает учредитель или бухгалтер.' : '') + '</div>'
          : '<div style="margin:8px 0;padding:8px 10px;border-radius:8px;background:#1c3329;color:#4bce97;font-size:13px">✓ Оплачено ' + _pct + '% — заказ можно запускать в работу.</div>';
      }
      var pays = S.payments || [];
      var hasPend = pays.some(function (p) { return !p.voided && !p.confirmed; });
      if (false && hasPend && TT.api && !TT.tok) h += '<div style="margin:6px 0 8px;font-size:12.5px;color:var(--muted,#9fadbc)">Подтверждают учредитель и бухгалтер. <button class="b" id="pdTT" type="button" style="padding:3px 9px;font-size:12px">🔑 Войти через Trello</button> — один раз на этом компьютере.</div>';
      if (pays.length) {
        h += '<table>';
        pays.forEach(function (p) {
          h += '<tr class="' + (p.voided ? 'vd' : '') + '"><td>' + esc(p.date) + '</td><td style="text-align:right;white-space:nowrap">' + money(p.amount) + ' ₸</td>' +
            '<td>' + esc(p.methodLabel) + (p.person ? ' — ' + esc(p.person) : '') + (p.note ? '<div style="color:var(--muted,#9fadbc)">' + esc(p.note) + '</div>' : '') + '</td>' +
            '<td style="color:var(--muted,#9fadbc)">' + esc(p.by || '') + (p.voided ? '<div>отменена' + (p.voidBy ? ': ' + esc(p.voidBy) : '') + '</div>'
              : (p.confirmed ? (p.confirmedBy && p.confirmedBy !== 'авто' ? '<div style="color:#4bce97">✓ подтвердил ' + esc(p.confirmedBy) + '</div>' : '')
                : '<div style="color:#e8c07d">⏳ ждёт подтверждения</div><button class="b" data-conf="' + p.id + '" style="padding:3px 8px;font-size:12px;margin-top:3px;border-color:#2e5c44;color:#4bce97">✓ Подтвердить</button>')) + '</td>' +
            '<td style="width:24px">' + (p.voided || p.method === 'bank' ? '' : '<button class="x" data-void="' + p.id + '" title="Отменить эту оплату">✕</button>') + '</td></tr>';
        });
        h += '</table>';
      } else if (S.paidFlag) {
        h += '<div class="sub" style="color:#e8c07d">Заказ отмечен «оплачен» раньше, без суммы — <b>не подтверждён</b>. Учредитель или бухгалтер: сверьте с банком и подтвердите, либо внесите оплату с суммой и способом.</div>' +
          '<div style="margin:-4px 0 10px"><button class="b" id="pdLegacy" type="button" style="border-color:#2e5c44;color:#4bce97">✓ Подтвердить: оплачено полностью (' + money(S.total) + ' ₸)</button></div>';
      }
      h += '<div class="row2"><div><div class="lbl">Сумма, ₸ *</div><input type="number" id="pdA" min="0" step="any" value="' + ((S.rest - (S.pendingSum || 0)) > 0 ? Math.round((S.rest - (S.pendingSum || 0)) * 100) / 100 : '') + '"></div>' +
        '<div><div class="lbl">Дата оплаты</div><input type="date" id="pdD" value="' + today() + '"></div></div>' +
        '<div class="lbl">Способ и куда *</div><div class="ms">' +
        METHODS.map(function (m) { return '<span data-m="' + m[0] + '" class="' + (method === m[0] ? 'on' : '') + '">' + esc(m[1]) + '</span>'; }).join('') + '</div>' +
        '<div id="pdPw" style="display:' + (method === 'person' ? '' : 'none') + '"><div class="lbl">Кому перевели *</div><input type="text" id="pdP" placeholder="Например: Асхат (Kaspi)"></div>' +
        '<div class="lbl">Примечание</div><input type="text" id="pdN" placeholder="необязательно">' +
        '<div class="after" id="pdAfter"></div>' +
        '<div class="bar2"><span class="err" id="pdE"></span><button class="b" id="pdC" type="button">Закрыть</button><button class="b pr" id="pdOk" type="button">Внести оплату</button></div>';
      ov.firstChild.innerHTML = h;
      var a = ov.querySelector('#pdA');
      function after() {
        var v = +a.value || 0, r = Math.round((S.total - S.paidSum - (S.pendingSum || 0) - v) * 100) / 100, el = ov.querySelector('#pdAfter');
        if (!(v > 0)) { el.style.display = ''; el.innerHTML = '<span style="color:var(--muted,#9fadbc)">Введите сумму оплаты.</span>'; return; }
        el.innerHTML = r > 0 ? 'После этой оплаты: <b>частично</b>, остаток <b style="color:#e8c07d">' + money(r) + ' ₸</b>. ' + ((S.paidSum + (S.pendingSum || 0) + v) >= S.total * 0.5 ? 'В работу — после подтверждения учредителем.' : 'Меньше 50% — в работу нельзя.')
          : (r < 0 ? 'После этой оплаты: <b style="color:#4bce97">полностью</b>, переплата <b style="color:#f87168">' + money(-r) + ' ₸</b> — проверьте сумму.'
            : '');   // «оплачен полностью» не пишем — это и так видно по остатку (решение Асхата, 24.11.2026)
        el.style.display = el.innerHTML ? '' : 'none';
      }
      a.oninput = after; after(); a.focus(); a.select();
      var toInv = ov.querySelector('#pdToInv');
      if (toInv) toInv.onclick = function () { close(true); window.openInvoicePay({ number: S.invoiceNumber, cardId: cardId, title: opts.title, onDone: opts.onDone, onClose: opts.onClose }); };
      [].forEach.call(ov.querySelectorAll('[data-m]'), function (el) {
        el.onclick = function () {
          method = el.getAttribute('data-m');
          [].forEach.call(ov.querySelectorAll('[data-m]'), function (x) { x.classList.toggle('on', x === el); });
          ov.querySelector('#pdPw').style.display = method === 'person' ? '' : 'none';
          if (method === 'person') ov.querySelector('#pdP').focus();
        };
      });
      ov.querySelector('#pdC').onclick = close;
      var lgb = ov.querySelector('#pdLegacy');
      if (lgb) lgb.onclick = function () {
        // способ оплаты обязателен (решение Асхата, 16.11.2026)
        var e = ov.querySelector('#pdE'), person = ((ov.querySelector('#pdP') || {}).value || '').trim();
        if (!method) { if (e) e.textContent = 'Сначала выберите способ оплаты ниже — без него оплату подтвердить нельзя'; return; }
        if (method === 'person' && !person) { if (e) e.textContent = 'Укажите, кому перевели'; ov.querySelector('#pdP').focus(); return; }
        if (!confirm('Подтвердить, что заказ оплачен полностью: ' + money(S.total) + ' ₸?')) return;
        post('/order-payment-legacy-confirm', { cardId: cardId, method: method, person: person });
      };
      var ttb = ov.querySelector('#pdTT');
      if (ttb) ttb.onclick = function () {
        ttLogin().then(function () { draw(); }).catch(function (x) { var e = ov.querySelector('#pdE'); if (e) e.textContent = 'Вход через Trello не выполнен: ' + (x && x.message || x || 'отменён'); });
      };
      [].forEach.call(ov.querySelectorAll('[data-conf]'), function (b) {
        b.onclick = function () {
          var p = (S.payments || []).filter(function (x) { return String(x.id) === b.getAttribute('data-conf'); })[0];
          if (!p || !confirm('Подтвердить, что деньги получены: ' + money(p.amount) + ' ₸ (' + p.methodLabel + (p.person ? ' — ' + p.person : '') + ')?')) return;
          if (!(TT.mid || window.__msMemberId) && !TT.tok && !TOK() && !askFounderLink()) return;
          post('/order-payment-confirm', { id: p.id });
        };
      });
      [].forEach.call(ov.querySelectorAll('[data-void]'), function (b) {
        b.onclick = function () {
          var p = (S.payments || []).filter(function (x) { return String(x.id) === b.getAttribute('data-void'); })[0];
          if (!p || !confirm('Отменить оплату ' + money(p.amount) + ' ₸ (' + p.methodLabel + ')?\nЗапись останется в истории как отменённая.')) return;
          post('/order-payment-void', { id: p.id });
        };
      });
      ov.querySelector('#pdOk').onclick = function () {
        var e = ov.querySelector('#pdE'), v = +a.value || 0, person = (ov.querySelector('#pdP').value || '').trim();
        if (!(v > 0)) { e.textContent = 'Укажите сумму'; a.focus(); return; }
        if (!method) { e.textContent = 'Выберите способ оплаты'; return; }
        if (method === 'person' && !person) { e.textContent = 'Укажите, кому перевели'; ov.querySelector('#pdP').focus(); return; }
        if (S.paidSum + v > S.total * 1.001 && S.total > 0 && !confirm('Сумма больше остатка (' + money(S.rest) + ' ₸). Всё равно внести?')) return;
        post('/order-payment-add', { cardId: cardId, amount: v, method: method, person: person, date: ov.querySelector('#pdD').value, note: ov.querySelector('#pdN').value });
      };
    }
    function post(path, body) {
      if (busy) return; busy = true;
      var e = ov.querySelector('#pdE'); if (e) e.textContent = 'Сохраняю…';
      var ok = ov.querySelector('#pdOk'); if (ok) ok.disabled = true;
      fetch(W() + path, { method: 'POST', headers: hdr(), body: JSON.stringify(body) })
        .then(function (r) { return r.json(); }).then(function (j) {
          busy = false;
          if (j && j.protected && path.indexOf('confirm') >= 0 && !TT.tok && !(TT.mid || window.__msMemberId)) {
            // ключ не подошёл (или его нет) — спросить ссылку учредителя и повторить один раз
            try { localStorage.removeItem('ms_board_token'); } catch (x) {}
            if (!body.__retry && askFounderLink()) { body.__retry = 1; if (ok) ok.disabled = false; return post(path, body); }
          }
          if (!j || !j.ok) throw new Error((j && j.error) || 'сервер не подтвердил');
          S = j; method = '';
          if (opts.onDone) try { opts.onDone(j); } catch (x) {}
          if (path.indexOf('void') < 0 && path.indexOf('confirm') < 0) {
            // внесли оплату — окно закрываем само, итог показываем коротким сообщением
            var warn = j.pendingConfirm || j.belowGate;
            close(); toast(j.pendingConfirm ? 'Оплата внесена — ждёт подтверждения учредителя или бухгалтера' : j.belowGate ? 'Оплата внесена, но меньше ' + ((j.gate && j.gate.minPct) || 50) + '% — в работу нельзя' : j.moveReason === 'wait-calc' ? 'Оплата внесена. В производство карточка уйдёт сама, когда её перенесут в «Расчет сделан»' : j.moveReason === 'no-invoice' ? 'Оплата внесена. В производство карточка уйдёт сама, когда будет отправлен счёт на оплату' : j.moveReason === 'no-calc' ? 'Оплата внесена. В производство карточка не уйдёт, пока нет расчёта' : j.movedTo ? '✓ Оплата внесена — заказ оплачен на 100%, карточка перешла в «' + j.movedTo + '»' : j.moved ? '✓ Оплата внесена — карточка перешла в «В производстве»' : '✓ Оплата внесена', warn || /^(wait-calc|no-invoice|no-calc)$/.test(j.moveReason || ''));
            return;
          }
          draw();
          var e2 = ov.querySelector('#pdE'); if (e2) { e2.style.color = '#4bce97'; e2.textContent = path.indexOf('void') >= 0 ? 'Оплата отменена' : path.indexOf('confirm') >= 0 ? ('✓ Оплата подтверждена' + (j.gate && j.gate.checked && !j.gate.ok ? ', но подтверждено меньше 50% — в работу нельзя' : '')) : (j.pendingConfirm ? 'Оплата внесена — ждёт подтверждения учредителя или бухгалтера' : j.belowGate ? 'Оплата внесена, но меньше 50% — в работу нельзя' : '✓ Оплата внесена'); if (j.belowGate || j.pendingConfirm || (j.gate && j.gate.checked && !j.gate.ok)) e2.style.color = '#e8c07d'; }
        }).catch(function (x) { busy = false; if (ok) ok.disabled = false; if (e) { e.style.color = ''; e.textContent = 'Ошибка: ' + (x && x.message || x); } });
    }
    fetch(W() + '/order-payments?cardId=' + encodeURIComponent(cardId)).then(function (r) {
      if (r.status === 404) throw new Error('на сервере нет учёта оплат — обновите сервер (worker.js)');
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'сервер не ответил');
      S = j; draw(); TT.ready.then(function () { if (ov.parentNode && !busy) draw(); });
    }).catch(function (x) {
      ov.firstChild.innerHTML = '<h3>Оплата заказа</h3><div class="err" style="margin:10px 0">Не удалось загрузить: ' + esc(x && x.message || x) + '</div><div class="bar2"><button class="b" id="pdC" type="button">Закрыть</button></div>';
      ov.querySelector('#pdC').onclick = close;
    });
  };
  // ============================================================
  //  ОПЛАТА ПО СЧЁТУ НА НЕСКОЛЬКО ЗАКАЗОВ (решение Асхата, 19.11.2026): сумма вносится один раз
  //  по счёту и сама делится между его заказами. Счёт с одним заказом — прежнее окно заказа.
  //  openInvoicePay({ number, cardId, title, onDone })
  window.openInvoicePay = function (opts) {
    css(); ttInit();
    fetch(W() + '/invoice-payment?number=' + encodeURIComponent(opts.number) + (opts.cardId ? '&cardId=' + encodeURIComponent(opts.cardId) : ''), { headers: hdr() }).then(function (r) { return r.json(); }).then(function (S) {
      if (!S || !S.ok || !S.orders || S.orders.length < 2) { window.openPayDialog({ cardId: opts.cardId || (S && S.orders && S.orders[0] && S.orders[0].cardId), title: opts.title, onDone: opts.onDone, onClose: opts.onClose }); return; }
      invDlg(S);
    }).catch(function () { window.openPayDialog({ cardId: opts.cardId, title: opts.title, onDone: opts.onDone, onClose: opts.onClose }); });
    function invDlg(S) {
      var method = '', busy = false;
      var ov = document.createElement('div'); ov.className = 'pdl-ov'; ov.innerHTML = '<div class="pdl"></div>'; document.body.appendChild(ov);
      function close(silent) { ov.remove(); document.removeEventListener('keydown', onKey); if (!silent && opts.onClose) try { opts.onClose(); } catch (x) {} }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
      function toast(msg, warn) {
        var t = document.createElement('div'); t.textContent = msg;
        t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;padding:10px 18px;border-radius:8px;font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);background:' + (warn ? '#533f04;color:#f5cd47' : '#1c3329;color:#4bce97') + ';border:1px solid ' + (warn ? '#7f5f01' : '#2e5c44');
        document.body.appendChild(t); setTimeout(function () { t.remove(); }, warn ? 6000 : 3500);
      }
      function draw() {
        var h = '<h3>Оплата всего счёта № ' + esc(S.number) + ' · ' + S.orders.length + ' заказов' + (opts.title ? ' · ' + esc(opts.title) : '') + '</h3>' +
          '<div class="sub">Внесите сумму платежа одной цифрой — она сама разделится между заказами счёта по их остаткам. Оплата одного заказа отдельно — кнопка «⋯» в его строке.</div>' +
          '<div class="kp"><div><span>Сумма по счёту</span><b>' + money(S.total) + ' ₸</b></div>' +
          '<div><span>Оплачено (подтв.)</span><b style="color:#4bce97">' + money(S.paidSum) + ' ₸</b>' + (S.pendingSum > 0 ? '<div style="font-size:11.5px;color:#e8c07d">+ ' + money(S.pendingSum) + ' ₸ ждёт подтв.</div>' : '') + '</div>' +
          '<div><span>Остаток</span><b style="color:' + (S.rest > 0 ? '#e8c07d' : '#4bce97') + '">' + money(S.rest) + ' ₸</b></div></div>' +
          '<table><tr style="color:var(--muted,#9fadbc)"><td>Заказ</td><td style="text-align:right">По счёту</td><td style="text-align:right">Оплачено</td><td style="text-align:right">Остаток</td><td></td></tr>' +
          S.orders.map(function (o) {
            return '<tr><td>' + (o.number ? '<b>#' + esc(o.number) + '</b> ' : '') + esc(String(o.name || '').slice(0, 46)) + '</td><td style="text-align:right;white-space:nowrap">' + money(o.total) + '</td><td style="text-align:right;white-space:nowrap;color:#4bce97">' + money(o.paid + o.pending) + '</td><td style="text-align:right;white-space:nowrap">' + money(o.rest) + '</td>' +
              '<td style="text-align:right"><button class="x" type="button" data-one="' + esc(o.cardId) + '" title="Оплаты этого заказа: посмотреть, отменить, внести отдельно">⋯</button></td></tr>';
          }).join('') + '</table>';
        if (!(S.rest > 0)) {
          h += '<div style="margin:8px 0;padding:8px 10px;border-radius:8px;background:#1c3329;color:#4bce97;font-size:13px">✓ Счёт оплачен полностью.</div><div class="bar2"><button class="b" id="ipC" type="button">Закрыть</button></div>';
          ov.firstChild.innerHTML = h; ov.querySelector('#ipC').onclick = close; wireOne(); return;
        }
        h += '<div class="row2"><div><div class="lbl">Сумма платежа, ₸ *</div><input type="number" id="ipA" min="0" step="any" value="' + Math.round(S.rest * 100) / 100 + '"></div>' +
          '<div><div class="lbl">Дата оплаты</div><input type="date" id="ipD" value="' + today() + '"></div></div>' +
          '<div class="lbl">Способ и куда *</div><div class="ms">' + METHODS.map(function (m) { return '<span data-m="' + m[0] + '" class="' + (method === m[0] ? 'on' : '') + '">' + esc(m[1]) + '</span>'; }).join('') + '</div>' +
          '<div id="ipPw" style="display:' + (method === 'person' ? '' : 'none') + '"><div class="lbl">Кому перевели *</div><input type="text" id="ipP" placeholder="Например: Асхат (Kaspi)"></div>' +
          '<div class="lbl">Примечание</div><input type="text" id="ipN" placeholder="необязательно">' +
          '<div class="after" id="ipAfter"></div>' +
          '<div class="bar2"><span class="err" id="ipE"></span><button class="b" id="ipC" type="button">Закрыть</button><button class="b pr" id="ipOk" type="button">Внести оплату по счёту</button></div>';
        ov.firstChild.innerHTML = h;
        var a = ov.querySelector('#ipA');
        function after() {
          var v = +a.value || 0, r = Math.round((S.rest - v) * 100) / 100, el = ov.querySelector('#ipAfter');
          if (!(v > 0)) { el.innerHTML = '<span style="color:var(--muted,#9fadbc)">Введите сумму платежа.</span>'; return; }
          el.innerHTML = r > 0.5 ? 'После этой оплаты по счёту останется <b style="color:#e8c07d">' + money(r) + ' ₸</b>.' : (r < -0.5 ? '<b style="color:#f87168">Сумма больше остатка по счёту на ' + money(-r) + ' ₸</b> — уменьшите.' : 'После этой оплаты счёт <b style="color:#4bce97">оплачен полностью</b>.');
        }
        a.oninput = after; after(); a.focus(); a.select();
        [].forEach.call(ov.querySelectorAll('[data-m]'), function (el) { el.onclick = function () { method = el.getAttribute('data-m'); [].forEach.call(ov.querySelectorAll('[data-m]'), function (x) { x.classList.toggle('on', x === el); }); ov.querySelector('#ipPw').style.display = method === 'person' ? '' : 'none'; }; });
        ov.querySelector('#ipC').onclick = close; wireOne();
        ov.querySelector('#ipOk').onclick = function () {
          var e = ov.querySelector('#ipE'), v = +a.value || 0, person = (ov.querySelector('#ipP').value || '').trim(), ok = this;
          if (busy) return;
          if (!(v > 0)) { e.textContent = 'Укажите сумму'; a.focus(); return; }
          if (!method) { e.textContent = 'Выберите способ оплаты'; return; }
          if (method === 'person' && !person) { e.textContent = 'Укажите, кому перевели'; return; }
          busy = true; ok.disabled = true; e.style.color = ''; e.textContent = 'Сохраняю…';
          fetch(W() + '/invoice-payment', { method: 'POST', headers: hdr(), body: JSON.stringify({ number: S.number, cardId: opts.cardId || (S.orders[0] && S.orders[0].cardId) || '', amount: v, method: method, person: person, date: ov.querySelector('#ipD').value, note: ov.querySelector('#ipN').value }) })
            .then(function (r) { return r.json(); }).then(function (j) {
              busy = false;
              if (!j || !j.ok) throw new Error((j && j.error) || 'сервер не подтвердил');
              if (opts.onDone) try { opts.onDone(j); } catch (x) {}
              close(); toast(j.pendingConfirm ? 'Оплата по счёту внесена — ждёт подтверждения учредителя или бухгалтера' : ('✓ Оплата ' + money(v) + ' ₸ по счёту №' + S.number + ' внесена и разнесена по ' + j.parts.length + ' заказам'), j.pendingConfirm);
            }).catch(function (x) { busy = false; ok.disabled = false; e.textContent = 'Ошибка: ' + (x && x.message || x); });
        };
      }
      function wireOne() {
        [].forEach.call(ov.querySelectorAll('[data-one]'), function (b) { b.onclick = function () {
          var id = b.getAttribute('data-one'), o = S.orders.filter(function (x) { return x.cardId === id; })[0];
          close(true); window.openPayDialog({ cardId: id, title: (o && o.number ? '№' + o.number + ' ' : '') + String((o && o.name) || '').slice(0, 40), onDone: opts.onDone, onClose: opts.onClose });
        }; });
      }
      draw();
    }
  };
})();
