import { OUTDOOR, type Level } from "../level";
import { Curio } from "../curio";
import type { GameEvent } from "../../sim/game";

const HOUSE_X = 11.5;
const BELL_Y = 2.25;

/** Job 1: ring a doorbell that's just a bit too high. Teaches reaching and jumping. */
export const dingDong: Level = {
  id: "ding-dong",
  title: "Ding Dong",
  goal: "Ring the doorbell.",
  icon: "🔔",
  par: [8, 20],
  bounds: { w: 14, h: 7 },
  spawn: { x: 2.5, y: 0 },
  target: { x: HOUSE_X - 0.1, y: BELL_Y },
  theme: OUTDOOR,
  build(kit) {
    kit.enclosure(14, 7, true);
    kit.solid(HOUSE_X + 1.5, 2.3, 1.5, 2.3, "house", { hidden: true });
    kit.solid(HOUSE_X - 0.6, 0.12, 0.6, 0.12, "porch");
    const bell = kit.button(HOUSE_X, BELL_Y, 0.06, 0.09);
    kit.box(6.2, 0.3, 0.3, 0.3, { kind: "crate", density: 10, color: "#b9895a" });
    const gnome = kit.box(8.4, 0.23, 0.13, 0.22, { kind: "gnome", density: 20, color: "#d9453c" });
    // Surprises: knock the gnome over (he takes it personally); ring the bell
    // by throwing something at it (Mrs. Henderson takes THAT personally).
    const offended = new Curio("gnome", "The gnome is deeply offended.", { x0: 0, y0: 0, x1: 0, y1: 0 });
    const henderson = new Curio("henderson", "Mrs. Henderson: \"Did you just THROW something at my door?\"", { x0: HOUSE_X + 0.4, y0: 3.0, x1: HOUSE_X + 1.3, y1: 3.9 });
    kit.ball(4.6, 0.16, 0.16, { color: "#f2f2f2" });
    // Mrs. Henderson's prize planter, right in the path.
    kit.fragile(7.3, 0, "planter");

    let rung = 0;
    return {
      progress: () => ({ done: bell.presses > 0, label: bell.presses > 0 ? "Ding dong!" : "Ring the bell" }),
      update: (game) => {
        const ev: GameEvent[] = [];
        if (!offended.found && Math.abs(gnome.body.rotation()) > 1.2) {
          gnome.mood = "offended";
          ev.push({ ...offended.reveal(), pos: { x: gnome.body.translation().x, y: 1.0 } });
        }
        if (bell.presses === rung) return ev;
        rung = bell.presses;
        ev.push({ type: "score", text: "DING DONG!", pos: { x: HOUSE_X - 0.5, y: BELL_Y + 0.4 } });
        const hands = [game.stanley.rig.arms.L.hand, game.stanley.rig.arms.R.hand].map((h) => h.translation());
        const thrown = hands.every((h) => Math.hypot(h.x - HOUSE_X, h.y - BELL_Y) > 0.6);
        if (thrown && !henderson.found) ev.push(henderson.reveal());
        return ev;
      },
      drawBack(r) {
        // The house: wall, roof, door, windows.
        r.rect(HOUSE_X, 0, 15, 4.6, "#e9c9a0");
        for (let y = 0.3; y < 4.6; y += 0.3) r.rect(HOUSE_X, y, 15, y + 0.02, "rgba(0,0,0,0.05)");
        r.poly([{ x: HOUSE_X - 0.4, y: 4.6 }, { x: 15, y: 4.6 }, { x: 15, y: 6.4 }], "#b4533f");
        r.rect(HOUSE_X + 0.25, 0.24, HOUSE_X + 1.25, 2.4, "#6e4a8e");
        r.circle({ x: HOUSE_X + 0.4, y: 1.3 }, 0.05, "#f2c94c");
        r.rect(HOUSE_X + 1.6, 1.4, HOUSE_X + 2.4, 2.4, "#bfe3f2");
        r.rect(HOUSE_X + 1.98, 1.4, HOUSE_X + 2.02, 2.4, "#e9c9a0");
        r.rect(HOUSE_X + 0.4, 3.0, HOUSE_X + 1.3, 3.9, "#bfe3f2");
        if (henderson.found) {
          // Mrs. Henderson, curlers in, glaring.
          const cx = HOUSE_X + 0.85;
          const up = Math.min(1, henderson.age * 3);
          r.rect(cx - 0.28, 3.0, cx + 0.28, 3.0 + 0.35 * up, "#c58be8");
          r.circle({ x: cx, y: 3.25 + 0.3 * up }, 0.2, "#f2c79b");
          for (const dx of [-0.14, 0, 0.14]) r.circle({ x: cx + dx, y: 3.45 + 0.3 * up }, 0.06, "#f4a6c0");
          r.line({ x: cx - 0.12, y: 3.32 + 0.3 * up }, { x: cx - 0.03, y: 3.29 + 0.3 * up }, 0.025, "#2a2230");
          r.line({ x: cx + 0.12, y: 3.32 + 0.3 * up }, { x: cx + 0.03, y: 3.29 + 0.3 * up }, 0.025, "#2a2230");
          r.line({ x: cx - 0.07, y: 3.14 + 0.3 * up }, { x: cx + 0.07, y: 3.14 + 0.3 * up }, 0.025, "#2a2230");
        }
        r.text("12", { x: HOUSE_X + 0.75, y: 2.6 }, 0.22, "#5b3a2a");
        // Bell plate.
        r.rect(HOUSE_X - 0.02, BELL_Y - 0.16, HOUSE_X + 0.03, BELL_Y + 0.16, "#8a7a6a");
        // Garden: fence and bushes.
        for (let x = 0.3; x < HOUSE_X - 0.8; x += 0.45) r.rect(x, 0, x + 0.12, 0.9, "#f4efe6");
        r.rect(0, 0.6, HOUSE_X - 0.8, 0.68, "#f4efe6");
        for (const bx of [1.4, 9.4]) {
          r.circle({ x: bx, y: 0.3 }, 0.45, "#5f9440");
          r.circle({ x: bx + 0.45, y: 0.25 }, 0.35, "#6aa34a");
        }
      },
    };
  },
};
