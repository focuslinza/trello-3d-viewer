// Автопроверка окон системы перед каждой заливкой (GitHub Actions).
// Проверяет «глазами» обычного руководителя (не администратора Trello, как Ораз):
// Trello на вопрос о рабочем пространстве молчит, права приходят с сервера.
// Падает с ошибкой, если окно зависает на «Загрузка…», не находит кнопки или
// в любом файле синтаксическая ошибка.
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
const R = new URL('..', import.meta.url).pathname;
let fails = 0;
function fail(msg){ console.log('❌ ' + msg); fails++; }
function ok(msg){ console.log('✅ ' + msg); }

// 1) синтаксис всех страниц и скриптов
for (const f of fs.readdirSync(R)) {
  if (/_\d+\.(html|js)$/.test(f)) { fail('лишняя копия с номером: ' + f); continue; }
  if (f.endsWith('.html')) {
    const h = fs.readFileSync(R + f, 'utf8'); const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g; let m;
    while ((m = re.exec(h))) { if (/type="(module|importmap|application\/json)"/.test(m[0].slice(0, 80))) continue; try { new Function(m[1]); } catch (e) { fail(f + ': ' + e.message); } }
  } else if (f.endsWith('.js')) {
    try { new Function(fs.readFileSync(R + f, 'utf8')); } catch (e) { fail(f + ': ' + e.message); }
  }
}
ok('синтаксис файлов проверен');

const PERMS = { ok:true, found:true, workerName:'Тест Руководитель', canInvoice:true, canIssueInvoice:true, canSeeCost:true, canTimesheet:true, canCrm:true, canSupply:true, canRepair:true, canHr:true, canDashboard:false };
function mkT(){ return { member:async()=>({id:'m1',fullName:'Тест'}), board:async()=>({id:'b',memberships:[],members:[]}), card:async()=>({id:'C1',name:'Заказ'}), list:async()=>({name:'x'}),
  organization:()=>new Promise(()=>{}), arg:(k)=>k==='cardId'?'C1':null, args:{cardId:'C1'}, render(fn){try{fn()}catch(e){}}, sizeTo:async()=>{}, closeModal(){}, modal(){}, popup(){}, signUrl:u=>u,
  get:async(a,b,c,d)=>d===undefined?null:d, set:async()=>{}, localizeKey:k=>k }; }
function body(){ return { ok:true, found:true, linked:true, companies:[], orders:[], rows:[], items:[], workers:[], leads:[], marks:{}, holidays:{}, norm:{calendar:21,override:null,effective:21}, route:null, row:null }; }
async function open(file, waitMs){
  let html = fs.readFileSync(R + file, 'utf8')
    .replace(/<script src="https:\/\/[^"]+"><\/script>/g, '')
    .replace(/<script src="\.\/([^"]+)"><\/script>/g, (m, f) => fs.existsSync(R + f) ? '<script>' + fs.readFileSync(R + f, 'utf8') + '</script>' : '');
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts:'dangerously', url:'https://focuslinza.github.io/trello-3d-viewer/' + file, virtualConsole: vc, pretendToBeVisual:true, beforeParse(w){
    const t = mkT(); w.TrelloPowerUp = { iframe:()=>t, initialize:(c)=>{ w.__caps = c; }, Promise };
    w.fetch = async (u) => { const s = String(u); const j = s.includes('/worker-perms') ? PERMS : body(); return { ok:true, status:200, json:async()=>j, text:async()=>JSON.stringify(j) }; };
    w.alert = ()=>{}; w.confirm = ()=>true; w.Chart = function(){ return { destroy(){} }; };
  }});
  await new Promise(r => setTimeout(r, waitMs || 2500));
  const b = dom.window.document.body.cloneNode(true);
  b.querySelectorAll('script,style,template').forEach(n => n.remove());
  const tx = b.textContent.replace(/\s+/g, ' ').trim(); if (process.env.DBG) console.log('   ', file, '→', tx.slice(0,90));
  return { dom, tx };
}
const EXPECT = {
  'buh-modal.html': 'Бухгалтерия', 'timesheet-modal.html': 'Табель', 'supply-modal.html': 'Заявки',
  'calc-section.html': 'Счёт на оплату', 'invoice-modal.html': 'Поставщик', 'route-section.html': 'операции',
  'repair-board-modal.html': 'Ремонт', 'sales-board-modal.html': 'Продажи', 'my-earnings-modal.html': 'заработок'
};
for (const [f, want] of Object.entries(EXPECT)) {
  if (!fs.existsSync(R + f)) { fail('нет файла ' + f); continue; }
  const { dom, tx } = await open(f, f === 'invoice-modal.html' ? 4000 : 2500);
  if (/^Загрузка/.test(tx) && !tx.includes(want)) fail(f + ': зависло на «Загрузка…»');
  else if (!tx.includes(want)) fail(f + ': нет «' + want + '» — ' + tx.slice(0, 80));
  else ok(f + ' открылось у руководителя (не админ Trello)');
  dom.window.close();
}
// 2) кнопки доски в Trello у руководителя: Бухгалтерия должна быть
{
  const { dom } = await open('calc-connector.html', 300);
  const caps = dom.window.__caps;
  const t0 = Date.now();
  const btns = await caps['board-buttons'](mkT(), {});
  const names = btns.map(b => b.text);
  if (Date.now() - t0 > 3500) fail('кнопки доски отвечают дольше 3,5 с — Trello их выбросит');
  if (!names.includes('Бухгалтерия')) fail('нет кнопки «Бухгалтерия» у руководителя: ' + names.join(', ')); else ok('кнопки доски: ' + names.join(', '));
  dom.window.close();
}
console.log(fails ? ('\nПРОВАЛЕНО проверок: ' + fails) : '\nВСЁ В ПОРЯДКЕ');
process.exit(fails ? 1 : 0);
