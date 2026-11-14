// Terrain meshes shaded by the real Sun. The shadow of every pixel is computed on the GPU by marching the height
// field towards the Sun (same geometry as docs/SCIENCE.md section 3, in the scene's Euclidean frame), and the
// visible fraction of the solar disc (section 4) is stored in a texture that the terrain material samples.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from '@iwsdk/core';
import type { Field, V3 } from './geo.js';

export const PALETTE = {
  sky: 0x000000,
  terrain: 0xa39888,
  unmodelled: 0x5c554b,
  panel: 0x24201b,
  text: 0xefe8dc,
  text2: 0xa89f92,
  sunlight: 0xf6b93b,
  earth: 0x2f6fd6,
  alert: 0xe0457b,
  ok: 0x8fc28a,
};

/** The Goldilocks score ramp (combined map); a single parameter uses its own colour (experience.ts scoreRamp). */
export const SCORE_RAMP = { label: 'Goldilocks score', a: 0x1c2a1b, b: PALETTE.ok, max: 100, unit: '' };

export function upTexture(field: Field, floatLinear: boolean): DataTexture {
  const n = field.grid.size;
  const t = new DataTexture(field.up, n, n, RedFormat, FloatType);
  t.minFilter = t.magFilter = floatLinear ? LinearFilter : NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function byteTexture(data: Uint8Array, size: number): DataTexture {
  const t = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
  t.minFilter = t.magFilter = NearestFilter; // the data's own pixels, never blended with "no data"
  t.needsUpdate = true;
  return t;
}

// Depth. Terrain and sky span 2 m to 300 km, too much for a standard depth buffer, so everything drawn with these
// shaders writes a logarithmic depth into the far half of the depth range; ordinary objects (lander, markers,
// panels, controllers) are confined to the near half with gl.depthRange(0, 0.5) and so always draw in front.
export const LOGZ_PARS_VERT = 'varying float vW;';
export const LOGZ_VERT = 'vW = gl_Position.w;';
export const LOGZ_PARS_FRAG = 'varying float vW;';
export const LOGZ_FRAG = 'gl_FragDepth = 0.5 + 0.5 * log2(1.0 + max(vW, 0.0)) / 18.61;'; // log2(1 + 400 km)

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// uv convention everywhere: u = (col + 0.5) / size (east), v = (row + 0.5) / size (south).
const SHADOW_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tUp;
uniform sampler2D tOuter;
uniform float hasOuter;
uniform float sizeM;
uniform float outerSizeM;
uniform float pixelM;
uniform vec2 sunH;      // unit horizontal direction to the Sun: (east, north)
uniform float tanEl;
uniform float semi;     // solar semi-diameter, radians
uniform float maxRange;
uniform float texel;    // one pixel of tUp in uv
uniform vec3 sun3;      // unit direction to the Sun in the field's frame
uniform float gain;
varying vec2 vUv;

float upAt(vec2 pm, out float ok) {
  vec2 uv = vec2(pm.x / sizeM + 0.5, 0.5 - pm.y / sizeM);
  ok = 1.0;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    return texture2D(tUp, uv).r;
  }
  if (hasOuter > 0.5) {
    vec2 uo = vec2(pm.x / outerSizeM + 0.5, 0.5 - pm.y / outerSizeM);
    if (uo.x > 0.0 && uo.x < 1.0 && uo.y > 0.0 && uo.y < 1.0) {
      return texture2D(tOuter, uo).r;
    }
  }
  ok = 0.0;
  return 0.0;
}

void main() {
  vec2 pm = vec2(vUv.x - 0.5, 0.5 - vUv.y) * sizeM;
  float u0 = texture2D(tUp, vUv).r + 1.0;
  float maxTan = -1.0e9;
  float s = pixelM;
  for (int i = 0; i < 128; i++) {
    if (s > maxRange) break;
    float ok;
    float u = upAt(pm + sunH * s, ok);
    if (ok < 0.5) break;
    maxTan = max(maxTan, (u - u0) / s);
    s += s < 25.0 * pixelM ? pixelM : s * 0.04;   // 1-pixel steps for 25 pixels, then 4 % growth
  }
  float margin = atan(tanEl) - atan(maxTan);
  float d = clamp(margin / semi, -1.0, 1.0);
  float f = 1.0 - (acos(d) - d * sqrt(1.0 - d * d)) / 3.14159265;
  // Green: the brightness of this pixel under the display curve of the terrain shader (its slope towards the Sun
  // times f), for meshes that read their light from here instead of working it out per screen pixel.
  float hw = texture2D(tUp, vUv - vec2(texel, 0.0)).r;
  float he = texture2D(tUp, vUv + vec2(texel, 0.0)).r;
  float hn = texture2D(tUp, vUv - vec2(0.0, texel)).r;
  float hs = texture2D(tUp, vUv + vec2(0.0, texel)).r;
  vec3 n = normalize(vec3(hw - he, 2.0 * pixelM, hn - hs));
  gl_FragColor = vec4(f, 1.0 - exp(-gain * f * max(dot(n, sun3), 0.0)), 0.0, 1.0);
}`;

/** Sunlit fraction (0..1) of every pixel of a field for a given Sun direction, as a texture. */
export class ShadowPass {
  readonly target: WebGLRenderTarget;
  private readonly material: ShaderMaterial;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(inner: Field, innerTex: Texture, outer?: Field, outerTex?: Texture, resolution?: number, maxRangeM = 150000) {
    const n = resolution ?? inner.grid.size;
    this.target = new WebGLRenderTarget(n, n, { depthBuffer: false });
    this.target.texture.minFilter = this.target.texture.magFilter = LinearFilter;
    this.material = new ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: SHADOW_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tUp: { value: innerTex },
        tOuter: { value: outerTex ?? innerTex },
        hasOuter: { value: outer ? 1 : 0 },
        sizeM: { value: inner.grid.size * inner.grid.pixelM },
        outerSizeM: { value: outer ? outer.grid.size * outer.grid.pixelM : 1 },
        pixelM: { value: inner.grid.pixelM },
        sunH: { value: new Vector2(1, 0) },
        texel: { value: 1 / inner.grid.size },
        sun3: { value: new Vector3(0, 1, 0) },
        gain: { value: 11 },
        tanEl: { value: 0 },
        semi: { value: 0.0046 },
        maxRange: { value: maxRangeM },
      },
    });
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material));
  }

  /** Lower resolutions cost less per update (used inside the headset). */
  setResolution(n: number): void {
    this.target.setSize(n, n);
  }

  get texture(): Texture {
    return this.target.texture;
  }

  /** sun: unit direction to the Sun in the scene frame; semiDeg: solar semi-diameter in degrees. */
  render(renderer: WebGLRenderer, sun: V3, semiDeg: number): void {
    const h = Math.hypot(sun[0], sun[2]) || 1e-9;
    const u = this.material.uniforms;
    (u.sunH.value as Vector2).set(sun[0] / h, -sun[2] / h);
    u.tanEl.value = sun[1] / h;
    (u.sun3.value as Vector3).set(sun[0], sun[1], sun[2]);
    u.semi.value = (semiDeg * Math.PI) / 180;
    const prevTarget = renderer.getRenderTarget();
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false; // an off-screen pass must not use the headset's cameras
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = xr;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}

const TERRAIN_VERT = /* glsl */ `
varying vec2 vUv;
${LOGZ_PARS_VERT}
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${LOGZ_VERT}
}`;

const TERRAIN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tUp;
uniform sampler2D tShadow;
uniform sampler2D tOverlay;
uniform float texel;
uniform float pixelM;
uniform vec3 sunDir;
uniform vec3 baseColor;
uniform vec3 rampA;
uniform vec3 rampB;
uniform float overlayOn;
uniform float overlayMax;
uniform float overlayAlpha;
uniform float ambient;
uniform float gain;
uniform vec4 hole;      // discard inside this uv rectangle (the far mesh under the site tile)
uniform float depthBias; // > 1 draws the mesh a little behind its true depth, under a finer mesh of the same ground
#ifdef CAP
// The south-pole grid drawn as a round cap of the globe: cut to a circle, faded into the globe at its edge, and
// coloured by the globe's own colour map (uv = polar stereographic, see the uv convention above).
uniform sampler2D tAlbedo;
uniform float hasAlbedo;
uniform float sizeM;
uniform vec2 capFade;   // angle from the pole where the fade starts and ends, radians
uniform float capInner; // nothing is drawn nearer the pole than this (a finer cap sits there), radians
#endif
varying vec2 vUv;
${LOGZ_PARS_FRAG}

void main() {
  if (vUv.x > hole.x && vUv.x < hole.z && vUv.y > hole.y && vUv.y < hole.w) discard;
  vec3 ground = baseColor;
  float alpha = 1.0;
  vec3 upv = vec3(0.0, 1.0, 0.0);   // straight up at this pixel, in the mesh's frame
#ifdef CAP
  vec2 pm = vec2(vUv.x - 0.5, 0.5 - vUv.y) * sizeM;
  float colat = 2.0 * atan(length(pm) / (2.0 * 1737400.0));
  alpha = 1.0 - smoothstep(capFade.x, capFade.y, colat);
  if (alpha <= 0.0 || colat < capInner) discard;
  float lon = atan(pm.x, pm.y);
  upv = vec3(sin(colat) * sin(lon), cos(colat), -sin(colat) * cos(lon));
  if (hasAlbedo > 0.5) {
    // Longitude jumps by 360 deg across 180 deg E, so the texture level is fixed (no seam line from the mip choice).
    ground = textureLod(tAlbedo, vec2(lon / 6.28318531 + 0.5, colat / 3.14159265), 0.0).rgb;
  }
#endif
#ifdef BAKED
  // Light worked out once per Sun position in the shadow pass (its green channel): one texture read per pixel.
  vec3 n = upv;
  float bright = texture2D(tShadow, vUv).g;
#else
  float hw = texture2D(tUp, vUv - vec2(texel, 0.0)).r;
  float he = texture2D(tUp, vUv + vec2(texel, 0.0)).r;
  float hn = texture2D(tUp, vUv - vec2(0.0, texel)).r;
  float hs = texture2D(tUp, vUv + vec2(0.0, texel)).r;
  vec3 n = normalize(vec3(hw - he, 2.0 * pixelM, hn - hs));
  float lit = texture2D(tShadow, vUv).r * max(dot(n, sunDir), 0.0);
  float bright = 1.0 - exp(-gain * lit);   // display curve: the Sun is 1 to 6 deg up, so true Lambert is near black
#endif
  // Unlit ground keeps a faint fill that darkens with slope, so the relief stays readable in the dark (display only).
  float fill = ambient * (0.25 + 0.75 * pow(max(dot(n, upv), 0.0), 8.0));
  vec3 col = ground * (fill + (1.0 - fill) * bright);
  if (overlayOn > 0.5) {
    float v = texture2D(tOverlay, vUv).r * 255.0;
    if (v < 254.5) {
      vec3 ramp = mix(rampA, rampB, clamp(v / overlayMax, 0.0, 1.0));
      col = mix(col, ramp * (0.62 + 0.38 * bright) + ground * 0.04, overlayAlpha);
    }
  }
  gl_FragColor = vec4(col, alpha);
  gl_FragDepth = 0.5 + 0.5 * log2(1.0 + max(vW, 0.0) * depthBias) / 18.61; // LOGZ_FRAG with the bias
  #include <colorspace_fragment>
}`;

export interface TerrainMaterialOptions {
  field: Field;
  upTex: Texture;
  shadowTex: Texture;
  hole?: [number, number, number, number];
  /** Draw the field as a round cap of the globe, fading out between these angles from the pole (degrees). */
  cap?: { inDeg: number; outDeg: number; innerDeg?: number };
  depthBias?: number;
  /** Read the light from the shadow pass's green channel (ShadowPass) instead of computing it per screen pixel. */
  baked?: boolean;
}

export function terrainMaterial(o: TerrainMaterialOptions): ShaderMaterial {
  const D2R = Math.PI / 180;
  return new ShaderMaterial({
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    defines: { ...(o.cap ? { CAP: '' } : {}), ...(o.baked ? { BAKED: '' } : {}) },
    // The cap blends into the globe at its edge; it is drawn after the globe and before every label.
    transparent: o.cap != null,
    uniforms: {
      tAlbedo: { value: null },
      hasAlbedo: { value: 0 },
      sizeM: { value: o.field.grid.size * o.field.grid.pixelM },
      capFade: { value: new Vector2((o.cap?.inDeg ?? 0) * D2R, (o.cap?.outDeg ?? 0) * D2R) },
      capInner: { value: (o.cap?.innerDeg ?? 0) * D2R },
      depthBias: { value: o.depthBias ?? 1 },
      tUp: { value: o.upTex },
      tShadow: { value: o.shadowTex },
      tOverlay: { value: o.shadowTex },
      texel: { value: 1 / o.field.grid.size },
      pixelM: { value: o.field.grid.pixelM },
      sunDir: { value: new Vector3(0, 1, 0) },
      baseColor: { value: new Color(PALETTE.terrain) },
      rampA: { value: new Color(0x000000) },
      rampB: { value: new Color(PALETTE.sunlight) },
      overlayOn: { value: 0 },
      overlayMax: { value: 100 },
      overlayAlpha: { value: 1 },
      ambient: { value: 0.06 },
      gain: { value: 11 },
      hole: { value: new Vector4(...(o.hole ?? [2, 2, 2, 2])) },
    },
  });
}

/** Draws a byte map over the terrain with a colour ramp, `alpha` 0..1 opaque. No texture or alpha 0: no map. */
export function setOverlay(m: ShaderMaterial, tex: Texture | null, ramp?: { a: number; b: number; max: number }, alpha = 1): void {
  const u = m.uniforms;
  u.overlayOn.value = tex && ramp && alpha > 0 ? 1 : 0;
  u.overlayAlpha.value = alpha;
  if (tex && ramp) {
    u.tOverlay.value = tex;
    (u.rampA.value as Color).set(ramp.a);
    (u.rampB.value as Color).set(ramp.b);
    u.overlayMax.value = ramp.max;
  }
}

/** A triangle mesh over a field, one vertex every `step` pixels. */
export function fieldGeometry(field: Field, step: number): BufferGeometry {
  const n = field.grid.size;
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i += step) {
    idx.push(i);
  }
  idx.push(n - 1);
  const m = idx.length;
  const pos = new Float32Array(m * m * 3);
  const uv = new Float32Array(m * m * 2);
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < m; b++) {
      const i = idx[a] * n + idx[b];
      const k = a * m + b;
      pos[3 * k] = field.x[i];
      pos[3 * k + 1] = field.up[i];
      pos[3 * k + 2] = field.z[i];
      uv[2 * k] = (idx[b] + 0.5) / n;
      uv[2 * k + 1] = (idx[a] + 0.5) / n;
    }
  }
  const index = new Uint32Array((m - 1) * (m - 1) * 6);
  let t = 0;
  for (let a = 0; a < m - 1; a++) {
    for (let b = 0; b < m - 1; b++) {
      const k = a * m + b;
      index[t++] = k;
      index[t++] = k + m;
      index[t++] = k + 1;
      index[t++] = k + 1;
      index[t++] = k + m;
      index[t++] = k + m + 1;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

/** Does this GPU filter float textures linearly? (Needed for smooth sampling of the height texture.) */
export function supportsFloatLinear(renderer: WebGLRenderer): boolean {
  return renderer.getContext().getExtension('OES_texture_float_linear') != null;
}
