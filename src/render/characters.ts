import type { Renderer } from "./renderer";
import { toward, type Vec } from "../sim/math";

// The game's characters, each drawn by one function wherever they turn up
// (their own scene, and the office party), so they're always the same people.

/** Mrs. Henderson at No. 12, curlers in, glaring. `sill` is where her window (or her waist) is. */
export function drawHenderson(r: Renderer, cx: number, sill: number, up = 1) {
  r.rect(cx - 0.28, sill, cx + 0.28, sill + 0.35 * up, "#c58be8");
  r.circle({ x: cx, y: sill + 0.25 + 0.3 * up }, 0.2, "#f2c79b");
  for (const dx of [-0.14, 0, 0.14]) r.circle({ x: cx + dx, y: sill + 0.45 + 0.3 * up }, 0.06, "#f4a6c0");
  r.line({ x: cx - 0.12, y: sill + 0.32 + 0.3 * up }, { x: cx - 0.03, y: sill + 0.29 + 0.3 * up }, 0.025, "#2a2230");
  r.line({ x: cx + 0.12, y: sill + 0.32 + 0.3 * up }, { x: cx + 0.03, y: sill + 0.29 + 0.3 * up }, 0.025, "#2a2230");
  r.line({ x: cx - 0.07, y: sill + 0.14 + 0.3 * up }, { x: cx + 0.07, y: sill + 0.14 + 0.3 * up }, 0.025, "#2a2230");
}

/** A coworker's head (as seen over a cubicle wall), eyes on `look`. */
export function drawCoworkerHead(r: Renderer, x: number, faceY: number, skin: string, hair: string, look: Vec) {
  r.circle({ x, y: faceY + 0.05 }, 0.17, hair);
  r.circle({ x, y: faceY - 0.02 }, 0.155, skin);
  for (const dx of [-0.06, 0.06]) {
    const e = { x: x + dx, y: faceY };
    r.circle(e, 0.035, "#fff");
    r.circle(toward(e, look, 0.015), 0.016, "#2a2230");
  }
}

/** The goblin: green, pointy, pleased with itself. `y` is its feet; `f` which way the spear points. */
export function drawGoblin(r: Renderer, x: number, y: number, f: number, thrust = 0) {
  r.roundRect(x - 0.17, y, x + 0.17, y + 0.45, 0.08, "#4f7a3a");
  r.circle({ x, y: y + 0.58 }, 0.17, "#7bbf5a");
  r.poly([{ x: x - 0.14, y: y + 0.65 }, { x: x - 0.36, y: y + 0.78 }, { x: x - 0.12, y: y + 0.55 }], "#7bbf5a");
  r.poly([{ x: x + 0.14, y: y + 0.65 }, { x: x + 0.36, y: y + 0.78 }, { x: x + 0.12, y: y + 0.55 }], "#7bbf5a");
  r.circle({ x: x + f * 0.07, y: y + 0.62 }, 0.035, "#e85d5d");
  r.line({ x: x + f * 0.02, y: y + 0.5 }, { x: x + f * 0.13, y: y + 0.52 }, 0.02, "#2a2230");
  const tip = x + f * (0.35 + thrust * 0.75);
  r.line({ x: x - f * 0.25, y: y + 0.3 }, { x: tip, y: y + 0.3 }, 0.035, "#8a6a4e");
  r.poly([{ x: tip, y: y + 0.38 }, { x: tip + f * 0.18, y: y + 0.3 }, { x: tip, y: y + 0.22 }], "#c9ccd1");
}

/** The rabbit. Don't startle the rabbit. */
export function drawRabbit(r: Renderer, x: number, y: number, f: number, startled = false) {
  r.roundRect(x - 0.17, y, x + 0.15, y + 0.2, 0.09, "#f4efe6");
  r.circle({ x: x - f * 0.17, y: y + 0.1 }, 0.06, "#ffffff");
  r.circle({ x: x + f * 0.16, y: y + 0.24 }, 0.1, "#f4efe6");
  r.roundRect(x + f * 0.1 - 0.03, y + 0.3, x + f * 0.1 + 0.03, y + 0.55, 0.03, "#f4efe6");
  r.roundRect(x + f * 0.19 - 0.03, y + 0.3, x + f * 0.19 + 0.03, y + 0.52, 0.03, "#f4efe6");
  r.circle({ x: x + f * 0.21, y: y + 0.26 }, 0.018, "#2a2230");
  r.circle({ x: x + f * 0.26, y: y + 0.22 }, 0.015, "#e8a0a0");
  if (startled) r.text("!", { x: x + f * 0.1, y: y + 0.75 }, 0.3, "#c0392b", "center", 900);
}

/** The goat, unimpressed. */
export function drawGoat(r: Renderer, gx: number, y = 0) {
  r.roundRect(gx - 0.3, y + 0.3, gx + 0.25, y + 0.65, 0.12, "#e8e2d4");
  r.circle({ x: gx + 0.32, y: y + 0.72 }, 0.13, "#e8e2d4");
  for (const dx of [-0.2, -0.05, 0.08, 0.2]) r.rect(gx + dx - 0.03, y, gx + dx + 0.03, y + 0.32, "#6b5b45");
  r.circle({ x: gx + 0.36, y: y + 0.75 }, 0.02, "#2a2230");
}

/**
 * Mom (Director, Quantum Labs), as on the phone: lab coat over blue, round
 * glasses, a brown bun with a streak of grey. `y` is her feet.
 */
export function drawMom(r: Renderer, x: number, y: number, look = 1) {
  r.rect(x - 0.13, y, x - 0.03, y + 0.75, "#3b4a7a");
  r.rect(x + 0.03, y, x + 0.13, y + 0.75, "#3b4a7a");
  r.roundRect(x - 0.3, y + 0.7, x + 0.3, y + 1.32, 0.12, "#ffffff");
  r.poly([{ x: x - 0.09, y: y + 1.32 }, { x: x + 0.09, y: y + 1.32 }, { x, y: y + 1.12 }], "#5d9de8");
  const hy = y + 1.55;
  r.circle({ x, y: hy }, 0.22, "#eebd92");
  r.poly([{ x: x - 0.22, y: hy + 0.03 }, { x: x - 0.18, y: hy + 0.2 }, { x, y: hy + 0.24 }, { x: x + 0.21, y: hy + 0.18 }, { x: x + 0.22, y: hy + 0.03 }, { x, y: hy + 0.12 }], "#6b4a3a");
  r.circle({ x: x - look * 0.17, y: hy + 0.22 }, 0.1, "#6b4a3a");
  r.line({ x: x - look * 0.22, y: hy + 0.24 }, { x: x - look * 0.12, y: hy + 0.3 }, 0.018, "#c9ccd1");
  r.ring({ x: x - 0.08, y: hy }, 0.06, "#2a2230", 0.015);
  r.ring({ x: x + 0.08, y: hy }, 0.06, "#2a2230", 0.015);
  r.line({ x: x - 0.05, y: hy - 0.12 }, { x: x + 0.05, y: hy - 0.12 }, 0.018, "#6b2a2a");
}
