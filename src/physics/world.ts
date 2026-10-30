import RAPIER from "@dimforge/rapier2d-deterministic-compat";

export type Rapier = typeof RAPIER;
export { RAPIER };

let ready: Promise<void> | null = null;

/** Load the physics WASM once. */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

export const PHYSICS_HZ = 120;
export const DT = 1 / PHYSICS_HZ;

export function createWorld(gravity: number) {
  const world = new RAPIER.World({ x: 0, y: -gravity });
  world.timestep = DT;
  // A few extra solver iterations keep long jointed chains (arms holding boxes) stiff.
  world.numSolverIterations = 8;
  return world;
}
