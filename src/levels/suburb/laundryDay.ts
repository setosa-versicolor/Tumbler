import { INDOOR, type Level } from "../level";
import type { Prop } from "../kit";

const BASKET = { x0: 9.6, x1: 10.8, y: 1.04, depth: 0.45 };
const NEEDED = 3;
const SOCK_COLORS = ["#f4f4f4", "#e85d5d", "#5d9de8", "#f2c94c", "#7bc96f", "#c58be8"];

/** Job 2: get socks into the laundry basket on top of the dresser. Teaches throwing. */
export const laundryDay: Level = {
  id: "laundry-day",
  title: "Laundry Day",
  goal: `Get ${NEEDED} socks into the laundry basket.`,
  icon: "🧦",
  par: [14, 35],
  bounds: { w: 12, h: 6 },
  spawn: { x: 2, y: 0 },
  target: { x: (BASKET.x0 + BASKET.x1) / 2, y: BASKET.y + 0.3 },
  theme: { ...INDOOR, top: "#dfe9f3", bottom: "#cddbe9", stripe: "rgba(255,255,255,0.25)" },
  build(kit) {
    kit.enclosure(12, 6);
    kit.solid(5.4, 0.3, 1.2, 0.3, "bed");
    kit.solid(10.2, 0.5, 0.8, 0.5, "dresser");
    kit.basket(BASKET.x0, BASKET.x1, BASKET.y, BASKET.depth);
    const socks: Prop[] = [];
    [1.1, 3.1, 4.7, 6.0, 7.5, 8.3].forEach((x, i) => {
      const y = x > 4.2 && x < 6.6 ? 0.7 : 0.06;
      socks.push(
        kit.box(x, y, 0.14, 0.05, { kind: "sock", density: 8, friction: 1, restitution: 0, color: SOCK_COLORS[i], angle: (i % 3) * 0.3 }),
      );
    });

    const inBasket = () =>
      socks.filter((s) => {
        const p = s.body.translation();
        return p.x > BASKET.x0 && p.x < BASKET.x1 && p.y > BASKET.y && p.y < BASKET.y + BASKET.depth + 0.3;
      }).length;
    let last = 0;

    return {
      progress: () => {
        const n = Math.min(inBasket(), NEEDED);
        return { done: n >= NEEDED, label: `Socks ${n}/${NEEDED}` };
      },
      update: () => {
        const n = inBasket();
        const ev = n > last ? [{ type: "score" as const, text: "SWISH!", pos: { x: (BASKET.x0 + BASKET.x1) / 2, y: 2 } }] : [];
        last = n;
        return ev;
      },
      drawBack(r) {
        // Window, poster, rug.
        r.rect(2.2, 2.2, 3.8, 3.6, "#9fd3ec");
        r.rect(2.97, 2.2, 3.03, 3.6, "#f6f1e8");
        r.rect(2.2, 2.87, 3.8, 2.93, "#f6f1e8");
        r.rect(7.2, 2.3, 8.2, 3.6, "#e8a35c");
        r.text("ROCK", { x: 7.7, y: 3.05 }, 0.2, "#fff");
        r.rect(3.2, 0, 7.6, 0.03, "#c4706a");
      },
      drawFront(r) {
        // Basket weave in front of anything inside it.
        r.rect(BASKET.x0, BASKET.y, BASKET.x1, BASKET.y + BASKET.depth - 0.05, "rgba(185,138,79,0.92)");
        for (let i = 1; i < 4; i++) {
          const y = BASKET.y + (i * BASKET.depth) / 4;
          r.rect(BASKET.x0, y, BASKET.x1, y + 0.02, "rgba(0,0,0,0.15)");
        }
      },
    };
  },
};
