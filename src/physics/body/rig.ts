import { RAPIER } from "../world";
import type { Collider, ImpulseJoint, RevoluteImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { ARM_GROUPS, BODY_GROUPS } from "../groups";
import type { Vec } from "../../sim/math";

// Tumbler's 13-part ragdoll. Built standing with feet on `origin`.
// Limb capsules run along local Y; proximal end at +Y, distal at -Y, so an
// angle of 0 means "hanging straight down".

export const DIM = {
  shin: { len: 0.4, r: 0.075 },
  thigh: { len: 0.4, r: 0.085 },
  pelvis: { hh: 0.06, r: 0.15 },
  chest: { hh: 0.13, r: 0.18 },
  head: { r: 0.21 },
  upperArm: { len: 0.32, r: 0.06 },
  foreArm: { len: 0.3, r: 0.055 },
  hand: { r: 0.075 },
  /** Pelvis centre height when standing on flat ground. */
  standHeight: 0.935,
  /** Shoulder joint, in chest-local coordinates. */
  shoulder: { x: 0, y: 0.14 },
} as const;

const MASS = { head: 5, chest: 22, pelvis: 12, upperArm: 2.5, foreArm: 1.8, hand: 0.5, thigh: 6, shin: 4 };

export type Side = "L" | "R";

export interface Arm {
  upper: RigidBody;
  fore: RigidBody;
  hand: RigidBody;
  handCollider: Collider;
}

export interface Leg {
  thigh: RigidBody;
  shin: RigidBody;
  knee: RevoluteImpulseJoint;
}

export interface Rig {
  head: RigidBody;
  chest: RigidBody;
  pelvis: RigidBody;
  arms: Record<Side, Arm>;
  legs: Record<Side, Leg>;
  bodies: RigidBody[];
  joints: ImpulseJoint[];
  /** Collider handles belonging to Tumbler, for filtering. */
  colliders: Set<number>;
  totalMass: number;
}

export function buildRig(world: World, origin: Vec): Rig {
  const bodies: RigidBody[] = [];
  const joints: ImpulseJoint[] = [];
  const colliders = new Set<number>();

  const part = (y: number, shape: InstanceType<typeof RAPIER.ColliderDesc>, mass: number, friction = 0.6, collision = BODY_GROUPS) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y + y)
        .setLinearDamping(0.05)
        .setAngularDamping(0.5)
        .setCcdEnabled(true),
    );
    const col = world.createCollider(
      shape.setMass(mass).setFriction(friction).setRestitution(0.05).setCollisionGroups(collision),
      body,
    );
    colliders.add(col.handle);
    bodies.push(body);
    return { body, col };
  };

  const limb = (yProx: number, len: number, r: number, mass: number, friction = 0.6, collision = BODY_GROUPS) =>
    part(yProx - len / 2, RAPIER.ColliderDesc.capsule(len / 2, r), mass, friction, collision);

  // Joint at a world height; bodies are unrotated at build time so local = world - centre.
  const joint = (a: RigidBody, b: RigidBody, y: number, limits?: [number, number]) => {
    const pa = a.translation();
    const pb = b.translation();
    const wy = origin.y + y;
    const data = RAPIER.JointData.revolute({ x: origin.x - pa.x, y: wy - pa.y }, { x: origin.x - pb.x, y: wy - pb.y });
    const j = world.createImpulseJoint(data, a, b, true) as RevoluteImpulseJoint;
    j.setContactsEnabled(false);
    if (limits) j.setLimits(limits[0], limits[1]);
    joints.push(j);
    return j;
  };

  const kneeY = DIM.shin.len + DIM.shin.r;
  const hipY = kneeY + DIM.thigh.len;
  const pelvisY = DIM.standHeight;
  const spineY = pelvisY + 0.1;
  const chestY = spineY + 0.16;
  const shoulderY = chestY + DIM.shoulder.y;
  const neckY = chestY + 0.28;
  const elbowY = shoulderY - DIM.upperArm.len;
  const wristY = elbowY - DIM.foreArm.len;

  const pelvis = part(pelvisY, RAPIER.ColliderDesc.capsule(DIM.pelvis.hh, DIM.pelvis.r), MASS.pelvis).body;
  const chest = part(chestY, RAPIER.ColliderDesc.capsule(DIM.chest.hh, DIM.chest.r), MASS.chest).body;
  const head = part(neckY + 0.2, RAPIER.ColliderDesc.ball(DIM.head.r), MASS.head).body;
  joint(pelvis, chest, spineY, [-0.6, 0.6]);
  joint(chest, head, neckY, [-0.6, 0.6]);

  const makeLeg = (): Leg => {
    const thigh = limb(hipY, DIM.thigh.len, DIM.thigh.r, MASS.thigh).body;
    const shin = limb(kneeY, DIM.shin.len, DIM.shin.r, MASS.shin, 0.9).body;
    joint(pelvis, thigh, hipY, [-2.0, 2.0]);
    const knee = joint(thigh, shin, kneeY, [-2.5, 0.05]);
    return { thigh, shin, knee };
  };

  const makeArm = (): Arm => {
    const upper = limb(shoulderY, DIM.upperArm.len, DIM.upperArm.r, MASS.upperArm, 0.6, ARM_GROUPS).body;
    const fore = limb(elbowY, DIM.foreArm.len, DIM.foreArm.r, MASS.foreArm, 0.6, ARM_GROUPS).body;
    const hand = part(wristY - 0.03, RAPIER.ColliderDesc.ball(DIM.hand.r), MASS.hand, 1.2);
    joint(chest, upper, shoulderY);
    joint(upper, fore, elbowY, [-2.7, 2.7]);
    joint(fore, hand.body, wristY, [-0.6, 0.6]);
    return { upper, fore, hand: hand.body, handCollider: hand.col };
  };

  const legs = { L: makeLeg(), R: makeLeg() };
  const arms = { L: makeArm(), R: makeArm() };

  const totalMass = bodies.reduce((m, b) => m + b.mass(), 0);
  return { head, chest, pelvis, arms, legs, bodies, joints, colliders, totalMass };
}

/** Knees only bend one way, so their limits flip with facing. */
export function setKneeFacing(rig: Rig, facing: 1 | -1) {
  for (const leg of Object.values(rig.legs)) {
    if (facing > 0) leg.knee.setLimits(-2.5, 0.05);
    else leg.knee.setLimits(-0.05, 2.5);
  }
}

/** World position of a chest-local point. */
export function chestPoint(rig: Rig, local: Vec): Vec {
  const p = rig.chest.translation();
  const a = rig.chest.rotation();
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x + local.x * c - local.y * s, y: p.y + local.x * s + local.y * c };
}
