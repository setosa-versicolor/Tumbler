import { DIM, type Side } from "./rig";
import { clamp, limbAngleFor, wrapAngle, type Vec } from "../../sim/math";

const L1 = DIM.upperArm.len;
/** Elbow to hand centre (forearm plus wrist offset). */
const L2 = DIM.foreArm.len + 0.03;
export const ARM_REACH = L1 + L2;

export interface ArmTargets {
  upper: number;
  fore: number;
}

/**
 * Two-bone IK from the shoulder to a world point.
 */
export function reachTargets(shoulder: Vec, target: Vec, facing: 1 | -1, currentUpper?: number): ArmTargets {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const dist = clamp(Math.hypot(dx, dy), 0.08, ARM_REACH - 0.005);
  const phi = Math.atan2(dy, dx);
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  // Two ways to bend an elbow. Prefer whichever is closer to where the upper
  // arm already is, so the elbow doesn't snap to the other side when Stanley
  // turns round (flinging whatever he's holding). With no current pose, bend
  // it downward for targets in front.
  let sign: number = facing;
  if (currentUpper !== undefined) {
    const upperFor = (s: number) => {
      const a = phi - s * Math.acos(cosA);
      return limbAngleFor(Math.cos(a), Math.sin(a));
    };
    sign = Math.abs(wrapAngle(upperFor(1) - currentUpper)) <= Math.abs(wrapAngle(upperFor(-1) - currentUpper)) ? 1 : -1;
  }
  const a1 = phi - sign * Math.acos(cosA);
  const ex = shoulder.x + L1 * Math.cos(a1);
  const ey = shoulder.y + L1 * Math.sin(a1);
  const hx = shoulder.x + dist * Math.cos(phi);
  const hy = shoulder.y + dist * Math.sin(phi);
  return {
    upper: limbAngleFor(Math.cos(a1), Math.sin(a1)),
    fore: limbAngleFor(hx - ex, hy - ey),
  };
}

/**
 * Arms with nothing to do dangle and swing with the run cycle. The swing is
 * deliberately big and lopsided; with weak dangle strength momentum takes
 * over and they flail.
 */
export function relaxedTargets(side: Side, facing: 1 | -1, gaitPhase: number, speedFrac: number, flail: number, airborne: boolean): ArmTargets {
  const off = side === "L" ? 0 : Math.PI;
  const p = gaitPhase + off;
  if (airborne) {
    // Arms fly up and out — the universal "whoa" pose.
    const up = side === "L" ? 2.4 : -2.2;
    return { upper: facing * up, fore: facing * (up + 0.4) };
  }
  const swing = flail * speedFrac * (1.1 * Math.sin(p) + 0.45 * Math.sin(2 * p + 1.3));
  const upper = facing * (-0.1 - swing);
  return { upper, fore: upper + facing * (0.45 + 0.6 * flail * speedFrac * Math.max(0, Math.sin(p))) };
}
