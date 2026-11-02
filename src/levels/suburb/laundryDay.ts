import { INDOOR, type Level } from "../level";
import type { Renderer } from "../../render/renderer";
import type { Prop } from "../kit";

const BASKET = { x0: 9.6, x1: 10.8, y: 1.04, depth: 0.45 };
const NEEDED = 3;
const SOCK_COLORS = ["#f4f4f4", "#e85d5d", "#5d9de8", "#f2c94c", "#7bc96f", "#c58be8"];

/** Job 2: get socks into the laundry basket on top of the dresser. Teaches throwing. */
export const laundryDay: Level = {
  id: "laundry-day",
  title: "Laundry Day",
  goal: `Socks everywhere: the colorful things on the floor and the bed. Get ${NEEDED} into the laundry basket on the dresser.`,
  icon: "🧦",
  par: [23, 35],
  bounds: { w: 12, h: 6 },
  spawn: { x: 2, y: 0 },
  target: { x: (BASKET.x0 + BASKET.x1) / 2, y: BASKET.y + 0.3 },
  theme: { ...INDOOR, top: "#dfe9f3", bottom: "#cddbe9", stripe: "rgba(255,255,255,0.25)" },
  build(kit) {
    kit.enclosure(12, 6);
    kit.solid(5.4, 0.3, 1.2, 0.3, "bed");
    kit.solid(10.2, 0.5, 0.8, 0.5, "dresser");
    kit.basket(BASKET.x0, BASKET.x1, BASKET.y, BASKET.depth);
    // A vase between the bed and the dresser. It won't survive the day.
    kit.fragile(7.0, 0, "vase");
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
      drawBack(r, game) {
        // Window, poster, rug.
        r.rect(2.2, 2.2, 3.8, 3.6, "#9fd3ec");
        r.rect(2.97, 2.2, 3.03, 3.6, "#f6f1e8");
        r.rect(2.2, 2.87, 3.8, 2.93, "#f6f1e8");
        // A wall hook with a shirt that never made it to the wash.
        r.circle({ x: 7.7, y: 3.35 }, 0.05, "#8a6a4e");
        r.poly(
          [
            { x: 7.45, y: 3.25 },
            { x: 7.95, y: 3.25 },
            { x: 8.2, y: 3.05 },
            { x: 8.05, y: 2.92 },
            { x: 7.92, y: 3.02 },
            { x: 7.92, y: 2.45 },
            { x: 7.48, y: 2.45 },
            { x: 7.48, y: 3.02 },
            { x: 7.35, y: 2.92 },
            { x: 7.2, y: 3.05 },
          ],
          "#e85d5d",
        );
        r.circle({ x: 7.7, y: 3.25 }, 0.07, "#cddbe9");
        r.rect(3.2, 0, 7.6, 0.03, "#c4706a");
        // The groom, asleep on the bed. Married life suits him.
        drawSleepingCat(r, game.time);
        drawWeddingPhoto(r);
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

/** A framed wedding photo: a bride, a cat in a top hat, and a lot of questions. It's just there. */
function drawWeddingPhoto(r: Renderer) {
  r.rect(4.75, 2.3, 5.75, 3.3, "#c9a36a");
  r.rect(4.83, 2.38, 5.67, 3.22, "#f3e9f5");
  // Bride: dress, head, veil.
  r.poly([{ x: 4.98, y: 2.4 }, { x: 5.26, y: 2.4 }, { x: 5.16, y: 2.82 }, { x: 5.08, y: 2.82 }], "#ffffff");
  r.circle({ x: 5.12, y: 2.92 }, 0.08, "#f2c79b");
  r.poly([{ x: 5.02, y: 3.0 }, { x: 5.22, y: 3.0 }, { x: 5.28, y: 2.62 }, { x: 4.96, y: 2.62 }], "rgba(255,255,255,0.75)");
  r.circle({ x: 5.09, y: 2.93 }, 0.012, "#2a2230");
  r.circle({ x: 5.15, y: 2.93 }, 0.012, "#2a2230");
  // Bouquet.
  r.circle({ x: 5.22, y: 2.68 }, 0.04, "#e85d5d");
  // Groom: a ginger cat in a bow tie and top hat, sitting tall.
  r.roundRect(5.36, 2.42, 5.58, 2.72, 0.08, "#e8a35c");
  r.circle({ x: 5.47, y: 2.82 }, 0.1, "#e8a35c");
  r.poly([{ x: 5.38, y: 2.88 }, { x: 5.41, y: 2.98 }, { x: 5.44, y: 2.9 }], "#e8a35c");
  r.poly([{ x: 5.5, y: 2.9 }, { x: 5.53, y: 2.98 }, { x: 5.56, y: 2.88 }], "#e8a35c");
  r.rect(5.4, 2.95, 5.54, 3.12, "#2a2230");
  r.rect(5.37, 2.94, 5.57, 2.97, "#2a2230");
  r.poly([{ x: 5.42, y: 2.73 }, { x: 5.47, y: 2.7 }, { x: 5.42, y: 2.67 }], "#2a2230");
  r.poly([{ x: 5.52, y: 2.73 }, { x: 5.47, y: 2.7 }, { x: 5.52, y: 2.67 }], "#2a2230");
  r.line({ x: 5.43, y: 2.84 }, { x: 5.45, y: 2.82 }, 0.012, "#2a2230");
  r.line({ x: 5.49, y: 2.82 }, { x: 5.51, y: 2.84 }, 0.012, "#2a2230");
  r.text("JUST MARRIED", { x: 5.25, y: 3.17 }, 0.06, "#c0392b");
}

function drawSleepingCat(r: Renderer, t: number) {
  const x = 5.35;
  const y = 0.72;
  const breathe = Math.sin(t * 1.6) * 0.012;
  r.roundRect(x - 0.24, y - 0.08, x + 0.2, y + 0.1 + breathe, 0.1, "#e8a35c");
  r.circle({ x: x + 0.2, y: y + 0.04 }, 0.1, "#e8a35c");
  r.poly([{ x: x + 0.14, y: y + 0.1 }, { x: x + 0.17, y: y + 0.19 }, { x: x + 0.22, y: y + 0.12 }], "#e8a35c");
  r.poly([{ x: x + 0.22, y: y + 0.12 }, { x: x + 0.27, y: y + 0.19 }, { x: x + 0.29, y: y + 0.09 }], "#e8a35c");
  r.line({ x: x + 0.15, y: y + 0.05 }, { x: x + 0.2, y: y + 0.05 }, 0.012, "#2a2230");
  r.line({ x: x - 0.24, y: y - 0.02 }, { x: x - 0.36, y: y + 0.08 }, 0.04, "#e8a35c");
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.35 + i / 3) % 1;
    r.text("z", { x: x + 0.3 + k * 0.25, y: y + 0.25 + k * 0.45 }, 0.08 + k * 0.08, `rgba(42,34,48,${0.6 * (1 - k)})`);
  }
}
