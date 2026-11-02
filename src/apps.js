// Desk accessories and the two applications of the re-created 1984 desktop. All original code and art.
import { textWidth, charWidth, wrapText, fmtDate, fmtTime } from './font.js';
import { Gfx, PAT, PATTERNS, W, H, rowsBitmap } from './gfx.js';

const MB = 20, TB = 19;
const hit = (x, y, rx, ry, rw, rh) => x >= rx && y >= ry && x < rx + rw && y < ry + rh;

// ---------------------------------------------------------------- shared text editing
class TextBox {
  constructor(text, width, lh = 12) { this.text = text; this.width = width; this.lh = lh; this.caret = text.length; this.anchor = this.caret; this.scroll = 0; }
  lines() { return wrapText(this.text, this.width); }
  sel() { return [Math.min(this.caret, this.anchor), Math.max(this.caret, this.anchor)]; }
  hasSel() { return this.caret !== this.anchor; }
  replace(s) { const [a, b] = this.sel(); this.text = this.text.slice(0, a) + s + this.text.slice(b); this.caret = this.anchor = a + s.length; }
  key(key) {
    if (key === 'Backspace') { if (this.hasSel()) this.replace(''); else if (this.caret > 0) { this.anchor = this.caret - 1; this.replace(''); } return true; }
    if (key === 'Enter') { this.replace('\n'); return true; }
    if (key === 'ArrowLeft') { this.caret = this.anchor = Math.max(0, this.hasSel() ? this.sel()[0] : this.caret - 1); return true; }
    if (key === 'ArrowRight') { this.caret = this.anchor = Math.min(this.text.length, this.hasSel() ? this.sel()[1] : this.caret + 1); return true; }
    if (key === 'ArrowUp' || key === 'ArrowDown') { const p = this.pos(this.caret); this.caret = this.anchor = this.index(p.x, p.line + (key === 'ArrowUp' ? -1 : 1)); return true; }
    if (key === 'Tab') { this.replace('    '); return true; }
    if (key.length === 1) { this.replace(key); return true; }
    return false;
  }
  pos(idx) {
    const L = this.lines();
    let li = L.length - 1;
    for (let i = 0; i < L.length; i++) { if (idx >= L[i].s && idx <= L[i].e && !(idx === L[i].e && L[i + 1] && L[i + 1].s === idx)) { li = i; break; } }
    const l = L[li];
    return { line: li, x: idx > l.s ? textWidth(this.text.slice(l.s, idx)) + 1 : 0 };
  }
  index(x, line) {
    const L = this.lines();
    if (line < 0) return 0;
    if (line >= L.length) return this.text.length;
    const l = L[line];
    let w = 0;
    for (let i = l.s; i < l.e; i++) { const cw = charWidth(this.text[i]); if (w + cw / 2 > x) return i; w += cw; }
    return l.e;
  }
  hit(lx, ly) { return this.index(lx, Math.floor(ly / this.lh) + this.scroll); }
  draw(g, x, y, rows, { caret = true, focused = true } = {}) {
    const L = this.lines();
    const [a, b] = this.sel();
    for (let i = 0; i < rows; i++) {
      const l = L[i + this.scroll]; if (!l) break;
      const ly = y + i * this.lh;
      g.text(this.text.slice(l.s, l.e), x, ly + 1);
      if (focused && a !== b && b > l.s && a <= l.e) {
        const x0 = a > l.s ? textWidth(this.text.slice(l.s, a)) + 1 : 0;
        const x1 = b < l.e ? textWidth(this.text.slice(l.s, b)) + 1 : textWidth(this.text.slice(l.s, l.e)) + 4;
        g.invert(x + x0 - 1, ly - 1, Math.max(2, x1 - x0 + 1), this.lh);
      }
    }
    if (focused && caret && a === b) {
      const p = this.pos(this.caret);
      const r = p.line - this.scroll;
      if (r >= 0 && r < rows) g.vline(x + p.x - 1, y + r * this.lh - 1, y + r * this.lh + this.lh - 2);
    }
  }
  ensureVisible(rows) {
    const p = this.pos(this.caret);
    if (p.line < this.scroll) this.scroll = p.line;
    if (p.line >= this.scroll + rows) this.scroll = p.line - rows + 1;
  }
}
function editCommon(tb, cmd, desk) {
  const [a, b] = tb.sel();
  if (cmd === 'selectAll') { tb.anchor = 0; tb.caret = tb.text.length; return; }
  if (cmd === 'copy' || cmd === 'cut') { if (a === b) return desk.beep(); desk.clipboard = { type: 'text', text: tb.text.slice(a, b) }; if (cmd === 'cut') tb.replace(''); return; }
  if (cmd === 'clear') { tb.replace(''); return; }
  if (cmd === 'paste') { if (desk.clipboard?.type !== 'text') return desk.beep(); tb.replace(desk.clipboard.text); }
}

// ---------------------------------------------------------------- desk accessories
class Calculator {
  static title = 'Calculator';
  constructor() { this.title = 'Calculator'; this.w = 130; this.h = 158; this.disp = '0'; this.acc = null; this.op = null; this.fresh = true; this.pressed = null; this.wantsKeys = true; this.pos = [300, 60]; }
  keys() {
    const K = [['C', 'E', '=', '*'], ['7', '8', '9', '/'], ['4', '5', '6', '-'], ['1', '2', '3', '+'], ['0', null, '.', null]];
    const out = [];
    K.forEach((row, r) => row.forEach((k, c) => {
      if (!k) return;
      let w = 26, h = 20;
      if (k === '0') w = 26 * 2 + 5;
      if (k === '+') h = 20 * 2 + 4;
      out.push({ k, x: 6 + c * 31, y: 34 + r * 24, w, h });
    }));
    return out;
  }
  draw(g, x, y) {
    g.frame(x + 6, y + 6, 118, 20);
    const s = this.disp;
    g.text(s, x + 120 - textWidth(s, true), y + 12, { bold: true });
    for (const k of this.keys()) {
      g.roundRect(x + k.x, y + k.y, k.w, k.h, 6);
      g.text(k.k, Math.round(x + k.x + k.w / 2 - textWidth(k.k, true) / 2), y + k.y + Math.round(k.h / 2) - 4, { bold: true });
      if (this.pressed === k.k) g.invert(x + k.x + 1, y + k.y + 1, k.w - 2, k.h - 2);
    }
  }
  down(lx, ly) { const k = this.keys().find((k) => hit(lx, ly, k.x, k.y, k.w, k.h)); if (k) { this.pressed = k.k; this.press(k.k); } }
  up() { this.pressed = null; }
  key(key) {
    const map = { Enter: '=', Escape: 'C', c: 'C', C: 'C', e: 'E', E: 'E', x: '*', X: '*', Backspace: 'E', ',': '.' };
    const k = map[key] || key;
    if (!'0123456789.+-*/=CE'.includes(k) || k.length !== 1) return false;
    this.press(k); this.pressed = k; this.release = 0.12;
    return true;
  }
  tick(dt) { if (this.release > 0) { this.release -= dt; if (this.release <= 0) { this.pressed = null; return true; } } return false; }
  val() { return parseFloat(this.disp) || 0; }
  fmt(v) {
    if (!isFinite(v) || Math.abs(v) >= 1e12) return 'Error';
    let s = String(Math.round(v * 1e9) / 1e9);
    if (s.length > 12) s = v.toPrecision(8).replace(/\.?0+(e|$)/, '$1');
    return s;
  }
  calc(a, op, b) { return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? NaN : a / b; }
  press(k) {
    if (this.disp === 'Error' && k !== 'C') return;
    if (/[0-9.]/.test(k)) {
      if (this.fresh) { this.disp = k === '.' ? '0.' : k; this.fresh = false; }
      else if (this.disp.length < 12 && !(k === '.' && this.disp.includes('.'))) this.disp = this.disp === '0' && k !== '.' ? k : this.disp + k;
    } else if (k === 'C') { this.disp = '0'; this.acc = null; this.op = null; this.fresh = true; }
    else if (k === 'E') { this.disp = '0'; this.fresh = true; }
    else if (k === '=') { if (this.op !== null) { this.disp = this.fmt(this.calc(this.acc, this.op, this.val())); this.op = null; this.acc = null; } this.fresh = true; }
    else {
      if (this.op !== null && !this.fresh) { const r = this.calc(this.acc, this.op, this.val()); this.disp = this.fmt(r); this.acc = r; }
      else if (this.op === null) this.acc = this.val();
      this.op = k; this.fresh = true;
    }
  }
}

class AlarmClock {
  static title = 'Alarm Clock';
  constructor() { this.title = 'Alarm Clock'; this.w = 160; this.h = 26; this.open = false; this.clock = true; this.pos = [330, 40]; }
  draw(g, x, y, active, desk) {
    const d = desk.now();
    g.text(fmtTime(d, true), x + 10, y + 9, { bold: true });
    g.frame(x + this.w - 22, y + 6, 14, 14);
    const tri = this.open ? [[3, 9], [7, 5], [11, 9]] : [[3, 5], [7, 9], [11, 5]];
    g.line(x + this.w - 22 + tri[0][0], y + 6 + tri[0][1], x + this.w - 22 + tri[1][0], y + 6 + tri[1][1]); g.line(x + this.w - 22 + tri[1][0], y + 6 + tri[1][1], x + this.w - 22 + tri[2][0], y + 6 + tri[2][1]);
    if (!this.open) return;
    g.hline(x, x + this.w - 1, y + 26);
    g.text(fmtDate(d), x + 10, y + 34);
    g.hline(x, x + this.w - 1, y + 48);
    g.text('Alarm: off', x + 10, y + 56);
  }
  down(lx, ly) { if (hit(lx, ly, this.w - 22, 6, 14, 14)) { this.open = !this.open; this.h = this.open ? 70 : 26; } }
}

class NotePad {
  static title = 'Note Pad';
  constructor(desk) {
    this.title = 'Note Pad'; this.w = 216; this.h = 172; this.wantsKeys = true; this.pos = [150, 70];
    desk.notes ??= ['Notes typed here are kept while the Mac is on.\n\nClick the folded corner to turn the page.', '', '', '', '', '', '', ''];
    this.desk = desk; this.page = desk.notePage || 0; this.tb = new TextBox(desk.notes[this.page], 196);
  }
  get rows() { return 12; }
  draw(g, x, y, active, desk) {
    this.tb.draw(g, x + 10, y + 8, this.rows, { caret: desk.caretOn, focused: active });
    const label = String(this.page + 1);
    g.text(label, Math.round(x + this.w / 2 - textWidth(label) / 2), y + this.h - 14);
    // folded corner: the flap, with the next page showing under it
    const fy = y + this.h - 18;
    for (let j = 1; j < 18; j++) for (let i = 0; i < j; i++) g.px(x + i, fy + j, ((x + i + fy + j) & 1) === 0 ? 1 : 0);
    g.line(x, fy, x + 17, fy + 17); g.hline(x, x + 17, fy); g.vline(x + 17, fy, fy + 17);
  }
  turn(dir) {
    this.desk.notes[this.page] = this.tb.text;
    this.page = (this.page + dir + 8) % 8; this.desk.notePage = this.page;
    this.tb = new TextBox(this.desk.notes[this.page], 196);
  }
  down(lx, ly, mods) {
    if (lx < 18 && ly > this.h - 18) { this.turn(mods?.shift ? -1 : 1); return; }
    if (hit(lx, ly, 6, 6, 204, this.rows * 12)) { this.tb.caret = this.tb.anchor = this.tb.hit(lx - 10, ly - 8); this.dragging = true; }
  }
  drag(lx, ly) { if (this.dragging) this.tb.caret = this.tb.hit(lx - 10, ly - 8); }
  up() { this.dragging = false; }
  key(key, mods, desk) {
    if (!this.change(() => this.tb.key(key))) return false;
    return true;
  }
  // make an edit, undoing it with a beep if the page would overflow
  change(fn) {
    const { text, caret, anchor } = this.tb;
    const r = fn();
    if (this.tb.lines().length > this.rows) { Object.assign(this.tb, { text, caret, anchor }); this.desk.beep(); }
    this.desk.notes[this.page] = this.tb.text;
    return r;
  }
  cursor(lx, ly) { return ly < this.rows * 12 + 8 ? 'ibeam' : 'arrow'; }
  canEdit(cmd) { return cmd === 'paste' ? this.desk.clipboard?.type === 'text' : cmd === 'selectAll' || this.tb.hasSel(); }
  edit(cmd, desk) { this.change(() => editCommon(this.tb, cmd, desk)); }
  close() { this.desk.notes[this.page] = this.tb.text; }
}

class Scrapbook {
  static title = 'Scrapbook';
  constructor(desk) {
    this.title = 'Scrapbook'; this.w = 300; this.h = 186; this.desk = desk; this.pos = [100, 80];
    desk.scraps ??= [{ type: 'picture', bm: scrapPicture() }, { type: 'text', text: 'The Scrapbook keeps pictures and text you copy, so you can paste them into other documents later.' }, { type: 'picture', bm: patternSampler() }];
    this.i = 0;
  }
  draw(g, x, y) {
    const s = this.desk.scraps[this.i];
    if (s?.type === 'picture') { const bx = x + Math.round((this.w - s.bm.w) / 2), by = y + 8 + Math.round((140 - s.bm.h) / 2); g.blit(s.bm, bx, by); }
    else if (s) { const L = wrapText(s.text, 260); L.slice(0, 10).forEach((l, k) => g.text(s.text.slice(l.s, l.e), x + 20, y + 14 + k * 13)); }
    const n = this.desk.scraps.length;
    g.text(n ? `${this.i + 1}/${n}` : 'Empty', x + 8, y + 152);
    const by = y + this.h - 18;
    g.frame(x - 1, by, this.w + 2, 18);
    g.fill(x + 16, by + 1, this.w - 32, 16, PAT.gray);
    g.vline(x + 15, by, by + 17); g.vline(x + this.w - 16, by, by + 17);
    const tx = x + 16 + (n > 1 ? Math.round((this.i / (n - 1)) * (this.w - 48)) : 0);
    g.clear(tx, by + 1, 16, 16); g.frame(tx, by, 16, 18);
    arrowGlyph(g, x + 3, by + 4, 'left'); arrowGlyph(g, x + this.w - 13, by + 4, 'right');
  }
  down(lx, ly) {
    const n = this.desk.scraps.length; if (!n) return;
    if (ly > this.h - 18) { if (lx < 16) this.i = (this.i + n - 1) % n; else if (lx > this.w - 16) this.i = (this.i + 1) % n; else this.i = Math.round(((lx - 24) / (this.w - 48)) * (n - 1)); this.i = Math.max(0, Math.min(n - 1, this.i)); }
  }
  canEdit(cmd) { return cmd === 'paste' ? !!this.desk.clipboard : cmd !== 'selectAll' && this.desk.scraps.length > 0; }
  edit(cmd, desk) {
    const s = desk.scraps[this.i];
    if ((cmd === 'copy' || cmd === 'cut') && s) { desk.clipboard = s.type === 'text' ? { type: 'text', text: s.text } : { type: 'picture', bm: s.bm }; }
    if ((cmd === 'cut' || cmd === 'clear') && s) { desk.scraps.splice(this.i, 1); this.i = Math.max(0, Math.min(this.i, desk.scraps.length - 1)); }
    if (cmd === 'paste' && desk.clipboard) { desk.scraps.splice(this.i, 0, desk.clipboard.type === 'text' ? { type: 'text', text: desk.clipboard.text } : { type: 'picture', bm: desk.clipboard.bm }); }
  }
}

const KEYROWS = [
  ['`1234567890-=', [['Backspace', 30]]],
  ['qwertyuiop[]\\', [], [['Tab', 30]]],
  ['asdfghjkl;\'', [['Enter', 36]], [['Caps', 36]]],
  ['zxcvbnm,./', [['Shift', 46]], [['Shift', 46]]],
];
class KeyCaps {
  static title = 'Key Caps';
  constructor() { this.title = 'Key Caps'; this.w = 330; this.h = 124; this.text = ''; this.lit = null; this.litT = 0; this.wantsKeys = true; this.shift = false; this.pos = [90, 190]; }
  layout() {
    if (this._layout) return this._layout;
    const out = [];
    KEYROWS.forEach(([chars, right, left = []], r) => {
      let x = 6; const y = 30 + r * 19;
      for (const [k, w] of left) { out.push({ k, label: k === 'Caps' ? 'Lock' : k, x, y, w, h: 17 }); x += w + 2; }
      for (const ch of chars) { out.push({ k: ch, label: ch, x, y, w: 18, h: 17 }); x += 20; }
      for (const [k, w] of right) { out.push({ k, label: k === 'Backspace' ? 'Back' : k === 'Enter' ? 'Ret' : k, x, y, w, h: 17 }); x += w + 2; }
    });
    const y = 30 + 4 * 19;
    out.push({ k: 'Alt', label: 'Opt', x: 6, y, w: 32, h: 17 }, { k: 'Meta', label: '\u2318', x: 40, y, w: 32, h: 17 }, { k: ' ', label: '', x: 74, y, w: 170, h: 17 }, { k: 'Enter', label: 'Ent', x: 246, y, w: 32, h: 17 }, { k: 'Alt', label: 'Opt', x: 280, y, w: 32, h: 17 });
    return (this._layout = out);
  }
  draw(g, x, y) {
    g.frame(x + 6, y + 6, this.w - 12, 20);
    g.text(this.text.slice(-46), x + 10, y + 12);
    for (const k of this.layout()) {
      g.roundRect(x + k.x, y + k.y, k.w, k.h, 4);
      const label = k.label.length === 1 && this.shift ? shifted(k.label) : k.label;
      if (label) g.text(label, Math.round(x + k.x + k.w / 2 - textWidth(label) / 2), y + k.y + Math.max(2, Math.round(k.h / 2) - 4));
      if (this.lit === k.k) g.invert(x + k.x + 1, y + k.y + 1, k.w - 2, k.h - 2);
    }
  }
  type(k) {
    if (k === 'Backspace') this.text = this.text.slice(0, -1);
    else if (k.length === 1) this.text += this.shift ? shifted(k) : k;
    this.lit = k.length === 1 ? k.toLowerCase() : k; this.litT = 0.18;
  }
  down(lx, ly) { const k = this.layout().find((k) => hit(lx, ly, k.x, k.y, k.w, k.h)); if (k) { if (k.k === 'Shift') this.shift = !this.shift; else this.type(k.k); } }
  key(key, mods) { this.shift = !!mods.shift; if (key === 'Shift') return true; this.type(key.length === 1 ? key.toLowerCase() : key); if (key.length === 1 && mods.shift) { this.text = this.text.slice(0, -1) + key; } return true; }
  tick(dt) { if (this.litT > 0) { this.litT -= dt; if (this.litT <= 0) { this.lit = null; return true; } } return false; }
}
const SHIFTED = { '`': '~', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?' };
const shifted = (c) => SHIFTED[c] || c.toUpperCase();

class ControlPanel {
  static title = 'Control Panel';
  constructor(desk) { this.title = 'Control Panel'; this.w = 330; this.h = 170; this.desk = desk; this.clock = true; this.pat = desk.settings.pattern.slice(); this.pi = 2; this.pos = [90, 60]; }
  draw(g, x, y, active, desk) {
    const s = desk.settings;
    g.vline(x + 170, y, y + this.h - 1); g.hline(x, x + this.w - 1, y + 44); g.hline(x, x + this.w - 1, y + 126); g.hline(x + 170, x + this.w - 1, y + 86);
    // time and date
    const d = desk.now();
    g.text(fmtTime(d, true), x + 12, y + 9, { bold: true }); g.text(fmtDate(d), x + 12, y + 26);
    // speaker volume: 0..7
    g.text('Speaker Volume', x + 182, y + 6);
    g.hline(x + 186, x + 312, y + 32);
    for (let i = 0; i < 8; i++) { const tx = x + 186 + i * 18; g.vline(tx, y + 28, y + 36); }
    const vx = x + 186 + s.volume * 18; g.clear(vx - 4, y + 25, 9, 14); g.frame(vx - 4, y + 25, 9, 14);
    // desktop pattern editor
    g.text('Desktop Pattern', x + 12, y + 50);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const on = (this.pat[j] >> (7 - i)) & 1; g.frame(x + 14 + i * 7, y + 64 + j * 7, 7, 7); if (on) g.fill(x + 15 + i * 7, y + 65 + j * 7, 5, 5); }
    g.fill(x + 90, y + 64, 56, 40, this.pat); g.frame(x + 90, y + 64, 56, 40);
    g.frame(x + 89, y + 106, 13, 13); arrowGlyph(g, x + 91, y + 108, 'left');
    g.frame(x + 134, y + 106, 13, 13); arrowGlyph(g, x + 136, y + 108, 'right');
    // double-click speed and caret blinking
    g.text('Double-Click Speed', x + 182, y + 50);
    this.radios(g, x + 186, y + 66, s.dbl);
    g.text('Caret Blinking', x + 182, y + 92);
    this.radios(g, x + 186, y + 108, s.blink);
    // mouse tracking and menu blinking
    g.text('Mouse', x + 12, y + 134); g.text('Slow', x + 30, y + 152); g.text('Fast', x + 100, y + 152);
    this.radio(g, x + 16, y + 152, s.tracking === 0); this.radio(g, x + 86, y + 152, s.tracking === 1);
    g.text('Menu Blinking', x + 182, y + 134);
    this.radios(g, x + 186, y + 150, s.menuBlink ?? 2, ['Off', '1', '3']);
  }
  radio(g, x, y, on) { g.oval(x, y, 10, 10); if (on) g.oval(x + 2, y + 2, 6, 6, PAT.black); }
  radios(g, x, y, v, labels = ['Slow', '', 'Fast']) { for (let i = 0; i < 3; i++) { this.radio(g, x + i * 44, y, v === i); if (labels[i]) g.text(labels[i], x + i * 44 + 14, y + 1); } }
  down(lx, ly, mods, desk) {
    const s = desk.settings;
    if (lx > 180 && ly > 20 && ly < 42) { s.volume = Math.max(0, Math.min(7, Math.round((lx - 186) / 18))); desk.hooks.setVolume?.(s.volume / 7); desk.hooks.beep?.(); return; }
    if (hit(lx, ly, 14, 64, 56, 56)) { const i = Math.floor((lx - 14) / 7), j = Math.floor((ly - 64) / 7); this.pat[j] ^= 1 << (7 - i); this.paint = (this.pat[j] >> (7 - i)) & 1; return; }
    if (hit(lx, ly, 89, 106, 13, 13)) { this.pi = (this.pi + PATTERNS.length - 1) % PATTERNS.length; this.pat = PATTERNS[this.pi].slice(); return; }
    if (hit(lx, ly, 134, 106, 13, 13)) { this.pi = (this.pi + 1) % PATTERNS.length; this.pat = PATTERNS[this.pi].slice(); return; }
    if (hit(lx, ly, 90, 64, 56, 40)) { s.pattern = this.pat.slice(); return; }
    const pick = (y0) => (ly >= y0 - 2 && ly < y0 + 12 && lx >= 186 ? Math.max(0, Math.min(2, Math.floor((lx - 186) / 44))) : -1);
    let r = pick(66); if (r >= 0) { s.dbl = r; return; }
    r = pick(108); if (r >= 0) { s.blink = r; return; }
    r = pick(150); if (r >= 0) { s.menuBlink = r; return; }
    if (ly >= 150 && ly < 164) { if (lx >= 16 && lx < 80) s.tracking = 0; else if (lx >= 86 && lx < 140) s.tracking = 1; }
  }
  drag(lx, ly) { if (this.paint !== undefined && hit(lx, ly, 14, 64, 56, 56)) { const i = Math.floor((lx - 14) / 7), j = Math.floor((ly - 64) / 7); if (this.paint) this.pat[j] |= 1 << (7 - i); else this.pat[j] &= ~(1 << (7 - i)); } }
  up() { this.paint = undefined; }
}

class Puzzle {
  static title = 'Puzzle';
  constructor() {
    this.title = 'Puzzle'; this.w = 100; this.h = 100; this.pos = [380, 200];
    this.t = [...Array(15).keys()].map((i) => i + 1).concat(0);
    let e = 15, last = -1;
    for (let k = 0; k < 240; k++) {
      const nb = [e - 4, e + 4, e % 4 ? e - 1 : -1, e % 4 !== 3 ? e + 1 : -1].filter((n) => n >= 0 && n < 16 && n !== last);
      const n = nb[Math.floor(Math.random() * nb.length)];
      [this.t[e], this.t[n]] = [this.t[n], this.t[e]]; last = e; e = n;
    }
    this.won = 0;
  }
  draw(g, x, y) {
    this.t.forEach((v, i) => {
      if (!v) return;
      const tx = x + 2 + (i % 4) * 24, ty = y + 2 + Math.floor(i / 4) * 24;
      g.frame(tx, ty, 24, 24);
      const s = String(v);
      g.text(s, Math.round(tx + 12 - textWidth(s, true) / 2), ty + 8, { bold: true });
    });
    if (this.won > 0) g.invert(x, y, this.w, this.h);
  }
  down(lx, ly, mods, desk) {
    const c = Math.floor((lx - 2) / 24), r = Math.floor((ly - 2) / 24);
    if (c < 0 || c > 3 || r < 0 || r > 3) return;
    const i = r * 4 + c, e = this.t.indexOf(0), er = Math.floor(e / 4), ec = e % 4;
    if (r !== er && c !== ec) return desk.beep();
    const step = r === er ? (c > ec ? 1 : -1) : (r > er ? 4 : -4);
    for (let k = e; k !== i; k += step) this.t[k] = this.t[k + step];
    this.t[i] = 0;
    if (this.t.every((v, k) => v === (k + 1) % 16)) { this.won = 0.6; desk.hooks.beep?.(); }
  }
  tick(dt) { if (this.won > 0) { this.won -= dt; return true; } return false; }
}

export const DESK_ACCESSORIES = [Scrapbook, AlarmClock, NotePad, Calculator, KeyCaps, ControlPanel, Puzzle];

function arrowGlyph(g, x, y, dir) {
  const rows = ['....#....', '...#.#...', '..#...#..', '.#.....#.', '###...###', '..#...#..', '..#...#..', '..#...#..', '..#####..'];
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) if (rows[j][i] === '#') {
    const [a, b] = dir === 'up' ? [i, j] : dir === 'down' ? [i, 8 - j] : dir === 'left' ? [j, i] : [8 - j, i];
    g.px(x + a, y + b);
  }
}

// ---------------------------------------------------------------- pictures (original drawings)
function canvasBitmap(w, h, draw) {
  const data = new Uint8Array(w * h);
  draw(new Gfx(data, w, h, 1));
  return { w, h, data, mask: new Uint8Array(w * h).fill(1), edge: new Uint8Array(w * h) };
}
function scrapPicture() {
  return canvasBitmap(220, 128, (g) => {
    g.frame(0, 0, 220, 128);
    g.fill(1, 1, 218, 70, PAT.white);
    g.oval(150, 12, 34, 34, PAT.white);
    for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; g.line(167 + Math.cos(t) * 21, 29 + Math.sin(t) * 21, 167 + Math.cos(t) * 27, 29 + Math.sin(t) * 27); }
    g.oval(-40, 70, 170, 90, PAT.ltGray); g.oval(80, 80, 190, 90, PAT.gray);
    g.fill(40, 54, 50, 34, PAT.white); g.frame(40, 54, 50, 34);
    g.line(36, 56, 65, 32); g.line(65, 32, 94, 56); g.line(36, 56, 94, 56);
    g.fill(58, 70, 12, 18, PAT.dkGray); g.frame(74, 62, 10, 10); g.hline(74, 83, 66); g.vline(78, 62, 71);
    for (const [bx, by] of [[110, 24], [124, 18], [98, 34]]) { g.line(bx, by, bx + 4, by + 3); g.line(bx + 4, by + 3, bx + 8, by); }
  });
}
function patternSampler() {
  return canvasBitmap(200, 110, (g) => {
    PATTERNS.slice(0, 18).forEach((p, i) => { const x = 4 + (i % 6) * 32, y = 4 + Math.floor(i / 6) * 34; g.fill(x, y, 30, 32, p); g.frame(x, y, 30, 32); });
  });
}
export function samplePainting() {
  const c = canvasBitmap(418, 248, (g) => {
    g.oval(300, 20, 60, 60, PATTERNS[4]); g.oval(300, 20, 60, 60);
    g.oval(-80, 150, 340, 190, PAT.ltGray); g.oval(170, 170, 340, 170, PAT.gray);
    g.fill(70, 112, 110, 70, PAT.white); g.frame(70, 112, 110, 70, 1, 2);
    g.line(60, 116, 125, 62, 1, 2); g.line(125, 62, 190, 116, 1, 2); g.line(60, 116, 190, 116, 1, 2);
    g.fill(110, 140, 26, 42, PAT.dkGray); g.frame(110, 140, 26, 42);
    g.fill(148, 128, 22, 20, PAT.white); g.frame(148, 128, 22, 20); g.hline(148, 169, 137); g.vline(158, 128, 147);
    g.fill(82, 128, 20, 18, PATTERNS[10]); g.frame(82, 128, 20, 18);
    g.fill(250, 120, 10, 60, PAT.dkGray); g.oval(220, 70, 70, 64, PATTERNS[13]); g.oval(220, 70, 70, 64);
    for (const [bx, by] of [[220, 30], [238, 22], [204, 40], [252, 36]]) { g.line(bx, by, bx + 5, by + 4); g.line(bx + 5, by + 4, bx + 10, by); }
    g.text('Hello from 1984', 280, 210, { bold: true });
  });
  return c.data;
}

// ---------------------------------------------------------------- Paint
const CW = 418, CH = 248;
const PAINT_WIN = { x: 88, y: 24, w: 420, h: 268 };
const TOOLS = ['select', 'lasso', 'hand', 'text', 'bucket', 'spray', 'brush', 'pencil', 'line', 'eraser', 'rect', 'frect', 'rrect', 'frrect', 'oval', 'foval', 'free', 'ffree', 'poly', 'fpoly'];
const TOOL_ICONS = (() => {
  const bm = (rows) => rowsBitmap(rows);
  const draw = (w, h, fn) => { const d = new Uint8Array(w * h); fn(new Gfx(d, w, h, 1)); return { w, h, data: d, mask: new Uint8Array(w * h).fill(1), edge: new Uint8Array(w * h) }; };
  return {
    select: draw(18, 12, (g) => { for (let i = 0; i < 18; i += 2) { g.px(i, 0); g.px(i, 11); } for (let j = 0; j < 12; j += 2) { g.px(0, j); g.px(17, j); } }),
    lasso: bm(['...######...', '..#......#..', '.#........#.', '#..........#', '#..........#', '.#........#.', '..###..###..', '.....##.....', '....#.......', '.....#......', '....#.......']),
    hand: bm(['....##.....', '...#..#.##.', '...#..##..#', '.##.#..#..#', '#..##..#..#', '#...#.....#', '.#........#', '..#......#.', '...#.....#.', '...######..']),
    text: draw(12, 12, (g) => { g.text('A', 3, 1, { bold: true }); }),
    bucket: bm(['....##......', '...#..#.....', '..#....#....', '.#.#....#...', '#...#....#..', '#....#..#.#.', '.#....##...#', '..#...#....#', '...#.#.....#', '....#.......']),
    spray: bm(['.#.#.#.......', '..#.#........', '.#.#.#.......', '......#####..', '......#...#..', '.....#######.', '.....#.....#.', '.....#.....#.', '.....#.....#.', '.....#######.']),
    brush: bm(['........##', '.......#.#', '......#.#.', '.....#.#..', '....###...', '...#.#....', '..#..#....', '.###......', '####......', '###.......']),
    pencil: bm(['.......##.', '......#..#', '.....#..#.', '....#..#..', '...#..#...', '..#..#....', '.##.#.....', '.####.....', '###.......', '#.........']),
    line: draw(14, 12, (g) => g.line(1, 10, 12, 1)),
    eraser: bm(['....#######', '...#.....##', '..#.....#.#', '.#.....#..#', '#######...#', '#.....#..#.', '#.....#.#..', '#######....']),
    rect: draw(16, 11, (g) => g.frame(0, 0, 16, 11)), frect: draw(16, 11, (g) => { g.fill(0, 0, 16, 11, PAT.gray); g.frame(0, 0, 16, 11); }),
    rrect: draw(16, 11, (g) => g.roundRect(0, 0, 16, 11, 4)), frrect: draw(16, 11, (g) => g.roundRect(0, 0, 16, 11, 4, PAT.gray)),
    oval: draw(16, 12, (g) => g.oval(0, 0, 16, 12)), foval: draw(16, 12, (g) => g.oval(0, 0, 16, 12, PAT.gray)),
    free: bm(['..####......', '.#....##....', '#.......#...', '#........##.', '.#.........#', '..#.......#.', '...##...##..', '.....###....']),
    ffree: bm(['..####......', '.#.#.###....', '#.#.#.#.#...', '#..#.#.#.##.', '.#.#.#.#.#.#', '..#.#.#.#.#.', '...##.#.##..', '.....###....']),
    poly: draw(16, 12, (g) => { g.line(0, 11, 4, 0); g.line(4, 0, 15, 3); g.line(15, 3, 12, 11); g.line(12, 11, 0, 11); }),
    fpoly: draw(16, 12, (g) => { for (let y = 1; y < 11; y++) for (let x = 2; x < 13; x++) if (((x + y) & 1) === 0 && x > 4 - y / 3 && x < 14 - y / 4) g.px(x, y); g.line(0, 11, 4, 0); g.line(4, 0, 15, 3); g.line(15, 3, 12, 11); g.line(12, 11, 0, 11); }),
  };
})();
const WIDTHS = [1, 2, 3, 5, 8];
const BRUSHES = [
  (g, x, y, p) => g.oval(x - 3, y - 3, 7, 7, p, false),
  (g, x, y, p) => g.fill(x - 3, y - 3, 6, 6, p),
  (g, x, y, p) => g.fill(x - 5, y, 11, 2, p),
  (g, x, y, p) => { for (let i = -4; i <= 4; i++) { g.fill(x + i, y - i, 2, 1, p); } },
];

// OR the black pixels of a floating selection into a canvas-sized buffer
function stamp(buf, f) {
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
    const x = f.x + i, y = f.y + j;
    if (x >= 0 && y >= 0 && x < CW && y < CH && f.bits[j * f.w + i]) buf[y * CW + x] = 1;
  }
}
// is (i, j) of a selection rectangle part of the selection? (a lasso selection carries a mask)
const inSel = (s, i, j) => !s.mask || s.mask[j * s.w + i] === 1;
// even-odd scanline spans of a polygon for rows y0..y1: cb(y, left, right)
function polySpans(pts, y0, y1, cb) {
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) cb(y, Math.ceil(xs[i]), Math.floor(xs[i + 1]));
  }
}
const span = (vals) => vals.reduce((r, v) => [Math.min(r[0], v), Math.max(r[1], v)], [Infinity, -Infinity]);

export class PaintApp {
  constructor(desk, doc) {
    this.desk = desk; this.doc = doc; this.name = 'Paint';
    this.canvas = new Uint8Array(CW * CH);
    if (doc?.bitmap) this.canvas.set(doc.bitmap);
    this.cg = new Gfx(this.canvas, CW, CH, 1);
    this.tool = 'pencil'; this.pat = PAT.black; this.patIndex = 0; this.width = 0; this.brush = 0;
    this.undoBuf = null; this.dirtyDoc = false; this.grid = false; this.fat = null;
    this.sel = null; this.float = null; this.text = null; this.poly = null; this.path = null; this.lastToolClick = { t: -9, tool: null };
    this.title = doc ? doc.name : 'untitled';
    // the document window; the desktop tracks clicks in its close box
    this.win = { ...PAINT_WIN, title: this.title, closable: true };
  }
  menus() {
    const d = this.desk, sel = !!this.sel;
    return [
      { title: 'File', items: [
        { label: 'New', action: () => this.confirm(() => { this.doc = null; this.title = 'untitled'; this.load(null); }) },
        { label: 'Close', action: () => this.close() },
        { label: 'Save', key: 'S', action: () => this.save() },
        { label: 'Save As…', enabled: false }, { label: 'Revert', enabled: () => !!this.doc && this.dirtyDoc, action: () => this.load(this.doc.bitmap) }, '-',
        { label: 'Print…', enabled: false }, '-',
        { label: 'Quit', key: 'Q', action: () => this.close() },
      ] },
      { title: 'Edit', items: [
        { label: 'Undo', key: 'Z', enabled: () => !!this.undoBuf, action: () => this.undo() }, '-',
        { label: 'Cut', key: 'X', enabled: () => sel, action: () => { this.snapshot(); this.copySel(); this.fillSel(PAT.white); } },
        { label: 'Copy', key: 'C', enabled: () => sel, action: () => this.copySel() },
        { label: 'Paste', key: 'V', enabled: () => d.clipboard?.type === 'picture', action: () => this.paste() },
        { label: 'Clear', enabled: () => true, action: () => { if (this.sel) { this.snapshot(); this.fillSel(PAT.white); } else { this.commit(); this.snapshot(); this.canvas.fill(0); this.dirtyDoc = true; } } }, '-',
        { label: 'Invert', enabled: () => true, action: () => { this.commit(); this.snapshot(); this.paintSel((v) => v ^ 1); } },
        { label: 'Fill', enabled: () => sel, action: () => { this.snapshot(); this.fillSel(this.pat); } },
      ] },
      { title: 'Goodies', items: [
        { label: 'Grid', check: () => this.grid, action: () => { this.grid = !this.grid; } },
        { label: 'FatBits', check: () => !!this.fat, action: () => this.toggleFat(CW / 2, CH / 2) },
        { label: 'Brush Shape', action: () => { this.commit(); this.sel = null; this.brush = (this.brush + 1) % BRUSHES.length; this.tool = 'brush'; } },
        { label: 'Introduction', action: () => d.alert('note', ['Choose a tool on the left and a pattern', 'below, then draw in the window.', 'Double-click the eraser to erase all;', 'double-click the pencil for FatBits.'], ['OK']) },
      ] },
    ];
  }
  about() { this.desk.alert('note', ['Paint', 'A small painting program for this', 're-created desktop.'], ['OK']); }
  // File > Close, Quit and the window's close box: offer to save, then back to the Finder
  close() { this.confirm(() => this.desk.quitApp()); }
  confirm(then) {
    this.commit();
    if (!this.dirtyDoc) return then();
    this.desk.alert('caution', [`Save changes to “${this.title}”?`], ['Cancel', 'No', 'Yes'], (b) => { if (b === 'Yes') { if (this.save()) then(); } else if (b === 'No') then(); });
  }
  save() {
    this.commit();
    const it = this.desk.saveDocument('paint', 'Painting', { bitmap: this.canvas.slice() }, this.doc);
    if (!it) return false;
    this.doc = it; this.title = it.name; this.dirtyDoc = false;
    return true;
  }
  // start over with a picture (or a blank page): nothing selected, floating, typed or undoable
  load(bitmap) {
    if (bitmap) this.canvas.set(bitmap); else this.canvas.fill(0);
    this.sel = this.float = this.text = this.poly = this.path = null;
    this.mode = null; this.drag0 = null; this.undoBuf = null; this.dirtyDoc = false;
  }
  // what Undo goes back to: the picture as it looks now, including anything floating
  snapshot() { const b = this.canvas.slice(); if (this.float) stamp(b, this.float); this.undoBuf = b; }
  undo() {
    if (!this.undoBuf) return;
    const cur = this.canvas.slice(); if (this.float) stamp(cur, this.float);
    this.canvas.set(this.undoBuf); this.undoBuf = cur;
    this.sel = this.float = this.text = this.poly = this.path = null;
    this.dirtyDoc = true;
  }
  content() { return { x: PAINT_WIN.x + 1, y: PAINT_WIN.y + TB, w: CW, h: CH }; }
  toCanvas(x, y) {
    const c = this.content();
    if (this.fat) return { x: this.fat.x + Math.floor((x - c.x) / 8), y: this.fat.y + Math.floor((y - c.y) / 8) };
    let cx = x - c.x, cy = y - c.y;
    if (this.grid && ['rect', 'frect', 'rrect', 'frrect', 'oval', 'foval', 'line'].includes(this.tool)) { cx = Math.round(cx / 8) * 8; cy = Math.round(cy / 8) * 8; }
    return { x: cx, y: cy };
  }
  toggleFat(cx, cy) { this.commit(); this.fat = this.fat ? null : { x: Math.max(0, Math.min(CW - 52, Math.round(cx - 26))), y: Math.max(0, Math.min(CH - 31, Math.round(cy - 15))) }; }
  // ---- input
  down(x, y, mods) {
    const d = this.desk;
    // tool palette
    if (hit(x, y, 8, 24, 72, 200)) {
      const c = Math.floor((x - 8) / 36), r = Math.floor((y - 24) / 20), t = TOOLS[r * 2 + c];
      const dbl = d.t - this.lastToolClick.t < 0.45 && this.lastToolClick.tool === t;
      this.lastToolClick = { t: d.t, tool: t };
      this.commit();
      if (t !== 'select' && t !== 'lasso') this.sel = null;
      if (dbl && t === 'eraser') { this.snapshot(); this.canvas.fill(0); this.dirtyDoc = true; }
      if (dbl && t === 'pencil') this.toggleFat(CW / 2, CH / 2);
      this.tool = t; return;
    }
    if (hit(x, y, 8, 232, 72, 58)) { this.width = Math.max(0, Math.min(4, Math.floor((y - 234) / 11))); return; }
    if (hit(x, y, 92, 296, 408, 42)) { const i = Math.floor((x - 92) / 34) + 12 * Math.floor((y - 297) / 20); if (PATTERNS[i]) { this.pat = PATTERNS[i]; this.patIndex = i; } return; }
    const c = this.content();
    if (!hit(x, y, c.x, c.y, c.w, c.h)) { if (this.text) this.commit(); return; }
    const p = this.toCanvas(x, y);
    this.drag0 = p; this.last = p;
    if (this.fat) {
      // the hand moves the magnified view; any other tool flips pixels
      if (this.tool === 'hand') { this.mode = 'hand'; this.handFrom = { x, y, fx: this.fat.x, fy: this.fat.y }; return; }
      if (x - c.x < 58 && y - c.y < 37) { this.drag0 = null; return; } // the actual-size view in the corner hides those cells
      this.commit(); this.sel = null;
      this.snapshot(); this.fatInk = this.cg.get(p.x, p.y) ? 0 : 1; this.cg.px(p.x, p.y, this.fatInk); this.dirtyDoc = true; this.mode = 'fat'; return;
    }
    const t = this.tool;
    if (t === 'select' || t === 'lasso') {
      const s = this.sel;
      if (s && hit(p.x, p.y, s.x, s.y, s.w, s.h)) { this.commit(); this.liftSelection(); this.mode = 'moveSel'; this.selOff = { x: p.x - this.float.x, y: p.y - this.float.y }; return; }
      this.commit(); this.sel = null;
      if (t === 'lasso') { this.path = [p]; this.mode = 'lasso'; } else this.mode = 'select';
      return;
    }
    // every other tool puts down whatever is floating and drops the selection;
    // a polygon in progress stays open while the polygon tool adds corners to it
    if (!((t === 'poly' || t === 'fpoly') && this.poly)) this.commit();
    this.sel = null;
    if (t === 'hand') { this.mode = 'hand'; return; } // the page is the size of the window: nothing to scroll
    if (t === 'text') { this.text = { x: p.x, y: p.y - 6, s: '' }; return; }
    if (t === 'poly' || t === 'fpoly') {
      if (!this.poly) this.poly = [p];
      else {
        const s = this.poly[0];
        // click on the first corner, or double-click, to finish
        if ((Math.abs(p.x - s.x) < 4 && Math.abs(p.y - s.y) < 4) || d.t - (this.polyT || 0) < 0.4) { this.finishPoly(); this.mode = null; return; }
        this.poly.push(p);
      }
      this.polyT = d.t; this.mode = null; return;
    }
    this.snapshot(); this.dirtyDoc = true;
    const g = this.cg;
    if (t === 'pencil') { this.ink = g.get(p.x, p.y) ? 0 : 1; g.px(p.x, p.y, this.ink); this.mode = 'pencil'; return; }
    if (t === 'brush') { BRUSHES[this.brush](g, p.x, p.y, this.pat); this.mode = 'brush'; return; }
    if (t === 'eraser') { g.fill(p.x - 8, p.y - 8, 16, 16, PAT.white); this.mode = 'eraser'; return; }
    if (t === 'spray') { this.spray(p); this.mode = 'spray'; return; }
    if (t === 'bucket') { this.flood(p.x, p.y); this.mode = null; return; }
    if (t === 'free' || t === 'ffree') { this.path = [p]; this.mode = 'free'; return; }
    this.mode = 'shape';
  }
  move(x, y) { this.hover = { x, y }; }
  drag(x, y, mods) {
    this.hover = { x, y };
    if (this.mode === 'hand') {
      const h = this.handFrom;
      if (this.fat && h) {
        this.fat.x = Math.max(0, Math.min(CW - 52, h.fx - Math.round((x - h.x) / 8)));
        this.fat.y = Math.max(0, Math.min(CH - 31, h.fy - Math.round((y - h.y) / 8)));
      }
      return;
    }
    const p = this.toCanvas(x, y), g = this.cg;
    const a = this.last || p;
    if (this.mode === 'fat') g.line(a.x, a.y, p.x, p.y, this.fatInk);
    else if (this.mode === 'pencil') g.line(a.x, a.y, p.x, p.y, this.ink);
    else if (this.mode === 'brush') { const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / 2)); for (let i = 1; i <= n; i++) BRUSHES[this.brush](g, Math.round(a.x + ((p.x - a.x) * i) / n), Math.round(a.y + ((p.y - a.y) * i) / n), this.pat); }
    else if (this.mode === 'eraser') { const n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / 4)); for (let i = 1; i <= n; i++) g.fill(Math.round(a.x + ((p.x - a.x) * i) / n) - 8, Math.round(a.y + ((p.y - a.y) * i) / n) - 8, 16, 16, PAT.white); }
    else if (this.mode === 'spray') this.spray(p);
    else if ((this.mode === 'free' || this.mode === 'lasso') && this.path) this.path.push(p);
    else if (this.mode === 'moveSel') { this.float.x = p.x - this.selOff.x; this.float.y = p.y - this.selOff.y; this.sel = { ...this.sel, x: this.float.x, y: this.float.y }; }
    this.last = p;
  }
  up(x, y) {
    const p = this.toCanvas(x, y), a = this.drag0, g = this.cg, pen = WIDTHS[this.width];
    if (this.mode === 'shape' && a) {
      const r = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x) + 1, h: Math.abs(p.y - a.y) + 1 };
      const t = this.tool;
      if (t === 'line') g.line(a.x, a.y, p.x, p.y, 1, pen);
      else if (r.w > 1 && r.h > 1) this.shape(g, t, r, pen);
    } else if (this.mode === 'select' && a) {
      // the selection never reaches past the edges of the picture
      const cx = (v) => Math.max(0, Math.min(CW - 1, v)), cy = (v) => Math.max(0, Math.min(CH - 1, v));
      const x0 = cx(Math.min(a.x, p.x)), x1 = cx(Math.max(a.x, p.x)), y0 = cy(Math.min(a.y, p.y)), y1 = cy(Math.max(a.y, p.y));
      this.sel = x1 - x0 >= 2 && y1 - y0 >= 2 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
    } else if (this.mode === 'lasso' && this.path) {
      this.path.push(p); this.makeLasso(this.path); this.path = null;
    } else if (this.mode === 'free' && this.path) {
      const filled = this.tool === 'ffree';
      if (filled) this.fillPoly(this.path, this.pat);
      for (let i = 1; i < this.path.length; i++) g.line(this.path[i - 1].x, this.path[i - 1].y, this.path[i].x, this.path[i].y, 1, pen);
      if (filled) g.line(this.path[this.path.length - 1].x, this.path[this.path.length - 1].y, this.path[0].x, this.path[0].y, 1, pen);
      this.path = null;
    }
    this.mode = null; this.drag0 = null; this.last = null; this.handFrom = null;
  }
  key(key, mods) {
    if (this.text) {
      if (key === 'Backspace') this.text.s = this.text.s.slice(0, -1);
      else if (key === 'Enter') { this.commit(); }
      else if (key.length === 1) { this.text.s += key; this.dirtyDoc = true; }
      return true;
    }
    if ((key === 'Backspace' || key === 'Delete') && this.sel) { this.snapshot(); this.fillSel(PAT.white); return true; }
    return false;
  }
  tick() { return !!(this.text || this.sel || this.poly); }
  cursor(x, y) {
    const c = this.content();
    if (!hit(x, y, c.x, c.y, c.w, c.h)) return 'arrow';
    return { text: 'ibeam', eraser: 'eraser', hand: 'hand' }[this.tool] || 'cross';
  }
  // ---- operations
  shape(g, t, r, pen) {
    const filled = t[0] === 'f';
    const kind = t.replace(/^f/, '');
    if (kind === 'rect') { if (filled) g.fill(r.x, r.y, r.w, r.h, this.pat); g.frame(r.x, r.y, r.w, r.h, 1, Math.min(pen, Math.floor(Math.min(r.w, r.h) / 2) || 1)); }
    else if (kind === 'rrect') { if (filled) g.spans(r.x, r.y, Gfx.rrSpans(r.w, r.h, 8), this.pat); g.thickOutline(r.x, r.y, r.w, r.h, 'rr', 8, pen); }
    else if (kind === 'oval') { if (filled) g.spans(r.x, r.y, Gfx.ovalSpans(r.w, r.h), this.pat); g.thickOutline(r.x, r.y, r.w, r.h, 'oval', 0, pen); }
  }
  spray(p) { for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 9; const x = Math.round(p.x + Math.cos(a) * rr), y = Math.round(p.y + Math.sin(a) * rr); if ((this.pat[y & 7] >> (7 - (x & 7))) & 1) this.cg.px(x, y, 1); } }
  flood(x0, y0) {
    if (x0 < 0 || y0 < 0 || x0 >= CW || y0 >= CH) return;
    const target = this.canvas[y0 * CW + x0];
    const seen = new Uint8Array(CW * CH), stack = [y0 * CW + x0];
    const fillTo = [];
    while (stack.length) {
      const k = stack.pop();
      if (seen[k] || this.canvas[k] !== target) continue;
      seen[k] = 1; fillTo.push(k);
      const x = k % CW, y = (k - x) / CW;
      if (x > 0) stack.push(k - 1); if (x < CW - 1) stack.push(k + 1); if (y > 0) stack.push(k - CW); if (y < CH - 1) stack.push(k + CW);
    }
    for (const k of fillTo) { const x = k % CW, y = (k - x) / CW; this.canvas[k] = (this.pat[y & 7] >> (7 - (x & 7))) & 1; }
  }
  fillPoly(pts, pat) {
    if (pts.length < 3) return;
    const [lo, hi] = span(pts.map((p) => p.y));
    polySpans(pts, Math.max(0, lo), Math.min(CH - 1, hi), (y, xa, xb) => { for (let x = xa; x <= xb; x++) this.cg.px(x, y, (pat[y & 7] >> (7 - (x & 7))) & 1); });
  }
  finishPoly() {
    const pts = this.poly; this.poly = null;
    if (!pts || pts.length < 2) return;
    this.snapshot(); this.dirtyDoc = true;
    const pen = WIDTHS[this.width];
    if (this.tool === 'fpoly') this.fillPoly(pts, this.pat);
    for (let i = 1; i < pts.length; i++) this.cg.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 1, pen);
    this.cg.line(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y, 1, pen);
  }
  // the lasso selects the area inside the drawn loop, provided it holds some ink
  makeLasso(pts) {
    if (pts.length < 3) return;
    const [lx, hx] = span(pts.map((q) => q.x)), [ly, hy] = span(pts.map((q) => q.y));
    const x0 = Math.max(0, lx), x1 = Math.min(CW - 1, hx), y0 = Math.max(0, ly), y1 = Math.min(CH - 1, hy);
    if (x1 - x0 < 2 || y1 - y0 < 2) return;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, mask = new Uint8Array(w * h);
    const rel = pts.map((q) => ({ x: q.x - x0, y: q.y - y0 }));
    polySpans(rel, 0, h - 1, (y, xa, xb) => { for (let x = Math.max(0, xa); x <= Math.min(w - 1, xb); x++) mask[y * w + x] = 1; });
    const mg = new Gfx(mask, w, h, 1);
    for (let i = 0; i < rel.length; i++) { const u = rel[i], v = rel[(i + 1) % rel.length]; mg.line(u.x, u.y, v.x, v.y, 1); }
    let ink = false;
    for (let j = 0; j < h && !ink; j++) for (let i = 0; i < w; i++) if (mask[j * w + i] && this.canvas[(y0 + j) * CW + x0 + i]) { ink = true; break; }
    if (ink) this.sel = { x: x0, y: y0, w, h, mask };
  }
  liftSelection() {
    if (this.float) return;
    const s = this.sel; this.snapshot();
    const bits = new Uint8Array(s.w * s.h);
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const x = s.x + i, y = s.y + j;
      if (x < 0 || y < 0 || x >= CW || y >= CH || !inSel(s, i, j)) continue;
      bits[j * s.w + i] = this.canvas[y * CW + x]; this.canvas[y * CW + x] = 0;
    }
    this.float = { x: s.x, y: s.y, w: s.w, h: s.h, bits };
    this.dirtyDoc = true;
  }
  commit() {
    if (this.float) { stamp(this.canvas, this.float); this.float = null; }
    if (this.text) { if (this.text.s) { this.snapshot(); this.cg.text(this.text.s, this.text.x, this.text.y); this.dirtyDoc = true; } this.text = null; }
    if (this.poly) this.finishPoly();
  }
  copySel() {
    const s = this.sel; if (!s) return;
    const n = s.w * s.h, bm = { w: s.w, h: s.h, data: new Uint8Array(n), mask: new Uint8Array(n).fill(1), edge: new Uint8Array(n) };
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      if (!inSel(s, i, j)) continue;
      const x = s.x + i, y = s.y + j;
      bm.data[j * s.w + i] = this.float ? this.float.bits[j * s.w + i] : x >= 0 && y >= 0 && x < CW && y < CH ? this.canvas[y * CW + x] : 0;
    }
    this.desk.clipboard = { type: 'picture', bm };
  }
  // apply fn to every pixel inside the selection, or to the whole picture when nothing is selected
  paintSel(fn) {
    const s = this.sel || { x: 0, y: 0, w: CW, h: CH };
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const x = s.x + i, y = s.y + j;
      if (x < 0 || y < 0 || x >= CW || y >= CH || !inSel(s, i, j)) continue;
      this.canvas[y * CW + x] = fn(this.canvas[y * CW + x], x, y);
    }
    this.dirtyDoc = true;
  }
  fillSel(pat) {
    if (!this.sel) return;
    const floating = !!this.float;
    this.float = null;
    // a floating (moved or pasted) selection is just taken away; otherwise the selected area is painted
    if (!(floating && pat === PAT.white)) this.paintSel((v, x, y) => (pat[y & 7] >> (7 - (x & 7))) & 1);
    this.dirtyDoc = true;
    if (pat === PAT.white) this.sel = null;
  }
  paste() {
    this.commit();
    const bm = this.desk.clipboard.bm;
    const x = Math.max(0, Math.round((CW - bm.w) / 2)), y = Math.max(0, Math.round((CH - bm.h) / 2));
    this.snapshot();
    this.float = { x, y, w: bm.w, h: bm.h, bits: bm.data.slice() };
    this.sel = { x, y, w: bm.w, h: bm.h }; this.tool = 'select'; this.dirtyDoc = true;
  }
  // ---- drawing
  draw(g) {
    const d = this.desk;
    // tool palette
    g.clear(8, 24, 73, 201); g.frame(8, 24, 73, 201);
    TOOLS.forEach((t, i) => {
      const cx = 8 + (i % 2) * 36, cy = 24 + Math.floor(i / 2) * 20;
      g.frame(cx, cy, 37, 21);
      const ic = TOOL_ICONS[t]; g.blit(ic, cx + Math.round((37 - ic.w) / 2), cy + Math.round((21 - ic.h) / 2));
      if (t === this.tool) g.invert(cx + 1, cy + 1, 35, 19);
    });
    // line widths
    g.clear(8, 232, 73, 58); g.frame(8, 232, 73, 58);
    WIDTHS.forEach((w, i) => { const y = 236 + i * 11; g.fill(24, y + 4 - Math.floor(w / 2), 50, Math.min(w, 8)); if (i === this.width) { g.line(12, y + 1, 18, y + 4); g.line(18, y + 4, 12, y + 7); } });
    // patterns
    g.clear(8, 296, W - 12, 43); g.frame(8, 296, W - 12, 43);
    g.fill(10, 298, 76, 39, this.pat); g.frame(10, 298, 76, 39); g.vline(88, 296, 338);
    PATTERNS.forEach((p, i) => { const x = 92 + (i % 12) * 34, y = 297 + Math.floor(i / 12) * 20; g.fill(x, y, 33, 20, p); g.frame(x, y, 34, 21); });
    // document window
    this.win.title = this.fat ? `${this.title} (FatBits)` : this.title;
    d.drawWindowFrame(g, this.win, d.appFocused());
    const c = this.content();
    g.setClip(c.x, c.y, c.w, c.h);
    if (this.fat) {
      const f = this.fat;
      for (let j = 0; j < 31; j++) for (let i = 0; i < 52; i++) {
        const on = this.canvas[(f.y + j) * CW + f.x + i];
        if (on) g.fill(c.x + i * 8, c.y + j * 8, 7, 7);
      }
      g.clear(c.x, c.y, 58, 37); g.frame(c.x, c.y, 58, 37);
      for (let j = 0; j < 31; j++) for (let i = 0; i < 52; i++) if (this.canvas[(f.y + j) * CW + f.x + i]) g.px(c.x + 3 + i, c.y + 3 + j);
    } else {
      for (let j = 0; j < CH; j++) { const row = j * CW; for (let i = 0; i < CW; i++) if (this.canvas[row + i]) g.px(c.x + i, c.y + j); }
      if (this.float) { const f = this.float; for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) if (f.bits[j * f.w + i]) g.px(c.x + f.x + i, c.y + f.y + j); }
      this.drawPreview(g, c);
    }
    g.noClip();
  }
  // marching ants around the selection: its rectangle, or the outline of a lasso selection
  drawAnts(g, c, s, phase) {
    g.xor = true;
    if (!s.mask) {
      for (let i = 0; i < s.w; i++) { if (((i + phase) & 3) < 2) { g.px(c.x + s.x + i, c.y + s.y); g.px(c.x + s.x + i, c.y + s.y + s.h - 1); } }
      for (let j = 1; j < s.h - 1; j++) { if (((j + phase) & 3) < 2) { g.px(c.x + s.x, c.y + s.y + j); g.px(c.x + s.x + s.w - 1, c.y + s.y + j); } }
    } else {
      const m = s.mask, w = s.w;
      for (let j = 0; j < s.h; j++) for (let i = 0; i < w; i++) {
        if (!m[j * w + i] || ((i + j + phase) & 3) >= 2) continue;
        if (i === 0 || j === 0 || i === w - 1 || j === s.h - 1 || !m[j * w + i - 1] || !m[j * w + i + 1] || !m[(j - 1) * w + i] || !m[(j + 1) * w + i]) g.px(c.x + s.x + i, c.y + s.y + j);
      }
    }
    g.xor = false;
  }
  drawPreview(g, c) {
    const d = this.desk, m = d.mouse;
    if (this.sel) this.drawAnts(g, c, this.sel, Math.floor(d.t * 8) & 3);
    if (this.text) { g.text(this.text.s, c.x + this.text.x, c.y + this.text.y); if (d.caretOn) { const tx = c.x + this.text.x + (this.text.s ? textWidth(this.text.s) + 1 : 0); g.vline(tx, c.y + this.text.y - 1, c.y + this.text.y + 10); } }
    if (this.poly) { const P = this.poly; for (let i = 1; i < P.length; i++) g.line(c.x + P[i - 1].x, c.y + P[i - 1].y, c.x + P[i].x, c.y + P[i].y); const p = this.toCanvas(m.x, m.y); const l = P[P.length - 1]; g.line(c.x + l.x, c.y + l.y, c.x + p.x, c.y + p.y); }
    if (this.path) {
      const P = this.path, lasso = this.mode === 'lasso';
      if (lasso) g.xor = true; // the lasso's loop is drawn dotted
      for (let i = 1; i < P.length; i++) g.line(c.x + P[i - 1].x, c.y + P[i - 1].y, c.x + P[i].x, c.y + P[i].y, 1, 1, lasso ? PAT.gray : null);
      g.xor = false;
    }
    if (!this.drag0 || !d.mouse.down) return;
    const a = this.drag0, p = this.toCanvas(m.x, m.y);
    const r = { x: c.x + Math.min(a.x, p.x), y: c.y + Math.min(a.y, p.y), w: Math.abs(p.x - a.x) + 1, h: Math.abs(p.y - a.y) + 1 };
    if (this.mode === 'select') g.grayFrame(r.x, r.y, r.w, r.h);
    if (this.mode !== 'shape') return;
    const t = this.tool, pen = WIDTHS[this.width];
    if (t === 'line') g.line(c.x + a.x, c.y + a.y, c.x + p.x, c.y + p.y, 1, pen);
    else if (r.w > 1 && r.h > 1) {
      const filled = t[0] === 'f', kind = t.replace(/^f/, '');
      if (kind === 'rect') { if (filled) g.fill(r.x, r.y, r.w, r.h, this.pat); g.frame(r.x, r.y, r.w, r.h, 1, Math.min(pen, Math.floor(Math.min(r.w, r.h) / 2) || 1)); }
      else if (kind === 'rrect') { if (filled) g.spans(r.x, r.y, Gfx.rrSpans(r.w, r.h, 8), this.pat); g.thickOutline(r.x, r.y, r.w, r.h, 'rr', 8, pen); }
      else if (kind === 'oval') { if (filled) g.spans(r.x, r.y, Gfx.ovalSpans(r.w, r.h), this.pat); g.thickOutline(r.x, r.y, r.w, r.h, 'oval', 0, pen); }
    }
  }
}

// ---------------------------------------------------------------- Write
const WRITE_WIN = { x: 6, y: 24, w: 498, h: 310 };
export class WriteApp {
  constructor(desk, doc) {
    this.desk = desk; this.doc = doc; this.name = 'Write';
    this.title = doc ? doc.name : 'Untitled';
    this.tb = new TextBox(doc?.text ?? '', 432, 13);
    this.tb.caret = this.tb.anchor = 0;
    this.dirtyDoc = false;
    // the document window; the desktop tracks clicks in its close box
    this.win = { ...WRITE_WIN, title: this.title, closable: true };
  }
  get rows() { return Math.floor((WRITE_WIN.h - TB - 30 - 6) / 13); }
  maxScroll() { return Math.max(0, this.tb.lines().length - this.rows); }
  // keep the view inside the text and the caret on screen
  settle() { this.tb.scroll = Math.max(0, Math.min(this.tb.scroll, this.maxScroll())); this.tb.ensureVisible(this.rows); }
  edit(cmd) { const before = this.tb.text; editCommon(this.tb, cmd, this.desk); if (this.tb.text !== before) { this.dirtyDoc = true; this.settle(); } }
  menus() {
    const d = this.desk, tb = this.tb;
    return [
      { title: 'File', items: [
        { label: 'New', action: () => this.confirm(() => { this.doc = null; this.title = 'Untitled'; this.tb = new TextBox('', 432, 13); this.dirtyDoc = false; }) },
        { label: 'Close', action: () => this.close() },
        { label: 'Save', key: 'S', action: () => this.save() },
        { label: 'Save As…', enabled: false }, '-',
        { label: 'Print…', enabled: false }, '-',
        { label: 'Quit', key: 'Q', action: () => this.close() },
      ] },
      { title: 'Edit', items: [
        { label: 'Undo', key: 'Z', enabled: false }, '-',
        { label: 'Cut', key: 'X', enabled: () => tb.hasSel(), action: () => this.edit('cut') },
        { label: 'Copy', key: 'C', enabled: () => tb.hasSel(), action: () => this.edit('copy') },
        { label: 'Paste', key: 'V', enabled: () => d.clipboard?.type === 'text', action: () => this.edit('paste') },
        { label: 'Clear', enabled: () => tb.hasSel(), action: () => this.edit('clear') },
        { label: 'Select All', key: 'A', action: () => this.edit('selectAll') },
      ] },
      { title: 'Search', items: [{ label: 'Find…', key: 'F', enabled: false }, { label: 'Change…', enabled: false }] },
      { title: 'Format', items: [{ label: 'Show Ruler', check: () => true, enabled: false }, { label: 'Insert Page Break', enabled: false }] },
    ];
  }
  about() { this.desk.alert('note', ['Write', 'A small word processor for this', 're-created desktop.'], ['OK']); }
  // File > Close, Quit and the window's close box: offer to save, then back to the Finder
  close() { this.confirm(() => this.desk.quitApp()); }
  confirm(then) {
    if (!this.dirtyDoc) return then();
    this.desk.alert('caution', [`Save changes to “${this.title}”?`], ['Cancel', 'No', 'Yes'], (b) => { if (b === 'Yes') { if (this.save()) then(); } else if (b === 'No') then(); });
  }
  save() {
    const it = this.desk.saveDocument('write', 'Untitled Document', { text: this.tb.text }, this.doc);
    if (!it) return false;
    this.doc = it; this.title = it.name; this.dirtyDoc = false;
    return true;
  }
  area() { return { x: WRITE_WIN.x + 1 + 24, y: WRITE_WIN.y + TB + 34, w: 440, h: this.rows * 13 }; }
  down(x, y) {
    const a = this.area();
    const sx = WRITE_WIN.x + WRITE_WIN.w - 16;
    if (x >= sx && y >= WRITE_WIN.y + TB) { const max = this.maxScroll(); if (y < WRITE_WIN.y + TB + 16) this.tb.scroll = Math.max(0, this.tb.scroll - 1); else if (y > WRITE_WIN.y + WRITE_WIN.h - 17) this.tb.scroll = Math.min(max, this.tb.scroll + 1); else this.tb.scroll = Math.min(max, Math.round(((y - WRITE_WIN.y - TB - 16) / (WRITE_WIN.h - TB - 34)) * max)); return; }
    if (!hit(x, y, a.x - 20, a.y - 4, a.w + 30, a.h + 8)) return;
    this.tb.caret = this.tb.anchor = this.tb.hit(x - a.x, y - a.y); this.selecting = true;
  }
  drag(x, y) {
    if (!this.selecting) return;
    const a = this.area();
    // dragging past the top or bottom of the text scrolls it
    if (y < a.y && this.tb.scroll > 0) this.tb.scroll--;
    else if (y >= a.y + a.h && this.tb.scroll < this.maxScroll()) this.tb.scroll++;
    this.tb.caret = this.tb.hit(x - a.x, Math.max(-13, Math.min(a.h, y - a.y)));
  }
  up() { this.selecting = false; }
  key(key) { const before = this.tb.text; if (!this.tb.key(key)) return false; if (this.tb.text !== before) this.dirtyDoc = true; this.settle(); return true; }
  cursor(x, y) { const a = this.area(); return hit(x, y, a.x - 20, a.y - 4, a.w + 30, a.h + 8) ? 'ibeam' : 'arrow'; }
  draw(g) {
    const d = this.desk, win = this.win;
    win.title = this.title;
    d.drawWindowFrame(g, win, d.appFocused());
    const x0 = WRITE_WIN.x + 1, y0 = WRITE_WIN.y + TB;
    // ruler
    g.hline(x0, x0 + WRITE_WIN.w - 18, y0 + 28);
    g.hline(x0 + 24, x0 + 456, y0 + 12);
    for (let i = 0; i <= 48; i++) { const tx = x0 + 24 + i * 9; g.vline(tx, y0 + 12, y0 + 12 + (i % 8 === 0 ? 7 : i % 4 === 0 ? 4 : 2)); if (i % 8 === 0 && i) g.text(String(i / 8), tx - 2, y0 + 2); }
    for (const tx of [x0 + 24, x0 + 456]) { g.line(tx - 4, y0 + 22, tx, y0 + 18); g.line(tx, y0 + 18, tx + 4, y0 + 22); g.hline(tx - 4, tx + 4, y0 + 22); }
    // scroll bar
    const sx = WRITE_WIN.x + WRITE_WIN.w - 16, top = WRITE_WIN.y + TB - 1, bottom = WRITE_WIN.y + WRITE_WIN.h - 1;
    g.frame(sx, top, 16, bottom - top + 1);
    const max = Math.max(0, this.tb.lines().length - this.rows);
    if (max > 0 && d.appFocused()) { g.fill(sx + 1, top + 16, 14, bottom - top - 32, PAT.gray); const ty = top + 16 + Math.round((this.tb.scroll / max) * (bottom - top - 48)); g.clear(sx + 1, ty, 14, 16); g.frame(sx, ty - 1, 16, 17); }
    g.hline(sx, sx + 15, top + 15); g.hline(sx, sx + 15, bottom - 15);
    arrowGlyph(g, sx + 3, top + 3, 'up'); arrowGlyph(g, sx + 3, bottom - 12, 'down');
    const a = this.area();
    g.setClip(x0, a.y - 4, WRITE_WIN.w - 18, a.h + 8);
    this.tb.draw(g, a.x, a.y, this.rows, { caret: d.caretOn, focused: d.appFocused() });
    g.noClip();
  }
  tick() { return false; }
}

export const README_TEXT = `Read Me

Welcome to a small re-creation of the 1984 Macintosh desktop, running on the screen of this 3D model.

Things to try:
- Pull down the menus at the top of the screen.
- Double-click Paint and draw something. Double-click the eraser to clear the page.
- Open the Calculator, Note Pad or Puzzle from the first menu.
- Drag a document onto the Trash, then choose Empty Trash from the Special menu.
- Change the desktop pattern in the Control Panel, then click the preview.

You can type in this document. Click the close box, or choose Quit from the File menu, to go back to the Finder.`;
