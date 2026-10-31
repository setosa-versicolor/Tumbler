import { type Level, type Theme } from "../level";
import type { Prop } from "../kit";
import { Curio } from "../curio";
import { wrapAngle } from "../../sim/math";

const DECK = { x0: 10.0, x1: 12.6 };
const NEEDED = 4;
const HOLD = 1.0;

const ALLEY: Theme = {
  outdoor: false,
  top: "#2e2a44",
  bottom: "#3d3758",
  floor: "#b88a52",
  floorTop: "#d6a868",
  stripe: "rgba(255,255,255,0.04)",
};

/** Downtown job 3: stand the pins back up. Grab one and it hangs from its neck, the right way up. */
export const pinReset: Level = {
  id: "pin-reset",
  title: "Pin Reset",
  goal: `Stand ${NEEDED} pins back up on the pin deck.`,
  icon: "🎳",
  par: [35, 80],
  bounds: { w: 13.5, h: 4.6 },
  spawn: { x: 1.5, y: 0 },
  target: { x: (DECK.x0 + DECK.x1) / 2, y: 0.8 },
  theme: ALLEY,
  build(kit) {
    kit.enclosure(13.5, 4.6);
    const pins: Prop[] = [];
    for (let i = 0; i < 8; i++) {
      const x = 4.2 + i * 0.68 + kit.rand() * 0.2;
      const pin = kit.box(x, 0.09, 0.085, 0.2, { kind: "pin", density: 5, friction: 0.9, restitution: 0.15, color: "#f4f4f4", angle: Math.PI / 2 + (kit.rand() - 0.5) * 0.3, dangle: true });
      // Dangling pins settle instead of swinging forever.
      pin.body.setAngularDamping(1.5);
      pins.push(pin);
    }
    kit.ball(2.8, 0.12, 0.12, { kind: "bowlingball", density: 40, color: "#3b6ea8", restitution: 0.1 });
    kit.fragile(3.6, 0, "trophy");
    const board = new Curio("scoreboard", "Perfect game. Naturally.", { x0: 9.6, y0: 2.6, x1: 13.0, y1: 3.8 });
    let standing = 0;
    let stable = 0;

    const upright = (held: Set<unknown>) =>
      pins.filter((p) => {
        if (held.has(p.body)) return false;
        const q = p.body.translation();
        const v = p.body.linvel();
        return q.x > DECK.x0 && q.x < DECK.x1 && Math.abs(wrapAngle(p.body.rotation())) < 0.3 && Math.hypot(v.x, v.y) < 0.1 && q.y < 0.3;
      }).length;
    return {
      update(game, dt) {
        standing = upright(game.held);
        stable = standing >= NEEDED ? stable + dt : 0;
        return board.update(game, dt);
      },
      progress: () => ({ done: stable >= HOLD, label: `Pins standing ${Math.min(standing, NEEDED)}/${NEEDED}` }),
      drawBack(r, game) {
        // Neon, the lane's gutters, the pin deck, and the scoreboard.
        r.rect(DECK.x0, 0, DECK.x1, 0.03, "rgba(255,255,255,0.25)");
        for (let x = DECK.x0 + 0.33; x < DECK.x1; x += 0.65) r.circle({ x, y: 0.03 }, 0.035, "rgba(232,93,93,0.6)");
        r.rect(9.6, 2.6, 13.0, 3.8, "#1c1a2a");
        r.text("HIGH SCORE", { x: 11.3, y: 3.55 }, 0.16, "#f2c94c");
        r.text("G.T.  ·  300", { x: 11.3, y: 3.1 }, 0.3, "#5de8c8");
        r.text("BOWL-O-RAMA", { x: 4.5, y: 3.6 }, 0.34, "#e85d9d");
        // A disco ball, throwing spots of light about.
        const ball = { x: 8.2, y: 3.5 };
        r.line({ x: ball.x, y: 4.6 }, ball, 0.015, "#9aa0a8");
        r.circle(ball, 0.22, "#c9ccd1");
        for (let i = 0; i < 6; i++) {
          const a = game.time * 1.3 + i;
          r.circle({ x: ball.x + Math.cos(a) * 0.13, y: ball.y + Math.sin(a * 0.7) * 0.13 }, 0.035, "rgba(255,255,255,0.9)");
          const sx = ((game.time * 0.35 + i * 0.37) % 1) * 13;
          const sy = 1.2 + ((i * 0.53) % 1) * 2.4;
          r.circle({ x: sx, y: sy }, 0.06, ["rgba(232,93,157,0.35)", "rgba(93,232,200,0.35)", "rgba(242,201,76,0.35)"][i % 3]);
        }
        r.rect(2.0, 3.25, 7.0, 3.3, "rgba(232,93,157,0.5)");
      },
    };
  },
};
