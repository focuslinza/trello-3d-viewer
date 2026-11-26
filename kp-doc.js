/* Коммерческое предложение (решение Асхата, 18.11.2026) — по образцу «КП TTMS».
   Собирает документ pdfmake из тех же данных, что и счёт: поставщик, покупатель, строки.
   Работает в браузере (window.KP) и в Node (module.exports). */
(function(root){
  function money0(v){ v=Math.round(+v||0); return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,' '); }
  var NAVY='#1f3550', LINE='#9aa5b1';
  // короткая подпись поставщика: «ТОО «TTMS»» / «ИП «MetalShop»»
  function shortName(sup){
    sup=sup||{}; if(sup.label) return sup.label.replace(/\s*\(.*\)\s*$/,'');
    return sup.name||'';
  }
  // адрес для шапки КП: у ТОО «TTMS» — как в образце КП
  function supAddr(sup){
    if(String((sup||{}).bin||'')==='230940037731') return 'Республика Казахстан, г. Астана, район Есиль, ул. Динмухамеда Конаева, 14, ВП 23';
    return (sup||{}).addr||'';
  }
  function isVat(sup){ return String((sup||{}).bin||'').replace(/\D/g,'')==='230940037731'; }
  function th(t){ return { text:t, bold:true, color:'#fff', fillColor:NAVY, alignment:'center', margin:[0,3,0,3] }; }

  function buildKpDoc(d){
    var sup=d.supplier||{}, buy=d.buyer||{}, items=d.items||[], terms=d.terms||{};
    var sn=shortName(sup);
    var total=items.reduce(function(s,it){ return s+Math.round((+it.price||0)*(+it.qty||1)); },0);
    var qtyTotal=items.reduce(function(s,it){ return s+(+it.qty||0); },0);
    // наличные (решение Асхата, 18.11.2026): слово «Наличные» как название компании не пишем
    var head=sup.cash ? [{ text:supAddr(sup), fontSize:9 }] : [{ text:sn, bold:true, fontSize:11 }, { text:supAddr(sup), fontSize:9, margin:[0,2,0,0] }];
    if(sup.bin) head.push({ text:'БИН '+sup.bin+(sup.kbe?'   |   КБе '+sup.kbe:''), fontSize:9, margin:[0,2,0,0] });
    var body=[[th('№'), th('Наименование товара / работ'), th('Ед. изм.'), th('Кол-во'), th('Цена, тг'), th('Сумма, тг')]];
    items.forEach(function(it,i){
      var q=+it.qty||1, p=Math.round(+it.price||0);
      body.push([{text:String(i+1)}, {text:String(it.name||'')}, {text:it.unit||'шт',alignment:'center'}, {text:String(q),alignment:'center'},
        {text:money0(p),alignment:'center'}, {text:money0(p*q),alignment:'center'}]);
    });
    body.push(['', {text:'ИТОГО',bold:true}, '', {text:String(qtyTotal),alignment:'center',bold:true}, '', {text:money0(total),alignment:'center',bold:true}]);
    var vr = (d.vatRate!=null) ? +d.vatRate : (isVat(sup) ? 0.16 : 0);
    var vatLine = vr
      ? [{ text:'НДС: ' }, { text:money0(total*vr/(1+vr))+' тг.', bold:true }, { text:' Общая стоимость: ' }, { text:money0(total)+' тенге.', bold:true }]
      : [{ text:'Без НДС. Общая стоимость: ' }, { text:money0(total)+' тенге.', bold:true }];
    var cond=[[th('Параметр'), th('Условия')]];
    [['Срок изготовления / поставки', terms.term||'1 неделя'], ['Место и условия доставки', terms.delivery||'Самовывоз'],
     ['Условия оплаты', terms.payment||'100%'], ['Гарантийный срок', terms.warranty||'1 год (12 мес)']]
      .forEach(function(r){ cond.push([{text:r[0]}, {text:r[1],alignment:'center'}]); });
    var who = buy.contact ? buy.contact : '';
    var org = buy.name||'';
    var topic = d.topic || ('изготовление ' + (items.length===1 ? String(items[0].name||'').replace(/^изготовление\s+/i,'') : 'изделий'));
    var req=[];
    if(!sup.cash){
      req.push({ text: sn+(sup.bin?'  |  БИН: '+sup.bin:'')+(sup.kbe?'  |  КБе: '+sup.kbe:''), margin:[0,2,0,0] });
      if(sup.bank) req.push({ text: String(sup.bank).replace(/"/g,'«').replace(/«([^«]*)«/,'«$1»')+(sup.iban?'  |  ИИК: '+sup.iban:'')+(sup.bik?'  |  БИК: '+sup.bik:''), margin:[0,2,0,0] });
    } else if(sup.addr) req.push({ text: sup.addr, margin:[0,2,0,0] });
    var signer = /ТОО|ограниченной/i.test(sup.name||'') ? ('Директор '+sn) : sn;
    return {
      pageSize:'A4', pageMargins:[48,40,48,50],
      defaultStyle:{ font:'DejaVu', fontSize:10, lineHeight:1.15 },
      footer:function(){ return { text: (sup.cash?'':sn+'  •  ')+(d.pre?'Предварительное коммерческое предложение':'Коммерческое предложение'), alignment:'center', fontSize:7, color:'#555', margin:[0,18,0,0] }; },
      content:[
        { stack:head },
        { canvas:[{ type:'line', x1:0, y1:4, x2:499, y2:4, lineWidth:1, lineColor:'#333' }], margin:[0,4,0,10] },
        { text:(d.pre?'ПРЕДВАРИТЕЛЬНОЕ ':'')+'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', bold:true, alignment:'center', fontSize:11 },
        { columns:[{ text:'№ '+(d.number||''), alignment:'center' }, { text:'от '+(d.date||''), alignment:'center' }], margin:[0,4,0,2] },
        d.validUntil ? { text:[{text:'Действительно до: '},{text:d.validUntil,bold:true}], alignment:'center', margin:[0,0,0,6] } : { text:'', margin:[0,0,0,4] },
        who ? { text:[{text:'Кому: '}, {text:who}] } : '',
        org ? { text:[{text:'Организация: '}, {text:org, bold:true}] } : '',
        { text:'Тема: '+topic },
        { text: (sup.cash ? 'Наша компания' : sn)+' предлагает рассмотреть коммерческое предложение на изготовление изделий.', margin:[0,4,0,0] },
        { text:'1. Состав и стоимость предложения', bold:true, margin:[0,4,0,4] },
        { table:{ headerRows:1, widths:[18,'*',38,40,62,62], body:body }, layout:{ hLineColor:LINE, vLineColor:LINE, paddingTop:function(){return 3;}, paddingBottom:function(){return 3;} } },
        { text:vatLine, margin:[0,3,0,d.pre?3:8] },
        d.pre ? { text:'Цена предварительная. Окончательная стоимость определяется после расчёта по чертежам и техническому заданию.', bold:true, margin:[0,0,0,8] } : '',
        { text:'2. Коммерческие условия', bold:true, margin:[0,0,0,4] },
        { table:{ headerRows:1, widths:[200,'*'], body:cond }, layout:{ hLineColor:LINE, vLineColor:LINE } },
        { text:'Окончательный объем, комплектация, стоимость и сроки согласовываются сторонами до заключения договора. Изменения технического задания могут повлечь пересмотр стоимости и сроков.', margin:[0,4,0,8] },
        { text:'3. Реквизиты поставщика', bold:true },
        { stack:req },
        { text: (sup.cash ? '' : signer+' ')+'___________________ '+(sup.executor||''), margin:[0,14,0,0] },
        sup.cash ? '' : { text:'М.П. (при наличии)' }
      ]
    };
  }
  var api={ buildKpDoc:buildKpDoc };
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.KP=api;
})(typeof window!=='undefined'?window:this);
