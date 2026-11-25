import { Renderer } from "../render/renderer";
import type { Game } from "../sim/game";
import { BLUR, BRIGHT, FINAL, LIGHT, MAX_LIGHTS, VERT } from "./shaders";
import { DEFAULT_SCENE } from "./types";
import { drawStanleyHD, type StanleyLook } from "../render/charactersHD";
import type { Prop } from "../levels/kit";
import { smear } from "./smear";
import { PropArt } from "./props";

type Layer = "back" | "mid" | "front";

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

/** Shadow-casting lights per frame (each one marches across the screen). */
const MAX_SHADOWED = 4;

/** Can this browser run the HD renderer? */
export function hdSupported(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * The same drawing as the plain renderer, split into layers and lit on the GPU:
 * the room ("back"), what's in it ("mid": casts shadows, gets rounded edges and
 * highlights), and glowing things ("emit"). Speech, effects and the HUD stay
 * crisp on a plain canvas laid over the top ("front").
 */
export class HDRenderer extends Renderer {
  private gl: WebGL2RenderingContext;
  private layers: Record<"back" | "mid" | "emit" | "glass" | "fore", { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>;
  private front: HTMLCanvasElement;
  private frontCtx: CanvasRenderingContext2D;
  private progs!: Record<"light" | "bright" | "blur" | "final", { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }>;
  private tex!: Record<"back" | "mid" | "emit" | "glass" | "fore", WebGLTexture>;
  private scene: Target | null = null;
  private bloomA: Target | null = null;
  private bloomB: Target | null = null;
  private floatFmt: { internal: number; type: number } = { internal: 0, type: 0 };
  private lightBuf = { p: new Float32Array(MAX_LIGHTS * 4), c: new Float32Array(MAX_LIGHTS * 4), s: new Float32Array(MAX_LIGHTS * 4) };

  /**
   * Laid over the plain game canvas (which still takes the input): the lit
   * picture, then a crisp overlay for speech and effects, both under the HUD
   * and cards. Hidden until shown.
   */
  constructor(gameCanvas: HTMLCanvasElement) {
    const make = () => {
      const canvas = document.createElement("canvas");
      return { canvas, ctx: canvas.getContext("2d")! };
    };
    const layer = (id: string) => {
      const c = document.createElement("canvas");
      c.id = id;
      Object.assign(c.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", display: "none" });
      return c;
    };
    const glCanvas = layer("game-hd");
    const front = layer("game-front");
    gameCanvas.after(glCanvas, front);
    const back = make();
    super(glCanvas, back.ctx);
    this.layers = { back, mid: make(), emit: make(), glass: make(), fore: make() };
    this.front = front;
    this.frontCtx = this.front.getContext("2d")!;
    const gl = glCanvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false })!;
    this.gl = gl;
    this.initGL();
  }

  override get hd() {
    return true;
  }

  private stanleyLook: StanleyLook = { blink: 0 };

  /** Stanley, in detail, with smears behind fast hands. */
  protected override drawStanley(game: Game, dt: number) {
    for (const arm of Object.values(game.stanley.rig.arms)) {
      smear(this, arm.hand.translation(), arm.hand.linvel(), 0.15, "#f4c69a", 0.9);
      smear(this, arm.fore.translation(), arm.fore.linvel(), 0.1, "#f4c69a", 0.6);
    }
    drawStanleyHD(this, game, this.stanleyLook, dt);
  }

  /** Props, with a smear behind anything flying fast. */
  protected override drawProp(p: Prop) {
    smear(this, p.body.translation(), p.body.linvel(), Math.max(p.hw, p.hh) * 1.8, p.kind === "cup" ? "#c9a27e" : p.kind === "tray" ? "#c9d0d8" : p.color);
    if (this.now && this.props.draw(this, p, this.now.game, this.now.dt, (fn) => this.glass(fn))) return;
    super.drawProp(p);
  }

  /** Show or hide the HD picture. */
  show(on: boolean) {
    for (const c of [this.canvas, this.front]) c.style.display = on ? "block" : "none";
    if (on) this.resize();
  }

  /** Show only the left part of the screen (0–1), for the wipe as the graphics turn up. */
  reveal(fraction: number) {
    const clip = fraction >= 1 ? "" : `inset(0 ${((1 - fraction) * 100).toFixed(2)}% 0 0)`;
    for (const c of [this.canvas, this.front]) c.style.clipPath = clip;
  }

  // ------------------------------------------------------------- setup ---

  private initGL() {
    const gl = this.gl;
    if (gl.getExtension("EXT_color_buffer_float")) this.floatFmt = { internal: gl.RGBA16F, type: gl.HALF_FLOAT };
    else if (gl.getExtension("EXT_color_buffer_half_float")) this.floatFmt = { internal: gl.RGBA16F, type: gl.HALF_FLOAT };
    else this.floatFmt = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const prog = (frag: string, uniforms: string[]) => {
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("HD shader: " + gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("HD link: " + gl.getProgramInfoLog(p));
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
      return { p, u };
    };
    this.progs = {
      light: prog(LIGHT, ["uBack", "uMid", "uEmit", "uGlass", "uRes", "uAmbient", "uCount", "uLP", "uLC", "uLS", "uHaze", "uMotes", "uTime", "uPx", "uWorld0"]),
      bright: prog(BRIGHT, ["uScene", "uRes", "uThresh"]),
      blur: prog(BLUR, ["uTex", "uRes", "uDir"]),
      final: prog(FINAL, ["uScene", "uBloom", "uFore", "uRes", "uFloor", "uReflect", "uBloomK", "uExposure", "uTime"]),
    };
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const layerTex = (mips: boolean) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tex = { back: layerTex(false), mid: layerTex(true), emit: layerTex(false), glass: layerTex(true), fore: layerTex(true) };
  }

  private target(w: number, h: number, mips: boolean): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const { internal, type } = this.floatFmt;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }

  private freeTarget(t: Target | null) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  override resize() {
    super.resize();
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (const l of [...Object.values(this.layers), { canvas: this.front }]) {
      l.canvas.width = w;
      l.canvas.height = h;
    }
    if (!this.gl) return;
    for (const t of [this.scene, this.bloomA, this.bloomB]) this.freeTarget(t);
    this.scene = this.target(w, h, true);
    const bw = Math.max(1, w >> 2);
    const bh = Math.max(1, h >> 2);
    this.bloomA = this.target(bw, bh, false);
    this.bloomB = this.target(bw, bh, false);
  }

  // ------------------------------------------------------------ layers ---

  protected override layer(name: Layer) {
    const ctx = name === "front" ? this.frontCtx : this.layers[name].ctx;
    const canvas = ctx.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (name === "back")
      for (const e of [this.layers.emit.ctx, this.layers.glass.ctx]) {
        e.setTransform(1, 0, 0, 1, 0, 0);
        e.clearRect(0, 0, e.canvas.width, e.canvas.height);
      }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, this.shakeNow.x * this.dpr, this.shakeNow.y * this.dpr);
    this.ctx = ctx;
  }

  override emit(fn: () => void) {
    this.onLayer("emit", fn);
  }

  /** Mark where there's glass (the room behind it bends a little). */
  glass(fn: () => void) {
    this.onLayer("glass", fn);
  }

  private onLayer(name: "emit" | "glass", fn: () => void) {
    const was = this.ctx;
    const e = this.layers[name].ctx;
    e.setTransform(this.dpr, 0, 0, this.dpr, this.shakeNow.x * this.dpr, this.shakeNow.y * this.dpr);
    this.ctx = e;
    try {
      fn();
    } finally {
      this.ctx = was;
    }
  }

  // ------------------------------------------------------------- frame ---

  /** This frame's game and time step, for the props' own animation. */
  private now: { game: Game; dt: number } | null = null;
  private props = new PropArt();

  override draw(game: Game, dt: number) {
    this.now = { game, dt };
    super.draw(game, dt);
    // The out-of-focus foreground, on its own layer.
    const fc = this.layers.fore.ctx;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, fc.canvas.width, fc.canvas.height);
    if (game.inst.drawFore) {
      fc.setTransform(this.dpr, 0, 0, this.dpr, this.shakeNow.x * this.dpr, this.shakeNow.y * this.dpr);
      const was = this.ctx;
      this.ctx = fc;
      try {
        game.inst.drawFore(this, game);
      } finally {
        this.ctx = was;
      }
    }
    this.composite(game);
  }

  private upload(t: WebGLTexture, canvas: HTMLCanvasElement, mips: boolean) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  }

  private composite(game: Game) {
    const gl = this.gl;
    if (!this.scene || !this.bloomA || !this.bloomB || gl.isContextLost()) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cam = this.camera;
    const dpr = this.dpr;
    const sc = { ...DEFAULT_SCENE, ...(game.inst.hd?.(game, this.time) ?? {}) };

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.upload(this.tex.back, this.layers.back.canvas, false);
    this.upload(this.tex.mid, this.layers.mid.canvas, true);
    this.upload(this.tex.emit, this.layers.emit.canvas, false);
    this.upload(this.tex.glass, this.layers.glass.canvas, true);
    this.upload(this.tex.fore, this.layers.fore.canvas, true);

    // World → device pixels, GL style (y up from the bottom).
    const px = cam.scale * dpr;
    const toPx = (x: number, y: number) => {
      const s = cam.toScreen({ x, y });
      return { x: (s.x + this.shakeNow.x) * dpr, y: H - (s.y + this.shakeNow.y) * dpr };
    };
    const { p, c, s } = this.lightBuf;
    let n = 0;
    let shadowed = 0;
    for (const l of sc.lights) {
      if (n >= MAX_LIGHTS || l.intensity <= 0) continue;
      const q = toPx(l.x, l.y);
      // Skip lights whose reach is wholly off-screen.
      const r = l.radius * px;
      if (q.x < -r || q.x > W + r || q.y < -r || q.y > H + r) continue;
      const shadow = !!l.shadow && shadowed < MAX_SHADOWED;
      if (shadow) shadowed++;
      p.set([q.x, q.y, (l.z ?? 1) * px, r], n * 4);
      c.set([l.color[0] * l.intensity, l.color[1] * l.intensity, l.color[2] * l.intensity, shadow ? 1 : 0], n * 4);
      if (l.spot) s.set([Math.cos(l.spot.dir), Math.sin(l.spot.dir), Math.cos(l.spot.outer), Math.cos(l.spot.inner)], n * 4);
      else s.set([0, 0, -2, -2], n * 4);
      n++;
    }

    // 1. Light the scene.
    let pr = this.progs.light;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(pr.p);
    this.bind(0, this.tex.back, pr.u.uBack);
    this.bind(1, this.tex.mid, pr.u.uMid);
    this.bind(2, this.tex.emit, pr.u.uEmit);
    this.bind(3, this.tex.glass, pr.u.uGlass);
    gl.uniform2f(pr.u.uRes, W, H);
    gl.uniform3fv(pr.u.uAmbient, sc.ambient);
    gl.uniform1i(pr.u.uCount, n);
    gl.uniform4fv(pr.u.uLP, p);
    gl.uniform4fv(pr.u.uLC, c);
    gl.uniform4fv(pr.u.uLS, s);
    gl.uniform1f(pr.u.uHaze, sc.haze ?? 0);
    gl.uniform1f(pr.u.uMotes, sc.motes ?? 0);
    gl.uniform1f(pr.u.uTime, this.time);
    gl.uniform1f(pr.u.uPx, px);
    gl.uniform2f(pr.u.uWorld0, cam.x - cam.w / 2 / cam.scale, cam.y - cam.h / 2 / cam.scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.generateMipmap(gl.TEXTURE_2D);

    // 2. Bloom: bright bits at quarter size, blurred wide.
    const A = this.bloomA;
    const B = this.bloomB;
    pr = this.progs.bright;
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo);
    gl.viewport(0, 0, A.w, A.h);
    gl.useProgram(pr.p);
    this.bind(0, this.scene.tex, pr.u.uScene);
    gl.uniform2f(pr.u.uRes, A.w, A.h);
    gl.uniform1f(pr.u.uThresh, 0.75);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    pr = this.progs.blur;
    gl.useProgram(pr.p);
    gl.uniform2f(pr.u.uRes, A.w, A.h);
    for (const spread of [1, 2, 4]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
      this.bind(0, A.tex, pr.u.uTex);
      gl.uniform2f(pr.u.uDir, spread, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo);
      this.bind(0, B.tex, pr.u.uTex);
      gl.uniform2f(pr.u.uDir, 0, spread);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 3. Finish: reflection, bloom, tone map, grade.
    pr = this.progs.final;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(pr.p);
    this.bind(0, this.scene.tex, pr.u.uScene);
    this.bind(1, A.tex, pr.u.uBloom);
    this.bind(2, this.tex.fore, pr.u.uFore);
    gl.uniform2f(pr.u.uRes, W, H);
    gl.uniform1f(pr.u.uFloor, toPx(0, 0).y / H);
    gl.uniform1f(pr.u.uReflect, sc.reflect ?? 0);
    gl.uniform1f(pr.u.uBloomK, sc.bloom ?? 0.8);
    gl.uniform1f(pr.u.uExposure, sc.exposure ?? 1);
    gl.uniform1f(pr.u.uTime, this.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bind(unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }
}
