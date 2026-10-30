# TUMBLER — Concept & Plan

> Fling a ragdoll stunt dummy through a gauntlet of physics junk. One thumb, a 15-second run, instant retry. Easy to pick up, and the more you play the more control you find.

---

## 1. The pitch

You're **Dummy**, a crash-test stunt performer. Each run is **one launch**. Drag back to aim, let go, and Dummy goes flying through a course full of trampolines, fans, seesaws, wrecking balls, glass panes, bowling pins and conveyor belts. You can't steer. You only control **Dummy's body**:

- **Hold** → **TUCK.** Dummy pulls into a tight ball. Spins faster, rolls, bounces harder, punches through breakables.
- **Release** → **SPRAWL.** Dummy throws out arms and legs like a starfish. More air drag, slower spin, glides a little, and the hands **grab** ledges, poles and ropes.

That's the whole control scheme: **aim once, then hold or release.** Because the body is a real ragdoll driven by joint motors (not canned animations), the in-between states (half-tucked, tucking as you hit a ramp, sprawling at the top of a bounce) come out of the physics. Players find tricks we never designed. That's where the depth comes from.

**Why it's fun in 20 seconds:** the launch feels great, the crashes are funny, and a retry takes one tap.
**Why it's fun for 2 hours:** you can learn to time tucks and sprawls and chain bounces, grabs and smashes into big combos, and there's always a better line through a course.

Tone: slapstick, cartoon, no gore. Hits give stars, "OOF!" text, wobbly eyes, and band-aids that build up on Dummy over a run.

---

## 2. Core loop

```
 ┌──────────────┐   ~2s    ┌──────────────┐  5–30s   ┌──────────────┐   1 tap
 │  AIM (drag)  │ ───────► │  FLIGHT      │ ───────► │  SCORE CARD  │ ─────────┐
 │ power+angle  │          │ hold=tuck    │          │ distance +   │          │
 └──────────────┘          │ release=     │          │ style combo  │          │
        ▲                  │ sprawl       │          └──────────────┘          │
        └──────────────────┴──────────────┴────────────────────────────────────┘
                              instant retry — no loading, no menus
```

The run ends when Dummy **comes to rest** (speed under a threshold for 1.5s) or passes the finish.

### Scoring

| Source | How |
|---|---|
| **Distance** | Base score, metres travelled along the course |
| **Airtime** | Points per second off the ground |
| **Flips** | Full torso rotations; tucked flips count ×1, sprawled flips ×2 (harder) |
| **Bounces** | Trampoline/surface rebounds in a chain without stopping |
| **Smash** | Breaking glass, crates, pins |
| **Grab** | Catching a pole/ledge/rope with a hand during sprawl; swinging off it is a bonus |
| **Pinball** | Hitting 3+ different surfaces within 1 second |
| **Landing** | Ending a run upright on two feet ("Stuck it!") gives a big multiplier |

Tricks build a **combo multiplier** that stays alive as long as Dummy keeps doing something new within ~1.5s. Repeating the same trick decays its value, so players have to mix tricks up.

---

## 3. Session design (elevator vs. lost evening)

| Time available | Mode | What you do |
|---|---|---|
| **10–60 seconds** | **Quick Fling** (default, opens straight in) | Endless procedural course. App opens on the aim screen, no taps needed first. Beat your best. |
| **2–5 minutes** | **Daily Gauntlet** | One seeded course, the same for everyone, all day. Unlimited tries, best counts. Ghost of your best run. |
| **15+ minutes** | **Stunt Book** (career) | ~60 handcrafted challenges in themed sets: *"Land in the bathtub," "Knock all 10 pins," "Grab 3 ropes without touching ground," "Score 50k without tucking."* 1–3 stars each. |
| **Open-ended** | **Junkyard** (sandbox) | Place props, spawn multiple Dummies, tweak gravity, slo-mo, save and share levels as a short code. |

Rules for the short-session case:
- **Cold start to first launch < 3 seconds.** No splash screens, no login.
- **Fully playable one-handed, portrait.** Thumb anywhere on screen: drag to aim, hold for tuck.
- **Closing the app mid-run loses nothing important.** Progress saves on every score card.
- **Works offline** (PWA).

---

## 4. Progression & unlocks

Unlocks change **physics** as well as looks, so each one gives you new ways to play:

| Suit | Effect |
|---|---|
| Default | Balanced |
| **Rubber** | Very bouncy, low grip, wild pinball runs |
| **Lead** | Heavy, smashes everything, short flights |
| **Wingsuit** | Sprawl gives real lift (glide control) |
| **Velcro** | Grabs anything, not just poles |
| **Noodle** | Weak joint motors, extra floppy, tuck is barely possible. A hard mode for experts. |

Launchers (also unlockable): **Slingshot** (default), **Cannon** (fixed angle, more power), **Catapult** (spins Dummy on release), **Bumper Car** (Dummy starts seated and gets ejected).

Unlock currency: **Stars** from the Stunt Book plus milestones ("travel 10 km total," "1,000 bounces"). No ads, no energy timers. Nothing should stop a 20-second session.

---

## 5. The physics (where the fun comes from)

### 5.1 Ragdoll rig (2D)

11 rigid bodies, 10 revolute joints:

```
            (head)
              │ neck
   upperArmL─(chest)─upperArmR
      │        │ spine      │
   foreArmL (pelvis)    foreArmR
            ╱     ╲
      thighL       thighR
         │            │
      shinL         shinR
```

- Each joint has **angle limits** (knees bend one way, the neck doesn't spin 360°).
- Each joint has a **motor** driving toward a target angle with **capped torque**. This is an *active ragdoll*: the body *tries* to reach a pose but physics can overpower it. Big hits knock Dummy out of a pose, and Dummy fights back toward it.
- **Pose targets:**
  - `TUCK`: knees to chest, arms wrapped, chin down. High motor torque.
  - `SPRAWL`: limbs extended, slight spread. Medium torque.
  - `DAZED` (for 0.4s after a very hard impact): motors drop to near zero, fully limp. This gives the funny floppy moments and stops tuck-spam from absorbing everything.
- **Pose blending:** targets interpolate over ~80ms so switching poses looks like a real body moving.
- Tucking pulls mass inward, so **angular velocity rises from conservation of angular momentum** without any special code. Spin control just works.

### 5.2 Engine choice

**Rapier 2D (`@dimforge/rapier2d-deterministic`, WASM)**, because:
- **Cross-platform determinism.** The same seed plus the same input timeline gives the same result on every device. That means replays and Daily Gauntlet ghosts can be stored as *input logs* (a few hundred bytes) instead of recorded positions, and shared as codes.
- Good joint motors, CCD for fast bodies (Dummy at 40 m/s hitting a thin glass pane must not tunnel through), and solid performance on phones.

Fallback: Planck.js (pure JS Box2D) if WASM gives us problems.

### 5.3 Simulation rules

- Fixed **120 Hz** physics step, decoupled from render, with interpolated rendering.
- Inputs are timestamped to physics ticks (for determinism and replays).
- Joint and body velocity clamps, plus a sanity check that resets a ragdoll if it ever "explodes" (a classic ragdoll bug).
- CCD enabled on all Dummy parts and thin props.

### 5.4 Prop catalogue (v1)

| Prop | Behaviour |
|---|---|
| Trampoline | High restitution; tuck on contact gives a bigger bounce |
| Fan | Force field; sprawl catches far more air than tuck |
| Seesaw | Hinged plank; can launch other props *at* you |
| Wrecking ball | Pendulum, timing hazard or launch opportunity |
| Glass pane | Breaks above an impulse threshold (tuck gets through, sprawl bounces off) |
| Crates | Stackable, breakable |
| Bowling pins | Light, scatter beautifully |
| Conveyor | Surface velocity |
| Rope / pole | Grab targets for sprawl; ropes are jointed chains |
| Booster cannon | Catches Dummy and re-fires along a fixed vector |
| Sticky wall | Absorbs momentum, a "stop here" puzzle element |
| Ice | Zero friction; sliding combos |

Each prop is designed so **tuck and sprawl interact with it differently**. That rule is what makes the one-button control deep.

---

## 6. Course generation (Quick Fling & Daily)

- The course is built from **hand-authored chunks** (~40 to start), each 15–30 m long, tagged by difficulty and "flow type" (bounce, smash, grab, slide).
- Chunks are stitched by seeded RNG with rules: entry and exit heights must match, flow types vary, difficulty ramps up with distance.
- This keeps the hand-tuned feel of designed levels with endless variety. The same seed system powers the Daily Gauntlet (`seed = date`).

---

## 7. Game feel ("juice") checklist

- **Hit-stop**: 30–60ms freeze on big impacts, scaled by impulse.
- **Slo-mo**: brief 0.3× time on near misses, grabs and huge smashes.
- **Camera**: leads in the direction of velocity, zooms out with speed, small shake on impact.
- **Audio**: impact sounds picked and pitched by impulse and material; Dummy grunts; an "ooOOOoo" voice that rises with airtime; a crowd that reacts to the combo.
- **Trick popups** that stack ("FLIP! ×2 · SMASH · PINBALL!").
- **Band-aids & stars** pile up on Dummy across the run, so the damage is a visual record of the run.
- **Replay**: the score card plays your best 3 seconds in slo-mo automatically. One tap exports a GIF.

---

## 8. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite |
| Physics | Rapier 2D deterministic (WASM) |
| Rendering | PixiJS (WebGL, falls back to canvas) |
| Audio | Web Audio API (small synthesized/sample set) |
| Platform | Mobile-first web + PWA (installable, offline). Wrap with Capacitor later for app stores if wanted. |
| Persistence | localStorage / IndexedDB for progress; replays as compact input logs |
| Tests | Vitest: determinism tests (same seed + inputs ⇒ identical final state hash), scoring unit tests |

### Proposed structure

```
src/
  main.ts              boot, game loop (fixed step + interpolation)
  physics/
    world.ts           Rapier setup, step, CCD config
    ragdoll.ts         rig construction, joint limits, motors
    poses.ts           TUCK / SPRAWL / DAZED targets + blending
    grab.ts            hand-to-prop temporary joints
  props/               one file per prop type + registry
  course/
    chunks/            JSON chunk definitions
    generator.ts       seeded stitching
  game/
    run.ts             run state machine (aim → flight → rest → score)
    scoring.ts         trick detection + combo system
    input.ts           drag-aim, hold/release, tick-stamped log
    replay.ts          record/playback from input logs
  render/              Pixi scene, camera, particles, popups
  audio/
  ui/                  score card, menus, Stunt Book
tests/
```

---

## 9. Milestones

Each milestone ends with something playable. **M0 is a go/no-go check:** if flinging the ragdoll around an empty room isn't fun for 10 minutes with no goals, nothing built on top will save it, so we tune until it is.

| # | Milestone | Deliverable | Done when |
|---|---|---|---|
| **M0** | **Physics toy** | Ragdoll + slingshot + tuck/sprawl, flat ground, a trampoline, a wall, some pins. Debug sliders for motor torque, mass, restitution. | Launching and crashing is fun with no score. Tuck spin-up feels clearly different from sprawl. |
| **M1** | **Core loop** | Run state machine, 10 course chunks + generator, distance/airtime/flip scoring, instant retry, mobile touch input, portrait layout. | A full run takes < 30s; retry < 0.5s; plays well on a phone. |
| **M2** | **Juice pass** | Hit-stop, slo-mo, camera, audio, popups, band-aids, auto-replay on the score card. | Playtesters laugh on their first crash. |
| **M3** | **Depth** | Full trick set (bounce, smash, grab, pinball, stuck-landing), combo multiplier, all v1 props, 40 chunks. | Skilled players reliably score 3–5× new players. |
| **M4** | **Meta** | Daily Gauntlet + ghosts (deterministic replays), suits, launchers, stats, unlocks. | A reason to come back tomorrow. |
| **M5** | **Stunt Book** | 60 handcrafted challenges, star ratings. | 2+ hours of designed content. |
| **M6** | **Junkyard & share** | Sandbox editor, level share codes, GIF export, PWA offline install. | A level made on one phone loads on another. |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Ragdoll feels floaty or mushy | M0 exists to tune this; expose every parameter as a live slider; reference real fall footage for timing |
| Physics explosions / jitter | Velocity clamps, joint limit softness tuning, 120 Hz step, auto-reset guard |
| Tunnelling at high speed | CCD on all dynamic Dummy parts and thin props |
| Determinism breaks (ghosts desync) | Deterministic Rapier build, no `Math.random` in sim (seeded RNG only), CI test that hashes the final state |
| One-button control feels shallow | The "every prop reacts differently to tuck vs. sprawl" rule; Stunt Book challenges that teach advanced timing |
| Mobile perf | Cap active debris bodies (sleep/despawn off-screen), pool particles, budget 2ms/frame for physics |

---

## 11. First step

Start **M0**: scaffold Vite + TypeScript + Rapier + Pixi, build the 11-part active ragdoll with TUCK/SPRAWL motors, a slingshot launcher, and a small test room with a debug tuning panel. Then play it and tune it until it's fun before building anything else.
