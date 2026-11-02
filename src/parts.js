// Procedural interior of the Macintosh 128K, laid out from teardown photographs.
// Units: centimetres. World frame: Y up, the screen faces +Z, the analog board sits on the left (-X).
// Small passives are approximations; boards, chips, connectors and the CRT follow the real machine.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- helpers
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const RB = (w, h, d, r, s = 1) => new RoundedBoxGeometry(w, h, d, s, r);
const CY = (rt, rb, h, seg = 20, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

// Kit batches many small pieces into one mesh per material, so the interior costs few draw calls.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
class Kit {
  constructor() { this.bins = new Map(); }
  put(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    return this.putM(geo, mat, _m);
  }
  putM(geo, mat, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(m);
    if (!this.bins.has(mat)) this.bins.set(mat, []);
    this.bins.get(mat).push(g);
    return g;
  }
  build(parent, shadow = true) {
    const out = [];
    for (const [mat, list] of this.bins) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = shadow && !mat.transparent; mesh.receiveShadow = true;
      parent.add(mesh); out.push(mesh);
    }
    this.bins.clear();
    return out;
  }
}
// axis-aligned box from world extents
function box(k, mat, x0, x1, y0, y1, z0, z1, r = 0) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const rr = Math.min(r, w / 2, h / 2, d / 2) * 0.98;
  return k.put(rr > 0.005 ? RB(w, h, d, rr) : B(w, h, d), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
const cylX = (k, mat, r, len, x, y, z, seg = 20) => k.put(CY(r, r, len, seg), mat, x, y, z, 0, 0, Math.PI / 2);
const cylY = (k, mat, r, len, x, y, z, seg = 20) => k.put(CY(r, r, len, seg), mat, x, y, z);
const cylZ = (k, mat, r, len, x, y, z, seg = 20) => k.put(CY(r, r, len, seg), mat, x, y, z, Math.PI / 2, 0, 0);
function tube(k, mat, pts, r, seg = 40, radial = 8) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'centripetal');
  return k.put(new THREE.TubeGeometry(c, seg, r, radial, false), mat);
}

function rrPath(w, h, r, path = new THREE.Shape(), cx = 0, cy = 0) {
  const x = cx - w / 2, y = cy - h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  return path;
}
// D-sub opening: rounded trapezoid, wide edge on top
function dPath(cx, cy, top, bot, h, r, path = new THREE.Path()) {
  const pts = [[cx - top / 2, cy + h / 2], [cx + top / 2, cy + h / 2], [cx + bot / 2, cy - h / 2], [cx - bot / 2, cy - h / 2]];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i], [ax, ay] = pts[(i + n - 1) % n], [bx, by] = pts[(i + 1) % n];
    const la = Math.hypot(ax - px, ay - py), lb = Math.hypot(bx - px, by - py);
    const p0 = [px + ((ax - px) / la) * r, py + ((ay - py) / la) * r], p1 = [px + ((bx - px) / lb) * r, py + ((by - py) / lb) * r];
    if (i === 0) path.moveTo(...p0); else path.lineTo(...p0);
    path.quadraticCurveTo(px, py, ...p1);
  }
  path.closePath();
  return path;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- materials
export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    steel: std({ color: 0xa9aeb3, metalness: 0.85, roughness: 0.42 }),
    zinc: std({ color: 0xc2c6c8, metalness: 0.8, roughness: 0.4 }),
    galv: std({ color: 0xb7bcbf, metalness: 0.7, roughness: 0.5 }),
    aluminum: std({ color: 0xc9cdd1, metalness: 0.9, roughness: 0.28 }),
    brass: std({ color: 0xb4955c, metalness: 0.9, roughness: 0.34 }),
    pin: std({ color: 0xd6d8da, metalness: 1, roughness: 0.28 }),
    copper: std({ color: 0xc47a43, metalness: 1, roughness: 0.3 }),
    chip: std({ color: 0x19191a, roughness: 0.5 }),
    black: std({ color: 0x161617, roughness: 0.58 }),
    rubber: std({ color: 0x0e0e0f, roughness: 0.85 }),
    epoxy: std({ color: 0x1b1a19, roughness: 0.32 }),
    aquadag: std({ color: 0x1e1f21, roughness: 0.78, metalness: 0.15 }),
    whiteConn: std({ color: 0xeee9dc, roughness: 0.55 }),
    grayConn: std({ color: 0x8d9092, roughness: 0.5 }),
    redWire: std({ color: 0xb3261e, roughness: 0.4 }),
    capBlue: std({ color: 0x2c4f8c, roughness: 0.38 }),
    capBlack: std({ color: 0x1b1b21, roughness: 0.36 }),
    capBrown: std({ color: 0x6b4a2c, roughness: 0.45 }),
    ceramic: std({ color: 0xd8a434, roughness: 0.48 }),
    ceramicBlue: std({ color: 0x3d72b4, roughness: 0.45 }),
    tantalum: std({ color: 0xd99a2b, roughness: 0.4 }),
    resistor: std({ color: 0xcdb98e, roughness: 0.5 }),
    filmYellow: std({ color: 0xe0b83c, roughness: 0.45 }),
    redBox: std({ color: 0xb02a22, roughness: 0.42 }),
    orange: std({ color: 0xd9782a, roughness: 0.45 }),
    tape: std({ color: 0xd98b2c, roughness: 0.6 }),
    ferrite: std({ color: 0x3a3b3d, roughness: 0.7, metalness: 0.25 }),
    trim: std({ color: 0x2f64ba, roughness: 0.42 }),
    battery: std({ color: 0x23272d, roughness: 0.4, metalness: 0.3 }),
    sheet: std({ color: 0x8d9093, roughness: 0.75 }),
    glassNeck: new THREE.MeshPhysicalMaterial({ color: 0xdfe9e2, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, clearcoat: 1 }),
    glassEdge: new THREE.MeshPhysicalMaterial({ color: 0x24302b, roughness: 0.1, metalness: 0.1, clearcoat: 1 }),
    pcbLogicEdge: std({ color: 0x1d5a3c, roughness: 0.6 }),
    pcbAnalogEdge: std({ color: 0x2f5238, roughness: 0.6 }),
    ribbon: std({ color: 0xa9abad, roughness: 0.55, side: THREE.DoubleSide }),
    heater: new THREE.MeshBasicMaterial({ color: 0xff7d2e, transparent: true, opacity: 0, depthWrite: false }),
  };
}

// ---------------------------------------------------------------- canvas textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";
const SANS = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// solder side of a board: copper runs and tinned joints
function solderTex(base, seed, holes = [], w = 1024, h = 1024) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const r = rng(seed);
    c.lineCap = 'round';
    for (let i = 0; i < 240; i++) {
      c.strokeStyle = 'rgba(150,160,120,0.35)'; c.lineWidth = 2 + r() * 6;
      c.beginPath(); let x = r() * w, y = r() * h; c.moveTo(x, y);
      for (let k = 0; k < 3; k++) { if (k % 2) y += (r() - 0.5) * 220; else x += (r() - 0.5) * 220; c.lineTo(x, y); }
      c.stroke();
    }
    for (let i = 0; i < 1100; i++) {
      const x = r() * w, y = r() * h, rad = 2.5 + r() * 3.5;
      c.fillStyle = 'rgba(205,207,200,0.9)'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.35, 0, Math.PI * 2); c.fill();
    }
    for (const [x, y, rad] of holes) { c.fillStyle = '#0b0c0c'; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill(); }
  });
}

// ---------------------------------------------------------------- DIP chips
// chips: {x, z, pins, len, wid, axis:'x'|'z', label, sub}
function buildChips(parent, k, M, chips, boardTop) {
  const cols = 4, rows = 16, cw = 256, ch = 64;
  const atlas = canvasTex(cols * cw, rows * ch, (g) => {
    chips.forEach((c, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.fillStyle = '#1b1b1c'; g.fillRect(x, y, cw, ch);
      g.fillStyle = '#cfcfca';
      g.font = `600 ${c.sub ? 21 : 25}px ${MONO}`;
      g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(c.label, x + cw / 2, y + (c.sub ? 23 : ch / 2));
      if (c.sub) { g.font = `500 16px ${MONO}`; g.fillStyle = '#a3a39e'; g.fillText(c.sub, x + cw / 2, y + 46); }
      g.beginPath(); g.arc(x + 12, y + ch / 2, 7, -Math.PI / 2, Math.PI / 2); g.fillStyle = '#0b0b0b'; g.fill();
    });
  });
  const labels = [];
  const h = 0.34, lift = 0.06, yC = boardTop + lift + h / 2;
  const pinGeo = B(0.05, 0.3, 0.1);
  chips.forEach((c, i) => {
    const rotY = c.axis === 'z' ? Math.PI / 2 : 0;
    k.put(B(c.len, h, c.wid), M.chip, c.x, yC, c.z, 0, rotY, 0);
    const lab = new THREE.PlaneGeometry(c.len * 0.9, c.wid * 0.72);
    const uv = lab.attributes.uv;
    const col = i % cols, row = Math.floor(i / cols);
    for (let j = 0; j < uv.count; j++) uv.setXY(j, (col + uv.getX(j)) / cols, 1 - (row + 1 - uv.getY(j)) / rows);
    lab.rotateX(-Math.PI / 2); lab.rotateY(rotY); lab.translate(c.x, yC + h / 2 + 0.003, c.z);
    labels.push(lab);
    const n = c.pins / 2, pitch = 0.254;
    for (let j = 0; j < n; j++) {
      const along = (j - (n - 1) / 2) * pitch;
      for (const side of [-1, 1]) {
        const across = side * (c.wid / 2 + 0.03);
        if (c.axis === 'z') k.put(pinGeo, M.pin, c.x + across, boardTop + 0.15, c.z + along);
        else k.put(pinGeo, M.pin, c.x + along, boardTop + 0.15, c.z + across, 0, Math.PI / 2, 0);
      }
    }
  });
  const labelMesh = new THREE.Mesh(mergeGeometries(labels), new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.5 }));
  labelMesh.receiveShadow = true;
  parent.add(labelMesh);
}

// ---------------------------------------------------------------- CRT
// Local frame: origin at the face panel centre, +Z out of the screen.
export const CRT_FRAME = { position: new THREE.Vector3(0, 23.44, 11.0), tilt: -4.8 * Math.PI / 180 };
const FUNNEL = { z0: -2.05, z1: -10.6, W: 9.85, H: 7.55, rN: 1.22 };
const ANODE = { s: 0.3, a: (22 / 180) * Math.PI }; // the anode button sits on the right (+X) side of the funnel
function funnelAt(s, a) {
  const f = Math.pow(1 - Math.pow(s, 1.25), 1.9);
  const w = FUNNEL.rN + (FUNNEL.W - FUNNEL.rN) * f, h = FUNNEL.rN + (FUNNEL.H - FUNNEL.rN) * f;
  const n = 2 + 6 * Math.pow(1 - s, 1.5);
  const c = Math.cos(a), sn = Math.sin(a);
  return new THREE.Vector3(w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n), FUNNEL.z0 + (FUNNEL.z1 - FUNNEL.z0) * s);
}
function funnelNormal(s, a) {
  const e = 1e-3, p = funnelAt(s, a);
  const ds = funnelAt(s + e, a).sub(funnelAt(s - e, a));
  const da = funnelAt(s, a + e).sub(funnelAt(s, a - e));
  const n = new THREE.Vector3().crossVectors(ds, da).normalize();
  if (n.dot(new THREE.Vector3(p.x, p.y, 0)) < 0) n.negate();
  return n;
}
function funnelGeometry() {
  const segs = 72, rings = 32, pos = [], idx = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < segs; j++) { const v = funnelAt(i / rings, (j / segs) * Math.PI * 2); pos.push(v.x, v.y, v.z); }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = i * segs + ((j + 1) % segs), c = (i + 1) * segs + j, d = (i + 1) * segs + ((j + 1) % segs);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function lathe(profile, seg = 48) { // profile: [r, z] pairs, lathed around local Z
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, -z)), seg);
  g.rotateX(-Math.PI / 2);
  return g;
}
// CRT mounting ears, local coordinates (kept inside |x| <= 11 so they clear the analog board)
export const CRT_EARS = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => ({ sx, sy, c: new THREE.Vector3(sx * 9.85, sy * 7.64, -1.45), hole: new THREE.Vector3(sx * 10.27, sy * 8.06, -1.45) }));

export function buildCRT(M) {
  const g = new THREE.Group();
  const k = new Kit();
  // glass face panel behind the visible face
  const panel = new THREE.ExtrudeGeometry(rrPath(20.0, 15.4, 2.2), { depth: 1.4, bevelEnabled: false, curveSegments: 6 });
  panel.translate(0, 0, -2.1);
  k.put(panel, M.glassEdge);
  // brass implosion band with its buckle at the bottom
  const bandS = rrPath(20.36, 15.76, 2.38); bandS.holes.push(rrPath(19.98, 15.38, 2.2, new THREE.Path()));
  const band = new THREE.ExtrudeGeometry(bandS, { depth: 1.15, bevelEnabled: false, curveSegments: 8 });
  band.translate(0, 0, -2.0);
  k.put(band, M.brass);
  box(k, M.brass, -1.1, 1.1, -8.02, -7.82, -1.95, -0.9, 0.05);
  cylY(k, M.zinc, 0.2, 0.5, -0.6, -8.1, -1.42, 12); cylY(k, M.zinc, 0.2, 0.5, 0.6, -8.1, -1.42, 12);
  // mounting ears and their screws (the screws go into bosses on the bezel)
  for (const e of CRT_EARS) {
    k.put(RB(2.0, 1.1, 0.16, 0.07), M.brass, e.c.x, e.c.y, e.c.z, 0, 0, Math.atan2(e.sy, e.sx));
    cylZ(k, M.zinc, 0.27, 0.16, e.hole.x, e.hole.y, -1.62, 16);
    k.put(B(0.36, 0.06, 0.04), M.black, e.hole.x, e.hole.y, -1.71, 0, 0, Math.PI / 4);
  }
  // funnel with its graphite (aquadag) coating
  k.put(funnelGeometry(), M.aquadag);
  // ground braid stretched across the coating, sprung to the lower ears
  const braid = [];
  for (let i = 0; i <= 24; i++) { const a = THREE.MathUtils.degToRad(200 + (140 * i) / 24); braid.push(funnelAt(0.16, a).addScaledVector(funnelNormal(0.16, a), 0.06)); }
  braid.unshift(new THREE.Vector3(-9.2, -7.1, -1.7)); braid.push(new THREE.Vector3(9.2, -7.1, -1.7));
  tube(k, M.pin, braid, 0.07, 80, 6);
  for (const sx of [-1, 1]) { // coil springs at both ends
    const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 14; pts.push(new THREE.Vector3(sx * (9.25 - t * 0.9), -7.15 + 0.12 * Math.cos(a) - t * 0.15, -1.72 + 0.12 * Math.sin(a) - t * 0.2)); }
    tube(k, M.steel, pts, 0.025, 120, 4);
  }
  // anode button on the right side of the funnel
  const anode = funnelAt(ANODE.s, ANODE.a), an = funnelNormal(ANODE.s, ANODE.a);
  const ringGeo = new THREE.TorusGeometry(0.32, 0.07, 8, 20);
  ringGeo.lookAt(an); ringGeo.translate(anode.x, anode.y, anode.z);
  k.put(ringGeo, M.zinc);
  // deflection yoke: copper windings between black flanges, ring clamp at the rear
  k.put(lathe([[4.3, -7.55], [4.15, -8.2], [3.55, -9.4], [3.0, -10.6], [2.7, -11.6], [1.32, -11.6], [1.32, -10.6], [1.6, -9.6], [2.35, -8.3], [3.1, -7.55], [4.3, -7.55]]), M.copper);
  k.put(lathe([[4.5, -7.35], [4.5, -7.75], [3.05, -7.75], [3.05, -7.35], [4.5, -7.35]]), M.black);
  k.put(lathe([[2.95, -11.45], [2.95, -12.05], [1.3, -12.05], [1.3, -11.45], [2.95, -11.45]]), M.black);
  k.put(lathe([[1.42, -12.05], [1.42, -12.75], [1.27, -12.75], [1.27, -12.05], [1.42, -12.05]], 28), M.zinc);
  box(k, M.zinc, 1.25, 1.95, -0.22, 0.22, -12.7, -12.1); cylX(k, M.zinc, 0.12, 1.0, 1.95, 0, -12.4, 10);
  // yoke terminal block and its lead (top left of the yoke)
  k.put(RB(1.1, 0.65, 0.8, 0.08), M.black, -2.35, 2.85, -9.4, 0, 0, 0.62);
  // centering magnets behind the yoke
  for (const z of [-13.25, -13.7]) {
    k.put(new THREE.TorusGeometry(1.56, 0.12, 8, 36), M.black, 0, 0, z);
    k.put(B(0.5, 0.9, 0.16), M.black, 1.55, 0.35, z, 0, 0, 0.4);
  }
  // neck: glass, electron gun, getter
  const neck = new THREE.Mesh(CY(1.22, 1.22, 7.9, 40, true), M.glassNeck);
  neck.position.set(0, 0, -16.35); neck.rotation.x = Math.PI / 2; g.add(neck);
  const neckEnd = new THREE.Mesh(CY(1.22, 1.22, 0.12, 32), M.glassNeck);
  neckEnd.position.set(0, 0, -20.32); neckEnd.rotation.x = Math.PI / 2; g.add(neckEnd);
  cylZ(k, M.zinc, 0.5, 0.6, 0, 0, -18.9, 20);
  cylZ(k, M.zinc, 0.56, 0.18, 0, 0, -18.35, 20);
  cylZ(k, M.zinc, 0.7, 2.2, 0, 0, -16.9, 24);
  cylZ(k, M.zinc, 0.7, 1.4, 0, 0, -14.9, 24);
  for (const sx of [-1, 1]) box(k, M.whiteConn, sx * 0.86 - 0.08, sx * 0.86 + 0.08, -0.11, 0.11, -19.3, -13.9);
  k.put(new THREE.TorusGeometry(0.62, 0.08, 8, 24), M.zinc, 0, 0, -13.95);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; cylZ(k, M.pin, 0.045, 0.8, Math.cos(a) * 0.78, Math.sin(a) * 0.78, -20.7, 8); }
  // tube socket on the end of the neck (plain socket with its wires, no circuit board)
  k.put(lathe([[1.5, -20.45], [1.55, -20.6], [1.55, -21.35], [1.3, -21.55], [0.5, -21.6], [0.5, -20.45], [1.5, -20.45]], 36), M.whiteConn);
  box(k, M.whiteConn, -0.65, 0.65, -1.55, -0.6, -21.45, -20.7, 0.08);
  // caution sticker on the top of the funnel
  const sticker = canvasTex(512, 256, (c) => {
    c.fillStyle = '#f1efe6'; c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#c42c22'; c.fillRect(0, 0, 512, 70);
    c.fillStyle = '#ffffff'; c.font = `700 46px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('CAUTION', 256, 37);
    c.fillStyle = '#26282b'; c.font = `600 30px ${SANS}`;
    c.fillText('HIGH VOLTAGE INSIDE', 256, 120);
    c.font = `500 24px ${SANS}`;
    c.fillText('Discharge the anode', 256, 170); c.fillText('before servicing', 256, 206);
  });
  {
    const s = 0.17, a = Math.PI / 2, p = funnelAt(s, a), n = funnelNormal(s, a);
    const geo = new THREE.PlaneGeometry(3.4, 1.7);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sticker, roughness: 0.7 }));
    m.position.copy(p).addScaledVector(n, 0.03);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), n.clone().negate(), new THREE.Vector3(0, 0, 1)));
    m.rotateZ(Math.PI); m.receiveShadow = true;
    g.add(m);
  }
  k.build(g);
  // heater glow at the cathode (visible through the neck when powered)
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), M.heater);
  glow.position.set(0, 0, -19.3); g.add(glow);
  const glowLight = new THREE.PointLight(0xff8a3d, 0, 7, 2);
  glowLight.position.set(0, 0, -19.1);
  g.add(glowLight);
  return {
    group: g, glow, glowLight,
    anodeLocal: anode, anodeNormal: an,
    yokePlugLocal: new THREE.Vector3(-2.6, 3.2, -9.4),
    neckPlugLocal: new THREE.Vector3(0, -1.1, -21.5),
  };
}

// Skirt that closes the gap between the curved face glass (from the model) and the panel behind it.
export function buildGlassSkirt(glassGeo, M, backZ = -0.72) {
  const pos = glassGeo.attributes.position, idx = glassGeo.index;
  const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const count = new Map(), verts = new Map();
  for (let f = 0; f < idx.count; f += 3) for (let j = 0; j < 3; j++) {
    const a = idx.getX(f + j), b = idx.getX(f + ((j + 1) % 3));
    const ka = key(a), kb = key(b), ek = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    count.set(ek, (count.get(ek) || 0) + 1); verts.set(ek, [a, b]);
  }
  const out = [];
  for (const [ek, n] of count) {
    if (n !== 1) continue;
    const [a, b] = verts.get(ek);
    const A = new THREE.Vector3().fromBufferAttribute(pos, a), Bv = new THREE.Vector3().fromBufferAttribute(pos, b);
    const A2 = A.clone(); A2.z = backZ; const B2 = Bv.clone(); B2.z = backZ;
    out.push(A, Bv, B2, A, B2, A2);
  }
  const g = new THREE.BufferGeometry().setFromPoints(out);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.glassEdge.clone());
  m.material.side = THREE.DoubleSide;
  return m;
}

// ---------------------------------------------------------------- analog board (power supply + sweep, part 630-0102)
const XA = -11.1; // component face, components point inward (+X)
const AN = { z0: -13.0, z1: 10.5, y0: 4.4, y1: 30.5 };
const AN_OUTLINE = [[-13.0, 4.4], [10.5, 4.4], [10.5, 7.8], [9.1, 7.8], [9.1, 30.5], [-11.3, 30.5], [-13.0, 28.4]]; // (z, y)

export function buildAnalogBoard(M) {
  const g = new THREE.Group();
  const k = new Kit();
  const TW = 1600, TH = Math.round((1600 * (AN.y1 - AN.y0)) / (AN.z1 - AN.z0));
  const tz = (z) => ((AN.z1 - z) / (AN.z1 - AN.z0)) * TW, ty = (y) => ((AN.y1 - y) / (AN.y1 - AN.y0)) * TH;
  const S = TW / (AN.z1 - AN.z0); // px per cm
  const tex = canvasTex(TW, TH, (c) => {
    c.fillStyle = '#365e40'; c.fillRect(0, 0, TW, TH);
    // wide copper pours under the solder mask
    c.lineCap = 'round'; c.lineJoin = 'round';
    const r = rng(11);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = r() < 0.5 ? 'rgba(98,132,84,0.55)' : 'rgba(76,112,70,0.6)'; c.lineWidth = 4 + r() * 16;
      c.beginPath(); let x = r() * TW, y = r() * TH; c.moveTo(x, y);
      for (let j = 0; j < 3; j++) { if (j % 2) y += (r() - 0.5) * 320; else x += (r() - 0.5) * 320; c.lineTo(x, y); }
      c.stroke();
    }
    c.strokeStyle = '#eef0e4'; c.fillStyle = '#eef0e4'; c.lineWidth = 3;
    const outline = (z0, z1, y0, y1, label, dx = 6, dy = -10) => {
      const x = tz(Math.max(z0, z1)), y = ty(Math.max(y0, y1));
      c.strokeRect(x, y, Math.abs(z1 - z0) * S, Math.abs(y1 - y0) * S);
      if (label) { c.font = `600 22px ${MONO}`; c.fillText(label, x + dx, y + dy); }
    };
    const ring = (z, y, rad, label) => { c.beginPath(); c.arc(tz(z), ty(y), rad * S, 0, Math.PI * 2); c.stroke(); if (label) { c.font = `600 22px ${MONO}`; c.fillText(label, tz(z) + rad * S + 6, ty(y) - rad * S); } };
    ring(5.1, 11.9, 2.25, 'SPKR');
    outline(-3.2, 0.7, 9.3, 12.8, 'T1');
    outline(-6.6, -4.4, 9.8, 13.6, 'C1 C2');
    outline(-7.3, -5.1, 14.2, 15.4, 'C3');
    outline(-11.0, -9.0, 8.6, 10.6, 'L1');
    outline(-11.6, -9.6, 7.1, 8.1, 'F1');
    outline(-12.95, -10.85, 18.95, 26.25, 'BT1', 6, 26);
    outline(-7.9, -4.5, 26.9, 30.3, 'T2 FLYBACK', -40, -10);
    outline(0.1, 2.8, 14.0, 17.2, 'Q1'); outline(-3.0, -0.2, 14.0, 17.2, 'Q2');
    outline(0.5, 1.3, 19.0, 23.2, 'P1', -14, 30);
    outline(-8.5, -6.1, 21.7, 22.5, 'P2', -60, 20);
    outline(2.3, 3.9, 27.0, 27.8, 'P3');
    outline(-8.3, -7.3, 24.3, 25.3, 'R40'); outline(-8.6, -7.6, 26.2, 27.2, 'R41');
    // warnings and part number
    c.font = `700 34px ${SANS}`; c.textAlign = 'left';
    c.fillText('DANGER! HIGH VOLTAGES ON COMPONENTS', tz(3.4), ty(5.35));
    c.font = `700 30px ${SANS}`;
    c.fillText('MACINTOSH SWEEP/POWER SUPPLY', tz(8.2), ty(24.4));
    c.font = `600 28px ${MONO}`;
    c.fillText('630-0102  REV C', tz(8.2), ty(23.3));
    c.font = `600 22px ${MONO}`;
    c.fillText('VERT', tz(-6.6), ty(23.9)); c.fillText('HORIZ', tz(-6.9), ty(28.1));
    c.fillText('BRIGHT', tz(10.3), ty(8.4));
    // mounting holes
    for (const [z, y] of [[-12.3, 5.2], [8.3, 5.2], [-12.3, 27.6], [8.3, 29.6], [-1.5, 29.6]]) {
      c.fillStyle = '#c9c2a2'; c.beginPath(); c.arc(tz(z), ty(y), 0.32 * S, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0f1410'; c.beginPath(); c.arc(tz(z), ty(y), 0.16 * S, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#eef0e4';
    }
  });
  tex.repeat.set(1 / (AN.z1 - AN.z0), 1 / (AN.y1 - AN.y0));
  tex.offset.set(AN.z1 / (AN.z1 - AN.z0), -AN.y0 / (AN.y1 - AN.y0));
  // board slab
  const shapeF = new THREE.Shape(AN_OUTLINE.map(([z, y]) => new THREE.Vector2(-z, y)));
  const slab = new THREE.ExtrudeGeometry(shapeF, { depth: 0.16, bevelEnabled: false });
  slab.rotateY(Math.PI / 2); slab.translate(XA - 0.16, 0, 0);
  k.put(slab, M.pcbAnalogEdge);
  const face = new THREE.ShapeGeometry(shapeF); face.rotateY(Math.PI / 2); face.translate(XA + 0.002, 0, 0);
  const faceMesh = new THREE.Mesh(face, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 }));
  faceMesh.receiveShadow = true; g.add(faceMesh);
  // solder side (with the speaker grille drilled through the board)
  const SB = 1024 / (AN.z1 - AN.z0);
  const holes = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * 1.05, Math.sin((i * Math.PI) / 3) * 1.05])]
    .map(([dz, dy]) => [(5.1 + dz - AN.z0) * SB, (1 - (11.9 + dy - AN.y0) / (AN.y1 - AN.y0)) * 1024, 0.34 * SB]);
  const sTex = solderTex('#2f5236', 5, holes);
  sTex.repeat.set(1 / (AN.z1 - AN.z0), 1 / (AN.y1 - AN.y0));
  sTex.offset.set(-AN.z0 / (AN.z1 - AN.z0), -AN.y0 / (AN.y1 - AN.y0));
  const shapeB = new THREE.Shape(AN_OUTLINE.map(([z, y]) => new THREE.Vector2(z, y)));
  const back = new THREE.ShapeGeometry(shapeB); back.rotateY(-Math.PI / 2); back.translate(XA - 0.162, 0, 0);
  const backMesh = new THREE.Mesh(back, new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.5, metalness: 0.1 }));
  backMesh.receiveShadow = true; g.add(backMesh);
  // insulating shield on the solder side (part 725-0011)
  const shieldTex = canvasTex(512, 512, (c) => {
    c.fillStyle = '#7f8487'; c.fillRect(0, 0, 512, 512);
    c.fillStyle = 'rgba(30,32,34,0.75)'; c.font = `600 22px ${MONO}`; c.textAlign = 'center';
    c.fillText('P/N 725-0011', 256, 470);
  });
  const shield = new THREE.Shape(); shield.moveTo(-12.4, 5.0); shield.lineTo(8.8, 5.0); shield.lineTo(8.8, 29.8); shield.lineTo(-10.8, 29.8); shield.lineTo(-12.4, 27.8); shield.closePath();
  shield.holes.push(...holesForShield());
  const shieldGeo = new THREE.ShapeGeometry(shield); shieldGeo.rotateY(-Math.PI / 2); shieldGeo.translate(XA - 0.42, 0, 0);
  const sm = new THREE.Mesh(shieldGeo, new THREE.MeshStandardMaterial({ map: shieldTex, roughness: 0.8, side: THREE.DoubleSide }));
  shieldTex.repeat.set(1 / 21.2, 1 / 24.8); shieldTex.offset.set(12.4 / 21.2, -5 / 24.8);
  sm.castShadow = true; sm.receiveShadow = true; g.add(sm);
  for (const [z, y] of [[-12.3, 5.2], [8.3, 5.2], [-12.3, 27.6], [8.3, 29.6]]) cylX(k, M.whiteConn, 0.22, 0.26, XA - 0.29, y, z, 10);

  // helpers for parts standing on the component face (heights along +X)
  const blk = (mat, y0, y1, z0, z1, h, r = 0, lift = 0) => box(k, mat, XA + lift, XA + lift + h, y0, y1, z0, z1, r);
  const can = (mat, r, h, y, z, top = true) => { cylX(k, mat, r, h, XA + h / 2, y, z, 24); if (top) cylX(k, M.zinc, r * 0.9, 0.04, XA + h + 0.02, y, z, 24); };

  // speaker: it fires through the board, so this side shows its basket and magnet
  k.put(CY(1.05, 2.1, 0.9, 32, true), M.steel, XA + 0.45, 11.9, 5.1, 0, 0, Math.PI / 2);
  k.put(new THREE.TorusGeometry(2.1, 0.08, 6, 36), M.steel, XA + 0.05, 11.9, 5.1, 0, Math.PI / 2, 0);
  cylX(k, M.black, 0.95, 0.75, XA + 1.25, 11.9, 5.1, 28);
  cylX(k, M.zinc, 0.98, 0.1, XA + 0.87, 11.9, 5.1, 28);
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; box(k, M.steel, XA + 0.05, XA + 0.85, 11.9 + Math.sin(a) * 1.55 - 0.12, 11.9 + Math.sin(a) * 1.55 + 0.12, 5.1 + Math.cos(a) * 1.55 - 0.12, 5.1 + Math.cos(a) * 1.55 + 0.12); }
  // switching transformer in orange tape with its ferrite core showing at the ends
  blk(M.tape, 9.4, 12.7, -3.1, 0.6, 3.4, 0.25);
  blk(M.ferrite, 9.3, 12.8, -3.25, -2.85, 3.6); blk(M.ferrite, 9.3, 12.8, 0.35, 0.75, 3.6);
  blk(M.ferrite, 12.6, 12.85, -3.25, 0.75, 3.6);
  // primary filter capacitors and the line-side parts
  can(M.capBlue, 0.9, 3.0, 10.8, -5.5); can(M.capBlue, 0.9, 3.0, 12.6, -5.5);
  blk(M.redBox, 14.3, 15.3, -7.1, -5.3, 1.3, 0.12);
  blk(M.black, 8.7, 10.5, -10.8, -9.2, 0.4, 0.05);
  blk(M.ferrite, 8.85, 10.35, -10.6, -9.4, 1.9);
  cylX(k, M.copper, 0.55, 1.5, XA + 1.1, 9.6, -10.35, 18); cylX(k, M.copper, 0.55, 1.5, XA + 1.1, 9.6, -9.65, 18);
  // fuse in clips
  cylZ(k, M.glassNeck, 0.26, 1.9, XA + 0.55, 7.6, -10.6, 14);
  for (const z of [-11.45, -9.75]) { box(k, M.zinc, XA, XA + 0.85, 7.3, 7.9, z - 0.18, z + 0.18); cylZ(k, M.zinc, 0.28, 0.32, XA + 0.55, 7.6, z, 14); }
  // power inlet / switch bracket at the rear edge and their wires
  blk(M.black, 9.0, 18.3, -12.95, -12.35, 2.7, 0.06);
  tube(k, M.capBlack, [[-9.6, 11.4, -12.3], [-9.9, 10.6, -11.6], [-10.7, 10.0, -11.0], [XA + 0.2, 9.8, -10.95]], 0.09, 20, 6);
  tube(k, M.whiteConn, [[-9.2, 15.6, -12.3], [-9.6, 14.6, -11.4], [-10.6, 13.9, -10.6], [XA + 0.2, 13.4, -10.5]], 0.09, 20, 6);
  // battery holder behind the battery door, with the 4.5 V battery
  blk(M.black, 18.95, 26.25, -12.95, -10.85, 2.3, 0.12);
  blk(M.battery, 19.4, 25.8, -12.7, -11.1, 2.45, 0.15, 0.1);
  box(k, M.zinc, XA + 2.2, XA + 2.62, 21.6, 23.6, -12.3, -11.5);
  // flyback transformer: ferrite U-core, epoxy high-voltage block, focus/screen pots
  blk(M.ferrite, 26.9, 30.3, -7.95, -7.35, 3.9); blk(M.ferrite, 26.9, 30.3, -5.05, -4.45, 3.9);
  blk(M.ferrite, 26.9, 27.5, -7.95, -4.45, 3.9);
  cylX(k, M.epoxy, 1.55, 3.0, XA + 1.9, 28.6, -6.2, 32);
  cylX(k, M.epoxy, 1.2, 0.35, XA + 3.55, 28.6, -6.2, 28);
  box(k, M.black, XA + 0.6, XA + 3.2, 27.4, 28.2, -4.2, -3.6, 0.1); // HV lead sleeve exit
  // vertical and horizontal adjustment pots
  for (const [y, z] of [[24.8, -7.8], [26.7, -8.1]]) { blk(M.trim, y - 0.45, y + 0.45, z - 0.45, z + 0.45, 0.65, 0.08); cylX(k, M.whiteConn, 0.26, 0.12, XA + 0.71, y, z, 12); box(k, M.black, XA + 0.76, XA + 0.79, y - 0.2, y + 0.2, z - 0.04, z + 0.04); }
  // power transistors on finned heat sinks
  for (const z of [1.45, -1.6]) {
    blk(M.black, 14.0, 17.2, z - 1.25, z + 1.25, 0.25);
    for (let i = 0; i < 6; i++) blk(M.black, 14.0, 17.2, z - 1.2 + i * 0.47, z - 1.08 + i * 0.47, 2.4);
    blk(M.black, 17.2, 18.6, z - 0.55, z + 0.55, 0.45, 0.05); box(k, M.zinc, XA, XA + 0.12, 17.2, 18.9, z - 0.6, z + 0.6);
  }
  // connectors: P1 to the logic board (vertical), P2 to the CRT socket, P3 to the yoke
  blk(M.whiteConn, 19.0, 23.2, 0.5, 1.3, 0.9, 0.05);
  blk(M.whiteConn, 21.7, 22.5, -8.5, -6.1, 0.9, 0.05);
  blk(M.whiteConn, 27.0, 27.8, 2.3, 3.9, 0.9, 0.05);
  // electrolytics
  for (const [r, h, y, z, mat] of [[0.7, 2.0, 13.7, 0.35, M.capBlue], [0.6, 1.7, 13.9, -2.1, M.capBlack], [0.55, 1.6, 17.3, -4.6, M.capBlue], [0.5, 1.4, 19.2, -4.8, M.capBlack], [0.55, 1.6, 29.7, 3.9, M.capBlue], [0.5, 1.4, 29.9, 0.0, M.capBlack], [0.45, 1.2, 7.4, -3.0, M.capBlue], [0.65, 1.8, 20.3, -2.4, M.capBlue]]) can(mat, r, h, y, z);
  // brightness pot on the front tab; its shaft runs through the bezel to the thumbwheel
  blk(M.black, 4.8, 7.3, 9.5, 10.5, 2.5, 0.1);
  cylZ(k, M.zinc, 0.3, 1.4, -9.385, 6.06, 11.2, 14);
  // film caps, diodes and resistors where nothing tall lives
  const busy = [[2.8, 7.4, 9.6, 14.2], [-3.4, 0.9, 9.2, 12.9], [-6.7, -4.3, 9.7, 13.7], [-7.3, -5.0, 14.1, 15.5], [-11.0, -9.0, 8.5, 10.6], [-11.8, -9.5, 7.0, 8.2], [-13.0, -10.7, 18.8, 26.4], [-13.0, -12.2, 8.8, 18.5], [-8.1, -4.3, 26.7, 30.5],
    [-8.7, -7.2, 24.2, 27.4], [-3.0, 2.8, 13.8, 18.8], [0.3, 1.5, 18.8, 23.4], [-8.6, -6.0, 21.5, 22.7], [2.2, 4.0, 26.8, 28.0], [-0.5, 1.2, 12.8, 14.6], [-2.8, -1.4, 13.1, 14.7], [-5.3, -3.9, 16.6, 18.0], [-5.4, -4.2, 18.6, 19.8],
    [3.2, 4.6, 29.0, 30.5], [-0.6, 0.6, 29.2, 30.5], [-3.6, -2.4, 6.8, 8.0], [-3.1, -1.7, 19.5, 21.1], [8.9, 10.5, 4.4, 7.8], [3.0, 9.0, 4.4, 5.9], [-9.0, 3.0, 4.4, 5.9], [5.4, 9.1, 22.5, 25.0]];
  const free = (z, y, pad) => busy.every(([a, b, c, d]) => z < a - pad || z > b + pad || y < c - pad || y > d + pad);
  const r = rng(42);
  let placed = 0;
  for (let i = 0; i < 900 && placed < 70; i++) {
    const z = -12.4 + r() * 21.0, y = 6.0 + r() * 23.6;
    if (z > 8.7 || (z < -11.2 && y > 28)) continue;
    if (!free(z, y, 0.45)) continue;
    const kind = r();
    if (kind < 0.45) cylZ(k, M.resistor, 0.13, 0.72, XA + 0.2, y, z, 10);
    else if (kind < 0.6) cylZ(k, M.black, 0.15, 0.55, XA + 0.2, y, z, 10);
    else if (kind < 0.8) k.put(CY(0.3, 0.3, 0.14, 16), r() < 0.5 ? M.ceramic : M.ceramicBlue, XA + 0.36, y, z, 0, 0, Math.PI / 2);
    else blk(M.filmYellow, y - 0.3, y + 0.3, z - 0.45, z + 0.45, 0.9, 0.08);
    busy.push([z - 0.5, z + 0.5, y - 0.45, y + 0.45]);
    placed++;
  }
  k.build(g);
  return {
    group: g,
    flybackHV: new THREE.Vector3(XA + 3.2, 27.8, -3.9),
    yokeJack: new THREE.Vector3(XA + 1.0, 27.4, 3.1),
    neckJack: new THREE.Vector3(XA + 1.0, 22.1, -7.3),
    logicJack: new THREE.Vector3(XA + 1.0, 21.1, 0.9),
  };
}
function holesForShield() { // speaker grille in the shield, in shield-shape coordinates (z, y)
  const out = [];
  for (const [dz, dy] of [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * 1.05, Math.sin((i * Math.PI) / 3) * 1.05])]) {
    const p = new THREE.Path(); p.absarc(5.1 + dz, 11.9 + dy, 0.34, 0, Math.PI * 2, false); out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- logic board (laid out from a photo of the 128K board)
const LB = { x0: -11.35, x1: 11.35, z0: -11.1, z1: 9.8, top: 1.41, bot: 1.25 };
const GRID_Z = { G: 8.97, F: 5.75, E: 1.6, D: -2.09, C: -5.09, B: -7.86, A: -10.4 };
const gridRef = (x, z) => {
  let best = 'A', d = 1e9;
  for (const [L, gz] of Object.entries(GRID_Z)) if (Math.abs(gz - z) < d) { d = Math.abs(gz - z); best = L; }
  return best + Math.max(1, Math.min(15, Math.round((x + 9.83) / 1.317) + 1));
};
// rear-panel port positions (X), shared with the case's port panel
export const PORTS = { y: 2.25, audio: -9.3, modem: -5.9, printer: -2.0, disk: 2.7, mouse: 7.1 };

export function buildLogicBoard(M) {
  const g = new THREE.Group();
  const k = new Kit();
  const { x0: X0, x1: X1, z0: Z0, z1: Z1, top: TOP } = LB;
  const dip = (x, z, pins, label, sub) => ({ x, z, pins, len: pins >= 40 ? 5.2 : pins >= 24 ? 3.6 : pins >= 20 ? 2.5 : pins >= 16 ? 1.95 : pins >= 14 ? 1.9 : 0.98, wid: pins >= 24 ? 1.5 : 0.75, axis: 'z', label, sub });
  const chips = [
    { x: -1.3, z: 1.6, pins: 64, len: 8.13, wid: 2.29, axis: 'x', label: 'MC68000G8', sub: '16/32-BIT MPU' },
    ...Array.from({ length: 16 }, (_, i) => dip(-3.51 + (i % 8) * 1.12, i < 8 ? 7.82 : 4.92, 16, 'MT4264', '64K x 1')),
    ...[['74AS253'], ['74AS253'], ['74F257'], ['74F257'], ['74LS157'], ['74LS157'], ['74LS244'], ['74LS374']].map(([n], i) => dip([-8.77, -7.53, -6.37, -5.36][i % 4], i < 4 ? 7.82 : 4.92, n === '74LS244' || n === '74LS374' ? 20 : 16, n)),
    dip(-10.06, 6.3, 14, '74LS393'),
    ...[['LAG', -9.83, 1.6], ['BMU0', -8.68, 1.6], ['TSM', -9.83, -2.09], ['BMU1', -8.58, -2.09], ['TSG', -7.29, -2.09], ['ASG', -6.28, -2.09]].map(([n, x, z]) => dip(x, z, 20, n, 'PAL16R8')),
    dip(-7.45, 1.6, 14, '74LS32'), dip(-6.35, 1.6, 14, '74LS74'),
    { ...dip(-2.91, -3.01, 28, '342-0220-A', 'ROM HI') }, { ...dip(-0.38, -3.01, 28, '342-0221-A', 'ROM LO') },
    dip(3.07, -2.78, 28, '344-0041-A', 'IWM'),
    dip(5.52, -3.62, 40, 'Z8530PS', 'SCC'),
    dip(8.24, -3.48, 40, 'R6522', 'VIA'),
    dip(4.05, 1.6, 20, '74LS245'),
    ...[['74LS166', 6.07, 7.6], ['74LS161', 7.22, 7.6], ['74LS244', 8.37, 5.05], ['74LS38', 6.07, 5.05], ['74LS04', 7.22, 5.05], ['74LS02', 9.52, 5.05], ['74LS74', 6.07, 2.06], ['74LS175', 7.22, 2.06], ['74LS138', 8.37, 2.06], ['74LS32', 9.52, 2.06]]
      .map(([n, x, z]) => dip(x, z, n === '74LS244' ? 20 : n === '74LS166' || n === '74LS161' || n === '74LS175' || n === '74LS138' ? 16 : 14, n)),
    dip(-3.4, -7.4, 16, '26LS30'), dip(-1.6, -7.4, 16, '26LS32'), dip(0.2, -7.4, 8, 'LF353'), dip(1.5, -7.4, 14, '74LS38'),
  ];
  for (const c of chips) c.grid = gridRef(c.x, c.z);
  const TW = 2048, TH = Math.round((2048 * (Z1 - Z0)) / (X1 - X0));
  const px = (x) => ((x - X0) / (X1 - X0)) * TW, pz = (z) => ((z - Z0) / (Z1 - Z0)) * TH;
  const S = TW / (X1 - X0);
  const tex = canvasTex(TW, TH, (c) => {
    c.fillStyle = '#1f6a45'; c.fillRect(0, 0, TW, TH);
    // traces: Manhattan runs between pin rows, then vias
    const r = rng(3);
    c.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      const a = chips[Math.floor(r() * chips.length)], b = chips[Math.floor(r() * chips.length)];
      c.strokeStyle = r() < 0.15 ? 'rgba(96,170,120,0.6)' : 'rgba(58,138,92,0.75)';
      c.lineWidth = r() < 0.1 ? 7 : 2.4;
      const ax = px(a.x + (r() - 0.5) * (a.axis === 'x' ? a.len : a.wid)), az = pz(a.z + (r() - 0.5) * (a.axis === 'z' ? a.len : a.wid));
      const bx = px(b.x + (r() - 0.5) * 0.6), bz = pz(b.z + (r() - 0.5) * 0.6);
      c.beginPath(); c.moveTo(ax, az);
      if (r() < 0.5) { c.lineTo(ax, (az + bz) / 2); c.lineTo(bx, (az + bz) / 2); } else { c.lineTo((ax + bx) / 2, az); c.lineTo((ax + bx) / 2, bz); }
      c.lineTo(bx, bz); c.stroke();
      c.fillStyle = '#c9b46a'; c.beginPath(); c.arc(bx, bz, 4.5, 0, Math.PI * 2); c.fill();
    }
    // silkscreen
    c.strokeStyle = '#eef3ec'; c.fillStyle = '#eef3ec'; c.lineWidth = 3.2;
    for (const ch of chips) {
      const L = ch.axis === 'x' ? ch.len : ch.wid, D = ch.axis === 'x' ? ch.wid : ch.len;
      c.strokeRect(px(ch.x - L / 2 - 0.12), pz(ch.z - D / 2 - 0.12), (L + 0.24) * S, (D + 0.24) * S);
      c.font = `600 24px ${MONO}`; c.textAlign = 'center';
      c.fillText(ch.grid, px(ch.x + L / 2 + 0.42), pz(ch.z) + 8);
    }
    // grid letters along the left edge and numbers along the front edge, as on the board
    c.font = `600 34px ${MONO}`; c.textAlign = 'center';
    for (const [L, z] of Object.entries(GRID_Z)) c.fillText(L, px(X0 + 0.32), pz(z) + 12);
    for (let i = 1; i <= 15; i++) c.fillText(String(i), px(-9.83 + (i - 1) * 1.317), pz(Z1 - 0.32) + 12);
    c.save(); c.translate(px(-10.3), pz(-6.3)); c.rotate(-Math.PI / 2); c.font = `italic 600 64px ${SANS}`; c.fillText('Macintosh', 0, 0); c.restore();
    c.save(); c.translate(px(10.9), pz(3.0)); c.rotate(-Math.PI / 2); c.font = `600 30px ${MONO}`; c.fillText('© 1983  630-0101', 0, 0); c.restore();
    c.strokeRect(px(10.05), pz(6.9), 0.6 * S, 1.3 * S);
    c.font = `600 26px ${MONO}`; c.fillText('15.6672 MHz', px(-7.3), pz(-6.3) + 8);
    c.fillText('J4 DISK', px(4.9), pz(-8.75)); c.fillText('J2 POWER', px(-5.2), pz(-9.25));
    // mounting holes
    for (const [x, z] of [[X0 + 0.7, Z0 + 0.7], [X1 - 0.7, Z0 + 0.7], [X0 + 0.7, Z1 - 0.7], [X1 - 0.7, Z1 - 0.7]]) {
      c.fillStyle = '#c9b46a'; c.beginPath(); c.arc(px(x), pz(z), 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0d1a13'; c.beginPath(); c.arc(px(x), pz(z), 12, 0, Math.PI * 2); c.fill();
    }
    // inspection sticker with a barcode
    c.save(); c.translate(px(10.6), pz(-5.2)); c.rotate(-Math.PI / 2);
    c.fillStyle = '#e9e2c9'; c.fillRect(-2.3 * S, -0.32 * S, 4.6 * S, 0.64 * S);
    const rb = rng(9); c.fillStyle = '#222';
    for (let x = -2.1 * S; x < 1.4 * S; x += 3 + rb() * 5) c.fillRect(x, -0.22 * S, 1 + rb() * 3, 0.32 * S);
    c.font = `600 20px ${MONO}`; c.textAlign = 'left'; c.fillText('E2010', 1.5 * S, 0.06 * S);
    c.restore();
  });
  const topGeo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0); topGeo.rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  topMesh.position.set((X0 + X1) / 2, TOP + 0.001, (Z0 + Z1) / 2); topMesh.receiveShadow = true; g.add(topMesh);
  box(k, M.pcbLogicEdge, X0, X1, LB.bot, TOP, Z0, Z1);
  const under = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0); under.rotateX(Math.PI / 2);
  const underMesh = new THREE.Mesh(under, new THREE.MeshStandardMaterial({ map: solderTex('#1c4a35', 9), roughness: 0.5, metalness: 0.1 }));
  underMesh.position.set((X0 + X1) / 2, LB.bot - 0.001, (Z0 + Z1) / 2); g.add(underMesh);
  buildChips(g, k, M, chips, TOP);

  // rear-panel connectors on the back edge, with their grounding bracket
  const dsub = (x, wTop, wBot, flangeW, jack) => {
    box(k, M.black, x - flangeW / 2 + 0.15, x + flangeW / 2 - 0.15, TOP, TOP + 1.2, Z0 - 0.8, Z0 + 0.8, 0.06); // insulator body
    box(k, M.zinc, x - flangeW / 2, x + flangeW / 2, TOP + 0.05, TOP + 1.42, Z0 - 0.9, Z0 - 0.82);        // flange
    const outer = new THREE.Shape(); dPath(x, PORTS.y, wTop + 0.12, wBot + 0.12, 0.98, 0.16, outer);
    outer.holes.push(dPath(x, PORTS.y, wTop, wBot, 0.86, 0.12));
    const sh = new THREE.ExtrudeGeometry(outer, { depth: 0.95, bevelEnabled: false, curveSegments: 4 });
    sh.translate(0, 0, Z0 - 0.9 - 0.95);
    k.put(sh, M.zinc);
    const ins = new THREE.Shape(); dPath(x, PORTS.y, wTop - 0.02, wBot - 0.02, 0.84, 0.11, ins);
    const ig = new THREE.ExtrudeGeometry(ins, { depth: 0.55, bevelEnabled: false, curveSegments: 4 });
    ig.translate(0, 0, Z0 - 0.9 - 0.75);
    k.put(ig, M.black);
    for (const s of [-1, 1]) { k.put(CY(0.22, 0.22, 0.75, 6), M.zinc, x + s * jack, PORTS.y, Z0 - 1.25, Math.PI / 2, 0, 0); }
  };
  dsub(PORTS.modem, 1.66, 1.38, 3.1, 1.25);
  dsub(PORTS.printer, 1.66, 1.38, 3.1, 1.25);
  dsub(PORTS.mouse, 1.66, 1.38, 3.1, 1.25);
  dsub(PORTS.disk, 3.86, 3.58, 5.3, 2.35);
  // audio jack
  box(k, M.black, PORTS.audio - 0.55, PORTS.audio + 0.55, TOP, TOP + 1.25, Z0 - 0.75, Z0 + 0.75, 0.06);
  cylZ(k, M.black, 0.4, 0.6, PORTS.audio, PORTS.y, Z0 - 1.05, 20);
  cylZ(k, M.zinc, 0.24, 0.62, PORTS.audio, PORTS.y, Z0 - 1.05, 16);
  // grounding bracket between the connectors
  const xs = [[-10.6, PORTS.audio - 0.6], [PORTS.audio + 0.6, PORTS.modem - 1.55], [PORTS.modem + 1.55, PORTS.printer - 1.55], [PORTS.printer + 1.55, PORTS.disk - 2.65], [PORTS.disk + 2.65, PORTS.mouse - 1.55], [PORTS.mouse + 1.55, 9.6]];
  for (const [a, b] of xs) if (b - a > 0.05) box(k, M.zinc, a, b, TOP, TOP + 1.42, Z0 - 0.9, Z0 - 0.82);
  for (const x of [-10.3, 0.35, 9.3]) box(k, M.zinc, x - 0.3, x + 0.3, TOP, TOP + 0.08, Z0 - 0.88, Z0 + 0.4);
  // RC filter networks beside the ports
  for (const [x, z] of [[-2.32, -9.47], [1.55, -9.47], [6.3, -9.7]]) box(k, M.orange, x - 0.8, x + 0.8, TOP, TOP + 0.9, z - 0.25, z + 0.25, 0.08);
  // power header from the analog board (J2), disk header (J4), keyboard jack at the front
  box(k, M.whiteConn, -6.73, -5.83, TOP, TOP + 1.1, -8.88, -4.98, 0.05);
  for (let i = 0; i < 10; i++) box(k, M.pin, -6.33, -6.23, TOP + 0.2, TOP + 1.0, -8.6 + i * 0.39, -8.52 + i * 0.39);
  box(k, M.black, 3.25, 6.55, TOP, TOP + 0.95, -8.35, -7.45, 0.04);
  box(k, M.grayConn, 7.9, 9.3, TOP, TOP + 1.3, 9.0, 10.95, 0.08);
  box(k, M.black, 8.15, 9.05, TOP + 0.2, TOP + 1.05, 10.94, 10.97);
  // clock oscillator, small header, toroids
  box(k, M.ceramicBlue, -9.27, -8.27, TOP, TOP + 0.45, -7.4, -5.25, 0.08);
  box(k, M.black, -10.75, -9.85, TOP, TOP + 0.85, -10.0, -9.1, 0.04);
  k.put(new THREE.TorusGeometry(0.5, 0.22, 10, 22), M.copper, -8.45, TOP + 0.24, -9.83, Math.PI / 2, 0, 0);
  k.put(new THREE.TorusGeometry(0.62, 0.28, 10, 22), M.whiteConn, -3.7, TOP + 0.3, -9.7, Math.PI / 2, 0, 0);
  // electrolytic, tantalum and ceramic capacitors
  for (const [x, z] of [[-10.4, -7.0], [10.5, 8.75], [-0.4, 9.0], [-10.6, 3.6], [-4.9, -9.6], [2.9, -9.9], [9.8, -7.6]]) { cylY(k, M.capBlue, 0.32, 0.95, x, TOP + 0.48, z, 18); cylY(k, M.zinc, 0.29, 0.03, x, TOP + 0.97, z, 18); }
  for (const [x, z] of [[-4.6, -5.6], [0.9, -5.6], [7.0, -7.9], [-7.6, -4.4]]) box(k, M.tantalum, x - 0.2, x + 0.2, TOP, TOP + 0.55, z - 0.25, z + 0.25, 0.1);
  const bead = new THREE.SphereGeometry(0.17, 8, 6); bead.scale(1, 0.8, 0.6);
  chips.forEach((ch) => {
    const dx = ch.axis === 'x' ? ch.len / 2 + 0.35 : 0, dz = ch.axis === 'z' ? ch.len / 2 + 0.3 : ch.wid / 2 + 0.35;
    k.put(bead, M.ceramic, ch.x + dx, TOP + 0.16, ch.z + (ch.axis === 'x' ? 0 : dz));
  });
  // resistor packs beside the RAM
  for (let i = 0; i < 3; i++) box(k, M.chip, -3.9 + i * 2.8, -2.1 + i * 2.8, TOP, TOP + 0.55, 9.15, 9.3);
  // axial resistors scattered along free lanes
  const r = rng(77);
  for (let i = 0; i < 60; i++) {
    const x = X0 + 0.8 + r() * (X1 - X0 - 1.6), z = Z0 + 1.6 + r() * (Z1 - Z0 - 2.6);
    if (chips.some((c) => Math.abs(c.x - x) < (c.axis === 'x' ? c.len : c.wid) / 2 + 0.5 && Math.abs(c.z - z) < (c.axis === 'z' ? c.len : c.wid) / 2 + 0.5)) continue;
    if ((x < -5.5 && z < -4.5 && z > -9.2) || (z < -9) || (x > 7.6 && z > 8.6) || (x > 3 && x < 6.8 && z < -6.9)) continue;
    cylX(k, M.resistor, 0.11, 0.62, x, TOP + 0.13, z, 8);
  }
  k.build(g);
  return {
    group: g,
    floppyHeader: new THREE.Vector3(4.9, TOP + 0.95, -7.9),
    analogHeader: new THREE.Vector3(-6.28, TOP + 1.1, -6.93),
    mousePort: new THREE.Vector3(PORTS.mouse, PORTS.y, Z0 - 1.85),
  };
}

// ---------------------------------------------------------------- floppy drive (Sony 3.5-inch, single sided, 400K)
export function buildFloppy(M) {
  const g = new THREE.Group();
  const k = new Kit();
  const cx = 4.81, y0 = 8.7, y1 = 12.2, z0 = -6.9, z1 = 8.45;
  // die-cast frame with a steel top cover
  box(k, M.zinc, cx - 5.05, cx + 5.05, y0 + 0.2, y1 - 0.3, z0 + 0.2, z1 - 0.25, 0.08);
  box(k, M.steel, cx - 4.95, cx + 4.95, y1 - 0.3, y1 - 0.05, z0 + 0.3, z1 - 0.35, 0.06);
  for (const z of [-4.6, -1.0, 6.3]) box(k, M.steel, cx - 4.4, cx + 4.4, y1 - 0.05, y1, z - 0.32, z + 0.32, 0.02);
  // head carriage window and its lead screw
  box(k, M.black, cx + 1.2, cx + 3.9, y1 - 0.06, y1 - 0.02, -5.8, -1.6);
  cylZ(k, M.pin, 0.12, 4.0, cx + 2.55, y1 - 0.1, -3.7, 10);
  // front bezel: slot and dust flap
  box(k, M.black, cx - 5.1, cx + 5.1, y0, y1, z1 - 0.3, z1, 0.08);
  box(k, M.rubber, cx - 4.45, cx + 4.45, 10.38, 10.92, z1 - 0.02, z1 + 0.01);
  box(k, M.ferrite, cx - 4.3, cx + 4.3, 10.42, 10.88, z1 - 0.5, z1 - 0.28);
  // spindle motor, stepper motor and eject motor
  cylY(k, M.zinc, 2.2, 0.25, cx, y0 - 0.12, 1.6, 36);
  cylZ(k, M.steel, 0.9, 0.9, cx - 2.6, 10.3, z0 - 0.25, 24);
  cylZ(k, M.black, 0.92, 0.12, cx - 2.6, 10.3, z0 - 0.72, 24);
  cylZ(k, M.steel, 0.6, 1.3, cx + 3.3, 9.7, z0 - 0.45, 20);
  // controller board underneath, rear connector
  box(k, M.pcbLogicEdge, cx - 4.8, cx + 4.8, y0 + 0.05, y0 + 0.17, -6.4, 6.8);
  for (let i = 0; i < 3; i++) box(k, M.chip, cx - 3.6 + i * 2.3, cx - 2.0 + i * 2.3, y0 - 0.15, y0 + 0.05, -5.6, -4.6);
  box(k, M.black, cx - 1.65, cx + 1.65, 9.0, 9.85, z0 - 0.15, z0 + 0.35, 0.04);
  for (const x of [cx - 5.08, cx + 5.08]) for (const z of [-3.0, 4.0]) cylX(k, M.zinc, 0.24, 0.1, x, 10.0, z, 14);
  k.build(g);
  // label on the top cover
  const label = canvasTex(512, 300, (c) => {
    c.fillStyle = '#ece9df'; c.fillRect(0, 0, 512, 300);
    c.fillStyle = '#26282b'; c.font = `700 38px ${MONO}`; c.fillText('OA-D34V-22', 28, 74);
    c.font = `500 25px ${MONO}`; c.fillText('MICRO FLOPPYDISK DRIVE', 28, 128); c.fillText('SINGLE SIDED  400K', 28, 170);
    c.fillText('DC 5V 12V', 28, 212); c.fillText('MADE IN JAPAN', 28, 254);
  });
  const lab = new THREE.PlaneGeometry(4.6, 2.7); lab.rotateX(-Math.PI / 2);
  const lm = new THREE.Mesh(lab, new THREE.MeshStandardMaterial({ map: label, roughness: 0.7 }));
  lm.position.set(cx - 1.7, y1 + 0.004, 2.5); lm.receiveShadow = true; g.add(lm);
  return { group: g, plug: new THREE.Vector3(cx, 9.4, z0 - 0.15) };
}

// ---------------------------------------------------------------- chassis: galvanised steel frame fixed to the bezel
export function buildChassis(M, beige) {
  const g = new THREE.Group();
  const k = new Kit();
  // logic board tray: U-channel rails the board slides along
  for (const s of [-1, 1]) {
    const xo = s * 11.62, xi = s * 11.22;
    box(k, M.galv, Math.min(xo, xi), Math.max(xo, xi), 0.92, 1.0, -12.9, 9.7);
    box(k, M.galv, Math.min(xo, xo - s * 0.08), Math.max(xo, xo - s * 0.08), 0.92, 2.0, -12.9, 9.7);
    box(k, M.galv, Math.min(xo, xi), Math.max(xo, xi), 1.92, 2.0, -12.9, 9.7);
    box(k, M.galv, Math.min(xo, xo - s * 0.08), Math.max(xo, xo - s * 0.08), 2.0, 2.6, 8.2, 9.7); // front tab to the bezel
  }
  // floppy cage: top plate with three lightening holes, side plates down to the right rail
  const topS = new THREE.Shape(); topS.moveTo(-0.6, -7.1); topS.lineTo(10.2, -7.1); topS.lineTo(10.2, 8.3); topS.lineTo(-0.6, 8.3); topS.closePath();
  for (const z of [-3.9, 0.6, 5.1]) { const h = new THREE.Path(); h.absarc(4.8, z, 1.45, 0, Math.PI * 2, true); topS.holes.push(h); }
  const top = new THREE.ExtrudeGeometry(topS, { depth: 0.08, bevelEnabled: false, curveSegments: 24 });
  top.rotateX(Math.PI / 2); top.translate(0, 12.42, 0);
  k.put(top, M.galv);
  const sideS = (x) => {
    const s = new THREE.Shape(); s.moveTo(-7.1, 2.3); s.lineTo(8.3, 2.3); s.lineTo(8.3, 12.42); s.lineTo(-7.1, 12.42); s.closePath();
    for (const z of [-4.2, 0.2, 4.6]) { const h = new THREE.Path(); h.absarc(z, 5.3, 1.1, 0, Math.PI * 2, true); s.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false, curveSegments: 20 });
    geo.rotateY(-Math.PI / 2); geo.translate(x, 0, 0);
    return geo;
  };
  k.put(sideS(10.12), M.galv);
  box(k, M.galv, -0.68, -0.6, 8.6, 12.42, -7.1, 8.3);
  box(k, M.galv, -0.6, 10.2, 12.24, 12.42, -7.18, -7.1);
  // diagonal gusset from the cage to the right rail, and the cage foot
  { const a = new THREE.Vector3(10.08, 8.0, -7.0), b = new THREE.Vector3(10.08, 2.4, -11.6); const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    k.put(B(0.08, len, 1.2), M.galv, mid.x, mid.y, mid.z, Math.atan2(a.z - b.z, a.y - b.y), 0, 0); }
  for (const [z0, z1] of [[7.0, 8.0], [-7.1, -6.1]]) box(k, M.galv, 10.04, 11.3, 2.0, 2.3, z0, z1);
  // channel that holds the analog board's bottom edge, on two brackets to the left rail
  box(k, M.galv, -11.62, -10.7, 3.92, 4.0, -12.9, 9.3);
  box(k, M.galv, -11.62, -11.54, 3.92, 4.75, -12.9, 9.3);
  box(k, M.galv, -10.78, -10.7, 3.92, 4.75, -12.9, 9.3);
  for (const z of [-11.5, -1.5, 7.5]) box(k, M.galv, -11.62, -11.4, 2.0, 3.92, z - 0.6, z + 0.6);
  // screws
  for (const [x, y, z] of [[-0.64, 10.0, -3.0], [-0.64, 10.0, 4.0], [10.16, 10.0, -3.0], [10.16, 10.0, 4.0], [10.16, 6.3, -9.4]]) cylX(k, M.zinc, 0.25, 0.14, x + (x > 5 ? 0.06 : -0.06), y, z, 14);
  k.build(g);
  // bosses moulded into the bezel that the CRT ears screw onto
  const bosses = new THREE.Group();
  const kb = new Kit();
  const bossMat = new THREE.MeshStandardMaterial({ color: beige, roughness: 0.75 });
  const crtM = new THREE.Matrix4().compose(CRT_FRAME.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(CRT_FRAME.tilt, 0, 0)), new THREE.Vector3(1, 1, 1));
  const D = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(CRT_FRAME.tilt, 0, 0)));
  for (const e of CRT_EARS) {
    // run each boss from the ear forward to the bezel's inner wall (z ~ 14.5 - 0.1 y, measured from the shell)
    const P = new THREE.Vector3(e.hole.x, e.hole.y, -1.37).applyMatrix4(crtM);
    const len = (14.35 - 0.1 * P.y - P.z) / (D.z + 0.1 * D.y);
    const m = new THREE.Matrix4().makeTranslation(e.hole.x, e.hole.y, -1.37 + len / 2).premultiply(crtM);
    kb.putM(new THREE.CylinderGeometry(0.5, 0.62, len, 18).rotateX(Math.PI / 2), bossMat, m);
  }
  kb.build(bosses);
  return { group: g, bosses };
}

// ---------------------------------------------------------------- rear port panel (part of the rear case)
// The 128K's ports, left to right seen from behind: mouse, external disk, printer, modem, audio.
export function buildPortPanel(beige, inner) {
  const g = new THREE.Group();
  const P = { x0: -10.95, x1: 10.95, y0: 0.62, y1: 6.45, z: -13.34 };
  const holes = (mirror) => {
    const X = (x) => (mirror ? -x : x);
    const out = [];
    for (const [key, top, bot, jack] of [['mouse', 1.82, 1.54, 1.25], ['printer', 1.82, 1.54, 1.25], ['modem', 1.82, 1.54, 1.25], ['disk', 4.02, 3.74, 2.35]]) {
      const x = PORTS[key];
      out.push(dPath(X(x), PORTS.y, top, bot, 1.02, 0.17));
      for (const s of [-1, 1]) { const h = new THREE.Path(); h.absarc(X(x + s * jack), PORTS.y, 0.2, 0, Math.PI * 2, true); out.push(h); }
    }
    const a = new THREE.Path(); a.absarc(X(PORTS.audio), PORTS.y, 0.44, 0, Math.PI * 2, true); out.push(a);
    return out;
  };
  const make = (mirror) => {
    const s = new THREE.Shape();
    s.moveTo(P.x0, P.y0); s.lineTo(P.x1, P.y0); s.lineTo(P.x1, P.y1); s.lineTo(P.x0, P.y1); s.closePath();
    s.holes.push(...holes(mirror));
    return new THREE.ShapeGeometry(s, 10);
  };
  const W = P.x1 - P.x0, H = P.y1 - P.y0, TW = 2048, TH = Math.round((2048 * H) / W), S = TW / W;
  const tex = canvasTex(TW, TH, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, TW, TH);
    const X = (x) => (P.x1 - x) * S, Y = (y) => (P.y1 - y) * S;
    // moulded port icons (original pictograms): a soft shadow line under a light edge reads as relief
    const draw = (fn) => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.save(); c.translate(1.5, 2); c.strokeStyle = 'rgba(70,58,40,0.55)'; c.fillStyle = 'rgba(70,58,40,0.55)'; c.lineWidth = 5; fn(); c.restore();
      c.save(); c.strokeStyle = 'rgba(255,253,246,0.85)'; c.fillStyle = 'rgba(255,253,246,0.85)'; c.lineWidth = 3.4; fn(); c.restore();
    };
    const iy = Y(4.35), u = 0.1 * S;
    const icon = (x, fn) => { c.save(); c.translate(X(x), iy); draw(() => fn(u)); c.restore(); };
    icon(PORTS.mouse, (u) => { c.beginPath(); c.roundRect(-3 * u, -2 * u, 6 * u, 8.5 * u, 2.6 * u); c.stroke(); c.beginPath(); c.moveTo(-3 * u, 1 * u); c.lineTo(3 * u, 1 * u); c.stroke(); c.beginPath(); c.moveTo(0, -2 * u); c.bezierCurveTo(0, -5 * u, 3 * u, -5 * u, 3 * u, -7.5 * u); c.stroke(); });
    icon(PORTS.disk, (u) => { c.beginPath(); c.moveTo(-4 * u, -4 * u); c.lineTo(3 * u, -4 * u); c.lineTo(4 * u, -3 * u); c.lineTo(4 * u, 4 * u); c.lineTo(-4 * u, 4 * u); c.closePath(); c.stroke(); c.strokeRect(-2 * u, -4 * u, 4.2 * u, 2.8 * u); c.strokeRect(-2.6 * u, 0.8 * u, 5.2 * u, 3.2 * u); });
    icon(PORTS.printer, (u) => { c.strokeRect(-5 * u, -1 * u, 10 * u, 4.5 * u); c.beginPath(); c.moveTo(-3 * u, -1 * u); c.lineTo(-3 * u, -5.5 * u); c.lineTo(3 * u, -5.5 * u); c.lineTo(3 * u, -1 * u); c.stroke(); c.beginPath(); c.moveTo(-2.6 * u, 1.3 * u); c.lineTo(2.6 * u, 1.3 * u); c.stroke(); c.beginPath(); c.moveTo(-3 * u, 3.5 * u); c.lineTo(-3 * u, 6 * u); c.lineTo(3 * u, 6 * u); c.lineTo(3 * u, 3.5 * u); c.stroke(); });
    icon(PORTS.modem, (u) => { c.beginPath(); c.moveTo(-5 * u, 0); c.quadraticCurveTo(-5 * u, -4 * u, 0, -4 * u); c.quadraticCurveTo(5 * u, -4 * u, 5 * u, 0); c.stroke(); for (const s of [-1, 1]) { c.beginPath(); c.roundRect(s * 5 * u - 1.8 * u, -0.5 * u, 3.6 * u, 2.2 * u, 0.8 * u); c.stroke(); } c.beginPath(); c.roundRect(-3 * u, 2.8 * u, 6 * u, 3.2 * u, 1 * u); c.stroke(); });
    icon(PORTS.audio, (u) => { c.strokeRect(-4 * u, -1.5 * u, 2.4 * u, 3 * u); c.beginPath(); c.moveTo(-1.6 * u, -1.5 * u); c.lineTo(1.6 * u, -4 * u); c.lineTo(1.6 * u, 4 * u); c.lineTo(-1.6 * u, 1.5 * u); c.stroke(); for (const rr of [3.4, 5.4]) { c.beginPath(); c.arc(1.4 * u, 0, rr * u, -0.6, 0.6); c.stroke(); } });
  });
  tex.repeat.set(-1 / W, 1 / H); tex.offset.set(P.x1 / W, -P.y0 / H);
  const front = make(true); front.rotateY(Math.PI); front.translate(0, 0, P.z - 0.03);
  const fm = new THREE.Mesh(front, new THREE.MeshStandardMaterial({ color: beige, map: tex, roughness: 0.62 }));
  const backG = make(false); backG.translate(0, 0, P.z + 0.03);
  const bm = new THREE.Mesh(backG, new THREE.MeshStandardMaterial({ color: inner, roughness: 0.85 }));
  for (const m of [fm, bm]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}
