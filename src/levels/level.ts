import type { Kit } from "./kit";
import type { Game, GameEvent } from "../sim/game";
import type { Renderer } from "../render/renderer";
import type { Vec } from "../sim/math";

export interface Theme {
  outdoor: boolean;
  /** Indoor wallpaper or outdoor sky gradient. */
  top: string;
  bottom: string;
  floor: string;
  floorTop: string;
  /** Wallpaper stripe colour (indoor only). */
  stripe?: string;
  /** Outdoor scenes by the harbour: draw the sea on the horizon. */
  sea?: boolean;
  /** Up among the towers: no hills on the horizon. */
  city?: boolean;
}

export interface Progress {
  done: boolean;
  /** Short status for the HUD, e.g. "Socks 2/3". */
  label?: string;
}

/** A level once built into a physics world. */
export interface LevelInstance {
  progress(game: Game): Progress;
  /** Per-step level logic (buttons, zones). May emit events. */
  update?(game: Game, dt: number): GameEvent[];
  /** Scenery behind everything. */
  drawBack?(r: Renderer, game: Game): void;
  /** Scenery in front of the props but behind Stanley. */
  drawMid?(r: Renderer, game: Game): void;
  /** Things in front of Stanley. */
  drawFront?(r: Renderer, game: Game): void;
}

export interface Level {
  id: string;
  title: string;
  /** One line telling the player what to do. */
  goal: string;
  icon: string;
  /** Seconds for 3 stars and 2 stars. */
  par: [number, number];
  bounds: { w: number; h: number };
  /** Metres of height the camera frames (default 5.6). */
  viewHeight?: number;
  spawn: Vec;
  /** Where the goal is: shown during the intro, and pointed at when off-screen. */
  target?: Vec;
  theme: Theme;
  /** No goal, no timer. */
  sandbox?: boolean;
  build(kit: Kit): LevelInstance;
}

export const INDOOR: Theme = {
  outdoor: false,
  top: "#f6e7cf",
  bottom: "#efd6b4",
  floor: "#8a6a4e",
  floorTop: "#a5825f",
  stripe: "rgba(255,255,255,0.18)",
};

export const OUTDOOR: Theme = {
  outdoor: true,
  top: "#8fd0f0",
  bottom: "#dff3fb",
  floor: "#6b9a45",
  floorTop: "#86b955",
};

export const HARBOUR: Theme = {
  outdoor: true,
  sea: true,
  top: "#f7b98a",
  bottom: "#fde6c4",
  floor: "#4e5b52",
  floorTop: "#5f6d62",
};

export const OFFICE: Theme = {
  outdoor: false,
  top: "#e6ebf0",
  bottom: "#d3dae2",
  floor: "#5f6670",
  floorTop: "#7a828c",
  stripe: "rgba(255,255,255,0.12)",
};

/** Fifty floors up: all sky. */
export const HIGH_RISE: Theme = {
  outdoor: true,
  city: true,
  top: "#6fb7e6",
  bottom: "#cfe9f7",
  floor: "#8a9099",
  floorTop: "#a3a9b1",
};
