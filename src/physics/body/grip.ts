import type { Collider, ImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER } from "../world";
import { GRAB_QUERY } from "../groups";
import { DIM } from "./rig";
import type { Vec } from "../../sim/math";

/** How far a grip can be yanked before it slips. */
const SLIP_DISTANCE = 0.22;

/**
 * One hand's grip. While the player holds grip, the first thing the hand
 * touches gets welded to it. Static things (ledges, walls) get a pivot so
 * Stanley can hang and swing; loose things get a weld so you can carry and
 * aim them — unless the other hand already has it, then a pivot too, so two
 * hands don't fight each other.
 */
export class Grip {
  joint: ImpulseJoint | null = null;
  held: RigidBody | null = null;
  /** Where on `held` we grabbed, in its local frame. */
  private anchor: Vec = { x: 0, y: 0 };
  /**
   * When a grab snaps to a ledge corner, the hand-side anchor starts where the
   * hand actually is and slides onto the corner over a few steps, instead of
   * yanking the arm there in one step.
   */
  private slide: Vec | null = null;
  private shape = new RAPIER.Ball(DIM.hand.r + 0.025);

  constructor(private hand: RigidBody) {}

  get holdingStatic() {
    return !!this.held && !this.held.isDynamic();
  }

  /** World position of the grab point. */
  anchorWorld(): Vec | null {
    if (!this.held) return null;
    const p = this.held.translation();
    const a = this.held.rotation();
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: p.x + this.anchor.x * c - this.anchor.y * s, y: p.y + this.anchor.x * s + this.anchor.y * c };
  }

  update(world: World, wantGrip: boolean, other: Grip, throwAssist: number) {
    if (!wantGrip) {
      if (this.joint) this.release(world, throwAssist, other);
      return;
    }
    if (this.joint && this.slide) {
      this.slide = { x: this.slide.x * 0.8, y: this.slide.y * 0.8 };
      if (Math.hypot(this.slide.x, this.slide.y) < 0.005) this.slide = null;
      this.joint.setAnchor1(this.slide ?? { x: 0, y: 0 });
      return;
    }
    if (this.joint) {
      const aw = this.anchorWorld()!;
      const h = this.hand.translation();
      if (Math.hypot(aw.x - h.x, aw.y - h.y) > SLIP_DISTANCE) this.release(world, 1, other);
      return;
    }
    const h = this.hand.translation();
    // Prefer loose things over fixed surfaces: reaching for a sock on a
    // shelf should get the sock, not the shelf.
    let found: Collider | null = null;
    world.intersectionsWithShape(h, 0, this.shape, (c) => {
      if (!found || c.parent()?.isDynamic()) found = c;
      return !found.parent()?.isDynamic();
    }, undefined, GRAB_QUERY);
    const col = found as Collider | null;
    const target = col?.parent();
    if (col && target) this.attach(world, col, target, other);
  }

  /**
   * Grabbing a static block near one of its top corners (say, reaching up at
   * a ledge from below) takes hold of the corner itself — that's what a
   * person would grab, and it lets Stanley pull up and over.
   */
  private ledgeCorner(col: Collider, h: Vec): Vec | null {
    const he = col.halfExtents();
    if (!he || col.rotation() !== 0) return null;
    const c = col.translation();
    const top = c.y + he.y;
    const edge = Math.abs(h.x - (c.x - he.x)) < Math.abs(h.x - (c.x + he.x)) ? c.x - he.x : c.x + he.x;
    if (Math.abs(h.x - edge) < 0.3 && h.y < top + 0.05 && top - h.y < 0.4) return { x: edge, y: top };
    return null;
  }

  private attach(world: World, col: Collider, target: RigidBody, other: Grip) {
    const hand = this.hand.translation();
    const h = (!target.isDynamic() && this.ledgeCorner(col, hand)) || hand;
    // Offset from the hand to the grab point, in the hand's frame.
    const ha = this.hand.rotation();
    const ox = h.x - hand.x;
    const oy = h.y - hand.y;
    this.slide = Math.hypot(ox, oy) > 0.005 ? { x: ox * Math.cos(-ha) - oy * Math.sin(-ha), y: ox * Math.sin(-ha) + oy * Math.cos(-ha) } : null;
    const tp = target.translation();
    const ta = target.rotation();
    const c = Math.cos(-ta);
    const s = Math.sin(-ta);
    const dx = h.x - tp.x;
    const dy = h.y - tp.y;
    this.anchor = { x: dx * c - dy * s, y: dx * s + dy * c };
    const pivot = !target.isDynamic() || other.held === target;
    const data = pivot
      ? RAPIER.JointData.revolute(this.slide ?? { x: 0, y: 0 }, this.anchor)
      : RAPIER.JointData.fixed(this.slide ?? { x: 0, y: 0 }, 0, this.anchor, this.hand.rotation() - ta);
    this.joint = world.createImpulseJoint(data, this.hand, target, true);
    this.joint.setContactsEnabled(false);
    this.held = target;
  }

  release(world: World, throwAssist: number, other: Grip) {
    if (!this.joint) return;
    world.removeImpulseJoint(this.joint, true);
    this.slide = null;
    const obj = this.held!;
    this.joint = null;
    this.held = null;
    // A small boost on real throws (not gentle drops) so throwing feels punchy.
    if (obj.isDynamic() && other.held !== obj) {
      const v = obj.linvel();
      if (Math.hypot(v.x, v.y) > 2) obj.setLinvel({ x: v.x * throwAssist, y: v.y * throwAssist }, true);
    }
  }
}
