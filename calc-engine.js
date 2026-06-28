/* MetalShop FULL pricing engine — faithful port of калькулятор.xlsx.
   compute(inputs) -> { lineItems[], opsBase, engineering, subtotal, taxRate, taxAmount, total }
   Verified to reproduce the sheet's pre-tax subtotal (A4) to the tenge. */
(function (root) {
  var TH=[0.5,0.8,1,1.5,2,3,4,5,8,10,12,16];
  var CUTBEND_TIERS=[1,20,100,500];
  var CUTBEND={0.5:[800,350,240,200],0.8:[900,375,245,205],1:[1000,400,250,210],1.5:[1200,600,480,395],2:[1220,610,500,400],3:[1300,650,550,450],4:[1400,700,600,500],5:[1600,800,650,550],8:[1900,950,850,780],10:[1800,900,950,870],12:[1800,900,950,870],16:[1800,900,950,870]};
  var WELD_TIERS=[1,6,11,16,21,51,101,301];
  var WELD_SS={0.5:[6000,4000,3000,2000,1400,1000,750,350],0.8:[5000,3000,2000,1300,1100,800,600,230],1:[3000,2000,1000,700,500,350,300,150],1.5:[3000,2000,1000,700,500,350,300,150],2:[3000,2000,1000,700,500,350,300,150],3:[3300,2200,1100,800,600,400,320,160],4:[3600,2400,1200,900,700,450,340,170],5:[3900,2600,1300,1000,800,500,360,180],8:[4200,2800,1400,1100,900,550,380,190],10:[4500,3000,1500,1200,1000,600,400,200],12:[4800,3200,1600,1300,1100,650,420,210],16:[5100,3400,1700,1400,1200,700,440,220]};
  var WELD_BLACK={1:[2000,1500,1000,700,500,300,150,100],1.5:[2000,1500,1000,700,500,300,150,100],2:[2000,1500,1000,700,500,300,150,135],3:[2000,1500,1100,800,600,300,180,170],4:[2000,1500,1100,800,600,300,210,205],5:[2300,1820,1430,800,600,300,240,240],8:[2600,2140,1760,1140,720,344,280,275],10:[2900,2460,2090,1480,840,388,320,310],12:[3200,2780,2420,1820,960,432,360,345],16:[3500,3100,2750,2160,1080,476,400,380]};

  // material columns M..AY : u=price per m²/m, ost=waste%, rah=consumables%
  var MAT={
    M:{u:7321.6,ost:0.15,rah:0.04,sec:'ЛИСТ 430 нерж',lbl:'0,8мм (м2)',spec:'1250*2500*0,8'},
    N:{u:8531.2,ost:0.15,rah:0.04,sec:'ЛИСТ 430 нерж',lbl:'1мм (м2)',spec:'1250*2500*1'},
    O:{u:17440.0,ost:0.15,rah:0.04,sec:'ЛИСТ 430 нерж',lbl:'2мм (м2)',spec:'1250*2500*2'},
    P:{u:5000.0,ost:0.15,rah:0.04,sec:'ЛИСТ черн',lbl:'1мм (м2)',spec:'1250*2500'},
    Q:{u:7000.0,ost:0.15,rah:0.04,sec:'ЛИСТ черн',lbl:'2мм (м2)',spec:'1250*2500'},
    R:{u:11000.0,ost:0.15,rah:0.04,sec:'ЛИСТ черн',lbl:'3мм (м2)',spec:'1250*2500'},
    S:{u:30000.0,ost:0.15,rah:0.04,sec:'ЛИСТ черн',lbl:'8мм (м2)',spec:'1250*2500'},
    T:{u:12355.2,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'0,8мм (м2)',spec:'1250*2500'},
    U:{u:13996.16,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'1мм (м2)',spec:'1250*2500'},
    V:{u:22435.2,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'1.5мм (м2)',spec:'1250*2500'},
    W:{u:29902.9158828272,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'2мм (м2)',spec:'1250*2500'},
    X:{u:46800.0,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'3мм (м2)',spec:'1250*2500'},
    Y:{u:84800.0,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'5мм (м2)',spec:'1000*2000'},
    Z:{u:112444.444444444,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'8мм (м2)',spec:'1000*2000'},
    AA:{u:23636.3636363636,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'1мм Рифл (м2)',spec:'1250*2500'},
    AB:{u:46329.6,ost:0.15,rah:0.04,sec:'ЛИСТ 304 нерж',lbl:'3мм Рифл (м2)',spec:'250*2500'},
    AC:{u:650.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ черн',lbl:'25*1,5(м)',spec:'25*25*1,5 '},
    AD:{u:750.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ черн',lbl:'25*1,5(м)',spec:'25*25*2 '},
    AE:{u:1000.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ черн',lbl:'40*1,5(м)',spec:'40*40*1,5 '},
    AF:{u:1200.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ черн',lbl:'40*2(м)',spec:'40*40*2 '},
    AG:{u:1900.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ черн',lbl:'60*2(м)',spec:'60*60*2 '},
    AH:{u:5100.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ 304 нерж',lbl:'40*1,5 (п.м)',spec:'40*40*1,5'},
    AI:{u:3490.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ 304 нерж',lbl:'25*2 (п.м)',spec:'25*25*2'},
    AJ:{u:2520.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ 304 нерж',lbl:'25*1,5 (п.м)',spec:'25*25*1,5'},
    AK:{u:2180.0,ost:0.2,rah:0.04,sec:'ПРОФИЛЬ 304 нерж',lbl:'20*1,5 (п.м)',spec:'20*20*1,5'},
    AL:{u:1800.0,ost:0.2,rah:0.04,sec:'ТРУБА 304 нерж',lbl:'15*1 (п.м)',spec:'д15*1,5'},
    AM:{u:1975.0,ost:0.2,rah:0.04,sec:'ТРУБА 304 нерж',lbl:'16*1,5 (п.м)',spec:'д16*1,5'},
    AN:{u:3950.0,ost:0.2,rah:0.04,sec:'ТРУБА 304 нерж',lbl:'32*2 (п.м)',spec:'д32*2'},
    AO:{u:4690.83333333333,ost:0.2,rah:0.04,sec:'ТРУБА 304 нерж',lbl:'38*2 (п.м)',spec:'д38*2'},
    AP:{u:800.0,ost:0.2,rah:0.04,sec:'ТРУБА черн',lbl:'22*2 (п.м)',spec:'д22*1,5'},
    AQ:{u:900.0,ost:0.2,rah:0.04,sec:'ТРУБА черн',lbl:'27*2 (п.м)',spec:'д27*1,5'},
    AR:{u:1200.0,ost:0.2,rah:0.04,sec:'ТРУБА черн',lbl:'32*2,5 (п.м)',spec:'д32*2,5'},
    AS:{u:3000.0,ost:0.2,rah:0.04,sec:'ТРУБА черн',lbl:'76*3 (п.м)',spec:'д76*3'},
    AT:{u:300.0,ost:0.15,rah:0.04,sec:'ПРУТ 304 нерж',lbl:'3мм (п.м)',spec:'д3'},
    AU:{u:370.0,ost:0.15,rah:0.04,sec:'ПРУТ 304 нерж',lbl:'5мм (п.м)',spec:'д5'},
    AV:{u:1550.0,ost:0.15,rah:0.04,sec:'ПРУТ 304 нерж',lbl:'8мм (п.м)',spec:'д8'},
    AW:{u:1550.0,ost:0.15,rah:0.04,sec:'ПРУТ 304 нерж',lbl:'10мм (п.м)',spec:'д10'},
    AX:{u:2015.0,ost:0.15,rah:0.04,sec:'ПРУТ 304 нерж',lbl:'12мм (п.м)',spec:'д12'},
    AY:{u:3608.0,ost:0.15,rah:0.04,sec:'ПРУТ 304 нерж',lbl:'16мм (п.м)',spec:' д16'}
  };
  // component columns AZ..BN : u=price per piece, ost,rah, m=labor multiplier (row3)
  var CMP={
    AZ:{u:7500.0,ost:0.0,rah:0.07,m:1.0,sec:'КОЛЕСА',lbl:'100 жар (шт)'},
    BA:{u:2400.0,ost:0.0,rah:0.07,m:1.0,sec:'КОЛЕСА',lbl:'100 (шт)'},
    BB:{u:1700.0,ost:0.0,rah:0.07,m:1.0,sec:'КОЛЕСА',lbl:'75 (шт)'},
    BC:{u:200.0,ost:0.0,rah:0.07,m:5.0,sec:'СМАЗКА',lbl:'одна отвертка'},
    BD:{u:500.0,ost:0.0,rah:0.01,m:3.0,sec:'ЗАГЛУШКИ',lbl:'Регул ножка 40*40'},
    BE:{u:50.0,ost:0.0,rah:0.01,m:3.0,sec:'ЗАГЛУШКИ',lbl:'Заглушка'},
    BF:{u:20.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Заклепки (шт)'},
    BG:{u:100.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Болт М8*40'},
    BH:{u:205.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Болт М10*50'},
    BI:{u:2815.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Болт М20*200'},
    BJ:{u:20.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Шайба '},
    BK:{u:40.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Гайка М8'},
    BL:{u:69.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Гайка М10'},
    BM:{u:510.0,ost:0.0,rah:0.01,m:3.0,sec:'КРЕПЕЖ 304 нерж',lbl:'Гайка м20'},
    BN:{u:3500.0,ost:0.15,rah:0.04,m:5.0,sec:'КРАСКА',lbl:'Краска (кв.м)'}
  };

  // operations D..L : table + price multiplier; ост 0, рах 0.07 ; weld шлейф mult 0.5
  var OPS={
    D:{t:'CB',mult:1,sec:'РЕЗКА',lbl:'Лист выбор 1 (м)'},
    E:{t:'CB',mult:1,sec:'РЕЗКА',lbl:'Лист выбор 2 (м)'},
    F:{t:'CB',mult:1,sec:'РЕЗКА',lbl:'Лист выбор 3 (м)'},
    G:{t:'CB',mult:3,sec:'РЕЗКА',lbl:'Труба рез (м)'},
    H:{t:'CB',mult:1,sec:'ГИБКА',lbl:'Лист гиб (кол)'},
    I:{t:'CB',mult:3,sec:'ГИБКА',lbl:'Труба гиб (кол)'},
    J:{t:'CB',mult:1,sec:'ГИБКА',lbl:'Прут гиб (кол)'},
    K:{t:'SS',mult:1,sec:'СВАРКА',lbl:'Нерж (см)',shleif:0.5},
    L:{t:'BL',mult:1,sec:'СВАРКА',lbl:'Черн (см)',shleif:0.5}
  };
  var OP_RAH=0.07, OP_OST=0.0;

  function approxTier(qty,tiers){var idx=0;for(var i=0;i<tiers.length;i++)if(qty>=tiers[i])idx=i;return idx;}
  function lookup(table,tiers,th,qty){var row=table[th];if(!row)return 0;return row[approxTier(qty,tiers)]||0;}
  function opRate(code,th,qty){
    if(code==='SS')return lookup(WELD_SS,WELD_TIERS,th,qty);
    if(code==='BL')return lookup(WELD_BLACK,WELD_TIERS,th,qty);
    return lookup(CUTBEND,CUTBEND_TIERS,th,qty);
  }
  function taxGrossUp(rate){return rate/(1-rate);}

  // inputs: { ops:{D:{th,qty},...}, materials:{M:qty,...}, components:{AZ:qty,...},
  //           urgency:0|1|2, engCoef:0.03|0.09|0.18|1, montazh:0|1, taxRate:0.16 }
  // OP kinds -> table + price multiplier (×3 for tube/profile cut & bend)
  var KIND={
    cut:      {t:'CB',mult:1,sec:'РЕЗКА', lbl:'Резка листа (м)'},
    cutTube:  {t:'CB',mult:3,sec:'РЕЗКА', lbl:'Резка трубы/профиля (м)'},
    bend:     {t:'CB',mult:1,sec:'ГИБКА', lbl:'Гибка листа (кол.)'},
    bendTube: {t:'CB',mult:3,sec:'ГИБКА', lbl:'Гибка трубы (кол.)'},
    bendRod:  {t:'CB',mult:1,sec:'ГИБКА', lbl:'Гибка прута (кол.)'},
    weldSS:   {t:'SS',mult:1,sec:'СВАРКА',lbl:'Сварка нерж (см)'},
    weldBlack:{t:'BL',mult:1,sec:'СВАРКА',lbl:'Сварка черн (см)'}
  };

  // inputs:
  //  operations: [{kind:'cut'|'cutTube'|'bend'|'bendTube'|'bendRod'|'weldSS'|'weldBlack', thickness, qty}]
  //  materials:  [{code:'M'.. 'AY', qty}]
  //  components: [{code:'AZ'..'BN', qty}]
  //  urgency:0|1|2, engCoef:0..1, montazh:0|1, shleifRate:0.5, taxRate:0.16
  function compute(inp){
    inp=inp||{};
    var operations=inp.operations||[], materials=inp.materials||[], components=inp.components||[];
    var line=[];
    var sumOps=0, weldSSsum=0, weldBlackSum=0;

    operations.forEach(function(op){
      var k=KIND[op.kind]; if(!k)return;
      var qty=+op.qty||0, th=+op.thickness||0; if(qty<=0||th<=0)return;
      var rate=opRate(k.t,th,qty)*k.mult;
      var base=rate*qty;
      var r7=base*(1+OP_OST)*(1+OP_RAH);
      sumOps+=r7;
      if(k.t==='SS')weldSSsum+=r7; if(k.t==='BL')weldBlackSum+=r7;
      line.push({group:'op',kind:op.kind,section:k.sec,name:k.lbl,thickness:th,qty:qty,unit:rate,base:base,ostatki:OP_OST,rashod:OP_RAH,lineTotal:r7,worker:null});
    });

    // шлейф = shleifRate × weld (sheet: 0.5 of each weld grade)
    var shleifRate=(inp.shleifRate!=null?+inp.shleifRate:0.5);
    var K4=weldSSsum*shleifRate, L4=weldBlackSum*shleifRate;
    if(K4)line.push({group:'shleif',section:'ШЛЕЙФ',name:'Шлейф нерж ('+(shleifRate*100)+'% сварки)',lineTotal:K4,worker:null});
    if(L4)line.push({group:'shleif',section:'ШЛЕЙФ',name:'Шлейф черн ('+(shleifRate*100)+'% сварки)',lineTotal:L4,worker:null});

    // materials M..AY : true area/length × price, +ост +рах
    var matSum=0;
    materials.forEach(function(m){
      var M=MAT[m.code], q=+m.qty||0; if(!M||q<=0)return;
      var b=M.u*q, r7m=b*(1+M.ost)*(1+M.rah);
      matSum+=r7m;
      line.push({group:'material',code:m.code,section:M.sec,name:M.lbl,qty:q,unit:M.u,base:b,ostatki:M.ost,rashod:M.rah,lineTotal:r7m,worker:null});
    });

    // components AZ..BN : material (row7) + labor (row7 × multiplier)
    var compMat=0, compLabor=0;
    components.forEach(function(c){
      var Cn=CMP[c.code], q=+c.qty||0; if(!Cn||q<=0)return;
      var b=Cn.u*q, r7c=b*(1+Cn.ost)*(1+Cn.rah), r4c=r7c*Cn.m;
      compMat+=r7c; compLabor+=r4c;
      line.push({group:'component',code:c.code,section:Cn.sec,name:Cn.lbl,qty:q,unit:Cn.u,base:b,ostatki:Cn.ost,rashod:Cn.rah,material:r7c,laborMult:Cn.m,labor:r4c,lineTotal:r7c+r4c,worker:null});
    });

    // монтаж = (weldSS + weldBlack + шлейф) × montazh
    var montazh=+inp.montazh||0;
    var J4=(weldSSsum+weldBlackSum+K4+L4)*montazh;
    if(J4)line.push({group:'montazh',section:'МОНТАЖ',name:'Монтаж',lineTotal:J4,worker:null});

    // срочность C : base = everything except urgency; C7 = (base/days)×1.01×1.01
    var C12=sumOps+matSum+compMat+compLabor+K4+L4+J4;
    var urgency=+inp.urgency||0;
    var C7=urgency>0 ? (C12/urgency)*1.01*1.01 : 0;
    if(C7)line.push({group:'urgency',section:'СРОЧНОСТЬ',name:(urgency===1?'Срочность 1 день':'Срочность 2 дня'),lineTotal:C7,worker:null});

    // инженерные = (C7 + ops + шлейф + compLabor + монтаж) × coef
    var engCoef=(inp.engCoef!=null?+inp.engCoef:0);
    var G3=C7+sumOps+K4+L4+compLabor+J4;
    var E3=G3*engCoef;
    if(E3)line.push({group:'engineering',section:'ИНЖЕНЕРНЫЕ',name:'Инженерные '+Math.round(engCoef*100)+'%',base:G3,lineTotal:E3,worker:null});

    // подытог (A4)
    var subtotal=E3 + C7 + sumOps + matSum + compMat + K4 + L4 + J4 + compLabor;

    var taxRate=(inp.taxRate!=null?+inp.taxRate:0.16);
    var gross=taxGrossUp(taxRate);
    var taxAmount=subtotal*gross, total=subtotal+taxAmount;

    return {lineItems:line,opsBase:sumOps,materials:matSum,componentsMat:compMat,componentsLabor:compLabor,
            shleif:K4+L4,montazh:J4,urgency:C7,engineering:E3,subtotal:subtotal,
            taxRate:taxRate,taxGrossUp:gross,taxAmount:taxAmount,total:total};
  }

  root.CALC={compute:compute,MAT:MAT,CMP:CMP,OPS:OPS,opRate:opRate,taxGrossUp:taxGrossUp,TH:TH};
})(typeof window!=='undefined'?window:globalThis);
