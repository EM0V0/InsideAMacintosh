// 1-bit drawing on a byte-per-pixel buffer, in the spirit of early QuickDraw:
// 8x8 patterns aligned to the screen, outlines, ovals, round rects, text and masked bitmaps.
// All icons and cursors here are original drawings.
import { glyph } from './font.js';

export const W = 512, H = 342;

export const PAT = {
  black: [255, 255, 255, 255, 255, 255, 255, 255],
  white: [0, 0, 0, 0, 0, 0, 0, 0],
  gray: [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55],
  ltGray: [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22],
  dkGray: [0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd],
};
// patterns offered by Paint and the Control Panel (original set)
export const PATTERNS = [
  PAT.black, PAT.dkGray, PAT.gray, PAT.ltGray, [0x80, 0, 0x08, 0, 0x80, 0, 0x08, 0], PAT.white,
  [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08], [0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88], [0x88, 0x44, 0x22, 0x11, 0x88, 0x44, 0x22, 0x11],
  [0xff, 0, 0, 0, 0xff, 0, 0, 0], [0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88], [0xff, 0x88, 0x88, 0x88, 0xff, 0x88, 0x88, 0x88],
  [0x18, 0x24, 0x42, 0x81, 0x81, 0x42, 0x24, 0x18], [0xcc, 0xcc, 0x33, 0x33, 0xcc, 0xcc, 0x33, 0x33], [0x00, 0x66, 0x66, 0x00, 0x00, 0x66, 0x66, 0x00],
  [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81], [0xf0, 0xf0, 0xf0, 0xf0, 0x0f, 0x0f, 0x0f, 0x0f], [0x10, 0x38, 0x7c, 0xfe, 0x7c, 0x38, 0x10, 0x00],
  [0xaa, 0x00, 0xaa, 0x00, 0xaa, 0x00, 0xaa, 0x00], [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80], [0x0f, 0x87, 0xc3, 0xe1, 0xf0, 0x78, 0x3c, 0x1e],
  [0xee, 0xdd, 0xbb, 0x77, 0xee, 0xdd, 0xbb, 0x77], [0x03, 0x84, 0x48, 0x30, 0x0c, 0x02, 0x01, 0x01], [0x22, 0, 0x88, 0, 0x22, 0, 0x88, 0],
];
const patBit = (pat, x, y) => (pat[y & 7] >> (7 - (x & 7))) & 1;

export class Gfx {
  // black: the buffer value that means a black pixel (the screen buffer stores 1 for lit phosphor)
  constructor(buf, w, h, black = 0) { this.buf = buf; this.w = w; this.h = h; this.B = black; this.Wt = 1 - black; this.clip = null; this.xor = false; this.ox = 0; this.oy = 0; }
  setClip(x, y, w, h) { this.clip = [Math.max(0, x), Math.max(0, y), Math.min(this.w - 1, x + w - 1), Math.min(this.h - 1, y + h - 1)]; }
  noClip() { this.clip = null; }
  bounds(x0, y0, x1, y1) {
    const c = this.clip || [0, 0, this.w - 1, this.h - 1];
    return [Math.max(x0, c[0]), Math.max(y0, c[1]), Math.min(x1, c[2]), Math.min(y1, c[3])];
  }
  px(x, y, v = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const c = this.clip; if (c && (x < c[0] || y < c[1] || x > c[2] || y > c[3])) return;
    const i = y * this.w + x;
    if (this.xor) { if (v) this.buf[i] ^= 1; return; }
    this.buf[i] = v ? this.B : this.Wt;
  }
  get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.buf[y * this.w + x] === this.B ? 1 : 0; }
  fill(x, y, w, h, pat = PAT.black) {
    const [x0, y0, x1, y1] = this.bounds(Math.floor(x), Math.floor(y), Math.floor(x + w - 1), Math.floor(y + h - 1));
    for (let j = y0; j <= y1; j++) { const row = pat[j & 7]; for (let i = x0; i <= x1; i++) this.px(i, j, (row >> (7 - (i & 7))) & 1); }
  }
  clear(x, y, w, h) { this.fill(x, y, w, h, PAT.white); }
  invert(x, y, w, h) {
    const [x0, y0, x1, y1] = this.bounds(x, y, x + w - 1, y + h - 1);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) this.buf[j * this.w + i] ^= 1;
  }
  hline(x0, x1, y, v = 1) { if (x1 < x0) [x0, x1] = [x1, x0]; for (let x = x0; x <= x1; x++) this.px(x, y, v); }
  vline(x, y0, y1, v = 1) { if (y1 < y0) [y0, y1] = [y1, y0]; for (let y = y0; y <= y1; y++) this.px(x, y, v); }
  frame(x, y, w, h, v = 1, pen = 1) {
    for (let p = 0; p < pen; p++) {
      this.hline(x + p, x + w - 1 - p, y + p, v); this.hline(x + p, x + w - 1 - p, y + h - 1 - p, v);
      this.vline(x + p, y + p, y + h - 1 - p, v); this.vline(x + w - 1 - p, y + p, y + h - 1 - p, v);
    }
  }
  // dotted gray outline in XOR mode, used while dragging
  grayFrame(x, y, w, h) {
    const was = this.xor; this.xor = true;
    for (let i = x; i < x + w; i++) { if (((i + y) & 1) === 0) this.px(i, y, 1); if (((i + y + h - 1) & 1) === 0) this.px(i, y + h - 1, 1); }
    for (let j = y + 1; j < y + h - 1; j++) { if (((x + j) & 1) === 0) this.px(x, j, 1); if (((x + w - 1 + j) & 1) === 0) this.px(x + w - 1, j, 1); }
    this.xor = was;
  }
  line(x0, y0, x1, y1, v = 1, pen = 1, pat = null) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (pen === 1) this.px(x0, y0, pat ? patBit(pat, x0, y0) : v);
      else for (let j = 0; j < pen; j++) for (let i = 0; i < pen; i++) this.px(x0 + i, y0 + j, pat ? patBit(pat, x0 + i, y0 + j) : v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // spans of filled shapes, one [left, right] pair per row
  static ovalSpans(w, h) {
    const out = [], a = w / 2, b = h / 2;
    for (let j = 0; j < h; j++) { const yy = (j + 0.5 - b) / b; const s = Math.sqrt(Math.max(0, 1 - yy * yy)) * a; const l = Math.round(a - s); out.push([l, w - 1 - l]); }
    return out;
  }
  static rrSpans(w, h, r) {
    r = Math.max(0, Math.min(r, Math.floor(w / 2), Math.floor(h / 2)));
    const out = [];
    for (let j = 0; j < h; j++) {
      let l = 0;
      const d = j < r ? r - j - 0.5 : j >= h - r ? j - (h - r) + 0.5 : -1;
      if (d >= 0) l = Math.round(r - Math.sqrt(Math.max(0, r * r - d * d)));
      out.push([l, w - 1 - l]);
    }
    return out;
  }
  spans(x, y, sp, pat) { sp.forEach(([l, r], j) => { for (let i = l; i <= r; i++) this.px(x + i, y + j, patBit(pat, x + i, y + j)); }); }
  outline(x, y, sp, v = 1) {
    sp.forEach(([l, r], j) => {
      const up = sp[j - 1], dn = sp[j + 1];
      for (let i = l; i <= r; i++) {
        if (i === l || i === r || !up || !dn || i < up[0] || i > up[1] || i < dn[0] || i > dn[1]) this.px(x + i, y + j, v);
      }
    });
  }
  thickOutline(x, y, w, h, kind, r, pen, pat) {
    const outer = kind === 'oval' ? Gfx.ovalSpans(w, h) : Gfx.rrSpans(w, h, r);
    if (pen <= 1) { if (pat) outer.forEach(([l, rr], j) => { const up = outer[j - 1], dn = outer[j + 1]; for (let i = l; i <= rr; i++) if (i === l || i === rr || !up || !dn || i < up[0] || i > up[1] || i < dn[0] || i > dn[1]) this.px(x + i, y + j, patBit(pat, x + i, y + j)); }); else this.outline(x, y, outer); return; }
    const iw = w - 2 * pen, ih = h - 2 * pen;
    const inner = iw > 0 && ih > 0 ? (kind === 'oval' ? Gfx.ovalSpans(iw, ih) : Gfx.rrSpans(iw, ih, Math.max(0, r - pen))) : [];
    outer.forEach(([l, rr], j) => {
      const ij = j - pen, sp = inner[ij];
      for (let i = l; i <= rr; i++) {
        const ii = i - pen;
        if (sp && ii >= sp[0] && ii <= sp[1]) continue;
        this.px(x + i, y + j, pat ? patBit(pat, x + i, y + j) : 1);
      }
    });
  }
  roundRect(x, y, w, h, r, fillPat = null, frame = true) {
    const sp = Gfx.rrSpans(w, h, r);
    if (fillPat) this.spans(x, y, sp, fillPat);
    if (frame) this.outline(x, y, sp);
  }
  oval(x, y, w, h, fillPat = null, frame = true) {
    const sp = Gfx.ovalSpans(w, h);
    if (fillPat) this.spans(x, y, sp, fillPat);
    if (frame) this.outline(x, y, sp);
  }
  // text: y is the top of the capitals; returns the x after the last character
  text(str, x, y, { bold = false, v = 1, gray = false } = {}) {
    for (const ch of str) {
      const g = glyph(ch);
      g.bits.forEach((row, r) => {
        if (!row) return;
        for (let c = 0; c < g.w; c++) if (row & (1 << (g.w - 1 - c))) {
          const px = x + c, py = y + r;
          if (!gray || ((px + py) & 1) === 0) this.px(px, py, v);
          if (bold && (!gray || ((px + 1 + py) & 1) === 0)) this.px(px + 1, py, v);
        }
      });
      x += g.w + 1 + (bold && g.bits.length ? 1 : 0);
    }
    return x - 1;
  }
  // bitmaps: {w, h, data (1 = black), mask (1 = opaque), hx, hy}
  blit(bm, x, y, mode = 'normal') {
    for (let j = 0; j < bm.h; j++) for (let i = 0; i < bm.w; i++) {
      const k = j * bm.w + i;
      if (!bm.mask[k]) continue;
      const d = bm.data[k], X = x + i, Y = y + j;
      if (mode === 'normal') this.px(X, Y, d);
      else if (mode === 'invert') this.px(X, Y, d ? 0 : 1);
      else if (mode === 'open') this.px(X, Y, bm.edge[k] ? 1 : ((X + Y) & 1) === 0 ? 1 : 0);
      else if (mode === 'ink') { if (d) this.px(X, Y, 1); }
    }
  }
  // dotted outline of a bitmap's silhouette (XOR), for icon dragging
  ghost(bm, x, y) {
    const was = this.xor; this.xor = true;
    for (let j = 0; j < bm.h; j++) for (let i = 0; i < bm.w; i++) { const k = j * bm.w + i; if (bm.edge[k] && (((x + i) + (y + j)) & 1) === 0) this.px(x + i, y + j, 1); }
    this.xor = was;
  }
}

// ---------------------------------------------------------------- bitmaps
function finishMask(w, h, data, mask) {
  const edge = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; if (!mask[k]) continue;
    if (i === 0 || j === 0 || i === w - 1 || j === h - 1 || !mask[k - 1] || !mask[k + 1] || !mask[k - w] || !mask[k + w]) edge[k] = 1;
  }
  return { w, h, data, mask, edge };
}
// mask = everything not reachable from the border through white pixels
export function makeIcon(draw, w = 32, h = 32) {
  const data = new Uint8Array(w * h);
  draw(new Gfx(data, w, h, 1));
  const out = new Uint8Array(w * h), stack = [];
  const push = (i, j) => { if (i < 0 || j < 0 || i >= w || j >= h) return; const k = j * w + i; if (out[k] || data[k]) return; out[k] = 1; stack.push(k); };
  for (let i = 0; i < w; i++) { push(i, 0); push(i, h - 1); }
  for (let j = 0; j < h; j++) { push(0, j); push(w - 1, j); }
  while (stack.length) { const k = stack.pop(), i = k % w, j = (k - i) / w; push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1); }
  const mask = new Uint8Array(w * h); for (let k = 0; k < w * h; k++) mask[k] = out[k] ? 0 : 1;
  return finishMask(w, h, data, mask);
}
// cursor from rows: '#' black, '.' transparent; the mask is the shape grown by one pixel (white rim)
function cursor(rows, hx, hy) {
  const h = rows.length + 2, w = Math.max(...rows.map((r) => r.length)) + 2;
  const data = new Uint8Array(w * h), shape = new Uint8Array(w * h), mask = new Uint8Array(w * h);
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#' || r[i] === 'o') { shape[(j + 1) * w + i + 1] = 1; if (r[i] === '#') data[(j + 1) * w + i + 1] = 1; } });
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let m = 0;
    for (let dj = -1; dj <= 1 && !m; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < w && b < h && shape[b * w + a]) { m = 1; break; } }
    mask[j * w + i] = m;
  }
  const c = finishMask(w, h, data, mask); c.hx = hx + 1; c.hy = hy + 1;
  return c;
}

export const CURSORS = {
  arrow: cursor(['#', '##', '###', '####', '#####', '######', '#######', '########', '#########', '######', '##.###', '#...###', '.....##', '.....###', '......##'], 0, 0),
  ibeam: cursor(['##.##', '..#', '..#', '..#', '..#', '..#', '..#', '..#', '..#', '..#', '..#', '##.##'].map((r) => r.padEnd(5, '.').replace(/^\.\.#/, '..#')), 2, 6),
  cross: cursor(['.....#', '.....#', '.....#', '.....#', '', '####...####', '', '.....#', '.....#', '.....#', '.....#'], 5, 5),
  watch: cursor(['#########', '#ooooooo#', '.#ooooo#.', '.#o###o#.', '..#o#o#..', '...#o#...', '....#....', '...#o#...', '..#ooo#..', '.#oo#oo#.', '.#o###o#.', '#ooooooo#', '#########'], 4, 6),
  eraser: cursor(['################', ...Array.from({ length: 14 }, () => '#oooooooooooooo#'), '################'], 7, 7),
  hand: cursor(['....##', '...#oo#', '...#oo#.##', '...#oo##oo#', '.##.#oo#oo#.#', '#oo##oo#oo##o#', '#ooo#oooooooo#', '.#ooooooooooo#', '..#oooooooooo#', '..#ooooooooo#', '...#oooooooo#', '....#oooooo#', '....#oooooo#'], 6, 2),
};

// ---------------------------------------------------------------- icons (32 x 32)
const poly = (g, pts) => { for (let i = 0; i < pts.length - 1; i++) g.line(...pts[i], ...pts[i + 1]); };
export const ICONS = {
  disk: makeIcon((g) => {
    poly(g, [[4, 2], [25, 2], [28, 5], [28, 29], [4, 29], [4, 2]]);
    g.frame(9, 2, 14, 10); g.fill(16, 4, 3, 6);
    g.frame(7, 15, 18, 14);
    for (const y of [19, 22, 25]) g.hline(9, 22, y);
    g.px(6, 27); g.px(26, 27);
  }),
  trash: makeIcon((g) => {
    g.frame(12, 3, 8, 3); g.clear(13, 5, 6, 1);
    g.frame(6, 6, 20, 3);
    g.line(8, 9, 10, 29); g.line(23, 9, 21, 29); g.hline(10, 21, 29); g.hline(8, 23, 9);
    for (const x of [13, 16, 19]) g.vline(x, 12, 26);
  }),
  trashFull: makeIcon((g) => {
    g.line(5, 7, 24, 3); g.line(5, 9, 24, 5); g.line(5, 7, 5, 9); g.line(24, 3, 24, 5); g.line(12, 5, 13, 2); g.line(13, 2, 18, 1); g.line(18, 1, 19, 4);
    g.frame(9, 7, 6, 4); g.line(15, 8, 21, 6); g.line(16, 9, 20, 8);
    g.line(7, 10, 6, 18); g.line(6, 18, 10, 29); g.line(24, 10, 26, 18); g.line(26, 18, 22, 29); g.hline(10, 22, 29); g.hline(7, 24, 10);
    for (const x of [12, 16, 20]) g.vline(x, 13, 26);
  }),
  folder: makeIcon((g) => {
    g.hline(3, 11, 6); g.px(2, 7); g.px(12, 7); g.vline(2, 7, 9); g.vline(12, 7, 9);
    g.frame(2, 9, 28, 18); g.hline(12, 29, 9);
  }),
  document: makeIcon((g) => {
    poly(g, [[6, 2], [20, 2], [26, 8], [26, 29], [6, 29], [6, 2]]); poly(g, [[20, 2], [20, 8], [26, 8]]);
    for (const [y, x1] of [[12, 22], [15, 22], [18, 18], [21, 22], [24, 20]]) g.hline(9, x1, y);
  }),
  picture: makeIcon((g) => {
    poly(g, [[6, 2], [20, 2], [26, 8], [26, 29], [6, 29], [6, 2]]); poly(g, [[20, 2], [20, 8], [26, 8]]);
    g.oval(9, 11, 9, 9); g.fill(13, 18, 11, 8, [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55]); g.frame(13, 18, 11, 8);
  }),
  paint: makeIcon((g) => {
    g.frame(2, 9, 22, 19); g.line(5, 22, 10, 15); g.line(10, 15, 14, 20); g.line(14, 20, 20, 13);
    g.line(29, 2, 18, 17); g.line(30, 3, 19, 18); g.line(28, 2, 30, 4);
    g.fill(16, 17, 4, 4); g.line(15, 21, 12, 25); g.line(16, 22, 13, 26); g.line(14, 21, 12, 26);
  }),
  write: makeIcon((g) => {
    g.frame(3, 6, 19, 23);
    for (const [y, x1] of [[10, 18], [13, 18], [16, 15], [19, 18], [22, 17], [25, 13]]) g.hline(6, x1, y);
    g.line(27, 2, 19, 22); g.line(30, 4, 21, 23); g.line(27, 2, 30, 4); g.line(19, 22, 20, 25); g.line(21, 23, 20, 25);
  }),
  system: makeIcon((g) => {
    g.roundRect(7, 1, 18, 26, 3); g.frame(10, 4, 12, 10); g.hline(16, 21, 19); g.hline(9, 22, 27); g.frame(8, 27, 16, 3);
  }),
  finder: makeIcon((g) => {
    poly(g, [[6, 2], [20, 2], [26, 8], [26, 29], [6, 29], [6, 2]]); poly(g, [[20, 2], [20, 8], [26, 8]]);
    g.roundRect(11, 11, 10, 14, 2); g.frame(13, 13, 6, 5); g.hline(15, 18, 21);
  }),
  clipboard: makeIcon((g) => {
    g.roundRect(5, 4, 22, 26, 3); g.fill(11, 2, 10, 5); g.clear(14, 3, 4, 2);
    for (const y of [12, 15, 18, 21, 24]) g.hline(9, 22, y);
  }),
  scrapbook: makeIcon((g) => {
    g.frame(4, 4, 24, 25); g.vline(8, 4, 28); g.frame(11, 8, 13, 10); g.line(12, 16, 16, 11); g.line(16, 11, 22, 16);
    for (const y of [21, 24]) g.hline(11, 24, y);
  }),
  notepad: makeIcon((g) => {
    g.frame(6, 5, 20, 25); for (let x = 8; x <= 24; x += 4) { g.frame(x, 3, 3, 4); }
    for (const y of [12, 15, 18, 21, 24]) g.hline(9, 23, y);
  }),
  printer: makeIcon((g) => {
    g.frame(8, 3, 16, 11); for (const y of [6, 9]) g.hline(11, 21, y);
    g.roundRect(2, 13, 28, 12, 2); g.hline(5, 26, 17); g.fill(22, 20, 4, 2); g.frame(4, 25, 4, 3); g.frame(24, 25, 4, 3);
  }),
  app: makeIcon((g) => {
    poly(g, [[16, 2], [30, 16], [16, 30], [2, 16], [16, 2]]); g.frame(12, 12, 9, 9); g.fill(14, 14, 5, 5);
  }),
  caution: makeIcon((g) => {
    poly(g, [[16, 2], [30, 28], [2, 28], [16, 2]]); poly(g, [[16, 4], [29, 28]]); g.hline(2, 30, 29);
    g.fill(15, 10, 3, 11); g.fill(15, 23, 3, 3);
  }),
  note: makeIcon((g) => {
    g.roundRect(2, 3, 28, 22, 6); g.line(9, 24, 6, 30); g.line(6, 30, 14, 24);
    g.fill(15, 7, 3, 3); g.fill(14, 12, 4, 9); g.hline(13, 18, 20);
  }),
  stop: makeIcon((g) => {
    poly(g, [[10, 2], [22, 2], [30, 10], [30, 22], [22, 30], [10, 30], [2, 22], [2, 10], [10, 2]]);
    g.fill(10, 14, 13, 4);
  }),
};

// 16 x 16 bitmaps from rows (no mask needed)
export function rowsBitmap(rows) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const data = new Uint8Array(w * h), mask = new Uint8Array(w * h).fill(1);
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') data[j * w + i] = 1; });
  return finishMask(w, h, data, mask);
}
