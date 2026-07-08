// ============================================================================
// Чистые геометрические функции для STEP-просмотрщика — без зависимости от
// Three.js/WebGL, чтобы их можно было проверить обычным Node.js-тестом.
// ============================================================================
(function (root) {

  // brepFaces: [{first,last,color}] — диапазоны ИНДЕКСОВ ТРЕУГОЛЬНИКОВ (не вершин!)
  // из occt-import-js. Строим массив длиной в кол-во треугольников, где для
  // каждого треугольника лежит номер исходной CAD-грани — O(1) на наведении.
  function buildTriToFaceMap(brepFaces, triangleCount) {
    var map = new Int32Array(triangleCount).fill(-1);
    for (var f = 0; f < brepFaces.length; f++) {
      var bf = brepFaces[f];
      var lo = Math.max(0, bf.first|0), hi = Math.min(triangleCount - 1, bf.last|0);
      for (var i = lo; i <= hi; i++) map[i] = f;
    }
    return map;
  }

  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function cross(a, b) { return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x }; }
  function dot(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
  function length(a) { return Math.sqrt(dot(a, a)); }
  function normalize(a) { var l = length(a) || 1; return { x: a.x/l, y: a.y/l, z: a.z/l }; }

  // нормаль треугольника (v0,v1,v2), с учётом порядка вершин (правая рука)
  function triangleNormal(v0, v1, v2) {
    return normalize(cross(sub(v1, v0), sub(v2, v0)));
  }

  // средняя нормаль грани — усредняем по всем треугольникам диапазона, а не берём
  // только первый: на плоской грани все совпадают, но так надёжнее при погрешностях
  // тесселяции у слегка изогнутых/швейных граней.
  function averageFaceNormal(positions, indices, first, last) {
    var sum = { x:0, y:0, z:0 }, n = 0;
    for (var t = first; t <= last; t++) {
      var i0 = indices[t*3]*3, i1 = indices[t*3+1]*3, i2 = indices[t*3+2]*3;
      var v0 = { x:positions[i0], y:positions[i0+1], z:positions[i0+2] };
      var v1 = { x:positions[i1], y:positions[i1+1], z:positions[i1+2] };
      var v2 = { x:positions[i2], y:positions[i2+1], z:positions[i2+2] };
      var nrm = triangleNormal(v0, v1, v2);
      if (isNaN(nrm.x)) continue; // вырожденный (нулевой площади) треугольник — пропускаем
      sum.x += nrm.x; sum.y += nrm.y; sum.z += nrm.z; n++;
    }
    if (!n) return { x:0, y:0, z:1 };
    return normalize({ x: sum.x/n, y: sum.y/n, z: sum.z/n });
  }

  // угол между двумя гранями по их нормалям, в градусах.
  // Возвращает ОБА распространённых определения — терминология гибки различается
  // в разных цехах, показываем оба, чтобы не гадать, какое ждёт работник:
  //  - angleBetweenNormals: сырой угол между нормалями (0° = грани сонаправлены/копланарны)
  //  - includedAngle: угол между самими ПЛОСКОСТЯМИ граней, как его видно "изнутри"
  //    сгиба (180° = плоский лист без сгиба, меньше 180° = согнуто)
  function dihedralAngle(n1, n2) {
    var c = Math.max(-1, Math.min(1, dot(n1, n2)));
    var betweenNormals = Math.acos(c) * 180 / Math.PI;
    var included = 180 - betweenNormals;
    return { angleBetweenNormals: betweenNormals, includedAngle: included };
  }

  // ---- PCA по облаку точек (для оси цилиндрического сгиба) ----
  // Возвращает ось наибольшей дисперсии (обычно совпадает с линией сгиба для
  // вытянутой цилиндрической полосы) как единичный вектор.
  function pcaAxis(points) {
    var n = points.length;
    var mean = { x:0, y:0, z:0 };
    for (var i = 0; i < n; i++) { mean.x += points[i].x; mean.y += points[i].y; mean.z += points[i].z; }
    mean.x /= n; mean.y /= n; mean.z /= n;
    var cxx=0, cxy=0, cxz=0, cyy=0, cyz=0, czz=0;
    for (var j = 0; j < n; j++) {
      var dx = points[j].x - mean.x, dy = points[j].y - mean.y, dz = points[j].z - mean.z;
      cxx += dx*dx; cxy += dx*dy; cxz += dx*dz; cyy += dy*dy; cyz += dy*dz; czz += dz*dz;
    }
    // степенной метод для наибольшего собственного вектора симметричной 3x3-матрицы
    var v = { x:1, y:1, z:1 };
    for (var k = 0; k < 60; k++) {
      var nx = cxx*v.x + cxy*v.y + cxz*v.z;
      var ny = cxy*v.x + cyy*v.y + cyz*v.z;
      var nz = cxz*v.x + cyz*v.y + czz*v.z;
      var l = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      v = { x: nx/l, y: ny/l, z: nz/l };
    }
    return { axis: v, mean: mean };
  }

  // ---- Алгебраическая подгонка окружности по 2D-точкам (метод Кейса) ----
  function fitCircle2D(pts2d) {
    var n = pts2d.length;
    if (n < 3) return null;
    var sx=0, sy=0;
    for (var i=0;i<n;i++){ sx+=pts2d[i].u; sy+=pts2d[i].v; }
    var mx = sx/n, my = sy/n;
    // центрируем для устойчивости, затем решаем систему методом наименьших квадратов
    var Suu=0, Suv=0, Svv=0, Suuu=0, Svvv=0, Suvv=0, Svuu=0;
    for (var j=0;j<n;j++){
      var u = pts2d[j].u - mx, v = pts2d[j].v - my;
      Suu += u*u; Suv += u*v; Svv += v*v;
      Suuu += u*u*u; Svvv += v*v*v; Suvv += u*v*v; Svuu += v*u*u;
    }
    var det = Suu*Svv - Suv*Suv;
    if (Math.abs(det) < 1e-12) return null; // точки почти на прямой — не окружность
    var rhsU = 0.5*(Suuu + Suvv), rhsV = 0.5*(Svvv + Svuu);
    var uc = (Svv*rhsU - Suv*rhsV) / det;
    var vc = (Suu*rhsV - Suv*rhsU) / det;
    var r2 = uc*uc + vc*vc + (Suu + Svv) / n;
    var radius = Math.sqrt(Math.max(0, r2));
    return { u: uc + mx, v: vc + my, radius: radius };
  }

  // Проецирует 3D-точки на плоскость, перпендикулярную axis, вокруг point,
  // возвращая 2D-координаты (u,v) в этой плоскости — вход для fitCircle2D.
  function projectToPlane(points, axis, point) {
    var a = normalize(axis);
    var ref = Math.abs(a.x) < 0.9 ? { x:1,y:0,z:0 } : { x:0,y:1,z:0 };
    var u = normalize(cross(a, ref));
    var v = normalize(cross(a, u));
    return points.map(function (p) {
      var d = sub(p, point);
      return { u: dot(d, u), v: dot(d, v) };
    });
  }

  // Собирает уникальные вершины треугольников грани [first,last] (не дублируя
  // общие вершины между соседними треугольниками одной грани).
  function uniqueFaceVertices(positions, indices, first, last) {
    var seen = {}, out = [];
    for (var t = first; t <= last; t++) {
      for (var k = 0; k < 3; k++) {
        var vi = indices[t*3+k];
        if (seen[vi]) continue;
        seen[vi] = 1;
        out.push({ x: positions[vi*3], y: positions[vi*3+1], z: positions[vi*3+2] });
      }
    }
    return out;
  }

  // Оценка радиуса цилиндрической/скруглённой грани: PCA -> ось -> проекция ->
  // подгонка окружности. Возвращает null, если грань похожа на плоскую (радиус
  // получается неправдоподобно большим) — тогда это не сгиб, а плоский участок.
  function estimateFaceRadius(positions, indices, first, last) {
    var pts = uniqueFaceVertices(positions, indices, first, last);
    if (pts.length < 6) return null;
    var pca = pcaAxis(pts);
    var proj = projectToPlane(pts, pca.axis, pca.mean);
    var fit = fitCircle2D(proj);
    if (!fit) return null;
    return { radius: fit.radius, pointCount: pts.length };
  }

  // ==========================================================================
  // Выделение РЁБЕР исходной CAD-модели из треугольной сетки. У occt-import-js
  // нет готовых кривых рёбер (только треугольники) — ребро CAD-модели мы
  // определяем как границу между ДВУМЯ РАЗНЫМИ гранями (brep_faces), либо как
  // открытый край сетки (используется только одним треугольником). Соседние
  // отрезки одной и той же пары граней склеиваются в одну цепочку — это и есть
  // одно логическое ребро (для дуги — цепочка из многих мелких отрезков).
  // ==========================================================================
  function edgeKey(a, b) { return a < b ? a + '_' + b : b + '_' + a; }

  function extractFeatureEdges(positions, indices, triToFace) {
    var triCount = indices.length / 3;
    var edgeFaces = {};  // "v1_v2" -> {v1,v2, faceSet:{faceIdx:true}, triCount:number}
    for (var t = 0; t < triCount; t++) {
      var a = indices[t*3], b = indices[t*3+1], c = indices[t*3+2];
      var face = triToFace[t];
      [[a,b],[b,c],[c,a]].forEach(function (pair) {
        var k = edgeKey(pair[0], pair[1]);
        var e = edgeFaces[k] || (edgeFaces[k] = { v1: pair[0], v2: pair[1], faceSet: {}, triCount: 0 });
        e.faceSet[face] = true;
        e.triCount++;
      });
    }
    // Настоящее ребро CAD-модели — это граница МЕЖДУ ДВУМЯ РАЗНЫМИ гранями,
    // либо открытый край сетки (ребро использовано ровно одним треугольником).
    // Если ребро лежит внутри ОДНОЙ грани и использовано двумя треугольниками —
    // это просто внутренняя линия триангуляции (например, изогнутой грани), а
    // не настоящее ребро — её отбрасываем, иначе "рёбер" была бы туча лишних.
    var keyInfo = {};
    var featureAdj = {};
    Object.keys(edgeFaces).forEach(function (k) {
      var e = edgeFaces[k];
      var faceIds = Object.keys(e.faceSet);
      var isFeature = (faceIds.length >= 2) || (e.triCount === 1);
      if (!isFeature) return;
      var faceTag = faceIds.length >= 2 ? faceIds.sort().join('-') : ('open' + faceIds[0]);
      keyInfo[k] = { v1: e.v1, v2: e.v2, faceTag: faceTag };
      (featureAdj[e.v1] = featureAdj[e.v1] || []).push({ other: e.v2, key: k });
      (featureAdj[e.v2] = featureAdj[e.v2] || []).push({ other: e.v1, key: k });
    });
    // склеиваем связные цепочки рёбер с ОДНИМ И ТЕМ ЖЕ faceTag в одно логическое ребро
    var visited = {};
    var edges = [];
    Object.keys(keyInfo).forEach(function (startKey) {
      if (visited[startKey]) return;
      var tag = keyInfo[startKey].faceTag;
      // обходим цепочку в обе стороны от стартового отрезка
      var chainKeys = [startKey];
      visited[startKey] = true;
      [keyInfo[startKey].v1, keyInfo[startKey].v2].forEach(function (endVertex, side) {
        var cur = endVertex, guard = 0;
        while (guard++ < 100000) {
          var neighbors = (featureAdj[cur] || []).filter(function (n) {
            return !visited[n.key] && keyInfo[n.key] && keyInfo[n.key].faceTag === tag;
          });
          if (neighbors.length !== 1) break; // конец цепочки, развилка или другая грань
          var nx = neighbors[0];
          visited[nx.key] = true;
          if (side === 0) chainKeys.unshift(nx.key); else chainKeys.push(nx.key);
          cur = nx.other;
        }
      });
      // строим упорядоченную полилинию вершин из цепочки отрезков
      var poly = [keyInfo[chainKeys[0]].v1];
      chainKeys.forEach(function (k) {
        var e = keyInfo[k];
        var last = poly[poly.length - 1];
        poly.push(last === e.v1 ? e.v2 : e.v1);
      });
      edges.push({ faceTag: tag, vertexChain: poly, keys: chainKeys });
    });
    return edges.map(function (e) {
      var pts = e.vertexChain.map(function (vi) { return { x: positions[vi*3], y: positions[vi*3+1], z: positions[vi*3+2], vi: vi }; });
      return { points: pts, faceTag: e.faceTag };
    });
  }

  // прямая или дугообразная? считаем максимальное отклонение точек цепочки от
  // прямой, соединяющей её концы, относительно длины цепочки.
  function classifyEdgeShape(points) {
    if (points.length < 2) return { kind: 'point' };
    var p0 = points[0], p1 = points[points.length - 1];
    var dir = normalize(sub(p1, p0));
    var chainLen = 0;
    for (var i = 1; i < points.length; i++) chainLen += length(sub(points[i], points[i-1]));
    if (chainLen < 1e-9) return { kind: 'point' };
    var maxDev = 0;
    for (var j = 0; j < points.length; j++) {
      var v = sub(points[j], p0);
      var proj = dot(v, dir);
      var closest = { x: p0.x + dir.x*proj, y: p0.y + dir.y*proj, z: p0.z + dir.z*proj };
      var dev = length(sub(points[j], closest));
      if (dev > maxDev) maxDev = dev;
    }
    var straight = maxDev < Math.max(chainLen * 0.01, 1e-4);
    return { kind: straight ? 'straight' : 'curved', length: chainLen, maxDeviation: maxDev, start: p0, end: p1 };
  }

  function edgeLength(points) {
    var len = 0;
    for (var i = 1; i < points.length; i++) len += length(sub(points[i], points[i-1]));
    return len;
  }

  // Наименьшая по дисперсии ось — нужна для ПЛОСКИХ КРИВЫХ (дуга ребра лежит в
  // одной плоскости, и её нормаль — это направление С НАИМЕНЬШЕЙ дисперсией
  // точек, в отличие от вытянутой полосы сгиба, где нужна ось НАИБОЛЬШЕЙ
  // дисперсии). Ищем через степенной метод на (trace*I - C) — это обращает
  // порядок собственных значений.
  function pcaSmallestAxis(points) {
    var n = points.length;
    var mean = { x:0, y:0, z:0 };
    for (var i = 0; i < n; i++) { mean.x += points[i].x; mean.y += points[i].y; mean.z += points[i].z; }
    mean.x /= n; mean.y /= n; mean.z /= n;
    var cxx=0, cxy=0, cxz=0, cyy=0, cyz=0, czz=0;
    for (var j = 0; j < n; j++) {
      var dx = points[j].x - mean.x, dy = points[j].y - mean.y, dz = points[j].z - mean.z;
      cxx += dx*dx; cxy += dx*dy; cxz += dx*dz; cyy += dy*dy; cyz += dy*dz; czz += dz*dz;
    }
    var trace = cxx + cyy + czz;
    // работаем с M = trace*I - C: наибольшее собственное значение M соответствует
    // наименьшему собственному значению C
    var mxx = trace - cxx, myy = trace - cyy, mzz = trace - czz;
    var mxy = -cxy, mxz = -cxz, myz = -cyz;
    var v = { x:1, y:1, z:1 };
    for (var k = 0; k < 60; k++) {
      var nx = mxx*v.x + mxy*v.y + mxz*v.z;
      var ny = mxy*v.x + myy*v.y + myz*v.z;
      var nz = mxz*v.x + myz*v.y + mzz*v.z;
      var l = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      v = { x: nx/l, y: ny/l, z: nz/l };
    }
    return { axis: v, mean: mean };
  }

  function estimateEdgeRadius(points) {
    if (points.length < 4) return null;
    var pca = pcaSmallestAxis(points);
    var proj = projectToPlane(points, pca.axis, pca.mean);
    return fitCircle2D(proj);
  }

  // направление прямого ребра (единичный вектор от начала к концу)
  function edgeDirection(points) {
    return normalize(sub(points[points.length - 1], points[0]));
  }

  // расстояние между двумя примерно параллельными рёбрами: среднее расстояние
  // от точек одного ребра до бесконечной прямой второго.
  function distanceBetweenParallelEdges(pointsA, pointsB) {
    var p0 = pointsB[0], dir = edgeDirection(pointsB);
    var sum = 0;
    pointsA.forEach(function (p) {
      var v = sub(p, p0);
      var proj = dot(v, dir);
      var closest = { x: p0.x + dir.x*proj, y: p0.y + dir.y*proj, z: p0.z + dir.z*proj };
      sum += length(sub(p, closest));
    });
    return sum / pointsA.length;
  }

  function angleBetweenDirections(d1, d2) {
    var c = Math.max(-1, Math.min(1, Math.abs(dot(normalize(d1), normalize(d2))))); // без знака — прямая не имеет направления
    return Math.acos(c) * 180 / Math.PI;
  }

  // ==========================================================================
  // Автоопределение того, что хочет узнать пользователь, по составу выбора.
  // picks: массив из 1-2 объектов { kind:'point'|'edge'|'face', ... }
  // Возвращает { action, ...результат } либо { action:'need-more', hint }.
  // ==========================================================================
  function classifySelection(picks) {
    if (picks.length === 1) {
      var p = picks[0];
      if (p.kind === 'point') return { action: 'need-more', hint: 'Точка отмечена. Выберите вторую точку, ребро или грань.' };
      if (p.kind === 'face') return { action: 'need-more', hint: 'Грань отмечена. Выберите вторую грань, чтобы узнать угол сгиба.' };
      if (p.kind === 'edge') {
        var shape = p.shape || classifyEdgeShape(p.points);
        if (shape.kind === 'straight') return { action: 'length', value: edgeLength(p.points) };
        if (shape.kind === 'curved') {
          var fit = estimateEdgeRadius(p.points);
          if (fit) return { action: 'radius', value: fit.radius };
          return { action: 'need-more', hint: 'Не удалось оценить радиус этой дуги.' };
        }
      }
      return { action: 'need-more', hint: 'Выберите ещё один элемент.' };
    }
    if (picks.length === 2) {
      var a = picks[0], b = picks[1];
      if (a.kind === 'point' && b.kind === 'point') {
        return { action: 'distance', value: length(sub(a.point, b.point)) };
      }
      if (a.kind === 'face' && b.kind === 'face') {
        var ang = dihedralAngle(a.normal, b.normal);
        return { action: 'angle', value: ang.includedAngle, normalsAngle: ang.angleBetweenNormals };
      }
      if (a.kind === 'edge' && b.kind === 'edge') {
        var sa = a.shape || classifyEdgeShape(a.points), sb = b.shape || classifyEdgeShape(b.points);
        if (sa.kind === 'straight' && sb.kind === 'straight') {
          var dirA = edgeDirection(a.points), dirB = edgeDirection(b.points);
          var angBetween = angleBetweenDirections(dirA, dirB);
          if (angBetween < 15) {
            return { action: 'distance-between-edges', value: distanceBetweenParallelEdges(a.points, b.points) };
          }
          return { action: 'angle-between-edges', value: angBetween };
        }
        return { action: 'need-more', hint: 'Для двух дуговых рёбер автоопределение пока не поддержано.' };
      }
      // смешанный выбор (грань+ребро, ребро+точка и т.п.) — считаем расстояние
      // между их представительными точками как разумный запасной вариант.
      function repPoint(x) {
        if (x.kind === 'point') return x.point;
        if (x.kind === 'edge') return x.points[Math.floor(x.points.length/2)];
        if (x.kind === 'face') return x.centroid;
      }
      return { action: 'distance', value: length(sub(repPoint(a), repPoint(b))), mixed: true };
    }
    return { action: 'need-more', hint: 'Кликните элемент модели.' };
  }

  var API = {
    buildTriToFaceMap: buildTriToFaceMap,
    averageFaceNormal: averageFaceNormal,
    dihedralAngle: dihedralAngle,
    pcaAxis: pcaAxis,
    pcaSmallestAxis: pcaSmallestAxis,
    fitCircle2D: fitCircle2D,
    projectToPlane: projectToPlane,
    uniqueFaceVertices: uniqueFaceVertices,
    estimateFaceRadius: estimateFaceRadius,
    triangleNormal: triangleNormal,
    extractFeatureEdges: extractFeatureEdges,
    classifyEdgeShape: classifyEdgeShape,
    edgeLength: edgeLength,
    estimateEdgeRadius: estimateEdgeRadius,
    edgeDirection: edgeDirection,
    distanceBetweenParallelEdges: distanceBetweenParallelEdges,
    angleBetweenDirections: angleBetweenDirections,
    classifySelection: classifySelection
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.STEPGEOM = API;
})(typeof window !== 'undefined' ? window : globalThis);
