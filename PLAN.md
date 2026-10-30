# TUMBLER: Concept & Plan

> You're a wobbly temp worker with noodle arms. Grab, carry, throw, stack and press your way through bite-sized odd jobs, in about 30 seconds each. The challenge isn't figuring out what the job is. It's getting your body to do it.

---

## 1. The pitch

**Tumbler** works for *Odd Jobs Ltd.*, a temp agency that sends them on short, simple gigs: *deliver this pizza, ring that doorbell, stack these boxes, throw the newspaper onto the porch, hang this painting.* A toddler could do any of them. Tumbler can't, because Tumbler is an **active ragdoll**: their legs run on their own, their arms flail toward wherever you point them, and their hands grab whatever they touch.

Every job is obvious. Doing it is a fight with physics, and that's the joke and the game:

- The pizza box flops off your arm on the stairs.
- You wind up a throw, let go too late, and hit yourself in the face.
- You stack box five, step back proudly, trip, and take the tower down with you.

**Why it's fun in 30 seconds:** one job, one obvious goal, a funny failure, retry in a tap.
**Why it's fun for 2 hours:** the controls have a real skill ceiling (momentum throws, climbing, two-handed carries, using props as tools), and jobs can be solved many ways. Speedruns and silly solutions both count.

Tone: slapstick, warm, no gore. Tumbler is clumsy and determined, never hurt, and gets back up with a little "hup!"

---

## 2. Controls

The body does the low-level work. You give it **intent**.

| Action | Phone (landscape, two thumbs) | Keyboard + mouse |
|---|---|---|
| **Move** | Left thumb: virtual stick (left/right) | A / D |
| **Jump** | Flick the stick up | W / Space |
| **Reach** | Right thumb: drag anywhere. Both hands reach toward that point, relative to the body | Mouse position |
| **Grab** | While the right thumb is down, hands grip whatever they touch | Hold left / right mouse button (one per hand) |
| **Let go / throw** | Lift the right thumb. Thrown objects keep the hand's real velocity, so flicking fast throws hard | Release the button |

Key decisions:

- **Arms are physical.** Hands are pulled toward the target by joint motors with *limited strength*, so they swing, overshoot and wobble. Heavy objects drag your arms down, and fast flicks make the whole body lurch. Nothing is animated. Every throw is real physics.
- **Throwing has no aim meter.** You swing the hand and let go. Timing and arc are the skill.
- **Balance is assisted, not guaranteed.** An "upright spring" keeps the torso up, but a big hit, a heavy load, or running into a doorframe can knock it over. Then Tumbler sits up and recovers in ~0.7s. Falls cost time, not lives.
- **Legs are automatic.** A procedural gait drives the legs while you push the stick. You never control legs directly. Hands are hard enough.

---

## 3. What you can do with the body

Every job is built from a small set of physical verbs, so skill carries over between jobs:

| Verb | How it works physically |
|---|---|
| **Grab** | Hand touches a grabbable surface while grip is held → temporary joint between hand and object |
| **Carry** | Grab + move; heavy items slow you, tall items wobble and tip |
| **Two-hand carry** | Grab with both hands, so wide or heavy objects stay steady (phone: both hands grab together by default) |
| **Throw** | Swing + release; velocity comes from the hand |
| **Press / punch** | Hand hits a button or lever above a force threshold |
| **Push / pull** | Grab a heavy object and walk |
| **Climb** | Grab a ledge, reach up, and the body pulls itself up toward the hand |
| **Swing** | Grab a rope or bar and pump with the stick |
| **Tool use** | Grabbed objects become extensions of the arm: a broom to reach a button, a plank as a ramp, a box to stand on |

Tool use is where players come up with their own solutions. The doorbell is too high? Stack a crate, throw a shoe at it, or climb the drainpipe.

---

## 4. The jobs (gig catalogue)

Each gig is a tiny side-on room or street, **15–60 seconds**, with one clear goal shown as a picture (no reading needed).

| Gig | Goal | What goes wrong |
|---|---|---|
| **Paper Route** | Throw newspapers onto porches while running past | Timing your throws while moving; windows break if you throw too hard |
| **Doorbell** | Ring a bell that's slightly too high | Jumping and punching, or finding something to stand on |
| **Pizza Up** | Carry a pizza up three flights of stairs | The box slides off a tilted arm; it has to arrive flat |
| **Stack It** | Build a tower of mismatched boxes to a height line | Placing gently with wobbly hands; your own elbow is the biggest threat |
| **Hang the Painting** | Get a frame onto a wall hook, level | Fine control, two hands |
| **Moving Day** | Get a sofa through a door into the van | Rotating a big object; it pins you to the wall |
| **Basket Case** | Throw 5 laundry socks into a basket across the room | Pure throwing skill |
| **Plant Sitter** | Water 4 plants with a watering can (particle water) | Tilt control: too much and you flood the floor |
| **Button Panic** | Press flashing buttons spread around the room before they time out | Lunging and punching under time pressure |
| **Fetch** | Get a cat out of a tree | Climbing; the cat is also a ragdoll and doesn't want to come |
| **Bowling Alley Repair** | Reset 10 pins upright | Delicate placement; knocking one over knocks others |
| **Window Washer** | Scrub dirt spots on a building while hanging from a rope | Swinging and reaching at the same time |

Launch target: **~24 gigs**, each with 3 variants (layout, objects, hazards), so ~72 different rounds.

### Scoring per gig
- **Done / not done** (the core).
- **Time** → 1–3 stars.
- **Bonus tags** for style and chaos: *No Falls*, *One-Throw*, *Trick Shot* (bank a throw off a wall), *Butterfingers* (dropped it 5 times and still finished), *Collateral* (broke 3+ things on the way). Silly failures get rewarded too, so failing is still fun.

---

## 5. Session design (elevator vs. lost evening)

| Time | Mode | What it is |
|---|---|---|
| **30 seconds** | **Quick Gig** (default) | App opens straight into a random gig. Finish it, tap, next gig. No menus. |
| **2–3 minutes** | **Shift** | 5 gigs back to back with a shared clock, then a pay slip with your total. Each day's Daily Shift is seeded the same for everyone, with ghost replays. |
| **15+ minutes** | **Career** | Work your way through the town's neighbourhoods (Suburb → Docks → Downtown → Skyscraper). Earnings unlock new gigs, harder variants and "boss jobs" (e.g. *move a piano down a hill*). |
| **Open-ended** | **Tower** | Endless stacking. Random junk arrives on a conveyor; build as high as you can before it falls. Global leaderboard. Easy to start and hard to put down. |
| **Open-ended** | **Day Off** | Sandbox: a town street full of props. Mess around, set up stunts, record clips. |

Rules for the short-session case:
- **Cold start to playing < 3 seconds.** No login, no splash, no tutorial screens. The first gig is the tutorial.
- **Each gig is self-explanatory** from one icon and the room layout.
- **Leaving mid-gig loses nothing.** Progress saves after every gig.
- **Offline-capable** (PWA).

---

## 6. Progression & unlocks

Unlocks change the **body**, which changes how you solve jobs:

| Unlock | Effect |
|---|---|
| **Long Arms** | Huge reach, but weaker grip and more flail |
| **Strongman** | Heavy items feel light; delicate jobs get harder |
| **Sticky Gloves** | Easier grabs; letting go cleanly is harder |
| **Short Legs** | Faster, lower, wobblier |
| **Big Head** | Purely cosmetic, very funny |
| **Uniforms / hats** | Cosmetic, earned from bonus tags |

Tools you can bring on a job (one slot): **Plunger** (sticks to walls), **Umbrella** (slow fall), **Broom** (extra reach), **Spring Shoes** (big jumps). Some gigs get much easier, or much funnier, with the right tool.

Currency is **wages** from gigs. No ads, no energy, no timers that stop a short session.

---

## 7. The physics

### 7.1 Engine & view
- **2D side-on.** Stacking and throwing read clearly from the side, it plays well on a phone, and the scope stays manageable.
- **Rapier 2D, deterministic build (WASM).** It has good joint motors, CCD for fast throws, and gives identical results on every device. That makes Daily Shift ghosts and replays tiny input logs instead of video.
- Fixed **120 Hz** step, interpolated rendering, seeded RNG only inside the simulation.

### 7.2 Tumbler's rig

```
             (head)
               │ neck
   upperArmL─(chest)─upperArmR
       │       │ spine     │
   foreArmL (pelvis)   foreArmR
      │       ╱   ╲        │
   handL  thighL  thighR  handR
             │      │
           shinL  shinR
            (feet)
```

- **13 bodies**: head, chest, pelvis, 2× upper arm, 2× forearm, 2× hand, 2× thigh, 2× shin.
- Joints have angle limits and **PD motors with capped torque**.
- **Arm controller:** two-bone IK computes target shoulder/elbow angles toward the reach point; motors chase them with limited strength. That limit is where the flail comes from, so tuning it is the most important part of the game feel.
- **Balance controller:** torque on chest and pelvis toward upright, scaled by "stability", which drops when hit hard, when carrying a lot, or when falling. Below a threshold Tumbler falls over, then a recovery routine stands them back up.
- **Gait:** procedural stepping (target foot positions from velocity, leg motors chase them). It looks a bit drunk, on purpose.
- **Grip:** on contact while grip is held, create a weld/revolute joint between hand and object, with a break force so very heavy loads or sharp yanks rip free.

### 7.3 Objects
- Each prop has mass, friction, restitution, a "grabbable" flag, and an optional **breakable** threshold.
- Goal triggers are physical checks: *object inside zone and resting for 0.5s*, *button impulse > X*, *tower top > height line for 3s*.

---

## 8. Game feel ("juice") checklist

- **Hit-stop** (40ms) on big impacts and on clean throws landing in a target.
- **Slo-mo** on trick shots and on the final moment of a gig ("will it land?").
- **Camera** frames Tumbler plus the current goal, zooms out for long throws.
- **Audio**: effort grunts that scale with load, a "hup!" on recovery, satisfying thunks per material, a jingle and cash-register sound on job completion.
- **Faces**: Tumbler's eyes track the held object and widen when they're about to fall.
- **Instant replay** of the last 4 seconds on every completion and every great failure. One tap to share as a GIF.

---

## 9. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite |
| Physics | Rapier 2D deterministic (WASM) |
| Rendering | PixiJS |
| Audio | Web Audio API |
| Platform | Mobile-first web + PWA; Capacitor wrapper for app stores later |
| Persistence | localStorage / IndexedDB; replays as input logs |
| Tests | Vitest: determinism hash tests, goal-trigger tests, controller unit tests |

### Proposed structure

```
src/
  main.ts                 boot, fixed-step loop + interpolation
  physics/
    world.ts              Rapier setup, stepping, CCD
    body/
      rig.ts              build Tumbler's 13-part ragdoll
      armController.ts    IK reach targets → motor targets
      balance.ts          upright torque, stability, fall/recover
      gait.ts             procedural stepping
      grip.ts             hand ↔ object joints, break forces
  props/                  prop definitions (box, pizza, sock, button, rope, …)
  gigs/
    gig.ts                gig interface: setup, goal check, scoring tags
    paperRoute.ts … tower.ts
  modes/                  quickGig, shift, career, tower, dayOff
  input/                  touch sticks, mouse/keyboard, tick-stamped log
  replay/                 record/playback
  render/                 Pixi scene, camera, faces, particles
  audio/
  ui/                     job icon, pay slip, star screen, menus
tests/
```

---

## 10. Milestones

**M0 is a go/no-go check:** if walking around an empty room grabbing and throwing boxes isn't fun on its own, no job built on top will fix it. We tune until it is.

| # | Milestone | Deliverable | Done when |
|---|---|---|---|
| **M0** | **Body toy** | Rig, balance, gait, arm reach, grip, throw. One room with boxes, a ball and a button. Live tuning sliders (arm strength, balance, grip force). Mouse+keyboard and touch. | Throwing a ball at a button is funny and satisfying; you can stack 3 boxes with practice. |
| **M1** | **First gigs** | Gig framework (goal triggers, timer, stars), 4 gigs: Basket Case, Doorbell, Stack It, Pizza Up. Quick Gig mode with instant next/retry. | A new player completes a gig in < 60s and immediately wants the next one. |
| **M2** | **Juice** | Faces, audio, hit-stop, slo-mo, camera framing, instant replay. | Playtesters laugh during their first minute. |
| **M3** | **Content & depth** | 12 gigs with variants, bonus tags, climbing/swinging/tool use, Shift mode. | Experienced players finish gigs 3× faster than new ones. |
| **M4** | **Meta** | Career map, wages, body unlocks, tools, Daily Shift with ghosts. | A reason to come back tomorrow. |
| **M5** | **Tower & Day Off** | Endless Tower with leaderboard, sandbox street. | Sessions over 20 minutes in Tower. |
| **M6** | **Ship polish** | 24 gigs, PWA offline, GIF sharing, performance pass on low-end phones. | Runs at 60fps on a 4-year-old phone. |

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Controls feel frustrating instead of funny | M0 is a go/no-go check; arm strength and balance on live sliders; tune toward "barely in control"; never punish falls harshly |
| Two-thumb touch is hard on small screens | Generous dead zones, reach target relative to the body (not absolute), optional one-hand mode for simple gigs |
| Physics explosions with grips and stacks | Grip joint break forces, velocity clamps, 120 Hz step, sleeping for resting stacks |
| Gigs feel samey | Every gig must stress a *different* verb; variants change the solution, not just the layout |
| Determinism breaks ghosts | Deterministic Rapier build, no `Math.random` in sim, CI hash test |
| Mobile performance | Small rooms, capped debris, sleep resting bodies, 2ms physics budget |

---

## 12. First step

Start **M0**: scaffold Vite + TypeScript + Rapier + Pixi, build Tumbler's 13-part active ragdoll with balance, gait, IK arm reach and grip, then a test room with boxes, a ball and a button, plus a tuning panel. Play it and tune it until grabbing and throwing are fun on their own.
