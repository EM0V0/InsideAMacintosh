// An original re-creation of the 1984 Macintosh desktop on the 512 x 342 1-bit screen:
// single-tasking Finder with menus, windows, icons, the Trash, desk accessories and two applications.
// Behaviour follows the first system release; every bitmap, icon and line of code here is new.
import { textWidth, fmtDate, fmtTime } from './font.js';
import { Gfx, PAT, W, H, ICONS, CURSORS } from './gfx.js';
import { DESK_ACCESSORIES, PaintApp, WriteApp, README_TEXT, samplePainting } from './apps.js';

export const MB = 20, TB = 19, INFO = 18, SB = 16;
const LIST_COLS = [8, 150, 196, 290]; // Name, Size, Kind, Last Modified in a list view
const LAUNCH = new Date(1984, 0, 24, 9, 41);

let NEXT = 1;
const mk = (o) => ({ id: NEXT++, x: 0, y: 0, size: 0, locked: false, created: LAUNCH, modified: LAUNCH, children: null, parent: null, ...o });
const isContainer = (it) => it && (it.type === 'disk' || it.type === 'folder' || it.type === 'trash');
const rectHit = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export class Desktop {
  constructor(fb, hooks = {}) {
    this.fb = fb; this.g = new Gfx(fb, W, H, 0); this.hooks = hooks;
    this.state = 'off'; this.t = 0; this.dirty = true;
    this.mouse = { x: 256, y: 171, down: false, seen: false };
    this.settings = { volume: 4, dbl: 1, blink: 1, pattern: PAT.gray.slice(), tracking: 1, menuBlink: 2 };
    this.clipboard = null;
    this.buildFiles();
    this.windows = []; this.sel = new Set(); this.app = null;
    this.menu = { open: -1, item: -1, sticky: false, flash: null, titleFlash: null };
    this.track = null; this.dialog = null; this.anims = []; this.timers = [];
    this.lastClick = { t: -9, x: 0, y: 0, key: null };
    this.caretOn = true; this.caretT = 0; this.clockSec = -1; this.busyUntil = 0;
    this.diskWindowGeom = { x: 30, y: 44, w: 310, h: 176 };
    hooks.setVolume?.(this.settings.volume / 7);
  }

  // ---------------------------------------------------------------- files
  buildFiles() {
    const disk = mk({ name: 'System Disk', type: 'disk', icon: 'disk', kind: 'disk', children: [], x: 446, y: 28 });
    const trash = mk({ name: 'Trash', type: 'trash', icon: 'trash', kind: 'trash', children: [], x: 446, y: 288 });
    const add = (p, o) => { const it = mk(o); it.parent = p; p.children.push(it); return it; };
    const sys = add(disk, { name: 'System Folder', type: 'folder', icon: 'folder', kind: 'folder', children: [], x: 24, y: 8 });
    add(sys, { name: 'System', type: 'sys', icon: 'system', kind: 'system document', size: 104, x: 24, y: 8 });
    add(sys, { name: 'Finder', type: 'sys', icon: 'finder', kind: 'system document', size: 46, x: 104, y: 8 });
    add(sys, { name: 'Imagewriter', type: 'sys', icon: 'printer', kind: 'printer resource', size: 26, x: 184, y: 8 });
    add(sys, { name: 'Clipboard File', type: 'clip', icon: 'clipboard', kind: 'system document', size: 1, x: 24, y: 66 });
    add(sys, { name: 'Scrapbook File', type: 'scrap', icon: 'scrapbook', kind: 'system document', size: 9, x: 104, y: 66 });
    add(sys, { name: 'Note Pad File', type: 'note', icon: 'notepad', kind: 'system document', size: 2, x: 184, y: 66 });
    add(disk, { name: 'Paint', type: 'app', app: 'paint', icon: 'paint', kind: 'application', size: 49, x: 104, y: 8 });
    add(disk, { name: 'Write', type: 'app', app: 'write', icon: 'write', kind: 'application', size: 52, x: 184, y: 8 });
    add(disk, { name: 'Read Me', type: 'doc', app: 'write', icon: 'document', kind: 'Write document', size: 3, x: 24, y: 66, text: README_TEXT });
    add(disk, { name: 'Sample Painting', type: 'doc', app: 'paint', icon: 'picture', kind: 'Paint document', size: 6, x: 104, y: 66, bitmap: samplePainting() });
    add(disk, { name: 'Empty Folder', type: 'folder', icon: 'folder', kind: 'folder', children: [], x: 184, y: 66 });
    this.disk = disk; this.trash = trash;
    this.desk = { type: 'desktop', children: [disk, trash] };
    disk.parent = this.desk; trash.parent = this.desk;
  }
  sizeOf(it) { return it.children ? it.children.reduce((s, c) => s + this.sizeOf(c), 0) : it.size; }
  hasLocked(it) { return !!it.locked || !!it.children?.some((c) => this.hasLocked(c)); }
  hasApp(kind) { const find = (p) => p.children?.some((c) => (c.type === 'app' && c.app === kind) || find(c)); return find(this.desk); }
  diskUsed() { return this.sizeOf(this.disk) + this.sizeOf(this.trash) + this.desk.children.filter((c) => c !== this.disk && c !== this.trash).reduce((s, c) => s + this.sizeOf(c), 0); }
  where(it) { const p = []; let q = it.parent; while (q && q.type !== 'desktop') { p.unshift(q.name); q = q.parent; } return p.length ? p.join(', ') : 'desktop'; }
  uniqueName(parent, base) { let n = base, i = 2; while (parent.children.some((c) => c.name === n)) n = `${base} ${i++}`; return n; }

  // ---------------------------------------------------------------- power
  boot() {
    this.state = 'boot'; this.t = 0; this.dirty = true;
    this.track = null; this.dialog = null; this.menu.open = -1; this.anims = []; this.timers = [];
    if (this.app) { this.app.suspend?.(); this.app = null; }
    this.windows = this.windows.filter((w) => w.kind === 'folder' || w.kind === 'info');
    this.hooks.beep?.();
  }
  powerOff() { this.state = 'off'; this.track = null; this.menu.open = -1; }
  now() { return new Date(); }
  beep() { this.hooks.beep?.(); this.flashScreen = 0.08; this.dirty = true; }
  after(sec, fn) { this.timers.push({ at: this.t + sec, fn }); }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (this.state === 'off') return;
    this.t += dt;
    if (this.state === 'boot') {
      const t = this.t;
      const phase = t < 0.9 ? 0 : t < 2.3 ? 1 : t < 3.7 ? 2 : 3;
      if (phase !== this.bootPhase) { this.bootPhase = phase; this.dirty = true; }
      if (phase === 3) {
        this.state = 'run'; this.dirty = true;
        if (!this.windows.length && !this.everBooted) this.openContainer(this.disk, true);
        this.everBooted = true;
        if (this.startupApp && this.hasApp(this.startupApp)) this.after(0.5, () => this.launch(this.startupApp, null, null));
      }
      return;
    }
    for (const tm of this.timers.splice(0)) { if (this.t >= tm.at) tm.fn(); else this.timers.push(tm); }
    const period = [0.75, 0.53, 0.32][this.settings.blink];
    this.caretT += dt;
    if (this.caretT >= period) { this.caretT = 0; this.caretOn = !this.caretOn; this.dirty = true; }
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== this.clockSec) { this.clockSec = sec; if (this.windows.some((w) => w.da?.clock)) this.dirty = true; }
    if (this.anims.length) { for (const a of this.anims) a.t += dt; this.anims = this.anims.filter((a) => a.t < a.dur); this.dirty = true; }
    if (this.flashScreen > 0) { this.flashScreen -= dt; this.dirty = true; }
    if (this.menu.flash) { this.dirty = true; if (this.t >= this.menu.flash.until) { const f = this.menu.flash; this.menu.flash = null; this.closeMenu(); f.run(); } }
    if (this.menu.titleFlash && this.t >= this.menu.titleFlash.until) { this.menu.titleFlash = null; this.dirty = true; }
    if (this.busyUntil && this.t >= this.busyUntil) { this.busyUntil = 0; this.dirty = true; }
    if (this.track?.type === 'scroll' && this.track.dy && this.t >= this.track.next) { this.track.next = this.t + 0.06; this.scrollBy(this.track.win, this.track.dy); }
    for (const w of this.windows) if (w.da?.tick?.(dt)) this.dirty = true;
    if (this.app?.tick?.(dt)) this.dirty = true;
  }

  // ---------------------------------------------------------------- menus
  appleMenu() {
    return { title: '✱', items: [
      { label: this.app ? `About ${this.app.name}…` : 'About the Finder…', action: () => (this.app?.about ? this.app.about() : this.openAbout()) }, '-',
      ...DESK_ACCESSORIES.map((D) => ({ label: D.title, action: () => this.openDA(D) })),
    ] };
  }
  finderMenus() {
    const sel = [...this.sel];
    const front = this.front();
    const inTrash = sel.length && sel.every((it) => it.parent === this.trash);
    const view = front?.kind === 'folder' ? front.view : null;
    const daEdit = (cmd) => front?.kind === 'da' && front.da.canEdit?.(cmd);
    const editItem = (label, key, cmd) => ({ label, key, enabled: () => daEdit(cmd), action: () => front.da.edit(cmd, this) });
    return [
      { title: 'File', items: [
        { label: 'Open', key: 'O', enabled: () => sel.length > 0, action: () => sel.forEach((it) => this.open(it)) },
        { label: 'Duplicate', key: 'D', enabled: () => sel.length > 0 && sel.every((it) => !['disk', 'trash'].includes(it.type)), action: () => this.duplicate(sel) },
        { label: 'Get Info', key: 'I', enabled: () => sel.length > 0, action: () => sel.forEach((it) => this.getInfo(it)) },
        { label: 'Put Back', enabled: () => inTrash, action: () => this.putBack(sel) }, '-',
        { label: 'Close', key: 'W', enabled: () => !!front, action: () => this.closeWindow(front) },
        { label: 'Close All', enabled: () => this.windows.some((w) => w.kind === 'folder'), action: () => this.windows.filter((w) => w.kind === 'folder').forEach((w) => this.closeWindow(w, true)) },
        { label: 'Print', enabled: () => sel.length > 0 && sel.every((it) => it.type === 'doc'), action: () => this.alert('caution', ['The document can’t be printed', 'because no Imagewriter is connected.'], ['OK']) }, '-',
        { label: 'Eject', key: 'E', enabled: () => false },
      ] },
      { title: 'Edit', items: [
        { label: 'Undo', key: 'Z', enabled: () => false }, '-',
        editItem('Cut', 'X', 'cut'), editItem('Copy', 'C', 'copy'), editItem('Paste', 'V', 'paste'), editItem('Clear', null, 'clear'),
        { label: 'Select All', key: 'A', action: () => (daEdit('selectAll') ? front.da.edit('selectAll', this) : this.selectAll()) }, '-',
        { label: 'Show Clipboard', action: () => this.showClipboard() },
      ] },
      { title: 'View', items: ['icon', 'name', 'date', 'size', 'kind'].map((v) => ({ label: `by ${v[0].toUpperCase()}${v.slice(1)}`, enabled: () => !!view, check: () => view === v, action: () => { front.view = v; front.scrollY = 0; if (v !== 'icon') this.fitList(front); } })) },
      { title: 'Special', items: [
        { label: 'Clean Up', action: () => this.cleanUp() },
        { label: 'Empty Trash', enabled: () => this.trash.children.length > 0, action: () => this.emptyTrash() },
        { label: 'Erase Disk', action: () => this.alert('caution', ['Completely erase disk named', '“System Disk”?'], ['Cancel', 'Erase'], (b) => { if (b === 'Erase') this.after(0.1, () => this.alert('stop', ['The startup disk can’t be erased', 'while the Finder is using it.'], ['OK'])); }, 0) },
        { label: 'Set Startup', action: () => this.setStartup() },
      ] },
    ];
  }
  menus() { return [this.appleMenu(), ...(this.app ? this.appMenus() : this.finderMenus())]; }
  // the desk accessory window that is in front and has the focus, if any
  activeDA() { const f = this.front(); return f?.kind === 'da' && !this.appFocused() && !this.dialog ? f : null; }
  // While a desk accessory is active over an application, the standard Edit commands and
  // File > Close belong to the desk accessory, not to the document underneath.
  appMenus() {
    const ms = this.app.menus(), w = this.activeDA();
    if (!w) return ms;
    const da = w.da, CMDS = { Cut: 'cut', Copy: 'copy', Paste: 'paste', Clear: 'clear', 'Select All': 'selectAll' };
    return ms.map((m) => {
      if (m.title === 'Edit') {
        return { ...m, items: m.items.map((it) => {
          if (it === '-') return it;
          const cmd = CMDS[it.label];
          return cmd ? { ...it, enabled: () => !!da.canEdit?.(cmd), action: () => da.edit(cmd, this) } : { ...it, enabled: false };
        }) };
      }
      if (m.title === 'File') return { ...m, items: m.items.map((it) => (it !== '-' && it.label === 'Close' ? { ...it, enabled: true, action: () => this.closeWindow(w) } : it)) };
      return m;
    });
  }
  layoutMenus() {
    const ms = this.menus(); let x = 10;
    ms.forEach((m) => { m.w = (m.title === '✱' ? 9 : textWidth(m.title, true)) + 16; m.x = x; x += m.w; });
    return ms;
  }
  menuBox(m) {
    const items = m.items;
    let w = 0;
    for (const it of items) if (it !== '-') w = Math.max(w, textWidth(it.label, true) + (it.key ? 32 : 0));
    w += 30;
    const h = items.reduce((s, it) => s + (it === '-' ? 16 : 16), 0) + 2;
    return { x: Math.min(m.x, W - w - 2), y: MB - 1, w, h };
  }
  menuItemAt(m, x, y) {
    const b = this.menuBox(m);
    if (!rectHit(b, x, y)) return -1;
    const i = Math.floor((y - b.y - 1) / 16);
    return i >= 0 && i < m.items.length ? i : -1;
  }
  enabled(it) { return it !== '-' && (it.enabled === undefined || (typeof it.enabled === 'function' ? it.enabled() : it.enabled)) && !!it.action; }
  openMenu(i, sticky) { this.menu.open = i; this.menu.item = -1; this.menu.sticky = sticky; this.menu.openedAt = this.t; this.menu.list = this.layoutMenus(); this.dirty = true; }
  closeMenu() { this.menu.open = -1; this.menu.item = -1; this.menu.sticky = false; this.dirty = true; }
  chooseMenu(mi, ii) {
    const m = this.menu.list[mi], it = m.items[ii];
    if (!this.enabled(it)) { this.closeMenu(); return; }
    this.menu.item = ii;
    // the chosen item blinks 0, 1 or 3 times, as set in the Control Panel
    const blinks = [0, 1, 3][this.settings.menuBlink ?? 2] ?? 3;
    this.menu.flash = { until: this.t + blinks * 0.08, run: () => it.action() };
    this.dirty = true;
  }
  shortcut(key) {
    const ms = this.layoutMenus();
    for (let i = 0; i < ms.length; i++) for (const it of ms[i].items) {
      if (it !== '-' && it.key && it.key === key.toUpperCase() && this.enabled(it)) {
        this.menu.titleFlash = { i, until: this.t + 0.12 }; this.menu.list = ms; this.dirty = true;
        it.action(); return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- windows
  front() { for (let i = this.windows.length - 1; i >= 0; i--) if (this.visibleWin(this.windows[i])) return this.windows[i]; return null; }
  visibleWin(w) { return !this.app || w.kind === 'da'; }
  appFocused() { return !!this.app && (this.appActive || !this.front()) && !this.dialog; }
  bringToFront(w) { this.windows = this.windows.filter((x) => x !== w); this.windows.push(w); this.dirty = true; }
  windowAt(x, y) {
    for (let i = this.windows.length - 1; i >= 0; i--) { const w = this.windows[i]; if (this.visibleWin(w) && rectHit(w, x, y)) return w; }
    return null;
  }
  content(w) {
    const top = w.y + TB + (w.kind === 'folder' ? INFO : 0);
    const sb = w.kind === 'folder' ? SB - 1 : 0;
    return { x: w.x + 1, y: top, w: w.w - 2 - sb, h: w.y + w.h - 1 - top - sb };
  }
  inCloseBox(w, x, y) { return !!w.closable && x >= w.x + 7 && x <= w.x + 20 && y >= w.y + 3 && y <= w.y + 16; }
  // the row of an item in a folder window shown as a list
  rowRect(w, it) { const c = this.content(w), i = w.item.children.indexOf(it); return { x: c.x, y: c.y + 16 + i * 16 - w.scrollY, w: c.w, h: 16 }; }
  closeWindow(w, quiet = false) {
    if (!w) return;
    if (w.kind === 'da' && w.da.close) w.da.close(this);
    this.windows = this.windows.filter((x) => x !== w);
    if (w.kind === 'folder') { w.item.win = { x: w.x, y: w.y, w: w.w, h: w.h, view: w.view }; if (!quiet) this.zoom(w, this.iconRectOf(w.item), 0.22); }
    this.dirty = true;
  }
  windowFor(it) { return this.windows.find((w) => w.kind === 'folder' && w.item === it); }
  openContainer(it, instant = false) {
    let w = this.windowFor(it);
    if (w) { this.bringToFront(w); return; }
    const n = this.windows.filter((x) => x.kind === 'folder').length;
    const geo = it.win || (it === this.disk ? this.diskWindowGeom : { x: 50 + n * 22, y: 70 + n * 18, w: 290, h: 170 });
    w = { kind: 'folder', item: it, title: it.name, closable: true, grow: true, view: 'icon', scrollY: 0, ...geo };
    this.windows.push(w);
    if (!instant) this.zoom(this.iconRectOf(it), w, 0.24);
    this.dirty = true;
  }
  zoom(from, to, dur) { if (from && to) this.anims.push({ from: { x: from.x, y: from.y, w: from.w, h: from.h }, to: { x: to.x, y: to.y, w: to.w, h: to.h }, t: 0, dur }); }
  iconRectOf(it) {
    if (it.parent === this.desk) return { x: it.x, y: it.y, w: 32, h: 32 };
    const w = this.windowFor(it.parent);
    if (!w) return null;
    if (w.view !== 'icon') { const r = this.rowRect(w, it); return { x: r.x + 4, y: r.y, w: Math.max(16, Math.min(140, r.w - 8)), h: 16, row: r, win: w }; }
    const c = this.content(w);
    return { x: c.x + it.x, y: c.y + it.y - w.scrollY, w: 32, h: 32 };
  }
  openDA(D) {
    const open = this.windows.find((w) => w.kind === 'da' && w.da instanceof D);
    if (open) { this.bringToFront(open); return; }
    const da = new D(this);
    const n = this.windows.filter((w) => w.kind === 'da').length;
    const w = da.w + 2, h = da.h + TB + 1;
    const x = da.pos ? da.pos[0] : Math.min(W - w - 8, 90 + n * 16), y = da.pos ? da.pos[1] : Math.min(H - h - 8, 50 + n * 14);
    this.windows.push({ kind: 'da', da, title: da.title, closable: true, grow: false, x, y, w, h });
    this.appActive = false; this.dirty = true;
  }
  // a list shows four columns; widen a narrow window (as far as the screen allows) so the last one is not cut off
  fitList(w) {
    const need = LIST_COLS[3] + textWidth('Last Modified', true) + 8 + 2 + SB - 1;
    if (w.w < need) { w.w = Math.max(w.w, Math.min(need, W - w.x - 2)); this.scrollBy(w, 0); }
  }
  scrollBy(w, dy) {
    const max = this.scrollMax(w);
    const ny = Math.max(0, Math.min(max, w.scrollY + dy));
    if (ny !== w.scrollY) { w.scrollY = ny; this.dirty = true; }
  }
  scrollMax(w) {
    if (w.kind !== 'folder') return 0;
    const c = this.content(w);
    const kids = w.item.children;
    const extent = w.view === 'icon' ? kids.reduce((m, it) => Math.max(m, it.y + 50), 0) : 16 + kids.length * 16;
    return Math.max(0, extent - c.h);
  }

  // ---------------------------------------------------------------- Finder actions
  open(it) {
    if (isContainer(it)) return this.openContainer(it);
    if (it.type === 'app') return this.launch(it.app, null, it);
    if (it.type === 'doc') {
      if (!this.hasApp(it.app)) return this.alert('stop', [`“${it.name}” can’t be opened, because the`, 'application that made it can’t be found.'], ['OK']);
      return this.launch(it.app, it, it);
    }
    if (it.type === 'note') return this.openDA(DESK_ACCESSORIES.find((D) => D.title === 'Note Pad'));
    if (it.type === 'scrap') return this.openDA(DESK_ACCESSORIES.find((D) => D.title === 'Scrapbook'));
    if (it.type === 'clip') return this.showClipboard();
    this.alert('note', [`“${it.name}” is used by the system`, 'and can’t be opened from the Finder.'], ['OK']);
  }
  launch(kind, doc, icon) {
    const r = icon ? this.iconRectOf(icon) : { x: 240, y: 160, w: 32, h: 32 };
    this.zoom(r, { x: 0, y: MB, w: W, h: H - MB }, 0.3);
    this.busyUntil = this.t + 0.7; this.sel.clear();
    this.after(0.55, () => {
      this.app = kind === 'paint' ? new PaintApp(this, doc) : new WriteApp(this, doc);
      this.appActive = true; this.dirty = true;
    });
  }
  quitApp() {
    if (!this.app) return;
    this.app = null; this.busyUntil = this.t + 0.35; this.dirty = true;
  }
  // returns the saved item, or null when the document is locked (nothing is written)
  saveDocument(kind, name, data, existing) {
    if (existing?.locked) { this.alert('stop', [`“${existing.name}” is locked, so the changes`, 'can’t be saved. Unlock it with Get Info.'], ['OK']); return null; }
    let it = existing;
    if (!it) {
      it = mk({ name: this.uniqueName(this.disk, name), type: 'doc', app: kind, icon: kind === 'paint' ? 'picture' : 'document', kind: kind === 'paint' ? 'Paint document' : 'Write document', created: new Date() });
      it.parent = this.disk; this.disk.children.push(it);
      const spot = this.freeSpot(this.disk); it.x = spot.x; it.y = spot.y;
    }
    Object.assign(it, data, { modified: new Date() });
    it.size = kind === 'paint' ? 6 : Math.max(1, Math.ceil(((it.text || '').length + 600) / 1024));
    return it;
  }
  freeSpot(container) {
    for (let row = 0; row < 12; row++) for (let col = 0; col < 4; col++) {
      const x = 24 + col * 80, y = 8 + row * 58;
      if (!container.children.some((c) => Math.abs(c.x - x) < 40 && Math.abs(c.y - y) < 40)) return { x, y };
    }
    return { x: 14, y: 8 };
  }
  duplicate(items) {
    const copy = (src, parent) => {
      const it = mk({ ...src, id: undefined, name: this.uniqueName(parent, src.name.startsWith('Copy of') ? src.name : `Copy of ${src.name}`), children: src.children ? [] : null, created: new Date(), win: null });
      it.id = NEXT++; it.parent = parent; it.x = src.x + 8; it.y = src.y + 16;
      if (src.bitmap) it.bitmap = src.bitmap.slice();
      if (src.children) src.children.forEach((c) => { const cc = copy(c, it); cc.name = c.name; cc.x = c.x; cc.y = c.y; });
      parent.children.push(it);
      return it;
    };
    const made = items.map((src) => copy(src, src.parent));
    if (this.diskUsed() > 400) { made.forEach((it) => this.remove(it)); this.alert('stop', ['There is not enough room on the disk', 'to duplicate this item.'], ['OK']); return; }
    this.sel = new Set(made); this.dirty = true;
  }
  remove(it) { const p = it.parent; if (p) p.children = p.children.filter((c) => c !== it); }
  moveTo(it, target, x, y) {
    this.remove(it);
    if (target === this.trash) { it.origParent = it.parent; it.origPos = { x: it.x, y: it.y }; }
    it.parent = target; target.children.push(it); it.x = x; it.y = y;
  }
  putBack(items) {
    for (const it of items) { const p = it.origParent && it.origParent !== this.trash ? it.origParent : this.disk; const pos = it.origPos || this.freeSpot(p); this.moveTo(it, p, pos.x, pos.y); }
    this.sel.clear(); this.dirty = true;
  }
  emptyTrash() {
    // locked items stay in the Trash; everything else is deleted, along with any window showing it
    const keep = this.trash.children.filter((it) => this.hasLocked(it));
    for (const it of this.trash.children) {
      if (keep.includes(it)) continue;
      for (const w of this.windows.filter((w) => (w.kind === 'folder' || w.kind === 'info') && this.isInside(w.item, it))) this.closeWindow(w, true);
    }
    this.trash.children = keep; this.sel.clear(); this.dirty = true;
    if (keep.length) this.alert('caution', ['The Trash contains locked items, which', 'were not deleted.'], ['OK']);
  }
  isInside(a, b) { let q = a; while (q) { if (q === b) return true; q = q.parent; } return false; }
  selectAll() {
    const f = this.front();
    const list = f?.kind === 'folder' ? f.item.children : this.desk.children;
    this.sel = new Set(list); this.dirty = true;
  }
  cleanUp() {
    const f = this.front();
    if (f?.kind === 'folder') { f.item.children.forEach((it, i) => { it.x = 24 + (i % 4) * 80; it.y = 8 + Math.floor(i / 4) * 58; }); }
    else {
      let k = 0;
      for (const it of this.desk.children) { if (it === this.disk) { it.x = 446; it.y = 28; } else if (it === this.trash) { it.x = 446; it.y = 288; } else { it.x = 446; it.y = 84 + k * 56; k++; } }
    }
    this.dirty = true;
  }
  setStartup() {
    const sel = [...this.sel];
    const app = sel.length === 1 && sel[0].type === 'app' ? sel[0] : null;
    if (app) { this.startupApp = app.app; this.alert('note', [`When this disk starts up, “${app.name}”`, 'will open instead of the Finder.'], ['OK']); }
    else { this.startupApp = null; this.alert('note', ['This disk will start up in the Finder.', 'Select an application first to change this.'], ['OK']); }
  }
  getInfo(it) {
    const open = this.windows.find((w) => w.kind === 'info' && w.item === it);
    if (open) { this.bringToFront(open); return; }
    const n = this.windows.filter((w) => w.kind === 'info').length;
    this.windows.push({ kind: 'info', item: it, title: it.name, closable: true, grow: false, x: 120 + n * 14, y: 60 + n * 12, w: 280, h: 170 });
    this.dirty = true;
  }
  showClipboard() {
    const open = this.windows.find((w) => w.kind === 'clip');
    if (open) { this.bringToFront(open); return; }
    this.windows.push({ kind: 'clip', title: 'Clipboard', closable: true, grow: false, x: 40, y: 220, w: 430, h: 100 });
    this.dirty = true;
  }
  openAbout() {
    const open = this.windows.find((w) => w.kind === 'about');
    if (open) { this.bringToFront(open); return; }
    this.windows.push({ kind: 'about', title: 'About the Finder', closable: true, grow: false, x: 76, y: 70, w: 360, h: 190 });
    this.dirty = true;
  }

  // ---------------------------------------------------------------- dialogs
  alert(icon, lines, buttons, cb, def = buttons.length - 1) {
    const w = Math.max(300, ...lines.map((l) => textWidth(l, true) + 90));
    const h = 64 + lines.length * 14 + 10;
    const d = { icon, lines, cb, x: Math.round((W - w) / 2), y: 70, w, h, buttons: [] };
    let bx = d.x + w - 18;
    for (let i = buttons.length - 1; i >= 0; i--) { const bw = Math.max(58, textWidth(buttons[i], true) + 24); bx -= bw; d.buttons.unshift({ label: buttons[i], x: bx, y: d.y + h - 34, w: bw, h: 20, def: i === def }); bx -= 16; }
    this.dialog = d; this.closeMenu(); this.dirty = true;
    if (icon !== 'note') this.hooks.beep?.();
  }
  dialogButton(b) { const d = this.dialog; this.dialog = null; this.dirty = true; d.cb?.(b.label); }

  // ---------------------------------------------------------------- input
  isDouble(key, x, y) {
    const dt = [0.62, 0.45, 0.3][this.settings.dbl];
    const r = this.t - this.lastClick.t < dt && Math.abs(x - this.lastClick.x) < 5 && Math.abs(y - this.lastClick.y) < 5 && this.lastClick.key === key;
    this.lastClick = r ? { t: -9, x, y, key: null } : { t: this.t, x, y, key };
    return r;
  }
  pointer(type, x, y, mods = {}) {
    if (this.state !== 'run') { this.mouse.x = x; this.mouse.y = y; return; }
    x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y)));
    const moved = x !== this.mouse.x || y !== this.mouse.y;
    this.mouse.x = x; this.mouse.y = y; this.mouse.seen = true;
    if (moved) this.dirty = true;
    if (type === 'down') { this.mouse.down = true; this.down(x, y, mods); this.dirty = true; }
    else if (type === 'move') this.move(x, y, mods);
    else if (type === 'up') { this.mouse.down = false; this.up(x, y, mods); this.dirty = true; }
  }
  down(x, y, mods) {
    if (this.busyUntil || this.menu.flash) return;
    if (this.dialog) {
      const b = this.dialog.buttons.find((b) => rectHit(b, x, y));
      if (b) this.track = { type: 'button', b, inside: true }; else if (!rectHit(this.dialog, x, y)) this.beep();
      return;
    }
    if (this.menu.open >= 0) {
      const m = this.menu.list[this.menu.open];
      const ii = this.menuItemAt(m, x, y);
      if (ii >= 0) { this.chooseMenu(this.menu.open, ii); return; }
      const ti = y < MB ? this.menu.list.findIndex((m) => x >= m.x && x < m.x + m.w) : -1;
      if (ti >= 0 && ti !== this.menu.open) { this.openMenu(ti, false); return; }
      this.closeMenu(); return;
    }
    if (y < MB) {
      const ms = this.layoutMenus();
      const ti = ms.findIndex((m) => x >= m.x && x < m.x + m.w);
      if (ti >= 0) this.openMenu(ti, false);
      return;
    }
    const win = this.windowAt(x, y);
    if (win) { this.appActive = false; return this.windowDown(win, x, y, mods); }
    if (this.app) {
      this.appActive = true;
      // the application's document window has a working close box, like every other window
      const aw = this.app.win;
      if (aw && this.inCloseBox(aw, x, y)) { this.track = { type: 'close', win: aw, app: this.app, inside: true }; return; }
      this.track = { type: 'app' }; this.app.down(x, y, mods); return;
    }
    this.iconsDown(this.desk, null, x, y, mods);
  }
  windowDown(win, x, y, mods) {
    const inTitle = y < win.y + TB;
    if (win !== this.front()) {
      this.bringToFront(win);
      if (!inTitle) return;
    }
    if (inTitle) {
      if (this.inCloseBox(win, x, y)) { this.track = { type: 'close', win, inside: true }; return; }
      this.track = { type: 'drag', win, ox: x - win.x, oy: y - win.y, x0: x, y0: y, moved: false };
      return;
    }
    if (win.kind === 'folder') {
      const gx = win.x + win.w - SB, gy = win.y + win.h - SB;
      if (x >= gx && y >= gy) { this.track = { type: 'grow', win, ox: win.x + win.w - x, oy: win.y + win.h - y }; return; }
      if (x >= gx) {
        if (this.scrollMax(win) <= 0) return;
        const top = win.y + TB - 1, ty = top + SB + this.thumbY(win);
        // the scroll box can be dragged; arrows scroll by a line (repeating), the gray area by a page
        if (y >= top + SB && y < gy - SB && y >= ty && y < ty + SB) { this.track = { type: 'thumb', win, off: y - ty }; return; }
        const dy = y < top + SB ? -12 : y >= gy - SB ? 12 : y < ty ? -this.content(win).h : this.content(win).h;
        this.scrollBy(win, dy); this.track = { type: 'scroll', win, dy: Math.abs(dy) === 12 ? dy : 0, next: this.t + 0.35 };
        return;
      }
      if (y >= gy) return;
      if (y < win.y + TB + INFO) return;
      return this.iconsDown(win.item, win, x, y, mods);
    }
    const c = this.content(win);
    if (win.kind === 'da') { this.track = { type: 'da', win }; win.da.down(x - c.x, y - c.y, mods, this); this.dirty = true; return; }
    if (win.kind === 'info') { if (this.lockBoxHit(win, c, x, y)) { win.item.locked = !win.item.locked; this.dirty = true; } return; }
    if (win.kind === 'about') this.closeWindow(win);
  }
  // Get Info: files (not disks or folders) have a Locked check box
  canLock(it) { return !isContainer(it); }
  lockBoxHit(win, c, x, y) { return this.canLock(win.item) && x >= c.x + 10 && x < c.x + 72 && y >= c.y + 119 && y < c.y + 135; }
  thumbRange(win) { return Math.max(0, win.h - TB - SB * 3 + 1 - SB); }
  thumbY(win) {
    const max = this.scrollMax(win); if (!max) return 0;
    return Math.round((win.scrollY / max) * this.thumbRange(win));
  }
  iconsDown(container, win, x, y, mods) {
    const list = container.children;
    let hit = null;
    for (let i = list.length - 1; i >= 0; i--) if (this.iconHit(list[i], win, x, y)) { hit = list[i]; break; }
    if (!hit) {
      if (!mods.shift) this.sel.clear();
      this.track = { type: 'marquee', container, win, x0: x, y0: y };
      this.dirty = true; return;
    }
    if (this.isDouble(hit.id, x, y)) { this.sel = new Set([hit]); this.open(hit); this.dirty = true; return; }
    if (mods.shift) { if (this.sel.has(hit)) this.sel.delete(hit); else this.sel.add(hit); }
    else if (!this.sel.has(hit)) this.sel = new Set([hit]);
    if (![...this.sel].every((it) => it.parent === container)) this.sel = new Set([hit]);
    this.track = { type: 'icon', container, win, x0: x, y0: y, moved: false, items: [...this.sel] };
    this.dirty = true;
  }
  iconOrigin(win) { if (!win) return { x: 0, y: 0 }; const c = this.content(win); return { x: c.x, y: c.y - win.scrollY }; }
  iconHit(it, win, x, y) {
    if (win && win.view !== 'icon') {
      const c = this.content(win); const i = win.item.children.indexOf(it);
      const ry = c.y + 16 + i * 16 - win.scrollY;
      return x >= c.x && x < c.x + c.w && y >= ry && y < ry + 16 && y >= c.y + 16;
    }
    const o = this.iconOrigin(win), ix = o.x + it.x, iy = o.y + it.y;
    if (win) { const c = this.content(win); if (!rectHit(c, x, y)) return false; }
    if (x >= ix && x < ix + 32 && y >= iy && y < iy + 32) return true;
    const lw = textWidth(it.name) + 4;
    return x >= ix + 16 - lw / 2 && x < ix + 16 + lw / 2 && y >= iy + 33 && y < iy + 46;
  }
  move(x, y, mods) {
    const tr = this.track;
    if (this.menu.open >= 0 && !this.dialog) {
      const ms = this.menu.list;
      if (y < MB) { const ti = ms.findIndex((m) => x >= m.x && x < m.x + m.w); if (ti >= 0 && ti !== this.menu.open) this.openMenu(ti, this.menu.sticky); }
      const ii = this.menuItemAt(ms[this.menu.open], x, y);
      const m = ms[this.menu.open];
      const item = ii >= 0 && this.enabled(m.items[ii]) ? ii : -1;
      if (item !== this.menu.item && !this.menu.flash) { this.menu.item = item; this.dirty = true; }
      return;
    }
    if (!tr) { if (this.app && !this.windowAt(x, y)) this.app.move?.(x, y); return; }
    if (tr.type === 'button') { const inside = rectHit(tr.b, x, y); if (inside !== tr.inside) { tr.inside = inside; this.dirty = true; } }
    else if (tr.type === 'close') { const inside = this.inCloseBox(tr.win, x, y); if (inside !== tr.inside) { tr.inside = inside; this.dirty = true; } }
    else if (tr.type === 'thumb') {
      const w = tr.win, max = this.scrollMax(w), range = this.thumbRange(w), top = w.y + TB - 1;
      const pos = Math.max(0, Math.min(range, y - tr.off - (top + SB)));
      const ny = range ? Math.round((pos / range) * max) : 0;
      if (ny !== w.scrollY) { w.scrollY = ny; this.dirty = true; }
    }
    else if (tr.type === 'drag' || tr.type === 'icon' || tr.type === 'grow' || tr.type === 'marquee') { if (Math.abs(x - (tr.x0 ?? x)) + Math.abs(y - (tr.y0 ?? y)) > 2) tr.moved = true; this.dirty = true; }
    else if (tr.type === 'da') { const c = this.content(tr.win); tr.win.da.drag?.(x - c.x, y - c.y, this); this.dirty = true; }
    else if (tr.type === 'app') { this.app?.drag?.(x, y, mods); this.dirty = true; }
  }
  up(x, y, mods) {
    if (this.menu.open >= 0 && !this.dialog) {
      const m = this.menu.list[this.menu.open];
      const ii = this.menuItemAt(m, x, y);
      if (ii >= 0 && this.enabled(m.items[ii])) { this.chooseMenu(this.menu.open, ii); return; }
      if (this.t - this.menu.openedAt < 0.35 && y < MB) { this.menu.sticky = true; return; }
      if (!this.menu.flash) this.closeMenu();
      return;
    }
    const tr = this.track; this.track = null;
    if (!tr) return;
    if (tr.type === 'button') { if (rectHit(tr.b, x, y)) this.dialogButton(tr.b); return; }
    if (tr.type === 'close') {
      if (!tr.inside) return;
      if (tr.app) { if (this.app === tr.app) this.app.close(); } // same as File > Close: asks to save, then back to the Finder
      else this.closeWindow(tr.win);
      return;
    }
    if (tr.type === 'drag') {
      if (tr.moved) { const w = tr.win; w.x = Math.max(-w.w + 40, Math.min(W - 40, x - tr.ox)); w.y = Math.max(MB, Math.min(H - 20, y - tr.oy)); }
      return;
    }
    if (tr.type === 'grow') { const w = tr.win; w.w = Math.max(120, Math.min(W - w.x - 2, x + tr.ox - w.x)); w.h = Math.max(90, Math.min(H - w.y - 2, y + tr.oy - w.y)); this.scrollBy(w, 0); return; }
    if (tr.type === 'marquee') { this.finishMarquee(tr, x, y); return; }
    if (tr.type === 'icon') { if (tr.moved) this.dropIcons(tr, x, y); return; }
    if (tr.type === 'da') { const c = this.content(tr.win); tr.win.da.up?.(x - c.x, y - c.y, this); return; }
    if (tr.type === 'app') { this.app?.up?.(x, y, mods); }
  }
  finishMarquee(tr, x, y) {
    const r = { x: Math.min(x, tr.x0), y: Math.min(y, tr.y0), w: Math.abs(x - tr.x0) + 1, h: Math.abs(y - tr.y0) + 1 };
    if (r.w < 3 && r.h < 3) return;
    const o = this.iconOrigin(tr.win);
    for (const it of tr.container.children) {
      const ix = o.x + it.x, iy = o.y + it.y;
      if (ix < r.x + r.w && ix + 32 > r.x && iy < r.y + r.h && iy + 32 > r.y) this.sel.add(it);
    }
  }
  dropTarget(x, y, dragging) {
    const win = this.windowAt(x, y);
    if (win) {
      if (win.kind !== 'folder') return null;
      const c = this.content(win);
      if (!rectHit(c, x, y)) return null;
      const over = win.item.children.find((it) => !dragging.includes(it) && isContainer(it) && this.iconHit(it, win, x, y));
      return over ? { item: over } : { item: win.item, win };
    }
    const over = this.desk.children.find((it) => !dragging.includes(it) && isContainer(it) && this.iconHit(it, null, x, y));
    return over ? { item: over } : { item: this.desk };
  }
  // where a dragged item starts on screen: its icon, or (dragged out of a list) an icon centred on the pointer
  dragStart(tr, it, k = 0) {
    if (!tr.win) return { x: it.x, y: it.y };
    if (tr.win.view !== 'icon') return { x: tr.x0 - 16 + k * 6, y: tr.y0 - 16 + k * 6 };
    const o = this.iconOrigin(tr.win);
    return { x: o.x + it.x, y: o.y + it.y };
  }
  dropIcons(tr, x, y) {
    const dx = x - tr.x0, dy = y - tr.y0;
    const tgt = this.dropTarget(x, y, tr.items);
    if (!tgt) return;
    const dest = tgt.item;
    const onDesk = (p) => ({ x: Math.max(0, Math.min(W - 40, p.x)), y: Math.max(MB + 2, Math.min(H - 48, p.y)) });
    let locked = false;
    tr.items.forEach((it, k) => {
      const s = this.dragStart(tr, it, k), to = { x: s.x + dx, y: s.y + dy };
      if (it === this.disk || it === this.trash) {
        if (dest === this.desk) Object.assign(it, onDesk(to));
        else this.beep();
        return;
      }
      if (dest === it || (it.children && this.isInside(dest, it))) { this.beep(); return; }
      if (this.isInside(dest, this.trash) && !this.isInside(it, this.trash) && this.hasLocked(it)) { locked = true; return; }
      if (dest === it.parent && dest !== this.desk && tgt.win) {
        if (tgt.win.view === 'icon') { it.x = Math.max(0, it.x + dx); it.y = Math.max(0, it.y + dy); } // a list keeps its own order
        return;
      }
      if (dest === this.desk) {
        const p = onDesk(to);
        if (it.parent === this.desk) Object.assign(it, p); else this.moveTo(it, this.desk, p.x, p.y);
        return;
      }
      if (tgt.win && tgt.win.view === 'icon') {
        const c = this.iconOrigin(tgt.win);
        this.moveTo(it, dest, Math.max(0, to.x - c.x), Math.max(0, to.y - c.y));
      } else {
        const spot = this.freeSpot(dest);
        this.moveTo(it, dest, spot.x, spot.y);
      }
    });
    if (dest === this.trash || !tgt.win) this.sel.clear();
    for (const w of this.windows) if (w.kind === 'folder') this.scrollBy(w, 0);
    if (locked) this.alert('caution', ['That item is locked, so it can’t be', 'put in the Trash.'], ['OK']);
  }
  key(key, mods = {}) {
    if (this.state !== 'run') return false;
    this.dirty = true;
    if (this.dialog) {
      if (key === 'Enter') { const b = this.dialog.buttons.find((b) => b.def); if (b) this.dialogButton(b); return true; }
      if (key === 'Escape') { const b = this.dialog.buttons.find((b) => b.label === 'Cancel'); if (b) this.dialogButton(b); return true; }
      return true;
    }
    if (mods.cmd && key.length === 1) { if (!this.shortcut(key)) this.beep(); return true; }
    const f = this.front();
    if (f?.kind === 'da' && !this.appFocused() && f.da.key?.(key, mods, this)) return true;
    if (this.app) return !!this.app.key?.(key, mods);
    return false;
  }

  // ---------------------------------------------------------------- drawing
  render() {
    const g = this.g;
    g.noClip(); g.xor = false;
    this.dirty = false;
    if (this.state === 'boot') return this.renderBoot();
    if (this.state !== 'run') return;
    g.fill(0, MB, W, H - MB, this.settings.pattern);
    if (this.app) this.app.draw(g);
    else this.drawDeskIcons(g);
    const front = this.front();
    for (const w of this.windows) if (this.visibleWin(w)) this.drawWindow(g, w, w === front && !this.dialog && !(this.app && this.appActive));
    this.drawTracking(g);
    for (const a of this.anims) this.drawZoom(g, a);
    this.drawMenuBar(g);
    if (this.dialog) this.drawDialog(g, this.dialog);
    this.drawCursor(g);
    if (this.flashScreen > 0) g.invert(0, 0, W, H);
    this.corners(g);
  }
  renderBoot() {
    const g = this.g;
    g.fill(0, 0, W, H, PAT.gray);
    if (this.bootPhase === 1) {
      g.clear(232, 147, 48, 48); g.frame(232, 147, 48, 48); g.blit(ICONS.system, 240, 155);
    } else if (this.bootPhase === 2) {
      const msg = 'Welcome to Macintosh.';
      const w = textWidth(msg, true) + 60;
      const x = Math.round((W - w) / 2), y = 146;
      g.clear(x, y, w, 50); g.frame(x, y, w, 50); g.frame(x + 3, y + 3, w - 6, 44, 1, 2);
      g.text(msg, x + 30, y + 20, { bold: true });
    }
    this.corners(g);
  }
  corners(g) {
    const R = [3, 2, 1, 1, 0];
    R.forEach((n, j) => { for (let i = 0; i < n; i++) { g.px(i, j); g.px(W - 1 - i, j); g.px(i, H - 1 - j); g.px(W - 1 - i, H - 1 - j); } });
    g.px(0, 3); g.px(W - 1, 3); g.px(0, H - 4); g.px(W - 1, H - 4);
  }
  drawLabel(g, text, cx, y, inverse) {
    const tw = textWidth(text);
    const x = Math.round(cx - tw / 2);
    g.clear(x - 2, y - 1, tw + 4, 12);
    g.text(text, x, y);
    if (inverse) g.invert(x - 2, y - 1, tw + 4, 12);
  }
  iconFor(it) { if (it === this.trash) return this.trash.children.length ? ICONS.trashFull : ICONS.trash; return ICONS[it.icon] || ICONS.document; }
  drawIcon(g, it, x, y) {
    const sel = this.sel.has(it);
    const open = isContainer(it) && this.windowFor(it);
    g.blit(this.iconFor(it), x, y, open ? 'open' : sel ? 'invert' : 'normal');
    this.drawLabel(g, it.name, x + 16, y + 34, sel);
  }
  drawDeskIcons(g) { for (const it of this.desk.children) this.drawIcon(g, it, it.x, it.y); }
  drawWindowFrame(g, w, active) {
    const { x, y } = w;
    g.clear(x, y, w.w, w.h);
    g.frame(x, y, w.w, w.h);
    g.hline(x + 1, x + w.w, y + w.h); g.vline(x + w.w, y + 1, y + w.h);
    g.hline(x, x + w.w - 1, y + TB - 1);
    if (active) {
      for (let yy = y + 3; yy <= y + 15; yy += 2) g.hline(x + 2, x + w.w - 3, yy);
      if (w.closable) {
        g.clear(x + 7, y + 3, 13, 13); g.frame(x + 8, y + 4, 11, 11);
        if (this.track?.type === 'close' && this.track.win === w && this.track.inside) { g.line(x + 9, y + 5, x + 17, y + 13); g.line(x + 17, y + 5, x + 9, y + 13); }
      }
    }
    const title = w.title.length > 34 ? w.title.slice(0, 33) + '…' : w.title;
    const tw = textWidth(title, true), tx = Math.round(x + w.w / 2 - tw / 2);
    if (active) g.clear(tx - 6, y + 2, tw + 12, 15);
    g.text(title, tx, y + 5, { bold: true });
  }
  drawScrollbars(g, w, active) {
    const vx = w.x + w.w - SB, top = w.y + TB - 1, gy = w.y + w.h - SB;
    g.frame(vx, top, SB, gy - top + 1);
    g.frame(w.x, gy, w.w - SB + 1, SB);
    g.frame(vx, gy, SB, SB);
    if (!active) return;
    const max = this.scrollMax(w);
    if (max > 0) { g.fill(vx + 1, top + SB, SB - 2, gy - top - 2 * SB, PAT.gray); const ty = top + SB + this.thumbY(w); g.clear(vx + 1, ty, SB - 2, SB); g.frame(vx, ty - 1, SB, SB + 1); }
    g.hline(vx, vx + SB - 1, top + SB - 1); g.hline(vx, vx + SB - 1, gy - SB + 1);
    this.arrow(g, vx + 3, top + 3, 'up'); this.arrow(g, vx + 3, gy - SB + 4, 'down');
    g.vline(w.x + SB - 1, gy, gy + SB - 1); g.vline(vx - SB + 1, gy, gy + SB - 1);
    this.arrow(g, w.x + 3, gy + 3, 'left'); this.arrow(g, vx - SB + 4, gy + 3, 'right');
    g.frame(vx + 3, gy + 3, 7, 7); g.clear(vx + 6, gy + 6, 7, 7); g.frame(vx + 6, gy + 6, 7, 7);
  }
  arrow(g, x, y, dir) {
    const rows = ['....#....', '...#.#...', '..#...#..', '.#.....#.', '###...###', '..#...#..', '..#...#..', '..#...#..', '..#####..'];
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) if (rows[j][i] === '#') {
      const [a, b] = dir === 'up' ? [i, j] : dir === 'down' ? [i, 8 - j] : dir === 'left' ? [j, i] : [8 - j, i];
      g.px(x + a, y + b);
    }
  }
  drawWindow(g, w, active) {
    if (w.kind === 'da') { w.w = w.da.w + 2; w.h = w.da.h + TB + 1; w.title = w.da.title; }
    this.drawWindowFrame(g, w, active);
    const c = this.content(w);
    if (w.kind === 'folder') return this.drawFolder(g, w, active, c);
    g.setClip(c.x, c.y, c.w, c.h);
    if (w.kind === 'da') w.da.draw(g, c.x, c.y, active, this);
    else if (w.kind === 'info') this.drawInfo(g, w, c);
    else if (w.kind === 'clip') this.drawClip(g, c);
    else if (w.kind === 'about') this.drawAbout(g, c);
    g.noClip();
  }
  drawFolder(g, w, active, c) {
    const it = w.item, kids = it.children;
    const used = this.diskUsed();
    const info = `${kids.length} item${kids.length === 1 ? '' : 's'}`;
    const right = `${Math.max(0, 400 - used)}K available`, mid = `${used}K in disk`;
    const iy = w.y + TB + 3;
    g.setClip(w.x + 1, w.y + TB, w.w - 2, INFO);
    // in a narrow window the middle and right figures give way rather than print over each other
    const lx = w.x + 8, lEnd = lx + textWidth(info) + 8;
    const rx = w.x + w.w - 6 - SB - textWidth(right), mx = Math.round(w.x + w.w / 2 - textWidth(mid) / 2);
    g.text(info, lx, iy);
    if (rx >= lEnd) {
      if (mx >= lEnd && mx + textWidth(mid) + 8 <= rx) g.text(mid, mx, iy);
      g.text(right, rx, iy);
    }
    g.noClip();
    g.hline(w.x, w.x + w.w - 1, w.y + TB + INFO - 3); g.hline(w.x, w.x + w.w - 1, w.y + TB + INFO - 1);
    this.drawScrollbars(g, w, active);
    g.setClip(c.x, c.y, c.w, c.h);
    if (w.view === 'icon') {
      const o = this.iconOrigin(w);
      for (const k of kids) this.drawIcon(g, k, o.x + k.x, o.y + k.y);
    } else {
      const key = w.view;
      const sorted = [...kids].sort((a, b) => key === 'size' ? this.sizeOf(b) - this.sizeOf(a) : key === 'date' ? b.modified - a.modified : key === 'kind' ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name));
      w.item.children.splice(0, kids.length, ...sorted);
      const cols = LIST_COLS.map((dx) => c.x + dx);
      let y = c.y + 3 - w.scrollY;
      ['Name', 'Size', 'Kind', 'Last Modified'].forEach((h, i) => g.text(h, cols[i], y, { bold: true }));
      y += 16;
      for (const k of sorted) {
        g.text(k.name, cols[0], y); g.text(`${this.sizeOf(k)}K`, cols[1], y); g.text(k.kind, cols[2], y); g.text(fmtDate(k.modified).slice(5), cols[3], y);
        if (this.sel.has(k)) g.invert(c.x, y - 3, c.w, 16);
        y += 16;
      }
    }
    g.noClip();
  }
  drawInfo(g, w, c) {
    const it = w.item;
    g.blit(this.iconFor(it), c.x + 12, c.y + 8);
    g.text(it.name, c.x + 56, c.y + 14, { bold: true });
    const rows = [['Kind:', it.kind], ['Size:', `${this.sizeOf(it)}K bytes${it.children ? `, ${it.children.length} items` : ''}`], ['Where:', this.where(it)], ['Created:', `${fmtDate(it.created)}, ${fmtTime(it.created)}`], ['Modified:', `${fmtDate(it.modified)}, ${fmtTime(it.modified)}`]];
    rows.forEach(([a, b], i) => { g.text(a, c.x + 12, c.y + 50 + i * 14); g.text(b, c.x + 76, c.y + 50 + i * 14); });
    if (!this.canLock(it)) return;
    g.frame(c.x + 12, c.y + 122, 10, 10); if (it.locked) { g.line(c.x + 12, c.y + 122, c.x + 21, c.y + 131); g.line(c.x + 21, c.y + 122, c.x + 12, c.y + 131); }
    g.text('Locked', c.x + 28, c.y + 123);
  }
  drawClip(g, c) {
    const cb = this.clipboard;
    if (!cb) { g.text('The Clipboard is empty.', c.x + 10, c.y + 10); return; }
    g.text(`Clipboard contains ${cb.type}:`, c.x + 10, c.y + 6, { bold: true });
    if (cb.type === 'text') { const lines = cb.text.split('\n').slice(0, 4); lines.forEach((l, i) => g.text(l.slice(0, 64), c.x + 10, c.y + 24 + i * 12)); }
    else if (cb.type === 'picture' && cb.bm) {
      // shrink the picture to fit: a pixel is black if any pixel it stands for is black
      const bm = cb.bm, maxW = c.w - 20, maxH = c.h - 26;
      const k = Math.max(1, Math.ceil(Math.max(bm.w / maxW, bm.h / maxH)));
      const w = Math.ceil(bm.w / k), h = Math.ceil(bm.h / k), x0 = c.x + 10, y0 = c.y + 22;
      g.frame(x0 - 1, y0 - 1, w + 2, h + 2);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let on = 0;
        for (let b = 0; b < k && !on; b++) for (let a = 0; a < k; a++) { const sx = i * k + a, sy = j * k + b; if (sx < bm.w && sy < bm.h && bm.data[sy * bm.w + sx]) { on = 1; break; } }
        if (on) g.px(x0 + i, y0 + j);
      }
    }
  }
  drawAbout(g, c) {
    g.fill(c.x + 10, c.y + 10, 120, 140, PAT.ltGray); g.frame(c.x + 10, c.y + 10, 120, 140);
    g.clear(c.x + 46, c.y + 46, 48, 48); g.frame(c.x + 46, c.y + 46, 48, 48); g.blit(ICONS.system, c.x + 54, c.y + 54);
    const L = ['The Finder', '', 'Macintosh 128K', 'System Disk', '', 'Click the close box to dismiss.'];
    L.forEach((l, i) => g.text(l, c.x + 144, c.y + 12 + i * 13, { bold: i === 0 }));
  }
  drawTracking(g) {
    const tr = this.track, m = this.mouse;
    if (!tr || !tr.moved && tr.type !== 'marquee') return;
    if (tr.type === 'drag') g.grayFrame(m.x - tr.ox, m.y - tr.oy, tr.win.w, tr.win.h);
    else if (tr.type === 'grow') g.grayFrame(tr.win.x, tr.win.y, Math.max(120, m.x + tr.ox - tr.win.x), Math.max(90, m.y + tr.oy - tr.win.y));
    else if (tr.type === 'marquee') { const x = Math.min(m.x, tr.x0), y = Math.min(m.y, tr.y0); g.grayFrame(x, y, Math.abs(m.x - tr.x0) + 1, Math.abs(m.y - tr.y0) + 1); }
    else if (tr.type === 'icon') {
      const dx = m.x - tr.x0, dy = m.y - tr.y0;
      tr.items.forEach((it, k) => { const s = this.dragStart(tr, it, k); g.ghost(this.iconFor(it), s.x + dx, s.y + dy); });
      const tgt = this.dropTarget(m.x, m.y, tr.items);
      if (tgt && tgt.item !== this.desk && !tgt.win) {
        const r = this.iconRectOf(tgt.item);
        if (r?.row) { const c = this.content(r.win); g.setClip(c.x, c.y, c.w, c.h); g.invert(r.row.x, r.row.y, r.row.w, r.row.h); g.noClip(); }
        else if (r) g.blit(this.iconFor(tgt.item), r.x, r.y, 'invert');
      }
    }
  }
  drawZoom(g, a) {
    const k = a.t / a.dur;
    for (let i = 0; i < 4; i++) {
      const t = Math.max(0, Math.min(1, k - i * 0.12));
      if (t <= 0) continue;
      const lerp = (p, q) => Math.round(p + (q - p) * t);
      g.grayFrame(lerp(a.from.x, a.to.x), lerp(a.from.y, a.to.y), Math.max(2, lerp(a.from.w, a.to.w)), Math.max(2, lerp(a.from.h, a.to.h)));
    }
  }
  drawMenuBar(g) {
    const ms = this.menu.open >= 0 ? this.menu.list : this.layoutMenus();
    g.clear(0, 0, W, MB - 1); g.hline(0, W - 1, MB - 1);
    ms.forEach((m, i) => {
      if (m.title === '✱') g.text(m.title, m.x + 8, 5);
      else g.text(m.title, m.x + 8, 5, { bold: true });
      if (this.menu.open === i || this.menu.titleFlash?.i === i) g.invert(m.x, 0, m.w, MB - 1);
    });
    if (this.menu.open < 0) return;
    const m = ms[this.menu.open], b = this.menuBox(m);
    g.clear(b.x, b.y, b.w, b.h); g.frame(b.x, b.y, b.w, b.h);
    g.hline(b.x + 2, b.x + b.w, b.y + b.h); g.vline(b.x + b.w, b.y + 2, b.y + b.h);
    const blinkOff = this.menu.flash && Math.floor((this.menu.flash.until - this.t) / 0.04) % 2 === 1;
    m.items.forEach((it, i) => {
      const iy = b.y + 1 + i * 16;
      if (it === '-') { for (let x = b.x + 1; x < b.x + b.w - 1; x += 2) g.px(x, iy + 8); return; }
      const on = this.enabled(it);
      if (it.check?.()) g.text('✓', b.x + 4, iy + 4, { bold: true, gray: !on });
      g.text(it.label, b.x + 16, iy + 4, { bold: true, gray: !on });
      if (it.key) { const s = `⌘${it.key}`; g.text(s, b.x + b.w - 10 - textWidth(s, true), iy + 4, { bold: true, gray: !on }); }
      if (i === this.menu.item && on && !blinkOff) g.invert(b.x + 1, iy, b.w - 2, 16);
    });
  }
  drawDialog(g, d) {
    g.clear(d.x, d.y, d.w, d.h); g.frame(d.x, d.y, d.w, d.h); g.frame(d.x + 3, d.y + 3, d.w - 6, d.h - 6, 1, 2);
    g.blit(ICONS[d.icon] || ICONS.note, d.x + 16, d.y + 14);
    d.lines.forEach((l, i) => g.text(l, d.x + 62, d.y + 18 + i * 14, { bold: true }));
    for (const b of d.buttons) {
      const pressed = this.track?.type === 'button' && this.track.b === b && this.track.inside;
      g.roundRect(b.x, b.y, b.w, b.h, 8, PAT.white);
      g.text(b.label, Math.round(b.x + b.w / 2 - textWidth(b.label, true) / 2), b.y + 6, { bold: true });
      if (b.def) { g.thickOutline(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 'rr', 11, 3); }
      if (pressed) g.invert(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    }
  }
  cursorShape() {
    if (this.busyUntil) return 'watch';
    const { x, y } = this.mouse;
    if (this.dialog || this.menu.open >= 0 || y < MB) return 'arrow';
    const w = this.windowAt(x, y);
    if (w) {
      if (w.kind === 'da' && w === this.front()) { const c = this.content(w); if (rectHit(c, x, y)) return w.da.cursor?.(x - c.x, y - c.y) || 'arrow'; }
      return 'arrow';
    }
    if (this.app) return this.app.cursor?.(x, y) || 'arrow';
    return 'arrow';
  }
  drawCursor(g) {
    if (!this.mouse.seen) return;
    const c = CURSORS[this.cursorShape()] || CURSORS.arrow;
    g.xor = false;
    g.blit(c, this.mouse.x - c.hx, this.mouse.y - c.hy);
  }
}
