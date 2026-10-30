import { INDOOR, type Level } from "../level";
import { measureStack } from "../stack";
import { Curio } from "../curio";
import type { Renderer } from "../../render/renderer";

const LINE = 1.6;
const HOLD = 1.5;

/** Job 3: stack boxes up to a line and keep them there. Teaches careful placing. */
export const stackIt: Level = {
  id: "stack-it",
  title: "Stack It",
  goal: `Stack the boxes up to the line and keep them there.`,
  icon: "📦",
  par: [30, 60],
  bounds: { w: 11, h: 6 },
  spawn: { x: 1.3, y: 0 },
  target: { x: 7, y: LINE },
  theme: { ...INDOOR, top: "#d9dcdf", bottom: "#c4c8cc", floor: "#7a7f86", floorTop: "#9aa0a8", stripe: undefined },
  build(kit) {
    kit.enclosure(11, 6);
    const sizes = [0.3, 0.28, 0.27, 0.25, 0.23];
    kit.fragile(2.6, 0, "planter");
    let x = 3.9;
    for (const s of sizes) {
      kit.box(x, s + 0.01, s, s * (0.92 + kit.rand() * 0.12));
      x += s * 2 + 0.35 + kit.rand() * 0.25;
    }
    const bike = new Curio("bike", "Mr. Patel's New Year's resolution. Year: 2009.", { x0: 9.4, y0: 0, x1: 10.6, y1: 1.1 }, 0.9);
    let stable = 0;
    let height = 0;

    return {
      update(game, dt) {
        height = measureStack(game.props, game.held);
        stable = height >= LINE ? stable + dt : 0;
        return bike.update(game, dt);
      },
      progress: () => {
        if (stable >= HOLD) return { done: true, label: "Steady!" };
        if (height >= LINE) return { done: false, label: `Hold it… ${(HOLD - stable).toFixed(1)}` };
        return { done: false, label: `Stack ${height.toFixed(2)} / ${LINE.toFixed(2)} m` };
      },
      drawBack(r) {
        // Garage door, pegboard, oil stain.
        r.rect(6.6, 0, 10.4, 3.0, "#b8bcc2");
        for (let y = 0.4; y < 3; y += 0.4) r.rect(6.6, y, 10.4, y + 0.04, "rgba(0,0,0,0.08)");
        r.rect(0.6, 1.4, 2.6, 2.6, "#c8a878");
        for (let px = 0.8; px < 2.6; px += 0.25) for (let py = 1.6; py < 2.6; py += 0.25) r.circle({ x: px, y: py }, 0.025, "#8a6e4a");
        r.rect(4.6, 0, 6.0, 0.02, "rgba(0,0,0,0.25)");
        drawBike(r, bike.found ? bike.age : -1);
      },
      drawMid(r) {
        r.dashed({ x: 2.8, y: LINE }, { x: 10.8, y: LINE }, "rgba(240,138,60,0.85)");
        r.text(`${LINE.toFixed(1)} m`, { x: 10.4, y: LINE + 0.15 }, 0.18, "rgba(240,138,60,0.95)");
      },
    };
  },
};

/** A dusty exercise bike. Touch it and the wheel spins for the first time in years. */
function drawBike(r: Renderer, foundAge: number) {
  const spin = foundAge >= 0 ? foundAge * 12 * Math.max(0, 1 - foundAge / 4) : 0;
  r.line({ x: 9.6, y: 0.05 }, { x: 10.4, y: 0.05 }, 0.06, "#55606c");
  r.line({ x: 9.75, y: 0.05 }, { x: 9.95, y: 0.75 }, 0.05, "#7a8794");
  r.line({ x: 10.25, y: 0.05 }, { x: 10.05, y: 0.55 }, 0.05, "#7a8794");
  r.line({ x: 9.95, y: 0.75 }, { x: 10.3, y: 0.95 }, 0.04, "#7a8794");
  r.roundRect(9.85, 0.75, 10.05, 0.8, 0.02, "#2a2230");
  r.ring({ x: 10.25, y: 0.45 }, 0.17, "#55606c", 0.04);
  r.line({ x: 10.25, y: 0.45 }, { x: 10.25 + Math.cos(spin) * 0.15, y: 0.45 + Math.sin(spin) * 0.15 }, 0.02, "#55606c");
  // Dust (gone once it's been touched) and a towel that's never been used.
  if (foundAge < 0) for (const [x, y] of [[9.9, 0.82], [10.2, 0.97], [10.3, 0.63]] as const) r.circle({ x, y }, 0.04, "rgba(200,190,170,0.6)");
  r.rect(10.27, 0.7, 10.33, 0.93, "#f4f4f4");
}
