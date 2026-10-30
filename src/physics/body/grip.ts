import type { Collider, ImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER } from "../world";
import { G_FLOOR, G_PROP, G_WORLD, GRAB_QUERY, groups, PROP_GROUPS } from "../groups";
import { DIM } from "./rig";
import type { Vec } from "../../sim/math";

/** Held trays and dangling things don't collide with Stanley. */
const HELD_APART_GROUPS = groups(G_PROP, G_WORLD | G_FLOOR | G_PROP);

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
  /** Hands catch things within a few centimetres; fingers reach a bit past the palm. */
  private shape = new RAPIER.Ball(DIM.hand.r + 0.065);

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

  /**
   * `minStaticY`: fixed geometry (ledges, walls) is only grabbed above this
   * height, about chest level. That's where you'd grab something to climb;
   * lower down, a hand brushing a counter or desk edge on its way to the
   * thing on top shouldn't latch on.
   */
  update(world: World, wantGrip: boolean, other: Grip, throwAssist: number, minStaticY = -Infinity) {
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
    // Prefer loose things over fixed surfaces (reaching for a sock on a shelf
    // gets the sock, not the shelf), and the most substantial loose thing
    // over little ones (reaching for a tray gets the tray, not a cup on it).
    let found: Collider | null = null;
    let best = -1;
    world.intersectionsWithShape(h, 0, this.shape, (c) => {
      const b = c.parent();
      if (!b?.isDynamic() && h.y < minStaticY) return true;
      const score = b?.isDynamic() ? 1 + b.mass() : 0;
      if (score > best) {
        best = score;
        found = c;
      }
      return true;
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
    // Trays balance on one hand, and dangly things (pins) hang from one hand.
    // A second hand would just tip or wedge them.
    const centre = (target.userData as { balances?: boolean } | undefined)?.balances;
    const dangly = (target.userData as { dangle?: boolean } | undefined)?.dangle;
    if ((centre || dangly) && other.held === target) return;
    let h = (!target.isDynamic() && this.ledgeCorner(col, hand)) || hand;
    if (dangly) {
      // Grab a dangly thing on its centre line, so it hangs straight.
      const tp = target.translation();
      const a = target.rotation();
      const he = col.halfExtents();
      const along = (hand.x - tp.x) * -Math.sin(a) + (hand.y - tp.y) * Math.cos(a);
      const t = Math.max(-(he?.y ?? 0), Math.min(he?.y ?? 0, along));
      h = { x: tp.x - Math.sin(a) * t, y: tp.y + Math.cos(a) * t };
    }
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
    // Trays balance on the hand (a pivot) rather than being clamped to it.
    const pivot = !target.isDynamic() || other.held === target || !!dangly || !!centre;
    const data = pivot
      ? RAPIER.JointData.revolute(this.slide ?? { x: 0, y: 0 }, this.anchor)
      : RAPIER.JointData.fixed(this.slide ?? { x: 0, y: 0 }, 0, this.anchor, this.hand.rotation() - ta);
    this.joint = world.createImpulseJoint(data, this.hand, target, true);
    this.joint.setContactsEnabled(false);
    this.held = target;
    // A tray on the hand rides above Stanley's arms, and a dangling pin hangs
    // in front of them, instead of being levered about by his own body.
    if (centre || dangly) for (let i = 0; i < target.numColliders(); i++) target.collider(i).setCollisionGroups(HELD_APART_GROUPS);
  }

  release(world: World, throwAssist: number, other: Grip) {
    if (!this.joint) return;
    world.removeImpulseJoint(this.joint, true);
    this.slide = null;
    const obj = this.held!;
    const ud = obj.userData as { balances?: boolean; dangle?: boolean } | undefined;
    if (ud?.balances || ud?.dangle) {
      for (let i = 0; i < obj.numColliders(); i++) obj.collider(i).setCollisionGroups(PROP_GROUPS);
    }
    this.joint = null;
    this.held = null;
    // A small boost on real throws (not gentle drops) so throwing feels punchy.
    if (obj.isDynamic() && other.held !== obj) {
      const v = obj.linvel();
      if (Math.hypot(v.x, v.y) > 2) obj.setLinvel({ x: v.x * throwAssist, y: v.y * throwAssist }, true);
    }
  }
}
