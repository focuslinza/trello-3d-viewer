/* ============================================================
   Shared helpers for the Company + Contacts module.
   Storage model (chosen: inside Trello, board level):
     board / shared / "companies"  -> the whole company directory (array)
     card  / shared / "companyId"  -> which company is linked to this card
     card  / shared / "cardContacts" -> ids of people who enquired on this card
   Note: board/shared has a ~8192 character budget. We watch it and warn.
   ============================================================ */
window.CRM = (function () {
  var DIR_KEY = 'companies';
  function W(){ return ((window.CONFIG && window.CONFIG.WORKER_URL) || window.WORKER_URL || '').replace(/\/$/,''); }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Справочник клиентов живёт в базе D1 (безлимит). Старые записи с доски (лимит ~8КБ)
  // переносятся в базу автоматически при первом чтении, после чего место на доске освобождается.
  function legacyDirectory(t) {
    return t.get('board', 'shared', DIR_KEY, []).then(function (list) {
      return Array.isArray(list) ? list : [];
    }).catch(function(){ return []; });
  }

  function getDirectory(t) {
    return fetch(W() + '/companies-list').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'companies-list failed');
      var d1 = j.companies || [];
      if (d1.length) return d1;
      // база пуста — возможно, справочник ещё на доске: переносим одним разом
      return legacyDirectory(t).then(function (legacy) {
        if (!legacy.length) return d1;
        return fetch(W() + '/companies-import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companies: legacy })
        }).then(function (r) { return r.json(); }).then(function (j2) {
          if (j2 && j2.ok) { t.remove('board', 'shared', DIR_KEY).catch(function () {}); }
          return legacy;
        }).catch(function () { return legacy; });
      });
    }).catch(function () {
      // сеть недоступна — читаем что есть на доске, чтобы модуль не ослеп
      return legacyDirectory(t);
    });
  }

  function directorySize(list) {
    try { return JSON.stringify(list).length; } catch (e) { return 0; }
  }

  // сохранение всего списка целиком (используется для переноса; лимитов больше нет)
  function saveDirectory(t, list) {
    return fetch(W() + '/companies-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies: list || [] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'не удалось сохранить справочник');
      return { size: directorySize(list), nearFull: false };
    });
  }

  function getCompanyById(t, id) {
    if (!id) return Promise.resolve(null);
    return getDirectory(t).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    });
  }

  function upsertCompany(t, company) {
    return fetch(W() + '/company-save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: company })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'не удалось сохранить клиента');
      return { company: company, info: { size: 0, nearFull: false } };
    });
  }

  function deleteCompany(t, id) {
    return fetch(W() + '/company-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'не удалось удалить клиента');
      return { size: 0, nearFull: false };
    });
  }

  // история заказов клиента (из сохранённых расчётов)
  function companyOrders(companyId, companyName) {
    return fetch(W() + '/company-orders?companyId=' + encodeURIComponent(companyId || '') +
                 '&companyName=' + encodeURIComponent(companyName || ''))
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.ok) ? j : { ok: false, totals: { orders: 0, revenue: 0, paidRev: 0, unpaidRev: 0 }, orders: [] }; })
      .catch(function () { return { ok: false, totals: { orders: 0, revenue: 0, paidRev: 0, unpaidRev: 0 }, orders: [] }; });
  }

  // ---- card-level links ----
  function getCardCompanyId(t) {
    return t.get('card', 'shared', 'companyId', null);
  }
  // Смена клиента на карточке теперь сама обновляет уже сохранённый расчёт
  // (таблицу calculations на сервере) — раньше это требовало вручную открыть
  // калькулятор и нажать "Сохранить" ещё раз, что легко забыть; теперь связь
  // клиента с расчётом обновляется в момент смены клиента, автоматически.
  function setCardCompanyId(t, id, name) {
    // тихая синхронизация с бухгалтерией: заказ на вкладке «Заказы» сразу
    // показывает нового клиента (если расчёта ещё нет — сервер молча пропустит)
    try {
      t.card('id').then(function (c) {
        var W = (typeof window !== 'undefined' && ((window.CONFIG && window.CONFIG.WORKER_URL) || window.WORKER_URL)) || '';
        if (!W || !c || !c.id) return;
        fetch(W + '/calc-relink', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(id ? { cardId: c.id, companyId: id, companyName: name || '' }
                                  : { cardId: c.id, companyId: null, companyName: '', clear: 1 }) })
          .catch(function(){});
      }).catch(function(){});
    } catch (e) {}
    return t.set('card', 'shared', 'companyId', id || null).then(function (res) {
      if (id) {
        t.card('id').then(function (c) {
          if (!c || !c.id) return;
          fetch(W() + '/calc-relink', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId: c.id, companyId: id, companyName: name || '' })
          }).catch(function () { /* необязательное обновление — если расчёта ещё нет, промолчим */ });
        }).catch(function () {});
      }
      return res;
    });
  }
  function getCardContacts(t) {
    return t.get('card', 'shared', 'cardContacts', []).then(function (a) {
      return Array.isArray(a) ? a : [];
    });
  }
  function setCardContacts(t, ids) {
    return t.set('card', 'shared', 'cardContacts', ids || []);
  }
  function getCardObjectId(t) {
    return t.get('card', 'shared', 'objectId', null);
  }
  function setCardObjectId(t, id) {
    return t.set('card', 'shared', 'objectId', id || null);
  }

  // ---- WhatsApp / phone ----
  function toWhatsApp(raw) {
    if (!raw) return '';
    var digits = String(raw).replace(/[^\d]/g, '');
    if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
    if (digits.length === 10 && (digits[0] === '7' || digits[0] === '6')) digits = '7' + digits;
    return digits;
  }
  function waLink(raw) {
    var d = toWhatsApp(raw);
    return d ? 'https://wa.me/' + d : '';
  }
  function telLink(raw) {
    var d = toWhatsApp(raw);
    return d ? 'tel:+' + d : '';
  }

  // ---- map route links for an address ----
  function mapUrls(addr) {
    var q = encodeURIComponent(addr || '');
    return {
      gis: 'https://2gis.kz/search/' + q,                                   // 2ГИС (поиск адреса, дальше «Проезд»)
      google: 'https://www.google.com/maps/dir/?api=1&destination=' + q,    // Google: маршрут до адреса
      yandex: 'https://yandex.kz/maps/?rtext=~' + q + '&rtt=auto'           // Яндекс: маршрут на авто
    };
  }

  // ---- field labels (for the company form / invoice later) ----
  // Поля клиента зависят от типа: «Юрлицо» (компания) или «Частное лицо».
  // Реквизиты для расчётов (IBAN/банк/БИК/НДС) есть только у юрлиц — у частных лиц их нет и не просят.
  var COMPANY_FIELDS = [
    { key: 'name', label: 'Название компании', placeholder: 'ТОО «Альфа»', required: true },
    { key: 'bin', label: 'БИН / ИИН', placeholder: '123456789012' },
    { key: 'addr', label: 'Адрес', placeholder: 'г. Алматы, ул. ...' },
    { key: 'phone', label: 'Телефон компании', placeholder: '+7 701 123 45 67' },
    { key: 'iban', label: 'IBAN / расчётный счёт', placeholder: 'KZ...' },
    { key: 'bank', label: 'Банк', placeholder: 'Kaspi Bank' },
    { key: 'bik', label: 'БИК', placeholder: 'CASPKZKA' },
    { key: 'nds', label: 'Плательщик НДС', type: 'checkbox' }
  ];
  var PERSON_FIELDS = [
    { key: 'name', label: 'ФИО', placeholder: 'Иванов Иван Иванович', required: true },
    { key: 'bin', label: 'ИИН', placeholder: '123456789012' },
    { key: 'addr', label: 'Адрес', placeholder: 'г. Алматы, ул. ...' },
    { key: 'phone', label: 'Телефон', placeholder: '+7 701 123 45 67' }
  ];
  var CLIENT_TYPES = [ { key:'company', label:'Юрлицо' }, { key:'person', label:'Частное лицо' } ];
  function fieldsForType(type){ return type === 'person' ? PERSON_FIELDS : COMPANY_FIELDS; }
  function typeLabel(type){ return type === 'person' ? 'Частное лицо' : 'Юрлицо'; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    newId: newId,
    getDirectory: getDirectory,
    saveDirectory: saveDirectory,
    getCompanyById: getCompanyById,
    upsertCompany: upsertCompany,
    deleteCompany: deleteCompany,
    companyOrders: companyOrders,
    getCardCompanyId: getCardCompanyId,
    setCardCompanyId: setCardCompanyId,
    getCardContacts: getCardContacts,
    setCardContacts: setCardContacts,
    getCardObjectId: getCardObjectId,
    setCardObjectId: setCardObjectId,
    toWhatsApp: toWhatsApp,
    waLink: waLink,
    telLink: telLink,
    mapUrls: mapUrls,
    COMPANY_FIELDS: COMPANY_FIELDS,
    PERSON_FIELDS: PERSON_FIELDS,
    CLIENT_TYPES: CLIENT_TYPES,
    fieldsForType: fieldsForType,
    typeLabel: typeLabel,
    esc: esc
  };
})();
