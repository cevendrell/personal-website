// Toy box: my printed designs on a print bed. Drag to pick up and throw, they collide;
// a quick click opens the design's card with its Thingiverse link.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

const MODELS = '../../media/3DPrinting/models/';

// Units are centimetres (STL files are in millimetres).
const BED = { w: 46, d: 28 };

export function mountToybox(root, things, parts) {
  const canvas = root.querySelector('canvas');
  const card = root.querySelector('.tb-card');
  const loading = root.querySelector('.tb-loading');

  /* ── Renderer, scene, camera ── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 2, 1, 300);

  scene.add(new THREE.HemisphereLight('#dfe6ff', '#2a1d14', 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.position.set(-18, 40, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 22, bottom: -22, near: 5, far: 90 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#ff9a5a', 0.9);
  rim.position.set(24, 14, -20);
  scene.add(rim);

  // Print bed: no sheet, just a fine grid that fades into the page, plus soft shadows
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1280;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,0.025)'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 1.5;
    for (let i = 0; i <= c.width; i += 40) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, c.height); x.stroke(); }
    for (let j = 0; j <= c.height; j += 40) { x.beginPath(); x.moveTo(0, j + 0.5); x.lineTo(c.width, j + 0.5); x.stroke(); }
    // fade the edges away so the bed dissolves into the background
    x.globalCompositeOperation = 'destination-in';
    const g = x.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.18, c.width / 2, c.height / 2, c.width * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(BED.w * 1.9, BED.w * 1.9 * 1280 / 2048),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  grid.rotation.x = -Math.PI / 2; grid.position.y = 0.01; scene.add(grid);
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(BED.w * 2.4, BED.w * 2.4), new THREE.ShadowMaterial({ opacity: 0.55 }));
  shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.receiveShadow = true; scene.add(shadowCatcher);

  /* ── Physics ── */
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -981, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  const matPrint = new CANNON.Material('print'), matBed = new CANNON.Material('bed');
  world.addContactMaterial(new CANNON.ContactMaterial(matPrint, matBed, { friction: 0.45, restitution: 0.18 }));
  world.addContactMaterial(new CANNON.ContactMaterial(matPrint, matPrint, { friction: 0.35, restitution: 0.22 }));
  const addStatic = (shape, pos) => { const b = new CANNON.Body({ mass: 0, material: matBed }); b.addShape(shape); b.position.set(...pos); world.addBody(b); };
  addStatic(new CANNON.Plane(), [0, 0, 0]); world.bodies[0].quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  const H = 40, T = 2;
  addStatic(new CANNON.Box(new CANNON.Vec3(T, H, BED.d / 2 + T)), [-BED.w / 2 - T, H, 0]);
  addStatic(new CANNON.Box(new CANNON.Vec3(T, H, BED.d / 2 + T)), [BED.w / 2 + T, H, 0]);
  addStatic(new CANNON.Box(new CANNON.Vec3(BED.w / 2 + T, H, T)), [0, H, -BED.d / 2 - T]);
  addStatic(new CANNON.Box(new CANNON.Vec3(BED.w / 2 + T, H, T)), [0, H, BED.d / 2 + T]);
  addStatic(new CANNON.Box(new CANNON.Vec3(BED.w / 2, T, BED.d / 2)), [0, 2 * H + T, 0]);

  const items = [];   // { mesh, body, part }

  /* ── Layout ── */
  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the bed. On portrait screens look along the long side so the bed runs top to bottom.
    const portrait = camera.aspect < 1;
    const across = portrait ? BED.d : BED.w;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const dist = Math.max(52, (across * 0.62) / tanH, portrait ? 92 : 0);
    if (portrait) camera.position.set(dist * 0.62, dist * 0.78, 0);
    else camera.position.set(0, dist * 0.78, dist * 0.62);
    camera.lookAt(portrait ? -2 : 0, 0, portrait ? 0 : 1.5);
    camera.far = dist * 3;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(root);
  resize();

  /* ── Load the prints ── */
  const loader = new STLLoader();
  async function loadAll() {
    let i = 0;
    for (const part of parts) {
      let geo;
      try { geo = await loader.loadAsync(MODELS + part.file); } catch (e) { continue; }
      geo.rotateX(-Math.PI / 2);          // STL is Z-up
      geo.computeBoundingBox();
      const raw = geo.boundingBox.getSize(new THREE.Vector3());
      const unit = Math.max(raw.x, raw.y, raw.z) < 2 ? 100 : 0.1;   // files exported in metres → cm, else mm → cm
      geo.scale(unit, unit, unit);
      geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -c.y, -c.z);
      geo.computeVertexNormals();
      const size = geo.boundingBox.getSize(new THREE.Vector3());
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.55, metalness: 0.02 }));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.item = items.length;
      scene.add(mesh);
      const half = new CANNON.Vec3(Math.max(size.x, 0.4) / 2, Math.max(size.y, 0.4) / 2, Math.max(size.z, 0.4) / 2);
      const mass = Math.max(0.02, size.x * size.y * size.z * 0.0004);
      const body = new CANNON.Body({ mass, material: matPrint, shape: new CANNON.Box(half), linearDamping: 0.08, angularDamping: 0.12, sleepSpeedLimit: 0.6 });
      const sx = (i % 4 - 1.5) * BED.w * 0.22 + (Math.random() - 0.5) * 3;
      const sz = (Math.floor(i / 4) - 0.5) * BED.d * 0.42 + (Math.random() - 0.5) * 2;
      body.position.set(sx, 12 + i * 5, sz);
      body.quaternion.setFromEuler(Math.random() * 0.8, Math.random() * Math.PI * 2, Math.random() * 0.8);
      world.addBody(body);
      items.push({ mesh, body, part });
      i++;
    }
    loading.hidden = true;
  }

  /* ── Pick up, drag, throw ── */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hand = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 0, collisionFilterMask: 0 });
  world.addBody(hand);
  let grab = null;   // { item, constraint, plane, x0, y0, t0, moved }
  const toNdc = e => { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); };
  const hitTest = e => { toNdc(e); ray.setFromCamera(ndc, camera); return ray.intersectObjects(items.map(it => it.mesh))[0]; };

  function down(e) {
    const hit = hitTest(e);
    if (!hit) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const it = items[hit.object.userData.item];
    const lift = Math.max(hit.point.y + 3, 5);
    hand.position.set(hit.point.x, lift, hit.point.z);
    const local = it.body.pointToLocalFrame(new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z));
    const constraint = new CANNON.PointToPointConstraint(it.body, local, hand, new CANNON.Vec3(0, 0, 0), it.body.mass * 400);
    world.addConstraint(constraint);
    it.body.wakeUp();
    grab = { it, constraint, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -lift), x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
    root.classList.add('grabbing');
  }
  function move(e) {
    if (!grab) { root.classList.toggle('hovering', !!hitTest(e)); return; }
    if (Math.hypot(e.clientX - grab.x0, e.clientY - grab.y0) > 6) grab.moved = true;
    toNdc(e); ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(grab.plane, p)) {
      p.x = THREE.MathUtils.clamp(p.x, -BED.w / 2 + 1, BED.w / 2 - 1);
      p.z = THREE.MathUtils.clamp(p.z, -BED.d / 2 + 1, BED.d / 2 - 1);
      hand.position.set(p.x, p.y, p.z);
    }
  }
  function up(e) {
    if (!grab) return;
    world.removeConstraint(grab.constraint);
    const quick = Math.hypot(e.clientX - grab.x0, e.clientY - grab.y0) < 8 && performance.now() - grab.t0 < 600;
    const part = grab.it.part;
    grab = null; root.classList.remove('grabbing');
    if (quick && part.thing) openCard(part.thing);
  }
  canvas.addEventListener('pointerdown', down);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  // On touch screens only block page scrolling when the finger lands on a print
  canvas.addEventListener('touchstart', e => { const t = e.touches[0]; if (hitTest(t)) e.preventDefault(); }, { passive: false });

  /* ── Card ── */
  function openCard(key) {
    const t = things[key]; if (!t) return;
    card.querySelector('img').src = t.img; card.querySelector('img').alt = t.title;
    card.querySelector('h3').textContent = t.title;
    card.querySelector('p').textContent = t.desc;
    card.querySelector('a').href = t.url;
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('open'));
  }
  card.querySelector('.tb-close').addEventListener('click', () => { card.classList.remove('open'); setTimeout(() => card.hidden = true, 250); });
  root.querySelectorAll('[data-thing]').forEach(b => b.addEventListener('click', () => openCard(b.dataset.thing)));

  /* ── Loop: only while on screen ── */
  let visible = false, started = false, last = performance.now();
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !started) { started = true; loadAll(); }
    if (visible) { last = performance.now(); requestAnimationFrame(frame); }
  }, { threshold: 0.05 }).observe(root);
  function frame(now) {
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    world.step(1 / 120, dt, 6);
    for (const it of items) {
      // anything that escapes (very hard throw) drops back in
      if (it.body.position.y < -10 || Math.abs(it.body.position.x) > BED.w || Math.abs(it.body.position.z) > BED.d) { it.body.position.set(0, 20, 0); it.body.velocity.setZero(); }
      it.mesh.position.copy(it.body.position);
      it.mesh.quaternion.copy(it.body.quaternion);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) { last = performance.now(); requestAnimationFrame(frame); } });
}
