// Tiny synthesized sound effects. No asset files; the AudioContext starts on
// the first user gesture (browsers require it).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

function tone(freq: number, to: number, dur: number, type: OscillatorType, gain = 0.15, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur);
}

/** Filtered noise burst: thumps, whooshes. */
function burst(dur: number, freq: number, gain: number, sweepTo = freq, q = 1) {
  if (!ctx || !master || !noise) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur);
}

let lastThud = 0;

export const sfx = {
  press: () => {
    tone(660, 660, 0.09, "square", 0.07);
    tone(990, 990, 0.16, "square", 0.07, 0.08);
  },
  dingDong: () => {
    tone(784, 784, 0.5, "sine", 0.2);
    tone(622, 622, 0.7, "sine", 0.2, 0.35);
  },
  score: () => {
    tone(520, 1040, 0.22, "triangle", 0.16);
    tone(780, 1560, 0.28, "triangle", 0.1, 0.09);
  },
  fall: () => {
    burst(0.25, 180, 0.5, 80);
    tone(300, 70, 0.35, "sawtooth", 0.06);
  },
  hup: () => tone(240, 420, 0.12, "triangle", 0.1),
  /** A bump scaled 0..1. Rate-limited so piles don't machine-gun. */
  thud: (strength: number) => {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastThud < 0.05) return;
    lastThud = now;
    const s = Math.min(1, strength);
    burst(0.08 + s * 0.1, 120 + Math.random() * 120, 0.15 + s * 0.45, 60, 0.8);
  },
  whoosh: (speed: number) => burst(0.25, 400, Math.min(0.35, speed * 0.03), 1600, 0.7),
  land: () => burst(0.12, 140, 0.25, 70),
  complete: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, "triangle", 0.14, i * 0.09));
  },
  star: (i: number) => tone(880 + i * 220, 880 + i * 220, 0.18, "sine", 0.16),
  click: () => tone(1200, 900, 0.04, "square", 0.04),
  /** Gerald's voice: low, confident blips. Asides are a touch higher. */
  blip: (aside: boolean) => tone((aside ? 210 : 150) + Math.random() * 40, 120, 0.06, "square", 0.035),
};
