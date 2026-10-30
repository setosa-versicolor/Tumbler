import { clamp } from "../../sim/math";

export interface LegTargets {
  thigh: number;
  shin: number;
}

const STEP_LENGTH = 0.5;
const LEG_SEGMENT = 0.4;

/** Procedural walk cycle. Legs alternate half a cycle apart. */
export class Gait {
  phase = 0;
  speedFrac = 0;

  update(vx: number, moveSpeed: number, dt: number) {
    const target = clamp(Math.abs(vx) / moveSpeed, 0, 1);
    this.speedFrac += (target - this.speedFrac) * Math.min(1, dt * 10);
    // Half a cycle per step, with a minimum cadence so slow shuffles still step.
    const rate = this.speedFrac > 0.05 ? Math.max(Math.abs(vx), 1) / STEP_LENGTH : 0;
    this.phase += rate * Math.PI * dt;
  }

  /** `crouch` is how far (metres) the hips should drop below standing height. */
  targets(leg: 0 | 1, facing: 1 | -1, airborne: boolean, crouch = 0): LegTargets {
    if (airborne) {
      const thigh = facing * (leg === 0 ? 0.7 : 0.25);
      return { thigh, shin: thigh - facing * (leg === 0 ? 1.1 : 0.5) };
    }
    const p = this.phase + leg * Math.PI;
    const amp = this.speedFrac;
    const thigh = facing * (0.6 * amp * Math.sin(p) + (leg === 0 ? 0.06 : -0.06) * (1 - amp));
    const bend = 0.12 + amp * 1.0 * Math.max(0, Math.cos(p));
    // Squat: thigh forward by c, shin back by c, which drops the hip by 2·L·(1 - cos c).
    const c = Math.acos(clamp(1 - crouch / (2 * LEG_SEGMENT), 0, 1));
    return { thigh: thigh + facing * c, shin: thigh - facing * (bend + c) };
  }
}
