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

  var API = {
    buildTriToFaceMap: buildTriToFaceMap,
    averageFaceNormal: averageFaceNormal,
    dihedralAngle: dihedralAngle,
    pcaAxis: pcaAxis,
    fitCircle2D: fitCircle2D,
    projectToPlane: projectToPlane,
    uniqueFaceVertices: uniqueFaceVertices,
    estimateFaceRadius: estimateFaceRadius,
    triangleNormal: triangleNormal
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.STEPGEOM = API;
})(typeof window !== 'undefined' ? window : globalThis);
