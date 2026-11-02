// CRT screen: the 512 x 342 1-bit desktop rendered into a canvas texture
// with scanlines, a soft phosphor glow, warm-up and power-off collapse.
import * as THREE from 'three';
import { Desktop } from './desktop.js';

const W = 512, H = 342;

export class CRTScreen {
  constructor(hooks = {}) {
    // 1-bit framebuffer: 1 = lit phosphor, 0 = black
    this.fb = new Uint8Array(W * H);
    this.small = document.createElement('canvas');
    this.small.width = W; this.small.height = H;
    this.sctx = this.small.getContext('2d');
    this.img = this.sctx.createImageData(W, H);
    // glass-sized canvas: raster is 2x, framed by unlit glass (aspect of the visible glass)
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1070; this.canvas.height = 806;
    this.ctx = this.canvas.getContext('2d');
    this.rx = 23; this.ry = 61; // raster offset inside the glass canvas
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.scan = this.makeScanlines();
    this.mode = 'off'; // off | warming | on | collapsing
    this.modeT = 0;
    this.desk = new Desktop(this.fb, hooks);
    this.blankGlass();
  }

  makeScanlines() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.0)'; x.fillRect(0, 0, 4, 4);
    x.fillStyle = 'rgba(0,0,0,0.26)'; x.fillRect(0, 1, 4, 1); x.fillRect(0, 3, 4, 1);
    return this.ctx.createPattern(c, 'repeat');
  }

  // texture coordinates on the glass -> framebuffer pixel (unclamped)
  fromUV(u, v) { return { x: (u * this.canvas.width - this.rx) / 2, y: ((1 - v) * this.canvas.height - this.ry) / 2 }; }
  get usable() { return this.mode === 'on' && this.desk.state === 'run'; }
  pointer(type, x, y, mods) { if (this.mode === 'on') this.desk.pointer(type, x, y, mods); }
  key(key, mods) { return this.mode === 'on' ? this.desk.key(key, mods) : false; }

  // push the 1-bit buffer into the glass canvas
  present(brightness = 1, vScale = 1, hScale = 1) {
    const d = this.img.data;
    for (let i = 0; i < W * H; i++) {
      const v = this.fb[i];
      // cool white phosphor vs. black; unlit pixels keep a hint of glow
      d[4 * i] = v ? 236 : 10; d[4 * i + 1] = v ? 241 : 12; d[4 * i + 2] = v ? 244 : 14; d[4 * i + 3] = 255;
    }
    this.sctx.putImageData(this.img, 0, 0);
    const c = this.ctx;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#050607';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const rw = W * 2 * hScale, rh = H * 2 * vScale;
    const x = this.rx + (W * 2 - rw) / 2, y = this.ry + (H * 2 - rh) / 2;
    c.globalAlpha = brightness;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.small, x, y, rw, rh);
    c.globalAlpha = 1;
    c.fillStyle = this.scan;
    c.fillRect(x, y, rw, rh);
    // phosphor bloom: a smoothed copy added on top
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.12 * brightness;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.small, x - 3, y - 3, rw + 6, rh + 6);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
  }

  blankGlass() {
    this.ctx.fillStyle = '#050607';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  powerOn() { if (this.mode === 'on' || this.mode === 'warming') return; this.mode = 'warming'; this.modeT = 0; this.desk.boot(); }
  powerOff() { if (this.mode === 'off' || this.mode === 'collapsing') return; this.mode = 'collapsing'; this.modeT = 0; this.desk.powerOff(); }

  // returns emissive intensity for the glass material
  update(dt) {
    this.modeT += dt;
    if (this.mode === 'warming' || this.mode === 'on') this.desk.update(dt);
    if (this.mode === 'warming') {
      const t = Math.min(1, this.modeT / 2.2);
      // raster appears dim and soft, then settles
      const b = t < 0.12 ? 0.25 * (t / 0.12) : 0.25 + 0.75 * (1 - Math.pow(1 - (t - 0.12) / 0.88, 3));
      if (this.desk.dirty) this.desk.render();
      this.present(Math.min(1, b + 0.02 * Math.sin(this.modeT * 60)));
      if (t >= 1) { this.mode = 'on'; this.desk.dirty = true; }
      return 0.25 + 0.85 * b;
    }
    if (this.mode === 'on') {
      if (this.desk.dirty) { this.desk.render(); this.present(1); }
      return 1.1;
    }
    if (this.mode === 'collapsing') {
      const t = this.modeT;
      if (t < 0.11) { this.present(1.3, Math.max(0.006, 1 - t / 0.11), 1); return 1.4; }
      if (t < 0.24) { const k = (t - 0.11) / 0.13; this.present(1.6, 0.006, Math.max(0.01, 1 - k)); return 1.6; }
      if (t < 0.7) { const k = (t - 0.24) / 0.46; this.drawDot(1 - k); return 1.2 * (1 - k); }
      this.mode = 'off'; this.blankGlass();
      return 0;
    }
    return 0;
  }

  drawDot(a) {
    const c = this.ctx;
    c.fillStyle = '#050607'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const cx = this.rx + W, cy = this.ry + H;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, 26);
    g.addColorStop(0, `rgba(240,244,248,${a})`);
    g.addColorStop(0.25, `rgba(200,215,230,${0.5 * a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(cx - 30, cy - 30, 60, 60);
    this.texture.needsUpdate = true;
  }
}
