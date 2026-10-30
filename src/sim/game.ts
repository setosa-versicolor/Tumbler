import type { World } from "@dimforge/rapier2d-deterministic-compat";
import { createWorld, DT } from "../physics/world";
import { Tumbler, type Intent } from "../physics/body/tumbler";
import { BASKET, buildRoom, LEDGE, type Button, type Prop, type Solid } from "../props/room";
import type { Tuning } from "./tuning";

export interface Stats {
  presses: number;
  inBasket: number;
  /** Top of the tallest resting pile on the floor, metres. */
  stack: number;
  bestStack: number;
}

export type GameEvent = { type: "press" } | { type: "basket" } | { type: "fall" };

/** Everything inside the simulation. No DOM in here, so tests can run it headless. */
export class Game {
  world!: World;
  tumbler!: Tumbler;
  props: Prop[] = [];
  solids: Solid[] = [];
  button!: Button;
  stats: Stats = { presses: 0, inBasket: 0, stack: 0, bestStack: 0 };
  time = 0;
  private lastPosture = "up";

  constructor(public tuning: Tuning, private seed = 1) {
    this.reset();
  }

  reset() {
    this.world?.free();
    this.world = createWorld(this.tuning.gravity);
    const room = buildRoom(this.world, this.seed);
    this.props = room.props;
    this.solids = room.solids;
    this.button = room.button;
    this.tumbler = new Tumbler(this.world, { x: 2.5, y: 0 });
    this.stats = { presses: 0, inBasket: 0, stack: 0, bestStack: this.stats.bestStack };
    this.time = 0;
  }

  step(intent: Intent): GameEvent[] {
    const events: GameEvent[] = [];
    this.world.gravity = { x: 0, y: -this.tuning.gravity };
    this.tumbler.step(intent, this.tuning, DT);
    this.world.step();
    this.time += DT;

    if (this.button.update(DT)) {
      this.stats.presses++;
      events.push({ type: "press" });
    }
    const posture = this.tumbler.balance.posture;
    if (posture === "down" && this.lastPosture !== "down") events.push({ type: "fall" });
    this.lastPosture = posture;

    const inBasket = this.props.filter((p) => {
      const q = p.body.translation();
      return q.x > BASKET.x0 && q.x < BASKET.x1 && q.y > BASKET.y && q.y < BASKET.y + BASKET.lip + 0.3;
    }).length;
    if (inBasket > this.stats.inBasket) events.push({ type: "basket" });
    this.stats.inBasket = inBasket;

    this.stats.stack = this.measureStack();
    this.stats.bestStack = Math.max(this.stats.bestStack, this.stats.stack);
    return events;
  }

  /**
   * Height of the tallest pile (two or more) of resting boxes standing on the floor. A box
   * counts only once it has settled and nobody is holding it, and only if
   * it's part of a chain of touching boxes down to the floor.
   */
  private measureStack(): number {
    const held = new Set([this.tumbler.grips.L.held, this.tumbler.grips.R.held]);
    const boxes = this.props.filter((p) => {
      if (p.kind !== "box" || held.has(p.body)) return false;
      const v = p.body.linvel();
      const x = p.body.translation().x;
      return Math.hypot(v.x, v.y) < 0.12 && !(x > LEDGE.x0 - 0.3 && x < LEDGE.x1 + 0.3 && p.body.translation().y > LEDGE.y);
    });
    const extent = (p: Prop) => {
      const a = p.body.rotation();
      const c = Math.abs(Math.cos(a));
      const s = Math.abs(Math.sin(a));
      return { hx: p.hw * c + p.hh * s, hy: p.hw * s + p.hh * c };
    };
    const supported = new Set<Prop>();
    let best = 0;
    // Grow piles upward from the floor.
    for (let changed = true; changed; ) {
      changed = false;
      for (const b of boxes) {
        if (supported.has(b)) continue;
        const pb = b.body.translation();
        const eb = extent(b);
        const bottom = pb.y - eb.hy;
        // Anything low (a plank lying on the floor) still counts as the floor.
        const onFloor = bottom < 0.15;
        const onOther = [...supported].some((o) => {
          const po = o.body.translation();
          const eo = extent(o);
          return Math.abs(bottom - (po.y + eo.hy)) < 0.08 && Math.abs(pb.x - po.x) < eb.hx + eo.hx;
        });
        if (onFloor || onOther) {
          supported.add(b);
          // A lone box on the floor isn't a stack.
          if (onOther) best = Math.max(best, pb.y + eb.hy);
          changed = true;
        }
      }
    }
    return best;
  }
}
