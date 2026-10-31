import { HARBOUR, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio } from "../curio";
import type { GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";

const DOCK_Y = 1.0;
const BIN = { x0: 11.4, x1: 13.0, depth: 0.6 };
const NEEDED = 4;
/** A backboard behind the bin: make the distance and the fish drops in. */
export const BOARD = { x: BIN.x1 + 0.06, y0: DOCK_Y + BIN.depth, y1: DOCK_Y + 2.6 };
const GULL = { x: 9.9, y: DOCK_Y + 1.3 };
/** Chance per second a held fish slips, plus more when Stanley's moving. */
const SLIP_BASE = 0.3;
const SLIP_MOVING = 0.9;

/** Docks job 2: get slippery fish into the ice bin. They don't want to be carried. */
export const fishToss: Level = {
  id: "fish-toss",
  title: "Fish Toss",
  goal: `Get ${NEEDED} fish into the ice bin. They're slippery.`,
  icon: "🐟",
  par: [55, 100],
  bounds: { w: 14, h: 7 },
  spawn: { x: 2.8, y: DOCK_Y },
  target: { x: (BIN.x0 + BIN.x1) / 2, y: DOCK_Y + 0.8 },
  theme: HARBOUR,
  build(kit) {
    kit.enclosure(14, 7, true);
    kit.solid(3.25, DOCK_Y / 2, 3.25, DOCK_Y / 2, "dock");
    kit.water(6.5, 8.0, 0.75);
    kit.solid(11, DOCK_Y / 2, 3, DOCK_Y / 2, "dock");
    kit.basket(0.6, 2.0, DOCK_Y, 0.35);
    kit.basket(BIN.x0, BIN.x1, DOCK_Y, BIN.depth);
    // A dead (unbouncy) board, so a fish that hits it drops straight down.
    kit.solid(BOARD.x, (BOARD.y0 + BOARD.y1) / 2, 0.06, (BOARD.y1 - BOARD.y0) / 2, "post", { hidden: true, friction: 0.9 });
    kit.solid(GULL.x, DOCK_Y + 0.6, 0.1, 0.6, "post");
    kit.fragile(9.0, DOCK_Y, "bottles");
    const fish: Prop[] = [];
    for (let i = 0; i < 6; i++) {
      fish.push(
        kit.box(0.95 + (i % 3) * 0.45, DOCK_Y + 0.12 + Math.floor(i / 3) * 0.14, 0.2, 0.055, {
          kind: "fish",
          density: 8,
          friction: 0.15,
          restitution: 0.3,
          color: ["#8fb3c9", "#a7c4b5", "#c9b48f"][i % 3],
        }),
      );
    }
    const gull = new Curio("gull", "The seagull has filed a complaint.", { x0: 0, y0: 0, x1: 0, y1: 0 });
    const inBin = () =>
      fish.filter((f) => {
        const p = f.body.translation();
        return p.x > BIN.x0 && p.x < BIN.x1 && p.y > DOCK_Y && p.y < DOCK_Y + BIN.depth + 0.3;
      }).length;
    let last = 0;

    return {
      progress: () => {
        const n = Math.min(inBin(), NEEDED);
        return { done: n >= NEEDED, label: `Fish ${n}/${NEEDED}` };
      },
      update(game, dt) {
        const ev: GameEvent[] = [];
        // Held fish wriggle free.
        const speed = Math.abs(game.stanley.rig.pelvis.linvel().x) / game.tuning.moveSpeed;
        for (const f of fish) {
          if (!game.held.has(f.body)) continue;
          if (game.rand() < (SLIP_BASE + SLIP_MOVING * speed) * dt) {
            game.stanley.letGo(f.body);
            f.body.applyImpulse({ x: (game.rand() - 0.5) * 1.2, y: 0.8 }, true);
            ev.push({ type: "score", text: "Slippery!", pos: { ...f.body.translation(), y: f.body.translation().y + 0.4 } });
          }
        }
        // Anything flying near the gull scares it off.
        if (!gull.found && game.props.some((p) => {
          const q = p.body.translation();
          return p.kind !== "bottles" && Math.hypot(q.x - GULL.x, q.y - GULL.y - 0.15) < 0.55;
        })) ev.push({ ...gull.reveal(), pos: { x: GULL.x, y: GULL.y + 0.6 } });
        const n = inBin();
        if (n > last) ev.push({ type: "score", text: "SPLAT!", pos: { x: 12.2, y: 2.4 } });
        last = n;
        return ev;
      },
      drawBack(r, game) {
        // A fish jumps in the gap every few seconds, showing off.
        const k = (game.time % 4.5) / 0.8;
        if (k < 1) {
          const fx = 6.75 + k * 1.0;
          const fy = 0.75 + Math.sin(k * Math.PI) * 0.7;
          r.roundRect(fx - 0.12, fy - 0.05, fx + 0.12, fy + 0.05, 0.05, "#8fb3c9");
          r.poly([{ x: fx - 0.12, y: fy }, { x: fx - 0.22, y: fy + 0.07 }, { x: fx - 0.22, y: fy - 0.07 }], "#8fb3c9");
          r.circle({ x: fx + 0.07, y: fy + 0.01 }, 0.015, "#2a2230");
        }
        // Fishmonger's awning.
        for (let i = 0; i < 6; i++) r.rect(0.3 + i * 0.35, 2.9, 0.65 + i * 0.35, 3.2, i % 2 ? "#f4efe6" : "#3b6ea8");
        r.rect(0.35, DOCK_Y, 0.42, 2.9, "#7a6a5a");
        r.rect(2.3, DOCK_Y, 2.37, 2.9, "#7a6a5a");
        r.text("FRESH(ISH) FISH", { x: 1.35, y: 3.4 }, 0.2, "#3b6ea8");
      },
      drawFront(r) {
        // The backboard, on its pole: white, with a square to aim at.
        const top = BOARD.y1;
        r.rect(BOARD.x + 0.02, DOCK_Y, BOARD.x + 0.08, BOARD.y0 + 0.4, "#5f6670");
        r.rect(BOARD.x - 0.06, BOARD.y0 + 0.35, BOARD.x + 0.06, top, "#f4f4f4");
        r.rect(BOARD.x - 0.06, BOARD.y0 + 0.35, BOARD.x + 0.06, BOARD.y0 + 0.4, "#e8913c");
        r.rect(BOARD.x - 0.06, top - 0.05, BOARD.x + 0.06, top, "#e8913c");
        r.rect(BOARD.x - 0.07, BOARD.y0 + 0.75, BOARD.x + 0.07, BOARD.y0 + 1.25, "#e85d5d");
        r.rect(BOARD.x - 0.04, BOARD.y0 + 0.8, BOARD.x + 0.04, BOARD.y0 + 1.2, "#f4f4f4");
        // Ice bin front and the crate of fish.
        r.rect(BIN.x0, DOCK_Y, BIN.x1, DOCK_Y + BIN.depth - 0.05, "rgba(225,240,248,0.93)");
        r.text("ICE", { x: (BIN.x0 + BIN.x1) / 2, y: DOCK_Y + 0.3 }, 0.18, "#5d9de8");
        r.rect(0.6, DOCK_Y, 2.0, DOCK_Y + 0.14, "rgba(185,137,90,0.95)");
        drawGull(r, gull.found ? gull.age : -1);
      },
    };
  },
};

/** A seagull on a post. Throw something near it and it leaves, loudly. */
function drawGull(r: Renderer, foundAge: number) {
  const fly = foundAge >= 0 ? foundAge : 0;
  const x = GULL.x + fly * 2.2;
  const y = GULL.y + 0.12 + fly * 1.6;
  if (y > 8) return;
  const flap = foundAge >= 0 ? Math.sin(foundAge * 20) * 0.12 : 0;
  r.roundRect(x - 0.16, y - 0.07, x + 0.12, y + 0.08, 0.07, "#f4f4f4");
  r.circle({ x: x - 0.14, y: y + 0.11 }, 0.07, "#f4f4f4");
  r.poly([{ x: x - 0.2, y: y + 0.11 }, { x: x - 0.3, y: y + 0.08 }, { x: x - 0.2, y: y + 0.08 }], "#f2c94c");
  r.circle({ x: x - 0.16, y: y + 0.13 }, 0.015, "#2a2230");
  r.poly([{ x: x - 0.04, y: y + 0.03 }, { x: x + 0.2, y: y + 0.05 + flap }, { x: x + 0.1, y: y - 0.02 }], "#c9ccd1");
  if (foundAge < 0) r.line({ x: x - 0.02, y: y - 0.07 }, { x: x - 0.02, y: GULL.y }, 0.015, "#f2c94c");
  if (foundAge >= 0 && foundAge < 1.2) r.text("SQUAWK!", { x: x, y: y + 0.4 }, 0.16, "#2a2230");
}
