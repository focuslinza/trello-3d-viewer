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
