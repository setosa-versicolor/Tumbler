import { INDOOR, type Level } from "../level";
import { wrapAngle } from "../../sim/math";

const LANDING_Y = 2.0;
const MAT = { x0: 11.4, x1: 13.0 };
const HOLD = 0.6;

/** Job 4: carry a pizza up the stairs and put it down flat. Teaches carrying. */
export const pizzaUp: Level = {
  id: "pizza-up",
  title: "Pizza Up",
  goal: "Deliver the pizza to 4B. Flat, please.",
  icon: "🍕",
  par: [20, 45],
  bounds: { w: 14, h: 7 },
  spawn: { x: 1.4, y: 0 },
  target: { x: (MAT.x0 + MAT.x1) / 2, y: LANDING_Y + 0.3 },
  theme: { ...INDOOR, top: "#f3e0d0", bottom: "#e6cbb5", stripe: "rgba(255,255,255,0.15)" },
  build(kit) {
    kit.enclosure(14, 7);
    kit.solid(3.0, 0.375, 0.45, 0.375, "table");
    const pizza = kit.box(3.0, 0.8, 0.3, 0.045, { kind: "pizza", density: 10, color: "#f1e3c6", friction: 0.9 });
    kit.stairs(5, 0, 8, 0.5, 0.25);
    kit.solid(11.25, LANDING_Y / 2, 2.75, LANDING_Y / 2, "landing");
    let settled = 0;

    const state = () => {
      const p = pizza.body.translation();
      const v = pizza.body.linvel();
      const onMat = p.x > MAT.x0 && p.x < MAT.x1 && p.y > LANDING_Y && p.y < LANDING_Y + 0.5;
      const resting = Math.hypot(v.x, v.y) < 0.25;
      const flat = Math.abs(wrapAngle(pizza.body.rotation())) < 0.3;
      return { onMat, resting, flat };
    };

    return {
      update(game, dt) {
        const s = state();
        settled = s.onMat && s.resting && s.flat && !game.held.has(pizza.body) ? settled + dt : 0;
        return [];
      },
      progress: () => {
        if (settled >= HOLD) return { done: true, label: "Delivered!" };
        const s = state();
        if (s.onMat && s.resting && !s.flat) return { done: false, label: "Flat, please!" };
        return { done: false, label: s.onMat ? "Put it down…" : "Pizza to 4B" };
      },
      drawBack(r) {
        // Door to 4B, a light, a framed picture on the stairs.
        r.rect(13.1, LANDING_Y, 14, LANDING_Y + 2.2, "#7a4e34");
        r.rect(13.2, LANDING_Y + 1.6, 13.6, LANDING_Y + 1.9, "#f2c94c");
        r.text("4B", { x: 13.4, y: LANDING_Y + 1.68 }, 0.16, "#5b3a2a");
        r.rect(MAT.x0, LANDING_Y, MAT.x1, LANDING_Y + 0.03, "#5d8a52");
        r.text("WELCOME", { x: (MAT.x0 + MAT.x1) / 2, y: LANDING_Y + 0.08 }, 0.12, "rgba(255,255,255,0.8)");
        r.rect(6.4, 3.0, 7.4, 3.8, "#cfa66a");
        r.rect(6.5, 3.1, 7.3, 3.7, "#8fc1d9");
        r.circle({ x: 10.5, y: 5.6 }, 0.18, "#fff3b0");
      },
    };
  },
};
