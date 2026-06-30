/* Shared invoice builder — works in browser (pdfmake) and Node. Exposes window.INVOICE */
(function(root){
  function money(v){ v=+v||0; var s=v.toFixed(2); var p=s.split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,' '); return p[0]+','+p[1]; }
  var ONES=['','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
  var ONESF=['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
  var TENS=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  var HUND=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
  function triple(n,fem){ var w=[],h=Math.floor(n/100),t=Math.floor((n%100)/10),o=n%10; if(h)w.push(HUND[h]); if(t>1){w.push(TENS[t]); if(o)w.push((fem?ONESF:ONES)[o]);} else { var r=t*10+o; if(r)w.push((fem?ONESF:ONES)[r]); } return w.join(' '); }
  function plural(n,f){ n=Math.abs(n)%100; if(n>10&&n<20)return f[2]; n%=10; if(n===1)return f[0]; if(n>=2&&n<=4)return f[1]; return f[2]; }
  function rubWords(amount){
    var tenge=Math.floor(amount), tiyn=Math.round((amount-tenge)*100); if(tiyn===100){tenge++;tiyn=0;}
    var parts=[], mil=Math.floor(tenge/1000000), th=Math.floor((tenge%1000000)/1000), rest=tenge%1000;
    if(mil){ parts.push(triple(mil)); parts.push(plural(mil,['миллион','миллиона','миллионов'])); }
    if(th){ parts.push(triple(th,true)); parts.push(plural(th,['тысяча','тысячи','тысяч'])); }
    if(rest||!parts.length) parts.push(triple(rest));
    var s=parts.filter(Boolean).join(' ').trim()||'ноль';
    s=s.charAt(0).toUpperCase()+s.slice(1);
    return s+' '+plural(tenge,['тенге','тенге','тенге'])+' '+(tiyn<10?'0'+tiyn:tiyn)+' тиын';
  }

  function buildInvoiceDoc(d){
    var sup=d.supplier, buy=d.buyer;
    var items=d.items||[]; var total=0; items.forEach(function(it){ total += (+it.qty||0)*(+it.price||0); });
    var gray='#888888';
    var body=[];
    // warning
    body.push({ text:'Внимание! Оплата данного счета означает согласие с условиями поставки товара. Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и документов удостоверяющих личность.', fontSize:7.2, color:'#333', margin:[0,0,0,6] });
    // payment order sample
    body.push({ table:{ widths:[70,'*',26,110,26,24], body:[
      [ {text:'Бенефициар:',fontSize:8.5}, {text:sup.name+'\nИИН: '+sup.bin,fontSize:8.5}, {text:'ИИК',fontSize:8.5,alignment:'center'}, {text:sup.iban,fontSize:8.5,alignment:'center'}, {text:'Кбе',fontSize:8.5,alignment:'center'}, {text:sup.kbe,fontSize:8.5,alignment:'center'} ],
      [ {text:'Банк бенефициара:',fontSize:8.5}, {text:sup.bank,fontSize:8.5}, {text:'БИК',fontSize:8.5,alignment:'center'}, {text:sup.bik,fontSize:8.5,alignment:'center'}, {text:'Код назн. плат.',fontSize:7,alignment:'center'}, {text:sup.paycode,fontSize:8.5,alignment:'center'} ]
    ]}, layout:{ hLineColor:function(){return gray;}, vLineColor:function(){return gray;}, hLineWidth:function(){return 0.5;}, vLineWidth:function(){return 0.5;} }, margin:[0,0,0,10] });
    // title
    body.push({ text:'Счет на оплату № '+d.number+' от '+d.date, font:'DejaVu', bold:true, fontSize:13, margin:[0,0,0,3] });
    body.push({ canvas:[{type:'line',x1:0,y1:0,x2:523,y2:0,lineWidth:2}], margin:[0,0,0,8] });
    // parties
    function party(lbl,txt){ return { columns:[ {width:78,text:lbl,bold:true,fontSize:9.5}, {width:'*',text:txt,fontSize:9.5} ], margin:[0,0,0,3] }; }
    body.push(party('Поставщик:', 'БИН / ИИН '+sup.bin+', '+sup.name+', '+sup.addr));
    var bt='БИН / ИИН '+buy.bin+', '+buy.name+', '+buy.addr; if(buy.phone)bt+=', тел. '+buy.phone;
    body.push(party('Покупатель:', bt));
    body.push(party('Договор:', d.contract||'Без договора'));
    body.push({text:'',margin:[0,0,0,7]});
    // items
    var rows=[[ {text:'№',bold:true,alignment:'center'},{text:'Код',bold:true,alignment:'center'},{text:'Наименование',bold:true,alignment:'center'},{text:'Кол-во',bold:true,alignment:'center'},{text:'Ед.',bold:true,alignment:'center'},{text:'Цена',bold:true,alignment:'center'},{text:'Сумма',bold:true,alignment:'center'} ]];
    items.forEach(function(it,i){ var s=(+it.qty||0)*(+it.price||0); rows.push([ {text:String(i+1),alignment:'center'},{text:it.code||'',fontSize:8.5},{text:it.name||'',fontSize:8.5},{text:money(it.qty),alignment:'right'},{text:it.unit||'Услуга',alignment:'center'},{text:money(it.price),alignment:'right'},{text:money(s),alignment:'right'} ]); });
    body.push({ table:{ headerRows:1, widths:[18,58,'*',42,38,62,64], body:rows }, layout:{ fillColor:function(r){return r===0?'#eeeeee':null;}, hLineColor:function(){return gray;}, vLineColor:function(){return gray;}, hLineWidth:function(){return 0.5;}, vLineWidth:function(){return 0.5;} }, fontSize:8.5, margin:[0,0,0,6] });
    // totals
    body.push({ columns:[ {width:'*',text:'Итого:',alignment:'right',fontSize:9.5}, {width:80,text:money(total),alignment:'right',bold:true,fontSize:10} ], margin:[0,0,0,1] });
    var nds = (d.nds==null||d.nds===0)?'-':money(d.nds);
    body.push({ columns:[ {width:'*',text:'В том числе НДС:',alignment:'right',fontSize:9.5}, {width:80,text:nds,alignment:'right',fontSize:9.5} ], margin:[0,0,0,6] });
    body.push({ text:'Всего наименований '+items.length+', на сумму '+money(total)+' KZT', fontSize:9.5, margin:[0,0,0,2] });
    body.push({ text:[{text:'Всего к оплате: ',bold:true},{text:rubWords(total),bold:true}], fontSize:9.5, margin:[0,0,0,16] });
    body.push({ canvas:[{type:'line',x1:0,y1:0,x2:523,y2:0,lineWidth:0.7,lineColor:gray}], margin:[0,0,0,8] });
    body.push({ columns:[ {width:80,text:'Исполнитель',fontSize:9.5}, {width:150,text:'______________________',fontSize:9.5}, {width:'*',text:'/'+(sup.executor||'')+'/',fontSize:9.5} ] });

    return { pageSize:'A4', pageMargins:[40,36,40,36], defaultStyle:{ font:'DejaVu', fontSize:9 }, content:body };
  }

  root.INVOICE = { money:money, rubWords:rubWords, buildInvoiceDoc:buildInvoiceDoc };
})(typeof window!=='undefined'?window:global);
