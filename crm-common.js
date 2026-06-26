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
  var SOFT_LIMIT = 7800; // warn before Trello's ~8192 hard limit

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function getDirectory(t) {
    return t.get('board', 'shared', DIR_KEY, []).then(function (list) {
      return Array.isArray(list) ? list : [];
    });
  }

  function directorySize(list) {
    try { return JSON.stringify(list).length; } catch (e) { return 0; }
  }

  function saveDirectory(t, list) {
    var size = directorySize(list);
    if (size > 8192) {
      return Promise.reject(new Error(
        'Справочник компаний переполнен (лимит хранилища Trello). ' +
        'Пора перенести его в Cloudflare — обратитесь к разработчику.'
      ));
    }
    return t.set('board', 'shared', DIR_KEY, list).then(function () {
      return { size: size, nearFull: size > SOFT_LIMIT };
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
    return getDirectory(t).then(function (list) {
      var found = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === company.id) { list[i] = company; found = true; break; }
      }
      if (!found) list.push(company);
      return saveDirectory(t, list).then(function (info) {
        return { company: company, info: info };
      });
    });
  }

  function deleteCompany(t, id) {
    return getDirectory(t).then(function (list) {
      var next = list.filter(function (c) { return c.id !== id; });
      return saveDirectory(t, next);
    });
  }

  // ---- card-level links ----
  function getCardCompanyId(t) {
    return t.get('card', 'shared', 'companyId', null);
  }
  function setCardCompanyId(t, id) {
    return t.set('card', 'shared', 'companyId', id || null);
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
    esc: esc
  };
})();
