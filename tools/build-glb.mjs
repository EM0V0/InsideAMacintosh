// Builds the web-ready model from the Sketchfab GLB (Darren Hogan, CC BY-NC 4.0).
// - recenters the computer on the origin (units: centimetres, Y up, front = +Z)
// - splits the one-piece case into the front bezel and the removable rear case
// - adds a plastic rim along the new cut so the shells read as solid parts
// - groups rear-panel hardware with the board it belongs to (ports -> logic board,
//   power inlet/switch/brightness knob -> analog board)
// - drops the mouse and its cable, merges the keyboard into a few meshes
// - strips textures (the page loads its own) and quantizes geometry
import { NodeIO, Document } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, weld, dedup, prune } from '@gltf-transform/functions';

const [, , SRC, OUT] = process.argv;
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
const src = await io.read(SRC);
const nodes = src.getRoot().listNodes();
const C = [-20.14, 0, -43.525]; // computer footprint centre (world, cm)

function readMesh(name) {
  const n = nodes.find((x) => x.getName() === name);
  const p = n.getMesh().listPrimitives()[0];
  const parentT = n.getParentNode().getTranslation();
  const pos = Array.from(p.getAttribute('POSITION').getArray());
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += parentT[0] - C[0];
    pos[i + 1] += parentT[1] - C[1];
    pos[i + 2] += parentT[2] - C[2];
  }
  return {
    pos,
    nrm: Array.from(p.getAttribute('NORMAL').getArray()),
    uv: p.getAttribute('TEXCOORD_0') ? Array.from(p.getAttribute('TEXCOORD_0').getArray()) : null,
    idx: Array.from(p.getIndices().getArray()),
  };
}

// ---- connected components (vertices welded by position) ----
function components(m) {
  const key = (i) => `${Math.round(m.pos[3 * i] * 1000)},${Math.round(m.pos[3 * i + 1] * 1000)},${Math.round(m.pos[3 * i + 2] * 1000)}`;
  const ids = new Map();
  const vid = new Int32Array(m.pos.length / 3);
  for (let i = 0; i < vid.length; i++) { const k = key(i); if (!ids.has(k)) ids.set(k, ids.size); vid[i] = ids.get(k); }
  const par = new Int32Array(ids.size).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let f = 0; f < m.idx.length; f += 3) {
    const a = find(vid[m.idx[f]]), b = find(vid[m.idx[f + 1]]), c = find(vid[m.idx[f + 2]]);
    par[a] = b; par[find(c)] = find(b);
  }
  const comp = new Map();
  for (let f = 0; f < m.idx.length; f += 3) {
    const r = find(vid[m.idx[f]]);
    if (!comp.has(r)) comp.set(r, { faces: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
    const c = comp.get(r);
    c.faces.push(f / 3);
    for (const k of [m.idx[f], m.idx[f + 1], m.idx[f + 2]]) for (let a = 0; a < 3; a++) {
      const v = m.pos[3 * k + a]; if (v < c.min[a]) c.min[a] = v; if (v > c.max[a]) c.max[a] = v;
    }
  }
  return [...comp.values()].map((c) => ({ ...c, ctr: c.min.map((v, i) => (v + c.max[i]) / 2) }));
}

// ---- sub-mesh accumulators, keyed by group/material ----
const groups = {}; // groups[group][material] = {pos, nrm, uv, idx}
function bucket(g, mat) {
  groups[g] ??= {};
  return (groups[g][mat] ??= { pos: [], nrm: [], uv: [], idx: [], hasUV: true });
}
function addFaces(g, mat, m, faceList) {
  const b = bucket(g, mat);
  const remap = new Map();
  for (const f of faceList) {
    for (let k = 0; k < 3; k++) {
      const vi = m.idx[3 * f + k];
      if (!remap.has(vi)) {
        remap.set(vi, b.pos.length / 3);
        b.pos.push(m.pos[3 * vi], m.pos[3 * vi + 1], m.pos[3 * vi + 2]);
        b.nrm.push(m.nrm[3 * vi], m.nrm[3 * vi + 1], m.nrm[3 * vi + 2]);
        if (m.uv) b.uv.push(m.uv[2 * vi], m.uv[2 * vi + 1]); else b.hasUV = false;
      }
      b.idx.push(remap.get(vi));
    }
  }
}
const allFaces = (m) => [...Array(m.idx.length / 3).keys()];

// Seam between the front bezel and the rear case (centred coords).
// Measured from the mesh: z = -34.25 at the top, -34.9 at the chin, -35.0 below the chin (world).
const seamZ = (y) => (y >= 7 ? -34.25 - 0.0236 * (34.5 - y) : -35.0) - C[2];
const isFront = (x, y, z) => z > seamZ(y);

// ---- case shell ----
const caseM = readMesh('Computer_Computer_0');
const caseComps = components(caseM);
const shell = caseComps.reduce((a, b) => (a.faces.length > b.faces.length ? a : b));
// The model's rear connector band is laid out like a later Macintosh Plus (SCSI and round
// mini-DIN serial ports). It is cut out here and rebuilt in the page with the 128K's ports.
const inPortBand = (x, y, z) => Math.abs(x) < 10.95 && y > 0.62 && y < 6.45 && z > -13.42 && z < -12.55;
const front = [], rear = [];
let bandFaces = 0;
for (const f of shell.faces) {
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < 3; k++) { const v = caseM.idx[3 * f + k]; cx += caseM.pos[3 * v]; cy += caseM.pos[3 * v + 1]; cz += caseM.pos[3 * v + 2]; }
  cx /= 3; cy /= 3; cz /= 3;
  if (isFront(cx, cy, cz)) front.push(f);
  else if (inPortBand(cx, cy, cz)) bandFaces++;
  else rear.push(f);
}
console.log('removed port-band faces', bandFaces);
addFaces('bezel', 'case', caseM, front);
addFaces('rearCase', 'case', caseM, rear);

// Rim along the cut: extrude open edges that lie on the seam inward by the wall thickness.
function addRim(g, faceList, thickness, inwardSign) {
  const m = caseM;
  const key = (i) => `${Math.round(m.pos[3 * i] * 500)},${Math.round(m.pos[3 * i + 1] * 500)},${Math.round(m.pos[3 * i + 2] * 500)}`;
  const edgeCount = new Map();
  const edgeVerts = new Map();
  for (const f of faceList) {
    for (let k = 0; k < 3; k++) {
      const a = m.idx[3 * f + k], b = m.idx[3 * f + ((k + 1) % 3)];
      const ka = key(a), kb = key(b);
      const ek = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      edgeCount.set(ek, (edgeCount.get(ek) || 0) + 1);
      edgeVerts.set(ek, [a, b]);
    }
  }
  const b = bucket(g, 'rim');
  b.hasUV = false;
  let quads = 0;
  for (const [ek, n] of edgeCount) {
    if (n !== 1) continue;
    const [a, c] = edgeVerts.get(ek);
    const P = (i) => [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]];
    const N = (i) => [m.nrm[3 * i], m.nrm[3 * i + 1], m.nrm[3 * i + 2]];
    const pa = P(a), pc = P(c);
    if (Math.abs(pa[2] - seamZ(pa[1])) > 0.9 || Math.abs(pc[2] - seamZ(pc[1])) > 0.9) continue;
    const na = N(a), nc = N(c);
    // outward direction: away from the case centre in XY; fall back to the stored normal
    const out = (p, n) => {
      const d = [p[0], p[1] - 17.3, 0];
      const len = Math.hypot(d[0], d[1]) || 1;
      const s = Math.sign(n[0] * d[0] + n[1] * d[1]) || 1;
      return [n[0] * s * inwardSign, n[1] * s * inwardSign, n[2] * s * inwardSign];
    };
    const oa = out(pa, na), oc = out(pc, nc);
    const qa = [pa[0] - oa[0] * thickness, pa[1] - oa[1] * thickness, pa[2] - oa[2] * thickness];
    const qc = [pc[0] - oc[0] * thickness, pc[1] - oc[1] * thickness, pc[2] - oc[2] * thickness];
    const base = b.pos.length / 3;
    b.pos.push(...pa, ...pc, ...qc, ...qa);
    // face normal points along the cut (towards the open side)
    const e1 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const e2 = [qa[0] - pa[0], qa[1] - pa[1], qa[2] - pa[2]];
    let fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const fl = Math.hypot(...fn) || 1; fn = fn.map((v) => v / fl);
    for (let k = 0; k < 4; k++) b.nrm.push(...fn);
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    quads++;
  }
  return quads;
}
const rimFront = addRim('bezel', front, 0.28, 1);
const rimRear = addRim('rearCase', rear, 0.28, 1);

// ---- black plastic ----
const black = readMesh('Computer_Blackplastic_0');
for (const c of components(black)) {
  const [x, y, z] = c.ctr;
  let g;
  if (y < 3.4 && z < -12.5 && c.max[1] < 3.5) continue; // Plus-style connector insulators (replaced)
  else if (x < -8.3 && y > 9 && y < 13 && z < -12) g = 'analogRear'; // power inlet
  else if (x < -8.3 && y > 14.5 && y < 18.2 && z < -13) g = 'analogRear'; // power switch bezel
  else if (isFront(x, y, z)) g = 'bezel';
  else g = 'rearCase';
  addFaces(g, 'black', black, c.faces);
}

// ---- metal ----
const metal = readMesh('Computer_Metal_0');
for (const c of components(metal)) {
  const [x, y] = c.ctr;
  let g = 'rearCase';
  if (y < 3.5) continue; // Plus-style connector shells (replaced)
  else if (x < -8.3) g = 'analogRear'; // inlet pins
  addFaces(g, 'metal', metal, c.faces);
}

// ---- white plastic (power switch rocker) ----
const white = readMesh('Computer_Whiteplastic_0');
addFaces('analogRear', 'white', white, allFaces(white));

// ---- screen glass, with planar UVs across the visible face ----
const screen = readMesh('Computer_Screen_0');
{
  let mn = [1e9, 1e9], mx = [-1e9, -1e9];
  for (let i = 0; i < screen.pos.length; i += 3) {
    mn[0] = Math.min(mn[0], screen.pos[i]); mx[0] = Math.max(mx[0], screen.pos[i]);
    mn[1] = Math.min(mn[1], screen.pos[i + 1]); mx[1] = Math.max(mx[1], screen.pos[i + 1]);
  }
  screen.uv = [];
  for (let i = 0; i < screen.pos.length; i += 3) {
    screen.uv.push((screen.pos[i] - mn[0]) / (mx[0] - mn[0]), (screen.pos[i + 1] - mn[1]) / (mx[1] - mn[1]));
  }
  console.log('screen bounds', mn, mx);
}
addFaces('screenGlass', 'screen', screen, allFaces(screen));

// ---- brightness knob ----
const knob = readMesh('Brightness_Computer_0');
addFaces('knob', 'case', knob, allFaces(knob));

// ---- mouse (its cord and plug are rebuilt in the page as a cable that can unplug) ----
const mouseBody = readMesh('Mouse_Lightplastic_0');
addFaces('mouse', 'case', mouseBody, allFaces(mouseBody));
const mouseBtn = readMesh('Mouse_Darkplastic_0');
addFaces('mouse', 'dark', mouseBtn, allFaces(mouseBtn));
for (const nm of ['Mousechord_Darkplastic_0', 'Mouseplug_Darkplastic_0']) { const m = readMesh(nm); addFaces('mouseCord', 'dark', m, allFaces(m)); }

// ---- keyboard ----
const kbBody = readMesh('Keyboard_Lightplastic_0');
addFaces('keyboard', 'case', kbBody, allFaces(kbBody));
const kbBlack = readMesh('Keyboard_Blackplastic_0');
addFaces('keyboard', 'black', kbBlack, allFaces(kbBlack));
const cord = readMesh('Keyboardchord_Computer_0');
addFaces('kbCord', 'case', cord, allFaces(cord));
for (const n of nodes) {
  if (n.getMesh() && n.getName().endsWith('_Keys_0')) {
    const km = readMesh(n.getName());
    addFaces('keyboard', 'keys', km, allFaces(km));
  }
}

// ---- write ----
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('mac');
const mats = {};
const BASE = { dark: [0.5, 0.48, 0.4, 1], case: [0.72, 0.66, 0.53, 1], black: [0.06, 0.06, 0.06, 1], metal: [0.85, 0.85, 0.85, 1], white: [0.85, 0.85, 0.8, 1], rim: [0.7, 0.64, 0.5, 1], keys: [0.5, 0.48, 0.4, 1], screen: [0.1, 0.1, 0.1, 1] };
const mat = (name) => (mats[name] ??= doc.createMaterial(name).setBaseColorFactor(BASE[name] ?? [1, 0, 1, 1]).setRoughnessFactor(name === 'metal' ? 0.35 : 0.6).setMetallicFactor(name === 'metal' ? 1 : 0));
const stats = {};
for (const [g, byMat] of Object.entries(groups)) {
  const mesh = doc.createMesh(g);
  let tris = 0;
  for (const [mname, b] of Object.entries(byMat)) {
    const prim = doc.createPrimitive().setMaterial(mat(mname));
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(b.pos)).setBuffer(buffer));
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(b.nrm)).setBuffer(buffer));
    if (b.hasUV && b.uv.length) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(b.uv)).setBuffer(buffer));
    const IA = b.pos.length / 3 > 65535 ? Uint32Array : Uint16Array;
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new IA(b.idx)).setBuffer(buffer));
    mesh.addPrimitive(prim);
    tris += b.idx.length / 3;
  }
  scene.addChild(doc.createNode(g).setMesh(mesh));
  stats[g] = tris;
}
console.log('triangles per group', stats, 'rim quads', rimFront, rimRear);
await doc.transform(dedup(), prune({ keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
