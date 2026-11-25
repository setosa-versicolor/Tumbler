import type { Renderer } from "../render/renderer";
import type { Button, Kit } from "../levels/kit";
import type { Game, GameEvent } from "../sim/game";
import type { Liquid } from "../levels/liquid";

// Pieces the HD levels share: the city through the windows, spilled liquid
// (coffee, sprinkler water), things close to the camera, and the secret
// DO NOT PUSH button that turns the graphics up.

/** Pseudo-random but fixed. */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------- skyline ---

/** The skyline is drawn once, a band of towers at a time, then slid about behind the glass. */
const SKY_U0 = -3;
const SKY_U1 = 20;
const SKY_H = 1.7;
const SKY_PX = 110;
interface Band {
  k: number;
  canvas: HTMLCanvasElement;
  /** Aircraft warning lights (x, height above the sill). */
  beacons: { x: number; y: number }[];
}
let bands: Band[] | null = null;
function skyline(): Band[] {
  if (bands) return bands;
  const specs = [
    { k: 0.08, h: 0.75, col: "#2b2850", win: 0.22 },
    { k: 0.16, h: 1.25, col: "#1d1a36", win: 0.4 },
    { k: 0.26, h: 1.6, col: "#120f22", win: 0.62 },
  ];
  bands = specs.map((spec, bi) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((SKY_U1 - SKY_U0) * SKY_PX);
    canvas.height = Math.round(SKY_H * SKY_PX);
    const ctx = canvas.getContext("2d")!;
    const X = (u: number) => (u - SKY_U0) * SKY_PX;
    const Y = (y: number) => (SKY_H - y) * SKY_PX;
    const beacons: Band["beacons"] = [];
    let u = SKY_U0;
    let i = 0;
    while (u < SKY_U1) {
      const seed = i * 1.37 + bi * 91;
      const w = 0.28 + hash(seed) * 0.42;
      const top = spec.h * (0.35 + hash(seed + 1) * 0.65);
      ctx.fillStyle = spec.col;
      ctx.fillRect(X(u), Y(top), w * SKY_PX, top * SKY_PX);
      if (hash(seed + 4) > 0.6) ctx.fillRect(X(u + w * 0.45), Y(top + 0.18), 0.05 * SKY_PX, 0.18 * SKY_PX);
      for (let wy = top - 0.08; wy > 0.04; wy -= 0.085) {
        for (let wx = u + 0.04; wx < u + w - 0.04; wx += 0.07) {
          const hs = hash(wx * 13.1 + wy * 7.3 + seed);
          if (hs > spec.win) continue;
          ctx.fillStyle = hs < 0.1 ? "rgba(160,200,255,0.85)" : "rgba(255,206,120,0.9)";
          ctx.fillRect(X(wx), Y(wy), 0.035 * SKY_PX, 0.035 * SKY_PX);
        }
      }
      if (spec.h > 1.2 && hash(seed + 9) > 0.7) beacons.push({ x: u + w / 2, y: top + 0.02 });
      u += w + 0.03 + hash(seed + 2) * 0.12;
      i++;
    }
    return { k: spec.k, canvas, beacons };
  });
  return bands;
}

/**
 * The city at dusk through `windows` (sill to head): sky, stars, the moon in
 * the widest one, three bands of towers sliding against the room as the camera
 * moves, blinking warning lights, a sheen on the glass. Draw it as a glow
 * (it lights itself).
 */
export function drawCity(r: Renderer, windows: [number, number][], sill: number, head: number, time: number, centre = 7) {
  const ctx = r.ctx;
  const cam = r.camera;
  const widest = windows.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), windows[0]);
  for (const [x0, x1] of windows) {
    const a = cam.toScreen({ x: x0, y: head });
    const b = cam.toScreen({ x: x1, y: sill });
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, a.y, 0, b.y);
    sky.addColorStop(0, "#141a3a");
    sky.addColorStop(0.45, "#4a3a72");
    sky.addColorStop(0.8, "#c9677a");
    sky.addColorStop(1, "#f6a65e");
    ctx.fillStyle = sky;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    for (let i = 0; i < 24; i++) {
      const sx = x0 + hash(i * 3.1 + x0) * (x1 - x0);
      const sy = head - hash(i * 7.7 + x0) * 0.8;
      r.circle({ x: sx, y: sy }, 0.008 + 0.006 * Math.sin(time * 2 + i), "rgba(255,255,240,0.8)");
    }
    if (x0 === widest[0] && x1 - x0 > 2) {
      const mx = x0 + Math.min(3.1, (x1 - x0) * 0.7);
      r.circle({ x: mx, y: head - 0.45 }, 0.2, "#fff4d8");
      r.circle({ x: mx, y: head - 0.45 }, 0.32, "rgba(255,244,216,0.15)");
    }
    for (const band of skyline()) {
      const shift = (cam.x - centre) * band.k;
      const p0 = cam.toScreen({ x: SKY_U0 + shift, y: sill + SKY_H });
      const p1 = cam.toScreen({ x: SKY_U1 + shift, y: sill });
      ctx.drawImage(band.canvas, p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      for (const [i, l] of band.beacons.entries()) {
        if (Math.sin(time * 2.4 + i * 1.9) > 0.6) r.circle({ x: l.x + shift, y: sill + l.y }, 0.022, "#ff4a3a");
      }
    }
    ctx.globalAlpha = 0.07;
    for (let gx = x0 - 1; gx < x1; gx += 0.9) r.poly([{ x: gx, y: sill }, { x: gx + 0.25, y: sill }, { x: gx + 0.95, y: head }, { x: gx + 0.7, y: head }], "#ffffff");
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// -------------------------------------------------------------- liquid ---

/** Colours for a spilled liquid. */
export interface LiquidLook {
  /** Puddle, top to bottom of its gradient, and its edge. */
  pool: [string, string, string];
  edge: string;
  /** A drop's body and its lighter core. */
  drop: string;
  core: string;
  /** Ripples where drops land. */
  ripple: string;
  /** The shine on a puddle (the room reflected in it). */
  shine: string;
}

export const COFFEE: LiquidLook = {
  pool: ["#4a2512", "#6e3c1c", "#8a5430"],
  edge: "rgba(196,140,92,0.9)",
  drop: "#3d2010",
  core: "#6b3f22",
  ripple: "160,110,70",
  shine: "rgba(255,230,190,0.55)",
};

export const WATER: LiquidLook = {
  pool: ["rgba(70,110,150,0.55)", "rgba(110,150,190,0.5)", "rgba(150,190,220,0.45)"],
  edge: "rgba(200,230,255,0.7)",
  drop: "rgba(160,200,235,0.75)",
  core: "rgba(235,248,255,0.85)",
  ripple: "200,230,255",
  shine: "rgba(220,240,255,0.6)",
};

/** How deep a puddle looks (it's drawn lying on the floor, seen from a little above). */
const puddleDepth = (p: { y: number; w: number }) => Math.min(p.y === 0 ? 0.24 : 0.07, 0.07 + p.w * 0.5);

/** Spilled liquid: drops in flight (streaks along their path), and pools where it's landed. */
export function drawLiquid(r: Renderer, liquid: Liquid, look: LiquidLook) {
  const ctx = r.ctx;
  const sc = r.camera.scale;
  const time = r.clock;
  for (const p of liquid.puddles) {
    const depth = puddleDepth(p);
    const c = r.camera.toScreen({ x: p.x, y: p.y - depth * 0.55 });
    const rx = p.w * sc;
    const ry = depth * sc * 0.5;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const k = 1 + 0.07 * Math.sin(t * 3 + p.x * 9) + 0.04 * Math.sin(t * 5 + p.x * 3);
      ctx.lineTo(Math.cos(t) * rx * k, Math.sin(t) * ry * k);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -ry, 0, ry);
    g.addColorStop(0, look.pool[0]);
    g.addColorStop(0.6, look.pool[1]);
    g.addColorStop(1, look.pool[2]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = look.edge;
    ctx.lineWidth = Math.max(1, 0.006 * sc);
    ctx.stroke();
    ctx.restore();
    if (liquid.drops.length) {
      const ph = (time * 1.3 + p.x) % 1;
      r.ring({ x: p.x + Math.sin(time + p.x) * p.w * 0.4, y: p.y - depth * 0.55 }, 0.02 + ph * p.w * 0.3, `rgba(${look.ripple},${0.4 * (1 - ph)})`, 0.004);
    }
  }
  if (!liquid.drops.length) return;
  ctx.lineCap = "round";
  ctx.strokeStyle = look.drop;
  ctx.lineWidth = 0.042 * sc;
  ctx.beginPath();
  for (const d of liquid.drops) {
    const a = r.camera.toScreen(d);
    const b = r.camera.toScreen({ x: d.x - d.vx * 0.02, y: d.y - d.vy * 0.02 });
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y);
  }
  ctx.stroke();
  ctx.strokeStyle = look.core;
  ctx.lineWidth = 0.022 * sc;
  ctx.beginPath();
  for (const d of liquid.drops) {
    const a = r.camera.toScreen({ x: d.x - 0.004, y: d.y + 0.004 });
    const b = r.camera.toScreen({ x: d.x - d.vx * 0.012 - 0.004, y: d.y - d.vy * 0.012 + 0.004 });
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(255,245,230,0.6)";
  for (const d of liquid.drops) {
    const a = r.camera.toScreen({ x: d.x - 0.007, y: d.y + 0.008 });
    ctx.fillRect(a.x, a.y, Math.max(1, 0.006 * sc), Math.max(1, 0.006 * sc));
  }
}

/** The wet shine on the puddles: draw it on top of everything (it's the room reflected). */
export function drawShine(r: Renderer, liquid: Liquid, look: LiquidLook) {
  const ctx = r.ctx;
  const sc = r.camera.scale;
  for (const p of liquid.puddles) {
    const depth = puddleDepth(p);
    const c = r.camera.toScreen({ x: p.x, y: p.y - depth * 0.55 });
    const rx = p.w * sc;
    const ry = depth * sc * 0.5;
    const shift = ((r.camera.x - p.x) * 0.15) % 1;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = look.shine;
    ctx.beginPath();
    ctx.ellipse(-rx * (0.35 + shift * 0.2), -ry * 0.2, rx * 0.26, Math.max(1.5, ry * 0.32), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(rx * (0.3 - shift * 0.15), -ry * 0.05, rx * 0.12, Math.max(1, ry * 0.22), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------- foreground ---

/**
 * Close to the camera, out of focus: drawn `k` times nearer (bigger, and
 * sliding past faster), along the bottom of the screen so it never hides the job.
 */
export function near(r: Renderer, k: number, fn: (ctx: CanvasRenderingContext2D) => void) {
  const ctx = r.ctx;
  const cam = r.camera;
  const s = cam.scale * k;
  ctx.save();
  ctx.translate(cam.w / 2 - cam.x * s, cam.h);
  ctx.scale(s, -s);
  fn(ctx);
  ctx.restore();
}

// ------------------------------------------------------- secret button ---

/** Seconds the graphics take to turn up (the wipe across the room, the lights coming on). */
export const UPGRADE_TIME = 2.4;

/**
 * The DO NOT PUSH button: a red mushroom cap on a yellow collar, coming out of
 * a side wall. In the usual graphics, pushing it turns the graphics up; in HD,
 * it's up to the level. Flailing at it counts once.
 */
export class SecretButton {
  readonly button: Button;
  /** Seconds since it turned the graphics up (-1: it hasn't). */
  since = -1;
  private presses = 0;

  constructor(
    kit: Kit,
    /** The wall's surface, the height, and which way the button faces (into the room). */
    readonly at: { wallX: number; y: number; face: "left" | "right" },
    readonly size = { hw: 0.05, hh: 0.1, mount: 0.09 },
  ) {
    const s = at.face === "right" ? 1 : -1;
    this.button = kit.button(at.wallX + s * size.mount, at.y, size.hw, size.hh, at.face);
    this.button.style = "custom";
  }

  /**
   * Call every step. Returns "up" on a push that turned the graphics up (its
   * events already added), "hd" on a push in HD, and null otherwise. While
   * `busy` (or while the graphics are still coming up), pushes are ignored.
   */
  update(game: Game, dt: number, events: GameEvent[], busy = false): "up" | "hd" | null {
    if (this.since >= 0) this.since += dt;
    if (this.button.presses > this.presses && (busy || (this.since >= 0 && this.since < UPGRADE_TIME))) this.presses = this.button.presses;
    if (this.button.presses <= this.presses) return null;
    this.presses = this.button.presses;
    if (!game.hd) {
      this.since = 0;
      const p = this.button.cap.translation();
      events.push({ type: "graphics", to: "hd" });
      events.push({ type: "surprise", id: `dnp-${this.presses}`, text: "It said DO NOT PUSH.", pos: { x: p.x + (this.at.face === "right" ? 0.8 : -0.8), y: p.y + 0.5 } });
      return "up";
    }
    return "hd";
  }

  /** How many times it's been pushed (and counted). */
  get count() {
    return this.presses;
  }

  /** The collar, stem and cap (in the room, with Stanley). `glow`: lit up, 0–1. */
  draw(r: Renderer, glow = 0) {
    const { wallX, y, face } = this.at;
    const { hw, hh, mount } = this.size;
    const s = face === "right" ? 1 : -1;
    const p = this.button.cap.translation();
    const lit = this.button.lit > 0;
    const x = (d: number) => wallX + s * d;
    const rect = (a: number, b: number, y0: number, y1: number, c: string) => r.rect(Math.min(x(a), x(b)), y0, Math.max(x(a), x(b)), y1, c);
    rect(0, mount - 0.02, y - hh - 0.05, y + hh + 0.05, "#f2c230");
    rect(0, 0.015, y - hh - 0.05, y + hh + 0.05, "#1d1d1d");
    r.rect(Math.min(x(mount - 0.02), p.x - s * hw), y - 0.04, Math.max(x(mount - 0.02), p.x - s * hw), y + 0.04, "#555c66");
    r.roundRect(p.x - hw, p.y - hh, p.x + hw, p.y + hh, 0.04, lit ? "#ff4a3d" : "#d1271d");
    const hx = p.x + s * (hw - 0.0125);
    r.rect(hx - 0.0075, p.y - hh + 0.03, hx + 0.0075, p.y + hh - 0.03, "rgba(255,255,255,0.35)");
    if (glow > 0 || lit) r.emit(() => r.circle({ x: p.x, y: p.y }, 0.12, `rgba(255,60,40,${Math.max(glow, lit ? 0.5 : 0)})`));
  }

  /** The hazard plate on the back wall where it comes out, and the DO NOT PUSH sign (above, or below with `below`). */
  drawSign(r: Renderer, below = false) {
    const { wallX, y, face } = this.at;
    const s = face === "right" ? 1 : -1;
    const x0 = Math.min(wallX, wallX + s * 0.32);
    const x1 = Math.max(wallX, wallX + s * 0.32);
    r.rect(x0, y - 0.2, x1, y + 0.2, "#f2c230");
    const ctx = r.ctx;
    const a = r.camera.toScreen({ x: x0, y: y + 0.2 });
    const b = r.camera.toScreen({ x: x1, y: y - 0.2 });
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.clip();
    for (let x = x0 - 0.4; x < x1 + 0.4; x += 0.1) r.poly([{ x, y: y - 0.2 }, { x: x + 0.05, y: y - 0.2 }, { x: x + 0.45, y: y + 0.2 }, { x: x + 0.4, y: y + 0.2 }], "#1d1d1d");
    ctx.restore();
    const sx0 = Math.min(wallX + s * 0.04, wallX + s * 1.02);
    const sx1 = Math.max(wallX + s * 0.04, wallX + s * 1.02);
    const sy0 = below ? y - 0.66 : y + 0.3;
    const sy1 = sy0 + 0.36;
    r.roundRect(sx0, sy0, sx1, sy1, 0.03, "#f4f1e8");
    r.roundRect(sx0 + 0.025, sy0 + 0.025, sx1 - 0.025, sy1 - 0.025, 0.02, "#c62828");
    r.text("DO NOT", { x: (sx0 + sx1) / 2, y: sy1 - 0.11 }, 0.11, "#ffffff");
    r.text("PUSH", { x: (sx0 + sx1) / 2, y: sy0 + 0.11 }, 0.15, "#ffffff");
    const ax = wallX + s * 0.2;
    if (below) r.poly([{ x: ax - 0.1, y: sy1 + 0.03 }, { x: ax, y: sy1 + 0.12 }, { x: ax + 0.1, y: sy1 + 0.03 }], "#c62828");
    else r.poly([{ x: ax - 0.1, y: sy0 - 0.03 }, { x: ax, y: sy0 - 0.12 }, { x: ax + 0.1, y: sy0 - 0.03 }], "#c62828");
  }
}
