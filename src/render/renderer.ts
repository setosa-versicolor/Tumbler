import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import type { Game } from "../sim/game";
import { BASKET, BUTTON, LEDGE, ROOM, type Prop } from "../props/room";
import { DIM, type Side } from "../physics/body/rig";
import { clamp, rotate, type Vec } from "../sim/math";

const C = {
  wallTop: "#f6e7cf",
  wallBottom: "#efd6b4",
  floor: "#8a6a4e",
  floorTop: "#a5825f",
  ledge: "#7c8a99",
  ledgeTop: "#98a6b4",
  basket: "#b98a4f",
  skin: "#f2c79b",
  skinBack: "#d9a97c",
  shirt: "#37a59c",
  shirtBack: "#2a8079",
  pants: "#3b4a7a",
  pantsBack: "#2c3860",
  cap: "#f08a3c",
  ink: "#2a2230",
};

export class Camera {
  x = ROOM.w / 2;
  y = ROOM.h / 2;
  scale = 60;
  w = 1;
  h = 1;

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    // Frame about 5.6m of height so Tumbler is big enough to read on a phone.
    this.scale = Math.min(h / 5.6, w / (w < h ? 5 : 8));
  }

  follow(target: Vec, dt: number, snap = false) {
    const vw = this.w / this.scale;
    const vh = this.h / this.scale;
    const tx = vw >= ROOM.w + 1 ? ROOM.w / 2 : clamp(target.x, vw / 2 - 0.5, ROOM.w - vw / 2 + 0.5);
    // On tall screens, sit the floor low (leaving room below for thumbs) rather than centring the room.
    const ty = vh >= ROOM.h + 0.8 ? vh / 2 - 1.6 : clamp(target.y + 0.5, vh / 2 - 0.5, ROOM.h - vh / 2 + 0.3);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
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

interface Star {
  pos: Vec;
  vel: Vec;
  age: number;
}

export class Renderer {
  readonly camera = new Camera();
  private ctx: CanvasRenderingContext2D;
  private popups: Popup[] = [];
  private stars: Star[] = [];
  private blink = 0;
  private dpr = 1;
  /** Shown as a crosshair when the reach point comes from a mouse. */
  cursor: Vec | null = null;

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

  popup(text: string, pos: Vec, color = C.ink) {
    this.popups.push({ text, pos: { ...pos }, age: 0, color });
  }

  dizzy(pos: Vec) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.stars.push({ pos: { ...pos }, vel: { x: Math.cos(a) * 1.6, y: Math.sin(a) * 1.6 + 1.2 }, age: 0 });
    }
  }

  draw(game: Game, dt: number) {
    const { ctx, camera: cam } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawRoom(game);
    for (const p of game.props) this.drawProp(p);
    this.drawTumbler(game, dt);
    this.drawFx(dt);
    if (this.cursor) {
      const s = cam.toScreen(this.cursor);
      ctx.strokeStyle = "rgba(42,34,48,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- room ---

  private drawRoom(game: Game) {
    const { ctx, camera: cam } = this;
    const sc = cam.scale;
    const g = ctx.createLinearGradient(0, 0, 0, cam.h);
    g.addColorStop(0, C.wallTop);
    g.addColorStop(1, C.wallBottom);
    ctx.fillStyle = "#3a3040";
    ctx.fillRect(0, 0, cam.w, cam.h);
    const tl = cam.toScreen({ x: 0, y: ROOM.h });
    ctx.fillStyle = g;
    ctx.fillRect(tl.x, tl.y, ROOM.w * sc, ROOM.h * sc);

    // Wallpaper stripes and height marks.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let x = 0.5; x < ROOM.w; x += 1) {
      const a = cam.toScreen({ x, y: ROOM.h });
      ctx.fillRect(a.x, a.y, 0.35 * sc, ROOM.h * sc);
    }
    ctx.fillStyle = "rgba(42,34,48,0.35)";
    ctx.font = `${Math.max(10, sc * 0.16)}px system-ui, sans-serif`;
    for (let y = 1; y < ROOM.h; y++) {
      const a = cam.toScreen({ x: 1.6, y });
      ctx.fillRect(a.x, a.y, 0.18 * sc, 2);
      ctx.fillText(`${y}m`, a.x + 0.24 * sc, a.y + 4);
    }

    // Best stack line.
    if (game.stats.bestStack > 0.3) {
      const a = cam.toScreen({ x: 2, y: game.stats.bestStack });
      const b = cam.toScreen({ x: 9.6, y: game.stats.bestStack });
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(240,138,60,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(240,138,60,0.9)";
      ctx.fillText(`best stack ${game.stats.bestStack.toFixed(2)}m`, b.x - 1.5 * sc, a.y - 6);
    }

    // Floor.
    const f = cam.toScreen({ x: -1, y: 0 });
    ctx.fillStyle = C.floor;
    ctx.fillRect(f.x, f.y, (ROOM.w + 2) * sc, 2 * sc);
    ctx.fillStyle = C.floorTop;
    ctx.fillRect(f.x, f.y, (ROOM.w + 2) * sc, 0.08 * sc);
    // Side walls & ceiling trim.
    ctx.fillStyle = "#5b4b5e";
    const lw = cam.toScreen({ x: -1, y: ROOM.h + 1 });
    ctx.fillRect(lw.x, lw.y, sc, (ROOM.h + 2) * sc);
    const rw = cam.toScreen({ x: ROOM.w, y: ROOM.h + 1 });
    ctx.fillRect(rw.x, rw.y, sc, (ROOM.h + 2) * sc);
    ctx.fillRect(lw.x, lw.y, (ROOM.w + 2) * sc, sc);

    // Ledge.
    const l = cam.toScreen({ x: LEDGE.x0, y: LEDGE.y + LEDGE.thick / 2 });
    ctx.fillStyle = C.ledge;
    ctx.fillRect(l.x, l.y, (LEDGE.x1 - LEDGE.x0) * sc, LEDGE.thick * sc);
    ctx.fillStyle = C.ledgeTop;
    ctx.fillRect(l.x, l.y, (LEDGE.x1 - LEDGE.x0) * sc, 0.05 * sc);
    // Ledge bracket.
    ctx.strokeStyle = C.ledge;
    ctx.lineWidth = 0.06 * sc;
    const br = cam.toScreen({ x: LEDGE.x1 - 0.4, y: LEDGE.y - 0.1 });
    const br2 = cam.toScreen({ x: LEDGE.x1 - 0.4, y: 0 });
    ctx.beginPath();
    ctx.moveTo(br.x, br.y);
    ctx.lineTo(br2.x, br2.y);
    ctx.stroke();

    // Basket.
    const bk = cam.toScreen({ x: BASKET.x0, y: BASKET.y + BASKET.lip });
    ctx.fillStyle = C.basket;
    ctx.fillRect(bk.x, bk.y, (BASKET.x1 - BASKET.x0) * sc, (BASKET.lip + 0.05) * sc);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(bk.x, bk.y + (i * BASKET.lip * sc) / 4);
      ctx.lineTo(bk.x + (BASKET.x1 - BASKET.x0) * sc, bk.y + (i * BASKET.lip * sc) / 4);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `bold ${Math.max(11, sc * 0.17)}px system-ui, sans-serif`;
    ctx.fillText(`BASKET ${game.stats.inBasket}`, bk.x + 0.12 * sc, bk.y + BASKET.lip * sc * 0.62);

    // Button: backplate, cap, light.
    const btn = game.button;
    const plate = cam.toScreen({ x: ROOM.w - 0.03, y: BUTTON.y + BUTTON.hh + 0.12 });
    ctx.fillStyle = "#6c6070";
    ctx.fillRect(plate.x, plate.y, 0.03 * sc, (BUTTON.hh * 2 + 0.24) * sc);
    this.drawBox(btn.cap, BUTTON.hw, BUTTON.hh, btn.lit > 0 ? "#ff5a4f" : "#d6453c", 0.04);
    const light = cam.toScreen({ x: ROOM.w - 0.25, y: BUTTON.y + BUTTON.hh + 0.35 });
    ctx.fillStyle = btn.lit > 0 ? "#ffd84a" : "#7d6f5a";
    ctx.beginPath();
    ctx.arc(light.x, light.y, 0.11 * sc, 0, Math.PI * 2);
    ctx.fill();
    if (btn.lit > 0) {
      ctx.fillStyle = `rgba(255,216,74,${0.35 * btn.lit})`;
      ctx.beginPath();
      ctx.arc(light.x, light.y, 0.35 * sc, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.ink;
    ctx.font = `bold ${Math.max(11, sc * 0.17)}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${btn.presses}`, light.x - 0.2 * sc, light.y + 5);
    ctx.textAlign = "left";
  }

  private drawBox(body: RigidBody, hw: number, hh: number, color: string, radius = 0.03) {
    const { ctx, camera: cam } = this;
    const p = cam.toScreen(body.translation());
    const sc = cam.scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-body.rotation());
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-hw * sc, -hh * sc, hw * 2 * sc, hh * 2 * sc, radius * sc);
    ctx.fill();
    ctx.restore();
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
    ctx.lineWidth = Math.max(1.5, sc * 0.025);
    ctx.strokeStyle = "rgba(42,34,48,0.55)";
    if (p.kind === "ball") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, w, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.62, -0.6, 0.9);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(-w, -h, w * 2, h * 2, Math.min(w, h) * 0.18);
      ctx.fill();
      ctx.stroke();
      if (p.kind === "box") {
        // Packing tape.
        ctx.fillStyle = "rgba(255,240,200,0.55)";
        ctx.fillRect(-w * 0.18, -h, w * 0.36, h * 2);
      } else if (p.kind === "pizza") {
        ctx.fillStyle = "#d9453c";
        ctx.font = `bold ${Math.max(8, h * 1.4)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PIZZA", 0, 1);
      } else if (p.kind === "plank") {
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.moveTo(-w * 0.9, 0);
        ctx.lineTo(w * 0.9, 0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- tumbler ---

  private limb(body: RigidBody, len: number, r: number, color: string) {
    const { ctx, camera: cam } = this;
    const p = body.translation();
    const a = body.rotation();
    const top = rotate({ x: 0, y: len / 2 }, a);
    const bot = rotate({ x: 0, y: -len / 2 }, a);
    const s1 = cam.toScreen({ x: p.x + top.x, y: p.y + top.y });
    const s2 = cam.toScreen({ x: p.x + bot.x, y: p.y + bot.y });
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = r * 2 * cam.scale;
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }

  private circle(c: Vec, r: number, color: string) {
    const { ctx, camera: cam } = this;
    const s = cam.toScreen(c);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * cam.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawArm(game: Game, side: Side, back: boolean) {
    const arm = game.tumbler.rig.arms[side];
    this.limb(arm.upper, DIM.upperArm.len, DIM.upperArm.r + 0.01, back ? C.shirtBack : C.shirt);
    this.limb(arm.fore, DIM.foreArm.len, DIM.foreArm.r, back ? C.skinBack : C.skin);
    const gripping = !!game.tumbler.grips[side].held;
    this.circle(arm.hand.translation(), DIM.hand.r, back ? C.skinBack : C.skin);
    if (gripping) {
      const s = this.camera.toScreen(arm.hand.translation());
      this.ctx.strokeStyle = C.ink;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, DIM.hand.r * this.camera.scale, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  private drawLeg(game: Game, side: Side, back: boolean) {
    const leg = game.tumbler.rig.legs[side];
    this.limb(leg.thigh, DIM.thigh.len, DIM.thigh.r, back ? C.pantsBack : C.pants);
    this.limb(leg.shin, DIM.shin.len, DIM.shin.r, back ? C.pantsBack : C.pants);
    // Shoe.
    const p = leg.shin.translation();
    const a = leg.shin.rotation();
    const f = game.tumbler.facing;
    const toe = rotate({ x: f * 0.09, y: -DIM.shin.len / 2 - 0.02 }, a);
    this.circle({ x: p.x + toe.x, y: p.y + toe.y }, 0.08, back ? "#3a2a26" : "#4c3730");
  }

  private drawTumbler(game: Game, dt: number) {
    const { ctx, camera: cam } = this;
    const tb = game.tumbler;
    const rig = tb.rig;
    const f = tb.facing;
    const back: Side = f > 0 ? "L" : "R";
    const front: Side = f > 0 ? "R" : "L";
    const sc = cam.scale;

    this.drawArm(game, back, true);
    this.drawLeg(game, back, true);
    this.drawLeg(game, front, false);

    // Torso.
    this.limb(rig.pelvis, DIM.pelvis.hh * 2, DIM.pelvis.r, C.pants);
    this.limb(rig.chest, DIM.chest.hh * 2, DIM.chest.r, C.shirt);
    // Pocket logo.
    const cp = rig.chest.translation();
    const logo = rotate({ x: f * 0.06, y: 0.02 }, rig.chest.rotation());
    const ls = cam.toScreen({ x: cp.x + logo.x, y: cp.y + logo.y });
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `bold ${Math.max(8, sc * 0.11)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OJ", ls.x, ls.y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // Head.
    const hp = rig.head.translation();
    const ha = rig.head.rotation();
    const hs = cam.toScreen(hp);
    const hr = DIM.head.r * sc;
    ctx.save();
    ctx.translate(hs.x, hs.y);
    ctx.rotate(-ha);
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.arc(0, 0, hr, 0, Math.PI * 2);
    ctx.fill();
    // Cap with a brim pointing the way Tumbler faces.
    ctx.fillStyle = C.cap;
    ctx.beginPath();
    ctx.arc(0, -hr * 0.15, hr * 1.02, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(f > 0 ? 0 : -hr * 1.55, -hr * 0.28, hr * 1.55, hr * 0.2);

    // Eyes look at the reach point (or the way we're running).
    const down = tb.balance.posture === "down";
    this.blink -= dt;
    if (this.blink < -3.2) this.blink = 0.12;
    const look = tb.lookAt ? { x: tb.lookAt.x - hp.x, y: tb.lookAt.y - hp.y } : { x: f, y: -0.1 };
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
    // Mouth: a worried "o" when airborne or down, a little smile otherwise.
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = C.ink;
    ctx.lineWidth = Math.max(1.5, hr * 0.08);
    const mx = f * hr * 0.42;
    const my = hr * 0.55;
    if (down || !tb.balance.grounded) {
      ctx.beginPath();
      ctx.ellipse(mx, my, hr * 0.09, hr * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const strain = !!(tb.grips.L.held?.isDynamic() || tb.grips.R.held?.isDynamic());
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
    this.stars = this.stars.filter((s) => (s.age += dt) < 0.9);
    ctx.fillStyle = "#ffd84a";
    for (const s of this.stars) {
      s.pos.x += s.vel.x * dt;
      s.pos.y += s.vel.y * dt;
      s.vel.y -= 4 * dt;
      const p = cam.toScreen(s.pos);
      this.starShape(p.x, p.y, 0.09 * sc * (1 - s.age));
    }
    this.popups = this.popups.filter((p) => (p.age += dt) < 1.1);
    ctx.textAlign = "center";
    for (const p of this.popups) {
      const s = cam.toScreen({ x: p.pos.x, y: p.pos.y + p.age * 0.8 });
      ctx.globalAlpha = 1 - p.age / 1.1;
      ctx.font = `900 ${Math.max(14, sc * 0.3)}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
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
}
