import type { Collider, ImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER } from "../world";
import { ENV_QUERY, G_FLOOR, G_PROP, G_WORLD, GRAB_QUERY, groups, PROP_GROUPS } from "../groups";
import { DIM } from "./rig";
import type { Vec } from "../../sim/math";

/** Held trays and dangling things don't collide with Stanley. */
const HELD_APART_GROUPS = groups(G_PROP, G_WORLD | G_FLOOR | G_PROP);

/** How strongly a dangling thing's swing is damped while it's held. */
const DANGLE_DAMPING = 10;

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
  /** A held dangly thing's own angular damping, put back when it's let go. */
  private damping = 0;
  /** A dangly thing just set down: kept clear of Stanley until his hand's away from it... */
  private setDown: RigidBody | null = null;
  /** ...and not grabbed again until grip is let go. */
  private noRegrab: RigidBody | null = null;

  /** `fore`: the forearm, which a tool is fixed to so it points where the arm points (the wrist is floppy). */
  constructor(
    private hand: RigidBody,
    private fore?: RigidBody,
  ) {}

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
    if (this.setDown) {
      // A pin just set down ignores Stanley until his hand's clear of it, so
      // the hand that put it there doesn't knock it straight back over.
      const p = this.setDown.translation();
      const h = this.hand.translation();
      if (Math.hypot(p.x - h.x, p.y - h.y) > 0.45) {
        for (let i = 0; i < this.setDown.numColliders(); i++) this.setDown.collider(i).setCollisionGroups(PROP_GROUPS);
        this.setDown = null;
      }
    }
    if (!wantGrip) this.noRegrab = null;
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
      else if (this.settled(world)) {
        // A pin lowered onto something, standing up: it's been set down, so
        // let go, rather than levering it over onto its side.
        const obj = this.held!;
        this.release(world, 1, other);
        this.setDown = this.noRegrab = obj;
        for (let i = 0; i < obj.numColliders(); i++) obj.collider(i).setCollisionGroups(HELD_APART_GROUPS);
        // ...and plonk it down onto its base.
        obj.setAngvel(-Math.atan2(Math.sin(obj.rotation()), Math.cos(obj.rotation())) * 6, true);
        obj.setLinvel({ x: 0, y: Math.min(0, obj.linvel().y) }, true);
      }
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
      if (b && (b === this.noRegrab || b === this.setDown)) return true;
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

  /** A dangly thing standing upright, its base resting on something. */
  private settled(world: World): boolean {
    const obj = this.held!;
    if (!(obj.userData as { dangle?: boolean } | undefined)?.dangle) return false;
    const a = obj.rotation();
    if (Math.cos(a) < 0.9) return false;
    const p = obj.translation();
    const hh = obj.collider(0).halfExtents()?.y ?? 0;
    const base = { x: p.x + Math.sin(a) * hh, y: p.y - Math.cos(a) * hh + 0.01 };
    const hit = world.castRay(new RAPIER.Ray(base, { x: 0, y: -1 }), 0.06, true, undefined, ENV_QUERY, undefined, obj);
    return !!hit;
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
    const tool = (target.userData as { tool?: boolean } | undefined)?.tool;
    if ((centre || dangly || tool) && other.held === target) return;
    let h = (!target.isDynamic() && this.ledgeCorner(col, hand)) || hand;
    if (dangly) {
      // A dangly thing (a pin) is held by the tip of its top end, wherever it
      // was grabbed, so it always hangs the right way up. The grip slides there.
      const tp = target.translation();
      const a = target.rotation();
      const t = col.halfExtents()?.y ?? 0;
      h = { x: tp.x - Math.sin(a) * t, y: tp.y + Math.cos(a) * t };
    }
    if (tool) {
      // A tool (the squeegee) is held by the end of its handle, pointing on
      // out along the forearm like a longer arm, however it was lying.
      const tp = target.translation();
      const a = target.rotation();
      const t = -(target.collider(0).halfExtents()?.y ?? 0);
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
    let data;
    let holder = this.hand;
    if (tool && this.fore) {
      // A tool is fixed to the forearm (at the hand), pointing on out along
      // it: a forearm's local -y runs elbow-to-hand and a tool's local +y is
      // its business end, so it's turned half round to line up.
      holder = this.fore;
      const fp = this.fore.translation();
      const fa = -this.fore.rotation();
      const dx = h.x - fp.x;
      const dy = h.y - fp.y;
      data = RAPIER.JointData.fixed({ x: dx * Math.cos(fa) - dy * Math.sin(fa), y: dx * Math.sin(fa) + dy * Math.cos(fa) }, 0, this.anchor, -Math.PI);
      this.slide = null;
    } else if (pivot) data = RAPIER.JointData.revolute(this.slide ?? { x: 0, y: 0 }, this.anchor);
    else data = RAPIER.JointData.fixed(this.slide ?? { x: 0, y: 0 }, 0, this.anchor, this.hand.rotation() - ta);
    this.joint = world.createImpulseJoint(data, holder, target, true);
    this.joint.setContactsEnabled(false);
    this.held = target;
    // A tray on the hand rides above Stanley's arms, and a dangling pin hangs
    // in front of them, instead of being levered about by his own body.
    if (centre || dangly || tool) for (let i = 0; i < target.numColliders(); i++) target.collider(i).setCollisionGroups(HELD_APART_GROUPS);
    // A held pin swings lazily, so it can be lowered without wobbling over.
    if (dangly) {
      this.damping = target.angularDamping();
      target.setAngularDamping(DANGLE_DAMPING);
    }
  }

  /** Make the hand let go of whatever it's holding, and not grab it again until grip is let go. */
  drop(world: World, other: Grip) {
    const obj = this.held;
    if (!obj) return;
    this.release(world, 1, other);
    this.noRegrab = obj;
  }

  release(world: World, throwAssist: number, other: Grip) {
    if (!this.joint) return;
    world.removeImpulseJoint(this.joint, true);
    this.slide = null;
    const obj = this.held!;
    const ud = obj.userData as { balances?: boolean; dangle?: boolean; tool?: boolean } | undefined;
    if (ud?.balances || ud?.dangle || ud?.tool) {
      for (let i = 0; i < obj.numColliders(); i++) obj.collider(i).setCollisionGroups(PROP_GROUPS);
    }
    if (ud?.dangle) obj.setAngularDamping(this.damping);
    this.joint = null;
    this.held = null;
    // A small boost on real throws (not gentle drops) so throwing feels punchy.
    if (obj.isDynamic() && other.held !== obj) {
      const v = obj.linvel();
      if (Math.hypot(v.x, v.y) > 2) obj.setLinvel({ x: v.x * throwAssist, y: v.y * throwAssist }, true);
    }
  }
}
