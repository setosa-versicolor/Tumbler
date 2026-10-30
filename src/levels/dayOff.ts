import { INDOOR, type Level } from "./level";
import { measureStack } from "./stack";

const W = 16;
export const LEDGE = { x0: 10.6, x1: 13.2, y: 2.2, thick: 0.2 };
const BASKET = { x0: 0, x1: 1.4, y: 2.9, lip: 0.55 };

/** The original test room: no goal, just stuff. */
export const dayOff: Level = {
  id: "day-off",
  title: "Day Off",
  goal: "No job today. Mess around.",
  icon: "🛋️",
  par: [0, 0],
  bounds: { w: W, h: 8 },
  spawn: { x: 2.5, y: 0 },
  theme: INDOOR,
  sandbox: true,
  build(kit) {
    kit.enclosure(W, 8);
    kit.solid((LEDGE.x0 + LEDGE.x1) / 2, LEDGE.y, (LEDGE.x1 - LEDGE.x0) / 2, LEDGE.thick / 2, "ledge");
    kit.solid((BASKET.x0 + BASKET.x1) / 2, BASKET.y, (BASKET.x1 - BASKET.x0) / 2, 0.05, "basket");
    kit.solid(BASKET.x1 - 0.05, BASKET.y + BASKET.lip / 2, 0.05, BASKET.lip / 2, "basket");
    const button = kit.button(W, 1.95);

    const sizes = [0.32, 0.28, 0.26, 0.24, 0.22, 0.2];
    let x = 4.2;
    sizes.forEach((s, i) => {
      kit.box(x, s + (i % 2) * 0.9 + 0.01, s, s * (0.85 + kit.rand() * 0.2));
      x += s * 2 + 0.15 + kit.rand() * 0.2;
    });
    kit.ball(8.6, 0.25, 0.18, { color: "#e85d5d" });
    kit.ball(9.3, 0.25, 0.14, { color: "#5d9de8" });
    kit.ball(2.6, 0.25, 0.16, { color: "#7bc96f" });
    kit.box(7.2, 0.08, 0.8, 0.05, { kind: "plank", density: 12, color: "#a8784a" });
    kit.box(12.4, LEDGE.y + 0.4, 0.3, 0.045, { kind: "pizza", density: 10, color: "#f1e3c6" });
    kit.box(11.4, LEDGE.y + 0.35, 0.22, 0.22);

    let inBasket = 0;
    let stack = 0;
    let best = 0;
    return {
      update(game) {
        const n = game.props.filter((p) => {
          const q = p.body.translation();
          return q.x > BASKET.x0 && q.x < BASKET.x1 && q.y > BASKET.y && q.y < BASKET.y + BASKET.lip + 0.3;
        }).length;
        const ev = n > inBasket ? [{ type: "score" as const, text: "SWISH!", pos: { x: 0.9, y: 3.8 } }] : [];
        inBasket = n;
        stack = measureStack(game.props, game.held, 0, (p) => {
          const q = p.body.translation();
          return q.x > LEDGE.x0 - 0.3 && q.x < LEDGE.x1 + 0.3 && q.y > LEDGE.y;
        });
        best = Math.max(best, stack);
        return ev;
      },
      progress: () => ({
        done: false,
        label: `Button ${button.presses} · Basket ${inBasket} · Stack ${stack.toFixed(2)}m (best ${best.toFixed(2)})`,
      }),
      drawBack(r) {
        for (let y = 1; y < 8; y++) r.text(`${y}m`, { x: 1.9, y: y - 0.06 }, 0.14, "rgba(42,34,48,0.35)", "left");
        // Ledge bracket.
        r.rect(LEDGE.x1 - 0.43, 0, LEDGE.x1 - 0.37, LEDGE.y, "#7c8a99");
        if (best > 0.3) {
          r.dashed({ x: 2, y: best }, { x: 9.6, y: best }, "rgba(240,138,60,0.7)");
          r.text(`best stack ${best.toFixed(2)}m`, { x: 8.6, y: best + 0.1 }, 0.14, "rgba(240,138,60,0.9)");
        }
      },
      drawFront(r) {
        r.rect(BASKET.x0, BASKET.y, BASKET.x1, BASKET.y + BASKET.lip, "rgba(185,138,79,0.92)");
        r.text("BASKET", { x: 0.7, y: BASKET.y + 0.2 }, 0.16, "rgba(255,255,255,0.9)");
      },
    };
  },
};
