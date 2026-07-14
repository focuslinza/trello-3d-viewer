/* ============================================================
   DXF sheet-metal calculations + tessellation for rendering.
   Verified against known shapes (rect+hole, arc, bulge D-shape).
   Exposes window.DXFCALC.compute(parsedDxf) -> { metrics, polylines, bbox }
   ============================================================ */
window.DXFCALC = (function () {

  function unitToMeters(insunits) {
    switch (insunits) {
      case 1: return 0.0254;   // inch
      case 2: return 0.3048;   // feet
      case 4: return 0.001;    // mm
      case 5: return 0.01;     // cm
      case 6: return 1;        // m
      default: return 0.001;   // assume mm if unitless/unknown
    }
  }
  function unitName(insunits){ return ({1:'дюймы',2:'футы',4:'мм',5:'см',6:'м'})[insunits] || 'мм (предположительно)'; }
  function isMm(insunits){ return !insunits || insunits===4; }

  // Bend centerlines: Onshape uses SHEETMETAL_BEND_LINES_UP/DOWN; others use
  // BEND/СГИБ. The bend "tangent" lines mark the bend region edges, not the
  // bend itself, so they must NOT be counted.
  function isBendLayer(name){
    name = name || '';
    if (/tangent/i.test(name)) return false;
    return /bend|сгиб|biege|\bgib\b|fold/i.test(name);
  }
  // Non-cut helper geometry (annotations, construction, view lines, tangents…)
  function isIgnoredLayer(name){
    return /dim|text|annot|center|осев|размер|hidden|note|штрих|defpoints|tangent|section|detail_view|virtual|thread|explode|break|hatch|construction|sketch|invisible|centermark|tables|images/i.test(name||'');
  }

  // Detect bend lines marked as PAIRS of small semicircular notches on opposite
  // edges (the way a KOMPAS engineer marks a bend for the press-brake operator).
  // arcs: [{cx,cy,r,sweepDeg}] ; bbox: {minX,minY,maxX,maxY}
  // Returns array of bend positions: [{axis:'y'|'x', coord}] (one per bend line).
  function detectBendNotches(arcs, bbox){
    var W=bbox.maxX-bbox.minX, H=bbox.maxY-bbox.minY, minDim=Math.min(W,H)||1;
    var edgeTol=Math.max(minDim*0.01,1);
    var horizY=[], vertX=[];
    arcs.forEach(function(a){
      if(a.sweepDeg<150||a.sweepDeg>210) return;   // must be ~semicircular (180°)
      if(a.r>minDim*0.1) return;                   // must be a small notch
      var onLeft  = Math.abs(a.cx-bbox.minX)<=edgeTol+a.r;
      var onRight = Math.abs(a.cx-bbox.maxX)<=edgeTol+a.r;
      var onBot   = Math.abs(a.cy-bbox.minY)<=edgeTol+a.r;
      var onTop   = Math.abs(a.cy-bbox.maxY)<=edgeTol+a.r;
      if(onLeft||onRight) horizY.push(a.cy);
      else if(onBot||onTop) vertX.push(a.cx);
    });
    function clusterMeans(vals){
      if(!vals.length) return [];
      vals.sort(function(a,b){return a-b;});
      var tol=Math.max(minDim*0.02,2), groups=[[vals[0]]];
      for(var i=1;i<vals.length;i++){
        if(vals[i]-vals[i-1]>tol) groups.push([]);
        groups[groups.length-1].push(vals[i]);
      }
      return groups.map(function(g){ return g.reduce(function(s,v){return s+v;},0)/g.length; });
    }
    var out=[];
    clusterMeans(horizY).forEach(function(y){ out.push({axis:'y', coord:y}); });
    clusterMeans(vertX).forEach(function(x){ out.push({axis:'x', coord:x}); });
    return out;
  }

  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

  function bulgePoints(p0, p1, bulge, out){
    if (!bulge) { out.push({x:p1.x,y:p1.y}); return; }
    var theta = 4*Math.atan(bulge);
    var chord = dist(p0,p1);
    if (chord === 0) { out.push({x:p1.x,y:p1.y}); return; }
    var radius = chord/(2*Math.sin(theta/2));
    var mx=(p0.x+p1.x)/2, my=(p0.y+p1.y)/2;
    var dx=p1.x-p0.x, dy=p1.y-p0.y;
    var h = radius*Math.cos(theta/2);
    var nx=-dy/chord, ny=dx/chord;
    var s = bulge>0 ? 1 : -1;
    var cx = mx + s*h*nx, cy = my + s*h*ny;
    var a0 = Math.atan2(p0.y-cy, p0.x-cx);
    var dir = bulge>0 ? 1 : -1;
    var n = Math.max(2, Math.ceil(Math.abs(theta)/(Math.PI/24)));
    for (var i=1;i<=n;i++){
      var ang = a0 + dir*Math.abs(theta)*(i/n);
      out.push({x: cx+Math.abs(radius)*Math.cos(ang), y: cy+Math.abs(radius)*Math.sin(ang)});
    }
  }

  function polylinePoints(vertices, closed){
    var pts=[];
    if (!vertices || !vertices.length) return pts;
    pts.push({x:vertices[0].x, y:vertices[0].y});
    for (var i=0;i<vertices.length-1;i++) bulgePoints(vertices[i], vertices[i+1], vertices[i].bulge, pts);
    if (closed) bulgePoints(vertices[vertices.length-1], vertices[0], vertices[vertices.length-1].bulge, pts);
    return pts;
  }
  function circlePoints(c,r){ var p=[],n=72; for(var i=0;i<=n;i++){var a=i/n*2*Math.PI; p.push({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)});} return p; }
  function arcPoints(c,r,a0,a1){ // radians (dxf-parser convention)
    while(a1<=a0) a1+=2*Math.PI;
    var sweep=a1-a0, n=Math.max(2,Math.ceil(sweep/(Math.PI/24))), p=[];
    for(var i=0;i<=n;i++){var a=a0+sweep*(i/n); p.push({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)});}
    return p;
  }
  function polylineLength(pts){ var L=0; for(var i=0;i<pts.length-1;i++) L+=dist(pts[i],pts[i+1]); return L; }
  function shoelace(pts){ var A=0; for(var i=0;i<pts.length;i++){var j=(i+1)%pts.length; A+=pts[i].x*pts[j].y - pts[j].x*pts[i].y;} return Math.abs(A)/2; }

  // Many CAD exports (e.g. KOMPAS, AutoCAD) draw a contour as many separate
  // LINE/ARC pieces instead of one closed polyline. Stitch those pieces back
  // into closed loops so the enclosed area can be measured.
  function stitchLoops(edges, tol){
    var used = new Array(edges.length); var loops=[];
    function near(a,b){ return Math.abs(a.x-b.x)<=tol && Math.abs(a.y-b.y)<=tol; }
    for (var i=0;i<edges.length;i++){
      if (used[i]) continue;
      used[i]=true;
      var chain = edges[i].slice();
      var start = chain[0];
      var guard=0;
      while (guard++ < edges.length+2){
        var end = chain[chain.length-1];
        if (near(end,start) && chain.length>2){ loops.push(chain); break; }
        var found=-1, rev=false;
        for (var j=0;j<edges.length;j++){
          if (used[j]) continue;
          var e=edges[j];
          if (near(e[0],end)){ found=j; rev=false; break; }
          if (near(e[e.length-1],end)){ found=j; rev=true; break; }
        }
        if (found<0) break;
        used[found]=true;
        var seg=edges[found].slice(); if (rev) seg.reverse();
        chain = chain.concat(seg.slice(1));
      }
    }
    return loops;
  }

  // Многие CAD (новые AutoCAD, SolidWorks, Inventor) кладут геометрию детали
  // внутрь БЛОКА, а в ENTITIES оставляют лишь ссылку INSERT. Разворачиваем
  // блоки в плоский список сущностей, применяя смещение/поворот/масштаб.
  function matMul(A,B){ // сначала B, потом A;  x'=a*x+c*y+e; y'=b*x+d*y+f
    return { a:A.a*B.a+A.c*B.b, b:A.b*B.a+A.d*B.b,
             c:A.a*B.c+A.c*B.d, d:A.b*B.c+A.d*B.d,
             e:A.a*B.e+A.c*B.f+A.e, f:A.b*B.e+A.d*B.f+A.f };
  }
  function matPoint(M,p){ return { x: M.a*p.x + M.c*p.y + M.e, y: M.b*p.x + M.d*p.y + M.f, bulge: p.bulge }; }
  function insertMatrix(ins, basePoint){
    var sx = (ins.xScale!=null?ins.xScale:1) || 1;
    var sy = (ins.yScale!=null?ins.yScale:sx) || sx;
    var rot = (ins.rotation||0)*Math.PI/180;
    var cos=Math.cos(rot), sin=Math.sin(rot);
    var pos = ins.position || {x:0,y:0};
    var base = basePoint || {x:0,y:0};
    // p' = pos + R·S·(p - base)
    var M = { a:cos*sx, b:sin*sx, c:-sin*sy, d:cos*sy, e:0, f:0 };
    M.e = pos.x - (M.a*base.x + M.c*base.y);
    M.f = pos.y - (M.b*base.x + M.d*base.y);
    return M;
  }
  function transformEntity(e, M){
    var det = M.a*M.d - M.b*M.c;
    var scaleAvg = Math.sqrt(Math.abs(det)) || 1;
    var uniform = Math.abs((M.a*M.a+M.b*M.b) - (M.c*M.c+M.d*M.d)) < 1e-6;
    var out = {};
    for (var k in e) out[k] = e[k];
    if (e.vertices) out.vertices = e.vertices.map(function(p){
      var q = matPoint(M, p);
      if (det < 0 && q.bulge) q.bulge = -q.bulge; // зеркало меняет направление дуг
      return q;
    });
    if ((e.type==='CIRCLE' || e.type==='ARC') && e.center){
      if (e.type==='ARC' && (det < 0 || !uniform)){
        // зеркальный/неравномерный масштаб: считаем дугу точками в системе блока
        // и переносим точки — длина реза остаётся верной
        var pts = arcPoints(e.center, e.radius, e.startAngle, e.endAngle).map(function(p){ return matPoint(M,p); });
        return { type:'LWPOLYLINE', layer:e.layer, shape:false, vertices:pts };
      }
      out.center = matPoint(M, e.center);
      out.radius = (e.radius||0) * scaleAvg;
      if (e.type==='ARC'){
        var rot = Math.atan2(M.b, M.a);
        out.startAngle = e.startAngle + rot;
        out.endAngle = e.endAngle + rot;
      }
    }
    if (e.fitPoints) out.fitPoints = e.fitPoints.map(function(p){ return matPoint(M,p); });
    if (e.controlPoints) out.controlPoints = e.controlPoints.map(function(p){ return matPoint(M,p); });
    return out;
  }
  var IDENT = { a:1,b:0,c:0,d:1,e:0,f:0 };
  function expandEntities(dxf){
    var blocks = dxf.blocks || {};
    var out = [];
    function walk(list, M, inheritLayer, depth){
      if (!list || depth > 8) return;
      list.forEach(function(e){
        if (!e) return;
        if (e.type === 'INSERT'){
          var blk = blocks[e.name];
          if (!blk || !blk.entities) return;
          var M2 = matMul(M, insertMatrix(e, blk.position));
          // сущности на слое «0» внутри блока наследуют слой вставки
          walk(blk.entities, M2, e.layer || inheritLayer, depth + 1);
          return;
        }
        var e2 = (M === IDENT) ? e : transformEntity(e, M);
        if ((!e2.layer || e2.layer === '0') && inheritLayer && M !== IDENT){
          var copy = {}; for (var k in e2) copy[k] = e2[k];
          copy.layer = inheritLayer; e2 = copy;
        }
        out.push(e2);
      });
    }
    walk(dxf.entities || [], IDENT, '', 0);
    return out;
  }

  function compute(dxf){
    var insunits = dxf.header && dxf.header['$INSUNITS'];
    var u = unitToMeters(insunits);
    var cutLen=0, bendCount=0, closedAreas=[], openEdges=[], arcsForBend=[];
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    var polylines=[]; // {pts, kind}
    function track(p){ if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y; }

    expandEntities(dxf).forEach(function(e){
      var layer=e.layer||'';
      var bend=isBendLayer(layer), ignored=isIgnoredLayer(layer);
      var pts=null, closed=false;

      if (e.type==='LINE' && e.vertices && e.vertices.length>=2){ pts=[{x:e.vertices[0].x,y:e.vertices[0].y},{x:e.vertices[1].x,y:e.vertices[1].y}]; }
      else if ((e.type==='LWPOLYLINE'||e.type==='POLYLINE') && e.vertices){ closed=!!e.shape; pts=polylinePoints(e.vertices, closed); }
      else if (e.type==='CIRCLE' && e.center){ pts=circlePoints(e.center,e.radius); closed=true; }
      else if (e.type==='ARC' && e.center){ pts=arcPoints(e.center,e.radius,e.startAngle,e.endAngle); }
      else if (e.type==='SPLINE'){ var v=(e.fitPoints&&e.fitPoints.length)?e.fitPoints:e.controlPoints; if(v) pts=v.map(function(q){return{x:q.x,y:q.y};}); }

      if (!pts || pts.length<2) return;
      pts.forEach(track);

      var kind = bend ? 'bend' : (ignored ? 'ignore' : 'cut');
      polylines.push({ pts: pts, kind: kind });

      if (kind==='bend'){ bendCount++; return; }
      if (kind==='ignore') return;
      // collect cut arcs as bend-notch candidates
      if (e.type==='ARC' && e.center){
        var sw=(e.endAngle-e.startAngle)*180/Math.PI; if(sw<0)sw+=360;
        arcsForBend.push({cx:e.center.x, cy:e.center.y, r:e.radius, sweepDeg:sw});
      }
      cutLen += polylineLength(pts);
      if (closed) closedAreas.push(shoelace(pts));
      else openEdges.push(pts);
    });

    // stitch separate line/arc edges into closed loops, add their areas
    var maxDim = (isFinite(minX) ? Math.max(maxX-minX, maxY-minY) : 0) || 1;
    var tol = Math.max(maxDim*1e-4, 1e-3);
    stitchLoops(openEdges, tol).forEach(function(lp){ closedAreas.push(shoelace(lp)); });

    // bends from notch pairs (KOMPAS) added to bends from bend-layer lines (Onshape)
    if (isFinite(minX)){
      var notchBends = detectBendNotches(arcsForBend, {minX:minX,minY:minY,maxX:maxX,maxY:maxY});
      bendCount += notchBends.length;
      // draw a bend line across the part between each detected notch pair
      notchBends.forEach(function(b){
        var seg = (b.axis==='y')
          ? [{x:minX,y:b.coord},{x:maxX,y:b.coord}]
          : [{x:b.coord,y:minY},{x:b.coord,y:maxY}];
        polylines.push({ pts: seg, kind: 'bend' });
      });
    }

    var areaMm2=0;
    if (closedAreas.length){
      closedAreas.sort(function(a,b){return b-a;});
      var outer=closedAreas[0];
      var holes=closedAreas.slice(1).reduce(function(s,a){return s+a;},0);
      areaMm2 = Math.max(0, outer-holes);
    }

    var hasGeom = isFinite(minX);
    var bboxW = hasGeom ? (maxX-minX) : 0;
    var bboxH = hasGeom ? (maxY-minY) : 0;

    return {
      polylines: polylines,
      bbox: hasGeom ? { minX:minX, minY:minY, maxX:maxX, maxY:maxY } : null,
      metrics: {
        insunits: insunits,
        unitName: unitName(insunits),
        unitsAreMm: isMm(insunits),
        bboxW_native: bboxW,
        bboxH_native: bboxH,
        bboxW_mm: bboxW*(u/0.001),
        bboxH_mm: bboxH*(u/0.001),
        bboxAreaM2: bboxW*u*bboxH*u,
        partAreaM2: areaMm2*u*u,
        cutLenM: cutLen*u,
        bendCount: bendCount
      }
    };
  }

  return { compute: compute };
})();
