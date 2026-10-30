import { HIGH_RISE, type Level } from "../level";
import { Curio, inRect, type Rect } from "../curio";
import type { GameEvent } from "../../sim/game";

const FACE = 6.2;
const CRADLE = { x0: 2.6, x1: 6.1, hh: 0.08 };
const LOW = 0.35;
const HIGH = 7.2;
const SPEED = 0.45;
const SCRUB_TIME = 1.0;

/** Skyscraper job 1: ride the window-cleaning cradle and scrub the dirty patches as they go by. */
export const windowWasher: Level = {
  id: "window-washer",
  title: "Window Washer",
  goal: "Scrub every dirty window as the cradle goes up and down.",
  icon: "🪟",
  par: [40, 90],
  bounds: { w: 9.5, h: 9.5 },
  spawn: { x: 4.3, y: LOW + CRADLE.hh },
  target: { x: FACE - 0.2, y: 4.5 },
  theme: HIGH_RISE,
  build(kit) {
    kit.enclosure(9.5, 9.5, true);
    kit.solid((FACE + 9.5) / 2 + 0.3, 5, (9.5 - FACE) / 2 + 0.3, 5, "facade");
    // A rail on the open side, so Stanley doesn't just walk off into the sky.
    const cradle = kit.platform((CRADLE.x0 + CRADLE.x1) / 2, LOW, (CRADLE.x1 - CRADLE.x0) / 2, CRADLE.hh, 0.8);
    kit.fragile(3.3, LOW + CRADLE.hh, "bucket");

    const spots: { rect: Rect; clean: number }[] = [1.7, 2.7, 3.9, 5.0, 6.0, 7.6].map((y) => ({
      rect: { x0: FACE - 0.42, y0: y - 0.22, x1: FACE + 0.05, y1: y + 0.22 },
      clean: 0,
    }));
    const gerald = new Curio("gerald-window", "Through the glass, Gerald raises his coffee to you.", { x0: FACE - 0.4, y0: 8.4, x1: FACE + 0.05, y1: 9.0 }, 0.5);
    let y = LOW;
    let dir = 1;

    return {
      update(game, dt) {
        // The cradle goes up and down, pausing briefly at each end.
        y += dir * SPEED * dt;
        if (y > HIGH) {
          y = HIGH;
          dir = -1;
        } else if (y < LOW) {
          y = LOW;
          dir = 1;
        }
        cradle.setNextKinematicTranslation({ x: (CRADLE.x0 + CRADLE.x1) / 2, y });

        // Scrubbing: a hand moving over a dirty patch cleans it.
        const ev: GameEvent[] = [];
        for (const h of [game.stanley.rig.arms.L.hand, game.stanley.rig.arms.R.hand]) {
          const v = h.linvel();
          const p = h.translation();
          for (const s of spots) {
            if (s.clean >= 1 || !inRect(p, s.rect) || Math.hypot(v.x, v.y - dir * SPEED) < 0.4) continue;
            s.clean = Math.min(1, s.clean + dt / SCRUB_TIME);
            if (s.clean >= 1) ev.push({ type: "score", text: "Squeaky!", pos: { x: FACE - 0.6, y: (s.rect.y0 + s.rect.y1) / 2 + 0.3 } });
          }
        }
        return [...ev, ...gerald.update(game, dt)];
      },
      progress: () => {
        const n = spots.filter((s) => s.clean >= 1).length;
        return { done: n === spots.length, label: `Windows clean ${n}/${spots.length}` };
      },
      drawBack(r) {
        // Distant skyline far below, the building's glass face, the window grid.
        for (const [x, h] of [[0.4, 1.4], [1.3, 2.2], [2.4, 1.1], [3.5, 2.6], [4.6, 1.6]] as const) r.rect(x - 0.4, 0, x + 0.4, h, "#a9c4d8");
        r.rect(FACE, 0, 10, 9.5, "#7fa3bf");
        for (let wy = 0.3; wy < 9.5; wy += 1.1) {
          r.rect(FACE, wy, 10, wy + 0.06, "#c9d4dd");
          r.rect(FACE + 0.05, wy + 0.1, FACE + 1.3, wy + 1.0, "rgba(190,220,240,0.6)");
          r.rect(FACE + 1.45, wy + 0.1, FACE + 2.8, wy + 1.0, "rgba(190,220,240,0.6)");
        }
        // Gerald, in his office, many floors up.
        r.circle({ x: FACE + 0.65, y: 8.75 }, 0.16, "#eebd92");
        r.rect(FACE + 0.45, 8.38, FACE + 0.85, 8.6, "#4a5160");
        r.roundRect(FACE + 0.88, 8.6, FACE + 0.98, 8.75, 0.02, "#f4f4f4");
        // Grime on the glass (fading as it's scrubbed).
        for (const s of spots) {
          if (s.clean >= 1) continue;
          const a = 0.75 * (1 - s.clean);
          const cy = (s.rect.y0 + s.rect.y1) / 2;
          r.circle({ x: FACE + 0.25, y: cy }, 0.22, `rgba(110,90,60,${a})`);
          r.circle({ x: FACE + 0.45, y: cy + 0.1 }, 0.14, `rgba(110,90,60,${a})`);
          r.circle({ x: FACE + 0.15, y: cy - 0.12 }, 0.1, `rgba(110,90,60,${a})`);
        }
        // The cradle's cables.
        r.line({ x: CRADLE.x0 + 0.2, y }, { x: CRADLE.x0 + 0.2, y: 9.5 }, 0.025, "#5f6670");
        r.line({ x: CRADLE.x1 - 0.2, y }, { x: CRADLE.x1 - 0.2, y: 9.5 }, 0.025, "#5f6670");
      },
      drawMid(r) {
        // The cradle itself and its rail.
        r.rect(CRADLE.x0, y - CRADLE.hh, CRADLE.x1, y + CRADLE.hh, "#5f6670");
        r.rect(CRADLE.x0, y + CRADLE.hh, CRADLE.x0 + 0.08, y + 0.9, "#5f6670");
        r.rect(CRADLE.x0, y + 0.82, CRADLE.x1, y + 0.88, "#7a828c");
        r.text("50", { x: (CRADLE.x0 + CRADLE.x1) / 2, y: y - 0.25 }, 0.14, "rgba(255,255,255,0.7)");
      },
    };
  },
};
