import { DIM, type Side } from "./rig";
import { clamp, limbAngleFor, type Vec } from "../../sim/math";

const L1 = DIM.upperArm.len;
/** Elbow to hand centre (forearm plus wrist offset). */
const L2 = DIM.foreArm.len + 0.03;
export const ARM_REACH = L1 + L2;

export interface ArmTargets {
  upper: number;
  fore: number;
}

/**
 * Two-bone IK from the shoulder to a world point. The elbow bends downward
 * for targets in front of Stanley and upward for targets behind, which keeps
 * it from popping between solutions near straight up.
 */
export function reachTargets(shoulder: Vec, target: Vec, facing: 1 | -1): ArmTargets {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const dist = clamp(Math.hypot(dx, dy), 0.08, ARM_REACH - 0.005);
  const phi = Math.atan2(dy, dx);
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const a1 = phi - facing * Math.acos(cosA);
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
