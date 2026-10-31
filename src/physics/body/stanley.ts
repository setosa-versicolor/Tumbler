import type { RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { buildRig, chestPoint, DIM, setKneeFacing, type Rig, type Side } from "./rig";
import { ARM_REACH, reachTargets, relaxedTargets } from "./armController";
import { Balance } from "./balance";
import { Gait } from "./gait";
import { Grip } from "./grip";
import { driveAngle } from "./motor";
import { clamp, type Vec } from "../../sim/math";
import { G_FLOOR } from "../groups";
import { DT } from "../world";
import type { Tuning } from "../../sim/tuning";

/** What the player wants this step. The body figures out how. */
export interface Intent {
  /** -1..1 */
  move: number;
  /** True on the step jump was pressed. */
  jump: boolean;
  /** World point the hands reach for, or null to let the arms dangle. */
  reach: Vec | null;
  grip: Record<Side, boolean>;
}

export const IDLE_INTENT: Intent = { move: 0, jump: false, reach: null, grip: { L: false, R: false } };

// Effective inertias for the limb motors (segment plus what hangs off it).
const I_UPPER = 0.35;
const I_FORE = 0.1;
const I_THIGH = 1.0;
const I_SHIN = 0.25;

const SIDES: Side[] = ["L", "R"];
/** Below this speed (m/s) feet never trip. */
const TRIP_SAFE_SPEED = 2.0;

export class Stanley {
  readonly rig: Rig;
  readonly balance = new Balance();
  readonly gait = new Gait();
  readonly grips: Record<Side, Grip>;
  facing: 1 | -1 = 1;
  /** Last reach point, for the eyes to look at. */
  lookAt: Vec | null = null;
  /** How far bent over at the waist, 0..1. */
  private bend = 0;
  private footContacts = new Set<number>();
  private tripCooldown = 0;
  /** 0..1: how flattened Stanley currently is (cannonballs). Drawn, not simulated. */
  squash = 0;

  constructor(private world: World, origin: Vec) {
    this.rig = buildRig(world, origin);
    this.grips = { L: new Grip(this.rig.arms.L.hand, this.rig.arms.L.fore), R: new Grip(this.rig.arms.R.hand, this.rig.arms.R.fore) };
  }

  /**
   * Running fast is risky: when a foot newly catches the side of something
   * that isn't floor (a box, a sock, a step), Stanley may trip and go
   * face-first. Stepping onto things is fine; it's walking into them that
   * gets you. The odds climb with speed; walking is safe. Call after the
   * world steps.
   */
  checkTrip(t: Tuning, rand: () => number): boolean {
    const touching = new Set<number>();
    const groundY = this.rig.pelvis.translation().y - this.balance.groundDist;
    for (const leg of Object.values(this.rig.legs)) {
      const shin = leg.shin.collider(0);
      this.world.contactPairsWith(shin, (other) => {
        if ((other.collisionGroups() >>> 16) & G_FLOOR) return;
        if (this.rig.colliders.has(other.handle)) return;
        // Fixed geometry only trips you if it's a real step up, not a seam.
        const he = !other.parent()?.isDynamic() ? other.halfExtents() : null;
        if (he && other.translation().y + he.y - groundY < 0.12) return;
        this.world.contactPair(shin, other, (m) => {
          if (m.numContacts() > 0 && Math.abs(m.normal().x) > 0.55) touching.add(other.handle);
        });
      });
    }
    const fresh = [...touching].some((h) => !this.footContacts.has(h));
    this.footContacts = touching;
    this.tripCooldown = Math.max(0, this.tripCooldown - DT);
    if (!fresh) return false;
    return this.maybeTrip(0.75, t, rand);
  }

  /**
   * Roll for a trip. `odds` is the chance at full sprint; it falls to zero
   * at walking pace. Used for foot catches and for each stair crossed.
   */
  maybeTrip(odds: number, t: Tuning, rand: () => number): boolean {
    if (this.balance.posture !== "up" || this.tripCooldown > 0 || !this.balance.grounded) return false;
    const speed = Math.abs(this.rig.pelvis.linvel().x);
    const risk = clamp((speed - TRIP_SAFE_SPEED) / (t.moveSpeed - TRIP_SAFE_SPEED), 0, 1);
    if (risk === 0) return false;
    this.tripCooldown = 0.4;
    if (rand() >= risk * odds * t.trippiness) return false;

    // Face-plant: feet stop, top half keeps going.
    const f = Math.sign(this.rig.pelvis.linvel().x) || this.facing;
    this.balance.knockDown(0.7);
    this.rig.chest.applyImpulse({ x: f * this.rig.chest.mass() * 2.2, y: this.rig.chest.mass() * 0.6 }, true);
    this.rig.head.applyImpulse({ x: f * this.rig.head.mass() * 2.5, y: 0 }, true);
    for (const leg of Object.values(this.rig.legs)) leg.shin.applyImpulse({ x: -f * leg.shin.mass() * 2.5, y: leg.shin.mass() * 1.5 }, true);
    return true;
  }

  /** Put Stanley back on his feet at `origin` (feet position), dropping anything held. */
  teleport(origin: Vec) {
    for (const side of SIDES) this.grips[side].release(this.world, 1, this.grips[side === "L" ? "R" : "L"]);
    const p = this.rig.pelvis.translation();
    const dx = origin.x - p.x;
    const dy = origin.y + DIM.standHeight + 0.05 - p.y;
    for (const b of this.rig.bodies) {
      const q = b.translation();
      b.setTranslation({ x: q.x + dx, y: q.y + dy }, true);
      b.setRotation(0, true);
      b.setLinvel({ x: 0, y: 0 }, true);
      b.setAngvel(0, true);
    }
    this.balance.knockDown(0.3);
  }

  /** Drop whatever we're holding of `body` (e.g. it just broke). */
  letGo(body: RigidBody) {
    for (const side of SIDES) {
      const g = this.grips[side];
      if (g.held === body) g.release(this.world, 1, this.grips[side === "L" ? "R" : "L"]);
    }
  }

  get position(): Vec {
    return this.rig.chest.translation();
  }

  get shoulder(): Vec {
    return chestPoint(this.rig, DIM.shoulder);
  }

  step(intent: Intent, t: Tuning, dt: number) {
    const { rig, balance, gait } = this;
    this.squash = Math.max(0, this.squash - dt * 1.6);
    const pv = rig.pelvis.linvel();

    this.updateFacing(intent);
    const { bend, crouch } = this.stoop(intent, dt);
    balance.update(this.world, rig, t, intent.move, this.facing, intent.jump, bend, crouch, dt);
    gait.update(pv.x, t.moveSpeed, dt);

    const airborne = !balance.grounded;
    // Hanging from something: knees up so the legs clear ledges when mantling.
    const hanging = airborne && (this.grips.L.holdingStatic || this.grips.R.holdingStatic);
    const limp = balance.posture === "down" ? 0.15 : balance.posture === "recovering" ? 0.5 : 1;

    // Legs
    const legStrength = t.legStrength * limp;
    (["L", "R"] as const).forEach((side, i) => {
      const leg = rig.legs[side];
      const lt = hanging
        ? { thigh: this.facing * 1.7, shin: this.facing * (1.7 - 2.3) }
        : gait.targets(i as 0 | 1, this.facing, airborne, crouch);
      driveAngle(leg.thigh, lt.thigh, I_THIGH, 18, 0.9, legStrength, dt, rig.pelvis);
      driveAngle(leg.shin, lt.shin, I_SHIN, 18, 0.9, legStrength * 0.7, dt, leg.thigh);
    });

    // Arms
    const shoulder = this.shoulder;
    this.lookAt = intent.reach;
    for (const side of SIDES) {
      const arm = rig.arms[side];
      let targets;
      let strength;
      if (intent.reach) {
        // The back arm aims a touch lower so the two hands don't sit on top of each other.
        const r = side === "L" ? { x: intent.reach.x, y: intent.reach.y - 0.06 } : intent.reach;
        targets = reachTargets(shoulder, r, this.facing, arm.upper.rotation());
        strength = t.armStrength * (side === "L" ? 0.92 : 1);
      } else {
        targets = relaxedTargets(side, this.facing, gait.phase, gait.speedFrac, t.flail, airborne);
        strength = t.armStrength * t.armRelaxed;
      }
      strength *= limp;
      driveAngle(arm.upper, targets.upper, I_UPPER, t.armStiffness, t.armDamping, strength, dt, rig.chest);
      driveAngle(arm.fore, targets.fore, I_FORE, t.armStiffness, t.armDamping, strength * 0.8, dt, arm.upper);
    }

    // Grips
    const chestY = this.rig.pelvis.translation().y + 0.35;
    this.grips.L.update(this.world, intent.grip.L && limp > 0.2, this.grips.R, t.throwAssist, chestY);
    this.grips.R.update(this.world, intent.grip.R && limp > 0.2, this.grips.L, t.throwAssist, chestY);
    this.climb(intent, t, dt);
  }

  /**
   * Hanging from something static: the hand stays put, so moving the reach
   * point moves the body instead. Reach down (push on the ledge) to haul
   * yourself up, reach up to hang.
   */
  private climb(intent: Intent, t: Tuning, dt: number) {
    const anchors = SIDES.map((s) => this.grips[s]).filter((g) => g.holdingStatic).map((g) => g.anchorWorld()!);
    if (!anchors.length || !intent.reach || this.balance.posture === "down") return;
    const shoulder = this.shoulder;
    const ax = anchors.reduce((s, a) => s + a.x, 0) / anchors.length;
    const ay = anchors.reduce((s, a) => s + a.y, 0) / anchors.length;
    const dx = intent.reach.x - shoulder.x;
    const dy = intent.reach.y - shoulder.y;
    const len = Math.hypot(dx, dy) || 1;
    // Pushing down on a ledge presses the body up past arm's length (a mantle),
    // so Stanley can get his legs up and over.
    const press = clamp(-dy / len, 0, 1);
    const d = Math.min(len, ARM_REACH) + 0.8 * press;
    const want = { x: ax - (dx / len) * d + intent.move * 0.5, y: ay - (dy / len) * d };
    const M = this.rig.totalMass;
    const v = this.rig.chest.linvel();
    // Running while hanging swings the legs that way.
    const pv = this.rig.pelvis.linvel();
    const swing = clamp(5 * (intent.move * 1.5 - pv.x), -8, 8);
    this.rig.pelvis.applyImpulse({ x: M * swing * dt, y: 0 }, true);
    const k = 40;
    const c = 2 * 0.8 * Math.sqrt(k);
    const cap = t.gravity * 1.7 * (t.armStrength / 55) * (anchors.length / 2 + 0.5);
    const fx = clamp(k * (want.x - shoulder.x) - c * v.x, -cap, cap);
    const fy = clamp(k * (want.y - shoulder.y) - c * v.y, -cap, cap);
    this.rig.chest.applyImpulse({ x: M * fx * dt, y: M * fy * dt }, true);
  }

  /**
   * Reaching below the hips bends Stanley over and squats him down. The bend
   * eases in and out; snapping straight to it would read as falling over.
   */
  private stoop(intent: Intent, dt: number): { bend: number; crouch: number } {
    let target = 0;
    if (intent.reach && this.balance.posture === "up" && this.balance.grounded) {
      const p = this.rig.pelvis.translation();
      const low = clamp((p.y + 0.05 - intent.reach.y) / 0.75, 0, 1);
      const near = clamp(2.2 - Math.abs(intent.reach.x - p.x), 0, 1);
      target = low * near;
    }
    this.bend += clamp(target - this.bend, -dt * 3, dt * 3);
    return { bend: this.bend, crouch: this.bend * 0.3 };
  }

  private updateFacing(intent: Intent) {
    let f = this.facing;
    if (Math.abs(intent.move) > 0.2) f = intent.move > 0 ? 1 : -1;
    else if (intent.reach) {
      const dx = intent.reach.x - this.position.x;
      if (Math.abs(dx) > 0.35) f = dx > 0 ? 1 : -1;
    }
    if (f !== this.facing) {
      this.facing = f;
      setKneeFacing(this.rig, f);
    }
  }
}
