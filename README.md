# Tumbler

A wobbly active-ragdoll game about doing simple odd jobs with a body that won't cooperate. See [PLAN.md](PLAN.md) for the full concept and roadmap.

**Current state: M0, the "body toy".** A single test room where you can run, jump, grab, carry, throw, stack and climb, with live tuning sliders. No goals yet, apart from three counters to mess around with:

- **Button** on the right wall. Hit it hard with a thrown ball, a box or a punch.
- **Basket** on the left wall. Throw things into it.
- **Stack**, the height of your tallest pile of boxes.

## Run it

```bash
npm install
npm run dev      # then open the printed URL (use the Network one on your phone)
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
| Reset room | R | ⚙ → Reset room |
| Tuning panel | T or ⚙ | ⚙ |

Reach low to bend over and pick things up. Big overhand swings throw much harder than short flicks.

## How the body works

- 13 rigid bodies (Rapier 2D, deterministic build) joined by revolute joints with limits. Arm segments don't collide with level geometry; hands do.
- **Arms**: two-bone IK picks target angles; torque-capped PD "muscles" chase them, with the reaction torque applied to the parent, so arms overshoot, sag under load, and big swings yank the torso. Idle arms are weak and swing with the run cycle, so they flail.
- **Balance**: a spring under the pelvis holds standing height, and torques keep the torso upright. A big lean or hit drops `stability` to near zero and Tumbler collapses, then gets back up.
- **Legs**: procedural gait, crouch and a hanging tuck, all driven by the same torque-capped muscles.
- **Grip**: touching something while gripping welds the hand to it (or pivots, for static things and two-handed holds). Grabs near a ledge's top corner snap to the corner.

The constants that shape the feel live in `src/sim/tuning.ts`. The ⚙ panel edits them live and saves them in the browser.

```
src/
  physics/body/   rig, motor, armController, balance, gait, grip, tumbler
  props/room.ts   the test room, props, button
  sim/game.ts     headless game state + stats
  render/         Canvas2D renderer + camera
  input/          keyboard, mouse, touch → Intent
  ui/             tuning panel, synth sound effects
tests/            headless physics tests (vitest)
```
