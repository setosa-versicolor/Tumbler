import type { World } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER } from "../world";
import { ENV_QUERY } from "../groups";
import { DIM, type Rig } from "./rig";
import { driveAngle } from "./motor";
import { clamp, wrapAngle } from "../../sim/math";
import type { Tuning } from "../../sim/tuning";

export type Posture = "up" | "down" | "recovering";

const HOVER_HEIGHT = DIM.standHeight - 0.04;
const HOVER_RANGE = DIM.standHeight + 0.18;
const DOWN_TIME = 0.75;
const RECOVER_TIME = 0.55;

/**
 * Keeps Stanley standing. Rather than balancing on real feet (hard, and not
 * the fun part), a spring under the pelvis holds the body at standing height
 * and torques keep the torso upright. All of it is scaled by `stability`, so
 * a hard hit or a big lean drops Stanley in a heap until he picks himself up.
 */
export class Balance {
  posture: Posture = "up";
  stability = 1;
  grounded = false;
  /** Height of the pelvis above whatever is under it. */
  groundDist = Infinity;
  private timer = 0;
  private lastChestVel = { x: 0, y: 0 };
  private jumpCooldown = 0;

  knockDown(time = DOWN_TIME) {
    this.posture = "down";
    this.timer = time;
  }

  /**
   * `bend` (0..1) folds the torso forward at the waist and `crouch` (metres)
   * lowers the hips, so the hands can reach things on the floor.
   */
  update(world: World, rig: Rig, t: Tuning, move: number, facing: 1 | -1, jump: boolean, bend: number, crouch: number, dt: number) {
    const M = rig.totalMass;
    const chest = rig.chest;
    const pelvis = rig.pelvis;

    // --- Posture state ---------------------------------------------------
    const cv = chest.linvel();
    const hit = Math.hypot(cv.x - this.lastChestVel.x, cv.y - this.lastChestVel.y);
    this.lastChestVel = { x: cv.x, y: cv.y };
    const lean = -facing * (0.12 * clamp(Math.abs(move), 0, 1) * (1 - bend) + 1.05 * bend);
    // Tilt is measured against the lean we asked for, so bending over isn't falling over.
    const tilt = Math.abs(wrapAngle(chest.rotation() - lean));

    if (this.posture === "up" && (tilt > t.fallTilt || hit > t.knockdown)) this.knockDown();
    if (this.posture === "down") {
      this.timer -= dt;
      this.stability = 0.04;
      if (this.timer <= 0) {
        this.posture = "recovering";
        this.timer = RECOVER_TIME;
      }
    } else if (this.posture === "recovering") {
      this.timer -= dt;
      this.stability = clamp(1 - this.timer / RECOVER_TIME, 0.1, 1);
      if (this.timer <= 0 && tilt < 0.5 + bend) this.posture = "up";
    } else {
      this.stability = Math.min(1, this.stability + dt * 2);
    }
    const s = this.stability * t.balance;

    // --- Ground probe ------------------------------------------------------
    const p = pelvis.translation();
    const ray = new RAPIER.Ray({ x: p.x, y: p.y }, { x: 0, y: -1 });
    const rh = world.castRay(ray, HOVER_RANGE, true, undefined, ENV_QUERY);
    this.groundDist = rh ? rh.timeOfImpact : Infinity;
    this.grounded = this.groundDist < HOVER_RANGE;

    // --- Hover spring under the pelvis --------------------------------------
    if (rh && this.grounded) {
      const pv = pelvis.linvel();
      const k = 140;
      const c = 2 * 0.9 * Math.sqrt(k);
      const accel = clamp(t.gravity + k * (HOVER_HEIGHT - crouch - this.groundDist) - c * pv.y, 0, 3 * t.gravity);
      const f = M * accel * Math.min(1, s);
      pelvis.applyImpulse({ x: 0, y: f * dt }, true);
      // Push down on whatever we stand on, so standing on a box squashes it into the floor
      // and standing on a ball rolls it away.
      const under = rh.collider.parent();
      if (under?.isDynamic()) {
        under.applyImpulseAtPoint({ x: 0, y: -f * dt }, { x: p.x, y: p.y - rh.timeOfImpact }, true);
      }
    }

    // --- Upright torques ------------------------------------------------------
    const maxT = 450 * s;
    driveAngle(chest, lean, 1.4, 14, 1, maxT, dt);
    driveAngle(pelvis, lean * 0.45, 0.7, 14, 1, maxT * 0.6, dt);
    driveAngle(rig.head, lean * 0.6, 0.08, 9, 0.8, 12 * s, dt, chest);

    // --- Running -------------------------------------------------------------
    const pv = pelvis.linvel();
    const control = (this.grounded ? 1 : 0.25) * Math.min(1, s * 1.5);
    const ax = clamp(7 * (move * t.moveSpeed - pv.x), -22, 22) * control;
    pelvis.applyImpulse({ x: M * ax * dt, y: 0 }, true);

    // --- Jump ----------------------------------------------------------------
    this.jumpCooldown -= dt;
    if (jump && this.grounded && this.posture === "up" && this.jumpCooldown <= 0) {
      this.jumpCooldown = 0.35;
      for (const b of rig.bodies) b.applyImpulse({ x: 0, y: b.mass() * t.jumpSpeed }, true);
      // Our own jump isn't a hit.
      this.lastChestVel.y += t.jumpSpeed;
    }
  }
}
