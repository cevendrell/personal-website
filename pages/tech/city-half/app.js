/* ══════════════════════════════════════════════════════════════════════════
   21.1 km of fællesskab: BESTSELLER Aarhus City Half 2026 in 3D.

   Data (data/*.json, built offline from public sources):
     city.json   OpenStreetMap buildings, streets, water, parks, coastline,
                 in local metres around Rådhusparken (x east, z south), ×0.5
     route.json  the 2026 course (GPS track snapped to OSM streets, 5 m steps),
                 landmarks with their km, places where the course meets itself
     field.json  every finisher: net time, bib, age group, club, country (no
                 names), plus a pacing model from sampled timing-mat splits

   Each runner's position at clock time t is modelled: walk to the start mat
   (start delay from the sampled chip data), then run the course following
   the split profile of their finish-time group, scaled to their net time.
   ══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 760px)').matches;

function hms(sec, withH = true) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return withH || h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
const clockStr = (t, secs = true) => {           // t = seconds after 10:00:00
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
function hash(i) { let x = (i + 1) * 374761393; x = (x ^ (x >>> 13)) * 1274126177; x ^= x >>> 16; return (x >>> 0) / 4294967296; }

/* ── boot ─────────────────────────────────────────────────────────────── */
const stageEl = $('#stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('#nogl').style.display = 'flex'; $('#loading').classList.add('done'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 20, 40000);
camera.position.set(-2600, 2200, 400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Free look (last chapter, mouse only) is created on demand: OrbitControls sets
// touch-action:none on the canvas, which would stop phones from scrolling the page.
let controls = null;
function getControls() {
  if (controls) return controls;
  controls = new OrbitControls(camera, renderer.domElement);
  renderer.domElement.style.touchAction = 'pan-y';
  controls.enableDamping = true;
  controls.enableZoom = false;            // the wheel keeps scrolling the story
  controls.maxPolarAngle = Math.PI * 0.47;
  return controls;
}

const SUN = new THREE.Vector3(0.62, 0.32, -0.36).normalize();   // morning sun over the bay (east)
const U = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color('#594f66') },
  uFogDensity: { value: 0.00012 },
  uSun: { value: SUN },
};
const FOG_VS = `varying float vFogDepth;`;
const FOG_FS = `
  uniform vec3 uFogColor; uniform float uFogDensity; varying float vFogDepth;
  vec3 applyFog(vec3 c){ float f = 1.0 - exp(-uFogDensity*uFogDensity*vFogDepth*vFogDepth); return mix(c, uFogColor, clamp(f,0.0,1.0)); }`;

async function getJSON(p) {
  const r = await fetch(new URL(p, import.meta.url));
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
}
const msg = (t) => { $('#loadmsg').textContent = t; };

/* ── sky ──────────────────────────────────────────────────────────────── */
function buildSky() {
  const g = new THREE.SphereGeometry(30000, 48, 24);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { uSun: U.uSun },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uSun; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 zen = vec3(0.020,0.028,0.075), mid = vec3(0.075,0.085,0.19), hor = vec3(0.10,0.08,0.13);
        vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h));
        c = mix(c, zen, smoothstep(0.2, 0.75, h));
        float s = max(dot(normalize(vec3(vDir.x,0.0,vDir.z)), normalize(vec3(uSun.x,0.0,uSun.z))), 0.0);
        float band = exp(-abs(h-0.02)*9.0);
        c += vec3(1.0,0.5,0.28) * pow(s, 5.0) * band * 0.75;
        c += vec3(1.0,0.75,0.5) * pow(max(dot(vDir,uSun),0.0), 400.0) * 3.0;
        c = mix(vec3(0.03,0.04,0.08), c, smoothstep(-0.25, 0.0, h));
        gl_FragColor = vec4(c,1.0);
      }`,
  });
  const sky = new THREE.Mesh(g, m);
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

/* ── ground layers ────────────────────────────────────────────────────── */
function flatMaterial(hex, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: new THREE.Color(hex) } },
    vertexShader: `${FOG_VS} varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vFogDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `${FOG_FS} uniform vec3 uColor; varying vec3 vW;
      void main(){ vec3 c = uColor; ${opts.grain ? 'c *= 0.92 + 0.08*fract(sin(dot(floor(vW.xz/6.0), vec2(12.9898,78.233)))*43758.5453);' : ''} gl_FragColor = vec4(applyFog(c),1.0); }`,
    polygonOffset: true, polygonOffsetFactor: opts.off ?? -1, polygonOffsetUnits: opts.off ?? -1,
  });
}
function polyGeometry(list, unit, y) {
  const pos = [];
  for (const f of list) {
    const pts = [];
    for (let i = 0; i < f.length; i += 2) pts.push(new THREE.Vector2(f[i] * unit, f[i + 1] * unit));
    if (pts.length < 3) continue;
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch { continue; }
    for (const t of tris) for (const k of t) pos.push(pts[k].x, y, pts[k].y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
function ribbonGeometry(lines, unit, width, y) {
  const pos = [];
  for (const f of lines) {
    for (let i = 0; i + 3 < f.length; i += 2) {
      const ax = f[i] * unit, az = f[i + 1] * unit, bx = f[i + 2] * unit, bz = f[i + 3] * unit;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * width / 2, nz = dx / L * width / 2;
      pos.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
               ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function buildSea() {
  const g = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: `${FOG_VS} varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vFogDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `${FOG_FS} uniform float uTime; uniform vec3 uSun; varying vec3 vW;
      float n2(vec2 p){ return sin(p.x)*sin(p.y); }
      void main(){
        vec2 p = vW.xz;
        vec3 N = normalize(vec3(
          0.06*n2(p*0.045 + vec2(uTime*0.35, 0.0)) + 0.04*n2(p*0.11 + vec2(0.0, uTime*0.5)),
          1.0,
          0.06*n2(p*0.05 + vec2(0.0, -uTime*0.3)) + 0.04*n2(p*0.13 + vec2(uTime*0.45, 0.0))));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N,V),0.0), 4.0);
        vec3 deep = vec3(0.018,0.035,0.075), sky = vec3(0.14,0.11,0.18);
        vec3 c = mix(deep, sky, fres*0.85);
        vec3 R = reflect(-V, N);
        float sp = pow(max(dot(R, uSun), 0.0), 220.0);
        c += vec3(1.0,0.68,0.42) * sp * 2.2;
        gl_FragColor = vec4(applyFog(c),1.0);
      }`,
  });
  const sea = new THREE.Mesh(g, m);
  sea.position.y = -0.6;
  scene.add(sea);
}

function buildGround(city) {
  const u = city.unit;
  const add = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; scene.add(m); return m; };
  add(polyGeometry(city.land, u, 0), flatMaterial('#161a27', { grain: true, off: -1 }), 1);
  add(polyGeometry(city.green, u, 0.15), flatMaterial('#11241f', { grain: true, off: -2 }), 2);
  add(polyGeometry(city.water, u, 0.3), flatMaterial('#0b1630', { off: -3 }), 3);
  add(polyGeometry(city.pier, u, 0.35), flatMaterial('#1b2030', { off: -3 }), 3);
  add(ribbonGeometry(city.rivers, u, 7, 0.32), flatMaterial('#0b1630', { off: -3 }), 3);
  const widths = [13, 9, 6.5, 2.6], cols = ['#30364b', '#2a3043', '#242a3b', '#20263a'];
  for (let k = 3; k >= 0; k--) add(ribbonGeometry(city.roads[k], u, widths[k], 0.45 + (3 - k) * 0.02), flatMaterial(cols[k], { off: -4 - (3 - k) }), 4 + (3 - k));
}

/* ── buildings: one merged mesh, walls carry window cells ─────────────── */
const LANDMARK_H = { 'ARoS Kunstmuseum': 43, 'Aarhus Domkirke': 28, 'Aarhus Rådhus': 22, 'Dokk1': 21, 'Vor Frue Kirke': 16 };
function buildBuildings(city, glowNames) {
  const u = city.unit, nb = city.b.length;
  const named = new Map(city.named.map(([n, i]) => [i, n]));
  const pos = [], nor = [], aux = [];                // aux: wallU, heightFrac, seed, glow
  const centroids = {};
  for (let bi = 0; bi < nb; bi++) {
    const b = city.b[bi];
    const nm = named.get(bi);
    let h = b[0] * u; const mh = b[1] * u;
    if (nm && LANDMARK_H[nm]) h = Math.max(h, LANDMARK_H[nm]);
    const pts = [];
    for (let i = 2; i < b.length; i += 2) pts.push([b[i] * u, b[i + 1] * u]);
    const n = pts.length, seed = hash(bi), glow = nm && glowNames.has(nm) ? 1 : 0;
    if (nm) {
      let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; }
      centroids[nm] = centroids[nm] || { x: cx / n, z: cz / n, h, pts };
    }
    let run = 0;
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const nx = (bz - az) / L, nz = -(bx - ax) / L;
      const quad = [[ax, mh, az, run, 0], [bx, mh, bz, run + L, 0], [bx, h, bz, run + L, 1], [ax, mh, az, run, 0], [bx, h, bz, run + L, 1], [ax, h, az, run, 1]];
      for (const q of quad) { pos.push(q[0], q[1], q[2]); nor.push(nx, 0, nz); aux.push(q[3], q[4], seed, glow); }
      run += L;
    }
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []); } catch { tris = []; }
    for (const t of tris) for (const k of t) { pos.push(pts[k][0], h, pts[k][1]); nor.push(0, 1, 0); aux.push(0, 1, seed, glow); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U, uGlow: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: `${FOG_VS}
      attribute vec4 aux; varying vec3 vN; varying vec3 vW; varying vec4 vAux;
      void main(){ vN = normal; vAux = aux; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vFogDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `${FOG_FS}
      uniform vec3 uSun; uniform float uGlow; uniform float uTime;
      varying vec3 vN; varying vec3 vW; varying vec4 vAux;
      float h1(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec3 N = normalize(vN);
        float sun = max(dot(N, uSun), 0.0);
        bool roof = N.y > 0.5;
        vec3 base = roof ? vec3(0.085,0.092,0.13) : vec3(0.06,0.066,0.095);
        float ao = roof ? 1.0 : mix(0.45, 1.0, smoothstep(0.0, 14.0, vW.y));
        vec3 c = base * ao + vec3(0.42,0.27,0.17) * sun * (roof ? 0.25 : 0.55) * ao;
        c += vec3(0.03,0.04,0.09) * (roof ? 1.0 : 0.6);
        if(!roof){
          float fl = floor(vW.y / 3.3), col = floor(vAux.x / 3.6);
          vec2 f = vec2(fract(vAux.x/3.6), fract(vW.y/3.3));
          float win = step(0.22,f.x)*step(f.x,0.78)*step(0.32,f.y)*step(f.y,0.78);
          float lit = step(0.83, h1(vec3(fl, col, vAux.z*97.0)));
          float tall = step(6.0, vW.y);
          c = mix(c, vec3(0.05,0.07,0.12), win*0.6);
          c += vec3(1.0,0.66,0.34) * win * lit * tall * 0.55;
          float edge = smoothstep(0.96, 1.0, vAux.y);
          c += vec3(0.25,0.22,0.3) * edge * 0.15;
        }
        c += vec3(0.5,0.85,1.0) * vAux.w * uGlow * (roof ? 0.35 : 0.18);
        gl_FragColor = vec4(applyFog(c), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 10;
  scene.add(mesh);
  return { mesh, centroids };
}

/* ── landmark specials ────────────────────────────────────────────────── */
function buildLandmarkExtras(centroids) {
  const out = [];
  const aros = centroids['ARoS Kunstmuseum'];
  if (aros) {                                   // Your rainbow panorama
    const g = new THREE.TorusGeometry(25, 2.6, 12, 96);
    g.rotateX(Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec3 vP;
        vec3 hsv(float h){ vec3 k = abs(fract(h + vec3(0.0,2.0/3.0,1.0/3.0))*6.0-3.0); return clamp(k-1.0,0.0,1.0); }
        void main(){ float a = atan(vP.z, vP.x)/6.28318 + 0.5; gl_FragColor = vec4(hsv(a + uTime*0.01)*1.15, 1.0); }`,
    });
    const ring = new THREE.Mesh(g, m);
    ring.position.set(aros.x, aros.h + 3.4, aros.z);
    scene.add(ring); out.push(ring);
  }
  const dom = centroids['Aarhus Domkirke'];
  if (dom) {                                    // spire on the west tower
    const xs = dom.pts.map((p) => p[0]); const minX = Math.min(...xs), maxX = Math.max(...xs);
    const west = dom.pts.filter((p) => p[0] < minX + (maxX - minX) * 0.22);
    const wx = west.reduce((a, p) => a + p[0], 0) / west.length, wz = west.reduce((a, p) => a + p[1], 0) / west.length;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2a2f45') });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(11, 46, 11), mat); tower.position.set(wx + 3, 23, wz);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(6.5, 47, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3c5a52') }));
    spire.position.set(wx + 3, 46 + 23.5, wz); spire.rotation.y = Math.PI / 4;
    scene.add(tower, spire);
  }
  return out;
}

/* ── course ribbon ────────────────────────────────────────────────────── */
let R = null;           // route helper
function makeRoute(route) {
  const step = route.step, P = route.pts, n = P.length / 2;
  const x = new Float32Array(n), z = new Float32Array(n), hx = new Float32Array(n), hz = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = P[2 * i] / 10; z[i] = P[2 * i + 1] / 10; }
  for (let i = 0; i < n; i++) {                    // smoothed heading over ±20 m
    const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4);
    const dx = x[b] - x[a], dz = z[b] - z[a], L = Math.hypot(dx, dz) || 1;
    hx[i] = dx / L; hz[i] = dz / L;
  }
  const len = (n - 1) * step;
  function at(d, o = {}) {
    if (d <= 0) {                                  // start area: extend backwards
      o.x = x[0] + hx[0] * d; o.z = z[0] + hz[0] * d; o.hx = hx[0]; o.hz = hz[0]; return o;
    }
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
function buildRibbon() {
  const n = R.n, W = 8.5;
  const pos = new Float32Array(n * 2 * 3), dist = new Float32Array(n * 2), side = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const nx = -R.hz[i], nz = R.hx[i];
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1, k = i * 2 + s;
      pos[k * 3] = R.x[i] + nx * W / 2 * sg; pos[k * 3 + 1] = 0.9; pos[k * 3 + 2] = R.z[i] + nz * W / 2 * sg;
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
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uReveal: { value: 1e9 }, uBright: { value: 0.6 }, uHeat: { value: 0 } },
    vertexShader: `attribute float aDist; attribute float aSide; attribute float aHeat; varying float vD; varying float vS; varying float vH;
      void main(){ vD = aDist; vS = aSide; vH = aHeat; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uReveal, uBright, uHeat; varying float vD; varying float vS; varying float vH;
      void main(){
        if (vD > uReveal) discard;
        float core = 1.0 - smoothstep(0.0, 1.0, abs(vS));
        float flow = 0.75 + 0.25*sin((vD - uTime*45.0)*0.06);
        float head = exp(-max(uReveal - vD, 0.0)/90.0) * step(uReveal, 1e8);
        vec3 base = vec3(1.0,0.36,0.18) * (0.35 + 0.65*core) * flow * uBright;
        float h = clamp(vH, 0.0, 1.0);
        vec3 hc = mix(vec3(0.1,0.35,0.55), vec3(1.0,0.75,0.25), smoothstep(0.0,0.5,h));
        hc = mix(hc, vec3(1.0,0.12,0.08), smoothstep(0.5,1.0,h));
        vec3 c = mix(base, hc * (0.45 + 1.1*h) * (0.4+0.6*core), uHeat);
        c += vec3(1.0,0.85,0.6) * head * 2.0 * core;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 20;
  scene.add(mesh);
  return { mesh, heat, attr: g.getAttribute('aHeat') };
}

/* ── km posts: thin light pillars ─────────────────────────────────────── */
function buildKmPosts() {
  const g = new THREE.CylinderGeometry(0.9, 0.9, 1, 6, 1, true); g.translate(0, 0.5, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uOp: { value: 0 } },
    vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uOp; varying float vY; void main(){ gl_FragColor = vec4(vec3(1.0,0.8,0.5)*(1.0-vY)*uOp, 1.0); }`,
  });
  const count = Math.floor(R.len / 1000);
  const inst = new THREE.InstancedMesh(g, m, count);
  const M = new THREE.Matrix4(), o = {};
  for (let k = 1; k <= count; k++) { R.at(k * 1000 * R.len / 21097.5, o); M.makeScale(1, 70, 1); M.setPosition(o.x, 0, o.z); inst.setMatrixAt(k - 1, M); }
  scene.add(inst);
  return inst;
}

/* ── runners ──────────────────────────────────────────────────────────── */
let F = null;            // field arrays
function prepField(field, routeLen) {
  const N = field.t.length;
  const T = Float32Array.from(field.t), S = new Float32Array(N), B = new Uint8Array(N), O = new Float32Array(N);
  const md = field.model;
  const delayAt = (net) => {                      // binned median start delay [median, spread] by net time
    const D = md.delay; if (net <= D[0][0]) return [D[0][1], D[0][2]];
    for (let i = 1; i < D.length; i++) if (net <= D[i][0]) { const t = (net - D[i - 1][0]) / (D[i][0] - D[i - 1][0]); return [lerp(D[i - 1][1], D[i][1], t), lerp(D[i - 1][2], D[i][2], t)]; }
    return [D[D.length - 1][1], D[D.length - 1][2]];
  };
  for (let i = 0; i < N; i++) {
    const [med, spr] = delayAt(T[i]);
    S[i] = Math.max(0, med + (hash(i * 7 + 3) - 0.5) * 2 * spr);
    let b = 0; while (b < md.buckets.length - 1 && T[i] > md.buckets[b].max) b++;
    B[i] = b;
    O[i] = (hash(i * 13 + 1) - 0.5) * 7.0;
  }
  const Dm = md.D.map((k) => k * 1000 * routeLen / 21097.5);
  const prof = md.buckets.map((b) => b.F);
  const sd = Array.from(S).sort((a, b) => a - b), qv = 620 / Math.max(300, sd[Math.floor(N * 0.99)]);
  return { N, T, S, B, O, Dm, prof, qv, raw: field, maxEnd: Math.max(...Array.from(T, (t, i) => t + S[i])) };
}
// distance along course of runner i at clock t (s after 10:00); state: 0 waiting, 1 running, 2 finished
function runnerDist(i, t) {
  const el = t - F.S[i];
  if (el < 0) return [Math.max(-640, el * F.qv - 4), 0];   // shuffle forward through the start area
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
  if (st === 2) {                                   // finish area: drift on, then fade
    const e = d; if (e > 900) { out.v = 0; return st; }
    R.at(R.len, _o);
    const drift = Math.min(70, e * 0.35);
    const sx = -_o.hz, sz = _o.hx;
    out.x = _o.x + _o.hx * drift + sx * F.O[i] * 3; out.z = _o.z + _o.hz * drift + sz * F.O[i] * 3;
    out.v = 1 - e / 900; return st;
  }
  R.at(d, _o);
  const w = st === 0 ? 2.1 : 1.0;
  out.x = _o.x - _o.hz * F.O[i] * w; out.z = _o.z + _o.hx * F.O[i] * w; out.v = 1; out.d = d;
  return st;
}

function buildRunners() {
  const N = F.N;
  const pos = new Float32Array(N * 3), alpha = new Float32Array(N), col = new Float32Array(N * 3), col2 = new Float32Array(N * 3);
  const warm = new THREE.Color('#ffd28a'), fast = new THREE.Color('#7fe3ff'), mid = new THREE.Color('#ffcf7a'), slow = new THREE.Color('#ff7ab6');
  const tmin = F.T[0], tmax = F.T[N - 1];
  for (let i = 0; i < N; i++) {
    const c = warm.clone().offsetHSL((hash(i * 3) - 0.5) * 0.04, 0, (hash(i * 5) - 0.5) * 0.08);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    const q = clamp((F.T[i] - tmin) / (Math.min(tmax, 9000) - tmin), 0, 1);
    const p = q < 0.5 ? fast.clone().lerp(mid, q * 2) : mid.clone().lerp(slow, (q - 0.5) * 2);
    col2[i * 3] = p.r; col2[i * 3 + 1] = p.g; col2[i * 3 + 2] = p.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aCol2', new THREE.BufferAttribute(col2, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(500, 0, 300), 8000);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: 4.2 }, uScale: { value: 1 }, uMix: { value: 0 }, uOp: { value: 0 } },
    vertexShader: `attribute float aAlpha; attribute vec3 aCol; attribute vec3 aCol2; uniform float uSize, uScale, uMix, uOp; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
        float px = uSize * uScale / -mv.z; gl_PointSize = clamp(px, 1.6, 26.0);
        vA = aAlpha * uOp * clamp(px/2.2, 0.35, 1.0); vC = mix(aCol, aCol2, uMix); }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ vec2 p = gl_PointCoord - 0.5; float r = length(p); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r); a = a*a; gl_FragColor = vec4(vC * a * vA * 1.15, 1.0); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = 30;
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, pos, alpha, m, g };
}

/* highlighted runner: a beam of light */
function buildBeam() {
  const grp = new THREE.Group();
  const g = new THREE.CylinderGeometry(2.2, 2.2, 1, 12, 1, true); g.translate(0, 0.5, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime },
    vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying float vY; void main(){ float a = pow(1.0-vY, 1.6); gl_FragColor = vec4(vec3(0.6,0.95,1.0)*a*(0.85+0.15*sin(uTime*4.0)), 1.0); }`,
  });
  const beam = new THREE.Mesh(g, m); beam.scale.set(1, 260, 1);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.2, 2.4) }));
  dot.position.y = 2;
  grp.add(beam, dot); grp.visible = false; scene.add(grp);
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
function sampleGrid(x, z) {             // 3×3 sum
  const i = Math.floor((x - gx0) / CELL), j = Math.floor((z - gz0) / CELL); let s = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < gw && jj < gh) s += grid[jj * gw + ii]; }
  return s;
}
// the busiest 36 m of road in the model holds ~160 runners (~0.5/m² on an 8 m street): call ~190 full
const HEAT_FULL = 190;

/* ── offline-ish statistics: peak, hotspots, start spread ─────────────── */
function computeStats() {
  const N = F.N, o = {};
  let peakN = 0, peakT = 0;
  const best = new Map();                      // cell -> [count, t]
  const tEnd = F.maxEnd + 60;
  for (let t = -60; t <= tEnd; t += (t < 4800 ? 30 : 90)) {
    grid.fill(0);
    let on = 0;
    for (let i = 0; i < N; i++) {
      const st = runnerXZ(i, t, o);
      if (st !== 1) continue;
      on++;
      const c = cellOf(o.x, o.z); if (c >= 0) grid[c]++;
    }
    if (on > peakN) { peakN = on; peakT = t; }
    if (t <= 4800) {
      for (let k = 0; k < R.n; k += 3) {
        const c = cellOf(R.x[k], R.z[k]); if (c < 0) continue;
        const s = sampleGrid(R.x[k], R.z[k]);
        const b = best.get(c); if (!b || s > b[0]) best.set(c, [s, t, k]);
      }
    }
  }
  // hotspots after the first kilometre (the start is busy by design)
  const cand = [...best.values()].filter((b) => b[2] * R.step > 1400).sort((a, b) => b[0] - a[0]);
  const hot = [];
  for (const c of cand) {
    const x = R.x[c[2]], z = R.z[c[2]];
    if (hot.every((h) => Math.hypot(h.x - x, h.z - z) > 450)) hot.push({ x, z, n: c[0], t: c[1], d: c[2] * R.step });
    if (hot.length >= 3) break;
  }
  const delays = Array.from(F.S).sort((a, b) => a - b);
  let firstHome = Infinity; for (let i = 0; i < N; i++) firstHome = Math.min(firstHome, F.S[i] + F.T[i]);
  return { peakN, peakT, hot, cross: delays[Math.floor(delays.length * 0.99)], lastStart: delays[delays.length - 1], firstHome };
}

/* ── labels ───────────────────────────────────────────────────────────── */
const labelsEl = $('#labels');
const labels = [];
function addLabel(x, y, z, html, cls = '') {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = `<span class="t">${html}</span>`;
  labelsEl.appendChild(el);
  const L = { el, p: new THREE.Vector3(x, y, z), on: false, group: cls };
  labels.push(L); return L;
}
const _v = new THREE.Vector3();
function updateLabels() {
  const w = innerWidth, h = innerHeight;
  for (const L of labels) {
    if (!L.on) { if (L.el.classList.contains('on')) L.el.classList.remove('on'); continue; }
    _v.copy(L.p).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    L.el.classList.toggle('on', vis);
    if (vis) L.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  }
}

/* ── chapters ─────────────────────────────────────────────────────────── */
const sections = $$('[data-ch]');
function activeChapter() {
  const mid = innerHeight * 0.5;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) return { id: s.dataset.ch, p: clamp((mid - r.top) / r.height, 0, 1) };
  }
  const r0 = sections[0].getBoundingClientRect();
  return r0.top > mid ? { id: 'hero', p: 0 } : { id: 'close', p: 1 };
}

const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantTgt = new THREE.Vector3();
let simT = 2100, runnersOp = 0, heatOn = 0, colorMix = 0, kmOp = 0, glowOn = 0;
let selected = -1, replayStart = -1, freeMode = false, exPlaying = false;

function overview(angle = 0, dist = 1, tx = 520, tz = 260) {
  const az = 0.35 + angle;                       // 0 = camera due west; positive swings it south. Looks east to the sunrise.
  wantTgt.set(tx, 0, tz);
  wantPos.set(tx - Math.cos(az) * 3600 * dist, 2350 * dist, tz + Math.sin(az) * 3600 * dist);
}
function follow(d, back = 300, up = 210, side = 70) {
  const p = R.at(d, {}); const [hx, hz] = R.headingAvg(d, 220);
  wantTgt.set(p.x + hx * 90, 0, p.z + hz * 90);
  wantPos.set(p.x - hx * back - hz * side, up, p.z - hz * back + hx * side);
}
function orbitAround(x, z, ang, dist, up) {
  wantTgt.set(x, 0, z); wantPos.set(x + Math.cos(ang) * dist, up, z + Math.sin(ang) * dist);
}

let STATS = null, stopEls = [], lmLabels = [], hotLabels = [];
function chapterState(ch, now) {
  const p = ch.p;
  heatOn = 0; colorMix = 0; kmOp = 0; glowOn = 0;
  let reveal = 1e9, showLm = false, showHot = false, hud = false;
  switch (ch.id) {
    case 'hero': {
      overview(Math.sin(now * 0.00004) * 0.12 + p * 0.25, 1.0 - p * 0.15);
      simT = 2400 + (REDUCED ? 0 : (now * 0.012) % 3000);
      runnersOp = 1; glowOn = 0.4; break;
    }
    case 'course': {
      const q = clamp((p - 0.04) / 0.92, 0, 1);
      const d = smooth(q) * R.len;
      reveal = d + 2;
      if (q <= 0) overview(0.25, 0.85); else if (q >= 1) overview(0.25, 0.9); else follow(d, 420, 290, 140);
      runnersOp = 0; kmOp = 1; glowOn = 1; showLm = true;
      const km = d / R.len * 21.0975;
      stopEls.forEach((el) => el.classList.toggle('on', +el.dataset.km <= km + 0.05));
      lmLabels.forEach((L) => { L.on = L.km <= km + 0.3; });
      break;
    }
    case 'start': {
      simT = lerp(-40, Math.max(900, STATS ? STATS.cross + 120 : 900), smooth(p));
      orbitAround(-40, 60, -0.9 - p * 0.6, 520 - p * 60, 330 - p * 40);
      runnersOp = 1; hud = true; break;
    }
    case 'river': {
      simT = lerp(900, (F ? F.maxEnd : 12000) + 120, p);
      overview(0.1 + p * 0.5, 0.78 + 0.1 * Math.sin(p * Math.PI));
      runnersOp = 1; hud = true; break;
    }
    case 'pressure': {
      heatOn = 1; runnersOp = 0.55; hud = true; showHot = true;
      const hs = STATS ? STATS.hot : [];
      if (hs.length) {
        const k = Math.min(hs.length - 1, Math.floor(p * hs.length * 0.999));
        const h = hs[k], lp = (p * hs.length) % 1;
        simT = h.t - 240 + lp * 480;
        orbitAround(h.x, h.z, -0.7 + k * 1.1 + lp * 0.5, 420, 360);
        hotLabels.forEach((L, j) => { L.on = j === k; });
      } else { overview(0.2, 0.7); simT = 1800; }
      break;
    }
    case 'pace': {
      colorMix = 1; runnersOp = 1; hud = true;
      simT = lerp(2400, 4600, p);
      overview(0.5 + p * 0.3, 0.6, 600, 150);
      break;
    }
    case 'community': {
      runnersOp = 1; hud = true; glowOn = 0.6;
      simT = lerp(1500, 3600, p);
      orbitAround(500, 300, 2.6 + p * 0.9, 3000, 1500);
      break;
    }
    case 'find': {
      runnersOp = 1; hud = true;
      if (selected >= 0) {
        if (replayStart >= 0) {
          const dur = 26000; const q = clamp((now - replayStart) / dur, 0, 1);
          simT = lerp(F.S[selected] - 20, F.S[selected] + F.T[selected] + 30, q);
          if (q >= 1) replayStart = -1;
        }
        const o = {}; runnerXZ(selected, simT, o);
        const [hx, hz] = (o.d != null && o.d > 0 && o.d < R.len) ? R.headingAvg(o.d, 200) : [0.7, 0.7];
        wantTgt.set(o.x, 0, o.z); wantPos.set(o.x - hx * 330 + hz * 120, 260, o.z - hz * 330 - hx * 120);
      } else {
        simT = lerp(1200, 2400, p); orbitAround(0, 0, 0.6 + p, 900, 650);
      }
      break;
    }
    case 'close': {
      runnersOp = 1; hud = true; glowOn = 0.6; showLm = true;
      lmLabels.forEach((L) => { L.on = true; });
      if (!exPlaying) simT = +$('#exTime').value;
      overview(0.6 + p * 0.3, 0.95);
      break;
    }
  }
  if (!showLm) lmLabels.forEach((L) => { L.on = false; });
  if (!showHot) hotLabels.forEach((L) => { L.on = false; });
  return { reveal, hud };
}

/* ── main ─────────────────────────────────────────────────────────────── */
let ribbon, runners, beam, kmPosts, buildings;
async function main() {
  msg('Loading the city');
  const [city, route, field] = await Promise.all([getJSON('./data/city.json'), getJSON('./data/route.json'), getJSON('./data/field.json')]);
  msg('Raising buildings');
  await new Promise((r) => setTimeout(r, 20));
  R = makeRoute(route);
  buildSky(); buildSea(); buildGround(city);
  buildings = buildBuildings(city, new Set(route.lm.map((l) => l.osm).filter(Boolean)));
  buildLandmarkExtras(buildings.centroids);
  ribbon = buildRibbon();
  kmPosts = buildKmPosts();
  F = prepField(field, R.len);
  runners = buildRunners();
  beam = buildBeam();
  initGrid(city.win);

  // landmarks and the course list
  const stops = $('#stops');
  for (const l of route.lm) {
    const li = document.createElement('li'); li.dataset.km = l.km;
    li.innerHTML = `<span>${l.km.toFixed(1)} km</span>${l.name}`; stops.appendChild(li); stopEls.push(li);
    const L = addLabel(l.x, (l.h || 25) + 8, l.z, `<small>${l.km.toFixed(1)}</small>${l.name}`);
    L.km = l.km; lmLabels.push(L);
  }
  fillText();
  onResize();
  requestAnimationFrame(loop);
  $('#loading').classList.add('done');
  setTimeout(() => {                        // heavier statistics after first frame
    STATS = computeStats();
    $$('.js-cross').forEach((e) => { e.textContent = durWords(STATS.cross); });
    $$('.js-allFrom').forEach((e) => { e.textContent = clockStr(STATS.lastStart); });
    $$('.js-allTo').forEach((e) => { e.textContent = clockStr(STATS.firstHome); });
    const parts = STATS.hot.map((h) => {
      const km = (h.d / R.len * 21.0975).toFixed(1);
      const L = addLabel(h.x, 30, h.z, `<small>km ${km}</small>${fmtInt(h.n)} runners`, 'hot'); hotLabels.push(L);
      const near = nearestLandmark(route.lm, h.x, h.z);
      return `<strong>km ${km}</strong>${near ? ` near ${near}` : ''}, around ${clockStr(h.t, false)}: about <span class="hotnum">${fmtInt(h.n)}</span> runners within a 36 m stretch`;
    });
    // out-and-back stretches where both directions are busy at the same time
    const two = (route.over || []).filter((z) => z.two).sort((a, b) => (b.a[1] - b.a[0]) - (a.a[1] - a.a[0]));
    let twoText = '';
    if (two.length) {
      const z = two[0];
      STATS.hot.push({ x: z.x, z: z.z, t: z.win[0] + 900, two: true });
      hotLabels.push(addLabel(z.x, 30, z.z, `<small>km ${z.a[0]} ⇄ ${z.b[1]}</small>two-way`, 'hot'));
      twoText = ` One stretch needs a different kind of attention: between <strong>km ${z.a[0]} and ${z.a[1]}</strong> the course goes out and comes back on the same road (<strong>km ${z.b[0]}–${z.b[1]}</strong>). From ${clockStr(z.win[0], false)} the leaders meet runners still heading out, and it stays two-way for <span class="hotnum">${durWords(z.win[1] - z.win[0])}</span>.` +
        (two.length > 1 ? ` The course also crosses itself in ${two.length - 1} more places while both passes are busy.` : '');
    }
    $('#hotText').innerHTML = (parts.length ? `The three tightest spots after the start: ${parts.join('; ')}.` : '') + twoText;
  }, 60);
}
function nearestLandmark(lm, x, z) {
  let best = null, bd = 380;
  for (const l of lm) { const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l.name; } }
  return best;
}

function fillText() {
  const fd = F.raw;
  const N = F.N;
  $$('.js-n').forEach((e) => { e.textContent = fmtInt(N); });
  const km = N * 21.0975;
  $$('.js-km').forEach((e) => { e.textContent = fmtInt(Math.round(km / 1000) * 1000); });
  $$('.js-earth').forEach((e) => { e.textContent = (km / 40075).toFixed(1).replace(/\.0$/, ''); });
  $$('.js-win').forEach((e) => { e.textContent = hms(F.T[0]); });
  $$('.js-last').forEach((e) => { e.textContent = durWords(F.maxEnd); });
  $$('.js-samples').forEach((e) => { e.textContent = fmtInt(fd.model.samples); });
  $$('.js-clubs').forEach((e) => { e.textContent = fmtInt(fd.clubs.length); });
  $$('.js-countries').forEach((e) => { e.textContent = fmtInt(fd.ctys.length); });
  const catNames = fd.cats;
  let women = 0; const ages = new Set();
  for (let i = 0; i < N; i++) { const c = catNames[fd.cat[i]] || ''; if (c[0] === 'K') women++; const a = c.slice(1); if (a && a !== '-') ages.add(a); }
  $$('.js-women').forEach((e) => { e.textContent = `${Math.round(women / N * 100)}%`; });
  $$('.js-ages').forEach((e) => { e.textContent = fmtInt(ages.size); });
  // biggest teams
  const cnt = new Map();
  for (let i = 0; i < N; i++) if (fd.club[i] >= 0) cnt.set(fd.club[i], (cnt.get(fd.club[i]) || 0) + 1);
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mx = top.length ? top[0][1] : 1;
  $('#clubBars').innerHTML = top.map(([c, n]) => `<div class="bar"><span>${escapeHtml(fd.clubs[c])}</span><em>${n}</em><i style="width:${(n / mx * 100).toFixed(1)}%"></i></div>`).join('');
  drawPaceChart(fd.model);
  $('#exTime').max = Math.ceil(F.maxEnd + 120);
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function drawPaceChart(md) {
  const svg = $('#paceChart'); const W = 380, H = 190, L = 40, Rr = 10, T = 12, Bm = 26;
  const secs = ['0–1', '1–5', '5–10', '10–15', '15–20', '20–21.1'];
  const rows = md.paceTable;                     // [{label, color, pace:[s/km × 6]}]
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) for (const v of r.pace) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  lo = Math.floor(lo / 30) * 30; hi = Math.ceil(hi / 30) * 30;
  const X = (i) => L + i * (W - L - Rr) / (secs.length - 1), Y = (v) => T + (v - lo) / (hi - lo) * (H - T - Bm);
  let s = '';
  for (let v = lo; v <= hi; v += 30) s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.07)"/><text x="${L - 6}" y="${Y(v) + 3}" fill="#6f7689" font-size="9" text-anchor="end" font-family="JetBrains Mono">${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}</text>`;
  secs.forEach((t, i) => { s += `<text x="${X(i)}" y="${H - 8}" fill="#6f7689" font-size="9" text-anchor="middle" font-family="JetBrains Mono">${t}</text>`; });
  for (const r of rows) {
    const d = r.pace.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    s += `<path d="${d}" fill="none" stroke="${r.color}" stroke-width="2" stroke-linejoin="round"/>`;
    r.pace.forEach((v, i) => { s += `<circle cx="${X(i)}" cy="${Y(v)}" r="2.4" fill="${r.color}"/>`; });
  }
  s += `<text x="${L}" y="${T - 3}" fill="#6f7689" font-size="8.5" font-family="JetBrains Mono">min/km (lower is faster)</text>`;
  svg.innerHTML = s;
  $('#paceLegend').innerHTML = rows.map((r) => `<span><i style="background:${r.color}"></i>${r.label}</span>`).join('');
}

/* ── frame loop ───────────────────────────────────────────────────────── */
let last = performance.now(), firstFrame = true;
const _r = {};
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  U.uTime.value = now / 1000;
  const ch = activeChapter();
  const st = chapterState(ch, now);

  if (exPlaying) { simT += dt * 120; if (simT > F.maxEnd + 120) simT = -60; $('#exTime').value = simT; }

  // camera
  if (freeMode) { controls.update(); camTgt.copy(controls.target); camPos.copy(camera.position); }
  else {
    const k = firstFrame ? 1 : 1 - Math.exp(-dt * (ch.id === 'course' ? 5 : 2.2));
    camPos.lerp(wantPos, k); camTgt.lerp(wantTgt, k);
    camera.position.copy(camPos); camera.lookAt(camTgt);
  }
  firstFrame = false;

  // uniforms
  const ease = 1 - Math.exp(-dt * 3);
  ribbon.mesh.material.uniforms.uReveal.value = st.reveal;
  ribbon.mesh.material.uniforms.uHeat.value += (heatOn - ribbon.mesh.material.uniforms.uHeat.value) * ease;
  ribbon.mesh.material.uniforms.uBright.value = ch.id === 'course' ? 0.95 : 0.55;
  runners.m.uniforms.uOp.value += (runnersOp - runners.m.uniforms.uOp.value) * ease;
  runners.m.uniforms.uMix.value += (colorMix - runners.m.uniforms.uMix.value) * ease;
  kmPosts.material.uniforms.uOp.value += (kmOp - kmPosts.material.uniforms.uOp.value) * ease;
  buildings.mesh.material.uniforms.uGlow.value += (glowOn - buildings.mesh.material.uniforms.uGlow.value) * ease;

  // runners
  const vis = runners.m.uniforms.uOp.value > 0.01;
  let on = 0, done = 0;
  const heatVis = ribbon.mesh.material.uniforms.uHeat.value > 0.01;
  if (vis || heatVis || st.hud) {
    if (heatVis) grid.fill(0);
    const P = runners.pos, A = runners.alpha;
    for (let i = 0; i < F.N; i++) {
      const s = runnerXZ(i, simT, _r);
      if (s === 1) { on++; if (heatVis) { const c = cellOf(_r.x, _r.z); if (c >= 0) grid[c]++; } }
      else if (s === 2) done++;
      if (vis) { P[i * 3] = _r.x; P[i * 3 + 1] = 1.6; P[i * 3 + 2] = _r.z; A[i] = _r.v; }
    }
    if (vis) { runners.g.attributes.position.needsUpdate = true; runners.g.attributes.aAlpha.needsUpdate = true; }
    if (heatVis) {
      const H = ribbon.heat;
      for (let k = 0; k < R.n; k++) { const v = sampleGrid(R.x[k], R.z[k]) / HEAT_FULL; H[k * 2] = H[k * 2 + 1] = v; }
      ribbon.attr.needsUpdate = true;
    }
  }
  runners.m.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

  // beam on the selected runner
  if (selected >= 0 && (ch.id === 'find' || ch.id === 'close')) {
    runnerXZ(selected, simT, _r); beam.visible = true; beam.position.set(_r.x, 0, _r.z);
  } else beam.visible = false;

  // HUD
  $('#hud').classList.toggle('on', st.hud);
  if (st.hud) {
    $('#hudClock').textContent = clockStr(simT);
    $('#hudOn').textContent = fmtInt(on); $('#hudDone').textContent = fmtInt(done);
  }
  $('#explore').classList.toggle('on', ch.id === 'close');
  if (ch.id === 'close') $('#exClock').textContent = clockStr(simT, false);
  if (freeMode && ch.id !== 'close') setFree(false);

  updateLabels();
  composer.render();
}

/* ── interactions ─────────────────────────────────────────────────────── */
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

function setFree(on) {
  if (!on && !controls) { freeMode = false; return; }
  const c = getControls();
  freeMode = on;
  c.enabled = on;
  if (on) { c.target.copy(camTgt); c.update(); }
}
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && activeChapter().id === 'close' && !freeMode) setFree(true); });
stageEl.style.pointerEvents = 'auto';

$('#exTime').addEventListener('input', (e) => { exPlaying = false; $('#exPlay').textContent = 'Play'; simT = +e.target.value; });
$('#exPlay').addEventListener('click', () => { exPlaying = !exPlaying; $('#exPlay').textContent = exPlaying ? 'Pause' : 'Play'; });

$('#findForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const bib = $('#bib').value.trim().replace(/\D/g, '');
  const i = F ? F.raw.bib.indexOf(+bib) : -1;
  if (!bib || i < 0) { $('#findErr').textContent = bib ? `No finisher with bib ${bib} in the 2026 results.` : 'Type a bib number.'; $('#race').classList.remove('on'); selected = -1; return; }
  $('#findErr').textContent = '';
  selected = i; replayStart = performance.now();
  const fd = F.raw, cat = fd.cats[fd.cat[i]] || '–';
  let catRank = 0, catN = 0;
  for (let j = 0; j < F.N; j++) if (fd.cat[j] === fd.cat[i]) { catN++; if (j <= i) catRank++; }
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

$('#card').addEventListener('click', () => {
  if (selected < 0) return;
  const i = selected, fd = F.raw;
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a0f22'); bg.addColorStop(1, '#1d1530');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // course outline
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < R.n; k++) { x0 = Math.min(x0, R.x[k]); x1 = Math.max(x1, R.x[k]); z0 = Math.min(z0, R.z[k]); z1 = Math.max(z1, R.z[k]); }
  const sc = Math.min(560 / (x1 - x0), 700 / (z1 - z0)), ox = W - 120 - (x1 - x0) * sc, oz = 140;
  g.lineWidth = 7; g.lineJoin = 'round'; g.strokeStyle = '#ff6a3d'; g.shadowColor = '#ff6a3d'; g.shadowBlur = 24;
  g.beginPath(); for (let k = 0; k < R.n; k += 2) { const X = ox + (R.x[k] - x0) * sc, Y = oz + (R.z[k] - z0) * sc; k ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = '#ffcf7a'; g.font = '600 30px Inter, sans-serif'; g.fillText('BESTSELLER AARHUS CITY HALF 2026', 80, 110);
  g.fillStyle = '#eef0f4'; g.font = '800 150px Inter, sans-serif'; g.fillText(hms(F.T[i]), 80, 1000);
  g.font = '500 40px Inter, sans-serif'; g.fillStyle = '#a9b0c0';
  const cat = fd.cats[fd.cat[i]] || '';
  g.fillText(`Place ${fmtInt(fd.pl[i])} of ${fmtInt(F.N)}  ·  bib ${fd.bib[i]}`, 80, 1080);
  if (cat && cat !== '-') g.fillText(catLabel(cat), 80, 1140);
  g.fillStyle = '#ffcf7a'; g.font = '600 36px Inter, sans-serif'; g.fillText(`21.1 km of fællesskab`, 80, 1250);
  c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `city-half-2026-${fd.bib[i]}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
});

main().catch((e) => { console.error(e); msg('Could not load the data'); });
