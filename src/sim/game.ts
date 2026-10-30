import type { RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { createWorld, DT } from "../physics/world";
import { Stanley, type Intent } from "../physics/body/stanley";
import { Kit, shatter, type Button, type Prop, type Solid } from "../levels/kit";
import type { Level, LevelInstance, Progress } from "../levels/level";
import type { Tuning } from "./tuning";
import { rng, type Vec } from "./math";

export type GameEvent =
  | { type: "press" }
  | { type: "score"; text: string; pos: Vec }
  | { type: "fall"; pos: Vec }
  | { type: "trip"; pos: Vec }
  | { type: "impact"; pos: Vec; strength: number }
  | { type: "throw"; speed: number }
  | { type: "break"; pos: Vec; kind: string }
  | { type: "complete" };

/** Sudden velocity change (m/s) on a prop that counts as an audible bump. */
const IMPACT_DV = 2.2;
/** A bump this hard breaks a fragile thing. */
const BREAK_DV = 1.5;
/** Tipped this far (radians), a fragile thing is done for. */
const BREAK_TILT = 0.9;
/** Seconds after being put down before a carried fragile thing gives up anyway. */
const BREAK_AFTER_CARRY = 0.35;

interface FragileState {
  carried: boolean;
  /** Time since released (after being carried), or time stood on. */
  timer: number;
}

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
  /** Things broken this attempt. */
  breaks = 0;
  progress: Progress = { done: false };
  /** Time the goal was reached, or null. */
  doneAt: number | null = null;
  private lastPosture = "up";
  private lastVel = new Map<RigidBody, Vec>();
  private lastHeld = new Set<RigidBody>();
  private fragile = new Map<RigidBody, FragileState>();
  private rand = rng(1);

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
    this.breaks = 0;
    this.doneAt = null;
    this.fragile.clear();
    this.rand = rng(this.seed);
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
    if (this.stanley.checkTrip(this.tuning, this.rand)) events.push({ type: "trip", pos: this.stanley.rig.head.translation() });

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

    // Bumps and crashes, for sound; fragile things may break.
    const broken: Prop[] = [];
    for (const p of this.props) {
      const v = p.body.linvel();
      const last = this.lastVel.get(p.body);
      const dv = last ? Math.hypot(v.x - last.x, v.y - last.y) : 0;
      if (last && !held.has(p.body) && dv > IMPACT_DV) events.push({ type: "impact", pos: p.body.translation(), strength: dv });
      this.lastVel.set(p.body, { x: v.x, y: v.y });
      if (p.fragile && this.time > 0.5 && this.shouldBreak(p, dv, held.has(p.body))) broken.push(p);
    }
    for (const p of broken) {
      const pos = { ...p.body.translation() };
      this.stanley.letGo(p.body);
      this.lastVel.delete(p.body);
      this.lastHeld.delete(p.body);
      this.fragile.delete(p.body);
      const shards = shatter(this.world, p, this.rand);
      this.props = this.props.filter((q) => q !== p).concat(shards);
      this.breaks++;
      events.push({ type: "break", pos, kind: p.kind });
    }

    if (this.inst.update) events.push(...this.inst.update(this, DT));
    this.progress = this.inst.progress(this);
    if (this.progress.done && this.doneAt === null && !this.level.sandbox) {
      this.doneAt = this.time;
      events.push({ type: "complete" });
    }
    return events;
  }

  /**
   * Fragile things break however you deal with them: bump them, tip them,
   * stand on them, or carry them somewhere and put them down.
   */
  private shouldBreak(p: Prop, dv: number, isHeld: boolean): boolean {
    let st = this.fragile.get(p.body);
    if (!st) this.fragile.set(p.body, (st = { carried: false, timer: 0 }));
    if (isHeld) {
      st.carried = true;
      st.timer = 0;
      return false;
    }
    if (dv > BREAK_DV) return true;
    if (Math.abs(p.body.rotation()) > BREAK_TILT) return true;
    if (this.stanley.balance.standingOn === p.body || st.carried) {
      st.timer += DT;
      return st.timer > (st.carried ? BREAK_AFTER_CARRY : 0.1);
    }
    st.timer = 0;
    return false;
  }
}
