import type { Level, LevelInstance } from "../levels/level";
import type { Renderer } from "../render/renderer";
import type { Game, GameEvent } from "../sim/game";
import { CABINETS, EXIT_X, FIRE, fireDrill, HEATER, W, type FireState } from "../levels/skyscraper/fireDrill";
import { Liquid } from "../levels/liquid";
import type { HDLight, HDScene } from "./types";
import { drawCity, drawLiquid, drawShine, hash, near, SecretButton, UPGRADE_TIME, WATER } from "./shared";

const H = 4.6;
/** The secret button: high on the left wall, above where Stanley starts. Too high to reach standing: jump for it, or throw a mannequin at it. */
export const FD_BUTTON = { wallX: 0, y: 2.85, face: "right" as const };
/** Fluorescent panels in the ceiling (x). */
const PANELS = [2.2, 5.0, 8.0, 11.0];
/** Windows onto the city: [x0, x1], between sill and head. */
const WINDOWS: [number, number][] = [
  [1.4, 6.0],
  [8.9, 12.2],
];
const SILL = 2.0;
const HEAD = 3.9;
/** The alarm beacon on the back wall, near the ceiling. */
const BEACON = { x: 6.5, y: 4.2 };
/** Sprinkler heads in the ceiling (x). */
const SPRINKLERS = [3.0, 6.0, 9.0, 11.2];
/** How long the sprinklers run, once set off. */
export const SPRINKLE_TIME = 7;
/** How hard the sprinklers knock the fire down (heat per second), within reach of a head. */
const SPRINKLE_DOUSE = 1.1;

/**
 * Fire Drill, in HD: the office after dark, lit by the fire itself (flames that
 * flicker and throw long shadows), a red alarm beacon sweeping the smoke,
 * fluorescent panels, the city through the windows and the street outside the
 * exit. The DO NOT PUSH button is high on the left wall: jump for it, or throw
 * a mannequin at it. In HD, it sets off the sprinklers.
 */
export const fireDrillHD: Level = {
  ...fireDrill,
  build(kit) {
    const base = fireDrill.build(kit) as LevelInstance & { fire: FireState };
    const fire = base.fire;
    const secret = new SecretButton(kit, FD_BUTTON);
    const water = new Liquid("none");
    /** Seconds of sprinkling left. */
    let sprinkle = 0;

    const heat = () => fire.cells.reduce((s, c) => s + c.heat, 0);
    // The sprinklers knock the fire down underneath them (alongside the extinguishers, so it smoulders as usual after).
    fire.hose = (dt) => {
      if (sprinkle <= 0) return;
      for (const x of SPRINKLERS)
        for (const c of fire.cells) {
          if (c.heat <= 0 || Math.abs(c.x - x) > 1.5) continue;
          c.heat = Math.max(0, c.heat - SPRINKLE_DOUSE * dt);
          c.damp = Math.max(c.damp, 1.5);
        }
    };

    const update = (game: Game, dt: number): GameEvent[] => {
      const events = base.update?.(game, dt) ?? [];
      const push = secret.update(game, dt, events);
      if (push === "hd") {
        if (sprinkle <= 0) {
          events.push({ type: "sfx", name: "gust" });
          events.push({ type: "surprise", id: `sprinklers-${secret.count}`, text: secret.count < 3 ? "Sprinklers. In a fire drill. Who'd have thought." : "Wetter. Somehow.", pos: { x: 1.3, y: 3.6 } });
        }
        sprinkle = SPRINKLE_TIME;
      }
      if (sprinkle > 0) {
        sprinkle = Math.max(0, sprinkle - dt);
        for (const x of SPRINKLERS) {
          // A cone of spray from each head.
          for (let k = 0; k < 3; k++) {
            const a = -Math.PI / 2 + (game.rand() - 0.5) * 1.9;
            const sp = 1.5 + game.rand() * 2;
            water.add(x + (game.rand() - 0.5) * 0.06, H - 0.12, Math.cos(a) * sp, Math.sin(a) * sp);
          }
        }
      }
      events.push(...water.update(game, dt));
      return events;
    };

    /** Just turned up: the ceiling panels flicker on one by one, left to right, behind the wipe. */
    const warmup = (i: number) => {
      const since = secret.since;
      if (since < 0 || since > UPGRADE_TIME) return 1;
      const k = (since - 0.7 - i * 0.32) / 0.25;
      if (k <= 0) return 0;
      if (k < 1) return Math.sin(k * 40) > 0 ? k : 0.1;
      return 1;
    };

    /** The fire's light: up to two flickering sources, where it's burning hardest either side of the heater. */
    const fireLights = (time: number): HDLight[] => {
      const out: HDLight[] = [];
      for (const side of [-1, 1]) {
        const cs = fire.cells.filter((c) => (c.x - HEATER.x) * side >= -0.05 && c.heat > 0);
        const h = cs.reduce((s, c) => s + c.heat, 0);
        if (h <= 0.02) continue;
        const x = cs.reduce((s, c) => s + c.x * c.heat, 0) / h;
        const flick = 0.82 + 0.12 * Math.sin(time * 17 + side) + 0.08 * Math.sin(time * 31 + side * 2);
        out.push({ x, y: 0.55 + Math.min(0.6, h * 0.12), z: 0.5, radius: 5.5 + h * 0.6, color: [1, 0.5, 0.16], intensity: Math.min(4.5, 1.2 + h * 0.6) * flick, shadow: true });
      }
      return out;
    };

    const hd = (game: Game, time: number): HDScene => {
      const lights: HDLight[] = [...fireLights(time)];
      // The alarm beacon: two red beams sweeping round.
      const spin = time * 3.2;
      for (const o of [0, Math.PI]) {
        lights.push({ x: BEACON.x, y: BEACON.y - 0.08, z: 0.4, radius: 9, color: [1, 0.08, 0.05], intensity: 1.6, shadow: true, spot: { dir: spin + o, inner: 0.05, outer: 0.2 } });
      }
      // Fluorescent panels, cool and steady; while it burns they drop to emergency lighting (and flicker now and then), and the fire lights the room.
      const burning = heat() > 0;
      for (const [i, x] of PANELS.entries()) {
        const fl = (burning ? 0.4 : 1) * (burning && Math.sin(time * 23 + i * 5) > 0.97 ? 0.3 : 1);
        const on = warmup(i) * fl;
        if (on > 0.01) lights.push({ x, y: H - 0.15, z: 1.2, radius: 5.5, color: [0.78, 0.88, 1], intensity: 1.35 * on, spot: { dir: -Math.PI / 2, inner: 0.5, outer: 1.2 } });
      }
      // The exit sign, and outside: a street lamp, and (with a fire on) the fire brigade's lights.
      lights.push({ x: EXIT_X - 0.52, y: 2.67, z: 0.3, radius: 1.6, color: [0.25, 1, 0.5], intensity: 0.7 });
      lights.push({ x: 14.4, y: 3.3, z: 1.2, radius: 4, color: [1, 0.78, 0.5], intensity: 1.1, spot: { dir: -Math.PI / 2, inner: 0.4, outer: 1.0 } });
      if (fire.ignited()) lights.push({ x: W - 0.1, y: 1.4, z: 1.5, radius: 5, color: Math.sin(time * 9) > 0 ? [0.2, 0.35, 1] : [1, 0.15, 0.1], intensity: 0.9 });
      const smoky = Math.min(1, fire.smoke.length / 30);
      void game;
      return {
        ambient: [0.09, 0.1, 0.15],
        lights,
        haze: 0.07 + 0.2 * smoky,
        motes: 1,
        reflect: sprinkle > 0 || water.puddles.length ? 0.4 : 0.25,
        bloom: 0.95,
        exposure: 1.0,
      };
    };

    // ------------------------------------------------------------ art ---

    const drawBack = (r: Renderer, game: Game) => {
      if (!r.hd) {
        base.drawBack?.(r, game);
        secret.drawSign(r);
        return;
      }
      const time = r.clock;
      const ctx = r.ctx;
      // Floor: dark carpet tiles.
      {
        const a = r.camera.toScreen({ x: -10, y: 0 });
        const b = r.camera.toScreen({ x: W + 10, y: -5 });
        const g = ctx.createLinearGradient(0, a.y, 0, a.y + 0.6 * r.camera.scale);
        g.addColorStop(0, "#5a5e68");
        g.addColorStop(1, "#30333a");
        ctx.fillStyle = g;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        for (let x = 0; x <= W; x += 0.6) r.rect(x - 0.004, -5, x + 0.004, 0, "rgba(20,22,28,0.3)");
      }
      // Wall panels, a wainscot, the ceiling with its panels and sprinkler heads.
      r.rect(0, 0, EXIT_X, H, "#aab2bd");
      for (let x = 0.75; x < EXIT_X; x += 1.5) r.rect(x - 0.008, 0.97, x + 0.008, H - 0.2, "rgba(40,50,70,0.12)");
      r.rect(0, 0, EXIT_X, 0.95, "#939daa");
      r.rect(0, 0.93, EXIT_X, 0.97, "#7f8996");
      r.rect(0, H - 0.18, W, H, "#8c95a2");
      for (const [i, x] of PANELS.entries()) {
        r.rect(x - 0.55, H - 0.2, x + 0.55, H - 0.14, "#5b6370");
        const on = warmup(i);
        if (on > 0.02)
          r.emit(() => {
            r.ctx.globalAlpha = on;
            r.rect(x - 0.5, H - 0.2, x + 0.5, H - 0.155, "#eef6ff");
            r.ctx.globalAlpha = 1;
          });
      }
      for (const x of SPRINKLERS) {
        r.rect(x - 0.015, H - 0.25, x + 0.015, H - 0.18, "#b8bec6");
        r.poly([{ x: x - 0.06, y: H - 0.25 }, { x: x + 0.06, y: H - 0.25 }, { x, y: H - 0.29 }], "#d4a53a");
      }
      // Windows onto the city.
      for (const [x0, x1] of WINDOWS) {
        r.rect(x0 - 0.08, SILL - 0.06, x1 + 0.08, HEAD + 0.08, "#3d434d");
        r.rect(x0, SILL, x1, HEAD, "#0c0e16");
      }
      r.emit(() => drawCity(r, WINDOWS, SILL, HEAD, time, 7.5));
      for (const [x0, x1] of WINDOWS) {
        const panes = Math.max(1, Math.round((x1 - x0) / 1.1));
        for (let i = 1; i < panes; i++) {
          const x = x0 + ((x1 - x0) * i) / panes;
          r.rect(x - 0.03, SILL, x + 0.03, HEAD, "#3d434d");
        }
        r.rect(x0 - 0.14, SILL - 0.1, x1 + 0.14, SILL - 0.02, "#d9dee5");
      }
      // Outside the exit: the street at night.
      {
        const a = r.camera.toScreen({ x: EXIT_X + 0.1, y: H + 6 });
        const b = r.camera.toScreen({ x: W + 10, y: 0 });
        r.emit(() => {
          const g = ctx.createLinearGradient(0, a.y, 0, b.y);
          g.addColorStop(0, "#0b1030");
          g.addColorStop(0.7, "#3a2d5a");
          g.addColorStop(1, "#7a4a5a");
          ctx.fillStyle = g;
          ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
          for (let i = 0; i < 14; i++) r.circle({ x: EXIT_X + 0.3 + hash(i) * 2, y: 2.6 + hash(i + 7) * 1.9 }, 0.008, "rgba(255,255,240,0.8)");
        });
        r.rect(EXIT_X + 0.1, 0, W + 10, 0.06, "#3a3d44");
      }
      // The street lamp outside.
      r.rect(14.38, 0, 14.42, 3.4, "#2a2d34");
      r.rect(14.15, 3.38, 14.65, 3.44, "#2a2d34");
      r.emit(() => r.roundRect(14.2, 3.32, 14.6, 3.38, 0.02, "#ffe6b8"));
      // The alarm beacon: a red dome that flashes.
      r.rect(BEACON.x - 0.14, BEACON.y + 0.1, BEACON.x + 0.14, BEACON.y + 0.16, "#3a3f47");
      r.circle(BEACON, 0.13, "#7a2020");
      const flash = Math.sin(time * 6.4) > 0;
      r.emit(() => r.circle(BEACON, 0.12, flash ? "#ff5a4f" : "#b23a3a"));
      // The sign by the button, then the level's own scenery (exit sign, cabinets, break-glass, assembly point).
      secret.drawSign(r);
      base.drawBack?.(r, game);
      r.emit(() => {
        r.rect(EXIT_X - 0.9, 2.5, EXIT_X - 0.15, 2.85, "#22c46a");
        r.text("EXIT →", { x: EXIT_X - 0.52, y: 2.67 }, 0.12, "#eafff1");
        r.rect(13.5, 1.5, 14.8, 2.0, "#1f9b55");
        r.text("ASSEMBLY POINT", { x: 14.15, y: 1.75 }, 0.1, "#eafff1");
        for (const cab of CABINETS) r.text("FIRE", { x: cab.x, y: cab.shelf + 0.72 }, 0.08, "#ff6a5a");
      });
    };

    /** The flames, as glowing tongues of fire (they light the room themselves), and embers rising. */
    const drawFlames = (r: Renderer) => {
      const time = r.clock;
      r.emit(() => {
        const ctx = r.ctx;
        for (const c of fire.cells) {
          if (c.heat <= 0) continue;
          const h = 0.25 + c.heat * 1.0;
          for (let k = 0; k < 3; k++) {
            const sway = Math.sin(time * (9 + k * 3) + c.x * 7 + k) * 0.07 * (1 + k * 0.4);
            const hh = h * (1 - k * 0.28) * (0.9 + 0.1 * Math.sin(time * 15 + c.x * 11 + k));
            const w = FIRE.cell * (0.85 - k * 0.22);
            const base = r.camera.toScreen({ x: c.x, y: 0 });
            const tip = r.camera.toScreen({ x: c.x + sway, y: hh });
            const g = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
            const cols = [
              ["rgba(255,90,20,0.9)", "rgba(255,60,10,0.0)"],
              ["rgba(255,170,40,0.95)", "rgba(255,120,30,0.0)"],
              ["rgba(255,250,200,1)", "rgba(255,220,120,0.0)"],
            ][k];
            g.addColorStop(0, cols[0]);
            g.addColorStop(1, cols[1]);
            ctx.fillStyle = g;
            const s = r.camera.scale;
            ctx.beginPath();
            ctx.moveTo(base.x - w * s, base.y);
            ctx.quadraticCurveTo(base.x - w * s * 0.9, (base.y + tip.y) / 2, tip.x, tip.y);
            ctx.quadraticCurveTo(base.x + w * s * 0.9, (base.y + tip.y) / 2, base.x + w * s, base.y);
            ctx.closePath();
            ctx.fill();
          }
        }
        // Embers, drifting up out of it.
        for (let i = 0; i < 26; i++) {
          const c = fire.cells[Math.floor(hash(i) * fire.cells.length)];
          if (!c || c.heat <= 0.1) continue;
          const life = (time * (0.35 + hash(i + 3) * 0.4) + hash(i + 5)) % 1;
          const x = c.x + Math.sin(time * 2 + i) * 0.15 * life;
          const y = life * (1.2 + c.heat * 1.4);
          r.circle({ x, y }, 0.012 * (1 - life), `rgba(255,${150 + Math.round(80 * (1 - life))},60,${1 - life})`);
        }
      });
    };

    const drawFore = (r: Renderer) => {
      const lit = heat() > 0 ? "rgba(255,150,70,0.6)" : "rgba(200,220,255,0.45)";
      // A potted plant, and an office chair (well clear of the fire: that needs seeing).
      near(r, 1.8, (ctx) => {
        const x = 3.0;
        for (let i = 0; i < 9; i++) {
          const a = -1.0 + i * 0.25 + Math.sin(r.clock * 0.6 + i) * 0.03;
          const len = 0.38 + ((i * 37) % 5) * 0.04;
          ctx.save();
          ctx.translate(x, 0.08);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.ellipse(0, len / 2, 0.05, len / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = i % 2 ? "#18301f" : "#1f3d27";
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = "#3a2218";
        ctx.beginPath();
        ctx.moveTo(x - 0.22, 0.14);
        ctx.lineTo(x + 0.22, 0.14);
        ctx.lineTo(x + 0.18, -0.3);
        ctx.lineTo(x - 0.18, -0.3);
        ctx.fill();
        ctx.fillStyle = lit;
        ctx.fillRect(x - 0.22, 0.12, 0.44, 0.02);
      });
      near(r, 1.7, (ctx) => {
        const x = 5.2;
        ctx.fillStyle = "#14161b";
        ctx.fillRect(x - 0.035, -0.4, 0.07, 0.4);
        ctx.fillStyle = "#23262e";
        ctx.beginPath();
        ctx.roundRect(x - 0.3, -0.02, 0.6, 0.1, 0.04);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x - 0.24, 0.07, 0.42, 0.42, [0.1, 0.1, 0.04, 0.04]);
        ctx.fill();
        ctx.strokeStyle = lit;
        ctx.lineWidth = 0.02;
        ctx.stroke();
      });
    };

    const inst: LevelInstance & { fire: FireState; water: Liquid; secret: SecretButton } = {
      ...base,
      fire,
      water,
      secret,
      update,
      hd,
      drawBack,
      drawMid(r, game) {
        base.drawMid?.(r, game);
        secret.draw(r, sprinkle > 0 ? 0.6 : 0);
        if (r.hd) drawFlames(r);
        drawLiquid(r, water, WATER);
      },
      drawFront(r, game) {
        drawShine(r, water, WATER);
        base.drawFront?.(r, game);
      },
      drawFore: (r) => drawFore(r),
    };
    return inst;
  },
};
