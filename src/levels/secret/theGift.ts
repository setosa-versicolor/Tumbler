import { OFFICE, type Level } from "../level";
import { inRect } from "../curio";

/** The time machine, with a bow on it. */
export const MACHINE = { x0: 6.6, x1: 8.6, top: 2.5 };

/** The secret ending, part one: Stanley's office, and a present from Mom. */
export const theGift: Level = {
  id: "the-gift",
  title: "The Gift",
  goal: "Open your present.",
  icon: "🎁",
  par: [30, 60],
  bounds: { w: 10.5, h: 4.6 },
  spawn: { x: 1.4, y: 0 },
  target: { x: (MACHINE.x0 + MACHINE.x1) / 2, y: 1.2 },
  theme: { ...OFFICE, top: "#f2ece0", bottom: "#e2d8c6", floor: "#6b4a3a", floorTop: "#82604c" },
  build(kit) {
    kit.enclosure(10.5, 4.6);
    kit.solid((MACHINE.x0 + MACHINE.x1) / 2, MACHINE.top / 2, (MACHINE.x1 - MACHINE.x0) / 2, MACHINE.top / 2, "desk", { hidden: true });
    // Its door: lay a hand on it and in he goes.
    const door = { x0: MACHINE.x0 - 0.25, y0: 0.2, x1: MACHINE.x0 + 0.1, y1: 2.1 };
    let opened = false;
    let hum = 0;

    return {
      update(game, dt) {
        hum += dt;
        if (!opened) {
          const hands = [game.stanley.rig.arms.L.hand, game.stanley.rig.arms.R.hand];
          if (hands.some((h) => inRect(h.translation(), door)) || inRect(game.stanley.rig.chest.translation(), door)) {
            opened = true;
            return [{ type: "sfx", name: "rumble", pos: { x: MACHINE.x0, y: 1 } }];
          }
        }
        return [];
      },
      progress: () => ({ done: opened, label: opened ? "Whirrrrr…" : "Open your present" }),
      drawBack(r, game) {
        // The CEO's office: a window, a nameplate, the plant he keeps knocking over.
        r.rect(1.0, 1.4, 4.6, 3.6, "#9fc4dd");
        for (const [x, h] of [[1.6, 1.2], [2.5, 1.8], [3.4, 1.0], [4.1, 1.5]] as const) r.rect(x - 0.3, 1.4, x + 0.3, 1.4 + h, "#7fa3bf");
        r.rect(0.95, 3.55, 4.65, 3.65, "#c9b8a0");
        r.rect(5.1, 2.8, 6.2, 3.2, "#5b3a2a");
        r.text("STANLEY T., CEO", { x: 5.65, y: 3.0 }, 0.1, "#f2c94c");
        // Delivery note on the floor.
        r.rect(9.0, 0, 9.5, 0.02, "#f4f4f4");
        void game;
      },
      drawMid(r, game) {
        const { x0, x1, top } = MACHINE;
        const cx = (x0 + x1) / 2;
        // The machine: brass and steel, dials, a porthole, blinking lights.
        r.roundRect(x0, 0, x1, top, 0.18, "#8f98a3");
        r.roundRect(x0 + 0.08, 0.08, x1 - 0.08, top - 0.08, 0.14, "#b8c0c9");
        r.roundRect(x0 + 0.05, 0.15, x0 + 0.65, 2.05, 0.08, opened ? "#2a2230" : "#6f7883");
        r.circle({ x: x0 + 0.5, y: 1.15 }, 0.06, "#e2b13c");
        r.circle({ x: cx + 0.35, y: 1.7 }, 0.32, "#5f6670");
        r.circle({ x: cx + 0.35, y: 1.7 }, 0.24, opened ? "#ffffff" : `rgba(120,220,255,${0.55 + 0.25 * Math.sin(hum * 3)})`);
        for (let i = 0; i < 4; i++) {
          const on = Math.floor(game.time * 4 + i) % 3 === 0;
          r.circle({ x: x0 + 0.95 + i * 0.22, y: 0.55 }, 0.06, on ? ["#e85d5d", "#f2c94c", "#7bc96f", "#5d9de8"][i] : "#4a5160");
        }
        r.circle({ x: cx + 0.35, y: 0.95 }, 0.16, "#e8eaed");
        r.line({ x: cx + 0.35, y: 0.95 }, { x: cx + 0.35 + Math.cos(hum * 2) * 0.12, y: 0.95 + Math.sin(hum * 2) * 0.12 }, 0.025, "#c0392b");
        r.text("1194 ◂ ▸ NOW", { x: cx + 0.35, y: 0.7 }, 0.07, "#2a2230");
        // The ribbon and the bow (it's a present).
        r.rect(cx - 0.12, 0, cx + 0.12, top, "rgba(232,93,93,0.9)");
        r.rect(x0, top * 0.55 - 0.1, x1, top * 0.55 + 0.1, "rgba(232,93,93,0.9)");
        r.poly([{ x: cx, y: top + 0.05 }, { x: cx - 0.55, y: top + 0.45 }, { x: cx - 0.5, y: top - 0.05 }], "#e85d5d");
        r.poly([{ x: cx, y: top + 0.05 }, { x: cx + 0.55, y: top + 0.45 }, { x: cx + 0.5, y: top - 0.05 }], "#e85d5d");
        r.circle({ x: cx, y: top + 0.08 }, 0.12, "#c0392b");
        // The tag.
        r.line({ x: cx + 0.5, y: top - 0.05 }, { x: x1 + 0.3, y: top - 0.45 }, 0.01, "#2a2230");
        r.roundRect(x1 + 0.15, top - 0.85, x1 + 1.35, top - 0.4, 0.04, "#fff6d8");
        r.text("To Stanley.", { x: x1 + 0.75, y: top - 0.53 }, 0.09, "#2a2230");
        r.text("Love, Mom. P.S. Don't.", { x: x1 + 0.75, y: top - 0.72 }, 0.065, "#5f6670");
      },
    };
  },
};
