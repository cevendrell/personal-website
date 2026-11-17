/* ══════════════════════════════════════════════════════════════════════════
   BESTSELLER Aarhus City Half 2026, seen from above.

   Data (data/*.json, built offline from public sources):
     city.json   OpenStreetMap buildings and building parts (heights, roof
                 shapes, colours), streets, water, parks, trees, coastline,
                 in local metres around Rådhusparken (x east, z south), ×0.5
     route.json  the 2026 course (GPS track snapped to OSM streets, 5 m steps),
                 street half-width per point, landmarks, places where the course
                 meets itself, start staging points (Musikhus side) and finish
                 points (Rådhusparken)
     field.json  every finisher: place, net time, start-mat time and start group
                 (estimated from sampled chip data), bib, age group, club,
                 country (no names), a pacing model and anecdotes

   Each runner waits in the park, walks to the start mat at their start time,
   runs the course following the split profile of their finish-time group
   scaled to their own net time, then walks into Rådhusparken.
   ══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 860px)').matches;
function hash(i) { let x = (i + 1) * 374761393; x = (x ^ (x >>> 13)) * 1274126177; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
const C = (hex) => new THREE.Color(hex);

/* ── language ─────────────────────────────────────────────────────────── */
let LANG = 'da';
try { const q = new URLSearchParams(location.search).get('lang'); LANG = q === 'en' || q === 'da' ? q : (localStorage.getItem('ch-lang') || 'da'); } catch { /* storage blocked */ }
const fmtInt = (n) => Math.round(n).toLocaleString(LANG === 'da' ? 'da-DK' : 'en-US');
const fmtDec = (n, d = 1) => (LANG === 'da' ? n.toFixed(d).replace('.', ',') : n.toFixed(d));
function hms(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
const clockStr = (t) => {                          // t = seconds after 10:00:00
  const a = 36000 + Math.round(t), h = Math.floor(a / 3600), m = Math.floor(a / 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const durWords = (sec) => {
  const m = Math.round(sec / 60);
  if (m < 60) return LANG === 'da' ? `${m} minutter` : `${m} minutes`;
  const h = Math.floor(m / 60), r = m % 60;
  return LANG === 'da' ? (r ? `${h} t ${r} min` : `${h} timer`) : (r ? `${h} h ${r} min` : `${h} hours`);
};
const ordinal = (n) => {
  if (LANG === 'da') return `nr. ${fmtInt(n)}`;
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return fmtInt(n) + (s[(v - 20) % 10] || s[v] || s[0]);
};
const LM_DA = { 'Rådhusparken: start & finish': 'Rådhusparken: start & mål', 'Latin Quarter': 'Latinerkvarteret', 'Strandvejen turn, by the bay': 'Vending på Strandvejen' };
const lmName = (n) => (LANG === 'da' ? (LM_DA[n] || n) : n);
const GROUP_NAMES = ['A', 'B', 'C', 'D'];

const TEXT = {
  da: {
    loading: 'Bygger Aarhus', nogl: 'Siden kræver WebGL for at tegne byen. Prøv en nyere browser på en computer.',
    nav: { hero: 'Top', course: 'Ruten', start: 'Starten', river: 'Formiddagen', poi: 'Undervejs', dist: 'Sub-2', pace: 'Tempo', community: 'Fællesskab', find: 'Dit løb', close: 'Udforsk' },
    'hero.date': 'Søndag 14. juni 2026',
    wave: (v) => `21,0975 KM · ${v.n} LØBERE · AARHUS · 21,0975 KM`,
    'hero.cue': 'Scroll',
    'hero.sub': 'En søndag formiddag i Aarhus, genskabt ud fra de offentlige resultater. Hver prik er en løber. Scroll ned og løb med.',
    'course.h': 'Ruten',
    'course.p': 'Fra Rådhusparken gennem Frederiksbjerg, forbi ARoS og Latinerkvarteret, ud til Aarhus Ø, tilbage forbi Dokk1 og Domkirken, ned ad Strandvejen og hjem igen.',
    'start.h': 'Starten',
    'start.p1': (v) => `Startskuddet lyder kl. 10:00, men ikke alle løber afsted på én gang. Chiptiderne viser fire startgrupper, der krydser startmåtten fra kl. 10:00 til omkring kl. ${v.lastStart}.`,
    'start.p2': 'Følg farverne: hurtige løbere fra de senere grupper arbejder sig op gennem feltet.',
    'start.note': (v) => `Grupper og starttider er udledt af chiptiderne for ${v.samples} løbere.`,
    group: (v) => `fra kl. ${v.from} · ${v.n} løbere`,
    'river.h': 'Formiddagen',
    'river.p1': (v) => `Vinderen er i mål efter <strong>${v.win}</strong>. I det øjeblik har omkring <strong>${v.not10} løbere</strong> endnu ikke passeret 10 km.`,
    'river.p2': (v) => `Hurtigste kvinde løber <strong>${v.woman}</strong> og bliver ${v.womanPl} samlet.`,
    'river.p3': (v) => `Den sidste løber er i mål <strong>${v.last}</strong> efter startskuddet.`,
    'poi.h': 'Undervejs',
    'poi.p': 'Ruten løber forbi byens ikoner og titelsponsoren, og nogle steder kan man heppe på de samme løbere flere gange. Tryk på et sted for at se det.',
    poiIcons: 'Byens ikoner', poiSponsor: 'Titelsponsor', poiCheer: 'Heppesteder: se feltet flere gange', and: 'og',
    poi_aros: 'ARoS og Your rainbow panorama', poi_latin: 'Latinerkvarteret', poi_lighthouse: 'Aarhus Ø og Lighthouse (142 m)',
    poi_dokk1: 'Dokk1, biblioteket ved havnen', poi_domkirke: 'Domkirken og Bispetorvet', poi_bay: 'Strandvejen langs bugten',
    poi_bestseller: 'BESTSELLER ved Navitas, Aarhus Ø',
    poiOutback: (v) => `Ud og hjem: løberne kommer forbi i begge retninger (km ${v.a} og ${v.b}) fra kl. ${v.from} i ${v.dur}`,
    poiTimes: (v) => `Feltet kommer forbi ${v.n} gange: km ${v.km}`,
    'dist.h': 'Ruset mod sub-2',
    'dist.p1': 'Sluttiderne følger ikke en pæn klokkekurve. Lige før de runde tider topper søjlerne, og lige efter falder de: folk presser på for at nå under målet.',
    'dist.p2': (v) => `<strong>${v.a} løbere</strong> kom i mål i de to minutter før 2:00:00, og kun ${v.b} i de to minutter efter. Ved 1:30 er det ${v.c} lige under og ${v.d} lige over.`,
    distAxis: 'løbere pr. minut', distTarget: 'to minutter før en rund tid',
    'pace.h': 'Tempoet',
    'pace.p': (v) => `Mediantempo på hver del af ruten, efter sluttid. Alle taber fart efter 15 km, men <strong>${v.kick} %</strong> sætter tempoet op på den sidste kilometer.`,
    paceAxis: 'min/km, hurtigst øverst',
    paceGroups: ['Under 1:35', '1:35–1:55', '1:55–2:15', 'Over 2:15'],
    'com.h': 'Fællesskab',
    'com.s1': 'løbere i mål', 'com.s2': (v) => `km tilsammen, ${v.earth} gange rundt om Jorden`, 'com.s3': 'nationaliteter', 'com.s4': 'kvinder',
    'com.p': (v) => `<strong>${v.eftN} elever</strong> fra ${v.eftClubs} efterskoler, <strong>${v.young}</strong> løbere under 16 og <strong>${v.old}</strong> på 75 år eller mere. Den hurtigste over 75 løb ${v.oldBest}.`,
    'com.teams': 'Største hold',
    'find.h': 'Dit løb',
    'find.p': 'Skriv dit startnummer, og følg dit eget løb blandt de løbere, der var omkring dig.',
    'find.ph': 'Startnummer', 'find.go': 'Find',
    'find.time': 'Tid', 'find.place': 'Placering', 'find.cat': 'Aldersgruppe', 'find.group': 'Startgruppe', 'find.passed': 'Overhalet / blev overhalet',
    'find.k1': 'du har overhalet', 'find.k2': 'har overhalet dig', 'find.card': 'Gem løbskort',
    notFound: (v) => `Intet startnummer ${v.bib} blandt de gennemførte løbere i 2026.`, typeBib: 'Skriv et startnummer.',
    of: 'af', pin: (v) => `#${v.bib}<small>km ${v.km}</small><em class="up">▲${v.up}</em><em class="down">▼${v.down}</em>`,
    cats: { M: 'Mænd', K: 'Kvinder', U: 'Åben' },
    'ex.h': 'Udforsk', 'ex.p': 'Træk i kortet for at dreje og vippe det. Brug tidslinjen nederst til at spole gennem formiddagen.', 'ex.reset': 'Nulstil',
    footer: (v) => `Resultater fra <a href="https://www.aarhusmotion.dk/event/293/resultater" target="_blank" rel="noopener">aarhusmotion.dk</a>. Løbernes positioner er modelleret ud fra hver løbers nettotid, med startgrupper og tempo fra ${v.samples} løberes chiptider. Ingen navne gemmes. Kortdata © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-bidragydere</a>. Tagfarver udledt af luftfoto fra Esri, Maxar, Earthstar Geographics. Ikke en officiel side fra Aarhus Motion eller BESTSELLER.`,
    card1: 'MIT LØB · 14. JUNI 2026', card2: (v) => `PLACERING ${v.pl} AF ${v.n}  ·  STARTNR. ${v.bib}`,
  },
  en: {
    loading: 'Building Aarhus', nogl: 'This page needs WebGL to draw the city. Try a recent desktop browser.',
    nav: { hero: 'Top', course: 'Course', start: 'The start', river: 'Morning', poi: 'Along the way', dist: 'Sub-2', pace: 'Pacing', community: 'Fællesskab', find: 'Your race', close: 'Explore' },
    'hero.date': 'Sunday 14 June 2026',
    wave: (v) => `21.0975 KM · ${v.n} RUNNERS · AARHUS · 21.0975 KM`,
    'hero.cue': 'Scroll',
    'hero.sub': 'One Sunday morning in Aarhus, rebuilt from the public results. Every dot is a runner. Scroll down to run it.',
    'course.h': 'The course',
    'course.p': 'From Rådhusparken through Frederiksbjerg, past ARoS and the Latin Quarter, out to Aarhus Ø, back by Dokk1 and the cathedral, down the coast road and home.',
    'start.h': 'The start',
    'start.p1': (v) => `The gun goes at 10:00, but not everyone leaves at once. The chip times show four start groups crossing the mat from 10:00 until about ${v.lastStart}.`,
    'start.p2': 'Follow the colours: fast runners from the later groups work their way up through the field.',
    'start.note': (v) => `Groups and start times are estimated from ${v.samples} runners' chip times.`,
    group: (v) => `from ${v.from} · ${v.n} runners`,
    'river.h': 'The morning',
    'river.p1': (v) => `The winner finishes in <strong>${v.win}</strong>. At that moment, about <strong>${v.not10} runners</strong> haven't reached 10 km.`,
    'river.p2': (v) => `The fastest woman runs <strong>${v.woman}</strong>, ${v.womanPl} overall.`,
    'river.p3': (v) => `The last finisher comes home <strong>${v.last}</strong> after the gun.`,
    'poi.h': 'Along the way',
    'poi.p': 'The course passes the city\'s icons and the title sponsor, and in a few places you can cheer for the same runners more than once. Tap a place to see it.',
    poiIcons: 'City icons', poiSponsor: 'Title sponsor', poiCheer: 'Cheering spots: see the field more than once', and: 'and',
    poi_aros: 'ARoS and Your rainbow panorama', poi_latin: 'The Latin Quarter', poi_lighthouse: 'Aarhus Ø and the Lighthouse (142 m)',
    poi_dokk1: 'Dokk1, the library on the harbour', poi_domkirke: 'The cathedral and Bispetorvet', poi_bay: 'Strandvejen along the bay',
    poi_bestseller: 'BESTSELLER by Navitas, Aarhus Ø',
    poiOutback: (v) => `Out and back: runners pass in both directions (km ${v.a} and ${v.b}) from ${v.from} for ${v.dur}`,
    poiTimes: (v) => `The field passes ${v.n} times: km ${v.km}`,
    'dist.h': 'The sub-2 rush',
    'dist.p1': "Finish times don't follow a neat bell curve. The bars peak just before the round times and drop just after: people push to get under their target.",
    'dist.p2': (v) => `<strong>${v.a} runners</strong> finished in the two minutes before 2:00:00, and only ${v.b} in the two minutes after. At 1:30 it's ${v.c} just under and ${v.d} just over.`,
    distAxis: 'runners per minute', distTarget: 'two minutes before a round time',
    'pace.h': 'Pacing',
    'pace.p': (v) => `Median pace on each part of the course, by finish time. Everyone slows after 15 km, but <strong>${v.kick}%</strong> speed up again for the last kilometre.`,
    paceAxis: 'min/km, fastest at the top',
    paceGroups: ['Under 1:35', '1:35–1:55', '1:55–2:15', 'Over 2:15'],
    'com.h': 'Fællesskab',
    'com.s1': 'finishers', 'com.s2': (v) => `km together, ${v.earth} times around the Earth`, 'com.s3': 'nationalities', 'com.s4': 'women',
    'com.p': (v) => `<strong>${v.eftN} students</strong> from ${v.eftClubs} efterskoler, <strong>${v.young}</strong> runners under 16 and <strong>${v.old}</strong> aged 75 or more. The fastest 75+ runner finished in ${v.oldBest}.`,
    'com.teams': 'Biggest teams',
    'find.h': 'Your race',
    'find.p': 'Type your bib number to follow your own race among the runners around you.',
    'find.ph': 'Bib number', 'find.go': 'Find',
    'find.time': 'Time', 'find.place': 'Place', 'find.cat': 'Age group', 'find.group': 'Start group', 'find.passed': 'Passed / passed by',
    'find.k1': 'you passed them', 'find.k2': 'they passed you', 'find.card': 'Save race card',
    notFound: (v) => `No finisher with bib ${v.bib} in the 2026 results.`, typeBib: 'Type a bib number.',
    of: 'of', pin: (v) => `#${v.bib}<small>km ${v.km}</small><em class="up">▲${v.up}</em><em class="down">▼${v.down}</em>`,
    cats: { M: 'Men', K: 'Women', U: 'Open' },
    'ex.h': 'Explore', 'ex.p': 'Drag the map to rotate and tilt it. Use the timeline at the bottom to scrub through the morning.', 'ex.reset': 'Reset',
    footer: (v) => `Results from <a href="https://www.aarhusmotion.dk/event/293/resultater" target="_blank" rel="noopener">aarhusmotion.dk</a>. Runner positions are modelled from each finisher's net time, with start groups and pacing from ${v.samples} runners' chip times. No names are stored. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>. Roof colours derived from imagery by Esri, Maxar, Earthstar Geographics. Not an official Aarhus Motion or BESTSELLER page.`,
    card1: 'MY RACE · 14 JUNE 2026', card2: (v) => `PLACE ${v.pl} OF ${v.n}  ·  BIB ${v.bib}`,
  },
};
const T = (k, v = {}) => { const x = TEXT[LANG][k]; return typeof x === 'function' ? x(v) : (x ?? k); };

/* ── palette ──────────────────────────────────────────────────────────── */
const PAL = {
  blue: '#0d00c4', sweater: '#cdbfa9', brown: '#8c7461', coral: '#e4572e',
  skyTop: '#9dbcd9', skyHorizon: '#efe9df', fog: '#ebe5da',
  land: '#e6dccb', green: '#b4c99a', water: '#a9c6d6', pier: '#dcd1bf',
  road: ['#f8f3ea', '#f5efe4', '#f1eadd', '#ece3d4'],
  wall: '#efe6d8', roofFlat: '#cdbfa9', roofTile: '#b4826a', roofSlate: '#8a8580',
  tree: ['#8aa872', '#779a60', '#9cb783', '#6b8d57'],
  heatMid: '#cdbfa9', heatHi: '#d2462a',
  groups: ['#ffffff', '#9fd0ff', '#e6d3b3', '#ff9d7a'],
  chart: ['#0d00c4', '#6a62de', '#b39b80', '#5f4a3a'],
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
scene.fog = new THREE.Fog(C(PAL.fog), 3200, 14000);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 20, 40000);
camera.position.set(-2600, 2200, 400);
const SUN_DIR = new THREE.Vector3(0.48, 0.78, 0.40).normalize();      // June, late morning: high in the south-east
scene.add(new THREE.HemisphereLight(C('#eef1f5'), C(PAL.sweater), 1.15));
const sun = new THREE.DirectionalLight(C('#fff3e0'), 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 1.2;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 7000;
scene.add(sun, sun.target);

const DATA_VERSION = 11;           // bump with every data change so browsers refetch
async function getJSON(p) {
  const r = await fetch(new URL(p + '?v=' + DATA_VERSION, import.meta.url));
  if (!r.ok) throw new Error(p + ' ' + r.status);
  return r.json();
}
const OUTPUT = '\n#include <colorspace_fragment>\n';   // preprocessor line: must stand alone

/* soft edge: the map dissolves into the ground colour towards the window edge */
const FADE = { uFadeC: { value: new THREE.Vector2(550, 325) }, uFadeR: { value: new THREE.Vector2(2200, 2825) }, uFadeCol: { value: new THREE.Color().setHex(0xe6dccb, THREE.LinearSRGBColorSpace) } };
/* intro: the city rises outwards from Rådhusparken (same code in the shadow pass, so shadows grow too) */
const GROW = { uGrow: { value: REDUCED ? 1 : 0 } };
function addGrow(sh) {
  sh.uniforms.uGrow = GROW.uGrow;
  sh.vertexShader = 'uniform float uGrow;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float growG = clamp(uGrow * 2.7 - length(instanceMatrix[3].xz) / 2600.0, 0.0, 1.0);
        transformed *= 1.0 - pow(1.0 - growG, 3.0);
      #else
        float growG = clamp(uGrow * 2.7 - length(position.xz) / 2600.0, 0.0, 1.0);
        transformed.y *= 1.0 - pow(1.0 - growG, 3.0);
      #endif`);
}
function growDepth() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = addGrow;
  return m;
}
function withFade(mat, grow = false) {
  mat.onBeforeCompile = (sh) => {
    if (grow) addGrow(sh);
    Object.assign(sh.uniforms, FADE);
    sh.vertexShader = 'varying vec2 vFadeXZ;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 fadeW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        fadeW = instanceMatrix * fadeW;
      #endif
      vFadeXZ = (modelMatrix * fadeW).xz;`);
    sh.fragmentShader = 'uniform vec2 uFadeC; uniform vec2 uFadeR; uniform vec3 uFadeCol; varying vec2 vFadeXZ;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `float fadeE = length((vFadeXZ - uFadeC) / uFadeR);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uFadeCol, smoothstep(0.74, 0.98, fadeE));
      #include <fog_fragment>`);
  };
  return mat;
}

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
  sky.renderOrder = -10; scene.add(sky);
}

/* ── ground layers ────────────────────────────────────────────────────── */
function lambert(hex, off = 0, fade = true) {
  const m = new THREE.MeshLambertMaterial({ color: C(hex), polygonOffset: off !== 0, polygonOffsetFactor: off, polygonOffsetUnits: off });
  return fade ? withFade(m) : m;
}
function upTri(pos, ax, az, bx, bz, cx, cz, y) {      // wound so the front face points up
  if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) >= 0) pos.push(ax, y, az, bx, y, bz, cx, y, cz);
  else pos.push(ax, y, az, cx, y, cz, bx, y, bz);
}
function flatGeo(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}
function polyGeometry(list, unit, y) {
  const pos = [];
  for (const f of list) {
    const pts = [];
    for (let i = 0; i < f.length; i += 2) pts.push(new THREE.Vector2(f[i] * unit, f[i + 1] * unit));
    if (pts.length < 3) continue;
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch { continue; }
    for (const t of tris) upTri(pos, pts[t[0]].x, pts[t[0]].y, pts[t[1]].x, pts[t[1]].y, pts[t[2]].x, pts[t[2]].y, y);
  }
  return flatGeo(pos);
}
function ribbonGeometry(lines, unit, width, y) {
  const pos = [];
  for (const f of lines) {
    for (let i = 0; i + 3 < f.length; i += 2) {
      const ax = f[i] * unit, az = f[i + 1] * unit, bx = f[i + 2] * unit, bz = f[i + 3] * unit;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * width / 2, nz = dx / L * width / 2, ex = dx / L * width * 0.35, ez = dz / L * width * 0.35;
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
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), lambert(PAL.water, 0, false));
  sea.position.y = -0.4; scene.add(sea);
  add(polyGeometry(city.land, u, 0), lambert(PAL.land, -1, false));
  add(polyGeometry(city.green, u, 0.1), lambert(PAL.green, -2));
  add(polyGeometry(city.water, u, 0.2), lambert(PAL.water, -3));
  add(ribbonGeometry(city.rivers, u, 7, 0.2), lambert(PAL.water, -3));
  add(polyGeometry(city.pier, u, 0.25), lambert(PAL.pier, -3));
  const widths = [13, 9, 6.5, 2.6];
  for (let k = 3; k >= 0; k--) add(ribbonGeometry(city.roads[k], u, widths[k], 0.3 + (3 - k) * 0.02), lambert(PAL.road[k], -4 - (3 - k)));
}

/* ── buildings: walls, flat / gabled / pyramid / dome roofs ───────────── */
// a roof colour sampled from satellite imagery, tamed to the page's daytime palette
const _hsl = {};
function satRoof(hex, fallback) {
  if (hex == null || hex < 0) return null;
  const c = new THREE.Color().setHex(hex);
  c.getHSL(_hsl);
  if (_hsl.h > 0.16 && _hsl.h < 0.47 && _hsl.s > 0.1) return null;          // tree canopy over the roof, not the roof
  _hsl.l = clamp(_hsl.l * 1.2 + 0.07, 0.24, 0.86);                          // lift shade and haze from the photo
  _hsl.s = Math.min(_hsl.s * 1.1, 0.42);
  c.setHSL(_hsl.h, _hsl.s, _hsl.l);
  return fallback.clone().lerp(c, 0.72);
}
function buildBuildings(city, models = {}) {
  const u = city.unit, cols = (city.cols || []).map((h) => C(h));
  // the hand-built landmarks replace whatever OSM has inside their footprints
  const replaced = ['lighthouse', 'dokk1', 'navitas', 'bestseller'].filter((k) => models[k]).map((k) => ringOf(models[k]));
  const radhus = models.radhus ? ringOf(models.radhus) : null;
  const marble = C('#d9d6cd'), copper = C('#8fb3a1'), leadGrey = C('#9a9c9e');
  const wallBase = C(PAL.wall), flatBase = C(PAL.roofFlat), tile = C(PAL.roofTile), slate = C(PAL.roofSlate);
  const pos = [], col = [];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  const tri = (a, b, c, k) => { push(a[0], a[1], a[2], k); push(b[0], b[1], b[2], k); push(c[0], c[1], c[2], k); };
  for (let bi = 0; bi < city.b.length; bi++) {
    const b = city.b[bi];
    const h = b[0] * u, mh = b[1] * u, rc = b[2], rh = b[3] * u, wc = b[4], rcol = b[5];
    const pts = [];
    for (let i = 6; i < b.length; i += 2) pts.push([b[i] * u, b[i + 1] * u]);
    const n = pts.length; if (n < 3) continue;
    const ctr = centroid(pts);
    if (replaced.some((r) => pip(ctr[0], ctr[1], r))) continue;
    if (models.aros && mh >= 44 && Math.hypot(ctr[0] - models.aros[0], ctr[1] - models.aros[1]) < models.aros[2] + 8) continue;   // drawn as one glass ring instead
    const inRadhus = radhus && pip(ctr[0], ctr[1], radhus);
    const jitter = (hash(bi) - 0.5) * 0.06;
    let roof;
    if (inRadhus) roof = (h >= 54 ? copper : leadGrey).clone();
    else if (rcol >= 0) roof = flatBase.clone().lerp(cols[rcol], 0.7);
    else if (rc === 1 || rc === 2) roof = (hash(bi * 3 + 1) < 0.62 ? tile : slate).clone();
    else roof = flatBase.clone();
    const sat = !inRadhus && city.sat ? satRoof(city.sat[bi], roof) : null;   // the roof's real colour, seen from above
    if (sat) roof = sat;
    roof.offsetHSL(0, 0, jitter);
    let wall = (wc >= 0 ? wallBase.clone().lerp(cols[wc], 0.55) : wallBase.clone()).offsetHSL(0, 0, jitter);
    if (sat && wc < 0) wall.lerp(sat, 0.14);                                // a hint of the roof in the facade
    if (inRadhus) wall = marble.clone();                                    // Norwegian marble cladding
    const wallLo = mh < 0.5 ? wall.clone().multiplyScalar(0.8) : wall;   // soft contact shade at street level
    const gable = rc === 1 && n === 4 && rh > 0.3;
    const eave = rc === 0 || rh <= 0.3 ? h : (rc === 1 && !gable ? h - rh * 0.6 : h - rh);
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      push(ax, mh, az, wallLo); push(bx, mh, bz, wallLo); push(bx, eave, bz, wall);
      push(ax, mh, az, wallLo); push(bx, eave, bz, wall); push(ax, eave, az, wall);
    }
    if (gable) {
      const L = (i) => Math.hypot(pts[(i + 1) % 4][0] - pts[i][0], pts[(i + 1) % 4][1] - pts[i][1]);
      const o = L(0) + L(2) >= L(1) + L(3) ? 0 : 1;
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
        const RR = 5; let prev = pts.map((q) => [q[0], eave, q[1]]);
        for (let k = 1; k <= RR; k++) {
          const ang = k / RR * Math.PI / 2, s = Math.cos(ang), y = eave + rh * Math.sin(ang);
          const ring = pts.map((q) => [cx + (q[0] - cx) * s, y, cz + (q[1] - cz) * s]);
          for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(prev[i], prev[j], ring[j], roof); tri(prev[i], ring[j], ring[i], roof); }
          prev = ring;
        }
      }
    } else {
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts.map((q) => new THREE.Vector2(q[0], q[1])), []); } catch { tris = []; }
      for (const t of tris) tri([pts[t[0]][0], eave, pts[t[0]][1]], [pts[t[1]][0], eave, pts[t[1]][1]], [pts[t[2]][0], eave, pts[t[2]][1]], roof);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, withFade(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), true));
  mesh.customDepthMaterial = growDepth();
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}
function buildTrees(city) {
  const t = city.trees || [], n = t.length / 2, u = city.unit;
  const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), withFade(new THREE.MeshLambertMaterial({ flatShading: true }), true), n);
  inst.customDepthMaterial = growDepth();
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const greens = PAL.tree.map((h) => C(h));
  for (let i = 0; i < n; i++) {
    const r = 3.2 + hash(i * 7) * 3.2;
    p.set(t[i * 2] * u, r * 1.25, t[i * 2 + 1] * u); s.set(r, r * 1.3, r);
    q.setFromAxisAngle(up, hash(i * 11) * 6.28);
    M.compose(p, q, s); inst.setMatrixAt(i, M);
    inst.setColorAt(i, greens[Math.floor(hash(i * 5) * greens.length)]);
  }
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
}
/* ── landmarks: hand-built models of the buildings along the course ──── */
const ringOf = (flat) => { const r = []; for (let i = 0; i < flat.length; i += 2) r.push([flat[i], flat[i + 1]]); return r; };
const centroid = (r) => r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
const scaleRing = (r, s, c = centroid(r)) => r.map((p) => [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s]);
function pip(x, z, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// one facade tile = one bay wide, one floor high
const FACADE = {
  lighthouse: () => canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#a9c0cf'); gr.addColorStop(1, '#8aa5b8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(w * 0.48, 0, 3, h);
    g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, w, h * 0.3);                    // balcony slab edge
  }),
  dokk1: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#dedad2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a5560'; g.fillRect(0, h * 0.36, w, h * 0.34);               // the long window band
    g.fillStyle = 'rgba(255,255,255,.25)'; for (let x = 0; x < w; x += 32) g.fillRect(x, h * 0.36, 2, h * 0.34);
  }),
  glass: () => canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#9db8c2'); gr.addColorStop(1, '#7f9ea9');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#eef0ee'; g.fillRect(0, 0, w, 10);                           // floor line
    g.fillStyle = 'rgba(238,240,238,.8)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h);
  }),
  dark: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#34353b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7d8a96'; for (let x = 10; x < w; x += 32) g.fillRect(x, h * 0.18, 12, h * 0.66);   // tall slit windows
  }),
  marble: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d9d6cd'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5c6670'; g.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.55);   // the Rådhus' square window grid
  }),
};
// walls of a ring from y0 up to top(i) (a number or a per-vertex function), UVs in bays and floors
function wallGeo(ring, y0, top, bay, floor, out = 0) {
  const pos = [], uv = [], n = ring.length, topAt = typeof top === 'function' ? top : () => top;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n], L = Math.hypot(bx - ax, bz - az);
    const ta = topAt(i), tb = topAt((i + 1) % n);
    pos.push(ax, y0, az, bx, y0, bz, bx, tb, bz, ax, y0, az, bx, tb, bz, ax, ta, az);
    const u0 = run / bay, u1 = (run + L) / bay;
    uv.push(u0, y0 / floor, u1, y0 / floor, u1, tb / floor, u0, y0 / floor, u1, tb / floor, u0, ta / floor);
    run += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function capGeo(ring, top) {
  const pos = [], topAt = typeof top === 'function' ? top : () => top;
  let tris; try { tris = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), []); } catch { tris = []; }
  for (const t of tris) for (const k of t) pos.push(ring[k][0], topAt(k), ring[k][1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function slabGeo(ring, y0, y1) {     // a closed flat slab (walls + top + bottom)
  const w = wallGeo(ring, y0, y1, 10, 10), a = capGeo(ring, y1), b = capGeo(ring, y0);
  const pos = [...w.attributes.position.array, ...a.attributes.position.array, ...b.attributes.position.array];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
function landmarkMesh(geo, mat) {
  mat.onBeforeCompile = addGrow;          // grows with the city, but never fades into the edge (the Lighthouse stands near it)
  const m = new THREE.Mesh(geo, mat);
  m.customDepthMaterial = growDepth(); m.castShadow = true; m.receiveShadow = true;
  scene.add(m); return m;
}
const LM_MAT = (opts) => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, ...opts });

function buildLandmarks(models, lm) {
  if (!models) return;
  // Lighthouse (Aarhus Ø, 142 m): glass tower, undulating white balconies, sloping crown
  if (models.lighthouse) {
    const r = ringOf(models.lighthouse), c = centroid(r);
    let far = r[0]; for (const p of r) if (Math.hypot(p[0] - c[0], p[1] - c[1]) > Math.hypot(far[0] - c[0], far[1] - c[1])) far = p;
    const dx = far[0] - c[0], dz = far[1] - c[1], dl = Math.hypot(dx, dz) || 1;
    const crown = (i) => 128 + 14 * (0.5 + 0.5 * ((r[i][0] - c[0]) * dx + (r[i][1] - c[1]) * dz) / (dl * dl));
    const tex = FACADE.lighthouse();
    landmarkMesh(wallGeo(r, 0, crown, 4, 3.15), LM_MAT({ map: tex }));
    landmarkMesh(capGeo(r, crown), LM_MAT({ color: C('#f2f1ec') }));
    const slabs = [];
    for (let f = 2; f * 3.15 < 124; f++) {
      const s = 1.035 + 0.03 * Math.sin(f * 0.55);                            // the balconies wave up the tower
      const g = slabGeo(scaleRing(r, s, c), f * 3.15 - 0.35, f * 3.15);
      slabs.push(g);
    }
    const merged = mergeGeos(slabs);
    landmarkMesh(merged, LM_MAT({ color: C('#fbfaf6') }));
  }
  // Dokk1: recessed glass ground floor, light volume with a window band, overhanging deck, glass pavilion
  if (models.dokk1) {
    const r = ringOf(models.dokk1), c = centroid(r);
    landmarkMesh(wallGeo(scaleRing(r, 0.93, c), 0, 5.5, 6, 5.5), LM_MAT({ map: FACADE.glass() }));
    landmarkMesh(wallGeo(r, 5.5, 16.5, 8, 11), LM_MAT({ map: FACADE.dokk1() }));
    landmarkMesh(slabGeo(scaleRing(r, 1.05, c), 16.5, 17.6), LM_MAT({ color: C('#ecebe6') }));
    const top = scaleRing(r, 0.36, c);
    landmarkMesh(wallGeo(top, 17.6, 23, 5, 5.4), LM_MAT({ map: FACADE.glass() }));
    landmarkMesh(capGeo(top, 23), LM_MAT({ color: C('#e4e2dc') }));
    landmarkMesh(capGeo(scaleRing(r, 0.93, c), 5.5), LM_MAT({ color: C('#c9c6be') }));
  }
  // Navitas: the big glass block at the entrance to Aarhus Ø
  if (models.navitas) {
    const r = ringOf(models.navitas);
    landmarkMesh(wallGeo(r, 0, 30, 4, 3.75), LM_MAT({ map: FACADE.glass() }));
    landmarkMesh(capGeo(r, 30), LM_MAT({ color: C('#d8d6d0') }));
    landmarkMesh(slabGeo(scaleRing(r, 1.012), 30, 31), LM_MAT({ color: C('#f1f0ec') }));
  }
  // BESTSELLER: the dark office wing at Navitas
  if (models.bestseller) {
    const r = ringOf(models.bestseller);
    const H = 35;                       // shares a block with Navitas; its dark wing rises just above it
    landmarkMesh(wallGeo(r, 0, H, 4, 3.5), LM_MAT({ map: FACADE.dark() }));
    landmarkMesh(capGeo(r, H), LM_MAT({ color: C('#55565c') }));
  }
  // Rådhus: four clock faces on the tower (the building itself comes from OSM's detailed parts)
  if (models.tower) {
    const [tx, tz, hx, hz] = models.tower;
    const face = canvasTex(128, 128, (g, w) => {
      g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.46, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2f3a36'; g.lineWidth = 6; g.stroke();
      g.lineCap = 'round'; g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2, w * 0.2); g.stroke();
      g.lineWidth = 9; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w * 0.72, w / 2); g.stroke();
    });
    face.wrapS = face.wrapT = THREE.ClampToEdgeWrapping;
    const fm = new THREE.MeshBasicMaterial({ map: face, transparent: true, side: THREE.DoubleSide });
    for (const [ox, oz, ry] of [[hx + 0.15, 0, Math.PI / 2], [-hx - 0.15, 0, -Math.PI / 2], [0, hz + 0.15, 0], [0, -hz - 0.15, Math.PI]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(Math.min(hx, hz) * 0.62, 32), fm);
      m.position.set(tx + ox, 48, tz + oz); m.rotation.y = ry; scene.add(m);
    }
  }
  // ARoS: Your rainbow panorama, one glass ring on the real ring's centre with red where it really is
  if (models.aros) {
    const [ax, az, rad, aRed, dir] = models.aros;
    const g = new THREE.CylinderGeometry(rad + 2.6, rad + 2.6, 3.5, 128, 1, true);
    const g2 = new THREE.CylinderGeometry(rad - 2.6, rad - 2.6, 3.5, 128, 1, true);
    const tint = (geo) => {
      const p = geo.attributes.position, c = [], tmp = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const th = Math.atan2(p.getZ(i), p.getX(i));
        const h = ((((th - aRed) * dir) / (Math.PI * 2)) % 1 + 1) % 1;
        tmp.setHSL(h * 0.85, 0.9, 0.55); c.push(tmp.r, tmp.g, tmp.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    };
    tint(g); tint(g2);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: C('#2a2a2a'), transparent: true, opacity: 0.92 });
    for (const geo of [g, g2]) { const m = new THREE.Mesh(geo, mat); m.position.set(ax, 46.25, az); m.castShadow = true; scene.add(m); }
    // the walkway's roof and floor carry the colours too, lighter, so the ring reads from above
    const deckGeo = new THREE.RingGeometry(rad - 2.6, rad + 2.6, 128, 1).rotateX(-Math.PI / 2);
    { const p = deckGeo.attributes.position, c = [], tmp = new THREE.Color();
      for (let i = 0; i < p.count; i++) { const th = Math.atan2(p.getZ(i), p.getX(i)); const h = ((((th - aRed) * dir) / (Math.PI * 2)) % 1 + 1) % 1; tmp.setHSL(h * 0.85, 0.75, 0.72); c.push(tmp.r, tmp.g, tmp.b); }
      deckGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
    const deck = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    for (const y of [44.5, 48]) {
      const m = new THREE.Mesh(deckGeo, deck);
      m.position.set(ax, y, az); m.castShadow = true; scene.add(m);
    }
  }
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/* ── the course ───────────────────────────────────────────────────────── */
let R = null;
function makeRoute(route) {
  const step = route.step, P = route.pts, n = P.length / 2;
  const x = new Float32Array(n), z = new Float32Array(n), hx = new Float32Array(n), hz = new Float32Array(n), hw = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = P[2 * i] / 10; z[i] = P[2 * i + 1] / 10; hw[i] = (route.hw ? route.hw[i] : 50) / 10; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 4), b = Math.min(n - 1, i + 4);
    const dx = x[b] - x[a], dz = z[b] - z[a], L = Math.hypot(dx, dz) || 1;
    hx[i] = dx / L; hz[i] = dz / L;
  }
  const len = (n - 1) * step;
  function at(d, o = {}) {
    if (d <= 0) { o.x = x[0] + hx[0] * d; o.z = z[0] + hz[0] * d; o.hx = hx[0]; o.hz = hz[0]; o.w = hw[0]; return o; }
    const f = Math.min(d / step, n - 1.0001), i = Math.floor(f), t = f - i;
    o.x = x[i] + (x[i + 1] - x[i]) * t; o.z = z[i] + (z[i + 1] - z[i]) * t; o.hx = hx[i]; o.hz = hz[i]; o.w = hw[i];
    return o;
  }
  function headingAvg(d, span = 140) {
    const a = at(d - span), b = at(d + span);
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L];
  }
  const pts2 = (arr) => { const o = []; for (let i = 0; i < (arr || []).length; i += 2) o.push([arr[i] / 10, arr[i + 1] / 10]); return o; };
  // official km markers (from the organiser's GPX): course distance ↔ race km, piecewise between markers
  const marks = route.km && route.km.length ? route.km : [];
  const mk = [0, ...marks, len], mkKm = [0, ...marks.map((_, i) => i + 1), 21.0975];
  const interp = (v, xs, ys) => {
    if (v <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (v <= xs[i]) return ys[i - 1] + (v - xs[i - 1]) / (xs[i] - xs[i - 1]) * (ys[i] - ys[i - 1]);
    return ys[ys.length - 1];
  };
  const dToKm = (d) => interp(d, mk, mkKm), kmToD = (km) => interp(km, mkKm, mk);
  return { n, x, z, hx, hz, hw, step, len, at, headingAvg, dToKm, kmToD, stage: pts2(route.stage), fin: pts2(route.fin) };
}
async function ribbonTexture() {
  try { await document.fonts.load('700 80px "Barlow Condensed"'); } catch { /* fall back */ }
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = PAL.blue; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = '700 74px "Barlow Condensed", "Arial Narrow", sans-serif';
  let xx = 70;
  for (let rep = 0; rep < 2; rep++) {
    for (const ch of 'BESTSELLER AARHUS CITY HALF') { g.fillText(ch, xx, 68); xx += g.measureText(ch).width + 9; }
    xx += 160;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
function buildRibbon(tex) {
  const n = R.n;
  const pos = new Float32Array(n * 2 * 3), dist = new Float32Array(n * 2), side = new Float32Array(n * 2), wid = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const nx = -R.hz[i], nz = R.hx[i], w = R.hw[i];
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1, k = i * 2 + s;
      pos[k * 3] = R.x[i] + nx * w * sg; pos[k * 3 + 1] = 1.6; pos[k * 3 + 2] = R.z[i] + nz * w * sg;
      dist[k] = i * R.step; side[k] = sg; wid[k] = w;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aW', new THREE.BufferAttribute(wid, 1));
  const heat = new Float32Array(n * 2);
  g.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12,
    depthWrite: false,          // runners on top of the ribbon must never be hidden by it
    uniforms: { uTex: { value: tex }, uReveal: { value: 1e9 }, uHeat: { value: 0 }, uMid: { value: C(PAL.heatMid) }, uHi: { value: C(PAL.heatHi) }, uBlue: { value: C(PAL.blue) } },
    vertexShader: `attribute float aDist; attribute float aSide; attribute float aHeat; attribute float aW; varying float vD; varying float vS; varying float vH; varying float vW;
      void main(){ vD = aDist; vS = aSide; vH = aHeat; vW = aW; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uReveal, uHeat; uniform vec3 uMid, uHi, uBlue;
      varying float vD; varying float vS; varying float vH; varying float vW;
      void main(){
        float ahead = vD - uReveal;
        if (ahead > 0.0) {                         // not drawn yet: a pale dashed centre line shows where the course goes
          if (abs(vS) > 0.2 || fract(vD / 26.0) > 0.55) discard;
          gl_FragColor = vec4(mix(uBlue, vec3(1.0), 0.45), 1.0); ${OUTPUT}
          return;
        }
        float tip = clamp(-ahead / vW, 0.0, 1.0);   // round cap, one half street-width long
        if (abs(vS) > sqrt(1.0 - (1.0 - tip) * (1.0 - tip))) discard;
        // text keeps its proportions: the repeat length follows the local street width
        vec2 uv = vec2(vD / (vW * 32.0), 0.5 - vS * 0.62);
        float textMask = smoothstep(0.25, 0.75, texture2D(uTex, uv).r);
        float h = clamp(vH, 0.0, 1.0);
        vec3 band = mix(uBlue, uMid, smoothstep(0.15, 0.55, h));
        band = mix(band, uHi, smoothstep(0.55, 1.0, h));
        band = mix(uBlue, band, uHeat);
        vec3 c = mix(band, vec3(1.0), textMask * (1.0 - 0.6*uHeat));
        c = mix(c, vec3(1.0), smoothstep(0.86, 0.93, abs(vS)));
        c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, 90.0, uReveal - vD)) * 0.9);
        gl_FragColor = vec4(c, 1.0); ${OUTPUT}
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 20; scene.add(mesh);
  return { mesh, heat, attr: g.getAttribute('aHeat') };
}
function buildCourseFurniture() {
  const grp = new THREE.Group();
  const count = Math.floor(R.len / 1000);
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 0.9, 24, 8).translate(0, 12, 0), new THREE.MeshLambertMaterial({ color: C(PAL.blue) }), count);
  const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 12, 8).translate(0, 25, 0), new THREE.MeshLambertMaterial({ color: C('#ffffff') }), count);
  const M = new THREE.Matrix4(), o = {}, posts = [];
  for (let k = 1; k <= count; k++) {
    const d = R.kmToD(k); R.at(d, o);
    posts.push([o.x - o.hz * (o.w + 3), o.z + o.hx * (o.w + 3), d]);
    M.makeTranslation(posts[k - 1][0], 0, posts[k - 1][1]);
    pole.setMatrixAt(k - 1, M); cap.setMatrixAt(k - 1, M);
  }
  let shown = Infinity;
  const q0 = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  grp.userData.reveal = (d) => {                    // posts spring up as the ribbon reaches them
    if (d === shown) return; shown = d;
    posts.forEach(([x, z, pd], k) => {
      const t = clamp((d - pd) / 160, 0, 1), u = t - 1, s = Math.max(0.0001, 1 + 2.7 * u * u * u + 1.7 * u * u);   // ease-out with a little overshoot
      M.compose(pv.set(x, 0, z), q0, sv.set(s, s, s)); pole.setMatrixAt(k, M); cap.setMatrixAt(k, M);
    });
    pole.instanceMatrix.needsUpdate = true; cap.instanceMatrix.needsUpdate = true;
  };
  pole.castShadow = true; grp.add(pole, cap);
  const s = R.at(0, {});
  const arch = new THREE.Mesh(new THREE.TorusGeometry(Math.max(8, s.w + 2), 1.1, 10, 40, Math.PI), new THREE.MeshLambertMaterial({ color: C(PAL.blue) }));
  arch.position.set(s.x, 0, s.z); arch.rotation.y = Math.atan2(s.hx, s.hz); arch.castShadow = true;
  scene.add(arch, grp);
  return grp;
}

function buildLead() {                              // the puck at the front of the ribbon while the course is drawn
  const grp = new THREE.Group();
  const flat = (geo, hex, op) => { const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C(hex), transparent: true, opacity: op, depthTest: false, depthWrite: false })); m.renderOrder = 26; grp.add(m); return m; };
  flat(new THREE.CircleGeometry(1.25, 48), PAL.blue, 1);
  flat(new THREE.CircleGeometry(0.9, 48), '#ffffff', 1);
  grp.userData.pulse = flat(new THREE.RingGeometry(1.25, 1.5, 48), '#ffffff', 0);
  grp.position.y = 2; grp.visible = false; scene.add(grp);
  return grp;
}

/* ── runners ──────────────────────────────────────────────────────────── */
let F = null;
function prepField(field, routeLen) {
  const N = field.t.length, md = field.model;
  const T = Float32Array.from(field.t), S = Float32Array.from(field.s), G = Uint8Array.from(field.g);
  const B = new Uint8Array(N), O = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let b = 0; while (b < md.buckets.length - 1 && T[i] > md.buckets[b].max) b++;
    B[i] = b; O[i] = (hash(i * 13 + 1) - 0.5) * 2;           // −1…1 across the street
  }
  let maxEnd = 0, lastStart = 0;
  for (let i = 0; i < N; i++) { maxEnd = Math.max(maxEnd, T[i] + S[i]); lastStart = Math.max(lastStart, S[i]); }
  return { N, T, S, G, B, O, Dm: md.D.map((k) => R.kmToD(k)), prof: md.buckets.map((b) => b.F), raw: field, maxEnd, lastStart };
}
// distance along the course of runner i at clock t; state 0 waiting, 1 running, 2 finished
function runnerDist(i, t) {
  const el = t - F.S[i];
  if (el < 0) return [el, 0];
  const T = F.T[i];
  if (el >= T) return [el - T, 2];
  const f = el / T, Fp = F.prof[F.B[i]], D = F.Dm;
  let k = 0; while (k < Fp.length - 2 && f > Fp[k + 1]) k++;
  const u = (f - Fp[k]) / (Fp[k + 1] - Fp[k] || 1);
  return [D[k] + (D[k + 1] - D[k]) * u, 1];
}
const WALK_IN = 150, WALK_OUT = 200, LINGER = 700, FADE_OUT = 140;
const _o = {}, _s = {};
function runnerXZ(i, t, out) {
  const [d, st] = runnerDist(i, t);
  out.d = d; out.hx = 0; out.hz = 0;
  if (st === 0) {                                  // in the park, then walk to the mat
    const sp = R.stage[Math.floor(hash(i * 3 + 7) * R.stage.length)];
    R.at(0, _s);
    const w = -d, q = w > WALK_IN ? 0 : smooth(1 - w / WALK_IN);
    const lx = _s.x - _s.hz * F.O[i] * (_s.w - 1), lz = _s.z + _s.hx * F.O[i] * (_s.w - 1);
    out.x = lerp(sp[0], lx, q); out.z = lerp(sp[1], lz, q); out.v = 1; return st;
  }
  if (st === 2) {                                  // walk into Rådhusparken, linger, fade
    const e = d; if (e > LINGER + FADE_OUT) { out.v = 0; return st; }
    const fp = R.fin[Math.floor(hash(i * 5 + 11) * R.fin.length)];
    R.at(R.len, _o);
    const q = smooth(Math.min(1, e / WALK_OUT));
    out.x = lerp(_o.x, fp[0], q); out.z = lerp(_o.z, fp[1], q);
    out.v = e < LINGER ? 1 : 1 - (e - LINGER) / FADE_OUT; return st;
  }
  R.at(d, _o);
  const w = Math.max(1, _o.w - 1.2);
  out.x = _o.x - _o.hz * F.O[i] * w; out.z = _o.z + _o.hx * F.O[i] * w; out.v = 1;
  out.hx = _o.hx; out.hz = _o.hz;
  return st;
}
// progress for ranking on the road: waiting < running (by distance) < finished (earlier is ahead)
function progress(i, t) {
  const [d, st] = runnerDist(i, t);
  return st === 0 ? -1e6 + d : st === 1 ? d : 1e6 - (F.S[i] + F.T[i]);
}
function buildRunners() {
  const N = F.N;
  const pos = new Float32Array(N * 3), alpha = new Float32Array(N), col = new Float32Array(N * 3), size = new Float32Array(N).fill(1);
  const base = new Float32Array(N * 3), gc = PAL.groups.map((h) => C(h));
  for (let i = 0; i < N; i++) { const c = gc[F.G[i]]; base[i * 3] = col[i * 3] = c.r; base[i * 3 + 1] = col[i * 3 + 1] = c.g; base[i * 3 + 2] = col[i * 3 + 2] = c.b; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const head = new Float32Array(N * 2);
  g.setAttribute('aHead', new THREE.BufferAttribute(head, 2).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSize: { value: 4.4 }, uScale: { value: 1 }, uOp: { value: 0 }, uAspect: { value: 1 }, uRim: { value: C('#0a0870') } },
    // the sprite is 2.6× the dot so the trail fits behind it
    vertexShader: `attribute float aAlpha; attribute vec3 aCol; attribute float aSize; attribute vec2 aHead;
      uniform float uSize, uScale, uOp, uAspect; varying vec3 vC; varying float vA; varying vec2 vDir; varying float vTail;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv;
        float px = clamp(uSize * aSize * uScale / -mv.z, 2.4 * aSize, 11.0 * aSize);
        gl_PointSize = px * 2.6;
        vec4 c1 = projectionMatrix * modelViewMatrix * vec4(position + vec3(aHead.x, 0.0, aHead.y) * 6.0, 1.0);
        vec2 d = (c1.xy / c1.w - gl_Position.xy / gl_Position.w) * vec2(uAspect, 1.0);
        float l = length(d);
        vDir = l > 0.000001 ? vec2(d.x, -d.y) / l : vec2(0.0);      // point-sprite y runs downwards
        vTail = step(0.000001, l) * smoothstep(3.0, 6.5, px / aSize);
        vA = aAlpha * uOp; vC = aCol; }`,
    fragmentShader: `uniform vec3 uRim; varying vec3 vC; varying float vA; varying vec2 vDir; varying float vTail;
      void main(){ if (vA < 0.01) discard;
        vec2 p = (gl_PointCoord - 0.5) * 2.6; float r = length(p);
        float dotA = 1.0 - smoothstep(0.44, 0.5, r);
        float along = dot(p, -vDir), across = abs(dot(p, vec2(-vDir.y, vDir.x)));
        float f = clamp(along / 1.15, 0.0, 1.0), w = 0.3 * (1.0 - f);
        float tail = vTail * step(0.0, along) * (1.0 - smoothstep(w, w + 0.08, across)) * (1.0 - f) * (1.0 - f) * 0.6;
        float a = max(dotA, tail);
        if (a < 0.01) discard;
        vec3 c = mix(mix(vC, uRim, 0.3), mix(vC, uRim, smoothstep(0.34, 0.40, r)), dotA);
        gl_FragColor = vec4(c, a * vA); ${OUTPUT} }`,
  });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = 30; pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, alpha, col, size, base, head, m, g };
}
function buildMarker() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: C(PAL.blue), emissive: C('#140a90') });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 10).translate(0, 15, 0), mat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6, 8.5, 40).rotateX(-Math.PI / 2).translate(0, 2.4, 0), new THREE.MeshBasicMaterial({ color: C(PAL.blue) }));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(8.5, 10.5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C(PAL.blue), transparent: true, opacity: 0, depthWrite: false }));
  pulse.position.y = 2.2; pulse.visible = !REDUCED;
  pole.castShadow = true;
  grp.add(pole, ring, pulse); grp.visible = false; grp.userData.pulse = pulse; scene.add(grp);
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
const HEAT_FULL = 190;      // the busiest 36 m of road holds ~160 runners in the model

async function computeStats() {
  const N = F.N;
  const leadKm = R.dToKm(runnerDist(0, F.lastStart)[0]);
  let winHome = Infinity; for (let i = 0; i < N; i++) winHome = Math.min(winHome, F.S[i] + F.T[i]);
  const ten = R.kmToD(10); let not10 = 0;
  for (let i = 0; i < N; i++) { const [d, st] = runnerDist(i, winHome); if (st === 0 || (st === 1 && d < ten)) not10++; }
  return { leadKm, not10 };
}

/* ── labels ───────────────────────────────────────────────────────────── */
const labelsEl = $('#labels');
const labels = [];
function addLabel(x, y, z, cls = '') {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.innerHTML = '<span class="t"></span>';
  labelsEl.appendChild(el);
  const L = { el, t: el.firstChild, p: new THREE.Vector3(x, y, z), on: false };
  labels.push(L); return L;
}
const _v = new THREE.Vector3();
function updateLabels() {
  const w = innerWidth, h = innerHeight, placed = [];
  for (const L of labels) {
    if (!L.on) { if (L.el.classList.contains('on')) L.el.classList.remove('on'); continue; }
    _v.copy(L.p).project(camera);
    let vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
    const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
    if (vis) {                                     // labels never sit on top of each other
      const bw = L.el.offsetWidth || 120, bh = (L.t.offsetHeight || 24) + 4;
      const box = [sx - bw / 2, sy - L.el.offsetHeight, sx + bw / 2, sy - L.el.offsetHeight + bh];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) vis = false;
      else placed.push(box);
    }
    L.el.classList.toggle('on', vis);
    if (vis) L.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
  }
}

/* ── chapters and navigation ──────────────────────────────────────────── */
const sections = $$('[data-ch]');
function activeChapter() {
  const mid = innerHeight * 0.5;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) return { id: s.dataset.ch, p: clamp((mid - r.top) / r.height, 0, 1), el: s };
  }
  return sections[0].getBoundingClientRect().top > mid ? { id: 'hero', p: 0 } : { id: 'close', p: 1 };
}
const navBtns = [];
function buildNav() {
  const nav = $('#chnav');
  for (const s of sections) {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = '<span></span><i></i>';
    b.addEventListener('click', () => {
      const top = s.getBoundingClientRect().top + scrollY;
      const y = s.dataset.ch === 'hero' ? 0 : top - innerHeight * 0.5 + Math.max(s.offsetHeight * 0.06, innerHeight * 0.75);
      scrollTo({ top: Math.max(0, y), behavior: REDUCED ? 'auto' : 'smooth' });
    });
    nav.appendChild(b); navBtns.push([s.dataset.ch, b]);
  }
}
let navActive = '';
function updateNav(id) {
  if (id === navActive) return;
  navActive = id;
  userYawGoal = 0; userPitchGoal = 0; userZoomGoal = 1;   // each chapter starts from its own framing
  for (const [cid, b] of navBtns) {
    b.classList.toggle('on', cid === id);
    if (cid === id) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    if (cid === id && MOBILE) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
}

const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantTgt = new THREE.Vector3();
let simT = 2100, runnersOp = 0, heatOn = 0, furnitureOn = 0;
let userYaw = 0, userPitch = 0, userYawGoal = 0, userPitchGoal = 0, userZoom = 1, userZoomGoal = 1;
const ZOOM_MIN = 0.22, ZOOM_MAX = 2.2;
let exPlaying = false;
const rp = { i: -1, el: 0, playing: true, speed: 1 };          // replay of a selected runner
const SPEEDS = [0.5, 1, 2, 4];

function overview(angle = 0, dist = 1, tx = 520, tz = 260) {
  const az = 0.55 + angle;
  wantTgt.set(tx, 0, tz);
  wantPos.set(tx - Math.sin(az) * 3500 * dist, 2600 * dist, tz + Math.cos(az) * 3500 * dist);
}
function follow(d, back = 420, up = 300, side = 140) {
  const p = R.at(d, {}); const [hx, hz] = R.headingAvg(d, 220);
  wantTgt.set(p.x + hx * 90, 0, p.z + hz * 90);
  wantPos.set(p.x - hx * back - hz * side, up, p.z - hz * back + hx * side);
}
function orbitAround(x, z, ang, dist, up) { wantTgt.set(x, 0, z); wantPos.set(x + Math.cos(ang) * dist, up, z + Math.sin(ang) * dist); }

let STATS = null, stopEls = [], lmLabels = [], hotLabels = [], poiEls = [], meLabel = null;
let introStart = -1;
const introEase = (now, dur) => { if (REDUCED || introStart < 0) return 1; const k = clamp((now - introStart) / dur, 0, 1); return 1 - Math.pow(1 - k, 4); };
function chapterState(ch, now, dt) {
  const p = ch.p;
  heatOn = 0; furnitureOn = 0;
  let reveal = 1e9, clock = false, showLm = false, showHot = false, pill = '';
  switch (ch.id) {
    case 'hero': {
      const io = 1 - introEase(now, 3600);          // opening move: descend and swing in from further out
      overview(Math.sin(now * 0.00004) * 0.1 + p * 0.2 - io * 0.55, (1.0 - p * 0.12) * (1 + io * 0.5));
      simT = 1500 + (REDUCED ? 0 : (now * 0.01) % 3200);
      runnersOp = REDUCED || now - introStart > 1900 ? 1 : 0; break;   // runners fade in once the centre has risen
    }
    case 'course': {
      const q = clamp((p - 0.04) / 0.92, 0, 1), d = smooth(q) * R.len;
      reveal = d + 2;
      if (q <= 0) overview(0.2, 0.85); else if (q >= 1) overview(0.2, 0.9); else follow(d);
      runnersOp = 0; furnitureOn = 1; showLm = true;
      const km = R.dToKm(d);
      if (q > 0) { clock = true; pill = `${fmtDec(km)} km`; }
      stopEls.forEach((el) => el.classList.toggle('on', +el.dataset.km <= km + 0.05));
      lmLabels.forEach((L) => { L.on = L.km <= km + 0.3; });
      break;
    }
    case 'start':
      simT = lerp(-240, F.lastStart + 180, smooth(p));
      orbitAround(-20, -10, -1.0 - p * 0.6, 640, 430);
      runnersOp = 1; clock = true; furnitureOn = 1; break;
    case 'river':
      simT = lerp(F.lastStart, F.maxEnd + 60, p);
      overview(0.15 + p * 0.5, 0.8 + 0.08 * Math.sin(p * Math.PI));
      runnersOp = 1; clock = true; break;
    case 'poi': {                                   // a tour of the points of interest, one per stretch of scroll
      runnersOp = 1; clock = true; showHot = true;
      const ps = routeData.poi || [];
      if (ps.length) {
        const k = Math.min(ps.length - 1, Math.floor(p * ps.length * 0.999)), q = ps[k], lp = (p * ps.length) % 1;
        // show the field around the time the middle of the pack passes the first time
        simT = (q.win ? q.win[0] + 1500 : 700 + q.km[0] * 340) + lp * 300;
        orbitAround(q.x, q.z, -0.7 + k * 0.9 + lp * 0.4, q.kind === 'icon' ? 380 : 440, q.kind === 'icon' ? 300 : 360);
        hotLabels.forEach((L, j) => { L.on = j === k; });
        poiEls.forEach((el, j) => el.classList.toggle('on', j === k));
      } else { overview(0.2, 0.7); simT = 1800; }
      break;
    }
    case 'dist':
      simT = lerp(5000, 7600, p);                      // the finish around 1:30–2:00
      orbitAround(60, 0, 2.2 + p * 0.5, 620, 520);
      runnersOp = 1; clock = true; break;
    case 'pace':
      runnersOp = 1; clock = true;
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
      if (rp.i >= 0) {
        const T = F.T[rp.i];
        if (rp.playing) { rp.el += dt * (T / 50) * rp.speed; if (rp.el > T + 240) { rp.el = T + 240; rp.playing = false; syncReplayUi(); } }
        simT = F.S[rp.i] + rp.el;
        const o = {}; runnerXZ(rp.i, simT, o);
        const [hx, hz] = (o.d > 0 && o.d < R.len && rp.el > 0 && rp.el < T) ? R.headingAvg(o.d, 200) : [0.6, 0.8];
        wantTgt.set(o.x - hz * 90, 0, o.z + hx * 90);
        wantPos.set(o.x - hx * 300 - hz * 200, 430, o.z - hz * 300 + hx * 200);   // high enough that roofs rarely hide the pin
      } else { simT = lerp(1200, 2400, p); orbitAround(0, 0, 0.6 + p, 900, 700); }
      break;
    case 'close':
      runnersOp = 1; clock = true; showLm = true;
      lmLabels.forEach((L) => { L.on = true; });
      if (exPlaying) { simT += dt * 120; if (simT > F.maxEnd + 120) simT = -300; $('#exTime').value = simT; }
      else simT = +$('#exTime').value;
      overview(0.6 + p * 0.3, 0.95);
      break;
  }
  if (!showLm) lmLabels.forEach((L) => { L.on = false; });
  if (!showHot) hotLabels.forEach((L) => { L.on = false; });
  return { reveal, clock, pill };
}

/* ── main ─────────────────────────────────────────────────────────────── */
let ribbon, runners, marker, furniture, lead, routeData;
async function main() {
  const bar = $('#loadBar'); let got = 0;
  const setLoad = (v) => { bar.style.transform = `scaleX(${v})`; };
  const step = (pr) => pr.then((r) => { setLoad(0.1 + ++got * 0.2); return r; });
  setLoad(0.1);
  const [city, route, field] = await Promise.all([step(getJSON('./data/city.json')), step(getJSON('./data/route.json')), step(getJSON('./data/field.json'))]);
  routeData = route;
  await new Promise((r) => setTimeout(r, 60));      // let the bar paint before the city is built
  R = makeRoute(route);
  buildSky(); buildGround(city); buildBuildings(city, route.models || {}); buildTrees(city); buildLandmarks(route.models, route.lm);
  ribbon = buildRibbon(await ribbonTexture());
  furniture = buildCourseFurniture();
  lead = buildLead();
  F = prepField(field, R.len);
  runners = buildRunners();
  marker = buildMarker();
  meLabel = addLabel(0, 34, 0, 'me');
  initGrid(city.win);
  for (const l of route.lm) {
    const L = addLabel(l.x, (l.h || 25) + 10, l.z); L.km = l.km; L.name = l.name; lmLabels.push(L);
  }
  for (const q of route.poi || []) hotLabels.push(addLabel(q.x, q.kind === 'icon' ? 60 : 34, q.z, `hot poi ${q.kind}`));
  buildNav();
  applyLang();
  onResize();
  watchCards();
  setLoad(1);
  await new Promise((r) => setTimeout(r, REDUCED ? 0 : 320));
  renderer.compile(scene, camera);                  // shaders ready before the curtain lifts
  introStart = performance.now();
  requestAnimationFrame(loop);
  $('#loading').classList.add('done');
  document.body.classList.add('ready');
  setTimeout(async () => {
    STATS = await computeStats();
    applyLang();
  }, 60);
}
/* cards animate in the first time they come on screen; numbers count up with them */
function watchCards() {
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in'); io.unobserve(e.target);
      if (e.target.querySelector('.stats')) countStats();
    }
  }, { threshold: 0.12 });
  $$('.card').forEach((c) => io.observe(c));
}
let STAT = [];
function setStats(k) { for (const [sel, val, f] of STAT) $(sel).textContent = f(val * k); }
function countStats() {
  if (REDUCED) return;
  const t0 = performance.now();
  const tick = (now) => { const k = clamp((now - t0 - 300) / 1500, 0, 1); setStats(1 - Math.pow(1 - k, 4)); if (k < 1) requestAnimationFrame(tick); };
  tick(t0);
}
function nearestLandmark(x, z) {
  let best = null, bd = 380;
  for (const l of routeData.lm) { const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l.name; } }
  return best ? lmName(best).split(':')[0] : '';
}

/* fill every text in the current language */
function applyLang() {
  document.documentElement.lang = LANG;
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
  if (!F) { for (const el of document.querySelectorAll('[data-t="loading"], [data-t="nogl"]')) el.textContent = T(el.dataset.t); return; }
  const fd = F.raw, N = F.N, fx = fd.facts || {};
  const km = N * 21.0975;
  let women = 0; for (let i = 0; i < N; i++) if ((fd.cats[fd.cat[i]] || '')[0] === 'K') women++;
  const v = {
    n: fmtInt(N), samples: fmtInt(fd.model.samples), lastStart: clockStr(F.lastStart),
    win: hms(F.T[0]), last: durWords(F.maxEnd), not10: STATS ? fmtInt(Math.round(STATS.not10 / 50) * 50) : '…',
    woman: fx.woman ? hms(fx.woman[0]) : '–', womanPl: fx.woman ? ordinal(fx.woman[1]) : '–',
    a: fmtInt(fx.sub2?.[0] ?? 0), b: fmtInt(fx.sub2?.[1] ?? 0), c: fmtInt(fx.sub130?.[0] ?? 0), d: fmtInt(fx.sub130?.[1] ?? 0),
    kick: fx.kick ?? '–', earth: Math.round(km / 40075),
    eftN: fmtInt(fx.eftN ?? 0), eftClubs: fmtInt(fx.eftClubs ?? 0), young: fmtInt(fx.youngN ?? 0),
    old: fmtInt(fx.oldest?.[1] ?? 0), oldBest: fx.oldest ? hms(fx.oldest[2]) : '–',
  };
  $$('[data-t]').forEach((el) => { el.innerHTML = T(el.dataset.t, v); });
  $$('[data-tp]').forEach((el) => { el.placeholder = T(el.dataset.tp); });
  $('#waveText').textContent = T('wave', v);
  STAT = [
    ['.js-n', N, fmtInt],
    ['.js-km', km, (x) => fmtInt(Math.round(x / 1000) * 1000)],
    ['.js-countries', fx.countries ?? fd.ctys.length, fmtInt],
    ['.js-women', women / N * 100, (x) => `${Math.round(x)}${LANG === 'da' ? ' %' : '%'}`],
  ];
  setStats(1);
  $('#brand').setAttribute('aria-label', TEXT[LANG].nav.hero);
  for (const [id, b] of navBtns) b.firstChild.textContent = TEXT[LANG].nav[id];
  // course stops and landmark labels
  const stops = $('#stops'); stops.innerHTML = ''; stopEls = [];
  for (const l of routeData.lm) {
    const li = document.createElement('li'); li.dataset.km = l.km;
    li.innerHTML = `<span>${fmtDec(l.km)} km</span>${lmName(l.name)}`; stops.appendChild(li); stopEls.push(li);
  }
  for (const L of lmLabels) L.t.innerHTML = `${lmName(L.name)}<small>${fmtDec(L.km)} km</small>`;
  // start groups
  const counts = [0, 0, 0, 0]; for (let i = 0; i < N; i++) counts[F.G[i]]++;
  $('#groups').innerHTML = fd.groups.map((g, k) => `<li><i style="background:${PAL.groups[k]}"></i><b>${LANG === 'da' ? 'Gruppe' : 'Group'} ${GROUP_NAMES[k]}</b><span>${T('group', { from: clockStr(g[0]), n: fmtInt(counts[k]) })}</span></li>`).join('');
  // clubs
  const cnt = new Map();
  for (let i = 0; i < N; i++) if (fd.club[i] >= 0) cnt.set(fd.club[i], (cnt.get(fd.club[i]) || 0) + 1);
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), mx = top.length ? top[0][1] : 1;
  $('#clubBars').innerHTML = top.map(([c, n], k) => `<div class="bar"><span>${escapeHtml(fd.clubs[c])}</span><em>${fmtInt(n)}</em><i style="width:${(n / mx * 100).toFixed(1)}%;--k:${k}"></i></div>`).join('');
  // points of interest: city icons, the title sponsor, and cheering spots where the field passes more than once
  const ps = routeData.poi || [];
  const kmList = (ks) => { const f = ks.map((k) => fmtDec(k)); return f.length < 2 ? f[0] : `${f.slice(0, -1).join(', ')} ${T('and')} ${f[f.length - 1]}`; };
  const head = { icon: T('poiIcons'), sponsor: T('poiSponsor'), cheer: T('poiCheer') };
  let html = '', lastKind = '';
  ps.forEach((q, j) => {
    if (q.kind !== lastKind) { html += `<li class="poihead">${head[q.kind]}</li>`; lastKind = q.kind; }
    const name = TEXT[LANG][`poi_${q.key}`] ? T(`poi_${q.key}`) : (q.street || '');
    const detail = q.kind === 'cheer'
      ? (q.win ? T('poiOutback', { a: fmtDec(q.km[0]), b: fmtDec(q.km[1]), from: clockStr(q.win[0]), dur: durWords(q.win[1] - q.win[0]) }) : T('poiTimes', { n: q.km.length, km: kmList(q.km) }))
      : `km ${kmList(q.km)}`;
    html += `<li class="poi ${q.kind}" data-j="${j}"><i></i><span><b>${name}</b><em>${detail}</em></span></li>`;
    const L = hotLabels[j];
    if (L) L.t.innerHTML = `${q.kind === 'cheer' ? (q.street || name) : name}<small>km ${kmList(q.km)}</small>`;
  });
  $('#poiList').innerHTML = html;
  poiEls = [...$('#poiList').querySelectorAll('li.poi')];
  poiEls.forEach((el) => el.addEventListener('click', () => goPoi(+el.dataset.j)));
  drawDistChart(); drawPaceChart(fd.model);
  $('#exTime').max = Math.ceil(F.maxEnd + 120);
  if (rp.i >= 0) fillRace();
}
function goPoi(j) {               // scroll so the tour stands on point j
  const sec = sections.find((x) => x.dataset.ch === 'poi'), n = (routeData.poi || []).length;
  if (!sec || !n) return;
  const top = sec.getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + (j + 0.5) / n * sec.offsetHeight - innerHeight * 0.5, behavior: REDUCED ? 'auto' : 'smooth' });
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* finish-time distribution: spikes just before the round times */
function drawDistChart() {
  const svg = $('#distChart'); const W = 380, H = 200, L = 34, Rr = 10, Tp = 10, Bm = 24, FS = 10, DIM = '#5d5d66';
  const t0 = 3600, t1 = 12600, bins = new Array((t1 - t0) / 60).fill(0);
  for (let i = 0; i < F.N; i++) { const k = Math.floor((F.T[i] - t0) / 60); if (k >= 0 && k < bins.length) bins[k]++; }
  const mx = Math.max(...bins), targets = [5400, 6300, 7200, 8100, 9000, 9900];
  const X = (t) => L + (t - t0) / (t1 - t0) * (W - L - Rr), Y = (v) => H - Bm - v / mx * (H - Tp - Bm);
  const bw = (W - L - Rr) / bins.length;
  let s = '';
  for (let v = 0; v <= mx; v += 100) s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(0,0,0,${v ? .07 : .25})"/><text x="${L - 5}" y="${Y(v) + 3.5}" fill="${DIM}" font-size="${FS}" text-anchor="end">${fmtInt(v)}</text>`;
  s += `<line x1="${X(7200)}" x2="${X(7200)}" y1="${Tp}" y2="${H - Bm}" stroke="${PAL.blue}" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>`;
  bins.forEach((n, k) => {
    const t = t0 + k * 60, hot = targets.some((g) => t >= g - 120 && t < g);
    s += `<rect class="b" style="--k:${k}" x="${(X(t) + 0.15).toFixed(2)}" y="${Y(n).toFixed(1)}" width="${Math.max(0.6, bw - 0.3).toFixed(2)}" height="${(H - Bm - Y(n)).toFixed(1)}" fill="${hot ? PAL.coral : PAL.blue}"/>`;
  });
  for (let t = t0; t <= t1; t += 1800) s += `<text x="${X(t)}" y="${H - 7}" fill="${t === 7200 ? PAL.blue : DIM}" font-size="${FS}" font-weight="${t === 7200 ? 700 : 400}" text-anchor="${t === t1 ? 'end' : t === t0 ? 'start' : 'middle'}">${Math.floor(t / 3600)}:${String((t / 60) % 60).padStart(2, '0')}</text>`;
  svg.innerHTML = s;
  svg.setAttribute('aria-label', `${T('distAxis')}, 1:00–3:30`);
  $('#distLegend').innerHTML = `<span><i class="sq" style="background:${PAL.blue}"></i>${T('distAxis')}</span><span><i class="sq" style="background:${PAL.coral}"></i>${T('distTarget')}</span>`;
}
function drawPaceChart(md) {
  const svg = $('#paceChart'); const W = 380, H = 190, L = 38, Rr = 18, Tp = 24, Bm = 24, FS = 10;
  const secs = ['0–1', '1–5', '5–10', '10–15', '15–20', '20–21'];
  const rows = md.paceTable;
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) for (const v of r.pace) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  lo = Math.floor(lo / 30) * 30; hi = Math.ceil(hi / 30) * 30;
  const X = (i) => L + i * (W - L - Rr) / (secs.length - 1), Y = (v) => Tp + (v - lo) / (hi - lo) * (H - Tp - Bm);
  let s = '';
  for (let v = lo; v <= hi; v += 30) s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(0,0,0,.07)"/><text x="${L - 6}" y="${Y(v) + 3}" fill="#5d5d66" font-size="${FS}" text-anchor="end">${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}</text>`;
  secs.forEach((t, i) => { s += `<text x="${X(i)}" y="${H - 7}" fill="#5d5d66" font-size="${FS}" text-anchor="middle">${t}</text>`; });
  rows.forEach((r, j) => {
    const c = PAL.chart[j % PAL.chart.length];
    s += `<path class="ln" style="--k:${j}" pathLength="1" d="${r.pace.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
    r.pace.forEach((v, i) => { s += `<circle class="dot" style="--k:${j}" cx="${X(i)}" cy="${Y(v)}" r="3" fill="${c}" stroke="#fff" stroke-width="1.2"/>`; });
  });
  s += `<text x="${L - 30}" y="${Tp - 12}" fill="#5d5d66" font-size="${FS}">${T('paceAxis')}</text>`;
  svg.setAttribute('aria-label', T('paceAxis'));
  svg.innerHTML = s;
  $('#paceLegend').innerHTML = rows.map((r, j) => `<span><i style="background:${PAL.chart[j % PAL.chart.length]}"></i>${TEXT[LANG].paceGroups[j] || r.label}</span>`).join('');
}

/* ── frame loop ───────────────────────────────────────────────────────── */
let last = performance.now(), firstFrame = true, shadowSize = 0;
const _r = {}, _off = new THREE.Vector3(), _sph = new THREE.Spherical();
let prevNear = [];
const ui = { hf: '', pg: '', pin: '', clock: '' }, heroEl = $('.hero'), progEl = $('#prog'), brandEl = $('#brand');
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const ch = activeChapter();
  updateNav(ch.id);
  const st = chapterState(ch, now, dt);
  // hero backdrop: full at the top of the page, gone after ~60 % of a screen of scrolling
  const hf = (1 - smooth(clamp(scrollY / (innerHeight * 0.6), 0, 1))).toFixed(3);
  if (hf !== ui.hf) { ui.hf = hf; heroEl.style.setProperty('--heroFade', hf); }
  const pg = clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight), 0, 1).toFixed(4);
  if (pg !== ui.pg) { ui.pg = pg; progEl.style.transform = `scaleX(${pg})`; }
  if (ch.el && ch.id !== 'hero') {                   // progress line under the chapter title
    const cp = clamp((ch.p - 0.04) / 0.92, 0, 1).toFixed(3);
    if (cp !== ch.el.dataset.p) { ch.el.dataset.p = cp; ch.el.style.setProperty('--p', cp); }
  }
  brandEl.classList.toggle('on', ch.id !== 'hero');
  if (GROW.uGrow.value < 1) { const g = REDUCED ? 1 : clamp((now - introStart - 250) / 3000, 0, 1); GROW.uGrow.value = g * g * (3 - 2 * g); }

  // camera: the chapter's framing, then the user's own rotation and tilt
  const ku = 1 - Math.exp(-dt * 4);
  if (dragging) { userYaw = userYawGoal; userPitch = userPitchGoal; } else { userYaw += (userYawGoal - userYaw) * ku; userPitch += (userPitchGoal - userPitch) * ku; }
  userZoom *= Math.pow(userZoomGoal / userZoom, 1 - Math.exp(-dt * 8));
  _off.subVectors(wantPos, wantTgt);
  _sph.setFromVector3(_off);
  _sph.theta += userYaw;
  _sph.phi = clamp(_sph.phi + userPitch, 0.12, 1.42);
  _sph.radius = Math.max(60, _sph.radius * userZoom);
  _off.setFromSpherical(_sph).add(wantTgt);
  const tight = ch.id === 'course' || (ch.id === 'find' && rp.i >= 0) || dragging;
  const k = firstFrame ? 1 : 1 - Math.exp(-dt * (tight ? 7 : 2.4));
  camPos.lerp(_off, k); camTgt.lerp(wantTgt, k);
  camera.position.copy(camPos); camera.lookAt(camTgt);
  firstFrame = false;

  const dist = camPos.distanceTo(camTgt);
  const size = clamp(Math.round(dist * 0.5 / 100) * 100, 400, 2600);
  sun.target.position.copy(camTgt);
  sun.position.copy(camTgt).addScaledVector(SUN_DIR, 3500);
  if (size !== shadowSize) { shadowSize = size; const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.updateProjectionMatrix(); }

  const ease = 1 - Math.exp(-dt * 3);
  const rm = ribbon.mesh.material.uniforms;
  rm.uReveal.value = st.reveal;
  rm.uHeat.value += (heatOn - rm.uHeat.value) * ease;
  runners.m.uniforms.uOp.value += (runnersOp - runners.m.uniforms.uOp.value) * ease;
  furniture.visible = furnitureOn > 0;
  if (furniture.visible) furniture.userData.reveal(st.reveal);
  lead.visible = ch.id === 'course' && st.reveal > 3 && st.reveal < R.len;
  if (lead.visible) {
    R.at(st.reveal - 2, _r);
    lead.position.set(_r.x, 2, _r.z); lead.scale.setScalar(_r.w);
    const lp = REDUCED ? 0 : (now * 0.0009) % 1, pu = lead.userData.pulse;
    pu.scale.setScalar(1 + lp * 1.6); pu.material.opacity = (1 - lp) * (1 - lp) * 0.8;
  }

  // runners
  const vis = runners.m.uniforms.uOp.value > 0.01, heatVis = rm.uHeat.value > 0.01;
  const tracking = rp.i >= 0 && (ch.id === 'find');
  let meProg = 0, up = 0, down = 0;
  if (tracking) meProg = progress(rp.i, simT);
  if (vis || heatVis) {
    if (heatVis) grid.fill(0);
    const P = runners.pos, A = runners.alpha, Col = runners.col, Sz = runners.size, Base = runners.base, Hd = runners.head;
    for (const j of prevNear) { Sz[j] = 1; Col[j * 3] = Base[j * 3]; Col[j * 3 + 1] = Base[j * 3 + 1]; Col[j * 3 + 2] = Base[j * 3 + 2]; }
    prevNear = [];
    const sI = tracking ? F.S[rp.i] : 0;
    for (let i = 0; i < F.N; i++) {
      const s = runnerXZ(i, simT, _r);
      if (s === 1 && heatVis) { const c = cellOf(_r.x, _r.z); if (c >= 0) grid[c]++; }
      if (vis) { P[i * 3] = _r.x; P[i * 3 + 1] = 3.2; P[i * 3 + 2] = _r.z; A[i] = _r.v; Hd[i * 2] = _r.hx; Hd[i * 2 + 1] = _r.hz; }
      if (tracking && i !== rp.i) {
        const pj = s === 0 ? -1e6 + _r.d : s === 1 ? _r.d : 1e6 - (F.S[i] + F.T[i]);
        const passedThem = F.S[i] < sI && pj < meProg, passedMe = F.S[i] > sI && pj > meProg;
        if (passedThem) up++; else if (passedMe) down++;
        if (s === 1 && Math.abs(pj - meProg) < 140) {
          Sz[i] = 2.1; prevNear.push(i);
          const c = passedThem ? PAL_C.sweater : passedMe ? PAL_C.coral : null;
          if (c) { Col[i * 3] = c.r; Col[i * 3 + 1] = c.g; Col[i * 3 + 2] = c.b; }
        }
      }
    }
    if (vis) {
      runners.g.attributes.position.needsUpdate = true; runners.g.attributes.aAlpha.needsUpdate = true;
      runners.g.attributes.aCol.needsUpdate = true; runners.g.attributes.aSize.needsUpdate = true;
      runners.g.attributes.aHead.needsUpdate = true;
    }
    if (heatVis) {
      const H = ribbon.heat;
      for (let j = 0; j < R.n; j++) { const v = sampleGrid(R.x[j], R.z[j]) / HEAT_FULL; H[j * 2] = H[j * 2 + 1] = v; }
      ribbon.attr.needsUpdate = true;
    }
  }
  runners.m.uniforms.uAspect.value = innerWidth / innerHeight;
  runners.m.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

  // the selected runner's pin
  if (tracking) {
    runnerXZ(rp.i, simT, _r);
    marker.visible = true; marker.position.set(_r.x, 0, _r.z); marker.scale.setScalar(clamp(dist / 700, 0.6, 2.5));
    meLabel.on = true; meLabel.p.set(_r.x, 32 * marker.scale.x, _r.z);
    const kmNow = R.dToKm(clamp(_r.d, 0, R.len)), done = rp.el >= F.T[rp.i];
    const kmTxt = fmtDec(rp.el <= 0 ? 0 : done ? 21.1 : kmNow);
    const pin = T('pin', { bib: F.raw.bib[rp.i], km: kmTxt, up: fmtInt(up), down: fmtInt(down) });
    if (pin !== ui.pin) {
      ui.pin = pin; meLabel.t.innerHTML = pin;
      $('#rpRead').textContent = `${kmTxt} km`;
      $('#rPassed').innerHTML = `<span class="up">▲ ${fmtInt(up)}</span> / <span class="down">▼ ${fmtInt(down)}</span>`;
    }
    const pu = marker.userData.pulse, ph = (now * 0.0007) % 1;
    pu.scale.set(1 + ph * 2.2, 1, 1 + ph * 2.2); pu.material.opacity = (1 - ph) * (1 - ph) * 0.75;
    if (!rpDragging) $('#rpPos').value = Math.round(clamp((rp.el + 60) / (F.T[rp.i] + 300), 0, 1) * 1000);
  } else { marker.visible = false; if (meLabel) meLabel.on = false; }

  $('#clock').classList.toggle('on', st.clock);
  if (st.clock) { const tx = st.pill || (LANG === 'da' ? 'kl. ' : '') + clockStr(simT); if (tx !== ui.clock) { ui.clock = tx; $('#clock').textContent = tx; } }
  $('#replayBar').classList.toggle('on', tracking);
  $('#explore').classList.toggle('on', ch.id === 'close');
  if (ch.id === 'close') $('#exClock').textContent = clockStr(simT);

  updateLabels();
  renderer.render(scene, camera);
}
const PAL_C = { sweater: C(PAL.sweater), coral: C(PAL.coral) };

/* ── interactions ─────────────────────────────────────────────────────── */
function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', onResize);

// drag: sideways rotates, up/down tilts (mouse); on touch only sideways so the page still scrolls
let dragging = false, dragX = 0, dragY = 0, dragId = null, dragMouse = false;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { dragging = true; dragX = e.clientX; dragY = e.clientY; dragId = e.pointerId; dragMouse = e.pointerType === 'mouse'; cv.classList.add('drag'); });
addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== dragId) return;
  userYawGoal -= (e.clientX - dragX) * 0.006;
  if (dragMouse) userPitchGoal = clamp(userPitchGoal + (e.clientY - dragY) * 0.004, -1.1, 0.9);
  dragX = e.clientX; dragY = e.clientY;
});
const endDrag = () => { dragging = false; dragId = null; cv.classList.remove('drag'); };
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);

$$('.lang button').forEach((b) => b.addEventListener('click', () => {
  LANG = b.dataset.lang;
  try { localStorage.setItem('ch-lang', LANG); } catch { /* storage blocked */ }
  applyLang();
}));

$('#exTime').addEventListener('input', (e) => { exPlaying = false; $('#exPlay').innerHTML = ICON_PLAY; simT = +e.target.value; });
$('#exPlay').addEventListener('click', () => { exPlaying = !exPlaying; $('#exPlay').innerHTML = exPlaying ? ICON_PAUSE : ICON_PLAY; });
$('#brand').addEventListener('click', () => scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }));
$('#exReset').addEventListener('click', () => { userYawGoal = 0; userPitchGoal = 0; userZoomGoal = 1; });

// zoom: buttons, Ctrl/⌘ + wheel or trackpad pinch (plain scrolling keeps moving through the story), two-finger pinch on touch
const zoomBy = (f) => { userZoomGoal = clamp(userZoomGoal * f, ZOOM_MIN, ZOOM_MAX); };
$('#zoomIn').addEventListener('click', () => zoomBy(1 / 1.45));
$('#zoomOut').addEventListener('click', () => zoomBy(1.45));
cv.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  zoomBy(Math.exp(e.deltaY * 0.01));
}, { passive: false });
const touches = new Map(); let pinch0 = 0;
cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touches.set(e.pointerId, [e.clientX, e.clientY]); });
addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size === 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch0) zoomBy(pinch0 / d);
    pinch0 = d; dragging = false;                  // a pinch is not a rotation
  }
});
const endTouch = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; };
addEventListener('pointerup', endTouch); addEventListener('pointercancel', endTouch);

// your race
function fillRace() {
  const i = rp.i, fd = F.raw, cat = fd.cats[fd.cat[i]] || '-';
  let catRank = 0, catN = 0;
  for (let j = 0; j < F.N; j++) if (fd.cat[j] === fd.cat[i]) { catN++; if (fd.pl[j] <= fd.pl[i]) catRank++; }
  $('#rTime').textContent = hms(F.T[i]);
  $('#rPlace').textContent = `${fmtInt(fd.pl[i])} ${T('of')} ${fmtInt(F.N)}`;
  $('#rCat').textContent = cat === '-' ? '–' : `${catLabel(cat)} · ${fmtInt(catRank)} ${T('of')} ${fmtInt(catN)}`;
  $('#rGroup').textContent = `${GROUP_NAMES[F.G[i]]} · ${clockStr(F.S[i])}`;
}
function catLabel(c) { return `${TEXT[LANG].cats[c[0]] || ''} ${c.slice(1).replace('-', '–')}`.trim(); }
const ICON_PLAY = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>';
function syncReplayUi() {
  $('#rpPlay').innerHTML = rp.playing ? ICON_PAUSE : ICON_PLAY;
  $('#rpSpeed').textContent = `${String(rp.speed).replace('.', LANG === 'da' ? ',' : '.')}×`;
}
$('#findForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const bib = $('#bib').value.trim().replace(/\D/g, '');
  const i = F ? F.raw.bib.indexOf(+bib) : -1;
  if (!bib || i < 0) {
    const er = $('#findErr'); er.textContent = bib ? T('notFound', { bib }) : T('typeBib');
    er.classList.remove('shake'); void er.offsetWidth; er.classList.add('shake'); return;
  }
  $('#findErr').textContent = '';
  ui.pin = ''; rp.i = i; rp.el = -120; rp.playing = true; rp.speed = 1; userYawGoal = 0; userPitchGoal = 0;
  fillRace(); $('#race').classList.add('on'); syncReplayUi();
});
$('#rpPlay').addEventListener('click', () => { if (rp.i < 0) return; if (rp.el >= F.T[rp.i] + 240) rp.el = -120; rp.playing = !rp.playing; syncReplayUi(); });
$('#rpSpeed').addEventListener('click', () => { rp.speed = SPEEDS[(SPEEDS.indexOf(rp.speed) + 1) % SPEEDS.length]; syncReplayUi(); });
let rpDragging = false;
$('#rpPos').addEventListener('input', (e) => { if (rp.i < 0) return; rpDragging = true; rp.el = +e.target.value / 1000 * (F.T[rp.i] + 300) - 60; });
$('#rpPos').addEventListener('change', () => { rpDragging = false; });
$('#rpClose').addEventListener('click', () => {
  rp.i = -1; $('#race').classList.remove('on'); $('#bib').value = ''; $('#findErr').textContent = '';
  $('#bib').focus({ preventScroll: true });
});

// race card in the race's own look
$('#card').addEventListener('click', async () => {
  if (rp.i < 0) return;
  try { await document.fonts.load('800 160px "Open Sans"'); await document.fonts.load('700 40px "Barlow Condensed"'); } catch { /* fall back */ }
  const i = rp.i, fd = F.raw;
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = PAL.blue; g.fillRect(0, 0, W, H);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let k = 0; k < R.n; k++) { x0 = Math.min(x0, R.x[k]); x1 = Math.max(x1, R.x[k]); z0 = Math.min(z0, R.z[k]); z1 = Math.max(z1, R.z[k]); }
  const sc = Math.min(520 / (x1 - x0), 640 / (z1 - z0)), ox = W - 90 - (x1 - x0) * sc, oz = 170;
  g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = PAL.sweater;
  g.beginPath(); for (let k = 0; k < R.n; k += 2) { const X = ox + (R.x[k] - x0) * sc, Y = oz + (R.z[k] - z0) * sc; k ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
  g.save(); g.strokeStyle = '#fff'; g.lineWidth = 64;
  g.beginPath(); g.moveTo(-20, 920); g.bezierCurveTo(260, 820, 420, 1020, 700, 930); g.bezierCurveTo(880, 870, 980, 900, 1100, 860); g.stroke(); g.restore();
  g.fillStyle = PAL.blue; g.font = '700 34px "Barlow Condensed", sans-serif';
  let tx = 60; for (const chh of 'BESTSELLER AARHUS CITY HALF 2026') { const y = 920 + Math.sin(((tx + 20) / W) * Math.PI * 2.1 - 0.4) * -45; g.fillText(chh, tx, y + 12); tx += g.measureText(chh).width + 7; }
  g.fillStyle = '#fff'; g.font = '700 32px "Open Sans", sans-serif'; g.fillText(T('card1'), 80, 120);
  g.font = '800 170px "Open Sans", sans-serif'; g.fillText(hms(F.T[i]), 70, 1150);
  g.fillStyle = PAL.sweater; g.font = '700 36px "Open Sans", sans-serif';
  g.fillText(T('card2', { pl: fmtInt(fd.pl[i]), n: fmtInt(F.N), bib: fd.bib[i] }), 80, 1230);
  const cat = fd.cats[fd.cat[i]] || '';
  if (cat && cat !== '-') g.fillText(catLabel(cat).toUpperCase(), 80, 1290);
  c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `city-half-2026-${fd.bib[i]}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
});

$('#exPlay').innerHTML = ICON_PLAY; syncReplayUi();
applyLang();
main().catch((e) => { console.error(e); $('#loading').classList.add('fail'); $('#loading span').textContent = LANG === 'da' ? 'Kunne ikke hente data' : 'Could not load the data'; });
