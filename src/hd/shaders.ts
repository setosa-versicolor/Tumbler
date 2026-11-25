// GLSL for the HD renderer. Four passes:
//   light  — lights the room and the things in it, with soft shadows, haze and glow
//   bright — picks out what's bright enough to bloom (at quarter size)
//   blur   — a separable Gaussian, run a few times
//   final  — floor reflection, bloom, tone mapping, colour grade, vignette and grain

export const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const MAX_LIGHTS = 8;

export const LIGHT = `#version 300 es
precision highp float;
uniform sampler2D uBack;
uniform sampler2D uMid;
uniform sampler2D uEmit;
uniform vec2 uRes;
uniform vec3 uAmbient;
uniform int uCount;
uniform vec4 uLP[${MAX_LIGHTS}];   // x, y, height (px), radius (px)
uniform vec4 uLC[${MAX_LIGHTS}];   // linear rgb * intensity, casts shadow
uniform vec4 uLS[${MAX_LIGHTS}];   // spot dir xy, cos(outer), cos(inner); z < -1.5: all round
uniform float uHaze;
uniform float uMotes;
uniform float uTime;
uniform float uPx;        // device pixels per metre
uniform vec2 uWorld0;     // world position of pixel (0, 0)
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 lin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }

// How much of the light at lp is blocked, seen from p: march towards it over
// the props-and-Stanley layer. Further from p, read a blurrier copy, so
// shadows are sharp where things touch and soften with distance.
float occlusion(vec2 p, vec2 lp, float start, float jit) {
  vec2 d = lp - p;
  float len = length(d);
  float end = len - uPx * 0.3;
  if (end <= start) return 0.0;
  vec2 dir = d / len;
  float occ = 0.0;
  for (int i = 0; i < 20; i++) {
    float t = (float(i) + jit) / 20.0;
    float dist = mix(start, end, t * t);
    vec2 q = p + dir * dist;
    float lod = clamp(log2(1.0 + dist / (uPx * 0.04)), 1.0, 5.5);
    occ = max(occ, textureLod(uMid, q / uRes, lod).a);
  }
  return occ;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes;
  vec4 B = texture(uBack, uv);
  vec4 M = texture(uMid, uv);
  vec4 E = texture(uEmit, uv);
  vec3 alb = lin(B.rgb);
  float a = M.a;
  vec3 malb = a > 0.003 ? lin(M.rgb / a) : vec3(0.0);

  // Round off every edge: a normal from the blurred outline, so flat drawings light like solid things.
  float e = max(1.5, uPx * 0.03);
  float hx = textureLod(uMid, (px + vec2(e, 0.0)) / uRes, 1.5).a - textureLod(uMid, (px - vec2(e, 0.0)) / uRes, 1.5).a;
  float hy = textureLod(uMid, (px + vec2(0.0, e)) / uRes, 1.5).a - textureLod(uMid, (px - vec2(0.0, e)) / uRes, 1.5).a;
  vec3 n = normalize(vec3(-hx, -hy, 0.55));

  // Contact shading on the wall around things standing in front of it.
  float near = textureLod(uMid, uv, log2(max(2.0, uPx * 0.12))).a;
  vec3 lb = uAmbient * (1.0 - 0.5 * near);
  vec3 lm = uAmbient * (0.7 + 0.4 * n.y);
  vec3 sp = vec3(0.0);
  vec3 vol = vec3(0.0);
  // Interleaved gradient noise: steadier than white noise where shadows soften.
  float jit = 0.3 + 0.4 * fract(52.9829189 * fract(dot(floor(px), vec2(0.06711056, 0.00583715))));

  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uCount) break;
    vec4 P = uLP[i];
    vec4 C = uLC[i];
    vec4 S = uLS[i];
    vec2 d = P.xy - px;
    float dist = length(d);
    float f = clamp(dist / P.w, 0.0, 1.0);
    float att = (1.0 - f * f) * (1.0 - f * f) / (1.0 + 6.0 * f * f);
    if (att <= 0.0) continue;
    float spot = 1.0;
    if (S.z > -1.5) spot = smoothstep(S.z, S.w, dot(-d / max(dist, 1e-3), S.xy));
    if (spot <= 0.0) continue;
    float sh = 1.0;
    if (C.w > 0.5) sh = 1.0 - 0.92 * occlusion(px, P.xy, a * uPx * 0.12, jit);
    vec3 L = normalize(vec3(d, P.z));
    vec3 c = C.rgb * att * spot * sh;
    lb += c * L.z;
    lm += c * (max(dot(n, L), 0.0) * 0.85 + 0.15);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    sp += c * pow(max(dot(n, H), 0.0), 36.0) * (1.0 - n.z) * 2.5;
    if (S.z > -1.5) vol += C.rgb * spot * sqrt(att) * sh;
  }

  vec3 col = mix(alb * lb, malb * lm + sp, a);
  // Glowing things in the room (screens, bulbs, the sky outside), hidden behind what's in front.
  col += lin(E.rgb) * 2.4 * (1.0 - a);
  // Light beams in the haze, with dust drifting through them.
  col += vol * uHaze;
  vec2 w = uWorld0 + px / uPx;
  vec2 g = w * 4.0;
  vec2 cell = floor(g);
  vec2 r = vec2(hash(cell), hash(cell + 17.17));
  vec2 at = vec2(fract(r.x + uTime * (0.02 + 0.03 * r.y)), fract(r.y + 0.06 * sin(uTime * 0.7 + r.x * 6.28)));
  float mote = smoothstep(0.035, 0.0, length(fract(g) - at)) * step(0.7, hash(cell + 3.3));
  col += vol * mote * uMotes * 2.0;
  o = vec4(col, 1.0);
}
`;

export const BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uThresh;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = textureLod(uScene, uv, 1.5).rgb;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(uThresh, uThresh + 0.7, l), 1.0);
}
`;

export const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 s = uDir / uRes;
  vec3 c = texture(uTex, uv).rgb * 0.2270;
  c += (texture(uTex, uv + s * 1.385).rgb + texture(uTex, uv - s * 1.385).rgb) * 0.3162;
  c += (texture(uTex, uv + s * 3.231).rgb + texture(uTex, uv - s * 3.231).rgb) * 0.0703;
  o = vec4(c, 1.0);
}
`;

export const FINAL = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uFloor;     // floor line, as a fraction of the height from the bottom
uniform float uReflect;
uniform float uBloomK;
uniform float uExposure;
uniform float uTime;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 dc = uv - 0.5;
  // A touch of lens fringing towards the corners.
  vec2 ca = dc * dot(dc, dc) * 0.012;
  vec3 col = vec3(texture(uScene, uv + ca).r, texture(uScene, uv).g, texture(uScene, uv - ca).b);

  // Polished floor: a blurry mirror of the room, fading with depth.
  if (uReflect > 0.0 && uv.y < uFloor) {
    float dy = (uFloor - uv.y) * uRes.y;
    vec2 ruv = vec2(uv.x, uFloor + (uFloor - uv.y) * 1.15);
    float lod = clamp(log2(1.0 + dy * 0.18), 0.0, 5.5);
    vec3 r = textureLod(uScene, ruv, lod).rgb;
    float fade = exp(-dy / (uRes.y * 0.07));
    col += r * uReflect * fade;
  }

  col += texture(uBloom, uv).rgb * uBloomK;
  col *= uExposure;
  col = aces(col);
  // Grade: cool shadows, warm highlights.
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col += (1.0 - l) * vec3(-0.006, 0.004, 0.022) + l * vec3(0.018, 0.006, -0.018);
  col = pow(col, vec3(1.0 / 2.2));
  // Vignette and film grain.
  col *= 1.0 - 0.55 * pow(length(dc * vec2(1.0, 0.8)) * 1.25, 2.4);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 517.0) - 0.5) * 0.035;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
