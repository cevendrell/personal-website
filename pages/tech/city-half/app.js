/* ══════════════════════════════════════════════════════════════════════════
   BESTSELLER Aarhus City Half 2026, seen from above.

   Data (data/*.json, built offline from public sources):
     city.json   OpenStreetMap buildings and building parts (heights, roof
                 shapes, colours), streets, water, parks, trees, coastline,
                 in local metres around Rådhusparken (x east, z south), ×0.5
     route.json  the 2026 course (GPS track snapped to OSM streets, 5 m steps),
                 landmarks with their km, places where the course meets itself
     field.json  every finisher: place, net time, bib, age group, club, country
                 (no names), a pacing model from sampled chip splits, anecdotes

   Each runner's position at clock time t is modelled: shuffle to the start mat
   (start delay from the sampled chip data), then run the course following the
   split profile of their finish-time group, scaled to their own net time.
   ══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 860px)').matches;

function hms(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
const clockStr = (t, secs = false) => {           // t = seconds after 10:00:00
  const a = 36000 + Math.round(t);
  const h = Math.floor(a / 3600), m = Math.floor(a / 60) % 60, s = a % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` + (secs ? `:${String(s).padStart(2, '0')}` : '');
};
const durWords = (sec) => {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} hours`;
};
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
function hash(i) { let x = (i + 1) * 374761393; x = (x ^ (x >>> 13)) * 1274126177; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
const C = (hex) => new THREE.Color(hex);

/* ── palette: daytime Aarhus in the race's blue and beige ─────────────── */
const PAL = {
  blue: '#0d00c4', beige: '#c4c0ac',
  skyTop: '#8fb6dd', skyHorizon: '#eeece6', fog: '#e8e6df',
  land: '#ebe6da', green: '#b7cf9c', water: '#a7c8dc', pier: '#e1dccf',
  road: ['#fbfaf6', '#f8f6f0', '#f4f1e9', '#efebe1'],
  wall: '#efebe3', roofFlat: '#d4cfc4', roofTile: '#b98a72', roofSlate: '#8e9098',
  tree: ['#7fa86a', '#6c9858', '#91b77a', '#5f8c50'],
  heatLo: '#0d00c4', heatMid: '#f2c14e', heatHi: '#e4572e',
  fast: '#2ec4b6', mid: '#f2c14e', slow: '#e4572e',
};

/* ── boot ─────────────────────────────────────────────────────────────── */
const stageEl = $('#stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('#nogl').style.display = 'flex'; $('#loading').classList.add('done'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(C(PAL.fog), 2600, 15000);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 20, 40000);
camera.position.set(-2600, 2200, 400);

// June, late morning: the sun stands high in the south-east (x east, z south)
const SUN_DIR = new THREE.Vector3(0.48, 0.78, 0.40).normalize();
scene.add(new THREE.HemisphereLight(C('#e6eef8'), C('#cdc4ae'), 1.15));
const sun = new THREE.DirectionalLight(C('#fff3e0'), 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.2;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 7000;
scene.add(sun, sun.target);

async function getJSON(p) {
  const r = await fetch(new URL(p, import.meta.url));
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
}
const msg = (t) => { $('#loadmsg').textContent = t; };
const OUTPUT = '#include <colorspace_fragment>';

/* ── sky ──────────────────────────────────────────────────────────────── */
function buildSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: C(PAL.skyTop) }, uHor: { value: C(PAL.skyHorizon) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop, uHor; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(uHor, uTop, pow(smoothstep(0.0, 0.6, h), 0.8)); gl_FragColor = vec4(c, 1.0); ${OUTPUT} }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), m);
  sky.renderOrder = -10;
  scene.add(sky);
}

/* ── ground layers ────────────────────────────────────────────────────── */
function lambert(hex, off = 0) {
  return new THREE.MeshLambertMaterial({ color: C(hex), polygonOffset: off !== 0, polygonOffsetFactor: off, polygonOffsetUnits: off });
}
function polyGeometry(list, unit, y) {
  const pos = [];
  for (const f of list) {
    const pts = [];
    for (let i = 0; i < f.length; i += 2) pts.push(new THREE.Vector2(f[i] * unit, f[i + 1] * unit));
    if (pts.length < 3) continue;
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch { continue; }
    for (const t of tris) upTri(pos, pts[t[0]].x, pts[t[0]].y, pts[t[1]].x, pts[t[1]].y, pts[t[2]].x, pts[t[2]].y, y);
  }
  return flatGeo(pos);
}
// push a ground triangle wound so its front face (and normal) points up
function upTri(pos, ax, az, bx, bz, cx, cz, y) {
  if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) >= 0) pos.push(ax, y, az, bx, y, bz, cx, y, cz);
  else pos.push(ax, y, az, cx, y, cz, bx, y, bz);
}
function flatGeo(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}
function ribbonGeometry(lines, unit, width, y) {
  const pos = [];
  for (const f of lines) {
    for (let i = 0; i + 3 < f.length; i += 2) {
      const ax = f[i] * unit, az = f[i + 1] * unit, bx = f[i + 2] * unit, bz = f[i + 3] * unit;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * width / 2, nz = dx / L * width / 2;
      // a little overlap at the joints so bends stay closed
      const ex = dx / L * width * 0.35, ez = dz / L * width * 0.35;
      const a0x = ax - ex, a0z = az - ez, b0x = bx + ex, b0z = bz + ez;
      upTri(pos, a0x + nx, a0z + nz, b0x - nx, b0z - nz, b0x + nx, b0z + nz, y);
      upTri(pos, a0x + nx, a0z + nz, a0x - nx, a0z - nz, b0x - nx, b0z - nz, y);
    }
  }
  return flatGeo(pos);
}
function buildGround(city) {
  const u = city.unit;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); return m; };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), lambert(PAL.water));
  sea.position.y = -0.4; scene.add(sea);
  add(polyGeometry(city.land, u, 0), lambert(PAL.land, -1));
  add(polyGeometry(city.green, u, 0.1), lambert(PAL.green, -2));
  add(polyGeometry(city.water, u, 0.2), lambert(PAL.water, -3));
  add(ribbonGeometry(city.rivers, u, 7, 0.2), lambert(PAL.water, -3));
  add(polyGeometry(city.pier, u, 0.25), lambert(PAL.pier, -3));
  const widths = [13, 9, 6.5, 2.6];
  for (let k = 3; k >= 0; k--) add(ribbonGeometry(city.roads[k], u, widths[k], 0.3 + (3 - k) * 0.02), lambert(PAL.road[k], -4 - (3 - k)));
}

/* ── buildings: walls, flat / gabled / pyramid / dome roofs ───────────── */
function buildBuildings(city) {
  const u = city.unit;
  const cols = (city.cols || []).map((h) => C(h));
  const wallBase = C(PAL.wall), flatBase = C(PAL.roofFlat), tile = C(PAL.roofTile), slate = C(PAL.roofSlate);
  const pos = [], col = [];
  const tmp = new THREE.Color();
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  const tri = (a, b, c, k) => { push(a[0], a[1], a[2], k); push(b[0], b[1], b[2], k); push(c[0], c[1], c[2], k); };
  for (let bi = 0; bi < city.b.length; bi++) {
    const b = city.b[bi];
    const h = b[0] * u, mh = b[1] * u, rc = b[2], rh = b[3] * u, wc = b[4], rcol = b[5];
    const pts = [];
    for (let i = 6; i < b.length; i += 2) pts.push([b[i] * u, b[i + 1] * u]);
    const n = pts.length; if (n < 3) continue;
    const jitter = (hash(bi) - 0.5) * 0.06;
    const wall = (wc >= 0 ? wallBase.clone().lerp(cols[wc], 0.55) : wallBase.clone()).offsetHSL(0, 0, jitter);
    let roof;
    if (rcol >= 0) roof = flatBase.clone().lerp(cols[rcol], 0.7);
    else if (rc === 1 || rc === 2) roof = (hash(bi * 3 + 1) < 0.62 ? tile : slate).clone();
    else roof = flatBase.clone();
    roof.offsetHSL(0, 0, jitter);
    const gable = rc === 1 && n === 4 && rh > 0.3;
    const eave = rc === 0 || rh <= 0.3 ? h : (rc === 1 && !gable ? h - rh * 0.6 : h - rh);
    // walls
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      tri([ax, mh, az], [bx, mh, bz], [bx, eave, bz], wall);
      tri([ax, mh, az], [bx, eave, bz], [ax, eave, az], wall);
    }
    if (gable) {
      const L = (i) => Math.hypot(pts[(i + 1) % 4][0] - pts[i][0], pts[(i + 1) % 4][1] - pts[i][1]);
      const o = L(0) + L(2) >= L(1) + L(3) ? 0 : 1;       // ridge parallel to edge o
      const p = [0, 1, 2, 3].map((k) => pts[(k + o) % 4]);
      const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const r0 = mid(p[3], p[0]), r1 = mid(p[1], p[2]);
      const P = (q, y) => [q[0], y, q[1]];
      tri(P(p[0], eave), P(p[1], eave), P(r1, h), roof); tri(P(p[0], eave), P(r1, h), P(r0, h), roof);
      tri(P(p[2], eave), P(p[3], eave), P(r0, h), roof); tri(P(p[2], eave), P(r0, h), P(r1, h), roof);
      tri(P(p[1], eave), P(p[2], eave), P(r1, h), wall); tri(P(p[3], eave), P(p[0], eave), P(r0, h), wall);
    } else if ((rc === 2 || rc === 3) && rh > 0.3) {
      let cx = 0, cz = 0; for (const q of pts) { cx += q[0]; cz += q[1]; } cx /= n; cz /= n;
      if (rc === 2) {
        for (let i = 0; i < n; i++) { const a = pts[i], c = pts[(i + 1) % n]; tri([a[0], eave, a[1]], [c[0], eave, c[1]], [cx, h, cz], roof); }
      } else {
        const R = 5; let prev = pts.map((q) => [q[0], eave, q[1]]);
        for (let k = 1; k <= R; k++) {
          const ang = k / R * Math.PI / 2, s = Math.cos(ang), y = eave + rh * Math.sin(ang);
          const ring = pts.map((q) => [cx + (q[0] - cx) * s, y, cz + (q[1] - cz) * s]);
          for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(prev[i], prev[j], ring[j], roof); tri(prev[i], ring[j], ring[i], roof); }
          prev = ring;
        }
      }
    } else {
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(pts.map((q) => new THREE.Vector2(q[0], q[1])), []); } catch { tris = []; }
      for (const t of tris) tri([pts[t[0]][0], eave, pts[t[0]][1]], [pts[t[1]][0], eave, pts[t[1]][1]], [pts[t[2]][0], eave, pts[t[2]][1]], roof);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildTrees(city) {
  const t = city.trees || [], n = t.length / 2, u = city.unit;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), n);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const greens = PAL.tree.map((h) => C(h));
  for (let i = 0; i < n; i++) {
    const r = 3.2 + hash(i * 7) * 3.2;
    p.set(t[i * 2] * u, r * 1.25, t[i * 2 + 1] * u); s.set(r, r * 1.3, r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i * 11) * 6.28);
    M.compose(p, q, s); inst.setMatrixAt(i, M);
    inst.setColorAt(i, greens[Math.floor(hash(i * 5) * greens.length)]);
  }
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
}

/* ── landmark specials ────────────────────────────────────────────────── */
function buildLandmarkExtras(lm) {
  const aros = lm.find((l) => l.name === 'ARoS');
  if (aros) {                                   // Your rainbow panorama
    const g = new THREE.TorusGeometry(26, 2.4, 10, 120);
    g.rotateX(Math.PI / 2);
    const c = [], p = g.attributes.position;
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) { tmp.setHSL((Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 1) % 1, 0.85, 0.6); c.push(tmp.r, tmp.g, tmp.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    const ring = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: C('#222222') }));
    ring.position.set(aros.x, 46.5, aros.z); ring.castShadow = true;
    scene.add(ring);
  }
}

/* ── the course: the race's blue ribbon with its name running along it ── */
let R = null;
function makeRoute(route) {
  const step = route.step, P = route.pts, n = P.length / 2;
  const x = new Float32Array(n), z = new Float32Array(n), hx = new Float32Array(n), hz = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = P[2 * i] / 10; z[i] = P[2 * i + 1] / 10; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4);
    const dx = x[b] - x[a], dz = z[b] - z[a], L = Math.hypot(dx, dz) || 1;
    hx[i] = dx / L; hz[i] = dz / L;
  }
  const len = (n - 1) * step;
  function at(d, o = {}) {
    if (d <= 0) { o.x = x[0] + hx[0] * d; o.z = z[0] + hz[0] * d; o.hx = hx[0]; o.hz = hz[0]; return o; }
    const f = Math.min(d / step, n - 1.0001), i = Math.floor(f), t = f - i;
    o.x = x[i] + (x[i + 1] - x[i]) * t; o.z = z[i] + (z[i + 1] - z[i]) * t; o.hx = hx[i]; o.hz = hz[i];
    return o;
  }
  function headingAvg(d, span = 140) {
    const a = at(d - span), b = at(d + span);
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L];
  }
  return { n, x, z, hx, hz, step, len, at, headingAvg };
}
async function ribbonTexture() {
  try { await document.fonts.load('700 80px "Barlow Condensed"'); } catch {}
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = PAL.blue; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = '700 74px "Barlow Condensed", "Arial Narrow", sans-serif';
  const text = 'BESTSELLER AARHUS CITY HALF', spacing = 9;
  let xx = 70;
  for (let rep = 0; rep < 2; rep++) {
    for (const ch of text) { g.fillText(ch, xx, 68); xx += g.measureText(ch).width + spacing; }
    xx += 160;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
function buildRibbon(tex) {
  const n = R.n, W = 13;
  const pos = new Float32Array(n * 2 * 3), dist = new Float32Array(n * 2), side = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const nx = -R.hz[i], nz = R.hx[i];
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1, k = i * 2 + s;
      pos[k * 3] = R.x[i] + nx * W / 2 * sg; pos[k * 3 + 1] = 1.6; pos[k * 3 + 2] = R.z[i] + nz * W / 2 * sg;
      dist[k] = i * R.step; side[k] = sg;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  const heat = new Float32Array(n * 2);
  g.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12,
    uniforms: {
      uTex: { value: tex }, uRepeat: { value: W * 16 }, uReveal: { value: 1e9 }, uHeat: { value: 0 },
      uLo: { value: C(PAL.heatLo) }, uMid: { value: C(PAL.heatMid) }, uHi: { value: C(PAL.heatHi) }, uBlue: { value: C(PAL.blue) },
    },
    vertexShader: `attribute float aDist; attribute float aSide; attribute float aHeat; varying float vD; varying float vS; varying float vH;
      void main(){ vD = aDist; vS = aSide; vH = aHeat; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uRepeat, uReveal, uHeat; uniform vec3 uLo, uMid, uHi, uBlue;
      varying float vD; varying float vS; varying float vH;
      void main(){
        if (vD > uReveal) discard;
        vec2 uv = vec2(vD / uRepeat, 0.5 - vS * 0.62);   // letter tops to the left of the running direction
        vec3 tex = texture2D(uTex, uv).rgb;
        float textMask = smoothstep(0.25, 0.75, tex.r);          // white letters on blue
        float h = clamp(vH, 0.0, 1.0);
        vec3 band = mix(uLo, uMid, smoothstep(0.15, 0.55, h));
        band = mix(band, uHi, smoothstep(0.55, 1.0, h));
        band = mix(uBlue, band, uHeat);
        vec3 c = mix(band, vec3(1.0), textMask * (1.0 - 0.6*uHeat));
        float edge = smoothstep(0.86, 0.93, abs(vS));
        c = mix(c, vec3(1.0), edge);
        gl_FragColor = vec4(c, 1.0); ${OUTPUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 20;
  scene.add(mesh);
  return { mesh, heat, attr: g.getAttribute('aHeat') };
}
function buildCourseFurniture() {
  const grp = new THREE.Group();
  // km posts: blue poles with a white band
  const count = Math.floor(R.len / 1000);
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 0.9, 24, 8).translate(0, 12, 0), new THREE.MeshLambertMaterial({ color: C(PAL.blue) }), count);
  const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 12, 8).translate(0, 25, 0), new THREE.MeshLambertMaterial({ color: C('#ffffff') }), count);
  const M = new THREE.Matrix4(), o = {};
  for (let k = 1; k <= count; k++) {
    R.at(k * 1000 * R.len / 21097.5, o);
    M.makeTranslation(o.x - o.hz * 9, 0, o.z + o.hx * 9);
    pole.setMatrixAt(k - 1, M); cap.setMatrixAt(k - 1, M);
  }
  pole.castShadow = true;
  grp.add(pole, cap);
  // start / finish arch across the course at Rådhusparken
  const s = R.at(0, {});
  const arch = new THREE.Mesh(new THREE.TorusGeometry(10, 1.1, 10, 40, Math.PI), new THREE.MeshLambertMaterial({ color: C(PAL.blue) }));
  arch.position.set(s.x, 0, s.z);
  arch.rotation.y = Math.atan2(s.hx, s.hz);
  arch.castShadow = true;
  scene.add(arch);
  scene.add(grp);
  return grp;
}

/* ── runners ──────────────────────────────────────────────────────────── */
let F = null;
function prepField(field, routeLen) {
  const N = field.t.length;
  const T = Float32Array.from(field.t), S = new Float32Array(N), B = new Uint8Array(N), O = new Float32Array(N);
  const md = field.model;
  const delayAt = (net) => {
    const D = md.delay; if (net <= D[0][0]) return [D[0][1], D[0][2]];
    for (let i = 1; i < D.length; i++) if (net <= D[i][0]) { const t = (net - D[i - 1][0]) / (D[i][0] - D[i - 1][0]); return [lerp(D[i - 1][1], D[i][1], t), lerp(D[i - 1][2], D[i][2], t)]; }
    return [D[D.length - 1][1], D[D.length - 1][2]];
  };
  for (let i = 0; i < N; i++) {
    const [med, spr] = delayAt(T[i]);
    S[i] = Math.max(0, med + (hash(i * 7 + 3) - 0.5) * 2 * spr);
    let b = 0; while (b < md.buckets.length - 1 && T[i] > md.buckets[b].max) b++;
    B[i] = b;
    O[i] = (hash(i * 13 + 1) - 0.5) * 9.0;
  }
  const Dm = md.D.map((k) => k * 1000 * routeLen / 21097.5);
  const sd = Array.from(S).sort((a, b) => a - b), qv = 620 / Math.max(300, sd[Math.floor(N * 0.99)]);
  let maxEnd = 0; for (let i = 0; i < N; i++) maxEnd = Math.max(maxEnd, T[i] + S[i]);
  return { N, T, S, B, O, Dm, prof: md.buckets.map((b) => b.F), qv, raw: field, maxEnd, lastStart: sd[Math.floor(N * 0.995)] };
}
// distance along the course of runner i at clock t; state 0 waiting, 1 running, 2 finished
function runnerDist(i, t) {
  const el = t - F.S[i];
  if (el < 0) return [Math.max(-640, el * F.qv - 4), 0];
  const T = F.T[i];
  if (el >= T) return [el - T, 2];
  const f = el / T, Fp = F.prof[F.B[i]], D = F.Dm;
  let k = 0; while (k < Fp.length - 2 && f > Fp[k + 1]) k++;
  const u = (f - Fp[k]) / (Fp[k + 1] - Fp[k] || 1);
  return [D[k] + (D[k + 1] - D[k]) * u, 1];
}
const _o = {};
function runnerXZ(i, t, out) {
  const [d, st] = runnerDist(i, t);
  if (st === 2) {
    const e = d; if (e > 600) { out.v = 0; return st; }
    R.at(R.len, _o);
    const drift = Math.min(60, e * 0.3);
    out.x = _o.x + _o.hx * drift - _o.hz * F.O[i] * 3; out.z = _o.z + _o.hz * drift + _o.hx * F.O[i] * 3;
    out.v = 1 - e / 600; out.d = R.len; return st;
  }
  R.at(d, _o);
  const w = st === 0 ? 1.8 : 1.0;
  out.x = _o.x - _o.hz * F.O[i] * w; out.z = _o.z + _o.hx * F.O[i] * w; out.v = 1; out.d = d;
  return st;
}
function buildRunners() {
  const N = F.N;
  const pos = new Float32Array(N * 3), alpha = new Float32Array(N), col2 = new Float32Array(N * 3);
  const fast = C(PAL.fast), mid = C(PAL.mid), slow = C(PAL.slow);
  const tmin = F.T[0];
  for (let i = 0; i < N; i++) {
    const q = clamp((F.T[i] - tmin) / (9000 - tmin), 0, 1);
    const p = q < 0.5 ? fast.clone().lerp(mid, q * 2) : mid.clone().lerp(slow, (q - 0.5) * 2);
    col2[i * 3] = p.r; col2[i * 3 + 1] = p.g; col2[i * 3 + 2] = p.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol2', new THREE.BufferAttribute(col2, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSize: { value: 4.6 }, uScale: { value: 1 }, uMix: { value: 0 }, uOp: { value: 0 }, uRim: { value: C('#0a0870') }, uFill: { value: C('#ffffff') } },
    vertexShader: `attribute float aAlpha; attribute vec3 aCol2; uniform float uSize, uScale, uOp; varying vec3 vC; varying float vA; uniform float uMix; uniform vec3 uFill;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
        float px = uSize * uScale / -mv.z; gl_PointSize = clamp(px, 2.2, 22.0);
        vA = aAlpha * uOp; vC = mix(uFill, aCol2, uMix); }`,
    fragmentShader: `uniform vec3 uRim; varying vec3 vC; varying float vA;
      void main(){ vec2 p = gl_PointCoord - 0.5; float r = length(p); if (r > 0.5 || vA < 0.01) discard;
        float rim = smoothstep(0.28, 0.36, r);
        vec3 c = mix(vC, uRim, rim);
        float a = (1.0 - smoothstep(0.44, 0.5, r)) * vA;
        gl_FragColor = vec4(c, a); ${OUTPUT} }`,
  });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = 30; pts.frustumCulled = false;
  scene.add(pts);
  return { pts, pos, alpha, m, g };
}
function buildMarker() {
  const grp = new THREE.Group();
  const pin = new THREE.Mesh(new THREE.ConeGeometry(7, 22, 20).rotateX(Math.PI).translate(0, 22, 0), new THREE.MeshLambertMaterial({ color: C(PAL.blue), emissive: C('#1a0f8a') }));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(8.5, 20, 14).translate(0, 34, 0), new THREE.MeshLambertMaterial({ color: C('#ffffff') }));
  const disc = new THREE.Mesh(new THREE.RingGeometry(8, 11, 32).rotateX(-Math.PI / 2).translate(0, 2.2, 0), new THREE.MeshBasicMaterial({ color: C(PAL.blue), transparent: true, opacity: 0.85 }));
  pin.castShadow = ball.castShadow = true;
  grp.add(pin, ball, disc); grp.visible = false; scene.add(grp);
  return grp;
}

/* ── density grid → ribbon heat ───────────────────────────────────────── */
const CELL = 12;
let grid = null, gw = 0, gh = 0, gx0 = 0, gz0 = 0;
function initGrid(win) {
  gx0 = win[0] - 700; gz0 = win[2] - 700;
  gw = Math.ceil((win[1] - win[0] + 1400) / CELL); gh = Math.ceil((win[3] - win[2] + 1400) / CELL);
  grid = new Uint16Array(gw * gh);
}
const cellOf = (x, z) => { const i = Math.floor((x - gx0) / CELL), j = Math.floor((z - gz0) / CELL); return (i < 0 || j < 0 || i >= gw || j >= gh) ? -1 : j * gw + i; };
function sampleGrid(x, z) {
  const i = Math.floor((x - gx0) / CELL), j = Math.floor((z - gz0) / CELL); let s = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < gw && jj < gh) s += grid[jj * gw + ii]; }
  return s;
}
// the busiest 36 m of road in the model holds ~160 runners (~0.5/m² on an 8 m street): call ~190 full
const HEAT_FULL = 190;

function computeStats(route) {
  const N = F.N, o = {};
  const best = new Map();
  for (let t = 300; t <= 4800; t += 30) {
    grid.fill(0);
    for (let i = 0; i < N; i++) { if (runnerXZ(i, t, o) !== 1) continue; const c = cellOf(o.x, o.z); if (c >= 0) grid[c]++; }
    for (let k = 0; k < R.n; k += 3) {
      const c = cellOf(R.x[k], R.z[k]); if (c < 0) continue;
      const s = sampleGrid(R.x[k], R.z[k]);
      const b = best.get(c); if (!b || s > b[0]) best.set(c, [s, t, k]);
    }
  }
  const cand = [...best.values()].filter((b) => b[2] * R.step > 1400).sort((a, b) => b[0] - a[0]);
  const hot = [];
  for (const c of cand) {
    const x = R.x[c[2]], z = R.z[c[2]];
    if (hot.every((h) => Math.hypot(h.x - x, h.z - z) > 450)) hot.push({ x, z, n: c[0], t: c[1], d: c[2] * R.step });
    if (hot.length >= 3) break;
  }
  const kmOf = (d) => d / R.len * 21.0975;
  const leadKm = kmOf(runnerDist(0, F.lastStart)[0]);
  let winHome = Infinity, wi = 0; for (let i = 0; i < N; i++) if (F.S[i] + F.T[i] < winHome) { winHome = F.S[i] + F.T[i]; wi = i; }
  const ten = 10000 * R.len / 21097.5; let not10 = 0;
  for (let i = 0; i < N; i++) { const [d, st] = runnerDist(i, winHome); if (st !== 2 && d < ten) not10++; }
  return { hot, leadKm, winHome, not10 };
}

/* ── labels ───────────────────────────────────────────────────────────── */
const labelsEl = $('#labels');
const labels = [];
function addLabel(x, y, z, html, cls = '') {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = `<span class="t">${html}</span>`;
  labelsEl.appendChild(el);
  const L = { el, p: new THREE.Vector3(x, y, z), on: false };
  labels.push(L); return L;
}
const _v = new THREE.Vector3();
function updateLabels() {
  const w = innerWidth, h = innerHeight;
  for (const L of labels) {
    if (!L.on) { if (L.el.classList.contains('on')) L.el.classList.remove('on'); continue; }
    _v.copy(L.p).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    L.el.classList.toggle('on', vis);
    if (vis) L.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  }
}

/* ── chapters and navigation ──────────────────────────────────────────── */
const sections = $$('[data-ch]');
function activeChapter() {
  const mid = innerHeight * 0.5;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) return { id: s.dataset.ch, p: clamp((mid - r.top) / r.height, 0, 1) };
  }
  return sections[0].getBoundingClientRect().top > mid ? { id: 'hero', p: 0 } : { id: 'close', p: 1 };
}
const navBtns = [];
function buildNav() {
  const nav = $('#chnav');
  for (const s of sections) {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = `<span>${s.dataset.label}</span><i></i>`;
    b.addEventListener('click', () => {
      const top = s.getBoundingClientRect().top + scrollY;
      const y = s.dataset.ch === 'hero' ? 0 : top - innerHeight * 0.5 + s.offsetHeight * 0.06;
      scrollTo({ top: Math.max(0, y), behavior: REDUCED ? 'auto' : 'smooth' });
    });
    nav.appendChild(b); navBtns.push([s.dataset.ch, b]);
  }
}
let navActive = '';
function updateNav(id) {
  if (id === navActive) return; navActive = id;
  for (const [cid, b] of navBtns) {
    b.classList.toggle('on', cid === id);
    if (cid === id && MOBILE) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
}

const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantTgt = new THREE.Vector3();
let simT = 2100, runnersOp = 0, heatOn = 0, colorMix = 0, furnitureOn = 0;
let selected = -1, replayStart = -1, exPlaying = false;
let userYaw = 0, autoRotate = false;

function overview(angle = 0, dist = 1, tx = 520, tz = 260) {
  const az = 0.55 + angle;                       // 0 = camera due south, positive swings it west
  wantTgt.set(tx, 0, tz);
  wantPos.set(tx - Math.sin(az) * 3500 * dist, 2600 * dist, tz + Math.cos(az) * 3500 * dist);
}
function follow(d, back = 420, up = 300, side = 140) {
  const p = R.at(d, {}); const [hx, hz] = R.headingAvg(d, 220);
  wantTgt.set(p.x + hx * 90, 0, p.z + hz * 90);
  wantPos.set(p.x - hx * back - hz * side, up, p.z - hz * back + hx * side);
}
function orbitAround(x, z, ang, dist, up) { wantTgt.set(x, 0, z); wantPos.set(x + Math.cos(ang) * dist, up, z + Math.sin(ang) * dist); }

let STATS = null, stopEls = [], lmLabels = [], hotLabels = [];
function chapterState(ch, now) {
  const p = ch.p;
  heatOn = 0; colorMix = 0; furnitureOn = 0;
  let reveal = 1e9, clock = false, showLm = false, showHot = false;
  switch (ch.id) {
    case 'hero':
      overview(Math.sin(now * 0.00004) * 0.1 + p * 0.2, 1.0 - p * 0.12);
      simT = 1500 + (REDUCED ? 0 : (now * 0.01) % 3200);
      runnersOp = 1; break;
    case 'course': {
      const q = clamp((p - 0.04) / 0.92, 0, 1);
      const d = smooth(q) * R.len;
      reveal = d + 2;
      if (q <= 0) overview(0.2, 0.85); else if (q >= 1) overview(0.2, 0.9); else follow(d);
      runnersOp = 0; furnitureOn = 1; showLm = true;
      const km = d / R.len * 21.0975;
      stopEls.forEach((el) => el.classList.toggle('on', +el.dataset.km <= km + 0.05));
      lmLabels.forEach((L) => { L.on = L.km <= km + 0.3; });
      break;
    }
    case 'start':
      simT = lerp(-30, F.lastStart + 150, smooth(p));
      orbitAround(-40, 80, -0.9 - p * 0.7, 560, 360);
      runnersOp = 1; clock = true; furnitureOn = 1; break;
    case 'river':
      simT = lerp(F.lastStart, F.maxEnd + 60, p);
      overview(0.15 + p * 0.5, 0.8 + 0.08 * Math.sin(p * Math.PI));
      runnersOp = 1; clock = true; break;
    case 'pressure': {
      heatOn = 1; runnersOp = 0.6; clock = true; showHot = true;
      const hs = STATS ? STATS.hot : [];
      if (hs.length) {
        const k = Math.min(hs.length - 1, Math.floor(p * hs.length * 0.999));
        const h = hs[k], lp = (p * hs.length) % 1;
        simT = h.t - 240 + lp * 480;
        orbitAround(h.x, h.z, -0.7 + k * 1.1 + lp * 0.5, 460, 400);
        hotLabels.forEach((L, j) => { L.on = j === k; });
      } else { overview(0.2, 0.7); simT = 1800; }
      break;
    }
    case 'pace':
      colorMix = 1; runnersOp = 1; clock = true;
      simT = lerp(2600, 4800, p);
      overview(0.5 + p * 0.3, 0.62, 650, 250);
      break;
    case 'community':
      runnersOp = 1; clock = true;
      simT = lerp(1800, 3600, p);
      orbitAround(500, 300, 2.4 + p * 0.9, 3000, 1700);
      break;
    case 'find':
      runnersOp = 1; clock = true;
      if (selected >= 0) {
        if (replayStart >= 0) {
          const q = clamp((now - replayStart) / 26000, 0, 1);
          simT = lerp(F.S[selected] - 20, F.S[selected] + F.T[selected] + 30, q);
          if (q >= 1) replayStart = -1;
        }
        const o = {}; runnerXZ(selected, simT, o);
        const [hx, hz] = (o.d > 0 && o.d < R.len) ? R.headingAvg(o.d, 200) : [0.7, 0.7];
        wantTgt.set(o.x, 0, o.z); wantPos.set(o.x - hx * 360 + hz * 130, 300, o.z - hz * 360 - hx * 130);
      } else { simT = lerp(1200, 2400, p); orbitAround(0, 0, 0.6 + p, 900, 700); }
      break;
    case 'close':
      runnersOp = 1; clock = true; showLm = true;
      lmLabels.forEach((L) => { L.on = true; });
      if (!exPlaying) simT = +$('#exTime').value;
      overview(0.6 + p * 0.3, 0.95);
      break;
  }
  if (!showLm) lmLabels.forEach((L) => { L.on = false; });
  if (!showHot) hotLabels.forEach((L) => { L.on = false; });
  return { reveal, clock };
}

/* ── main ─────────────────────────────────────────────────────────────── */
let ribbon, runners, marker, furniture;
let routeData = null;
async function main() {
  msg('Loading the city');
  const [city, route, field] = await Promise.all([getJSON('./data/city.json'), getJSON('./data/route.json'), getJSON('./data/field.json')]);
  routeData = route;
  msg('Raising buildings');
  await new Promise((r) => setTimeout(r, 20));
  R = makeRoute(route);
  buildSky(); buildGround(city);
  buildBuildings(city);
  buildTrees(city);
  buildLandmarkExtras(route.lm);
  ribbon = buildRibbon(await ribbonTexture());
  furniture = buildCourseFurniture();
  F = prepField(field, R.len);
  runners = buildRunners();
  marker = buildMarker();
  initGrid(city.win);

  const stops = $('#stops');
  for (const l of route.lm) {
    const li = document.createElement('li'); li.dataset.km = l.km;
    li.innerHTML = `<span>${l.km.toFixed(1)} km</span>${l.name}`; stops.appendChild(li); stopEls.push(li);
    const L = addLabel(l.x, (l.h || 25) + 10, l.z, `${l.name}<small>${l.km.toFixed(1)} km</small>`);
    L.km = l.km; lmLabels.push(L);
  }
  buildNav();
  fillText();
  onResize();
  requestAnimationFrame(loop);
  $('#loading').classList.add('done');
  setTimeout(() => {
    STATS = computeStats(route);
    $$('.js-leadKm').forEach((e) => { e.textContent = STATS.leadKm.toFixed(1); });
    $$('.js-not10').forEach((e) => { e.textContent = fmtInt(Math.round(STATS.not10 / 50) * 50); });
    const parts = STATS.hot.map((h) => {
      const km = (h.d / R.len * 21.0975).toFixed(1);
      hotLabels.push(addLabel(h.x, 30, h.z, `Busy<small>km ${km}</small>`, 'hot'));
      const near = nearestLandmark(route.lm, h.x, h.z);
      return `<strong>km ${km}</strong>${near ? ` (${near})` : ''} around ${clockStr(h.t)}`;
    });
    const two = (route.over || []).filter((z) => z.two).sort((a, b) => (b.a[1] - b.a[0]) - (a.a[1] - a.a[0]));
    let twoText = '';
    if (two.length) {
      const z = two[0];
      STATS.hot.push({ x: z.x, z: z.z, t: z.win[0] + 900 });
      hotLabels.push(addLabel(z.x, 30, z.z, `Two-way<small>km ${z.a[0]} ⇄ ${z.b[1]}</small>`, 'hot'));
      twoText = `<p class="fact">The coast road is out-and-back: between <strong>km ${z.a[0]} and ${z.a[1]}</strong> runners heading south share the road with runners coming back at <strong>km ${z.b[0]}–${z.b[1]}</strong>. The leaders meet the field there from ${clockStr(z.win[0])}, and it stays two-way for <strong>${durWords(z.win[1] - z.win[0])}</strong>.</p>`;
    }
    $('#hotText').outerHTML = `<p class="fact">After the start, the field is tightest at ${parts.join(', ')}.</p>${twoText}`;
  }, 60);
}
function nearestLandmark(lm, x, z) {
  let best = null, bd = 380;
  for (const l of lm) { const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l.name; } }
  return best;
}
const setAll = (cls, v) => $$(cls).forEach((e) => { e.textContent = v; });
function fillText() {
  const fd = F.raw, N = F.N, fx = fd.facts || {};
  const km = N * 21.0975;
  setAll('.js-n', fmtInt(N));
  setAll('.js-km', fmtInt(Math.round(km / 1000) * 1000));
  setAll('.js-earth', (km / 40075).toFixed(0));
  setAll('.js-win', hms(F.T[0]));
  setAll('.js-last', durWords(F.maxEnd));
  setAll('.js-lastStart', `about ${Math.round(F.lastStart / 60)} minutes`);
  setAll('.js-samples', fmtInt(fd.model.samples));
  if (fx.woman) { setAll('.js-woman', hms(fx.woman[0])); setAll('.js-womanPl', ordinal(fx.woman[1])); }
  if (fx.sub2) { setAll('.js-sub2a', fmtInt(fx.sub2[0])); setAll('.js-sub2b', fmtInt(fx.sub2[1])); }
  if (fx.sub130) { setAll('.js-s130a', fmtInt(fx.sub130[0])); setAll('.js-s130b', fmtInt(fx.sub130[1])); }
  setAll('.js-kick', fx.kick ?? '–');
  setAll('.js-countries', fmtInt(fx.countries ?? fd.ctys.length));
  setAll('.js-eftN', fmtInt(fx.eftN ?? 0)); setAll('.js-eftClubs', fmtInt(fx.eftClubs ?? 0));
  setAll('.js-young', fmtInt(fx.youngN ?? 0)); setAll('.js-youngBest', hms(fx.youngBest ?? 0));
  if (fx.oldest) { setAll('.js-old', fmtInt(fx.oldest[1])); setAll('.js-oldBest', hms(fx.oldest[2])); }
  let women = 0; for (let i = 0; i < N; i++) if ((fd.cats[fd.cat[i]] || '')[0] === 'K') women++;
  setAll('.js-women', `${Math.round(women / N * 100)}%`);
  const cnt = new Map();
  for (let i = 0; i < N; i++) if (fd.club[i] >= 0) cnt.set(fd.club[i], (cnt.get(fd.club[i]) || 0) + 1);
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const mx = top.length ? top[0][1] : 1;
  $('#clubBars').innerHTML = top.map(([c, n]) => `<div class="bar"><span>${escapeHtml(fd.clubs[c])}</span><em>${n}</em><i style="width:${(n / mx * 100).toFixed(1)}%"></i></div>`).join('');
  drawPaceChart(fd.model);
  $('#exTime').max = Math.ceil(F.maxEnd + 120);
  const wt = $('#waveText'); if (wt) wt.textContent = `21.0975 KM · ${fmtInt(N)} FINISHERS · ONE LOOP THROUGH AARHUS · 21.0975 KM`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function drawPaceChart(md) {
  const svg = $('#paceChart'); const W = 380, H = 190, L = 40, Rr = 10, T = 14, Bm = 26;
  const secs = ['0–1', '1–5', '5–10', '10–15', '15–20', '20–21.1'];
  const colors = [PAL.fast, '#8fcf8a', PAL.mid, PAL.slow];
  const rows = md.paceTable;
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) for (const v of r.pace) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  lo = Math.floor(lo / 30) * 30; hi = Math.ceil(hi / 30) * 30;
  const X = (i) => L + i * (W - L - Rr) / (secs.length - 1), Y = (v) => T + (v - lo) / (hi - lo) * (H - T - Bm);
  let s = '';
  for (let v = lo; v <= hi; v += 30) s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(19,20,58,.08)"/><text x="${L - 6}" y="${Y(v) + 3}" fill="#8a8b9e" font-size="9" text-anchor="end" font-family="JetBrains Mono">${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}</text>`;
  secs.forEach((t, i) => { s += `<text x="${X(i)}" y="${H - 8}" fill="#8a8b9e" font-size="9" text-anchor="middle" font-family="JetBrains Mono">${t}</text>`; });
  rows.forEach((r, j) => {
    const c = colors[j % colors.length];
    s += `<path d="${r.pace.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
    r.pace.forEach((v, i) => { s += `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${c}" stroke="#fff" stroke-width="1.2"/>`; });
  });
  s += `<text x="${L}" y="${T - 4}" fill="#8a8b9e" font-size="8.5" font-family="JetBrains Mono">min/km (lower is faster)</text>`;
  svg.innerHTML = s;
  $('#paceLegend').innerHTML = rows.map((r, j) => `<span><i style="background:${colors[j % colors.length]}"></i>${r.label}</span>`).join('');
}

/* ── frame loop ───────────────────────────────────────────────────────── */
let last = performance.now(), firstFrame = true, shadowSize = 0;
const _r = {}, _off = new THREE.Vector3();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const ch = activeChapter();
  updateNav(ch.id);
  const st = chapterState(ch, now);
  if (exPlaying) { simT += dt * 120; if (simT > F.maxEnd + 120) simT = -60; $('#exTime').value = simT; }

  // camera: chapter target, then the user's rotation around it
  if (autoRotate && !REDUCED) userYaw += dt * 0.1;
  _off.subVectors(wantPos, wantTgt).applyAxisAngle(THREE.Object3D.DEFAULT_UP, userYaw);
  const goal = _off.add(wantTgt);
  const k = firstFrame ? 1 : 1 - Math.exp(-dt * (ch.id === 'course' ? 5 : 2.4));
  camPos.lerp(goal, k); camTgt.lerp(wantTgt, k);
  camera.position.copy(camPos); camera.lookAt(camTgt);
  firstFrame = false;

  // sun and shadow box follow the view
  const dist = camPos.distanceTo(camTgt);
  const size = clamp(Math.round(dist * 0.5 / 100) * 100, 400, 2600);
  sun.target.position.copy(camTgt);
  sun.position.copy(camTgt).addScaledVector(SUN_DIR, 3500);
  if (size !== shadowSize) {
    shadowSize = size;
    const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.updateProjectionMatrix();
  }

  // uniforms
  const ease = 1 - Math.exp(-dt * 3);
  const rm = ribbon.mesh.material.uniforms;
  rm.uReveal.value = st.reveal;
  rm.uHeat.value += (heatOn - rm.uHeat.value) * ease;
  runners.m.uniforms.uOp.value += (runnersOp - runners.m.uniforms.uOp.value) * ease;
  runners.m.uniforms.uMix.value += (colorMix - runners.m.uniforms.uMix.value) * ease;
  furniture.visible = furnitureOn > 0;

  // runners
  const vis = runners.m.uniforms.uOp.value > 0.01;
  const heatVis = rm.uHeat.value > 0.01;
  if (vis || heatVis) {
    if (heatVis) grid.fill(0);
    const P = runners.pos, A = runners.alpha;
    for (let i = 0; i < F.N; i++) {
      const s = runnerXZ(i, simT, _r);
      if (s === 1 && heatVis) { const c = cellOf(_r.x, _r.z); if (c >= 0) grid[c]++; }
      if (vis) { P[i * 3] = _r.x; P[i * 3 + 1] = 3.2; P[i * 3 + 2] = _r.z; A[i] = _r.v; }
    }
    if (vis) { runners.g.attributes.position.needsUpdate = true; runners.g.attributes.aAlpha.needsUpdate = true; }
    if (heatVis) {
      const H = ribbon.heat;
      for (let j = 0; j < R.n; j++) { const v = sampleGrid(R.x[j], R.z[j]) / HEAT_FULL; H[j * 2] = H[j * 2 + 1] = v; }
      ribbon.attr.needsUpdate = true;
    }
  }
  runners.m.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

  if (selected >= 0 && (ch.id === 'find' || ch.id === 'close')) {
    runnerXZ(selected, simT, _r); marker.visible = true; marker.position.set(_r.x, 0, _r.z);
    const s = clamp(dist / 700, 0.6, 3); marker.scale.setScalar(s);
  } else marker.visible = false;

  $('#clock').classList.toggle('on', st.clock);
  if (st.clock) $('#clock').textContent = clockStr(simT);
  $('#explore').classList.toggle('on', ch.id === 'close');
  if (ch.id === 'close') $('#exClock').textContent = clockStr(simT);

  updateLabels();
  renderer.render(scene, camera);
}

/* ── interactions ─────────────────────────────────────────────────────── */
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

// drag to rotate the map around the current view (horizontal drags; vertical still scrolls)
let dragX = null, dragId = null;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { dragX = e.clientX; dragId = e.pointerId; cv.classList.add('drag'); });
addEventListener('pointermove', (e) => {
  if (dragX === null || e.pointerId !== dragId) return;
  userYaw -= (e.clientX - dragX) * 0.006; dragX = e.clientX;
});
const endDrag = () => { dragX = null; dragId = null; cv.classList.remove('drag'); };
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
$('#rotate').addEventListener('click', (e) => {
  autoRotate = !autoRotate; e.currentTarget.setAttribute('aria-pressed', String(autoRotate));
});

$('#exTime').addEventListener('input', (e) => { exPlaying = false; $('#exPlay').textContent = 'Play'; simT = +e.target.value; });
$('#exPlay').addEventListener('click', () => { exPlaying = !exPlaying; $('#exPlay').textContent = exPlaying ? 'Pause' : 'Play'; });

$('#findForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const bib = $('#bib').value.trim().replace(/\D/g, '');
  const i = F ? F.raw.bib.indexOf(+bib) : -1;
  if (!bib || i < 0) { $('#findErr').textContent = bib ? `No finisher with bib ${bib} in the 2026 results.` : 'Type a bib number.'; $('#race').classList.remove('on'); selected = -1; return; }
  $('#findErr').textContent = '';
  selected = i; replayStart = performance.now(); userYaw = 0;
  const fd = F.raw, cat = fd.cats[fd.cat[i]] || '-';
  let catRank = 0, catN = 0;
  for (let j = 0; j < F.N; j++) if (fd.cat[j] === fd.cat[i]) { catN++; if (fd.pl[j] <= fd.pl[i]) catRank++; }
  const pace = F.T[i] / 21.0975;
  $('#rTime').textContent = hms(F.T[i]);
  $('#rPlace').textContent = `${fmtInt(fd.pl[i])} of ${fmtInt(F.N)}`;
  $('#rCat').textContent = cat === '-' ? '–' : `${catLabel(cat)} · ${fmtInt(catRank)} of ${fmtInt(catN)}`;
  $('#rPace').textContent = `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')} min/km`;
  $('#rPct').textContent = `${Math.round((F.N - fd.pl[i]) / F.N * 100)}% of the field`;
  $('#race').classList.add('on');
});
function catLabel(c) {
  const g = { M: 'Men', K: 'Women', U: 'Open' }[c[0]] || '';
  return `${g} ${c.slice(1).replace('-', '–')}`.trim();
}
$('#replay').addEventListener('click', () => { if (selected >= 0) replayStart = performance.now(); });

// race card in the race's own look: blue, beige and the wavy ribbon
$('#card').addEventListener('click', async () => {
  if (selected < 0) return;
  try { await document.fonts.load('800 160px "Barlow Condensed"'); } catch {}
  const i = selected, fd = F.raw;
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = PAL.blue; g.fillRect(0, 0, W, H);
  // course outline in beige
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < R.n; k++) { x0 = Math.min(x0, R.x[k]); x1 = Math.max(x1, R.x[k]); z0 = Math.min(z0, R.z[k]); z1 = Math.max(z1, R.z[k]); }
  const sc = Math.min(520 / (x1 - x0), 640 / (z1 - z0)), ox = W - 90 - (x1 - x0) * sc, oz = 170;
  g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = PAL.beige;
  g.beginPath(); for (let k = 0; k < R.n; k += 2) { const X = ox + (R.x[k] - x0) * sc, Y = oz + (R.z[k] - z0) * sc; k ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
  // wavy white ribbon with the name
  g.save(); g.strokeStyle = '#fff'; g.lineWidth = 64;
  g.beginPath(); g.moveTo(-20, 920); g.bezierCurveTo(260, 820, 420, 1020, 700, 930); g.bezierCurveTo(880, 870, 980, 900, 1100, 860); g.stroke(); g.restore();
  g.fillStyle = PAL.blue; g.font = '700 34px "Barlow Condensed", sans-serif';
  const txt = 'BESTSELLER AARHUS CITY HALF 2026';
  let tx = 60; for (const chh of txt) { const t = (tx + 20) / W; const y = 920 + Math.sin(t * Math.PI * 2.1 - 0.4) * -45; g.fillText(chh, tx, y + 12); tx += g.measureText(chh).width + 7; }
  g.fillStyle = '#fff'; g.font = '700 34px "Barlow Condensed", sans-serif';
  g.fillText('MY RACE · 14 JUNE 2026', 80, 120);
  g.font = '800 190px "Barlow Condensed", sans-serif'; g.fillText(hms(F.T[i]), 70, 1150);
  g.fillStyle = PAL.beige; g.font = '600 44px "Barlow Condensed", sans-serif';
  const cat = fd.cats[fd.cat[i]] || '';
  g.fillText(`PLACE ${fmtInt(fd.pl[i])} OF ${fmtInt(F.N)}  ·  BIB ${fd.bib[i]}`, 80, 1230);
  if (cat && cat !== '-') g.fillText(catLabel(cat).toUpperCase(), 80, 1290);
  c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `city-half-2026-${fd.bib[i]}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
});

main().catch((e) => { console.error(e); msg('Could not load the data'); });
