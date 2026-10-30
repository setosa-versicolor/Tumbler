import type { Collider, PrismaticImpulseJoint, RigidBody, World } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER } from "../physics/world";
import { FLOOR_GROUPS, G_BODY, G_PROP, groups, PROP_GROUPS, WORLD_GROUPS } from "../physics/groups";
import { rng } from "../sim/math";

// Building blocks for levels: static solids, loose props and buttons.

export type SolidKind =
  | "floor"
  | "ground"
  | "wall"
  | "ledge"
  | "basket"
  | "step"
  | "ramp"
  | "desk"
  | "dresser"
  | "porch"
  | "table"
  | "bed"
  | "landing"
  | "house";

export interface Solid {
  x: number;
  y: number;
  hw: number;
  hh: number;
  /** Rotation in radians (only ramps use it). */
  angle: number;
  kind: SolidKind;
  /** Hidden solids collide but aren't drawn. */
  hidden: boolean;
}

export type PropKind =
  | "box"
  | "ball"
  | "plank"
  | "pizza"
  | "sock"
  | "gnome"
  | "crate"
  | "mug"
  | "pens"
  | "nameplate"
  | "photo"
  | "plant"
  | "files"
  | "cooler";

export interface Prop {
  kind: PropKind;
  body: RigidBody;
  /** Half extents; for balls `hw` is the radius. */
  hw: number;
  hh: number;
  color: string;
  /** Optional name a level uses to find it again. */
  tag?: string;
}

export interface BoxOptions {
  kind?: PropKind;
  density?: number;
  color?: string;
  friction?: number;
  restitution?: number;
  angle?: number;
  tag?: string;
}

export const BUTTON_TRAVEL = 0.07;

/** Something hitting a button at least this fast counts as a press. */
const SMACK_SPEED = 1.2;

/**
 * A spring-loaded push button sticking out of a wall to its right. Pushing
 * it in presses it, and so does smacking it from any side — hitting things
 * is what Stanley is good at.
 */
export class Button {
  presses = 0;
  /** Seconds the light stays on after a press. */
  lit = 0;
  private down = false;
  private cooldown = 0;
  readonly restX: number;

  constructor(
    readonly cap: RigidBody,
    readonly joint: PrismaticImpulseJoint,
    readonly hw: number,
    readonly hh: number,
    private world: World,
    private collider: Collider,
  ) {
    this.restX = cap.translation().x;
  }

  private smacked(): boolean {
    let hit = false;
    this.world.contactPairsWith(this.collider, (other) => {
      if (hit) return;
      const b = other.parent();
      if (!b?.isDynamic()) return;
      const v = b.linvel();
      if (Math.hypot(v.x, v.y) < SMACK_SPEED) return;
      this.world.contactPair(this.collider, other, (m) => {
        if (m.numContacts() > 0) hit = true;
      });
    });
    return hit;
  }

  get depth() {
    return Math.max(0, this.cap.translation().x - this.restX);
  }

  /** Returns true on the step the button gets pressed. */
  update(dt: number): boolean {
    this.lit = Math.max(0, this.lit - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const d = this.depth;
    if (!this.down && this.cooldown === 0 && (d > BUTTON_TRAVEL * 0.6 || this.smacked())) {
      this.down = true;
      this.cooldown = 0.35;
      this.presses++;
      this.lit = 1.2;
      return true;
    }
    if (this.down && this.cooldown === 0 && d < BUTTON_TRAVEL * 0.25) this.down = false;
    return false;
  }
}

/** Collides with Stanley only; props pass through (used for walkable stair ramps). */
const BODY_ONLY_GROUPS = groups(0x0001, G_BODY);
/** Collides with props only (the visible stair steps, which Stanley glides over). */
const PROP_ONLY_GROUPS = groups(0x0001, G_PROP);

export class Kit {
  readonly room: RigidBody;
  readonly solids: Solid[] = [];
  readonly props: Prop[] = [];
  readonly buttons: Button[] = [];
  readonly rand: () => number;

  constructor(readonly world: World, seed = 1) {
    this.room = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.rand = rng(seed);
  }

  solid(
    x: number,
    y: number,
    hw: number,
    hh: number,
    kind: SolidKind,
    opts: { friction?: number; angle?: number; hidden?: boolean; collides?: "all" | "body" | "props" } = {},
  ): Collider {
    const g =
      opts.collides === "body"
        ? BODY_ONLY_GROUPS
        : opts.collides === "props"
          ? PROP_ONLY_GROUPS
          : kind === "floor" || kind === "ground"
            ? FLOOR_GROUPS
            : WORLD_GROUPS;
    const col = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh)
        .setTranslation(x, y)
        .setRotation(opts.angle ?? 0)
        .setFriction(opts.friction ?? 0.8)
        .setCollisionGroups(g),
      this.room,
    );
    this.solids.push({ x, y, hw, hh, kind, angle: opts.angle ?? 0, hidden: !!opts.hidden });
    return col;
  }

  /** Floor plus side walls (and a ceiling indoors). */
  enclosure(w: number, h: number, outdoor = false) {
    const T = 0.5;
    this.solid(w / 2, -T, w / 2 + T * 2, T, outdoor ? "ground" : "floor");
    this.solid(-T, h / 2 + 2, T, h / 2 + 2 + T, "wall", { hidden: outdoor });
    this.solid(w + T, h / 2 + 2, T, h / 2 + 2 + T, "wall", { hidden: outdoor });
    if (!outdoor) this.solid(w / 2, h + T, w / 2 + T * 2, T, "wall");
  }

  /** An open-topped container: floor plus two side walls. */
  basket(x0: number, x1: number, y: number, depth: number) {
    this.solid((x0 + x1) / 2, y, (x1 - x0) / 2, 0.04, "basket");
    this.solid(x0 + 0.04, y + depth / 2, 0.04, depth / 2, "basket");
    this.solid(x1 - 0.04, y + depth / 2, 0.04, depth / 2, "basket");
  }

  box(x: number, y: number, hw: number, hh: number, o: BoxOptions = {}): Prop {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setRotation(o.angle ?? 0)
        .setCcdEnabled(true)
        .setAngularDamping(0.2),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh)
        .setDensity(o.density ?? 14)
        .setFriction(o.friction ?? 0.7)
        .setRestitution(o.restitution ?? 0.05)
        .setCollisionGroups(PROP_GROUPS),
      body,
    );
    const prop: Prop = { kind: o.kind ?? "box", body, hw, hh, color: o.color ?? this.boxColor(), tag: o.tag };
    this.props.push(prop);
    return prop;
  }

  ball(x: number, y: number, r: number, o: BoxOptions = {}): Prop {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setCcdEnabled(true).setAngularDamping(0.3),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(r)
        .setDensity(o.density ?? 6)
        .setFriction(o.friction ?? 0.6)
        .setRestitution(o.restitution ?? 0.55)
        .setCollisionGroups(PROP_GROUPS),
      body,
    );
    const prop: Prop = { kind: "ball", body, hw: r, hh: r, color: o.color ?? "#e85d5d", tag: o.tag };
    this.props.push(prop);
    return prop;
  }

  /** A button whose face points left, mounted on a wall whose surface is at `wallX`. */
  button(wallX: number, y: number, hw = 0.07, hh = 0.2): Button {
    const capX = wallX - hw - 0.02;
    const cap = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(capX, y).setGravityScale(0).setCcdEnabled(true),
    );
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh).setMass(0.4).setCollisionGroups(PROP_GROUPS), cap);
    const jd = RAPIER.JointData.prismatic({ x: capX, y }, { x: 0, y: 0 }, { x: 1, y: 0 });
    const joint = this.world.createImpulseJoint(jd, this.room, cap, true) as PrismaticImpulseJoint;
    joint.setLimits(0, BUTTON_TRAVEL);
    joint.configureMotorPosition(0, 90, 6);
    const b = new Button(cap, joint, hw, hh, this.world, col);
    this.buttons.push(b);
    return b;
  }

  /**
   * Stairs that look like steps but walk like a ramp: props tumble down the
   * steps, while Stanley's body slides up a hidden slope (feet and steps
   * don't get along).
   */
  stairs(x0: number, y0: number, steps: number, run: number, rise: number) {
    for (let i = 0; i < steps; i++) {
      const top = y0 + rise * (i + 1);
      const x = x0 + run * i;
      this.solid(x + run / 2, top / 2, run / 2, top / 2, "step", { collides: "props" });
    }
    // The slope runs along the step noses, from the floor one tread before the
    // first step up to the top of the last one.
    const ax = x0 - run;
    const bx = x0 + run * (steps - 1);
    const by = y0 + rise * steps;
    const len = Math.hypot(bx - ax, by - y0);
    const angle = Math.atan2(by - y0, bx - ax);
    const cx = (ax + bx) / 2;
    const cy = (y0 + by) / 2;
    this.solid(cx, cy - 0.02, len / 2 + 0.05, 0.02, "ramp", { angle, hidden: true, collides: "body", friction: 0.4 });
  }

  private boxColor() {
    const palette = ["#e8a35c", "#d9824a", "#c9b26b", "#e0c08a", "#b9895a"];
    return palette[Math.floor(this.rand() * palette.length)];
  }
}
