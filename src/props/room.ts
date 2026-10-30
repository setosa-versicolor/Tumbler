import type { PrismaticImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER } from "../physics/world";
import { PROP_GROUPS, WORLD_GROUPS } from "../physics/groups";
import { rng } from "../sim/math";

// The M0 test room: a box-shaped room with stuff to grab, a button to hit,
// a basket to throw into and a ledge to climb.

export const ROOM = { w: 16, h: 8 };

export type PropKind = "box" | "ball" | "plank" | "pizza";

export interface Prop {
  kind: PropKind;
  body: RigidBody;
  /** Half extents for boxes/planks, radius in `hw` for balls. */
  hw: number;
  hh: number;
  color: string;
}

export interface Solid {
  x: number;
  y: number;
  hw: number;
  hh: number;
  kind: "floor" | "wall" | "ledge" | "basket";
}

export const LEDGE = { x0: 10.6, x1: 13.2, y: 2.2, thick: 0.2 };
export const BASKET = { x0: 0, x1: 1.4, y: 2.9, lip: 0.55 };
export const BUTTON = { y: 1.95, hw: 0.07, hh: 0.2, travel: 0.07 };

export class Button {
  presses = 0;
  /** Seconds the light stays on after a press. */
  lit = 0;
  private down = false;
  readonly restX: number;

  constructor(readonly cap: RigidBody, readonly joint: PrismaticImpulseJoint) {
    this.restX = cap.translation().x;
  }

  get depth() {
    return Math.max(0, this.cap.translation().x - this.restX);
  }

  update(dt: number): boolean {
    this.lit = Math.max(0, this.lit - dt);
    const d = this.depth;
    let pressed = false;
    if (!this.down && d > BUTTON.travel * 0.6) {
      this.down = true;
      this.presses++;
      this.lit = 1.2;
      pressed = true;
    } else if (this.down && d < BUTTON.travel * 0.25) {
      this.down = false;
    }
    return pressed;
  }
}

const PALETTE = ["#e8a35c", "#d9824a", "#c9b26b", "#e0c08a", "#b9895a"];

export function buildRoom(world: World, seed = 1) {
  const rand = rng(seed);
  const solids: Solid[] = [];
  const room = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  const solid = (x: number, y: number, hw: number, hh: number, kind: Solid["kind"], friction = 0.8) => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh).setTranslation(x, y).setFriction(friction).setCollisionGroups(WORLD_GROUPS),
      room,
    );
    solids.push({ x, y, hw, hh, kind });
  };

  const T = 0.5;
  solid(ROOM.w / 2, -T, ROOM.w / 2 + T * 2, T, "floor");
  solid(ROOM.w / 2, ROOM.h + T, ROOM.w / 2 + T * 2, T, "wall");
  solid(-T, ROOM.h / 2, T, ROOM.h / 2 + T, "wall");
  solid(ROOM.w + T, ROOM.h / 2, T, ROOM.h / 2 + T, "wall");

  // Ledge to climb onto.
  solid((LEDGE.x0 + LEDGE.x1) / 2, LEDGE.y, (LEDGE.x1 - LEDGE.x0) / 2, LEDGE.thick / 2, "ledge");
  // Basket on the left wall: a floor and a front lip.
  solid((BASKET.x0 + BASKET.x1) / 2, BASKET.y, (BASKET.x1 - BASKET.x0) / 2, 0.05, "basket");
  solid(BASKET.x1 - 0.05, BASKET.y + BASKET.lip / 2, 0.05, BASKET.lip / 2, "basket");

  // Button on the right wall, on a spring-loaded slider.
  const capX = ROOM.w - BUTTON.hw - 0.02;
  const cap = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(capX, BUTTON.y).setGravityScale(0).setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(BUTTON.hw, BUTTON.hh).setMass(0.4).setCollisionGroups(PROP_GROUPS),
    cap,
  );
  const jd = RAPIER.JointData.prismatic({ x: capX, y: BUTTON.y }, { x: 0, y: 0 }, { x: 1, y: 0 });
  const joint = world.createImpulseJoint(jd, room, cap, true) as PrismaticImpulseJoint;
  joint.setLimits(0, BUTTON.travel);
  joint.configureMotorPosition(0, 90, 6);
  const button = new Button(cap, joint);

  // Loose stuff.
  const props: Prop[] = [];
  const box = (x: number, y: number, hw: number, hh: number, kind: PropKind, density: number, color: string) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setCcdEnabled(true).setAngularDamping(0.2),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh).setDensity(density).setFriction(0.7).setRestitution(0.05).setCollisionGroups(PROP_GROUPS),
      body,
    );
    props.push({ kind, body, hw, hh, color });
  };
  const ball = (x: number, y: number, r: number, density: number, color: string) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setCcdEnabled(true).setAngularDamping(0.3),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(r).setDensity(density).setFriction(0.6).setRestitution(0.55).setCollisionGroups(PROP_GROUPS),
      body,
    );
    props.push({ kind: "ball", body, hw: r, hh: r, color });
  };

  const pick = () => PALETTE[Math.floor(rand() * PALETTE.length)];
  // A loose pile of boxes to stack.
  const sizes = [0.32, 0.28, 0.26, 0.24, 0.22, 0.2];
  let x = 4.2;
  sizes.forEach((s, i) => {
    box(x, s + (i % 2) * 0.9 + 0.01, s, s * (0.85 + rand() * 0.2), "box", 14, pick());
    x += s * 2 + 0.15 + rand() * 0.2;
  });
  ball(8.6, 0.25, 0.18, 6, "#e85d5d");
  ball(9.3, 0.25, 0.14, 6, "#5d9de8");
  ball(2.6, 0.25, 0.16, 6, "#7bc96f");
  box(7.2, 0.08, 0.8, 0.05, "plank", 12, "#a8784a");
  box(12.4, LEDGE.y + 0.4, 0.3, 0.04, "pizza", 10, "#f1e3c6");
  box(11.4, LEDGE.y + 0.35, 0.22, 0.22, "box", 14, pick());

  return { room, solids, props, button };
}
