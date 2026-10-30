// Tiny synthesized sound effects. No asset files; the AudioContext starts on
// the first user gesture (browsers require it).

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, to: number, dur: number, type: OscillatorType, gain = 0.15, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

export const sfx = {
  press: () => {
    tone(660, 660, 0.09, "square", 0.08);
    tone(990, 990, 0.16, "square", 0.08, 0.08);
  },
  basket: () => {
    tone(520, 1040, 0.25, "triangle", 0.18);
    tone(780, 1560, 0.3, "triangle", 0.12, 0.1);
  },
  fall: () => tone(300, 70, 0.35, "sawtooth", 0.08),
  hup: () => tone(240, 420, 0.12, "triangle", 0.12),
};
