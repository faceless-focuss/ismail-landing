/* ===========================================================
   Живая сфера из точек — референс Каиры (Timeline 1.mov / 11.mp4)
   Малиново-фиолетовый верх → синий низ, свечение по краю,
   медленное «дыхание» + вращение. Canvas 2D, без библиотек.

   Надёжность: рисуем через requestAnimationFrame, НО с
   страховочным setInterval — в части webview (встроенный
   браузер Telegram) rAF не вызывается вовсе; таймер добивает.
   =========================================================== */
(function () {
  var canvas = document.getElementById('sphereCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: true });

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, CX = 0, CY = 0, R = 0;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- точки по сфере (Фибоначчи-распределение) ---
  var N = 3800;
  var pts = new Array(N);
  var golden = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2;
    var r = Math.sqrt(1 - y * y);
    var theta = golden * i;
    pts[i] = { x: Math.cos(theta) * r, y: y, z: Math.sin(theta) * r };
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CX = W / 2;
    CY = H * 0.5;
    R = Math.min(W, H) * 0.40;
  }
  resize();
  window.addEventListener('resize', resize);

  // цвет точки: вертикаль задаёт оттенок (верх розовый → низ синий),
  // «горячий» светлый верх-перёд подмешивает белого (как блик на референсе)
  function colorFor(ny, depth) {
    var t = (ny + 1) / 2;               // 0 низ .. 1 верх
    var rr, gg, bb;
    if (t > 0.5) {                       // верх: фиолет → розово-малиновый
      var k = (t - 0.5) * 2;
      rr = 190 + (248 - 190) * k;
      gg = 90 + (110 - 90) * k;
      bb = 250 + (170 - 250) * k;
    } else {                             // низ: синий → фиолет
      var k2 = t * 2;
      rr = 70 + (190 - 70) * k2;
      gg = 150 + (90 - 150) * k2;
      bb = 250 + (250 - 250) * k2;
    }
    // «горячий» белый блик-дуга: близко к верху И к передней части → к белому
    var hot = Math.max(0, (ny - 0.05)) * Math.max(0, (depth - 0.5)) * 2.8;
    if (hot > 0) {
      if (hot > 1) hot = 1;
      rr = rr + (255 - rr) * hot;
      gg = gg + (255 - gg) * hot;
      bb = bb + (255 - bb) * hot;
    }
    // яркость по глубине (перёд ярче), с учётом блика — сильнее прежнего
    var glow = 0.18 + Math.pow(depth, 1.35) * 1.45 + hot * 0.75;
    if (glow > 1) glow = 1;
    return 'rgba(' + (rr | 0) + ',' + (gg | 0) + ',' + (bb | 0) + ',' + glow.toFixed(3) + ')';
  }

  // единый рендер одного кадра по абсолютному времени (сек)
  function render(time) {
    ctx.clearRect(0, 0, W, H);

    var rotY = reduceMotion ? 0.6 : time * 0.18;
    var rotX = reduceMotion ? -0.25 : Math.sin(time * 0.12) * 0.22 - 0.15;
    var cy = Math.cos(rotY), sy = Math.sin(rotY);
    var cx = Math.cos(rotX), sx = Math.sin(rotX);
    var breathe = reduceMotion ? 1 : 1 + Math.sin(time * 0.7) * 0.03;

    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < N; i++) {
      var p = pts[i];
      var wave = reduceMotion ? 0 :
        0.06 * Math.sin(p.y * 4 + time * 1.1) +
        0.05 * Math.sin(p.x * 3 - time * 0.9);
      var rr = (1 + wave) * breathe;

      var x = p.x * rr, y = p.y * rr, z = p.z * rr;
      var x1 = x * cy - z * sy;
      var z1 = x * sy + z * cy;
      var y1 = y * cx - z1 * sx;
      var z2 = y * sx + z1 * cx;

      var depth = (z2 + 1.6) / 2.6;
      var sx2 = CX + x1 * R;
      var sy2 = CY + y1 * R;
      var size = (0.6 + depth * 2.2);

      ctx.fillStyle = colorFor(y1, depth);
      ctx.beginPath();
      ctx.arc(sx2, sy2, size, 0, 6.283);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- драйвер: rAF (основной) + setInterval (страховка для webview) ---
  var startPerf = (window.performance && performance.now) ? performance.now() : Date.now();
  var lastRenderTs = -1;

  function now() {
    return ((window.performance && performance.now) ? performance.now() : Date.now());
  }
  function tick() {
    var t = (now() - startPerf) / 1000;
    // не рисуем один и тот же момент дважды (если оба драйвера совпали)
    if (t - lastRenderTs < 0.008) return;
    lastRenderTs = t;
    render(t);
  }

  function rafLoop() { tick(); requestAnimationFrame(rafLoop); }
  requestAnimationFrame(rafLoop);

  // Страховка: 30 к/с. В активной вкладке rAF опережает и dedup гасит лишнее;
  // в webview без rAF — именно этот таймер и крутит сферу.
  setInterval(tick, 1000 / 30);

  // первый кадр сразу, не дожидаясь драйверов
  render(0);
})();
