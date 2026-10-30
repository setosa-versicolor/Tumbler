import type { RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { createWorld, DT } from "../physics/world";
import { Stanley, type Intent } from "../physics/body/stanley";
import { Kit, type Button, type Prop, type Solid } from "../levels/kit";
import type { Level, LevelInstance, Progress } from "../levels/level";
import type { Tuning } from "./tuning";
import type { Vec } from "./math";

export type GameEvent =
  | { type: "press" }
  | { type: "score"; text: string; pos: Vec }
  | { type: "fall"; pos: Vec }
  | { type: "impact"; pos: Vec; strength: number }
  | { type: "throw"; speed: number }
  | { type: "complete" };

/** Sudden velocity change (m/s) on a prop that counts as an audible bump. */
const IMPACT_DV = 2.2;

/** Everything inside the simulation for one level. No DOM, so tests can run it headless. */
export class Game {
  world!: World;
  stanley!: Stanley;
  props: Prop[] = [];
  solids: Solid[] = [];
  buttons: Button[] = [];
  inst!: LevelInstance;
  /** Seconds since the level started. */
  time = 0;
  /** Times Stanley fell over this attempt. */
  falls = 0;
  progress: Progress = { done: false };
  /** Time the goal was reached, or null. */
  doneAt: number | null = null;
  private lastPosture = "up";
  private lastVel = new Map<RigidBody, Vec>();
  private lastHeld = new Set<RigidBody>();

  constructor(public tuning: Tuning, public level: Level, private seed = 1) {
    this.reset();
  }

  reset() {
    this.world?.free();
    this.world = createWorld(this.tuning.gravity);
    const kit = new Kit(this.world, this.seed);
    this.inst = this.level.build(kit);
    this.props = kit.props;
    this.solids = kit.solids;
    this.buttons = kit.buttons;
    this.stanley = new Stanley(this.world, this.level.spawn);
    this.time = 0;
    this.falls = 0;
    this.doneAt = null;
    this.progress = this.inst.progress(this);
    this.lastPosture = "up";
    this.lastVel.clear();
    this.lastHeld.clear();
  }

  get held(): Set<RigidBody> {
    const s = new Set<RigidBody>();
    for (const g of Object.values(this.stanley.grips)) if (g.held?.isDynamic()) s.add(g.held);
    return s;
  }

  step(intent: Intent): GameEvent[] {
    const events: GameEvent[] = [];
    this.world.gravity = { x: 0, y: -this.tuning.gravity };
    this.stanley.step(intent, this.tuning, DT);
    this.world.step();
    this.time += DT;

    for (const b of this.buttons) if (b.update(DT)) events.push({ type: "press" });

    const posture = this.stanley.balance.posture;
    if (posture === "down" && this.lastPosture !== "down") {
      this.falls++;
      events.push({ type: "fall", pos: this.stanley.rig.head.translation() });
    }
    this.lastPosture = posture;

    // Throws: something we were holding just left the hand, fast.
    const held = this.held;
    for (const b of this.lastHeld) {
      if (held.has(b)) continue;
      const v = b.linvel();
      const speed = Math.hypot(v.x, v.y);
      if (speed > 4.5) events.push({ type: "throw", speed });
    }
    this.lastHeld = held;

    // Bumps and crashes, for sound.
    for (const p of this.props) {
      const v = p.body.linvel();
      const last = this.lastVel.get(p.body);
      if (last && !held.has(p.body)) {
        const dv = Math.hypot(v.x - last.x, v.y - last.y);
        if (dv > IMPACT_DV) events.push({ type: "impact", pos: p.body.translation(), strength: dv });
      }
      this.lastVel.set(p.body, { x: v.x, y: v.y });
    }

    if (this.inst.update) events.push(...this.inst.update(this, DT));
    this.progress = this.inst.progress(this);
    if (this.progress.done && this.doneAt === null && !this.level.sandbox) {
      this.doneAt = this.time;
      events.push({ type: "complete" });
    }
    return events;
  }
}
