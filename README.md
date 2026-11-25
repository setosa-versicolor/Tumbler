# Tumbler

A wobbly active-ragdoll game about Stanley, who does simple odd jobs with a body that won't cooperate. See [PLAN.md](PLAN.md) for the full concept and roadmap.

**Current state: the whole game is playable, start to finish.**

- **Chapter 1, The Suburb:** onboarding cutscene, then **Ding Dong**, **Laundry Day**, **Stack It** and **Pizza Up**, then Performance Review #1.
- **Chapter 2, The Docks:** **Crate Expectations** (crates onto a boat across open water; there's a gangplank if you think of it), **Fish Toss** (slippery fish into an ice bin), **Roll Out the Barrels** (heavy barrels into the hold, past a bollard) and **Crow's Nest** (climb the rigging, ring the ship's bell), then Performance Review #2.
- **Chapter 3, Downtown:** **Moving Day** (a sofa through a doorway and up a ramp into a van; it won't fit overhead), **Hang the Painting** (onto a hook, level; there's a stool), **Pin Reset** (stand six bowling pins back up; grab one by the end and it dangles straight) and **Coffee Run** (a tray of four coffees across the office without spilling), then Performance Review #3.
- **Chapter 4, The Skyscraper:** **Window Washer** (ride the cradle up and down the building, scrubbing the grime as it passes), **Mail Room** (parcels into the shelf of their colour, up the wall), **Shred It** (paper flutters; there's a fan) and **Fire Drill** (three training mannequins out of the fire exit), then Performance Review #4.
- **Chapter 5, The Corner Office:** one last job, and the ending. No spoilers.
- **Overtime** (after the ending): every job again, each with a twist: cannons, a goblin with a spear, a rabbit you really shouldn't startle, low gravity, gusts, earthquakes or a freshly waxed floor (the finale gets several at once). ★4 for beating the ★★★ time anyway, ★5 for doing it without breaking anything.
- **Water:** everything floats, and falling in gets you a splash and a trip back to the start.
- **Reviews** play out in Gerald's office with live physics: Stanley walks in under real physics, so what he knocks over is different every time, and Gerald reacts to each mishap.
- **Little surprises** hidden around the jobs for anyone who happens to notice. Nothing tracks or counts them, and no spoilers here.
- **Something breakable in the way** in every job (a planter, a vase, a lamp). Knock it over, stand on it, or carefully carry it aside: it breaks regardless, and Gerald bills it to your mother.
- **Stars** for speed, bonus tags (No Falls, Speed Demon, Clumsy Professional, Collateral Damage) and a memo from the boss on every score card.
- **Job board** (☰) with your stars, unlocked jobs, cutscene rewatch and the **Day Off** sandbox (the original test room).
- **Day Off** has a trampoline, a high dive and a line of trapezes, the last one a big swinger. Hang on as two bars swing together and you're handed across to the next one. There's a window high up the far wall. The sign asks you not to swing into it.
- **Restart** (↺ or R) puts you straight back into the job.
- **Progress saves in your browser** (stars, best times, cutscenes watched), and the game reopens on your next job.

## Play it

**On any device:** https://setosa-versicolor.github.io/Tumbler/. Every push to `master` rebuilds and redeploys it via GitHub Actions (`.github/workflows/pages.yml`).

## High-end graphics

In **Coffee Run** there's a big red button on the left wall, over the kitchen (stand on the counter). It says DO NOT PUSH. Push it and the picture glitches, then a wipe sweeps across the room from the button and leaves high-end graphics behind it: the office after hours, lamps coming on one by one with soft shadows and beams in the haze, a dusk skyline through the windows, a glossy floor, bloom and a colour grade. It lasts for that attempt: restart (or come back later) and it's the usual graphics again, button and all. Push it again in HD and see what happens. `?hd` on the URL starts straight in Coffee Run with it already on.

The coffee spills for real, too: tip a cup and it pours out of the sip hole, jolt it and it slops over the lid, break one and the lot goes everywhere, splashing off Stanley, the tray and the furniture. Where it lands it pools, and a puddle on the floor is slick: no grip underfoot, and run into one and your feet go out from under you (`src/levels/liquid.ts`).

How it works (`src/hd/`): the usual drawing is split into layers (the room, what's in it, glowing things), and WebGL2 lights them: every outline gets rounded edges and highlights, and lights march across the props-and-Stanley layer for soft shadows. Then bloom, reflection and the finish. Speech and effects stay crisp on a canvas laid over the top. A level gives its lights with an `hd()` hook; the app swaps renderers mid-level (`turnUp` in `src/app/app.ts`). Without WebGL2 the button just says so.

In HD the characters are drawn in detail too, with things that swing after them (a lanyard and ID badge, the cap brim, hair, the shirt hem) and squash and stretch on landings; fast hands and flying props leave motion smears; the cups are glass (you can see the coffee, its level drops as it spills and it sloshes) and bend the wall behind them; the tray is brushed steel; there's an out-of-focus foreground between you and Stanley; and particles get proper looks (soft dust, bouncing debris, glinting glass, confetti that flips) (`src/render/charactersHD.ts`): Stanley's polo shirt, chinos, belt, work shoes, cap and a face that reacts (worried in the air, gritted teeth lifting, X eyes when he's down), and the coworkers each their own person. Every shape sits on the physics bodies, so the ragdoll moves exactly as before. **`studio.html`** (the Character Studio) shows them big, in a set of fixed poses, on a plain background: the place to work on them.

## Run it locally

```bash
npm install
npm run dev      # then open the printed URL
```

`npm test` runs the headless physics tests. `npm run build` produces a static site in `dist/`.

## Controls

| | Keyboard + mouse | Touch (landscape works best) |
|---|---|---|
| Run | A / D | Left thumb: drag left/right |
| Jump | W / Space | Left thumb: flick up |
| Reach | Point with the mouse | Right thumb: drag. Hands reach that way from the shoulder |
| Grab | Hold left / right click (one per hand) | Holding the right thumb down grips with both hands |
| Throw | Swing the mouse and let go | Swing the drag and lift your thumb |
| Climb | Grab a ledge, point *down* to haul up, run and let go | Same |
| Restart job | R | ↺ |
| Job board | Esc | ☰ |
| Tuning panel | T or ⚙ | ⚙ |

Reach low to bend over and pick things up. Big overhand swings throw much harder than short flicks. Sprinting is risky: if a foot catches on something (a box, a sock, a step up) at speed, or you take the stairs at a run, Stanley can trip and face-plant. Walking (a half-push on the stick) is safe.

## How the body works

- 13 rigid bodies (Rapier 2D, deterministic build) joined by revolute joints with limits. Arm segments don't collide with level geometry; hands do.
- **Arms**: two-bone IK picks target angles; torque-capped PD "muscles" chase them, with the reaction torque applied to the parent, so arms overshoot, sag under load, and big swings yank the torso. Idle arms are weak and swing with the run cycle, so they flail.
- **Balance**: a spring under the pelvis holds standing height, and torques keep the torso upright. A big lean or hit drops `stability` to near zero and Stanley collapses, then gets back up.
- **Legs**: procedural gait, crouch and a hanging tuck, all driven by the same torque-capped muscles.
- **Grip**: touching something while gripping welds the hand to it (or pivots, for static things and two-handed holds). Grabs near a ledge's top corner snap to the corner.

The constants that shape the feel live in `src/sim/tuning.ts`. The ⚙ panel edits them live and saves them in the browser.

```
src/
  physics/body/   rig, motor, armController, balance, gait, grip, stanley
  levels/         kit (solids, props, buttons, stairs), level types, suburb/*, dayOff
  story/          office scene, cutscene player, Gerald's scripts and barks
  app/            game flow (app.ts), campaign + memos, save system
  sim/game.ts     headless game state for one level
  render/         Canvas2D renderer + camera
  input/          keyboard, mouse, touch → Intent
  ui/             cards (intro, results, job board), tuning panel, synth sound effects
tests/            headless tests: body, every level, cutscenes, save (vitest)
```

### Adding a job

A level is a `Level` object (see `src/levels/level.ts`): a theme, a spawn point, a goal `target`, par times, and a `build(kit)` that adds solids and props and returns `progress()` (plus optional `update` and draw hooks). Add it to a chapter in `src/app/campaign.ts`, give it some memos, and add a test in `tests/levels.test.ts`.
