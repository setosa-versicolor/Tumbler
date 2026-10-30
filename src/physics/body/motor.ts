import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import { clamp, wrapAngle } from "../../sim/math";

/**
 * PD "muscle": torque a body toward a world angle, capped at `maxTorque`.
 * Gains are scaled by an estimated effective inertia so ω0/ζ read as
 * frequency and damping ratio. When `parent` is given the opposite torque is
 * applied to it, like a real joint motor — fast arm swings make the torso lurch.
 */
export function driveAngle(
  body: RigidBody,
  target: number,
  inertia: number,
  omega0: number,
  zeta: number,
  maxTorque: number,
  dt: number,
  parent?: RigidBody,
) {
  const err = wrapAngle(target - body.rotation());
  const w = body.angvel();
  const torque = clamp(inertia * (omega0 * omega0 * err - 2 * zeta * omega0 * w), -maxTorque, maxTorque);
  body.applyTorqueImpulse(torque * dt, true);
  parent?.applyTorqueImpulse(-torque * dt, true);
  return torque;
}
