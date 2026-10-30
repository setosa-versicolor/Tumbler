// Every number that shapes how Tumbler feels lives here, so the tuning
// panel can tweak it live. Units are SI (metres, kg, seconds, N·m).

export interface Tuning {
  /** Max torque each arm joint can produce. Lower = floppier, heavy things win. */
  armStrength: number;
  /** How snappily arms chase the reach target (natural frequency, rad/s). */
  armStiffness: number;
  /** Damping ratio for arm motors. Below 1 overshoots and wobbles. */
  armDamping: number;
  /** Arm strength multiplier while not reaching (dangling arms). */
  armRelaxed: number;
  /** Extra wobble added to arm targets while running. */
  flail: number;
  /** How hard the torso tries to stay upright. */
  balance: number;
  /** Leg motor strength. */
  legStrength: number;
  /** Top running speed, m/s. */
  moveSpeed: number;
  /** Jump take-off speed, m/s. */
  jumpSpeed: number;
  /** Released objects get their velocity multiplied by this. 1 = pure physics. */
  throwAssist: number;
  /** Torso tilt (radians) past which Tumbler falls over. */
  fallTilt: number;
  /** Sudden chest velocity change (m/s in one step) that knocks Tumbler down. */
  knockdown: number;
  /** Gravity, m/s². */
  gravity: number;
  /** Simulation speed. 1 = real time. */
  timeScale: number;
}

export const DEFAULT_TUNING: Tuning = {
  armStrength: 55,
  armStiffness: 22,
  armDamping: 0.55,
  armRelaxed: 0.18,
  flail: 0.7,
  balance: 1,
  legStrength: 160,
  moveSpeed: 3.4,
  jumpSpeed: 5.2,
  throwAssist: 1.2,
  fallTilt: 1.05,
  knockdown: 4.5,
  gravity: 9.81,
  timeScale: 1,
};

export interface TuningRange {
  key: keyof Tuning;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const TUNING_RANGES: TuningRange[] = [
  { key: "armStrength", label: "Arm strength", min: 5, max: 200, step: 1 },
  { key: "armStiffness", label: "Arm snappiness", min: 4, max: 45, step: 0.5 },
  { key: "armDamping", label: "Arm damping", min: 0.05, max: 1.5, step: 0.05 },
  { key: "armRelaxed", label: "Dangle strength", min: 0, max: 1, step: 0.02 },
  { key: "flail", label: "Flail", min: 0, max: 2, step: 0.05 },
  { key: "balance", label: "Balance", min: 0, max: 2, step: 0.05 },
  { key: "legStrength", label: "Leg strength", min: 20, max: 400, step: 5 },
  { key: "moveSpeed", label: "Run speed", min: 0.5, max: 8, step: 0.1 },
  { key: "jumpSpeed", label: "Jump", min: 0, max: 10, step: 0.1 },
  { key: "throwAssist", label: "Throw assist", min: 1, max: 2, step: 0.05 },
  { key: "fallTilt", label: "Fall-over tilt", min: 0.4, max: 1.6, step: 0.05 },
  { key: "knockdown", label: "Knockdown hit", min: 1, max: 15, step: 0.25 },
  { key: "gravity", label: "Gravity", min: 1, max: 25, step: 0.1 },
  { key: "timeScale", label: "Time scale", min: 0.1, max: 1.5, step: 0.05 },
];
