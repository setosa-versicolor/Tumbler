import type { Level, LevelInstance } from "../levels/level";
import type { Renderer } from "../render/renderer";
import type { Game, GameEvent } from "../sim/game";
import { coffeeRun } from "../levels/downtown/coffeeRun";
import { Liquid } from "../levels/liquid";
import type { HDLight, HDScene } from "./types";
import { COFFEE, drawCity, drawLiquid, drawShine, hash, near, UPGRADE_TIME } from "./shared";

const W = 14;
const H = 4.6;
/** The secret button, on the left wall over the kitchen cabinets. Stand on the counter to reach it. */
export const DNP = { y: 2.62, hw: 0.05, hh: 0.1, mount: 0.09 };
/** Pendant lamps along the ceiling (x), and where the shades hang. */
const LAMPS = [2.4, 5.7, 9.0, 12.4];
const SHADE_Y = 3.78;
/** Windows onto the city: [x0, x1], between sill and head. */
const WINDOWS: [number, number][] = [
  [2.6, 4.2],
  [6.0, 10.6],
];
const SILL = 1.55;
const HEAD = 3.7;
/** Where the mirror ball comes down. */
const BALL_X = 7.0;
const BALL_UP = H + 0.4;
const BALL_DOWN = 3.45;
/** Disco tempo. */
const BPM = 118;
export { UPGRADE_TIME };

type Mode = "normal" | "blackout" | "disco" | "restore";


/** HSV (0–1) to linear-ish RGB. */
function hue(h: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

const css = (c: [number, number, number], a = 1) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;

/**
 * Coffee Run, after hours, in HD: the same job (same physics, same coworkers),
 * lit by pendant lamps and the city outside. And a big red button on the left
 * wall that says not to push it.
 */
export const coffeeRunHD: Level = {
  // This is the Coffee Run in the game: it starts in plain graphics, and the button turns them up.
  ...coffeeRun,
  build(kit) {
    const base = coffeeRun.build(kit);
    const button = kit.button(DNP.mount, DNP.y, DNP.hw, DNP.hh, "right");
    button.style = "custom";
    const coffee = new Liquid("cup");
    let mode: Mode = "normal";
    /** Seconds in the current mode. */
    let t = 0;
    let presses = 0;
    let beat = -1;
    /** Ball height (eased), and lamp level 0–1. */
    let ball = BALL_UP;
    let lamps = 1;
    /** Flicker on a restore. */
    let flicker = 1;
    /** Seconds since the button turned the graphics up (-1: it hasn't). */
    let since = -1;

    const update = (game: Game, dt: number): GameEvent[] => {
      const events = base.update?.(game, dt) ?? [];
      events.push(...coffee.update(game, dt));
      t += dt;
      // The press itself comes from the button (it clicks); here, what it does.
      // Flailing at it counts once: while the alarm's going (or the graphics are
      // still turning up), more pushes do nothing.
      if (since >= 0) since += dt;
      const busy = mode === "blackout" || (since >= 0 && since < UPGRADE_TIME);
      if (button.presses > presses && busy) presses = button.presses;
      if (button.presses > presses) {
        presses = button.presses;
        const at = { x: 0.9, y: DNP.y + 0.55 };
        if (!game.hd) {
          // In plain graphics, it turns the graphics up.
          since = 0;
          events.push({ type: "graphics", to: "hd" });
          events.push({ type: "surprise", id: `dnp-${presses}`, text: "It said DO NOT PUSH.", pos: at });
        } else if (mode === "normal" || mode === "restore") {
          mode = "blackout";
          t = 0;
          events.push({ type: "sfx", name: "alarm" });
          events.push({ type: "surprise", id: `dnp-${presses}`, text: presses < 2 ? "It said DO NOT PUSH." : presses < 4 ? "Still says DO NOT PUSH." : "Again? Really?", pos: at });
        } else {
          mode = "restore";
          t = 0;
          events.push({ type: "surprise", id: `dnp-${presses}`, text: "Fine. Back to work.", pos: at });
        }
      }
      if (mode === "blackout" && t > 1.4) {
        mode = "disco";
        t = 0;
        beat = -1;
      }
      if (mode === "restore" && t > 1.2) mode = "normal";
      // The ball comes down for the party and goes back up after.
      const want = mode === "disco" ? BALL_DOWN : BALL_UP;
      ball += (want - ball) * (1 - Math.exp(-dt * (mode === "disco" ? 1.6 : 2.5)));
      lamps = mode === "normal" ? 1 : mode === "restore" ? Math.min(1, t / 1.0) : mode === "blackout" ? Math.max(0, 1 - t * 6) : 0.04;
      flicker = mode === "restore" ? (Math.sin(t * 53) > -0.2 || t > 0.8 ? 1 : 0.15) : 1;
      if (mode === "disco") {
        const b = Math.floor((t * BPM) / 60);
        if (b !== beat) {
          beat = b;
          events.push({ type: "sfx", name: `beat${b}` });
        }
      }
      return events;
    };

    /**
     * Just turned up: the lamps come on one by one, left to right, behind the
     * wipe, each with a stutter as it strikes.
     */
    const lampWarmup = (i: number) => {
      if (since < 0 || since > UPGRADE_TIME) return 1;
      const k = (since - 0.7 - i * 0.32) / 0.25;
      if (k <= 0) return 0;
      if (k < 1) return Math.sin(k * 40) > 0 ? k : 0.1;
      return 1;
    };

    const hd = (_game: Game, time: number): HDScene => {
      const lights: HDLight[] = [];
      const lampLevel = lamps * flicker;
      // Disco beams from the ball take the shadow slots while the party's on.
      if (mode === "disco") {
        const pulse = 0.8 + 0.4 * Math.max(0, Math.cos(((t * BPM) / 60) * Math.PI * 2));
        for (let i = 0; i < 4; i++) {
          const dir = -Math.PI / 2 + Math.sin(time * (0.7 + i * 0.13) + i * 1.7) * 1.15;
          lights.push({ x: BALL_X, y: ball - 0.1, z: 0.6, radius: 9, color: hue((i * 0.25 + time * 0.08) % 1), intensity: 2.6 * pulse, shadow: true, spot: { dir, inner: 0.03, outer: 0.11 } });
        }
        lights.push({ x: BALL_X, y: ball, z: 0.5, radius: 1.6, color: [1, 1, 1], intensity: 0.9 });
      }
      for (const [i, x] of LAMPS.entries()) {
        const on = lampLevel * lampWarmup(i);
        if (on <= 0.01) continue;
        lights.push({ x, y: SHADE_Y - 0.12, z: 1.3, radius: 6.5, color: [1, 0.72, 0.45], intensity: 2.1 * on, shadow: mode !== "disco", spot: { dir: -Math.PI / 2, inner: 0.32, outer: 0.95 } });
      }
      // Cool spill from the windows.
      for (const [x0, x1] of WINDOWS) lights.push({ x: (x0 + x1) / 2, y: (SILL + HEAD) / 2, z: 3.5, radius: 6, color: [0.42, 0.48, 0.95], intensity: mode === "disco" ? 0.08 : 0.2 });
      // Reception's monitor and the exit sign.
      lights.push({ x: 12.05, y: 1.1, z: 0.4, radius: 1.6, color: [0.35, 0.6, 1], intensity: 0.7 });
      lights.push({ x: 13.4, y: 3.95, z: 0.3, radius: 1.3, color: [0.2, 1, 0.45], intensity: 0.6 });
      // The button: a faint red glow, and a strobe while the alarm goes.
      const strobe = mode === "blackout" ? (Math.sin(t * 18) > 0 ? 3.5 : 0.2) : 0.25 + (button.lit > 0 ? button.lit : 0);
      lights.push({ x: 0.2, y: DNP.y, z: 0.3, radius: mode === "blackout" ? 7 : 1.1, color: [1, 0.12, 0.08], intensity: strobe });
      const night: [number, number, number] = mode === "disco" ? [0.05, 0.04, 0.09] : mode === "blackout" ? [0.03, 0.03, 0.05] : [0.1, 0.115, 0.17];
      return {
        ambient: night,
        lights,
        haze: mode === "disco" ? 0.22 : 0.07,
        motes: 1,
        reflect: 0.3,
        bloom: mode === "disco" ? 1.0 : 0.8,
        exposure: 0.92,
      };
    };

    // ------------------------------------------------------------ art ---


    const drawBack = (r: Renderer, game: Game) => {
      // Plain graphics: the usual office, and the sign by the button.
      if (!r.hd) {
        base.drawBack?.(r, game);
        drawWarning(r);
        return;
      }
      const time = r.clock;
      // Polished concrete floor, with seams.
      const ctx = r.ctx;
      {
        const a = r.camera.toScreen({ x: -10, y: 0 });
        const b = r.camera.toScreen({ x: W + 10, y: -5 });
        const g = ctx.createLinearGradient(0, a.y, 0, a.y + 0.6 * r.camera.scale);
        g.addColorStop(0, "#6e737b");
        g.addColorStop(1, "#3c4048");
        ctx.fillStyle = g;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        for (let x = 0; x <= W; x += 1.4) r.rect(x - 0.006, -5, x + 0.006, 0, "rgba(20,22,28,0.35)");
        r.rect(-10, -0.02, W + 10, 0, "rgba(255,255,255,0.18)");
      }
      // Wall: painted panels, a darker wainscot below, a picture rail, a recessed ceiling.
      r.rect(0, 0, W, H, "#b3bcc8");
      for (let x = 0.7; x < W; x += 1.4) r.rect(x - 0.008, 0.97, x + 0.008, H - 0.2, "rgba(40,50,70,0.12)");
      r.rect(0, 0, W, 0.95, "#98a2b0");
      r.rect(0, 0.93, W, 0.97, "#aab3bf");
      r.rect(0, H - 0.18, W, H, "#9aa3b0");
      r.rect(0, H - 0.2, W, H - 0.17, "#7d8693");
      // Windows: frame, dark glass (the view itself glows), mullions, sill.
      for (const [x0, x1] of WINDOWS) {
        r.rect(x0 - 0.08, SILL - 0.06, x1 + 0.08, HEAD + 0.08, "#3d434d");
        r.rect(x0, SILL, x1, HEAD, "#0c0e16");
      }
      r.emit(() => drawCity(r, WINDOWS, SILL, HEAD, time));
      for (const [x0, x1] of WINDOWS) {
        const panes = Math.max(1, Math.round((x1 - x0) / 1.1));
        for (let i = 1; i < panes; i++) {
          const x = x0 + ((x1 - x0) * i) / panes;
          r.rect(x - 0.03, SILL, x + 0.03, HEAD, "#3d434d");
        }
        r.rect(x0 - 0.14, SILL - 0.1, x1 + 0.14, SILL - 0.02, "#d9dee5");
      }
      // A motivational poster between the windows, over the copier.
      r.rect(4.5, 1.75, 5.6, 3.05, "#2a2230");
      r.rect(4.55, 1.8, 5.55, 3.0, "#20324f");
      r.poly([{ x: 4.55, y: 2.15 }, { x: 4.95, y: 2.75 }, { x: 5.15, y: 2.45 }, { x: 5.55, y: 2.15 }], "#7f93b5");
      r.poly([{ x: 4.85, y: 2.6 }, { x: 4.95, y: 2.75 }, { x: 5.05, y: 2.6 }], "#eef2f8");
      r.text("SYNERGY", { x: 5.05, y: 1.98 }, 0.11, "#f2e6c9");
      // A plant by reception.
      r.roundRect(10.75, 0, 11.15, 0.42, 0.04, "#b4693f");
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3 + Math.sin(time * 0.8 + i) * 0.03;
        const tip = { x: 10.95 + Math.sin(a) * 0.55, y: 0.42 + Math.cos(a) * 0.75 };
        r.line({ x: 10.95, y: 0.4 }, tip, 0.07, i % 2 ? "#3f7a45" : "#4f9356");
      }
      // Pendant lamps: cords, shades, and glowing bulbs underneath.
      const lampLevel = lamps * flicker;
      for (const [i, x] of LAMPS.entries()) {
        const bulb = lampLevel * lampWarmup(i);
        r.line({ x, y: H - 0.18 }, { x, y: SHADE_Y + 0.22 }, 0.012, "#222");
        r.poly([{ x: x - 0.09, y: SHADE_Y + 0.24 }, { x: x + 0.09, y: SHADE_Y + 0.24 }, { x: x + 0.3, y: SHADE_Y - 0.04 }, { x: x - 0.3, y: SHADE_Y - 0.04 }], "#23272e");
        r.rect(x - 0.3, SHADE_Y - 0.06, x + 0.3, SHADE_Y - 0.03, "#b48a4a");
        if (bulb > 0.02)
          r.emit(() => {
            r.ctx.globalAlpha = bulb;
            r.rect(x - 0.27, SHADE_Y - 0.06, x + 0.27, SHADE_Y - 0.035, "#fff1d6");
            r.circle({ x, y: SHADE_Y - 0.06 }, 0.09, "#ffe2b0");
            r.ctx.globalAlpha = 1;
          });
      }
      // Exit sign over the far door.
      r.rect(13.05, 3.82, 13.75, 4.08, "#1a1d22");
      r.emit(() => {
        r.rect(13.08, 3.85, 13.72, 4.05, "#0f6b2e");
        r.text("EXIT", { x: 13.4, y: 3.95 }, 0.14, "#b9ffcf");
      });
      // The sign over the button, and a hazard-striped plate around it.
      drawWarning(r);
      // Then the level's own scenery (kitchen, copier, cubicles, reception).
      base.drawBack?.(r, game);
      // Screens and lights on the office kit.
      r.emit(() => {
        r.rect(11.73, 0.86, 12.27, 1.25, "rgba(110,170,255,0.9)");
        r.rect(4.5, 0.65, 4.9, 0.72, "rgba(120,190,255,0.9)");
      });
      // Mirror ball (it hangs in front of the window, so in the room).
      drawBall(r, time);
      // Reflected spots wheeling round the walls during the party.
      if (mode === "disco") {
        r.emit(() => {
          for (let i = 0; i < 46; i++) {
            const ang = hash(i) * Math.PI * 2 + time * 0.55;
            const rad = 1.5 + hash(i + 50) * 6;
            const x = BALL_X + Math.cos(ang) * rad * 1.3;
            const y = ball + Math.sin(ang) * rad * 0.55 - 0.6;
            if (x < 0 || x > W || y < 0.02 || y > H - 0.2) continue;
            r.circle({ x, y }, 0.035, css(hue((hash(i + 9) + time * 0.1) % 1), 0.75));
          }
        });
      }
    };

    const drawWarning = (r: Renderer) => {
      // Black-and-yellow plate on the back wall where the button comes out of the left wall.
      const y0 = DNP.y - 0.2;
      const y1 = DNP.y + 0.2;
      r.rect(0, y0, 0.32, y1, "#f2c230");
      const ctx = r.ctx;
      const a = r.camera.toScreen({ x: 0, y: y1 });
      const b = r.camera.toScreen({ x: 0.32, y: y0 });
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.clip();
      for (let x = -0.4; x < 0.4; x += 0.1) r.poly([{ x, y: y0 }, { x: x + 0.05, y: y0 }, { x: x + 0.45, y: y1 }, { x: x + 0.4, y: y1 }], "#1d1d1d");
      ctx.restore();
      // The label.
      const sx0 = 0.04;
      const sx1 = 1.02;
      const sy0 = DNP.y + 0.3;
      const sy1 = DNP.y + 0.66;
      r.roundRect(sx0, sy0, sx1, sy1, 0.03, "#f4f1e8");
      r.roundRect(sx0 + 0.025, sy0 + 0.025, sx1 - 0.025, sy1 - 0.025, 0.02, "#c62828");
      r.text("DO NOT", { x: (sx0 + sx1) / 2 + 0.02, y: sy1 - 0.11 }, 0.11, "#ffffff");
      r.text("PUSH", { x: (sx0 + sx1) / 2 + 0.02, y: sy0 + 0.11 }, 0.15, "#ffffff");
      r.poly([{ x: 0.1, y: sy0 - 0.03 }, { x: 0.2, y: sy0 - 0.12 }, { x: 0.3, y: sy0 - 0.03 }], "#c62828");
    };

    const drawBall = (r: Renderer, time: number) => {
      if (ball > H + 0.2) return;
      r.line({ x: BALL_X, y: H }, { x: BALL_X, y: ball + 0.2 }, 0.012, "#bbb");
      r.circle({ x: BALL_X, y: ball }, 0.2, "#8d96a3");
      r.emit(() => {
        // Facets catching the light.
        for (let i = 0; i < 26; i++) {
          const a = hash(i) * Math.PI * 2;
          const rr = Math.sqrt(hash(i + 3)) * 0.17;
          const lit = Math.sin(time * 6 + i * 2.3) > 0.4;
          if (!lit) continue;
          r.rect(BALL_X + Math.cos(a) * rr - 0.018, ball + Math.sin(a) * rr - 0.018, BALL_X + Math.cos(a) * rr + 0.018, ball + Math.sin(a) * rr + 0.018, css(hue((i * 0.13 + time * 0.1) % 1), 1));
        }
      });
    };

    /** The button itself: a red mushroom cap on a yellow collar, sticking out of the left wall. */
    const drawButton = (r: Renderer) => {
      const p = button.cap.translation();
      // A yellow collar bolted to the wall, a steel stem, the red cap.
      r.rect(0, DNP.y - DNP.hh - 0.05, DNP.mount - 0.02, DNP.y + DNP.hh + 0.05, "#f2c230");
      r.rect(0, DNP.y - DNP.hh - 0.05, 0.015, DNP.y + DNP.hh + 0.05, "#1d1d1d");
      r.rect(DNP.mount - 0.02, DNP.y - 0.04, p.x - DNP.hw + 0.02, DNP.y + 0.04, "#555c66");
      r.roundRect(p.x - DNP.hw, p.y - DNP.hh, p.x + DNP.hw, p.y + DNP.hh, 0.04, button.lit > 0 ? "#ff4a3d" : "#d1271d");
      r.rect(p.x + DNP.hw - 0.02, p.y - DNP.hh + 0.03, p.x + DNP.hw - 0.005, p.y + DNP.hh - 0.03, "rgba(255,255,255,0.35)");
      if (mode !== "normal" || button.lit > 0)
        r.emit(() => r.circle({ x: p.x, y: p.y }, 0.12, `rgba(255,60,40,${mode === "blackout" ? 0.9 : 0.5})`));
    };

    /** Steam curling up off each coffee that's still upright. */
    const drawSteam = (r: Renderer, game: Game) => {
      const time = r.clock;
      const ctx = r.ctx;
      ctx.lineCap = "round";
      for (const [i, p] of game.props.entries()) {
        if (p.kind !== "cup" || !coffee.fillOf(p.body)) continue;
        const q = p.body.translation();
        if (Math.cos(p.body.rotation()) < 0.8) continue;
        for (let k = 0; k < 3; k++) {
          const ph = (time * 0.45 + k / 3 + i * 0.27) % 1;
          const pts = [];
          for (let s = 0; s <= 6; s++) {
            const u = s / 6;
            const y = q.y + p.hh + 0.04 + (ph * 0.3 + u * 0.22);
            const x = q.x + Math.sin(u * 5 + time * 2.2 + k * 2 + i) * 0.035 * (0.4 + u);
            pts.push(r.camera.toScreen({ x, y }));
          }
          ctx.strokeStyle = `rgba(255,255,255,${0.16 * Math.sin(ph * Math.PI)})`;
          ctx.lineWidth = 0.025 * r.camera.scale;
          ctx.beginPath();
          for (const s of pts) ctx.lineTo(s.x, s.y);
          ctx.stroke();
        }
      }
    };




    const drawFore = (r: Renderer) => {
      const lit = mode === "disco" ? "rgba(210,140,255,0.6)" : "rgba(255,196,130,0.6)";
      // A big potted plant.
      near(r, 1.8, (ctx) => {
        const x = 2.3;
        for (let i = 0; i < 9; i++) {
          const a = -1.0 + i * 0.25 + Math.sin(r.clock * 0.6 + i) * 0.03;
          const len = 0.38 + ((i * 37) % 5) * 0.04;
          ctx.save();
          ctx.translate(x, 0.08);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.ellipse(0, len / 2, 0.05, len / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = i % 2 ? "#18301f" : "#1f3d27";
          ctx.fill();
          ctx.strokeStyle = lit;
          ctx.lineWidth = 0.008;
          ctx.beginPath();
          ctx.moveTo(0, 0.02);
          ctx.lineTo(0, len * 0.9);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = "#3a2218";
        ctx.beginPath();
        ctx.moveTo(x - 0.22, 0.14);
        ctx.lineTo(x + 0.22, 0.14);
        ctx.lineTo(x + 0.18, -0.3);
        ctx.lineTo(x - 0.18, -0.3);
        ctx.fill();
        ctx.fillStyle = lit;
        ctx.fillRect(x - 0.22, 0.12, 0.44, 0.02);
      });
      // The corner of someone's desk: the back of a monitor, a mug, a lamp's glow on its edge.
      near(r, 1.6, (ctx) => {
        const x0 = 5.2;
        const top = 0.1;
        ctx.fillStyle = "#3a2a20";
        ctx.fillRect(x0, -0.6, 1.7, top + 0.6);
        ctx.fillStyle = "#4e3a2c";
        ctx.fillRect(x0, top - 0.045, 1.7, 0.045);
        ctx.fillStyle = lit;
        ctx.fillRect(x0, top - 0.012, 1.7, 0.03);
        // Monitor, from behind: stand, the back of the screen, a cable.
        ctx.fillStyle = "#2a2d34";
        ctx.fillRect(x0 + 0.58, top, 0.07, 0.1);
        ctx.fillRect(x0 + 0.48, top, 0.27, 0.02);
        ctx.beginPath();
        ctx.roundRect(x0 + 0.3, top + 0.08, 0.56, 0.22, 0.025);
        ctx.fill();
        ctx.strokeStyle = "rgba(120,170,255,0.55)";
        ctx.lineWidth = 0.016;
        ctx.stroke();
        ctx.strokeStyle = "#1b1d22";
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        ctx.moveTo(x0 + 0.62, top + 0.1);
        ctx.quadraticCurveTo(x0 + 0.7, top - 0.05, x0 + 0.9, top);
        ctx.stroke();
        // A mug.
        ctx.fillStyle = "#a33f36";
        ctx.beginPath();
        ctx.roundRect(x0 + 1.2, top, 0.12, 0.14, 0.018);
        ctx.fill();
        ctx.strokeStyle = "#a33f36";
        ctx.lineWidth = 0.024;
        ctx.beginPath();
        ctx.arc(x0 + 1.33, top + 0.07, 0.04, -1.3, 1.3);
        ctx.stroke();
        ctx.fillStyle = lit;
        ctx.fillRect(x0 + 1.2, top + 0.125, 0.12, 0.015);
      });
      // An office chair, turned away: seat, back, an armrest.
      near(r, 1.7, (ctx) => {
        const x = 10.4;
        ctx.fillStyle = "#14161b";
        ctx.fillRect(x - 0.035, -0.4, 0.07, 0.4);
        ctx.fillStyle = "#2b2f38";
        ctx.beginPath();
        ctx.roundRect(x - 0.3, -0.02, 0.6, 0.1, 0.04);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x - 0.24, 0.07, 0.42, 0.42, [0.1, 0.1, 0.04, 0.04]);
        ctx.fill();
        ctx.fillStyle = "#1f222a";
        ctx.fillRect(x + 0.16, 0.08, 0.05, 0.16);
        ctx.fillRect(x + 0.12, 0.22, 0.2, 0.035);
        ctx.strokeStyle = lit;
        ctx.lineWidth = 0.02;
        ctx.beginPath();
        ctx.roundRect(x - 0.24, 0.07, 0.42, 0.42, [0.1, 0.1, 0.04, 0.04]);
        ctx.stroke();
      });
    };

    const inst: LevelInstance & { coffee: Liquid } = {
      ...base,
      coffee,
      drawFore: (r) => drawFore(r),
      update,
      hd,
      drawBack,
      drawMid(r, game) {
        base.drawMid?.(r, game);
        drawLiquid(r, coffee, COFFEE);
        drawButton(r);
      },
      drawFront(r, game) {
        drawShine(r, coffee, COFFEE);
        drawSteam(r, game);
        base.drawFront?.(r, game);
      },
    };
    return inst;
  },
};
