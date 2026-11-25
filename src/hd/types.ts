/** A light in the HD renderer. Positions and sizes are in metres, in the world. */
export interface HDLight {
  x: number;
  y: number;
  /** How far in front of the wall it hangs: higher lights rake less (default 1). */
  z?: number;
  /** Reach, in metres. */
  radius: number;
  /** Linear RGB, 0–1. */
  color: [number, number, number];
  intensity: number;
  /** Casts soft shadows from Stanley and the props (only the first four that ask do). */
  shadow?: boolean;
  /** A spotlight: pointing `dir` (radians, 0 = right, -π/2 = down), lit within `outer` of it, full within `inner`. */
  spot?: { dir: number; inner: number; outer: number };
}

/** The lighting and finish for one frame. */
export interface HDScene {
  /** Light that's everywhere, linear RGB. */
  ambient: [number, number, number];
  lights: HDLight[];
  /** Haze in the air: how much light beams show (0 = none). */
  haze?: number;
  /** How glossy the floor is (0 = matte). */
  reflect?: number;
  /** Bloom strength (default 0.8). */
  bloom?: number;
  /** Overall exposure (default 1). */
  exposure?: number;
  /** Specks of dust drifting through the light (0–1). */
  motes?: number;
}

export const DEFAULT_SCENE: HDScene = {
  ambient: [0.95, 0.95, 0.95],
  lights: [],
  haze: 0,
  reflect: 0,
  bloom: 0.35,
  exposure: 1,
};
