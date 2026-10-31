import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import type { Game } from "../sim/game";
import type { Prop, Solid } from "../levels/kit";
import type { Level } from "../levels/level";
import { DIM, type Side } from "../physics/body/rig";
import { clamp, rotate, type Vec } from "../sim/math";

const C = {
  skin: "#f2c79b",
  skinBack: "#d9a97c",
  shirt: "#37a59c",
  shirtBack: "#2a8079",
  pants: "#3b4a7a",
  pantsBack: "#2c3860",
  cap: "#f08a3c",
  ink: "#2a2230",
};

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export class Camera {
  x = 0;
  y = 0;
  scale = 60;
  w = 1;
  h = 1;
  /** Room size and framing come from the level. */
  bounds = { w: 16, h: 8 };
  viewHeight = 5.6;
  /** Brief extra zoom (e.g. on completing a job). */
  punch = 0;
  private shakeT = 0;
  private shakeMag = 0;

  setLevel(level: Level) {
    this.bounds = level.bounds;
    this.viewHeight = level.viewHeight ?? 5.6;
    this.resize(this.w, this.h);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    // Frame a fixed height so Stanley reads well on a phone; never show
    // more than the room is wide.
    const base = Math.min(h / this.viewHeight, w / (w < h ? 5 : 8));
    this.scale = Math.max(base, w / (this.bounds.w + 1)) * (1 + this.punch);
  }

  shake(mag: number) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = 0.25;
  }

  follow(target: Vec, dt: number, snap = false) {
    this.punch = Math.max(0, this.punch - dt * 0.4);
    this.resize(this.w, this.h);
    const { w: bw, h: bh } = this.bounds;
    const vw = this.w / this.scale;
    const vh = this.h / this.scale;
    const tx = vw >= bw + 1 ? bw / 2 : clamp(target.x, vw / 2 - 0.5, bw - vw / 2 + 0.5);
    // When the whole room fits, sit the floor near the bottom of the screen;
    // on tall portrait screens leave more space below for thumbs.
    const floorGap = this.h > this.w ? 1.6 : 0.45;
    const ty = vh >= bh + floorGap ? vh / 2 - floorGap : clamp(target.y + 0.5, vh / 2 - floorGap, bh - vh / 2 + 0.3);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT === 0) this.shakeMag = 0;
  }

  get offset(): Vec {
    if (!this.shakeT) return { x: 0, y: 0 };
    const m = this.shakeMag * (this.shakeT / 0.25);
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }

  toScreen(p: Vec): Vec {
    return { x: (p.x - this.x) * this.scale + this.w / 2, y: this.h / 2 - (p.y - this.y) * this.scale };
  }

  toWorld(sx: number, sy: number): Vec {
    return { x: (sx - this.w / 2) / this.scale + this.x, y: (this.h / 2 - sy) / this.scale + this.y };
  }
}

interface Popup {
  text: string;
  pos: Vec;
  age: number;
  color: string;
}

interface Particle {
  pos: Vec;
  vel: Vec;
  age: number;
  life: number;
  size: number;
  color: string;
  spin: number;
  shape: "star" | "confetti" | "dust" | "drop";
}

export interface Bubble {
  /** World point the tail points at. */
  anchor: Vec;
  text: string;
  /** Characters revealed so far. */
  shown: number;
  /** Smaller, italic, for asides. */
  aside?: boolean;
  /** Put the bubble below the speaker (when something above needs to be seen). */
  below?: boolean;
}

export class Renderer {
  readonly camera = new Camera();
  readonly ctx: CanvasRenderingContext2D;
  private popups: Popup[] = [];
  private particles: Particle[] = [];
  private blink = 0;
  private dpr = 1;
  private time = 0;
  /** Shown as a crosshair when the reach point comes from a mouse. */
  cursor: Vec | null = null;
  bubble: Bubble | null = null;
  private notes: { text: string; pos: Vec; age: number }[] = [];
  /** Off-screen goal indicator. */
  goal: { pos: Vec; icon: string } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.camera.resize(w, h);
  }

  // ------------------------------------------------------------ effects ---

  popup(text: string, pos: Vec, color = C.ink) {
    this.popups.push({ text, pos: { ...pos }, age: 0, color });
  }

  dizzy(pos: Vec) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(a) * 1.6, y: Math.sin(a) * 1.6 + 1.2 },
        age: 0,
        life: 0.9,
        size: 0.09,
        color: "#ffd84a",
        spin: 0,
        shape: "star",
      });
    }
  }

  dust(pos: Vec, amount = 1) {
    for (let i = 0; i < 5 * amount; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y + 0.05 },
        vel: { x: (Math.random() - 0.5) * 1.6, y: Math.random() * 0.8 },
        age: 0,
        life: 0.5 + Math.random() * 0.3,
        size: 0.06 + Math.random() * 0.06,
        color: "rgba(140,120,100,0.45)",
        spin: 0,
        shape: "dust",
      });
    }
  }

  confetti(pos: Vec) {
    const colors = ["#f08a3c", "#37a59c", "#ffd84a", "#e85d5d", "#5d9de8", "#c58be8"];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI - Math.PI;
      const sp = 3 + Math.random() * 5;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(a) * sp * 0.7, y: -Math.sin(a) * sp },
        age: 0,
        life: 1.6 + Math.random(),
        size: 0.05 + Math.random() * 0.04,
        color: colors[i % colors.length],
        spin: (Math.random() - 0.5) * 20,
        shape: "confetti",
      });
    }
  }

  /** A small, quiet caption next to something in the world. No fanfare. */
  note(text: string, pos: Vec) {
    this.notes.push({ text, pos: { ...pos }, age: 0 });
  }

  clearFx() {
    this.notes = [];
    this.popups = [];
    this.particles = [];
    this.bubble = null;
  }

  // --------------------------------------------- world-space primitives ---

  rect(x0: number, y0: number, x1: number, y1: number, color: string) {
    const a = this.camera.toScreen({ x: x0, y: y1 });
    const s = this.camera.scale;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(a.x, a.y, (x1 - x0) * s, (y1 - y0) * s);
  }

  roundRect(x0: number, y0: number, x1: number, y1: number, r: number, color: string) {
    const a = this.camera.toScreen({ x: x0, y: y1 });
    const s = this.camera.scale;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.roundRect(a.x, a.y, (x1 - x0) * s, (y1 - y0) * s, r * s);
    this.ctx.fill();
  }

  circle(c: Vec, r: number, color: string) {
    const s = this.camera.toScreen(c);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(s.x, s.y, r * this.camera.scale, 0, Math.PI * 2);
    this.ctx.fill();
  }

  ring(c: Vec, r: number, color: string, width: number) {
    const s = this.camera.toScreen(c);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width * this.camera.scale;
    this.ctx.beginPath();
    this.ctx.arc(s.x, s.y, r * this.camera.scale, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  line(a: Vec, b: Vec, width: number, color: string) {
    const sa = this.camera.toScreen(a);
    const sb = this.camera.toScreen(b);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width * this.camera.scale;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(sa.x, sa.y);
    this.ctx.lineTo(sb.x, sb.y);
    this.ctx.stroke();
  }

  dashed(a: Vec, b: Vec, color: string) {
    const sa = this.camera.toScreen(a);
    const sb = this.camera.toScreen(b);
    const ctx = this.ctx;
    ctx.setLineDash([10, 7]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  poly(pts: Vec[], color: string) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    for (const p of pts) {
      const s = this.camera.toScreen(p);
      this.ctx.lineTo(s.x, s.y);
    }
    this.ctx.fill();
  }

  text(str: string, pos: Vec, size: number, color: string, align: CanvasTextAlign = "center", weight = 800) {
    const s = this.camera.toScreen(pos);
    const ctx = this.ctx;
    ctx.font = `${weight} ${Math.max(10, size * this.camera.scale)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(str, s.x, s.y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // --------------------------------------------------------------- frame ---

  draw(game: Game, dt: number) {
    const { ctx, camera: cam } = this;
    this.time += dt;
    const sh = cam.offset;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, sh.x * this.dpr, sh.y * this.dpr);
    this.drawBackground(game);
    game.inst.drawBack?.(this, game);
    for (const s of game.solids) if (!s.hidden) this.drawSolid(s, game);
    for (const b of game.buttons) {
      const p = b.cap.translation();
      if (b.style === "bell") {
        // A brass ship's bell on a bracket; it swings a little when rung.
        const swing = b.lit > 0 ? Math.sin(b.lit * 18) * 0.06 * b.lit : 0;
        this.line({ x: p.x + b.hw, y: p.y + b.hh + 0.08 }, { x: p.x + swing, y: p.y + b.hh + 0.08 }, 0.04, "#5b4330");
        this.poly(
          [
            { x: p.x - b.hw * 0.55 + swing, y: p.y + b.hh },
            { x: p.x + b.hw * 0.55 + swing, y: p.y + b.hh },
            { x: p.x + b.hw * 1.2 + swing, y: p.y - b.hh },
            { x: p.x - b.hw * 1.2 + swing, y: p.y - b.hh },
          ],
          b.lit > 0 ? "#ffd84a" : "#d4a53a",
        );
        this.circle({ x: p.x + swing * 1.6, y: p.y - b.hh - 0.03 }, 0.035, "#8a6a2a");
      } else this.roundRect(p.x - b.hw, p.y - b.hh, p.x + b.hw, p.y + b.hh, 0.03, b.lit > 0 ? "#ff5a4f" : "#d6453c");
    }
    for (const p of game.props) this.drawProp(p);
    game.inst.drawMid?.(this, game);
    game.twist?.draw?.(this, game);
    this.drawShadow(game);
    // Flattened (a cannonball): squash him about his feet.
    const sq = game.stanley.squash;
    if (sq > 0) {
      const b = game.stanley.balance;
      const p = game.stanley.rig.pelvis.translation();
      const g = this.camera.toScreen({ x: p.x, y: Number.isFinite(b.groundDist) ? p.y - b.groundDist : p.y - 0.9 });
      const k = Math.min(1, sq * 1.4);
      this.ctx.save();
      this.ctx.translate(g.x, g.y);
      this.ctx.scale(1 + 0.45 * k, 1 - 0.55 * k);
      this.ctx.translate(-g.x, -g.y);
    }
    this.drawStanley(game, dt);
    if (sq > 0) this.ctx.restore();
    this.drawWater(game);
    game.inst.drawFront?.(this, game);
    this.drawFx(dt);
    if (this.cursor) {
      const s = cam.toScreen(this.cursor);
      ctx.strokeStyle = "rgba(42,34,48,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.goal) this.drawGoalMarker(this.goal.pos, this.goal.icon);
    if (this.bubble) this.drawBubble(this.bubble);
  }

  /** When the goal is off-screen, a badge on the screen edge points the way. */
  private drawGoalMarker(target: Vec, icon: string) {
    const { ctx, camera: cam } = this;
    const s = cam.toScreen(target);
    const m = 34;
    if (s.x > m && s.x < cam.w - m && s.y > m + 50 && s.y < cam.h - m) return;
    const x = clamp(s.x, m, cam.w - m);
    const y = clamp(s.y, m + 56, cam.h - m - 30);
    const a = Math.atan2(s.y - y, s.x - x);
    const pulse = 1 + Math.sin(this.time * 6) * 0.06;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(42,34,48,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(a);
    ctx.fillStyle = "#f08a3c";
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(20, -8);
    ctx.lineTo(20, 8);
    ctx.fill();
    ctx.rotate(-a);
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, 0, 1);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  private drawBackground(game: Game) {
    const { ctx, camera: cam } = this;
    const theme = game.level.theme;
    const { w: bw, h: bh } = cam.bounds;
    ctx.fillStyle = theme.outdoor ? theme.bottom : "#3a3040";
    ctx.fillRect(-20, -20, cam.w + 40, cam.h + 40);
    const top = cam.toScreen({ x: 0, y: theme.outdoor ? bh + 6 : bh }).y;
    const bottom = cam.toScreen({ x: 0, y: 0 }).y;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, theme.top);
    g.addColorStop(1, theme.bottom);
    ctx.fillStyle = g;
    if (theme.outdoor) {
      ctx.fillRect(-20, -20, cam.w + 40, bottom + 20);
      // Sun, clouds, hills.
      this.circle({ x: bw * 0.18, y: bh - 1.2 }, 0.55, "#fff1a8");
      for (const [cx, cy, s] of [[3.5, 5.6, 1], [8.5, 6.2, 0.8], [12, 5.3, 1.1]] as const) {
        const drift = (this.time * 0.08 * s) % 2;
        const x = cx + drift;
        this.circle({ x, y: cy }, 0.35 * s, "rgba(255,255,255,0.9)");
        this.circle({ x: x + 0.4 * s, y: cy + 0.15 }, 0.45 * s, "rgba(255,255,255,0.9)");
        this.circle({ x: x + 0.85 * s, y: cy }, 0.32 * s, "rgba(255,255,255,0.9)");
      }
      if (theme.sea) {
        this.rect(-10, -1, bw + 10, 2.4, "#5a9fc4");
        this.rect(-10, 2.3, bw + 10, 2.4, "rgba(255,255,255,0.5)");
        for (let i = 0; i < 8; i++) {
          const x = ((i * 4.7 + this.time * 0.15) % (bw + 6)) - 2;
          this.line({ x, y: 1.6 + (i % 3) * 0.25 }, { x: x + 0.5, y: 1.6 + (i % 3) * 0.25 }, 0.03, "rgba(255,255,255,0.45)");
        }
        // A gull drifts across the sky now and then.
        const gx = ((this.time * 0.7) % (bw + 8)) - 4;
        const gy = 4.6 + Math.sin(this.time * 0.8) * 0.3;
        const flap = Math.sin(this.time * 7) * 0.08;
        this.line({ x: gx - 0.18, y: gy + flap }, { x: gx, y: gy }, 0.03, "#f4f4f4");
        this.line({ x: gx, y: gy }, { x: gx + 0.18, y: gy + flap }, 0.03, "#f4f4f4");
        // A distant ship.
        this.poly([{ x: bw * 0.7, y: 2.4 }, { x: bw * 0.7 + 1.4, y: 2.4 }, { x: bw * 0.7 + 1.2, y: 2.2 }, { x: bw * 0.7 + 0.2, y: 2.2 }], "#3e5a70");
        this.rect(bw * 0.7 + 0.5, 2.4, bw * 0.7 + 0.6, 3.0, "#3e5a70");
      } else if (!theme.city) for (let i = 0; i < 6; i++) this.circle({ x: i * 3.2 - 1, y: -1.2 }, 2.6, "#a9d98a");
    } else {
      const a = cam.toScreen({ x: 0, y: bh });
      ctx.fillRect(a.x, a.y, bw * cam.scale, bh * cam.scale);
      if (theme.stripe) for (let x = 0.5; x < bw; x += 1) this.rect(x, 0, x + 0.35, bh, theme.stripe);
      // Skirting board.
      this.rect(0, 0, bw, 0.12, "rgba(255,255,255,0.35)");
    }
    // Ground band.
    this.rect(-10, -5, bw + 10, 0, theme.floor);
    this.rect(-10, -0.08, bw + 10, 0, theme.floorTop);
    if (!theme.outdoor) {
      // Walls and ceiling beyond the room.
      this.rect(-10, -5, 0, bh + 10, "#5b4b5e");
      this.rect(bw, -5, bw + 10, bh + 10, "#5b4b5e");
      this.rect(-10, bh, bw + 10, bh + 10, "#5b4b5e");
    }
  }

  /** Translucent water with a wobbling surface. */
  private drawWater(game: Game) {
    for (const w of game.waters) {
      const pts: Vec[] = [];
      for (let x = w.x0; x <= w.x1 + 0.001; x += 0.1) pts.push({ x, y: w.y + Math.sin(x * 3 + this.time * 2.5) * 0.03 });
      this.poly([...pts, { x: w.x1, y: -0.05 }, { x: w.x0, y: -0.05 }], "rgba(60,130,180,0.62)");
      for (let i = 0; i < pts.length - 1; i += 2) this.line(pts[i], pts[i + 1], 0.025, "rgba(255,255,255,0.55)");
    }
  }

  splash(pos: Vec, big: boolean) {
    for (let i = 0; i < (big ? 26 : 10); i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y },
        vel: { x: (Math.random() - 0.5) * (big ? 4 : 2), y: 1.5 + Math.random() * (big ? 4 : 2.5) },
        age: 0,
        life: 0.9,
        size: 0.04 + Math.random() * 0.04,
        color: "rgba(150,200,235,0.9)",
        spin: 0,
        shape: "drop",
      });
    }
  }

  private drawSolid(s: Solid, game: Game) {
    if (s.angle) {
      // Rotated solids (ramps): draw the rotated box.
      const c = Math.cos(s.angle);
      const sn = Math.sin(s.angle);
      const corner = (dx: number, dy: number) => ({ x: s.x + dx * c - dy * sn, y: s.y + dx * sn + dy * c });
      this.poly([corner(-s.hw, -s.hh), corner(s.hw, -s.hh), corner(s.hw, s.hh), corner(-s.hw, s.hh)], s.kind === "vanramp" ? "#9aa0a8" : "#8a7a6a");
      return;
    }
    const x0 = s.x - s.hw;
    const x1 = s.x + s.hw;
    const y0 = s.y - s.hh;
    const y1 = s.y + s.hh;
    switch (s.kind) {
      case "floor":
      case "ground":
      case "wall":
        return;
      case "ledge":
        this.rect(x0, y0, x1, y1, "#7c8a99");
        this.rect(x0, y1 - 0.05, x1, y1, "#98a6b4");
        return;
      case "basket":
        this.rect(x0, y0, x1, y1, "#b98a4f");
        return;
      case "step":
      case "landing":
        this.rect(x0, y0, x1, y1, "#a77a52");
        this.rect(x0, y1 - 0.05, x1, y1, "#c39468");
        this.rect(x0, y0, x0 + 0.02, y1, "rgba(0,0,0,0.12)");
        return;
      case "desk":
        this.rect(x0, y0, x1, y1, "#6b4a3a");
        this.rect(x0 - 0.06, y1 - 0.07, x1 + 0.06, y1, "#82604c");
        this.rect(x0 + 0.15, y0 + 0.15, x0 + 0.8, y1 - 0.2, "#5d3f31");
        return;
      case "dresser":
        this.rect(x0, y0, x1, y1, "#9a6b4a");
        for (let i = 1; i < 3; i++) {
          const y = y0 + ((y1 - y0) * i) / 3;
          this.rect(x0 + 0.06, y - 0.01, x1 - 0.06, y + 0.01, "rgba(0,0,0,0.2)");
          this.circle({ x: s.x, y: y + (y1 - y0) / 6 }, 0.035, "#e8c77a");
        }
        return;
      case "dock":
        this.rect(x0, y0, x1, y1, "#7a5a40");
        this.rect(x0, y1 - 0.1, x1, y1, "#9a7552");
        for (let x = x0 + 0.5; x < x1; x += 0.5) this.rect(x, y1 - 0.1, x + 0.02, y1, "rgba(0,0,0,0.2)");
        for (let x = x0 + 0.6; x < x1; x += 1.6) this.rect(x, y0, x + 0.16, y1 - 0.1, "#5b4330");
        return;
      case "hull":
        this.rect(x0, y0, x1, y1, "#2f5d8a");
        this.rect(x0, y1 - 0.12, x1, y1, "#f4efe6");
        this.rect(x0, y0 + 0.25, x1, y0 + 0.4, "#c0392b");
        return;
      case "post":
        this.roundRect(x0, y0, x1, y1, 0.05, "#5b4330");
        this.rect(x0 - 0.02, y1 - 0.06, x1 + 0.02, y1, "#6b5340");
        return;
      case "van":
        this.rect(x0, y0, x1, y1, "#e9e4da");
        this.rect(x0, y1 - 0.05, x1, y1, "#c9c4ba");
        return;
      case "partition":
        this.rect(x0, y0, x1, y1, "#b8bec6");
        this.rect(x0 - 0.05, y0 - 0.06, x1 + 0.05, y0, "#8a9099");
        return;
      case "counter":
        this.rect(x0, y0, x1, y1, "#c9ccd1");
        this.rect(x0 - 0.04, y1 - 0.06, x1 + 0.04, y1, "#5f6670");
        for (let x = x0 + 0.4; x < x1; x += 0.8) this.rect(x - 0.01, y0 + 0.1, x + 0.01, y1 - 0.15, "rgba(0,0,0,0.15)");
        return;
      case "facade":
        this.rect(x0, y0, x1, y1, "#7fa3bf");
        this.rect(x0, y0, x0 + 0.05, y1, "#c9d4dd");
        return;
      case "cabinet":
        this.rect(x0, y0, x1, y1, "#7a828c");
        for (let y = y0 + 0.3; y < y1; y += 0.35) {
          this.rect(x0 + 0.06, y - 0.01, x1 - 0.06, y + 0.01, "rgba(0,0,0,0.25)");
          this.rect(s.x - 0.12, y + 0.12, s.x + 0.12, y + 0.15, "#c9ccd1");
        }
        return;
      case "shredder":
        this.rect(x0, y0, x1, y1, "#3a3f47");
        this.rect(x0 + 0.05, y1 - 0.06, x1 - 0.05, y1, "#15181c");
        this.circle({ x: x1 - 0.15, y: y1 - 0.2 }, 0.04, "#7bc96f");
        return;
      case "porch":
        this.rect(x0, y0, x1, y1, "#c9b49a");
        this.rect(x0, y1 - 0.04, x1, y1, "#ddcbb2");
        return;
      case "table":
        this.rect(x0, y1 - 0.08, x1, y1, "#a0704a");
        this.rect(x0 + 0.06, y0, x0 + 0.12, y1, "#8a5e3c");
        this.rect(x1 - 0.12, y0, x1 - 0.06, y1, "#8a5e3c");
        return;
      case "bed":
        this.rect(x0, y0, x1, y1, "#6b5a8a");
        this.roundRect(x0 + 0.05, y1 - 0.18, x1 - 0.05, y1 + 0.04, 0.06, "#f4f1ea");
        this.roundRect(x1 - 0.55, y1 - 0.02, x1 - 0.08, y1 + 0.14, 0.06, "#ffffff");
        this.rect(x0 - 0.06, y0, x0, y1 + 0.35, "#5a4a78");
        return;
      default:
        void game;
        this.rect(x0, y0, x1, y1, "#8a7a6a");
    }
  }

  private drawProp(p: Prop) {
    const { ctx, camera: cam } = this;
    const sc = cam.scale;
    const pos = cam.toScreen(p.body.translation());
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(-p.body.rotation());
    const w = p.hw * sc;
    const h = p.hh * sc;
    const outline = () => {
      ctx.lineWidth = Math.max(1.5, sc * 0.022);
      ctx.strokeStyle = "rgba(42,34,48,0.55)";
      ctx.stroke();
    };
    const body = (r = Math.min(w, h) * 0.18) => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(-w, -h, w * 2, h * 2, r);
      ctx.fill();
      outline();
    };
    const label = (text: string, color: string, size = h * 1.2) => {
      ctx.fillStyle = color;
      ctx.font = `900 ${Math.max(6, size)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 1);
    };
    switch (p.kind) {
      case "ball":
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, w, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.strokeStyle = "rgba(42,34,48,0.25)";
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.62, -0.6, 0.9);
        ctx.stroke();
        break;
      case "box":
        body();
        ctx.fillStyle = "rgba(255,240,200,0.55)";
        ctx.fillRect(-w * 0.18, -h, w * 0.36, h * 2);
        break;
      case "crate":
        body(2);
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        for (const f of [-0.5, 0.5]) ctx.fillRect(-w, f * h - h * 0.06, w * 2, h * 0.12);
        break;
      case "plank":
        body();
        break;
      case "pizza":
        body(3);
        label("PIZZA", "#d9453c", h * 1.5);
        break;
      case "sock":
        body(h);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillRect(-w, -h, w * 0.3, h * 2);
        break;
      case "gnome":
        ctx.fillStyle = "#3b6ea8";
        ctx.beginPath();
        ctx.roundRect(-w, -h * 0.1, w * 2, h * 1.1, w * 0.4);
        ctx.fill();
        ctx.fillStyle = "#f2c79b";
        ctx.beginPath();
        ctx.arc(0, -h * 0.25, w * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, -h * 0.05, w * 0.55, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.8, -h * 0.45);
        ctx.lineTo(w * 0.8, -h * 0.45);
        ctx.lineTo(w * 0.1, -h * 1.05);
        ctx.fill();
        {
          // Face: content, or (once knocked over) furious.
          const mad = p.mood === "offended";
          ctx.fillStyle = mad ? "rgba(220,60,60,0.35)" : "rgba(232,120,120,0.35)";
          for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(sx * w * 0.38, -h * 0.17, w * 0.13, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = C.ink;
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = Math.max(1, w * 0.1);
          for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(sx * w * 0.22, -h * 0.3, w * (mad ? 0.09 : 0.07), 0, Math.PI * 2);
            ctx.fill();
            if (mad) {
              ctx.beginPath();
              ctx.moveTo(sx * w * 0.42, -h * 0.44);
              ctx.lineTo(sx * w * 0.08, -h * 0.36);
              ctx.stroke();
            }
          }
          if (mad) {
            ctx.beginPath();
            ctx.ellipse(0, h * 0.06, w * 0.14, w * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      case "mug": {
        // A white mug: handle (outlined so it reads against a pale wall), a red
        // band, and a big "#1" — the kind of mug you buy yourself.
        ctx.lineWidth = Math.max(3, w * 0.4);
        ctx.strokeStyle = C.ink;
        ctx.beginPath();
        ctx.arc(w * 1.05, 0, h * 0.42, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.5, w * 0.22);
        ctx.strokeStyle = p.color;
        ctx.stroke();
        body(w * 0.25);
        ctx.fillStyle = "#c0392b";
        ctx.fillRect(-w, -h * 0.72, w * 2, h * 0.22);
        ctx.fillStyle = "#c0392b";
        ctx.font = `900 ${Math.max(9, h * 1.05)}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("#1", 0, h * 0.25);
        break;
      }
      case "pens":
        ctx.strokeStyle = "#f2c94c";
        ctx.lineWidth = Math.max(1.5, w * 0.25);
        for (const dx of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(dx * w, -h);
          ctx.lineTo(dx * w * 1.6, -h * 1.9);
          ctx.stroke();
        }
        body(w * 0.2);
        break;
      case "nameplate":
        // Always seen from behind: the name faces Gerald, not us.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w, h);
        ctx.lineTo(w, h);
        ctx.lineTo(w * 0.8, -h);
        ctx.lineTo(-w * 0.8, -h);
        ctx.fill();
        outline();
        if (p.mood) {
          // The reveal: for once, it's facing us.
          ctx.fillStyle = "#f2c94c";
          ctx.fillRect(-w * 0.75, -h * 0.55, w * 1.5, h * 1.1);
          label(p.mood, "#3a2a20", h * 0.62);
        } else {
          ctx.fillStyle = "rgba(242,201,76,0.6)";
          ctx.fillRect(-w * 0.6, -h * 0.15, w * 1.2, h * 0.3);
        }
        break;
      case "photo":
        if (p.mood === "front") {
          // The family: Gerald, Mum, and a very small Stanley in a very small cap, mid-flail.
          body(2);
          ctx.fillStyle = "#cfe9f7";
          ctx.fillRect(-w * 0.8, -h * 0.82, w * 1.6, h * 1.64);
          const fig = (x: number, y: number, r: number, skin: string, top: string) => {
            ctx.fillStyle = top;
            ctx.fillRect(x - r * 0.9, y, r * 1.8, h * 0.82 - y);
            ctx.fillStyle = skin;
            ctx.beginPath();
            ctx.arc(x, y - r * 0.6, r * 0.8, 0, Math.PI * 2);
            ctx.fill();
          };
          fig(-w * 0.45, -h * 0.25, w * 0.28, "#eebd92", "#4a5160");
          fig(w * 0.45, -h * 0.2, w * 0.26, "#f2c79b", "#c58be8");
          fig(0, h * 0.25, w * 0.18, "#f2c79b", "#37a59c");
          ctx.fillStyle = "#f08a3c";
          ctx.fillRect(-w * 0.15, h * 0.02, w * 0.3, h * 0.07);
        } else {
          // Turned away from the camera; we only ever see the stand.
          body(2);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(-w * 0.15, -h * 0.6, w * 0.3, h * 1.2);
        }
        break;
      case "files":
        body(2);
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        for (const f of [-0.35, 0.35]) ctx.fillRect(-w, f * h, w * 2, Math.max(1, h * 0.12));
        break;
      case "plant":
        ctx.fillStyle = "#4f8a3a";
        for (const [dx, dy, r] of [[0, -1.9, 0.9], [-0.7, -1.5, 0.7], [0.7, -1.6, 0.75], [0, -2.5, 0.6]] as const) {
          ctx.beginPath();
          ctx.ellipse(dx * w, dy * h, r * w, r * w * 1.3, dx * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        body(w * 0.2);
        break;
      case "vase": {
        // Tall blue-and-white vase: bulb, neck, lip.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.55, h);
        ctx.bezierCurveTo(-w * 1.15, h * 0.2, -w * 1.1, -h * 0.35, -w * 0.4, -h * 0.6);
        ctx.lineTo(-w * 0.45, -h * 0.92);
        ctx.lineTo(-w * 0.7, -h);
        ctx.lineTo(w * 0.7, -h);
        ctx.lineTo(w * 0.45, -h * 0.92);
        ctx.lineTo(w * 0.4, -h * 0.6);
        ctx.bezierCurveTo(w * 1.1, -h * 0.35, w * 1.15, h * 0.2, w * 0.55, h);
        ctx.closePath();
        ctx.fill();
        outline();
        ctx.strokeStyle = "#3d6fb6";
        ctx.lineWidth = Math.max(1.5, w * 0.12);
        ctx.beginPath();
        ctx.moveTo(-w * 0.85, h * 0.05);
        ctx.bezierCurveTo(-w * 0.3, -h * 0.25, w * 0.3, h * 0.35, w * 0.85, h * 0.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, h * 0.45, w * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "planter":
        // Terracotta pot (bottom half) with a big shrub and flowers on top.
        ctx.fillStyle = "#5f9440";
        for (const [dx, dy, r] of [[0, -0.45, 0.95], [-0.55, -0.15, 0.6], [0.55, -0.2, 0.62], [0, -0.85, 0.6]] as const) {
          ctx.beginPath();
          ctx.arc(dx * w, dy * h, r * w, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const [dx, dy] of [[-0.4, -0.6], [0.35, -0.35], [0.1, -0.95], [-0.6, -0.1]] as const) {
          ctx.fillStyle = "#f2c94c";
          ctx.beginPath();
          ctx.arc(dx * w, dy * h, w * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w, h * 0.05);
        ctx.lineTo(w, h * 0.05);
        ctx.lineTo(w * 0.75, h);
        ctx.lineTo(-w * 0.75, h);
        ctx.closePath();
        ctx.fill();
        outline();
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(-w, h * 0.05, w * 2, h * 0.12);
        break;
      case "lamp":
        // Floor lamp: base, pole, shade.
        ctx.fillStyle = "#6b5a4a";
        ctx.beginPath();
        ctx.ellipse(0, h * 0.94, w * 0.8, h * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-w * 0.08, -h * 0.5, w * 0.16, h * 1.45);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.55, -h);
        ctx.lineTo(w * 0.55, -h);
        ctx.lineTo(w, -h * 0.45);
        ctx.lineTo(-w, -h * 0.45);
        ctx.closePath();
        ctx.fill();
        outline();
        break;
      case "shard":
        if (p.shape) {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          for (const q of p.shape) ctx.lineTo(q.x * sc, -q.y * sc);
          ctx.closePath();
          ctx.fill();
          outline();
        }
        break;
      case "fish": {
        // A fish: body, tail, eye. Slightly smug.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(-w * 0.1, 0, w * 0.85, h * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w * 0.65, 0);
        ctx.lineTo(w * 1.05, -h * 1.1);
        ctx.lineTo(w * 1.05, h * 1.1);
        ctx.fill();
        outline();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-w * 0.62, -h * 0.25, h * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(-w * 0.64, -h * 0.25, h * 0.17, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "barrel":
        // Seen side-on but spinning as it rolls: staves rotate with the body.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, w, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.strokeStyle = "#5b4330";
        ctx.lineWidth = Math.max(2, w * 0.12);
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.82, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, w * 0.05);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * w * 0.15, Math.sin(a) * w * 0.15);
          ctx.lineTo(Math.cos(a) * w * 0.82, Math.sin(a) * w * 0.82);
          ctx.stroke();
        }
        break;
      case "bottles":
        // A crate of bottles, necks poking out the top.
        ctx.fillStyle = "#5d8a52";
        for (const dx of [-0.6, -0.2, 0.2, 0.6]) {
          ctx.fillRect(dx * w - w * 0.12, -h * 1.15, w * 0.24, h * 0.5);
          ctx.fillRect(dx * w - w * 0.06, -h * 1.35, w * 0.12, h * 0.25);
        }
        body(2);
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        for (const f of [-0.4, 0.3]) ctx.fillRect(-w, f * h, w * 2, h * 0.1);
        label("FRAGILE", "#c0392b", h * 0.32);
        break;
      case "sofa":
        // Back, seat cushions, arms.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-w, -h, w * 2, h * 2, h * 0.35);
        ctx.fill();
        outline();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        for (const dx of [-0.45, 0.05]) {
          ctx.beginPath();
          ctx.roundRect(dx * w, -h * 0.1, w * 0.42, h * 0.7, h * 0.2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(-w, -h, w * 0.14, h * 2);
        ctx.fillRect(w * 0.86, -h, w * 0.14, h * 2);
        break;
      case "painting":
        // Gilt frame around a little landscape.
        body(2);
        ctx.fillStyle = "#8fc1d9";
        ctx.fillRect(-w * 0.8, -h * 0.75, w * 1.6, h * 1.5);
        ctx.fillStyle = "#86b955";
        ctx.beginPath();
        ctx.moveTo(-w * 0.8, h * 0.75);
        ctx.lineTo(-w * 0.8, h * 0.1);
        ctx.quadraticCurveTo(-w * 0.2, -h * 0.4, w * 0.3, h * 0.15);
        ctx.quadraticCurveTo(w * 0.6, -h * 0.1, w * 0.8, h * 0.05);
        ctx.lineTo(w * 0.8, h * 0.75);
        ctx.fill();
        ctx.fillStyle = "#fff1a8";
        ctx.beginPath();
        ctx.arc(w * 0.45, -h * 0.4, h * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "stool":
        ctx.fillStyle = p.color;
        ctx.fillRect(-w, -h, w * 2, h * 0.3);
        ctx.fillRect(-w * 0.85, -h * 0.7, w * 0.2, h * 1.7);
        ctx.fillRect(w * 0.65, -h * 0.7, w * 0.2, h * 1.7);
        ctx.fillRect(-w * 0.85, h * 0.1, w * 1.7, h * 0.12);
        break;
      case "pin":
        // Bowling pin: neck at the top (local +y is up, canvas y is flipped).
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.55, h);
        ctx.bezierCurveTo(-w * 1.2, h * 0.3, -w * 1.1, -h * 0.1, -w * 0.45, -h * 0.4);
        ctx.bezierCurveTo(-w * 0.35, -h * 0.6, -w * 0.9, -h * 0.85, -w * 0.4, -h);
        ctx.lineTo(w * 0.4, -h);
        ctx.bezierCurveTo(w * 0.9, -h * 0.85, w * 0.35, -h * 0.6, w * 0.45, -h * 0.4);
        ctx.bezierCurveTo(w * 1.1, -h * 0.1, w * 1.2, h * 0.3, w * 0.55, h);
        ctx.closePath();
        ctx.fill();
        outline();
        ctx.fillStyle = "#e85d5d";
        ctx.fillRect(-w * 0.5, -h * 0.55, w, h * 0.08);
        ctx.fillRect(-w * 0.55, -h * 0.42, w * 1.1, h * 0.06);
        break;
      case "heater": {
        // An oil-filled radiator: fins, little feet, a dial. Grey once it's caught.
        body(w * 0.3);
        ctx.strokeStyle = "rgba(42,34,48,0.25)";
        ctx.lineWidth = Math.max(1, sc * 0.012);
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo((k * w) / 2.6, -h * 0.75);
          ctx.lineTo((k * w) / 2.6, h * 0.8);
          ctx.stroke();
        }
        ctx.fillStyle = "#e85d5d";
        ctx.beginPath();
        ctx.arc(w * 0.55, -h * 0.82, w * 0.13, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "extinguisher": {
        // Red cylinder, handle and lever at the bottom (the end it's held by),
        // black hose and nozzle at the top (local +y, which is -y on the canvas).
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-w, -h * 0.7, w * 2, h * 1.6, w * 0.6);
        ctx.fill();
        outline();
        ctx.fillStyle = "#2a2230";
        ctx.fillRect(-w * 0.35, -h, w * 0.7, h * 0.32);
        ctx.fillRect(-w * 0.5, h * 0.85, w, h * 0.15);
        ctx.fillStyle = "#f4f4f4";
        ctx.fillRect(-w, -h * 0.15, w * 2, h * 0.3);
        break;
      }
      case "squeegee": {
        // A yellow handle, with the rubber blade across the top end (local +y,
        // which is -y on the canvas). The blade's colour says wet, dry or dirty.
        ctx.fillStyle = "#f2c94c";
        ctx.beginPath();
        ctx.roundRect(-w, -h, w * 2, h * 2, w);
        ctx.fill();
        outline();
        const bw = 0.16 * sc;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-bw, -h - 0.025 * sc, bw * 2, 0.05 * sc, 0.015 * sc);
        ctx.fill();
        outline();
        break;
      }
      case "discoball":
        // Mirror tiles, turning with the ball, with a glint or two.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, w, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = "rgba(90,96,108,0.55)";
        ctx.lineWidth = Math.max(1, sc * 0.008);
        for (let k = -3; k <= 3; k++) {
          ctx.beginPath();
          ctx.moveTo(-w, (k * w) / 3.5);
          ctx.lineTo(w, (k * w) / 3.5);
          ctx.moveTo((k * w) / 3.5, -w);
          ctx.lineTo((k * w) / 3.5, w);
          ctx.stroke();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(0, 0, w, 0, Math.PI * 2);
        outline();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (const [dx, dy] of [[-0.35, -0.4], [0.3, 0.1], [-0.1, 0.45]] as const) {
          ctx.beginPath();
          ctx.arc(dx * w, dy * w, w * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "bowlingball":
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, w, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        for (const [dx, dy] of [[-0.25, -0.35], [0.1, -0.45], [-0.05, -0.1]] as const) {
          ctx.beginPath();
          ctx.arc(dx * w, dy * w, w * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "tray":
        body(h);
        // Raised lips at each end.
        ctx.fillStyle = p.color;
        for (const s of [-1, 1]) ctx.fillRect(s > 0 ? w - w * 0.12 : -w, -h * 5, w * 0.12, h * 5);
        break;
      case "cup":
        // A coffee cup with a sleeve and a lid.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w * 0.8, h);
        ctx.lineTo(w * 0.8, h);
        ctx.lineTo(w, -h * 0.7);
        ctx.lineTo(-w, -h * 0.7);
        ctx.closePath();
        ctx.fill();
        outline();
        ctx.fillStyle = "#6b4a3a";
        ctx.fillRect(-w * 0.9, -h * 0.2, w * 1.8, h * 0.5);
        ctx.fillStyle = "#e8e2d6";
        ctx.fillRect(-w * 1.1, -h, w * 2.2, h * 0.32);
        break;
      case "trophy":
        // A big gold bowling trophy on a wooden base.
        ctx.fillStyle = "#5b4b3a";
        ctx.fillRect(-w, h * 0.55, w * 2, h * 0.45);
        ctx.fillStyle = p.color;
        ctx.fillRect(-w * 0.15, -h * 0.2, w * 0.3, h * 0.8);
        ctx.beginPath();
        ctx.moveTo(-w * 0.9, -h);
        ctx.lineTo(w * 0.9, -h);
        ctx.quadraticCurveTo(w * 0.8, -h * 0.15, 0, -h * 0.15);
        ctx.quadraticCurveTo(-w * 0.8, -h * 0.15, -w * 0.9, -h);
        ctx.fill();
        outline();
        break;
      case "bucket":
        // A bucket of soapy water.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-w, -h);
        ctx.lineTo(w, -h);
        ctx.lineTo(w * 0.8, h);
        ctx.lineTo(-w * 0.8, h);
        ctx.closePath();
        ctx.fill();
        outline();
        ctx.fillStyle = "#ffffff";
        for (const dx of [-0.5, 0, 0.45]) {
          ctx.beginPath();
          ctx.arc(dx * w, -h, w * 0.28, Math.PI, 0);
          ctx.fill();
        }
        break;
      case "parcel":
        body(2);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillRect(-w * 0.55, -h * 0.25, w * 1.1, h * 0.5);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(-w * 0.45, -h * 0.08, w * 0.9, h * 0.06);
        break;
      case "paper":
        body(0);
        ctx.fillStyle = "rgba(42,34,48,0.2)";
        ctx.fillRect(-w * 0.7, -h * 0.3, w * 1.4, Math.max(1, h * 0.3));
        break;
      case "dummy":
        // A training mannequin: blank head, dotted joints, deeply unbothered.
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(-w, -h * 0.62, w * 2, h * 1.62, w * 0.5);
        ctx.fill();
        outline();
        ctx.beginPath();
        ctx.arc(0, -h * 0.8, w * 0.75, 0, Math.PI * 2);
        ctx.fill();
        outline();
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        for (const dy of [-0.3, 0.2, 0.6]) {
          ctx.beginPath();
          ctx.arc(0, dy * h, w * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#c0392b";
        ctx.fillRect(-w, -h * 0.05, w * 2, h * 0.08);
        break;
      case "file":
        body(2);
        ctx.fillStyle = "#d4b062";
        ctx.fillRect(-w * 0.9, -h * 1.5, w * 0.5, h * 0.6);
        label("FILE", "rgba(90,60,30,0.7)", h * 1.4);
        break;
      case "cooler":
        body(w * 0.2);
        ctx.fillStyle = "rgba(120,180,230,0.85)";
        ctx.beginPath();
        ctx.roundRect(-w * 0.7, -h * 1.55, w * 1.4, h * 0.6, w * 0.3);
        ctx.fill();
        ctx.fillStyle = "#5d9de8";
        ctx.fillRect(-w * 0.35, -h * 0.5, w * 0.25, h * 0.15);
        ctx.fillStyle = "#e85d5d";
        ctx.fillRect(w * 0.1, -h * 0.5, w * 0.25, h * 0.15);
        break;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- stanley ---

  private drawShadow(game: Game) {
    const b = game.stanley.balance;
    if (!Number.isFinite(b.groundDist)) return;
    const p = game.stanley.rig.pelvis.translation();
    const ground = { x: p.x, y: p.y - b.groundDist };
    const s = this.camera.toScreen(ground);
    const k = clamp(1 - (b.groundDist - 0.9) / 1.5, 0.3, 1);
    this.ctx.fillStyle = `rgba(0,0,0,${0.18 * k})`;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 0.35 * this.camera.scale * k, 0.06 * this.camera.scale, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private limb(body: RigidBody, len: number, r: number, color: string) {
    const p = body.translation();
    const a = body.rotation();
    const top = rotate({ x: 0, y: len / 2 }, a);
    const bot = rotate({ x: 0, y: -len / 2 }, a);
    this.line({ x: p.x + top.x, y: p.y + top.y }, { x: p.x + bot.x, y: p.y + bot.y }, r * 2, color);
  }

  private drawArm(game: Game, side: Side, back: boolean) {
    const arm = game.stanley.rig.arms[side];
    this.limb(arm.upper, DIM.upperArm.len, DIM.upperArm.r + 0.01, back ? C.shirtBack : C.shirt);
    this.limb(arm.fore, DIM.foreArm.len, DIM.foreArm.r, back ? C.skinBack : C.skin);
    this.circle(arm.hand.translation(), DIM.hand.r, back ? C.skinBack : C.skin);
    if (game.stanley.grips[side].held) this.ring(arm.hand.translation(), DIM.hand.r, C.ink, 0.02);
  }

  private drawLeg(game: Game, side: Side, back: boolean) {
    const leg = game.stanley.rig.legs[side];
    this.limb(leg.thigh, DIM.thigh.len, DIM.thigh.r, back ? C.pantsBack : C.pants);
    this.limb(leg.shin, DIM.shin.len, DIM.shin.r, back ? C.pantsBack : C.pants);
    const p = leg.shin.translation();
    const toe = rotate({ x: game.stanley.facing * 0.09, y: -DIM.shin.len / 2 - 0.02 }, leg.shin.rotation());
    this.circle({ x: p.x + toe.x, y: p.y + toe.y }, 0.08, back ? "#3a2a26" : "#4c3730");
  }

  private drawStanley(game: Game, dt: number) {
    const { ctx, camera: cam } = this;
    const st = game.stanley;
    const rig = st.rig;
    const f = st.facing;
    const back: Side = f > 0 ? "L" : "R";
    const front: Side = f > 0 ? "R" : "L";
    const sc = cam.scale;

    this.drawArm(game, back, true);
    this.drawLeg(game, back, true);
    this.drawLeg(game, front, false);

    this.limb(rig.pelvis, DIM.pelvis.hh * 2, DIM.pelvis.r, C.pants);
    this.limb(rig.chest, DIM.chest.hh * 2, DIM.chest.r, C.shirt);
    // Name badge: just "STANLEY T." — the surname stays a secret.
    const cp = rig.chest.translation();
    const badge = rotate({ x: f * 0.07, y: 0.05 }, rig.chest.rotation());
    this.text("OJ", { x: cp.x + badge.x, y: cp.y + badge.y }, 0.1, "rgba(255,255,255,0.85)");

    // Head.
    const hp = rig.head.translation();
    const hs = cam.toScreen(hp);
    const hr = DIM.head.r * sc;
    ctx.save();
    ctx.translate(hs.x, hs.y);
    ctx.rotate(-rig.head.rotation());
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.arc(0, 0, hr, 0, Math.PI * 2);
    ctx.fill();
    // Cap with a brim pointing the way Stanley faces.
    ctx.fillStyle = C.cap;
    ctx.beginPath();
    ctx.arc(0, -hr * 0.15, hr * 1.02, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(f > 0 ? 0 : -hr * 1.55, -hr * 0.28, hr * 1.55, hr * 0.2);

    // Eyes look at the reach point (or the way we're running).
    const down = st.balance.posture === "down";
    this.blink -= dt;
    if (this.blink < -3.2) this.blink = 0.12;
    const look = st.lookAt ? { x: st.lookAt.x - hp.x, y: st.lookAt.y - hp.y } : { x: f, y: -0.1 };
    const ll = Math.hypot(look.x, look.y) || 1;
    const lx = (look.x / ll) * hr * 0.12;
    const ly = (-look.y / ll) * hr * 0.12;
    for (const ex of [0.18, 0.55]) {
      const x = f * ex * hr;
      const y = hr * 0.12;
      if (down) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = Math.max(1.5, hr * 0.09);
        const s = hr * 0.11;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(x, y, hr * 0.17, this.blink > 0 ? hr * 0.03 : hr * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (this.blink <= 0) {
          ctx.fillStyle = C.ink;
          ctx.beginPath();
          ctx.arc(x + lx, y + ly, hr * 0.085, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Mouth: a worried "o" when airborne or down, a grimace when lifting, a smile otherwise.
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = C.ink;
    ctx.lineWidth = Math.max(1.5, hr * 0.08);
    const mx = f * hr * 0.42;
    const my = hr * 0.55;
    if (down || !st.balance.grounded) {
      ctx.beginPath();
      ctx.ellipse(mx, my, hr * 0.09, hr * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const strain = !!(st.grips.L.held?.isDynamic() || st.grips.R.held?.isDynamic());
      ctx.beginPath();
      if (strain) {
        ctx.moveTo(mx - hr * 0.14, my);
        ctx.lineTo(mx + hr * 0.14, my);
      } else ctx.arc(mx, my - hr * 0.08, hr * 0.13, 0.3, Math.PI - 0.3);
      ctx.stroke();
    }
    ctx.restore();

    this.drawArm(game, front, false);
  }

  // ------------------------------------------------------------------ fx ---

  private drawFx(dt: number) {
    const { ctx, camera: cam } = this;
    const sc = cam.scale;
    this.particles = this.particles.filter((p) => (p.age += dt) < p.life);
    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      const t = p.age / p.life;
      const s = cam.toScreen(p.pos);
      if (p.shape === "confetti") {
        p.vel.y -= 6 * dt;
        p.vel.x *= 1 - dt * 1.5;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(p.age * p.spin);
        ctx.globalAlpha = Math.min(1, (1 - t) * 3);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * sc, -p.size * sc * 0.4, p.size * sc * 2, p.size * sc * 0.8);
        ctx.restore();
      } else if (p.shape === "drop") {
        p.vel.y -= 9.8 * dt;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size * sc, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "star") {
        p.vel.y -= 4 * dt;
        ctx.fillStyle = p.color;
        this.starShape(s.x, s.y, p.size * sc * (1 - t));
      } else {
        p.vel.y *= 1 - dt * 3;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size * sc * (0.6 + t), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.notes = this.notes.filter((n) => (n.age += dt) < 4.5);
    for (const n of this.notes) {
      const s = cam.toScreen({ x: n.pos.x, y: n.pos.y + Math.min(n.age, 1) * 0.15 });
      const size = clamp(sc * 0.13, 12, 17);
      ctx.font = `italic 600 ${size}px ${FONT}`;
      ctx.globalAlpha = Math.min(1, n.age * 3, (4.5 - n.age) * 1.5);
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      wrap(ctx, n.text, Math.min(cam.w * 0.6, 340)).forEach((line, i, all) => {
        const y = s.y + (i - all.length + 1) * size * 1.25;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(line, s.x, y);
        ctx.fillStyle = C.ink;
        ctx.fillText(line, s.x, y);
      });
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
    this.popups = this.popups.filter((p) => (p.age += dt) < 1.1);
    ctx.textAlign = "center";
    for (const p of this.popups) {
      const s = cam.toScreen({ x: p.pos.x, y: p.pos.y + p.age * 0.8 });
      const pop = p.age < 0.12 ? 0.6 + (p.age / 0.12) * 0.6 : 1.2 - Math.min(0.2, (p.age - 0.12) * 2);
      ctx.globalAlpha = 1 - Math.max(0, p.age - 0.6) / 0.5;
      ctx.font = `900 ${Math.max(14, sc * 0.3 * pop)}px ${FONT}`;
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#fff";
      ctx.strokeText(p.text, s.x, s.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  private starShape(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }

  /** A comic speech bubble whose tail points at `anchor`, kept on screen. */
  private drawBubble(b: Bubble) {
    const { ctx, camera: cam } = this;
    const size = clamp(cam.scale * 0.17, 15, 24) * (b.aside ? 0.9 : 1);
    ctx.font = `${b.aside ? "italic 600" : "650"} ${size}px ${FONT}`;
    const maxW = Math.min(cam.w - 32, Math.max(260, cam.w * 0.42));
    const lines = wrap(ctx, b.text, maxW - 28);
    const lh = size * 1.3;
    const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28);
    const h = lines.length * lh + 20;
    const a = cam.toScreen(b.anchor);
    const x = clamp(a.x - w + 40, 16, cam.w - w - 16);
    const y = b.below ? clamp(a.y + 46, 56, cam.h - h - 16) : clamp(a.y - h - 26, 56, cam.h - h - 16);
    // The tail runs from the bubble's near edge to the speaker.
    const edge = b.below ? y + 1 : y + h - 1;
    const tip = b.below ? Math.max(a.y + 8, y - 22) : Math.min(a.y - 8, y + h + 22);
    ctx.fillStyle = b.aside ? "#fff8e6" : "#ffffff";
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
    // Tail.
    const tx = clamp(a.x - 10, x + 20, x + w - 20);
    ctx.beginPath();
    ctx.moveTo(tx - 10, edge);
    ctx.lineTo(a.x - 4, tip);
    ctx.lineTo(tx + 10, edge);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx - 10, edge + (b.below ? -1 : 1));
    ctx.lineTo(a.x - 4, tip);
    ctx.lineTo(tx + 10, edge + (b.below ? -1 : 1));
    ctx.stroke();
    // Text, revealed character by character.
    ctx.fillStyle = C.ink;
    ctx.textBaseline = "top";
    let left = b.shown;
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, left));
      left -= l.length + 1;
      ctx.fillText(part, x + 14, y + 10 + i * lh);
    });
    ctx.textBaseline = "alphabetic";
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
