# TUMBLER: Concept & Plan

> You're a wobbly temp worker with noodle arms. Grab, carry, throw, stack and press your way through bite-sized odd jobs, in about 30 seconds each. The challenge isn't figuring out what the job is. It's getting your body to do it.

---

## 1. The pitch

**Stanley** (surname Tumbler, though the game keeps that quiet until the very end) works for *Odd Jobs Ltd.*, a temp agency that sends him on short, simple gigs: *deliver this pizza, ring that doorbell, stack these boxes, throw the newspaper onto the porch, hang this painting.* A toddler could do any of them. Stanley can't, because Stanley is an **active ragdoll**: his legs run on their own, his arms flail toward wherever you point them, and his hands grab whatever they touch.

Every job is obvious. Doing it is a fight with physics, and that's the joke and the game:

- The pizza box flops off your arm on the stairs.
- You wind up a throw, let go too late, and hit yourself in the face.
- You stack box five, step back proudly, trip, and take the tower down with you.

**Why it's fun in 30 seconds:** one job, one obvious goal, a funny failure, retry in a tap.
**Why it's fun for 2 hours:** the controls have a real skill ceiling (momentum throws, climbing, two-handed carries, using props as tools), and jobs can be solved many ways. Speedruns and silly solutions both count.

Tone: slapstick, warm, no gore. Stanley is clumsy and determined, never hurt, and gets back up with a little "hup!" Between chapters, Performance Review cutscenes with his relentlessly upbeat boss poke fun at work culture (see §7).

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
- **Balance is assisted, not guaranteed.** An "upright spring" keeps the torso up, but a big hit, a heavy load, or running into a doorframe can knock it over. Then Stanley sits up and recovers in ~0.7s. Falls cost time, not lives.
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
| **15+ minutes** | **Career** | Work your way through the town's neighbourhoods (Suburb → Docks → Downtown → Skyscraper). Earnings unlock new gigs, harder variants and "boss jobs" (e.g. *move a piano down a hill*). Each chapter ends with a Performance Review cutscene (§7). |
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

## 7. Story: Performance Reviews

Between Career chapters, Stanley is called into the boss's office for a **Performance Review**: a short, skippable cutscene that is mostly a joke about work culture. The jobs always technically got done. The clients are never happy. Nobody ever says why.

### 7.1 The cast

- **Stanley.** Never speaks. Communicates entirely through flailing, the occasional "hup!", and a hopeful face. Completely sincere about wanting to do a good job.
- **The Boss (Gerald).** Sits behind an enormous desk and never stands up. Unflappable, endlessly upbeat, fluent in corporate euphemism. Treats every disaster as a "learning" and every review ends with total confidence that the *next* job will be a better fit. Physically he's an active ragdoll too, but with very strong motors, so he barely reacts as things crash around him. He just sips his coffee.

### 7.2 How a review plays

Each review follows the same five beats, so it lands in about 30–40 seconds:

1. **The walk-in.** Stanley walks from the door to the chair. This is the **real ragdoll on a scripted path**, so what gets knocked over is different every time. The office is full of physics props: a pen cup, a desk plant, a stack of mugs, a Newton's cradle, a water cooler, the nameplate, a framed photo, an "Employee of the Month" board.
2. **The good news.** The boss opens with the stats: every job on the sheet is marked *complete*.
3. **The client feedback.** He reads it out, picking the most positive possible phrasing. The feedback is clearly about the chaos, but nobody says so.
4. **The pivot.** The problem was never Stanley. It was the *fit*. The next neighbourhood will suit his talents perfectly.
5. **The walk-out.** More collateral damage. The boss doesn't look up.

**Reactive one-liners ("barks"):** the boss has short lines for whatever the physics actually did during the walk-in and walk-out, chosen from what got hit:

| What happened | Boss |
|---|---|
| Mug knocked off the desk | "That's fine. I have a mug for every day of the year." |
| Pen cup scattered | "Those were the good pens. Were." |
| Nameplate knocked flat | "Leave it. It's a nameplate. Everyone knows who I am." |
| Plant knocked over | "It's fake." *(beat)* "It was real." |
| Newton's cradle set off | "That's actually how it's meant to work. Rare win." |
| Stanley falls over | "Take a seat. Or, yes, the floor is fine." |
| Water cooler toppled | "Great news, everyone. We're hydrated." |
| Stanley grabs the boss | "Let's keep this professional. Hugs are a calendar invite." |
| Employee of the Month board falls | It has Stanley's photo for every month. "Unanimous, every month. The committee is very… the committee is me." |
| Nothing breaks at all | *Long pause.* "Huh." *(writes something down)* |

**Hidden clues for the ending:** they're in every review but easy to miss on the first playthrough.
- The **nameplate** is always turned away, half-hidden behind a mug, or knocked flat before the camera can read it.
- The **framed family photo** on the desk always faces away from the camera.
- Every review ends with the boss saying, as polite office small talk, *"Say hi to your mother."*
- Stanley's pay slips have a line item: *"Family discount (applied to you)."*
- Stanley's name badge, pay slips and job sheets only ever say **"Stanley T."** The surname is never spelled out until the reveal.
- The Employee of the Month board, above.

### 7.3 The script (draft)

**Onboarding (before the first job)**
> "Welcome to Odd Jobs Ltd! We're not a company, we're a family." *(beat)* "Legally, we're a company."
>
> "Here we believe there's no such thing as a bad worker. Only bad fits. And unlimited second chances. I've taken the liberty of pre-approving all of them."
>
> "Your first assignment is ringing a doorbell. I'm told it's entry level. I'm told it's *the* entry level."

**Review 1: after the Suburb**
> "Good news! Every job on your sheet is marked *complete*."
>
> "Client feedback. Mrs. Henderson confirms her newspaper was 'definitely delivered.' Also the porch. And the window. She says it's all 'inside now.'"
>
> "Mr. Patel has asked us not to send 'the energetic one' again. I've chosen to read that as a compliment about your energy."
>
> "Mrs. Okafor's feedback form just says 'why' forty times. That's what we call engagement."
>
> "Honestly? The suburbs were never a good fit for you. Too many… surfaces. The Docks are wide open. You're going to *thrive*."
>
> "Say hi to your mother."

**Review 2: after the Docks**
> "Every crate reached its destination. Several of them reached several destinations."
>
> "The harbourmaster used the word 'unprecedented' in an email. I've asked HR to frame it."
>
> "Our lawyers confirm the ship was still technically *in* the water when you left, which counts."
>
> "We received more feedback this quarter than every previous quarter combined. That's what we in the business call growth."
>
> "The Docks were just too nautical for someone with your gifts. Downtown is where the professionals are. Wear a tie." *(watches Stanley flail)* "No tie. Ties are a grabbing hazard."
>
> "Say hi to your mother."

**Review 3: after Downtown**
> "The office move: complete. Everything arrived. The client says the sofa is now 'load-bearing.'"
>
> "They've rated us one star. That's up from zero, because they *added* a zero option. Specifically for us."
>
> "Their CFO says she's never seen anyone hang a painting like that. I believe her."
>
> "People throw around words like 'erratic.' I prefer 'agile.'"
>
> "Downtown was, in hindsight, too *down*. What you need is altitude. A skyscraper. Fifty floors. Washing windows. I genuinely can't think of a single way that goes wrong."
>
> "Say hi to your mother."

**Review 4 / the reveal: after the Skyscraper**
> "All twelve hundred windows: clean. The client also wants me to pass on that they're 'open.' All of them. On a windy day. Their entire Q3 strategy is now in the river."
>
> "I've now placed you in every department, every neighbourhood and every job category we offer. I invented three new ones. 'Senior Associate Doorbell Consultant' was a real stretch for HR."
>
> *(He leans back and steeples his fingers. Long pause. For the first time the nameplate is standing upright and in focus: **GERALD TUMBLER, CEO**. The family photo slowly swivels round: Gerald, Mum, and a tiny Stanley in a tiny cap, mid-flail.)*
>
> "Son…"
>
> "…since it doesn't seem that you're actually capable of working, I'm just going to give you my company instead."
>
> "It's what your grandfather did for me."
>
> *(Stanley celebrates by flailing, which knocks the nameplate off the desk. Gerald calmly produces a matching nameplate from his drawer: **STANLEY TUMBLER, CEO**. He has clearly had it ready for years.)*

### 7.4 The final job: "Executive Action"

The last gig in the game. Stanley, now CEO, has one task: **move a file from one place to another.** A single manila folder is on the desk; the filing cabinet is across the corner office.

- The whole staff (and every client from the campaign) is pressed against the glass wall watching.
- There's no timer and no fail state. Whatever chaos happens on the way (and the office gets destroyed), the job completes the moment the file is in the cabinet.
- **The staff go wild:**
  > "He did a task. Himself!"
  >
  > "Twenty-two years here and I've never seen a CEO touch paper."
  >
  > "Is that… is that what initiative looks like?"
  >
  > "Somebody get his signature on that file. That file's going in a museum."
- Confetti. A press release scrolls by: *"CEO Personally Relocates Document; Shares Up 40%."* Mrs. Henderson submits her first five-star review.
- **Post-credits:** Gerald on a golf course gets a text: *"he moved a file."* He looks out at the horizon. *"That's my boy."*
- End card: *Odd Jobs Ltd. We're a family. (Legally a company.)*

### 7.5 Keeping it out of the way of short sessions

- Reviews only play **at the end of a Career chapter**, never in Quick Gig, Shift or Tower.
- **Hold to skip** at any point. Every review can be rewatched from a *Personnel File* menu, with clues you've spotted ticked off.
- Quick Gig and Shift get a one-line **memo from the boss** on the score card instead, to keep the joke going without stopping play, e.g. *"MEMO: Client says the pizza was 'technically' delivered. Great hustle!"*, *"MEMO: Reminder that the stairs are not a shortcut."*, *"MEMO: Your enthusiasm has been noted. By the fire department."*

### 7.6 How it's built

- **Office scene** is a normal physics room. The walk-in and walk-out are a scripted `Intent` timeline fed to the real Stanley controller, so the chaos is always live physics, never canned animation.
- **Barks** fire off physics events (prop tipped past 60°, prop hit the floor, Stanley posture `down`, hand grip on the boss). One bark at a time, with a short cooldown.
- **Dialogue** runs from per-review script files (`src/story/*.json`): speech bubbles with typewriter text, tap to advance, hold to skip.
- **Reveal camera**: a small scripted camera (pan, zoom, hold) for the nameplate and photo reveal.

---

## 8. The physics

### 8.1 Engine & view
- **2D side-on.** Stacking and throwing read clearly from the side, it plays well on a phone, and the scope stays manageable.
- **Rapier 2D, deterministic build (WASM).** It has good joint motors, CCD for fast throws, and gives identical results on every device. That makes Daily Shift ghosts and replays tiny input logs instead of video.
- Fixed **120 Hz** step, interpolated rendering, seeded RNG only inside the simulation.

### 8.2 Stanley's rig

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
- **Balance controller:** torque on chest and pelvis toward upright, scaled by "stability", which drops when hit hard, when carrying a lot, or when falling. Below a threshold Stanley falls over, then a recovery routine stands him back up.
- **Gait:** procedural stepping (target foot positions from velocity, leg motors chase them). It looks a bit drunk, on purpose.
- **Grip:** on contact while grip is held, create a weld/revolute joint between hand and object, with a break force so very heavy loads or sharp yanks rip free.

### 8.3 Objects
- Each prop has mass, friction, restitution, a "grabbable" flag, and an optional **breakable** threshold.
- Goal triggers are physical checks: *object inside zone and resting for 0.5s*, *button impulse > X*, *tower top > height line for 3s*.

---

## 9. Game feel ("juice") checklist

- **Hit-stop** (40ms) on big impacts and on clean throws landing in a target.
- **Slo-mo** on trick shots and on the final moment of a gig ("will it land?").
- **Camera** frames Stanley plus the current goal, zooms out for long throws.
- **Audio**: effort grunts that scale with load, a "hup!" on recovery, satisfying thunks per material, a jingle and cash-register sound on job completion.
- **Faces**: Stanley's eyes track the held object and widen when he's about to fall.
- **Instant replay** of the last 4 seconds on every completion and every great failure. One tap to share as a GIF.

---

## 10. Tech stack

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
      rig.ts              build Stanley's 13-part ragdoll
      armController.ts    IK reach targets → motor targets
      balance.ts          upright torque, stability, fall/recover
      gait.ts             procedural stepping
      grip.ts             hand ↔ object joints, break forces
  props/                  prop definitions (box, pizza, sock, button, rope, …)
  gigs/
    gig.ts                gig interface: setup, goal check, scoring tags
    paperRoute.ts … tower.ts
  modes/                  quickGig, shift, career, tower, dayOff
  story/                  office scene, review scripts (JSON), barks, dialogue UI, memos
  input/                  touch sticks, mouse/keyboard, tick-stamped log
  replay/                 record/playback
  render/                 Pixi scene, camera, faces, particles
  audio/
  ui/                     job icon, pay slip, star screen, menus
tests/
```

---

## 11. Milestones

**M0 is a go/no-go check:** if walking around an empty room grabbing and throwing boxes isn't fun on its own, no job built on top will fix it. We tune until it is.

| # | Milestone | Deliverable | Done when |
|---|---|---|---|
| **M0** | **Body toy** | Rig, balance, gait, arm reach, grip, throw. One room with boxes, a ball and a button. Live tuning sliders (arm strength, balance, grip force). Mouse+keyboard and touch. | Throwing a ball at a button is funny and satisfying; you can stack 3 boxes with practice. |
| **M1** | **First gigs** | Gig framework (goal triggers, timer, stars), 4 gigs: Basket Case, Doorbell, Stack It, Pizza Up. Quick Gig mode with instant next/retry. | A new player completes a gig in < 60s and immediately wants the next one. |
| **M2** | **Juice** | Faces, audio, hit-stop, slo-mo, camera framing, instant replay. | Playtesters laugh during their first minute. |
| **M3** | **Content & depth** | 12 gigs with variants, bonus tags, climbing/swinging/tool use, Shift mode. | Experienced players finish gigs 3× faster than new ones. |
| **M4** | **Meta & story** | Career map, wages, body unlocks, tools, Daily Shift with ghosts. Office scene, onboarding and Reviews 1–3, barks, score-card memos. | A reason to come back tomorrow, and playtesters quote the boss. |
| **M5** | **Tower & Day Off** | Endless Tower with leaderboard, sandbox street. | Sessions over 20 minutes in Tower. |
| **M6** | **Ship polish** | The reveal, the "Executive Action" final job and the ending. 24 gigs, PWA offline, GIF sharing, performance pass on low-end phones. | Runs at 60fps on a 4-year-old phone. |

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Controls feel frustrating instead of funny | M0 is a go/no-go check; arm strength and balance on live sliders; tune toward "barely in control"; never punish falls harshly |
| Two-thumb touch is hard on small screens | Generous dead zones, reach target relative to the body (not absolute), optional one-hand mode for simple gigs |
| Physics explosions with grips and stacks | Grip joint break forces, velocity clamps, 120 Hz step, sleeping for resting stacks |
| Gigs feel samey | Every gig must stress a *different* verb; variants change the solution, not just the layout |
| Determinism breaks ghosts | Deterministic Rapier build, no `Math.random` in sim, CI hash test |
| Mobile performance | Small rooms, capped debris, sleep resting bodies, 2ms physics budget |

---

## 13. Status

**M0 body toy: done.**

**M1 first gigs: done**, plus some M2 polish and the start of M4's story work:
- Chapter 1 "The Suburb": Ding Dong, Laundry Day, Stack It, Pizza Up.
- Onboarding and Performance Review #1 cutscenes, with live physics and Gerald's reactions to whatever breaks.
- Stars, bonus tags, boss memos, job board, saved progress, instant restart.
- Polish: intro cards with an establishing shot of the goal, an off-screen goal marker, confetti and slow-mo on completion, camera shake, landing dust, synthesized sound for impacts, throws, the doorbell and Gerald's voice.

Changes from the plan:
- Rendering uses plain Canvas2D; PixiJS isn't needed yet.
- Balance and climbing use assisted forces (pelvis hover spring, mantle assist). The arms stay fully physical.
- Upper arms and forearms don't collide with level geometry, so they don't snag. Hands do.
- Stairs look like steps but Stanley walks on a hidden ramp; props still tumble down the real steps.
- Buttons count a hard smack from any side, not just a push straight in.
- Grabs near a ledge corner slide the hand onto the corner over a few frames.

**Chapter 2 "The Docks": done.** Crate Expectations, Fish Toss, Roll Out the Barrels, Crow's Nest, and Performance Review #2. New systems: water (buoyancy, splash and respawn), slippery fish, a ship's bell, and a cap on how far Stanley steps up without jumping (so he pushes barrels instead of floating over them).

**Hidden surprises:** every job has one or two, saved to progress and counted on the job board. Several of them are early clues for the Gerald reveal.

Next: Chapter 3 "Downtown" (office move, hanging a painting, Review #3), then Quick Gig / Shift modes.

## 14. First step (done)

Start **M0**: scaffold Vite + TypeScript + Rapier + Pixi, build Stanley's 13-part active ragdoll with balance, gait, IK arm reach and grip, then a test room with boxes, a ball and a button, plus a tuning panel. Play it and tune it until grabbing and throwing are fun on their own.
