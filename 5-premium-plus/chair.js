/* 3D-кабинет: кресло медленно вращается фоном за текстом первого экрана.
   three.min.js подключён в index.html; GLTFLoader.js и dental-chair.glb грузятся лениво. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var NOGL = /[?&]nogl=1/.test(location.search);
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MODEL = 'dental-chair.glb';
  var box = $('#top'), canvas = $('#chair'), loadEl = $('#chairLoad'), fbEl = $('#chairFb');
  var visible = true, ready = false, sync = function () {};

  function webglOk() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  function fallback() {
    ready = false; sync();
    loadEl.hidden = true; canvas.hidden = true; fbEl.hidden = false;
    box.classList.add('is-fb');
  }
  function loadScript(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = bad;
      document.head.appendChild(s);
    });
  }
  function cssColor(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  }

  function init() {
    var T = window.THREE, renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) { return fallback(); }
    var mobile = Math.min(innerWidth, innerHeight) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(28, 1, 0.1, 100);
    scene.add(new T.HemisphereLight(0xffffff, 0xcfe9e4, 0.85));
    var sun = new T.DirectionalLight(0xfff4e6, 1.15); sun.position.set(3, 5, 4); scene.add(sun);
    var fill = new T.DirectionalLight(0xdff3ef, 0.5); fill.position.set(-4, 2, -3); scene.add(fill);
    var pivot = new T.Group(); scene.add(pivot);

    /* мягкая тень-пятно */
    var sc = document.createElement('canvas'); sc.width = sc.height = 128;
    var g = sc.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(20,48,47,.38)'); gr.addColorStop(1, 'rgba(20,48,47,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    var shadow = new T.Mesh(new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

    /* перекраска в палитру сайта */
    var pal = { uph: cssColor('--acc', '#0E7C7B'), accent: cssColor('--ink', '#14302F'), metal: '#C9D3D2', plastic: '#F3EDE2' };
    var kinds = { walls_2: 'uph', material: 'plastic', material_2: 'metal', Material_256: 'metal', chrome08_210: 'metal', Leather_brown__g: 'uph', Rat_textile_1: 'accent' };
    var made = {};
    function mat(kind) {
      if (made[kind]) return made[kind];
      var m;
      if (kind === 'uph') m = new T.MeshStandardMaterial({ color: pal.uph, roughness: 0.62, metalness: 0 });
      else if (kind === 'accent') m = new T.MeshStandardMaterial({ color: pal.accent, roughness: 0.5, metalness: 0.1 });
      else if (kind === 'metal') m = new T.MeshStandardMaterial({ color: pal.metal, roughness: 0.45, metalness: 0.45 });
      else m = new T.MeshStandardMaterial({ color: pal.plastic, roughness: 0.55, metalness: 0 });
      return (made[kind] = m);
    }

    var yaw = -0.6, pitch = 0.27, vel = 0, drag = false, idle = true, idleT = 0;
    var W = 1, H = 1, raf = 0, last = 0, lx = 0, ly = 0, pid = null;

    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      W = w; H = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      /* кресло правее текста: на широком экране сдвиг вправо, на узком — вниз и чуть вправо */
      if (w >= 700) camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
      else camera.clearViewOffset();
    }
    function place() {
      var tn = Math.tan(14 * Math.PI / 180), ar = Math.max(0.3, W / H);
      var dist = Math.max(1.5 / tn, 1.5 / (tn * ar)) * (W >= 700 ? 1 : 0.8), cp = Math.cos(pitch);
      camera.position.set(0, Math.sin(pitch) * dist, cp * dist);
      camera.lookAt(0, 0, 0);
    }
    function frame(t) {
      raf = 0;
      if (!(ready && visible && !document.hidden)) return;
      var dt = Math.min((t - last) / 1000, 0.1); last = t;
      if (!drag) {
        yaw += vel; vel *= 0.92;
        if (!reduce && idle) yaw += dt * 0.3;
      }
      pivot.rotation.y = yaw;
      place();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    sync = function () {
      if (ready && visible && !document.hidden) {
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    function hold() { idle = false; clearTimeout(idleT); idleT = setTimeout(function () { idle = true; }, 4000); }

    /* вращение: мышь и палец; тянется только то, что не перекрыто текстом и кнопками */
    canvas.addEventListener('pointerdown', function (e) {
      if (pid !== null) return;
      pid = e.pointerId; drag = true; vel = 0; lx = e.clientX; ly = e.clientY;
      try { canvas.setPointerCapture(pid); } catch (x) { /* не критично */ }
      canvas.classList.add('drag'); hold();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== pid) return;
      var dx = (e.clientX - lx) * 0.01, dy = (e.clientY - ly) * 0.004;
      lx = e.clientX; ly = e.clientY; yaw += dx; vel = dx;
      pitch = Math.max(0.05, Math.min(1.2, pitch + dy)); hold();
    });
    function up(e) {
      if (e.pointerId !== pid) return;
      pid = null; drag = false; canvas.classList.remove('drag');
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') yaw -= 0.12; else if (e.key === 'ArrowRight') yaw += 0.12; else return;
      hold(); e.preventDefault();
    });
    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); }).observe(canvas); else addEventListener('resize', resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(box);
    document.addEventListener('visibilitychange', function () { sync(); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fallback(); });

    function onModel(gltf) {
      var model = gltf.scene;
      model.traverse(function (o) {
        if (!o.isMesh) return;
        var arr = Array.isArray(o.material) ? o.material : [o.material];
        var out = arr.map(function (m) { return mat(kinds[m.name] || 'plastic'); });
        o.material = Array.isArray(o.material) ? out : out[0];
      });
      var b = new T.Box3().setFromObject(model), size = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
      var k = 2 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(k);
      model.position.set(-c.x * k, -c.y * k, -c.z * k);
      pivot.add(model);
      shadow.position.y = -size.y * k / 2 + 0.005; shadow.scale.setScalar(3.2);
      ready = true; loadEl.hidden = true;
      resize(); place(); renderer.render(scene, camera);
      sync();
    }
    var loader = new T.GLTFLoader();
    if (location.protocol === 'file:') {
      /* Страница открыта двойным кликом из папки: браузер не даёт загрузить .glb,
         поэтому берём ту же модель из dental-chair.glb.js (base64 в теге script). */
      loadScript('dental-chair.glb.js').then(function () {
        var s = atob(window.CHAIR_GLB_B64 || ''), buf = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
        loader.parse(buf.buffer, '', onModel, function () { fallback(); });
      }).catch(fallback);
    } else {
      loader.load(MODEL, onModel, undefined, function () { fallback(); });
    }
  }

  if (NOGL || typeof THREE === 'undefined' || !webglOk()) { fallback(); return; }
  loadEl.hidden = false;
  loadScript('GLTFLoader.js').then(init).catch(fallback);
})();
