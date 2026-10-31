import { OFFICE, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio, inRect } from "../curio";
import type { Game, GameEvent } from "../../sim/game";
import type { Vec } from "../../sim/math";
import { G_FLOOR, G_PROP, G_WORLD, groups } from "../../physics/groups";

/** The extinguisher, when nobody's holding it, doesn't get kicked about by Stanley's feet. */
const UNDERFOOT_GROUPS = groups(G_PROP, G_WORLD | G_FLOOR | G_PROP);

const W = 15;
const EXIT_X = 12.8;
const ASSEMBLY = { x0: 13.2, x1: W };
const NEEDED = 3;
/** The space heater, in the way between the mannequins and the exit. */
export const HEATER = { x: 10.3, hw: 0.2, hh: 0.45 };
/** Where a fire takes hold: a row of cells either side of the heater. */
export const FIRE = { x0: 9.5, x1: 11.3, cell: 0.2 };
/** Extinguisher cabinets, one either side of where the fire will be. */
export const CABINETS = [
  { x: 8.6, shelf: 1.15 },
  { x: 11.85, shelf: 1.15 },
];
/** The one on Stanley's side. */
export const CABINET = CABINETS[0];
/** The extinguisher stays indoors: it's set down here, just before the exit. */
export const DROP_X = EXIT_X - 0.6;
/** Out, a fire smoulders this long before it catches again. */
export const SMOULDER = 22;
/** Spraying a flame knocks it down this fast (per second, at close range). */
const DOUSE = 1.8;
/** Flames grow back, and spread to their neighbours. */
const GROW = 0.12;
const SPREAD = 0.2;
const SPRAY_RANGE = 2.6;
/** Foamed flames stay damp (not growing, not catching) this long. */
const DAMP = 2.5;

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

/**
 * Skyscraper job 4: a fire drill. Stanley knocks over the space heater, so
 * it's a fire. Grab the extinguisher (it goes off the moment it's picked up),
 * put the fire out, and get the mannequins out before it catches again.
 */
export const fireDrill: Level = {
  id: "fire-drill",
  title: "Fire Drill",
  goal: `Get all ${NEEDED} training mannequins out to the assembly point. Mind the space heater.`,
  icon: "🚨",
  par: [70, 140],
  bounds: { w: W, h: 4.6 },
  spawn: { x: 1.2, y: 0 },
  target: { x: (ASSEMBLY.x0 + ASSEMBLY.x1) / 2, y: 1.0 },
  theme: { ...OFFICE, top: "#eadede", bottom: "#d8c8c8" },
  build(kit) {
    kit.enclosure(W, 4.6);
    // The wall with the fire exit in it.
    kit.solid(EXIT_X, 3.45, 0.1, 1.15, "partition");
    const dummies: Prop[] = [3.6, 5.4, 7.2].map((x, i) =>
      kit.box(x, i === 1 ? 0.17 : 0.51, 0.16, 0.5, { kind: "dummy", density: 5, friction: 0.8, color: "#e6c9a4", angle: i === 1 ? Math.PI / 2 : 0 }),
    );
    const heater = kit.box(HEATER.x, HEATER.hh + 0.005, HEATER.hw, HEATER.hh, { kind: "heater", density: 35, friction: 1.0, color: "#e4e6ea" });
    // Each extinguisher sits on a bracket on the wall, out of the way of Stanley's
    // feet. There's one either side of the fire, so he's never on the wrong side of it.
    const kits = CABINETS.map((cab) => {
      const bracket = kit.solid(cab.x, cab.shelf - 0.03, 0.16, 0.03, "ledge", { collides: "props", hidden: true });
      const ex = kit.box(cab.x, cab.shelf + 0.245, 0.09, 0.24, { kind: "extinguisher", density: 10, friction: 0.8, color: "#d63a2f" });
      ex.body.collider(0).setCollisionGroups(UNDERFOOT_GROUPS);
      // Held by the handle at the bottom, nozzle out, like the squeegee.
      ex.body.userData = { tool: true };
      return { cab, bracket, ex };
    });
    // While it's burning, Stanley can't walk through the fire (things can still be pushed through).
    const firewall = kit.solid((FIRE.x0 + FIRE.x1) / 2, 1.2, (FIRE.x1 - FIRE.x0) / 2 - 0.15, 1.2, "wall", { collides: "body", hidden: true });
    firewall.setEnabled(false);
    kit.fragile(6.3, 0, "planter");
    const glass = new Curio("break-glass", "It says 'break glass.' You've had a lot of practice.", { x0: CABINET.x - 1.05, y0: 1.35, x1: CABINET.x - 0.6, y1: 1.8 });
    let smashed = false;

    const cells = Array.from({ length: Math.round((FIRE.x1 - FIRE.x0) / FIRE.cell) }, (_, i) => ({ x: FIRE.x0 + (i + 0.5) * FIRE.cell, heat: 0, damp: 0 }));
    const flameH = (heat: number) => 0.25 + heat * 1.0;
    let ignited = false;
    let smoulder = 0;
    let hotCooldown = 0;
    const spray: Puff[] = [];
    const foam: { x: number; r: number }[] = [];
    const smoke: Puff[] = [];
    let lastOut = 0;

    const out = () => dummies.filter((d) => d.body.translation().x > ASSEMBLY.x0).length;
    const burning = () => cells.some((c) => c.heat > 0);
    const isHeld = (game: Game, ex: Prop) => game.held.has(ex.body);
    const nozzle = (ex: Prop) => {
      const p = ex.body.translation();
      const a = ex.body.rotation();
      const dir = { x: -Math.sin(a), y: Math.cos(a) };
      return { tip: { x: p.x + dir.x * ex.hh, y: p.y + dir.y * ex.hh }, dir };
    };
    /** It catches across the middle of the fire, around the heater. */
    const light = (heat: number) => {
      for (const c of cells) if (Math.abs(c.x - HEATER.x) < 0.45) c.heat = Math.max(c.heat, heat);
    };

    return {
      update(game, dt) {
        const ev: GameEvent[] = [];

        // Knock the heater and it's a fire. It was always going to be a fire.
        if (!ignited && game.time > 0.5) {
          const v = heater.body.linvel();
          if (Math.abs(heater.body.rotation()) > 0.45 || Math.hypot(v.x, v.y) > 0.8 || game.held.has(heater.body)) {
            ignited = true;
            heater.color = "#6b6f76";
            light(0.5);
            ev.push({ type: "sfx", name: "boom", pos: heater.body.translation() }, { type: "score", text: "That's… a real fire.", pos: { x: HEATER.x, y: 2.2 } });
          }
        }

        // The fire: flames grow back, spread, and catch again if left to smoulder.
        const wasBurning = burning();
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          // Foamed recently: it won't grow or catch for a moment, so sweeping makes headway.
          c.damp = Math.max(0, c.damp - dt);
          if (c.damp > 0) continue;
          if (c.heat > 0) c.heat = Math.min(1, c.heat + GROW * dt);
          else if ((cells[i - 1]?.heat ?? 0) > 0.5 || (cells[i + 1]?.heat ?? 0) > 0.5) c.heat = SPREAD * dt;
        }

        // An extinguisher goes off the moment it's picked up.
        for (const { ex: extinguisher } of kits) {
          if (!isHeld(game, extinguisher)) continue;
          const { tip, dir } = nozzle(extinguisher);
          for (let k = 0; k < 2; k++) {
            const spread = (game.rand() - 0.5) * 0.25;
            const sp = 5 + game.rand() * 1.5;
            const c = Math.cos(spread);
            const s = Math.sin(spread);
            spray.push({ x: tip.x, y: tip.y, vx: (dir.x * c - dir.y * s) * sp, vy: (dir.x * s + dir.y * c) * sp, age: 0 });
          }
          // It kicks, a bit.
          const m = extinguisher.body.mass();
          extinguisher.body.applyImpulse({ x: -dir.x * 6 * dt * m, y: -dir.y * 6 * dt * m }, true);
          // Foam knocks down whatever flames it reaches. Aimed low, it skids
          // on along the floor a little way and gets the flames there too.
          const tFloor = dir.y < -0.05 ? tip.y / -dir.y : Infinity;
          const xFloor = tip.x + dir.x * tFloor;
          for (const cell of cells) {
            if (cell.heat <= 0) continue;
            if (tFloor < SPRAY_RANGE && (cell.x - xFloor) * Math.sign(dir.x) > -FIRE.cell && (cell.x - xFloor) * Math.sign(dir.x) < 0.8) {
              cell.heat = Math.max(0, cell.heat - DOUSE * 0.7 * dt);
              cell.damp = DAMP;
              continue;
            }
            let t: number;
            if (Math.abs(dir.x) > 0.15) t = (cell.x - tip.x) / dir.x;
            else t = Math.abs(cell.x - tip.x) < 0.3 && dir.y < 0 ? (tip.y - flameH(cell.heat)) / -dir.y : -1;
            if (t < 0 || t > SPRAY_RANGE) continue;
            const yAt = tip.y + dir.y * t;
            if (yAt < -0.2 || yAt > flameH(cell.heat) + 0.3) continue;
            cell.heat = Math.max(0, cell.heat - DOUSE * dt * (1 - t / (SPRAY_RANGE + 0.6)));
            cell.damp = DAMP;
          }
        }
        if (wasBurning && !burning()) {
          smoulder = SMOULDER;
          ev.push({ type: "score", text: "Fire's out! For now.", pos: { x: HEATER.x, y: 2.0 } });
        }
        if (ignited && !burning() && out() < NEEDED) {
          smoulder -= dt;
          if (smoulder <= 0) {
            for (const c of cells) c.damp = 0;
            light(0.35);
            ev.push({ type: "sfx", name: "boom", pos: heater.body.translation() }, { type: "score", text: "It's back.", pos: { x: HEATER.x, y: 2.0 } });
          }
        }

        // Flames are hot: they shove Stanley back.
        hotCooldown -= dt;
        if (hotCooldown <= 0) {
          const st = game.stanley;
          const parts = [st.rig.pelvis, st.rig.chest, st.rig.head, st.rig.legs.L.shin, st.rig.legs.R.shin];
          const burnt = parts.find((b) => {
            const p = b.translation();
            const c = cells.find((cell) => Math.abs(cell.x - p.x) < FIRE.cell / 2 + 0.08);
            // Scorching just above the flames too (standing on the burning heater, say).
            return !!c && c.heat > 0.15 && p.y < flameH(c.heat) + 0.7;
          });
          if (burnt) {
            hotCooldown = 0.7;
            // Down he goes, backwards.
            st.balance.knockDown(0.8);
            // Back the way he came (towards the mannequins), unless he's already out the far side.
            const away = burnt.translation().x > FIRE.x1 - 0.05 ? 1 : -1;
            const ch = st.rig.chest;
            ch.applyImpulse({ x: away * 5 * ch.mass(), y: 2 * ch.mass() }, true);
            st.rig.pelvis.applyImpulse({ x: away * 4 * st.rig.pelvis.mass(), y: 1.5 * st.rig.pelvis.mass() }, true);
            ev.push({ type: "ouch", text: "HOT!", pos: { x: burnt.translation().x, y: burnt.translation().y + 0.8 } });
          }
        }

        // The fire's a wall, once Stanley's clear of it (so it never appears around him).
        const st = game.stanley;
        const clear = st.rig.bodies.every((b) => {
          const x = b.translation().x;
          return x < FIRE.x0 + 0.05 || x > FIRE.x1 - 0.05;
        });
        if (!burning()) firewall.setEnabled(false);
        else if (clear) firewall.setEnabled(true);
        for (const { cab, bracket, ex: extinguisher } of kits) {
          const held = isHeld(game, extinguisher);
          if (!held) extinguisher.body.collider(0).setCollisionGroups(UNDERFOOT_GROUPS);
          // Lifted off its bracket, it doesn't snag on it.
          bracket.setEnabled(!held);

          // Extinguishers stay indoors: one's set down before the exit…
          if (held && extinguisher.body.translation().x > DROP_X) {
          const g = game.stanley.grips;
          g.L.drop(game.world, g.R);
          g.R.drop(game.world, g.L);
          // Set down, not flung.
          extinguisher.body.setLinvel({ x: 0, y: 0 }, true);
          extinguisher.body.setAngvel(0, true);
            ev.push({ type: "score", text: "Extinguishers stay inside.", pos: { x: DROP_X - 0.3, y: 1.9 } });
          }
          // …and if one gets out anyway, Health & Safety put it back.
          if (!held && extinguisher.body.translation().x > EXIT_X - 0.1) {
            extinguisher.body.setTranslation({ x: cab.x, y: cab.shelf + 0.25 }, true);
            extinguisher.body.setRotation(0, true);
            extinguisher.body.setLinvel({ x: 0, y: 0 }, true);
            extinguisher.body.setAngvel(0, true);
            ev.push({ type: "score", text: "Health & Safety put it back.", pos: { x: cab.x, y: 1.4 } });
          }
        }

        // Foam and smoke.
        for (const p of spray) {
          p.age += dt;
          p.vy -= 3 * dt;
          p.vx *= 1 - 1.5 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y < 0.04 && foam.length < 90 && game.rand() < 0.15) foam.push({ x: p.x, r: 0.06 + game.rand() * 0.08 });
        }
        while (spray.length && (spray[0].age > 0.5 || spray.length > 120)) spray.shift();
        // Smoke: steady while it burns, and thickening as a smoulder gets ready to catch.
        if (ignited && (burning() || smoulder < SMOULDER * 0.6) && game.rand() < (burning() ? 0.08 : 0.02 + 0.08 * (1 - smoulder / SMOULDER))) {
          smoke.push({ x: HEATER.x + (game.rand() - 0.5) * 1.4, y: 0.6, vx: (game.rand() - 0.5) * 0.6, vy: 0.7 + game.rand() * 0.5, age: 0 });
        }
        for (const p of smoke) {
          p.age += dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        while (smoke.length && smoke[0].age > 4) smoke.shift();

        const n = out();
        if (n > lastOut) ev.push({ type: "score", text: "Evacuated!", pos: { x: 13.9, y: 2.2 } });
        lastOut = n;
        if (!smashed) {
          const hit = [game.stanley.rig.arms.L.hand, game.stanley.rig.arms.R.hand].some((h) => {
            const v = h.linvel();
            return inRect(h.translation(), glass.rect) && Math.hypot(v.x, v.y) > 1.2;
          });
          if (hit) {
            smashed = true;
            ev.push(glass.reveal());
          }
        }
        return ev;
      },
      progress: () => {
        const n = out();
        const tally = `Evacuated ${n}/${NEEDED}`;
        if (n >= NEEDED) return { done: true, label: tally };
        if (burning()) return { done: false, label: `🔥 FIRE! Grab the extinguisher · ${tally}` };
        if (ignited) return { done: false, label: `Fire's out… it relights in ${Math.max(0, Math.ceil(smoulder))}s · ${tally}` };
        return { done: false, label: tally };
      },
      drawBack(r, game) {
        // Alarm light, exit sign, the extinguisher cabinet, cubicles; outside, the assembly point.
        const on = Math.floor(game.time * 3) % 2 === 0;
        r.circle({ x: 6.5, y: 4.2 }, 0.16, on ? "#ff5a4f" : "#8a3a3a");
        if (on) r.circle({ x: 6.5, y: 4.2 }, 0.5, "rgba(255,90,79,0.15)");
        r.rect(EXIT_X - 0.9, 2.5, EXIT_X - 0.15, 2.85, "#2e9b5a");
        r.text("EXIT →", { x: EXIT_X - 0.52, y: 2.67 }, 0.12, "#fff");
        // A stripe on the floor: extinguishers past this line get put down.
        r.rect(DROP_X, 0, DROP_X + 0.06, 0.03, "#e8913c");
        const gr = glass.rect;
        r.rect(gr.x0, gr.y0, gr.x1, gr.y1, "#c0392b");
        r.rect(gr.x0 + 0.06, gr.y0 + 0.06, gr.x1 - 0.06, gr.y1 - 0.06, smashed ? "#5a2020" : "rgba(220,240,250,0.8)");
        r.text("BREAK GLASS", { x: (gr.x0 + gr.x1) / 2, y: gr.y0 - 0.1 }, 0.06, "#c0392b");
        for (const cab of CABINETS) {
          r.rect(cab.x - 0.24, cab.shelf - 0.06, cab.x + 0.24, cab.shelf + 0.62, "rgba(192,57,43,0.22)");
          r.rect(cab.x - 0.18, cab.shelf - 0.06, cab.x + 0.18, cab.shelf, "#7a828c");
          r.text("FIRE", { x: cab.x, y: cab.shelf + 0.72 }, 0.08, "#c0392b");
        }
        for (const x of [2.8, 4.6, 6.4]) r.rect(x, 0, x + 1.2, 1.15, "rgba(122,130,140,0.3)");
        // Scorch marks where it's been burning.
        if (ignited) r.roundRect(FIRE.x0, 0, FIRE.x1, 0.02, 0.01, "rgba(40,30,30,0.6)");
        r.rect(EXIT_X + 0.1, 0, W, 4.6, "#cfe0ec");
        r.rect(ASSEMBLY.x0, 0, ASSEMBLY.x1, 0.04, "#2e9b5a");
        r.rect(13.8, 0, 13.86, 1.8, "#5f6670");
        r.rect(13.5, 1.5, 14.8, 2.0, "#2e9b5a");
        r.text("ASSEMBLY POINT", { x: 14.15, y: 1.75 }, 0.1, "#fff");
      },
      drawMid(r, game) {
        // Foam on the floor, then the flames, then the spray, then smoke.
        for (const f of foam) r.circle({ x: f.x, y: 0.02 }, f.r, "rgba(255,255,255,0.85)");
        for (const c of cells) {
          if (c.heat <= 0) continue;
          const h = flameH(c.heat);
          const flick = Math.sin(game.time * 13 + c.x * 7) * 0.08;
          const tip: Vec = { x: c.x + flick, y: h + flick };
          r.circle({ x: c.x, y: h * 0.45 }, FIRE.cell * 1.2, "rgba(255,140,40,0.25)");
          r.poly([{ x: c.x - FIRE.cell * 0.75, y: 0 }, { x: c.x + FIRE.cell * 0.75, y: 0 }, tip], "#f08a3c");
          r.poly([{ x: c.x - FIRE.cell * 0.4, y: 0 }, { x: c.x + FIRE.cell * 0.4, y: 0 }, { x: tip.x, y: h * 0.6 }], "#ffd84a");
        }
        for (const p of spray) r.circle(p, 0.05 + p.age * 0.25, `rgba(255,255,255,${0.85 - p.age})`);
        for (const p of smoke) r.circle(p, 0.12 + p.age * 0.15, `rgba(90,90,96,${Math.max(0, 0.22 - p.age * 0.06)})`);
      },
    };
  },
};
