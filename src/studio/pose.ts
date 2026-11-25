import { DIM, type Side } from "../physics/body/rig";
import type { Game } from "../sim/game";
import type { Vec } from "../sim/math";

// Stanley in a fixed pose, for the character studio: stand-in bodies placed
// exactly where the physics rig's joints would put them (same anchors, same
// lengths), so whatever's drawn here sits on the real ragdoll the same way.

/** Absolute angles (radians; 0 = hanging straight down, + swings the lower end forward when facing right). */
export interface Pose {
  name: string;
  facing: 1 | -1;
  /** Lean of everything (lying down, say). */
  tilt?: number;
  /** Hips raised (+) or lowered (-) from standing height. */
  lift?: number;
  pelvis?: number;
  chest?: number;
  head?: number;
  arms: Record<Side, { upper: number; fore: number; hand?: number; grip?: boolean }>;
  legs: Record<Side, { thigh: number; shin: number }>;
  posture?: "up" | "down" | "recovering";
  grounded?: boolean;
  /** Where he's looking, relative to his head. */
  look?: Vec;
  /** Holding something heavy (the strained face). */
  heavy?: boolean;
}

class Body {
  constructor(
    private p: Vec,
    private a: number,
  ) {}
  translation() {
    return this.p;
  }
  rotation() {
    return this.a;
  }
  isDynamic() {
    return true;
  }
}

const rot = (a: number, v: Vec): Vec => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

/** Build a stand-in game holding Stanley in `pose`, standing at `at` (feet on the ground at at.y). */
export function posed(pose: Pose, at: Vec = { x: 0, y: 0 }): Game {
  const f = pose.facing;
  const t = pose.tilt ?? 0;
  // Angles are given facing right; facing left mirrors them.
  const A = (a = 0) => a * f + t;
  const kneeY = DIM.shin.len + DIM.shin.r;
  const hipY = kneeY + DIM.thigh.len;
  const pelvisC = { x: at.x, y: at.y + DIM.standHeight + (pose.lift ?? 0) };
  const pa = A(pose.pelvis);
  const pelvis = new Body(pelvisC, pa);
  const spine = add(pelvisC, rot(pa, { x: 0, y: 0.1 }));
  const ca = A(pose.chest);
  const chestC = add(spine, rot(ca, { x: 0, y: 0.16 }));
  const chest = new Body(chestC, ca);
  const neck = add(chestC, rot(ca, { x: 0, y: 0.28 }));
  const ha = A(pose.head);
  const head = new Body(add(neck, rot(ha, { x: 0, y: 0.2 })), ha);
  const hip = add(pelvisC, rot(pa, { x: 0, y: hipY - DIM.standHeight }));
  const shoulder = add(chestC, rot(ca, { x: 0, y: DIM.shoulder.y }));

  const arm = (s: Side) => {
    const q = pose.arms[s];
    const ua = A(q.upper);
    const upper = new Body(add(shoulder, rot(ua, { x: 0, y: -DIM.upperArm.len / 2 })), ua);
    const elbow = add(shoulder, rot(ua, { x: 0, y: -DIM.upperArm.len }));
    const fa = A(q.fore);
    const fore = new Body(add(elbow, rot(fa, { x: 0, y: -DIM.foreArm.len / 2 })), fa);
    const wrist = add(elbow, rot(fa, { x: 0, y: -DIM.foreArm.len }));
    const hda = A(q.hand ?? q.fore);
    const hand = new Body(add(wrist, rot(hda, { x: 0, y: -0.03 })), hda);
    return { upper, fore, hand };
  };
  const leg = (s: Side) => {
    const q = pose.legs[s];
    const ta = A(q.thigh);
    const thigh = new Body(add(hip, rot(ta, { x: 0, y: -DIM.thigh.len / 2 })), ta);
    const knee = add(hip, rot(ta, { x: 0, y: -DIM.thigh.len }));
    const sa = A(q.shin);
    const shin = new Body(add(knee, rot(sa, { x: 0, y: -DIM.shin.len / 2 })), sa);
    return { thigh, shin };
  };
  const grip = (s: Side) => ({ held: pose.arms[s].grip ? { isDynamic: () => !!pose.heavy } : null });
  const headP = head.translation();
  const look = pose.look ?? { x: 1, y: -0.1 };
  const stanley = {
    facing: f,
    rig: { head, chest, pelvis, arms: { L: arm("L"), R: arm("R") }, legs: { L: leg("L"), R: leg("R") } },
    grips: { L: grip("L"), R: grip("R") },
    balance: { posture: pose.posture ?? "up", grounded: pose.grounded ?? true, groundDist: 0.935 },
    lookAt: { x: headP.x + look.x * f, y: headP.y + look.y },
    position: pelvisC,
    squash: 0,
  };
  return { stanley } as unknown as Game;
}

const still = { upper: 0.06, fore: 0.14 };
const legsStraight = { L: { thigh: 0, shin: 0 }, R: { thigh: 0, shin: 0 } };

export const POSES: Pose[] = [
  { name: "Standing", facing: 1, arms: { L: still, R: { upper: -0.04, fore: 0.06 } }, legs: { L: { thigh: -0.06, shin: -0.06 }, R: { thigh: 0.08, shin: 0.02 } } },
  {
    name: "Walking",
    facing: 1,
    chest: 0.06,
    arms: { L: { upper: 0.45, fore: 0.9 }, R: { upper: -0.5, fore: -0.15 } },
    legs: { L: { thigh: -0.4, shin: -0.85 }, R: { thigh: 0.42, shin: 0.12 } },
  },
  {
    name: "Reaching up, gripping",
    facing: 1,
    chest: -0.05,
    look: { x: 0.5, y: 1 },
    arms: { L: { upper: 2.55, fore: 2.8, grip: true }, R: { upper: 2.75, fore: 2.95, grip: true } },
    legs: legsStraight,
  },
  {
    name: "Carrying (heavy)",
    facing: 1,
    chest: -0.08,
    heavy: true,
    arms: { L: { upper: 0.9, fore: 1.6, grip: true }, R: { upper: 1.0, fore: 1.65, grip: true } },
    legs: { L: { thigh: -0.15, shin: -0.25 }, R: { thigh: 0.2, shin: -0.05 } },
  },
  {
    name: "In the air",
    facing: 1,
    grounded: false,
    chest: 0.12,
    look: { x: 0.6, y: -0.8 },
    arms: { L: { upper: 2.3, fore: 1.6 }, R: { upper: -2.4, fore: -1.6 } },
    legs: { L: { thigh: 0.9, shin: -0.3 }, R: { thigh: -0.2, shin: -1.3 } },
  },
  {
    name: "Facing left",
    facing: -1,
    arms: { L: { upper: -0.04, fore: 0.06 }, R: still },
    legs: { L: { thigh: 0.08, shin: 0.02 }, R: { thigh: -0.06, shin: -0.06 } },
  },
  {
    name: "Bending to pick up",
    facing: 1,
    pelvis: 0.25,
    chest: 1.05,
    head: 0.7,
    look: { x: 0.6, y: -1 },
    arms: { L: { upper: 0.9, fore: 0.7 }, R: { upper: 0.6, fore: 0.4 } },
    legs: { L: { thigh: 0.35, shin: -0.55 }, R: { thigh: 0.6, shin: -0.4 } },
  },
  {
    name: "Knocked down",
    facing: 1,
    tilt: 1.45,
    lift: -0.74,
    posture: "down",
    arms: { L: { upper: 1.6, fore: 1.9 }, R: { upper: -0.8, fore: -0.3 } },
    legs: { L: { thigh: 0.3, shin: -0.2 }, R: { thigh: -0.3, shin: -0.9 } },
  },
];
