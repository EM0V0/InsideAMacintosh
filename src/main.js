// Macintosh 128K Teardown: rotate, double-click a part to select it, drag it out along its rail.
// The screen runs a re-created 1984 desktop: click it to use it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials, buildCRT, buildGlassSkirt, buildAnalogBoard, buildLogicBoard, buildFloppy, buildChassis, buildPortPanel, CRT_FRAME } from './parts.js';
import { CRTScreen } from './screen.js';
import { Sound } from './audio.js';
import { CASE_TEX, KEYS_TEX } from './embedded.js';
import { GLB_B64 } from './glb.js';

const MODEL_URL = 'mac128k.glb';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = matchMedia('(pointer: coarse)').matches;
const BG = { inner: '#e2e8ee', mid: '#c9d4df', outer: '#9fb0c2' };
const ACCENT = new THREE.Color('#f0a43a');

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const ui = { toggle: $('toggle'), tag: $('tag'), loader: $('loader'), loadbar: $('loadbar'), loadtext: $('loadtext'), fail: $('fail') };

// ------------------------------------------------------------------ renderer & scene
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  ui.loadtext.textContent = ''; ui.fail.style.display = 'block';
  throw e;
}
const DPR = Math.min(window.devicePixelRatio || 1, TOUCH ? 1.75 : 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = makeBackdrop();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.72;

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 3000);

function makeBackdrop() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(512, 430, 40, 512, 560, 760);
  grd.addColorStop(0, BG.inner); grd.addColorStop(0.45, BG.mid); grd.addColorStop(1, BG.outer);
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  const img = g.getImageData(0, 0, 1024, 1024), d = img.data; // fine grain keeps the gradient from banding
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 3; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// lights
scene.add(new THREE.HemisphereLight(0xf1f5f9, 0xbcae92, 0.5));
const key = new THREE.DirectionalLight(0xfff3e2, 1.55);
key.position.set(-70, 120, 85);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 20, far: 400 });
key.shadow.bias = -0.00035;
key.shadow.normalBias = 0.04;
key.shadow.radius = 4;
key.target.position.set(0, 8, -4);
scene.add(key, key.target);
const rimLight = new THREE.DirectionalLight(0xd9e7ff, 0.65);
rimLight.position.set(85, 70, -95);
scene.add(rimLight);

// ground: shadows only, plus soft contact shading
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.ShadowMaterial({ color: 0x1b2836, opacity: 0.2 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
function contactBlob(w, d, x, z, alpha) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, `rgba(20,30,42,${alpha})`); grd.addColorStop(0.55, `rgba(20,30,42,${alpha * 0.45})`); grd.addColorStop(1, 'rgba(20,30,42,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); m.renderOrder = -1;
  scene.add(m);
  return m;
}
contactBlob(38, 42, 0, 0, 0.42);
contactBlob(46, 26, 0, 30.8, 0.3);
contactBlob(12, 16, 28.8, 29.3, 0.28);

// post-processing: MSAA scene pass, hover outline, selection outline, tone mapping
const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { samples: TOUCH ? 2 : 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const hoverPass = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
Object.assign(hoverPass, { edgeStrength: 2.4, edgeGlow: 0, edgeThickness: 1, pulsePeriod: 0 });
hoverPass.visibleEdgeColor.set('#ffffff'); hoverPass.hiddenEdgeColor.set('#6d7886');
const selectPass = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
Object.assign(selectPass, { edgeStrength: 4.2, edgeGlow: 0.55, edgeThickness: 1.6, pulsePeriod: 0 });
selectPass.visibleEdgeColor.copy(ACCENT); selectPass.hiddenEdgeColor.set('#8a5a1c');
composer.addPass(hoverPass);
composer.addPass(selectPass);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ interaction state (listener before OrbitControls)
const pointer = { x: 0, y: 0, moved: false, inside: false };
canvas.addEventListener('pointerdown', onPointerDown);
const controls = new OrbitControls(camera, canvas);
// orbit and zoom always pivot on the model, never on the cursor; no panning
Object.assign(controls, { enableDamping: true, dampingFactor: 0.085, rotateSpeed: 0.75, zoomSpeed: 0.9, enablePan: false, zoomToCursor: false, minDistance: 22, maxDistance: 340, maxPolarAngle: THREE.MathUtils.degToRad(86) });

// ------------------------------------------------------------------ materials for the scanned exterior
const texLoader = new THREE.TextureLoader();
function dataTex(url) { const t = texLoader.load(url); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const CASE_TINT = new THREE.Color().setRGB(1.12, 1.13, 1.18); // lifts the model's aged beige towards new-plastic tone
const caseBeige = new THREE.Color('#b9ad90').multiply(CASE_TINT);
const panelBeige = new THREE.Color('#b3a78b').multiply(CASE_TINT);
const MAT = {
  case: new THREE.MeshPhysicalMaterial({ map: dataTex(CASE_TEX), color: CASE_TINT, roughness: 0.6, clearcoat: 0.12, clearcoatRoughness: 0.55, side: THREE.DoubleSide }),
  rim: new THREE.MeshStandardMaterial({ color: caseBeige, roughness: 0.65, side: THREE.DoubleSide }),
  // the inside of the case carries a grey conductive (shielding) coat
  shellInner: new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.78, metalness: 0.25, side: THREE.BackSide }),
  black: new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.62, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: new THREE.Color('#8f866f').multiply(CASE_TINT), roughness: 0.55 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xd3d5d7, metalness: 1, roughness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeeeadf, roughness: 0.5 }),
  keys: new THREE.MeshStandardMaterial({ map: dataTex(KEYS_TEX), color: new THREE.Color().setRGB(1.25, 1.27, 1.32), roughness: 0.62 }),
  screen: new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0xffffff, emissiveIntensity: 0 }),
};
const PM = createMaterials();
const sound = new Sound();
const crtScreen = new CRTScreen({ beep: () => sound.sysBeep(), setVolume: (v) => sound.setVolume(v) });
MAT.screen.emissiveMap = crtScreen.texture;

// ------------------------------------------------------------------ parts
const parts = {};      // removable
const statics = {};    // fixed, hover label only
const PART_INFO = {
  rearCase: { name: 'Rear Case', desc: 'ABS plastic, shielded inside' },
  logic: { name: 'Logic Board', desc: '68000 at 7.83 MHz · 128 KB RAM' },
  analog: { name: 'Analog Board', desc: 'Power supply and CRT sweep' },
  crt: { name: 'CRT', desc: '9-inch monochrome, 512 × 342' },
  floppy: { name: 'Floppy Drive', desc: 'Sony 3.5-inch, 400 KB' },
  bezel: { name: 'Front Bezel', desc: 'Holds the CRT and chassis' },
  chassis: { name: 'Chassis', desc: 'Galvanised steel frame' },
  keyboard: { name: 'Keyboard', desc: 'Detachable, coiled cord' },
  mouse: { name: 'Mouse', desc: 'One button, plugs in at the back' },
  knob: { name: 'Brightness', desc: 'Thumbwheel for the analog board' },
  screen: { name: 'Screen', desc: 'Click to use this Mac' },
};
// Rails: offsets from home in world space, rotations in degrees relative to home.
const RAILS = {
  rearCase: [[0, 0, 0, 0, 0, 0], [0, 0.8, -25, 0, 0, 0], [38, 0.8, -18, 0, -50, 0]],
  logic: [[0, 0, 0, 0, 0, 0], [0, 0.4, -24.5, 0, 0, 0], [-16, 8, -31, -22, 0, 0]],
  analog: [[0, 0, 0, 0, 0, 0], [0, 0.6, -2.4, 0, 0, 0], [-14, 1.5, -3, 0, 0, 0], [-25, 3, -1, 0, 180, 0]],
  crt: [[0, 0, 0, 0, 0, 0], [0, 0.4, -6.8, 0, 0, 0], [0, 17, -8, 0, 0, 0], [0, 25, -7, -6, -16, 0]],
  floppy: [[0, 0, 0, 0, 0, 0], [0, 0, -16.5, 0, 0, 0], [14, 0, -14, 0, 0, 0], [20, -1, -3, 0, -30, 0]],
};
const PIVOTS = {
  rearCase: new THREE.Vector3(0, 17.3, -2.3),
  logic: new THREE.Vector3(0, 1.33, -0.65),
  analog: new THREE.Vector3(-9.3, 15.6, -1.0),
  floppy: new THREE.Vector3(4.81, 10.45, 0.95),
};
const ORDER_OUT = ['rearCase', 'analog', 'logic', 'floppy', 'crt'];
const ORDER_IN = ['crt', 'floppy', 'logic', 'analog', 'rearCase'];
const INTERNAL = ['logic', 'analog', 'crt', 'floppy'];
const LOCKED_INSIDE = new Set([...INTERNAL, 'chassis']); // untouchable until the case is open

class Rail {
  constructor(keys) {
    this.pts = keys.map((k) => new THREE.Vector3(k[0], k[1], k[2]));
    this.quats = keys.map((k) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...k.slice(3).map(THREE.MathUtils.degToRad))));
    this.curve = new THREE.CatmullRomCurve3(this.pts, false, 'centripetal');
    this.curve.arcLengthDivisions = 400;
    this.n = keys.length;
  }
  offset(u, out) { return this.curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), out); }
  rotation(u, out) {
    const t = this.curve.getUtoTmapping(THREE.MathUtils.clamp(u, 0, 1)) * (this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(t)), f = t - i;
    const e = f * f * (3 - 2 * f);
    return out.slerpQuaternions(this.quats[i], this.quats[i + 1], e);
  }
}

function makePart(id, group) {
  const p = { id, group, ...PART_INFO[id], rail: new Rail(RAILS[id]), t: 0, v: 0, target: 0, k: 140, drag: false,
    homePos: group.position.clone(), homeQuat: group.quaternion.clone(), removable: true, delay: 0 };
  group.traverse((o) => { o.userData.partId = id; });
  parts[id] = p;
  return p;
}
const _off = new THREE.Vector3(), _q = new THREE.Quaternion();
function applyPart(p) {
  const u = THREE.MathUtils.clamp(p.t, -0.05, 1.05);
  p.rail.offset(THREE.MathUtils.clamp(u, 0, 1), _off);
  if (u > 1) _off.add(p.rail.curve.getTangentAt(1).multiplyScalar((u - 1) * p.rail.curve.getLength()));
  if (u < 0) _off.add(p.rail.curve.getTangentAt(0).multiplyScalar(u * p.rail.curve.getLength()));
  p.group.position.copy(p.homePos).add(_off);
  p.group.quaternion.copy(p.rail.rotation(u, _q)).multiply(p.homeQuat);
}
function repivot(group, pivot) {
  for (const c of group.children) c.position.sub(pivot);
  group.position.copy(pivot);
}

// ------------------------------------------------------------------ cables (unplug when either end moves)
const cables = [];
function stripeTexture(colors) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  colors.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, (i * 64) / colors.length, 8, 64 / colors.length + 1); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
class Cable {
  constructor(o) {
    Object.assign(this, o);
    const og = this.owner.group;
    og.updateMatrixWorld(true);
    const inv = og.matrixWorld.clone().invert();
    const world = [this.A, ...(this.via || []), this.B];
    this.plugged = world.map((p) => p.clone().applyMatrix4(inv));
    if (this.looseWorld) this.loose = this.looseWorld.map((p) => p.clone().applyMatrix4(inv));
    else {
      const a = this.plugged[0];
      const down = new THREE.Vector3(0, -1, 0).transformDirection(inv);
      const e = this.dangle.clone();
      if (this.dangleWorld) e.transformDirection(inv).multiplyScalar(this.dangle.length());
      const end = a.clone().add(e);
      const n = this.plugged.length;
      this.loose = this.plugged.map((_, i) => { const f = i / (n - 1); return a.clone().lerp(end, f).addScaledVector(down, Math.sin(f * Math.PI) * (this.sag ?? 1.2)); });
    }
    this.k = 1; this.want = 1; this.pts = this.plugged.map((p) => p.clone());
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    og.add(this.mesh);
    if (this.cap) { this.capMesh = new THREE.Mesh(this.cap.geo, this.cap.mat); this.capMesh.castShadow = true; og.add(this.capMesh); }
    this.mesh.userData.partId = this.owner.id;
    if (this.capMesh) this.capMesh.userData.partId = this.owner.id;
    this.rebuild();
  }
  rebuild() {
    const e = this.k * this.k * (3 - 2 * this.k);
    this.pts.forEach((p, i) => p.copy(this.loose[i]).lerp(this.plugged[i], e));
    const curve = new THREE.CatmullRomCurve3(this.pts, false, 'centripetal');
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.ribbon ? ribbonGeometry(curve, this.ribbon.width, this.ribbon.side) : new THREE.TubeGeometry(curve, this.segments || 48, this.radius, 10, false);
    if (this.capMesh) {
      const end = curve.getPointAt(1), tan = curve.getTangentAt(1);
      this.capMesh.position.copy(end);
      this.capMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      if (this.capUp) { const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.capMesh.quaternion); const want = new THREE.Vector3(0, 1, 0).transformDirection(this.owner.group.matrixWorld.clone().invert()); const tw = new THREE.Vector3().crossVectors(up, want).dot(tan); this.capMesh.rotateZ(Math.atan2(tw, up.dot(want))); }
    }
  }
  update(dt) {
    const home = (p) => !p || p.t < 0.004;
    const want = this.isPlugged ? (this.isPlugged() ? 1 : 0) : home(this.owner) && home(this.target) ? 1 : 0;
    if (want !== this.want) { this.want = want; sound.click(); }
    const speed = want ? 4.5 : 7;
    const k = THREE.MathUtils.clamp(this.k + Math.sign(want - this.k) * speed * dt, 0, 1);
    if (k !== this.k) { this.k = k; this.rebuild(); }
  }
}
function ribbonGeometry(curve, width, side) {
  const N = 60, pos = [], nrm = [], uv = [], idx = [];
  const s = side.clone().normalize();
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const sv = s.clone().addScaledVector(t, -s.dot(t)).normalize();
    const n = new THREE.Vector3().crossVectors(t, sv).normalize();
    for (const k of [-0.5, 0.5]) { const q = p.clone().addScaledVector(sv, k * width); pos.push(q.x, q.y, q.z); nrm.push(n.x, n.y, n.z); uv.push(u * 4, k + 0.5); }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// connector plug geometry (block facing +Z)
function plugGeometry(w, h, d) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, 0, -d / 2 + 0.1); return g; }

// ------------------------------------------------------------------ build the scene
let ready = false;
let crtInfo, glassMesh, mouseCord;
const pickables = [];
const centerObjs = [];
let caseBox = null;

async function init() {
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  const loader = new GLTFLoader();
  let gltf;
  try {
    if (GLB_B64) {
      const bin = atob(GLB_B64), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      ui.loadbar.style.width = '100%';
      gltf = await loader.parseAsync(buf.buffer, '');
    } else {
      gltf = await loader.loadAsync(MODEL_URL, (e) => {
        if (e.total) { const f = e.loaded / e.total; ui.loadbar.style.width = `${Math.round(f * 100)}%`; ui.loadtext.textContent = `Loading model ${Math.round(f * 100)}%`; }
      });
    }
  } catch (err) {
    ui.loadtext.textContent = 'The model could not be loaded. Reload the page to try again.';
    throw err;
  }
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = MAT[o.material.name] || MAT.case;
      o.castShadow = true; o.receiveShadow = true;
    }
  });
  scene.add(root);
  root.updateMatrixWorld(true);
  const node = (n) => root.getObjectByName(n);
  // case shells: textured outside, coated inside (keeps the badge off the inner wall)
  MAT.shell = MAT.case.clone(); MAT.shell.side = THREE.FrontSide;
  for (const id of ['bezel', 'rearCase']) {
    const meshes = [];
    node(id).traverse((o) => { if (o.isMesh && o.material === MAT.case) meshes.push(o); });
    for (const m of meshes) {
      m.material = MAT.shell;
      const inner = new THREE.Mesh(m.geometry, MAT.shellInner);
      inner.castShadow = false; inner.receiveShadow = true;
      m.add(inner);
    }
  }

  const mk = (id, pivot) => { const g = new THREE.Group(); g.name = id; g.position.copy(pivot); scene.add(g); g.updateMatrixWorld(true); return g; };
  // rear case with the 128K's rear port panel
  const gRear = mk('rearCase', PIVOTS.rearCase);
  const rearNode = node('rearCase');
  gRear.attach(rearNode);
  const panel = buildPortPanel(panelBeige, MAT.shellInner.color);
  scene.add(panel); panel.updateMatrixWorld(true); gRear.attach(panel);
  // logic board
  const lb = buildLogicBoard(PM);
  repivot(lb.group, PIVOTS.logic);
  scene.add(lb.group); lb.group.updateMatrixWorld(true);
  // analog board with the power inlet and switch (the brightness thumbwheel stays in the bezel)
  const ab = buildAnalogBoard(PM);
  repivot(ab.group, PIVOTS.analog);
  scene.add(ab.group); ab.group.updateMatrixWorld(true);
  ab.group.attach(node('analogRear'));
  // CRT with the model's face glass
  crtInfo = buildCRT(PM);
  const gCrt = crtInfo.group;
  gCrt.position.copy(CRT_FRAME.position); gCrt.rotation.x = CRT_FRAME.tilt;
  scene.add(gCrt); gCrt.updateMatrixWorld(true);
  const glass = node('screenGlass');
  gCrt.attach(glass);
  glass.updateMatrixWorld(true);
  glass.traverse((o) => { if (o.isMesh) { o.material = MAT.screen; o.castShadow = false; o.userData.noPick = true; } });
  glassMesh = glass.isMesh ? glass : glass.children.find((c) => c.isMesh);
  glassMesh.geometry.computeBoundingBox();
  {
    const pos = glassMesh.geometry.attributes.position, ix = glassMesh.geometry.index;
    const toLocal = new THREE.Matrix4().copy(gCrt.matrixWorld).invert().multiply(glassMesh.matrixWorld);
    const pts = [];
    for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toLocal));
    const g = new THREE.BufferGeometry().setFromPoints(pts); g.setIndex(Array.from(ix.array));
    gCrt.add(buildGlassSkirt(g, PM));
  }
  // floppy drive
  const fd = buildFloppy(PM);
  repivot(fd.group, PIVOTS.floppy);
  scene.add(fd.group);
  // chassis (fixed) and the bezel's CRT mounting bosses
  const ch = buildChassis(PM, caseBeige);
  scene.add(ch.group);
  scene.add(ch.bosses); node('bezel').attach(ch.bosses);

  makePart('rearCase', gRear);
  // the rear case gets its own material copies so it can fade when it blocks the view
  const fadeMats = new Map();
  gRear.traverse((o) => {
    if (!o.isMesh) return;
    if (!fadeMats.has(o.material)) { const m = o.material.clone(); m.transparent = true; m.userData.baseSide = m.side; m.userData.inner = o.material === MAT.shellInner || o.material.side === THREE.BackSide; fadeMats.set(o.material, m); }
    o.material = fadeMats.get(o.material);
  });
  parts.rearCase.fadeMats = [...fadeMats.values()];
  parts.rearCase.fade = 1;
  makePart('logic', lb.group);
  makePart('analog', ab.group);
  makePart('crt', gCrt);
  makePart('floppy', fd.group);
  for (const id of ['bezel', 'keyboard', 'mouse', 'knob']) { const n = node(id); n.traverse((o) => { o.userData.partId = id; }); statics[id] = n; }
  ch.group.traverse((o) => { o.userData.partId = 'chassis'; }); statics.chassis = ch.group;
  node('keyboard').traverse((o) => { if (o.isMesh && o.material === MAT.keys) o.userData.noPick = true; });
  node('kbCord').traverse((o) => { o.userData.noPick = true; });
  glass.traverse((o) => { o.userData.noPick = true; });
  // local bounds of the rear case: a five-sided box (the front is open) used to test what it hides
  {
    gRear.updateMatrixWorld(true);
    const inv = gRear.matrixWorld.clone().invert();
    caseBox = new THREE.Box3();
    rearNode.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); caseBox.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
  }

  // cables (world coordinates at home)
  const W = (x, y, z) => new THREE.Vector3(x, y, z);
  const crtW = (v) => gCrt.localToWorld(v.clone());
  const anodeW = crtW(crtInfo.anodeLocal.clone().addScaledVector(crtInfo.anodeNormal, 0.45));
  const anodeOut = crtInfo.anodeNormal.clone().transformDirection(gCrt.matrixWorld);
  const cupGeo = new THREE.CylinderGeometry(0.55, 1.15, 0.75, 28); cupGeo.rotateX(Math.PI / 2); cupGeo.translate(0, 0, -0.1);
  // anode lead: from the flyback over the top of the funnel (in front of the handle well) to the anode on the right
  cables.push(new Cable({ owner: parts.analog, target: parts.crt, A: ab.flybackHV.clone(), B: anodeW,
    via: [ab.flybackHV.clone().add(W(0.3, 0.5, 1.6)), W(-6.2, 30.0, 1.6), W(-1.5, 30.9, 4.3), W(3.8, 30.3, 5.4), anodeW.clone().addScaledVector(anodeOut, 3.0), anodeW.clone().addScaledVector(anodeOut, 1.2)],
    radius: 0.2, mat: PM.redWire, dangle: W(2.2, 1.0, 6.0), sag: 1.6, cap: { geo: cupGeo, mat: PM.rubber } }));
  const harness = (cols) => new THREE.MeshStandardMaterial({ map: stripeTexture(cols), roughness: 0.5 });
  const plugGeo = plugGeometry(1.0, 0.6, 0.8);
  cables.push(new Cable({ owner: parts.crt, target: parts.analog, A: crtW(crtInfo.yokePlugLocal), B: ab.yokeJack.clone(),
    via: [W(-5.0, 26.6, 1.8), W(-8.4, 27.4, 2.9)], radius: 0.2, mat: harness(['#b8261d', '#1f3f8a', '#d9b425', '#2e7d3a']), dangle: W(-2.5, -3.0, -1.0), dangleWorld: true, sag: 0.6, cap: { geo: plugGeo, mat: PM.whiteConn } }));
  cables.push(new Cable({ owner: parts.crt, target: parts.analog, A: crtW(crtInfo.neckPlugLocal), B: ab.neckJack.clone(),
    via: [W(-1.5, 20.0, -11.2), W(-6.0, 21.0, -9.8), W(-9.0, 21.9, -7.9)], radius: 0.2, mat: harness(['#ece7d9', '#1b1b1b', '#b8261d', '#ece7d9']), dangle: W(-1.5, -4.0, -0.8), dangleWorld: true, sag: 0.8, cap: { geo: plugGeo, mat: PM.whiteConn } }));
  cables.push(new Cable({ owner: parts.analog, target: parts.logic, A: ab.logicJack.clone(), B: lb.analogHeader.clone().add(W(0, 0.3, 0)),
    via: [W(-8.6, 20.6, 1.6), W(-8.0, 16.0, 3.4), W(-8.4, 9.5, 3.2), W(-8.6, 5.0, 1.0), W(-7.6, 3.9, -4.5), W(-6.28, 3.9, -6.7)], radius: 0.24, mat: harness(['#b8261d', '#1b1b1b', '#d98a1c', '#1b1b1b', '#ece7d9', '#1f3f8a']), dangle: W(1.8, -6.0, 1.5), sag: 0.5, cap: { geo: plugGeometry(4.0, 0.7, 0.8), mat: PM.whiteConn }, segments: 80 }));
  const ribbonTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'); for (let i = 0; i < 20; i++) { g.fillStyle = i === 0 ? '#a8322a' : i % 2 ? '#a7a9ab' : '#b8babc'; g.fillRect(0, i * 6.4, 4, 6.4); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t; })();
  const ribbonMat = new THREE.MeshStandardMaterial({ map: ribbonTex, roughness: 0.55, side: THREE.DoubleSide });
  cables.push(new Cable({ owner: parts.floppy, target: parts.logic, A: fd.plug.clone(), B: lb.floppyHeader.clone().add(W(0, 0.25, 0)),
    via: [W(4.85, 8.3, -7.6), W(4.88, 5.6, -8.5), W(4.9, 3.6, -8.2)], ribbon: { width: 2.3, side: W(1, 0, 0) }, mat: ribbonMat, dangle: W(0, -2.6, -3.4), sag: 0.6, cap: { geo: plugGeometry(3.0, 0.6, 0.75), mat: PM.black } }));
  // mouse cord from the model; it is unplugged (hidden) while the case or the logic board is out
  mouseCord = node('mouseCord');
  mouseCord.traverse((o) => { o.userData.partId = 'mouse'; });
  // picking list
  scene.traverse((o) => { if (o.isMesh && o.userData.partId && !o.userData.noPick) pickables.push(o); });
  centerObjs.push(node('bezel'), ...Object.values(parts).map((p) => p.group));

  ready = true;
  ui.loader.classList.add('done');
  ui.toggle.disabled = false;
  setTimeout(() => crtScreen.powerOn(), 500);
  wasPowered = true;
}

// ------------------------------------------------------------------ camera: always centred on the model
function fitDistance(radius) {
  const v = THREE.MathUtils.degToRad(camera.fov);
  const h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
  return radius / Math.sin(Math.min(v, h) / 2);
}
const VIEWS = { home: { az: -32, el: 14, r: 31 }, apart: { az: -138, el: 20, r: 54 } };
const HOME_TARGET = new THREE.Vector3(0, 17.2, 0);
const focus = { mode: 'model', screenDist: 0 };
let flight = null;
function sphericalFor(az, el, dist) { return new THREE.Spherical(dist, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az)); }
function flyTo(v, dur = 1.6) { flySpherical(sphericalFor(v.az, v.el, fitDistance(v.r)), dur); }
function flySpherical(toS, dur) {
  const fromS = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  if (REDUCED) { camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(toS)); return; }
  let dt = toS.theta - fromS.theta;
  while (dt > Math.PI) dt -= 2 * Math.PI; while (dt < -Math.PI) dt += 2 * Math.PI;
  flight = { t: 0, dur, fromS, toS: new THREE.Spherical(toS.radius, toS.phi, fromS.theta + dt) };
}
function updateFlight(dt) {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / flight.dur);
  const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
  const s = new THREE.Spherical(
    THREE.MathUtils.lerp(flight.fromS.radius, flight.toS.radius, e),
    THREE.MathUtils.lerp(flight.fromS.phi, flight.toS.phi, e),
    THREE.MathUtils.lerp(flight.fromS.theta, flight.toS.theta, e));
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
  if (flight.t >= 1) flight = null;
}
const _cb = new THREE.Box3(), _cc = new THREE.Vector3(), _cd = new THREE.Vector3();
function modelCenter(out) {
  _cb.makeEmpty();
  for (const o of centerObjs) _cb.expandByObject(o);
  return _cb.isEmpty() ? out.copy(HOME_TARGET) : _cb.getCenter(out);
}
function glassCenterWorld(out) { const bb = glassMesh.geometry.boundingBox; return bb.getCenter(out).applyMatrix4(glassMesh.matrixWorld); }
function updateCentering(dt) {
  const want = focus.mode === 'screen' ? glassCenterWorld(_cc) : modelCenter(_cc);
  const k = 1 - Math.exp(-dt * (focus.mode === 'screen' ? 5 : 3));
  _cd.copy(want).sub(controls.target).multiplyScalar(k);
  controls.target.add(_cd); camera.position.add(_cd);
  if (focus.mode === 'screen' && !flight && camera.position.distanceTo(controls.target) > focus.screenDist * 1.9) focus.mode = 'model';
}
function screenNormal() { return new THREE.Vector3(0, 0, 1).applyQuaternion(crtInfo.group.getWorldQuaternion(new THREE.Quaternion())); }
function flyToScreen() {
  const bb = glassMesh.geometry.boundingBox, s = new THREE.Vector3();
  bb.getSize(s).multiply(new THREE.Vector3().setFromMatrixScale(glassMesh.matrixWorld));
  const v = THREE.MathUtils.degToRad(camera.fov) / 2;
  const dH = (s.y / 2) / Math.tan(v) / 0.74, dW = (s.x / 2) / (Math.tan(v) * camera.aspect) / 0.9;
  const dist = Math.max(dH, dW, controls.minDistance) + s.z;
  const n = screenNormal();
  focus.mode = 'screen'; focus.screenDist = dist;
  const toS = new THREE.Spherical().setFromVector3(n.multiplyScalar(dist));
  // fly relative to where the target will settle (the glass centre)
  const c = glassCenterWorld(new THREE.Vector3());
  const d = c.clone().sub(controls.target); controls.target.add(d); camera.position.add(d);
  flySpherical(toS, 1.1);
}
{ const p = HOME_TARGET; controls.target.copy(p); camera.position.copy(p).add(new THREE.Vector3().setFromSpherical(sphericalFor(VIEWS.home.az, VIEWS.home.el, fitDistance(VIEWS.home.r)))); }

// ------------------------------------------------------------------ picking & pointer handling
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function pick(cx, cy) {
  setRay(cx, cy);
  const hits = raycaster.intersectObjects(pickables, false);
  for (const h of hits) {
    const id = h.object.userData.partId;
    if (!id || !h.object.visible) continue;
    if (id === 'rearCase' && parts.rearCase && parts.rearCase.fade < 0.5) continue; // a faded case lets clicks through
    if (LOCKED_INSIDE.has(id) && parts.rearCase.t < 0.95) return null;         // nothing inside until the case is off
    return { id, point: h.point };
  }
  return null;
}
// the screen: where on the 512 x 342 raster the pointer is, if the glass is visible and the Mac is running
const _gl = new THREE.Vector3();
function screenAt(cx, cy, extrapolate = false) {
  if (!ready || !glassMesh || parts.crt.t > 0.004 || !crtScreen.usable) return null;
  setRay(cx, cy);
  let p = null;
  const h = raycaster.intersectObject(glassMesh, false)[0];
  if (h) {
    const blocker = raycaster.intersectObjects(pickables, false).find((b) => b.object.visible && !(b.object.userData.partId === 'rearCase' && parts.rearCase.fade < 0.5));
    if (blocker && blocker.distance < h.distance - 0.05 && !['crt'].includes(blocker.object.userData.partId)) return null;
    p = h.point;
  } else if (extrapolate) {
    const n = screenNormal(), c = glassCenterWorld(new THREE.Vector3());
    const t = raycaster.ray.distanceToPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, c.addScaledVector(n, 0.6)));
    if (t === null) return null;
    p = raycaster.ray.at(t, new THREE.Vector3());
  } else return null;
  const bb = glassMesh.geometry.boundingBox;
  _gl.copy(p).applyMatrix4(glassMesh.matrixWorld.clone().invert());
  const u = (_gl.x - bb.min.x) / (bb.max.x - bb.min.x), v = (_gl.y - bb.min.y) / (bb.max.y - bb.min.y);
  const s = crtScreen.fromUV(u, v);
  if (!extrapolate && (s.x < -2 || s.y < -2 || s.x > 513 || s.y > 343)) return null;
  return s;
}
function screenPixels() {
  const bb = glassMesh.geometry.boundingBox;
  const a = new THREE.Vector3(0, bb.max.y, 0).applyMatrix4(glassMesh.matrixWorld).project(camera);
  const b = new THREE.Vector3(0, bb.min.y, 0).applyMatrix4(glassMesh.matrixWorld).project(camera);
  return Math.abs(a.y - b.y) * 0.5 * innerHeight;
}
const MIN_SCREEN_PX = TOUCH ? 230 : 250;
const scr = { dragging: false, pointerId: null, focused: false, over: false };
const mods = (e) => ({ shift: e.shiftKey, cmd: e.metaKey || e.ctrlKey, alt: e.altKey });

let hoverId = null, selectedId = null;
let lastDown = null, downInfo = null, drag = null, sequence = null;
let warnUntil = 0, warnText = '', flashId = null, flashUntil = 0;

function blockerFor(p, dir) {
  if (p.id !== 'rearCase' && parts.rearCase.t < 0.95) return { id: 'rearCase', text: 'Remove the Rear Case first' };
  if (p.id === 'crt' && parts.analog.t < 0.95) return { id: 'analog', text: 'Remove the Analog Board first' };
  if (p.id === 'rearCase' && dir < 0) { const out = INTERNAL.find((id) => parts[id].t > 0.02); if (out) return { id: out, text: `Put the ${parts[out].name} back first` }; }
  return null;
}

function select(id) {
  selectedId = id;
  selectPass.selectedObjects = id ? [parts[id].group] : [];
}

function onPointerDown(e) {
  sound.unlock();
  if (!ready) return;
  flight = null;
  // the Mac's own screen
  const s = screenAt(e.clientX, e.clientY);
  if (s) {
    hideTag();
    if (screenPixels() < MIN_SCREEN_PX) { flyToScreen(); controls.enabled = false; scr.swallow = e.pointerId; e.preventDefault(); return; }
    scr.dragging = true; scr.pointerId = e.pointerId; scr.focused = true;
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    crtScreen.pointer('down', s.x, s.y, mods(e));
    e.preventDefault();
    return;
  }
  scr.focused = false;
  const hit = pick(e.clientX, e.clientY);
  const now = performance.now();
  const dbl = lastDown && now - lastDown.time < 380 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 14 && hit && lastDown.id === hit.id;
  lastDown = { time: now, x: e.clientX, y: e.clientY, id: hit?.id };
  downInfo = { x: e.clientX, y: e.clientY, time: now, id: hit?.id, moved: false };
  const p = hit && parts[hit.id];
  if (p) {
    if (dbl && selectedId !== p.id) { select(p.id); sound.release(); showTag(e.clientX, e.clientY, p.id); }
    if (selectedId === p.id && !sequence) {
      controls.enabled = false;
      drag = { id: p.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, t0: p.t, vel: 0, lastTime: now, moved: 0, blocked: null };
      p.drag = true; p.v = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
      e.preventDefault();
      return;
    }
  }
  if (hit && statics[hit.id] && dbl) showTag(e.clientX, e.clientY, hit.id);
  canvas.classList.add('grabbing');
}

canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = true; pointer.inside = true;
  if (downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 5) { downInfo.moved = true; if (focus.mode === 'screen' && !scr.dragging) focus.mode = 'model'; }
  if (drag && e.pointerId === drag.pointerId) { dragMove(e); return; }
  if (scr.dragging && e.pointerId === scr.pointerId) { const s = screenAt(e.clientX, e.clientY, true); if (s) crtScreen.pointer('move', s.x, s.y, mods(e)); return; }
  if (!downInfo && ready) {
    const s = screenAt(e.clientX, e.clientY);
    scr.over = !!s && screenPixels() >= MIN_SCREEN_PX;
    if (scr.over) crtScreen.pointer('move', s.x, s.y, mods(e));
    scr.hoverSmall = !!s && !scr.over;
  }
});
canvas.addEventListener('pointerleave', () => { pointer.inside = false; scr.over = false; scr.hoverSmall = false; });
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function endPointer(e) {
  canvas.classList.remove('grabbing');
  if (scr.swallow === e.pointerId) { scr.swallow = null; controls.enabled = true; return; }
  if (scr.dragging && e.pointerId === scr.pointerId) {
    const s = screenAt(e.clientX, e.clientY, true);
    crtScreen.pointer('up', s ? s.x : 0, s ? s.y : 0, mods(e));
    scr.dragging = false; controls.enabled = true;
    return;
  }
  if (drag && e.pointerId === drag.pointerId) {
    const p = parts[drag.id];
    p.drag = false;
    controls.enabled = true;
    if (drag.moved > 3) {
      let target;
      if (drag.blocked) target = drag.t0 > 0.5 ? 1 : 0;
      else if (Math.abs(drag.vel) > 1.1) target = drag.vel > 0 ? 1 : 0;
      else target = p.t > 0.5 ? 1 : 0;
      p.target = target; p.v = drag.blocked ? 0 : THREE.MathUtils.clamp(drag.vel, -4, 4); p.k = 150;
    }
    sound.slide(0);
    drag = null;
  } else if (downInfo && !downInfo.moved && performance.now() - downInfo.time < 400) {
    if (!downInfo.id || !parts[downInfo.id]) { if (selectedId) select(null); }
    if (TOUCH && downInfo.id) showTag(downInfo.x, downInfo.y, downInfo.id);
  }
  downInfo = null;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sa = new THREE.Vector2(), _sb = new THREE.Vector2();
function toScreen(v, out) { const p = v.clone().project(camera); return out.set((p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight); }
function anchorAt(p, t, out) { return p.rail.offset(THREE.MathUtils.clamp(t, 0, 1), out).add(p.homePos); }

function dragMove(e) {
  const p = parts[drag.id];
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.hypot(dx, dy);
  // screen-space direction of the rail at the current position
  const eps = 0.02, t = THREE.MathUtils.clamp(p.t, 0, 1);
  const t0 = Math.max(0, t - eps), t1 = Math.min(1, t + eps);
  toScreen(anchorAt(p, t0, _a), _sa); toScreen(anchorAt(p, t1, _b), _sb);
  const ds = _sb.clone().sub(_sa).divideScalar(t1 - t0);
  const L = ds.length();
  let dtProj = 0;
  if (L > 1e-3) dtProj = (dx * ds.x + dy * ds.y) / (L * L);
  // when the rail points at the viewer, pulling down = towards you
  const dir3 = _b.clone().sub(_a).normalize();
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const towards = dir3.dot(camDir) < 0 ? 1 : -1;
  const dtFallback = (dy * towards) / (innerHeight * 0.55);
  const w = THREE.MathUtils.smoothstep(L, 90, 260);
  let d = w * dtProj + (1 - w) * dtFallback;
  if (p.t < 0.035 && d > 0) d *= 0.55; // a little bite before the part lets go of its seat
  const blocker = blockerFor(p, Math.sign(d));
  let nt = p.t + d;
  if (blocker) {
    if (!drag.blocked) { drag.blocked = blocker; sound.bump(); warn(blocker.text, blocker.id); }
    const lim = 0.035, base = drag.t0;
    nt = base + THREE.MathUtils.clamp(nt - base, -lim, lim);
    nt = base + (nt - base) * 0.8;
  }
  if (nt > 1) nt = 1 + Math.min(0.04, (nt - 1) * 0.25);
  if (nt < 0) nt = Math.max(-0.02, nt * 0.25);
  const now = performance.now();
  const dtime = Math.max(1, now - drag.lastTime) / 1000;
  const inst = (nt - p.t) / dtime;
  drag.vel = drag.vel * 0.6 + inst * 0.4;
  drag.lastTime = now;
  p.t = nt;
  sound.slide(Math.min(1, Math.abs(inst) * 0.9));
}

function warn(text, id) {
  warnText = text; warnUntil = performance.now() + 1700;
  flashId = id; flashUntil = performance.now() + 900;
}

// keyboard: typed keys go to the Mac while its screen has focus
window.addEventListener('keydown', (e) => {
  if (scr.focused && crtScreen.usable) {
    const k = e.key === 'Return' ? 'Enter' : e.key;
    if (['Shift', 'Control', 'Meta', 'Alt', 'CapsLock'].includes(k)) return;
    if (crtScreen.key(k, mods(e)) || (k.length === 1 && !e.metaKey && !e.ctrlKey) || k === 'Backspace' || k === 'Tab') e.preventDefault();
    return;
  }
  if (e.key === 'Escape') select(null);
});

// ------------------------------------------------------------------ take apart / reassemble
ui.toggle.addEventListener('click', () => {
  sound.unlock();
  if (!ready || sequence) return;
  const anyOut = Object.values(parts).some((p) => p.t > 0.02);
  select(null);
  const order = anyOut ? ORDER_IN : ORDER_OUT;
  const target = anyOut ? 0 : 1;
  const now = performance.now();
  let i = 0;
  for (const id of order) {
    const p = parts[id];
    if (Math.abs(p.t - target) < 0.01) continue;
    p.delay = now + i * (REDUCED ? 60 : 420);
    p.pending = target;
    i++;
  }
  sequence = { until: now + i * (REDUCED ? 60 : 420) + 1400 };
  ui.toggle.disabled = true;
  focus.mode = 'model'; scr.focused = false;
  flyTo(anyOut ? VIEWS.home : VIEWS.apart, 1.8);
});

function updateParts(dt) {
  const now = performance.now();
  for (const p of Object.values(parts)) {
    if (p.pending !== undefined && now >= p.delay) { p.target = p.pending; p.pending = undefined; p.k = 70; p.v = 0; }
    if (p.drag) { applyPart(p); continue; }
    const steps = 4, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const c = 2 * Math.sqrt(p.k) * (REDUCED ? 1.4 : 1.0);
      const a = -p.k * (p.t - p.target) - c * p.v;
      p.v += a * h; p.t += p.v * h;
    }
    if (Math.abs(p.t - p.target) < 1e-4 && Math.abs(p.v) < 1e-3) { p.t = p.target; p.v = 0; }
    applyPart(p);
    const homeNow = p.t < 0.004;
    if (homeNow && p.wasAway) sound.snap();
    p.wasAway = !homeNow && p.t > 0.02 ? true : (homeNow ? false : p.wasAway);
  }
  if (sequence && now > sequence.until && Object.values(parts).every((p) => p.pending === undefined && Math.abs(p.t - p.target) < 0.002)) {
    sequence = null; ui.toggle.disabled = false;
  }
  const anyOut = Object.values(parts).some((p) => p.t > 0.5 || p.target > 0.5);
  const label = anyOut ? 'Reassemble' : 'Take Apart';
  if (ui.toggle.textContent !== label) ui.toggle.textContent = label;
}

// ------------------------------------------------------------------ the parked case turns see-through only while it hides something
const _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _t = new THREE.Vector3(), _bb = new THREE.Box3(), _bc = new THREE.Vector3();
function segmentHitsCase(a, b) {
  // segment a->b in the case's local frame against its five closed sides (shrunk a little)
  const B = caseBox, s = 0.03;
  const min = [B.min.x, B.min.y, B.min.z], max = [B.max.x, B.max.y, B.max.z];
  const pa = [a.x, a.y, a.z], pb = [b.x, b.y, b.z];
  const faces = [[0, min[0]], [0, max[0]], [1, min[1]], [1, max[1]], [2, min[2]]];
  for (const [ax, v] of faces) {
    const da = pa[ax] - v, db = pb[ax] - v;
    if ((da > 0) === (db > 0)) continue;
    const t = da / (da - db);
    let inside = true;
    for (let k = 0; k < 3; k++) {
      if (k === ax) continue;
      const q = pa[k] + (pb[k] - pa[k]) * t, lo = min[k], hi = max[k], m = (hi - lo) * s;
      if (q < lo + m || q > hi - m) { inside = false; break; }
    }
    if (inside) return true;
  }
  return false;
}
function caseHidesSomething() {
  const p = parts.rearCase;
  _inv.copy(p.group.matrixWorld).invert();
  _o.copy(camera.position).applyMatrix4(_inv);
  if (caseBox.containsPoint(_o)) return true; // looking out through the open front
  let blocked = 0;
  const targets = [...INTERNAL.map((id) => parts[id].group), statics.bezel, statics.keyboard, statics.mouse, statics.chassis];
  for (const g of targets) {
    _bb.setFromObject(g); _bb.getCenter(_bc);
    for (let i = 0; i < 9; i++) {
      if (i === 0) _t.copy(_bc);
      else _t.set(i & 1 ? _bb.max.x : _bb.min.x, i & 2 ? _bb.max.y : _bb.min.y, i & 4 ? _bb.max.z : _bb.min.z).lerp(_bc, 0.35);
      _t.applyMatrix4(_inv);
      if (segmentHitsCase(_o, _t) && ++blocked >= 2) return true;
    }
  }
  return false;
}
function updateOcclusion(dt) {
  const p = parts.rearCase;
  if (!p.fadeMats || !caseBox) return;
  let want = 1;
  if (p.t > 0.3 && !p.drag && selectedId !== 'rearCase' && caseHidesSomething()) want = 0.12;
  p.fade = THREE.MathUtils.damp(p.fade, want, 7, dt);
  const solid = p.fade > 0.985;
  for (const m of p.fadeMats) {
    m.opacity = p.fade; m.depthWrite = solid;
    const side = solid ? m.userData.baseSide : THREE.FrontSide;
    if (m.side !== side || m.transparent === solid) { m.side = side; m.transparent = !solid; m.needsUpdate = true; }
  }
  // while see-through, only the outer skin is drawn so the layers don't stack into a solid look
  const ghost = p.fade < 0.9;
  if (ghost !== p.ghost) { p.ghost = ghost; p.group.traverse((o) => { if (o.isMesh && o.material.userData.inner) o.visible = !ghost; }); }
  const cast = p.fade > 0.5;
  if (cast !== p.casting) { p.casting = cast; p.group.traverse((o) => { if (o.isMesh) o.castShadow = cast; }); }
}

// ------------------------------------------------------------------ power & screen
let wasPowered = false;
let heat = 0;
function updatePower(dt) {
  const powered = ['crt', 'logic', 'analog'].every((id) => parts[id].t < 0.004);
  if (powered && !wasPowered) {
    const settled = ['crt', 'logic', 'analog'].every((id) => !parts[id].drag && Math.abs(parts[id].v) < 0.05);
    if (settled) { crtScreen.powerOn(); wasPowered = true; }
  } else if (!powered && wasPowered) { crtScreen.powerOff(); wasPowered = false; scr.focused = false; }
  heat = THREE.MathUtils.damp(heat, wasPowered ? 1 : 0, wasPowered ? 1.2 : 2.5, dt);
  PM.heater.opacity = 0.9 * heat;
  crtInfo.glowLight.intensity = 0.9 * heat;
  MAT.screen.emissiveIntensity = crtScreen.update(dt);
}

// ------------------------------------------------------------------ hover label
let tagTimer = 0;
function tagContent(id) {
  const info = parts[id] || { ...PART_INFO[id] };
  let act = '';
  if (parts[id]) {
    if (selectedId !== id) act = TOUCH ? 'Double-tap to select' : 'Double-click to select';
    else act = parts[id].t > 0.5 ? 'Drag to put it back' : 'Drag to pull it out';
  }
  return { name: info.name, desc: info.desc, act };
}
function renderTag(id, x, y, warnMsg) {
  const c = tagContent(id);
  ui.tag.querySelector('.name').textContent = c.name;
  ui.tag.querySelector('.desc').textContent = c.desc;
  ui.tag.querySelector('.act').textContent = warnMsg || c.act;
  ui.tag.classList.toggle('warn', !!warnMsg);
  const r = ui.tag.getBoundingClientRect();
  const px = Math.min(innerWidth - r.width - 10, x + 16), py = Math.min(innerHeight - r.height - 10, y + 16);
  ui.tag.style.left = `${Math.max(10, px)}px`; ui.tag.style.top = `${Math.max(10, py)}px`;
  ui.tag.classList.add('show');
}
function showTag(x, y, id) { tagTimer = performance.now() + 2400; renderTag(id, x, y); ui.tag.dataset.id = id; ui.tag.dataset.x = x; ui.tag.dataset.y = y; }
function hideTag() { ui.tag.classList.remove('show'); tagTimer = 0; }

function updateHover() {
  const now = performance.now();
  if (!TOUCH && pointer.inside && !drag && !scr.dragging) {
    if (pointer.moved && !(downInfo && downInfo.moved)) {
      pointer.moved = false;
      const hit = scr.over || scr.hoverSmall ? null : pick(pointer.x, pointer.y);
      hoverId = hit ? hit.id : null;
    }
  } else if (!TOUCH && !pointer.inside) hoverId = null;
  if (downInfo && downInfo.moved && hoverId && !drag) hoverId = null;
  canvas.classList.toggle('pointing', !!(hoverId && parts[hoverId]) || !!scr.hoverSmall);
  canvas.classList.toggle('mac', scr.over || scr.dragging);
  const flash = flashId && now < flashUntil ? flashId : null;
  const hov = flash || (hoverId && parts[hoverId] && hoverId !== selectedId ? hoverId : null);
  hoverPass.visibleEdgeColor.set(flash ? '#ff6a3d' : '#ffffff');
  hoverPass.selectedObjects = hov ? [parts[hov].group] : [];
  const warnMsg = now < warnUntil ? warnText : '';
  if (drag) renderTag(drag.id, pointer.x, pointer.y, warnMsg);
  else if (!TOUCH && scr.hoverSmall && pointer.inside) renderTag('screen', pointer.x, pointer.y, '');
  else if (!TOUCH && hoverId && pointer.inside && !(downInfo && downInfo.moved)) renderTag(hoverId, pointer.x, pointer.y, warnMsg);
  else if (now < tagTimer && ui.tag.dataset.id) renderTag(ui.tag.dataset.id, +ui.tag.dataset.x, +ui.tag.dataset.y, warnMsg);
  else ui.tag.classList.remove('show');
}


// ------------------------------------------------------------------ resize & loop
function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  hoverPass.setSize(w, h); selectPass.setSize(w, h);
}
addEventListener('resize', resize);

let last = performance.now();
const TEST = /[?&]test\b/.test(location.search);
function frame(now, manualDt) {
  const dt = manualDt ?? Math.min(0.05, (now - last) / 1000);
  last = now;
  if (ready) {
    updateParts(dt);
    for (const c of cables) c.update(dt);
    if (mouseCord) { const plugged = parts.rearCase.t < 0.004 && parts.logic.t < 0.004; if (mouseCord.visible !== plugged) { mouseCord.visible = plugged; sound.click(); } }
    updatePower(dt);
    updateCentering(dt);
    updateOcclusion(dt);
    updateHover();
  }
  updateFlight(dt);
  controls.update(dt);
  composer.render(dt);
  if (!TEST) requestAnimationFrame(frame);
}
if (!TEST) requestAnimationFrame(frame);
init().catch((err) => console.error(err));

// test hook for automated checks (only with ?test)
if (TEST) window.__mac = { step(n = 1, dt = 1 / 30) { const t0 = performance.now(); for (let i = 0; i < n; i++) frame(performance.now(), dt); return performance.now() - t0; }, parts, select, hover(id) { hoverId = id; }, crtScreen, warn, camera, controls, flyTo, flyToScreen, VIEWS, focus, get ready() { return ready; }, setT(id, t) { parts[id].t = t; parts[id].target = t; parts[id].v = 0; }, screenAt, pick, get fade() { return parts.rearCase.fade; } };
