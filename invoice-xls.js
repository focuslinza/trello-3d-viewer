// Excel «Счёт на оплату» в формате 1С — общий для окна счёта и окна «Счета по заказу» (24.11.2026).
// r — строка счёта как в журнале: number, date_text, contract, total, supplier_json, buyer_json, items_json.
(function(){
    function parse(v,d){ if(v&&typeof v==='object') return v; try{ var x=JSON.parse(v); return x==null?d:x; }catch(e){ return d; } }
    function money(v){ return (window.INVOICE&&window.INVOICE.money)?window.INVOICE.money(v):(Math.round(+v||0)).toLocaleString('ru-RU'); }
    function build1C(r){
      var sup=parse(r.supplier_json,{})||{}, buy=parse(r.buyer_json,{})||{}, items=parse(r.items_json,[])||[];
      var total=0; items.forEach(function(it){ total+=(+it.qty||0)*(+it.price||0); });
      if(!total) total=+r.total||0;
      var ws={}; var merges=[];
      function S(addr,v){ ws[addr]={ t:'s', v:String(v==null?'':v) }; }
      function N(addr,v,z){ ws[addr]={ t:'n', v:+v||0 }; if(z) ws[addr].z=z; }
      function M(rng){ merges.push(XLSX.utils.decode_range(rng)); }
      var MONEYZ='#,##0.00';

      S('G1',' Внимание! Оплата данного счета означает согласие с условиями поставки товара. Уведомление об оплате\n обязательно, в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту  прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и документов удостоверяющих личность.');
      M('G1:AM6');
      S('B8','Образец платежного поручения');
      S('B9','Бенефициар: '); M('B9:U9'); S('V9','ИИК'); M('V9:AE9'); S('AF9','Кбе'); M('AF9:AM9');
      S('B10',sup.name||''); M('B10:U10');
      S('V10',sup.iban||''); M('V10:AE11');
      S('AF10',sup.kbe||''); M('AF10:AM11');
      S('B11','ИИН: '+(sup.bin||'')); M('B11:U11');
      S('B12','Банк бенефициара:'); M('B12:U12');
      S('V12','БИК'); M('V12:AC12');
      S('AD12','Код назначения платежа'); M('AD12:AM12');
      S('B13',sup.bank||''); M('B13:U13');
      S('V13',sup.bik||''); M('V13:AC13');
      S('AD13',sup.paycode||''); M('AD13:AM13');
      S('B16','Счет на оплату № '+r.number+' от '+(r.date_text||'')); M('B16:AM17');
      S('B18',''); M('B18:AM18');
      S('B20','Поставщик:'); M('B20:E20');
      S('F20',' БИН / ИИН '+(sup.bin||'')+','+(sup.name||'')+','+(sup.addr||'')); M('F20:AM20');
      S('B22','Покупатель:'); M('B22:E22');
      var isPerson = buy.kind==='person';
      S('F22',' '+(isPerson?'ИИН ':'БИН / ИИН ')+(buy.bin||'')+','+(buy.name||'')+(buy.addr?(','+buy.addr):'')+(buy.phone?(', тел. '+buy.phone):''));
      M('F22:AM22');
      S('B24','Договор:'); M('B24:E24');
      S('F24',r.contract||'Без договора'); M('F24:AM24');
      S('B26','№'); M('B26:C26'); S('D26','Код'); S('I26','Наименование'); S('T26','Кол-во'); S('X26','Ед.'); S('AA26','Цена'); S('AG26','Сумма');
      M('D26:H26'); M('I26:S26'); M('T26:W26'); M('X26:Z26'); M('AA26:AF26'); M('AG26:AL26');
      var row=27;
      items.forEach(function(it,i){
        S('B'+row,String(i+1)); M('B'+row+':C'+row);
        // код позиции: как в 1С — числовой код с нулями слева до 11 знаков
        var code=String(it.code||'').replace(/\D/g,'');
        S('D'+row, code?('00000000000'+code).slice(-11):''); M('D'+row+':H'+row);
        S('I'+row,it.name||''); M('I'+row+':S'+row);
        N('T'+row,+it.qty||0); M('T'+row+':W'+row);
        S('X'+row,it.unit||'Услуга'); M('X'+row+':Z'+row);
        N('AA'+row,+it.price||0,MONEYZ); M('AA'+row+':AF'+row);
        N('AG'+row,(+it.qty||0)*(+it.price||0),MONEYZ); M('AG'+row+':AL'+row);
        row++;
      });
      var L=row-1;
      S('AF'+(L+2),'Итого:'); N('AG'+(L+2),total,MONEYZ); M('AG'+(L+2)+':AL'+(L+2));
      S('AF'+(L+3),'В том числе НДС:'); var _nds1=(window.INVOICE&&window.INVOICE.ndsFor)?window.INVOICE.ndsFor(sup,total):null; if(_nds1) N('AG'+(L+3),_nds1,MONEYZ); else S('AG'+(L+3),'-'); M('AG'+(L+3)+':AL'+(L+3));
      S('B'+(L+5),'Всего наименований '+items.length+', на сумму '+money(total)+' KZT'); M('B'+(L+5)+':AM'+(L+5));
      S('B'+(L+6),'Всего к оплате: '+((window.INVOICE&&window.INVOICE.rubWords)?window.INVOICE.rubWords(total):'')); M('B'+(L+6)+':AK'+(L+6));
      S('B'+(L+9),'Исполнитель'); S('G'+(L+9),''); M('G'+(L+9)+':V'+(L+9));
      S('W'+(L+9),'/'+(sup.executor||'')+'/'); M('W'+(L+9)+':AM'+(L+9));

      ws['!ref']='A1:AM'+(L+10);
      ws['!merges']=merges;
      var cols=[]; for(var ci=0;ci<39;ci++) cols.push({wch:3}); ws['!cols']=cols;
      var wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Лист_1');
      return wb;
    }
    window.INVOICE_XLS={ build:build1C,
      fileName:function(r){ var buy=parse(r.buyer_json,{})||{}; return 'Счет_на_оплату_'+r.number+'_'+String(buy.name||'клиент').replace(/[^0-9A-Za-zА-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ]+/g,'_').slice(0,30)+'.xlsx'; },
      download:function(r){ if(!window.XLSX){ alert('Генератор Excel не загрузился — проверьте интернет.'); return; } XLSX.writeFile(build1C(r), this.fileName(r)); } };
})();
