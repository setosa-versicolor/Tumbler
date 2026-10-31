import type { RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { createWorld, DT } from "../physics/world";
import { Stanley, type Intent } from "../physics/body/stanley";
import { Kit, shatter, type Button, type Flight, type Prop, type Solid, type Water } from "../levels/kit";
import type { Level, LevelInstance, Progress } from "../levels/level";
import type { Tuning } from "./tuning";
import type { Twist, TwistInstance } from "../levels/twists";
import { clamp, rng, wrapAngle, type Vec } from "./math";

export type GameEvent =
  | { type: "press" }
  | { type: "score"; text: string; pos: Vec }
  | { type: "fall"; pos: Vec }
  | { type: "trip"; pos: Vec }
  | { type: "splash"; pos: Vec; big: boolean }
  | { type: "impact"; pos: Vec; strength: number }
  | { type: "throw"; speed: number }
  | { type: "break"; pos: Vec; kind: string }
  /** Someone noticed one of the little surprises in a level. */
  | { type: "surprise"; id: string; text: string; pos: Vec }
  /** An Overtime twist did something to Stanley (a cannonball, a goblin, a slip). */
  | { type: "ouch"; text: string; pos: Vec }
  /** A sound cue with no other effect (a cannon firing, a rumble). */
  | { type: "sfx"; name: string; pos?: Vec }
  | { type: "complete" };

/** Sudden velocity change (m/s) on a prop that counts as an audible bump. */
const IMPACT_DV = 2.2;
/** Told about props found with no body (see pruneStale); the app logs it. */
export let onStale: (level: string, kinds: string[], when: string) => void = () => {};
export function setOnStale(fn: typeof onStale) {
  onStale = fn;
}

/** A bump this hard breaks a fragile thing. */
const BREAK_DV = 1.5;
/** Tipped this far (radians), a fragile thing is done for. */
const BREAK_TILT = 0.9;
/** Chance per stair crossed at full sprint of tripping (Stanley's feet glide on a hidden ramp, so stairs need their own check). */
const STAIR_TRIP_ODDS = 0.3;
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
  flights: Flight[] = [];
  waters: Water[] = [];
  private underwater = 0;
  private wet = new Set<RigidBody>();
  /** Which stair Stanley is on (flight index * 1000 + step), or null. */
  private stair: number | null = null;
  inst!: LevelInstance;
  /** Seconds since the level started. */
  time = 0;
  /** Times Stanley fell over this attempt. */
  falls = 0;
  /** Things broken this attempt. */
  breaks = 0;
  /** What the player asked for this step (levels use it to notice where you're pointing). */
  intent: Intent = { move: 0, jump: false, reach: null, grip: { L: false, R: false } };
  /** Surprises already set off this attempt. */
  private surprises = new Set<string>();
  progress: Progress = { done: false };
  /** Time the goal was reached, or null. */
  doneAt: number | null = null;
  private lastPosture = "up";
  private lastVel = new Map<RigidBody, Vec>();
  private lastHeld = new Set<RigidBody>();
  private fragile = new Map<RigidBody, FragileState>();
  /** Seeded randomness for the sim (shards, trips, slippery fish). */
  rand = rng(1);

  /** Overtime: an extra complication layered over the level. */
  twist: TwistInstance | null = null;

  constructor(
    public tuning: Tuning,
    public level: Level,
    private seed = 1,
    private twistDef: Twist | null = null,
  ) {
    this.reset();
  }

  reset() {
    this.free();
    this.world = createWorld(this.tuning.gravity);
    const kit = new Kit(this.world, this.seed);
    this.inst = this.level.build(kit);
    this.props = kit.props;
    this.solids = kit.solids;
    this.buttons = kit.buttons;
    this.flights = kit.flights;
    this.waters = kit.waters;
    this.underwater = 0;
    this.wet = new Set();
    this.stair = null;
    this.stanley = new Stanley(this.world, this.level.spawn);
    this.time = 0;
    this.falls = 0;
    this.breaks = 0;
    this.surprises = new Set();
    this.doneAt = null;
    this.fragile.clear();
    this.rand = rng(this.seed);
    this.twist = this.twistDef ? this.twistDef.start(this) : null;
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

  /**
   * Drop any prop whose body is no longer in the world. Touching such a body
   * crashes the physics engine outright, so this is checked on the JS side
   * (no call into the engine). It shouldn't happen; if it does, it's logged
   * with what it was, so it can be tracked down.
   */
  pruneStale(): string[] {
    const stale = this.props.filter((p) => this.world.getRigidBody(p.body.handle) !== p.body);
    if (!stale.length) return [];
    for (const p of stale) {
      this.lastVel.delete(p.body);
      this.lastHeld.delete(p.body);
      this.fragile.delete(p.body);
    }
    this.props = this.props.filter((p) => !stale.includes(p));
    return stale.map((p) => p.kind);
  }

  step(intent: Intent): GameEvent[] {
    const events: GameEvent[] = [];
    const stale = this.pruneStale();
    if (stale.length) onStale(this.level.id, stale, "before a step");
    this.world.gravity = { x: 0, y: -this.tuning.gravity };
    this.intent = intent;
    this.stanley.step(intent, this.tuning, DT);
    this.world.step();
    this.time += DT;
    const stair = this.currentStair();
    const crossedStair = stair !== null && this.stair !== null && stair !== this.stair;
    this.stair = stair;
    if (
      this.stanley.checkTrip(this.tuning, this.rand) ||
      (crossedStair && this.stanley.maybeTrip(STAIR_TRIP_ODDS, this.tuning, this.rand))
    ) {
      events.push({ type: "trip", pos: this.stanley.rig.head.translation() });
    }

    for (const b of this.buttons) if (b.update(DT)) events.push({ type: "press" });

    const posture = this.stanley.balance.posture;
    if (posture === "down" && this.lastPosture !== "down") {
      this.falls++;
      events.push({ type: "fall", pos: this.stanley.rig.head.translation() });
    }
    this.lastPosture = posture;

    // Throws: something we were holding just left the hand, fast.
    const held = this.held;
    for (const p of this.props) if (p.keepLevel && held.has(p.body)) this.level_(p);
    for (const b of this.lastHeld) {
      if (held.has(b)) continue;
      const v = b.linvel();
      const speed = Math.hypot(v.x, v.y);
      if (speed > 4.5) events.push({ type: "throw", speed });
    }
    this.lastHeld = held;

    events.push(...this.swim());

    // Bumps and crashes, for sound; fragile things may break.
    const broken: Prop[] = [];
    for (const p of this.props) {
      const v = p.body.linvel();
      const last = this.lastVel.get(p.body);
      const dv = last ? Math.hypot(v.x - last.x, v.y - last.y) : 0;
      if (last && !held.has(p.body) && dv > IMPACT_DV) events.push({ type: "impact", pos: p.body.translation(), strength: dv });
      this.lastVel.set(p.body, { x: v.x, y: v.y });
      if (p.fragile && this.time > 0.5 && !this.inst.safe?.(p) && !this.twist?.safe?.(p, this) && this.shouldBreak(p, dv, held.has(p.body))) broken.push(p);
    }
    for (const p of broken) {
      const pos = { ...p.body.translation() };
      this.forget(p);
      const shards = shatter(this.world, p, this.rand);
      this.props = this.props.filter((q) => q !== p).concat(shards);
      this.breaks++;
      events.push({ type: "break", pos, kind: p.kind });
    }

    if (this.twist) events.push(...this.twist.update(this, DT));
    for (const ev of this.inst.update?.(this, DT) ?? []) {
      if (ev.type === "surprise") {
        if (this.surprises.has(ev.id)) continue;
        this.surprises.add(ev.id);
      }
      events.push(ev);
    }
    // Anything that's fallen out of the world is tidied away.
    for (const p of [...this.props]) {
      const q = p.body.translation();
      if (q.y < -20 || Math.abs(q.x) > 200) this.removeProp(p);
    }
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
    if (dv > (p.toughness ?? BREAK_DV)) return true;
    if (Math.abs(p.body.rotation()) > BREAK_TILT) return true;
    if (this.stanley.balance.standingOn === p.body || st.carried) {
      st.timer += DT;
      return st.timer > (st.carried ? BREAK_AFTER_CARRY : 0.1);
    }
    st.timer = 0;
    return false;
  }

  /** The stair under Stanley's hips, if he's standing on a flight. */
  private currentStair(): number | null {
    const st = this.stanley;
    if (!st.balance.grounded) return null;
    const p = st.rig.pelvis.translation();
    for (let i = 0; i < this.flights.length; i++) {
      const f = this.flights[i];
      const step = Math.floor((p.x - f.x0) / f.run);
      if (step < 0 || step >= f.steps) continue;
      // On the flight, not under it.
      if (p.y - st.balance.groundDist > f.y0 - 0.1) return i * 1000 + step;
    }
    return null;
  }

  /** Float things in water; fish Stanley out and put him back on the dock. */
  private swim(): GameEvent[] {
    const events: GameEvent[] = [];
    if (!this.waters.length) return events;
    const g = this.tuning.gravity;
    const inWater = (x: number) => this.waters.find((w) => x > w.x0 && x < w.x1);
    for (const p of this.props) {
      const pos = p.body.translation();
      const w = inWater(pos.x);
      const depth = w ? clamp((w.y - (pos.y - p.hh)) / (2 * p.hh), 0, 1) : 0;
      if (depth > 0 && w) {
        // Everything floats here. It's that kind of harbour.
        const m = p.body.mass();
        const v = p.body.linvel();
        p.body.applyImpulse({ x: -v.x * m * 2 * depth * DT, y: (m * g * 1.6 * depth - v.y * m * 3 * depth) * DT }, true);
        p.body.setAngvel(p.body.angvel() * (1 - 2 * depth * DT), true);
        if (!this.wet.has(p.body)) {
          this.wet.add(p.body);
          if (v.y < -1) events.push({ type: "splash", pos: { x: pos.x, y: w.y }, big: false });
        }
      } else this.wet.delete(p.body);
    }
    const st = this.stanley;
    const pel = st.rig.pelvis.translation();
    const w = inWater(pel.x);
    this.underwater = w && pel.y < w.y + 0.2 ? this.underwater + DT : 0;
    if (w && this.underwater > 0.35) {
      this.underwater = 0;
      // (The respawn knocks Stanley down, which counts as the fall.)
      events.push({ type: "splash", pos: { x: pel.x, y: w.y }, big: true });
      st.teleport(this.level.spawn);
    }
    return events;
  }

  /** A careful carry: a held tray leans back toward level, but only so hard. */
  private level_(p: Prop) {
    const b = p.body;
    const torque = clamp(-25 * wrapAngle(b.rotation()) - 1.5 * b.angvel(), -15, 15);
    b.applyTorqueImpulse(torque * DT, true);
  }

  /** Stop tracking a prop that's about to leave the world (dropping it if held). */
  private forget(p: Prop) {
    this.stanley.letGo(p.body);
    this.lastVel.delete(p.body);
    this.lastHeld.delete(p.body);
    this.fragile.delete(p.body);
  }

  /**
   * Free the physics world (it lives in WebAssembly memory, which isn't
   * garbage-collected): every level load makes a new one, and without this
   * they pile up until the physics engine runs out of memory and crashes.
   */
  free() {
    this.world?.free();
    this.world = undefined!;
  }

  /** Take a prop out of the level entirely (fed into a shredder, say). */
  removeProp(p: Prop) {
    this.forget(p);
    this.world.removeRigidBody(p.body);
    this.props = this.props.filter((q) => q !== p);
  }
}
