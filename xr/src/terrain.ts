// Terrain meshes shaded by the real Sun. The shadow of every pixel is computed on the GPU by marching the height
// field towards the Sun (same geometry as docs/SCIENCE.md section 3, in the scene's Euclidean frame), and the
// visible fraction of the solar disc (section 4) is stored in a texture that the terrain material samples.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  RGFormat,
  RGBAFormat,
  SRGBColorSpace,
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

export function upTexture(field: Field, floatLinear: boolean): DataTexture {
  const n = field.grid.size;
  const t = new DataTexture(field.up, n, n, RedFormat, FloatType);
  t.minFilter = t.magFilter = floatLinear ? LinearFilter : NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** The slopes of a field (rise per metre towards scene +x and +z) as a half-float texture: one read gives the normal. */
export function slopeTexture(field: Field): DataTexture {
  const n = field.grid.size;
  const { up, x, z } = field;
  const data = new Uint16Array(2 * n * n);
  for (let r = 0; r < n; r++) {
    const r0 = Math.max(0, r - 1);
    const r1 = Math.min(n - 1, r + 1);
    for (let c = 0; c < n; c++) {
      const c0 = Math.max(0, c - 1);
      const c1 = Math.min(n - 1, c + 1);
      const i = r * n + c;
      data[2 * i] = DataUtils.toHalfFloat((up[r * n + c1] - up[r * n + c0]) / (x[r * n + c1] - x[r * n + c0]));
      data[2 * i + 1] = DataUtils.toHalfFloat((up[r1 * n + c] - up[r0 * n + c]) / (z[r1 * n + c] - z[r0 * n + c]));
    }
  }
  const t = new DataTexture(data, n, n, RGFormat, HalfFloatType);
  t.minFilter = t.magFilter = LinearFilter;
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
#ifdef DETAIL
varying vec3 vPos;
varying vec3 vWorld;
#endif
${LOGZ_PARS_VERT}
void main() {
  vUv = uv;
#ifdef DETAIL
  vPos = position;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
#endif
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
uniform sampler2D tCodes;
uniform float overlayOn;
uniform float hatchN;    // hatch lines across the grid
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
uniform float mapReach; // the map is drawn out to this angle from the pole (NASA's 6 deg limit), radians
#endif
#ifdef DETAIL
// The surface seen from 2 m: the LOLA shape (its slopes in tSlope) with small craters and roughness added by the
// detail tile (ground.ts), read at three scales. The added detail is illustrative; the shape underneath is not.
uniform sampler2D tSlope;   // rg: rise per metre of the field towards +x and +z
uniform sampler2D tDetail;  // rg: slopes of the detail, b: its sunlit fraction for this Sun, a: albedo variation
uniform float detailT;      // metres covered by the detail tile
uniform float detailS;      // the tile is also laid this many times larger
uniform float detailK;      // ... with its relief scaled by this
uniform vec2 detailOff;
uniform vec3 nearHole;      // x, z, radius: not drawn there (the near patch of real geometry is)
varying vec3 vPos;
varying vec3 vWorld;
#endif
varying vec2 vUv;
${LOGZ_PARS_FRAG}

void main() {
  if (vUv.x > hole.x && vUv.x < hole.z && vUv.y > hole.y && vUv.y < hole.w) discard;
  vec3 ground = baseColor;
  float alpha = 1.0;
  vec3 upv = vec3(0.0, 1.0, 0.0);   // straight up at this pixel, in the mesh's frame
  float mapOn = overlayOn;
#ifdef CAP
  vec2 pm = vec2(vUv.x - 0.5, 0.5 - vUv.y) * sizeM;
  float colat = 2.0 * atan(length(pm) / (2.0 * 1737400.0));
  alpha = 1.0 - smoothstep(capFade.x, capFade.y, colat);
  if (alpha <= 0.0 || colat < capInner) discard;
  float lon = atan(pm.x, pm.y);
  // As on the website, the map stops at the 84 deg S circle: beyond it everything is outside NASA's limit.
  if (colat > mapReach) mapOn = 0.0;
  upv = vec3(sin(colat) * sin(lon), cos(colat), -sin(colat) * cos(lon));
  if (hasAlbedo > 0.5) {
    // Longitude jumps by 360 deg across 180 deg E, so the texture level is fixed (no seam line from the mip choice).
    ground = textureLod(tAlbedo, vec2(lon / 6.28318531 + 0.5, colat / 3.14159265), 0.0).rgb;
  }
#endif
#ifdef DETAIL
  if (distance(vPos.xz, nearHole.xy) < nearHole.z) discard;
  vec4 d1 = texture2D(tDetail, vPos.xz / detailT);
  vec4 d0 = texture2D(tDetail, vPos.xz * (8.0 / detailT));
  vec4 d2 = texture2D(tDetail, vPos.xz / (detailT * detailS) + detailOff);
  // Level of detail by distance: beyond a few hundred metres the detail goes over into its own average (the top
  // of the tile's mip chain), so far hills carry no repeating pattern and no shimmer.
  float farAway = smoothstep(400.0, 2200.0, vW);
  float meanLit = textureLod(tDetail, vec2(0.5), 9.0).b;
  vec2 sl = texture2D(tSlope, vUv).rg + (1.0 - farAway) * (d1.rg + 0.6 * d0.rg + detailK * d2.rg);
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  float detailLit = mix(d1.b * mix(1.0, d0.b, 0.6) * mix(1.0, d2.b, 0.5), meanLit * mix(1.0, meanLit, 0.6) * mix(1.0, meanLit, 0.5), farAway);
  float sunlit = texture2D(tShadow, vUv).r * detailLit;
  // Regolith is not a matt wall: it scatters light back towards the Sun (Lommel-Seeliger, with a phase function
  // that falls away from the Sun's direction and a surge close to it), so low sunlight still reads as bright.
  vec3 toEye = normalize(cameraPosition - vWorld);
  float mu0 = max(dot(n, sunDir), 0.0);
  float mu = max(dot(n, toEye), 0.0);
  float phaseAngle = acos(clamp(dot(sunDir, toEye), -1.0, 1.0));
  float phase = 0.25 + 0.5 * exp(-1.2 * phaseAngle) + 0.6 * exp(-9.0 * phaseAngle);
  float bright = 1.0 - exp(-1.6 * sunlit * phase * 2.0 * mu0 / (mu0 + mu + 0.02));
  ground *= 0.8 + 0.4 * d1.a;
#elif defined(BAKED)
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
#ifdef DETAIL
  float fill = 0.6 * ambient * (0.4 + 0.6 * max(n.y, 0.0));
#else
  float fill = ambient * (0.25 + 0.75 * pow(max(dot(n, upv), 0.0), 8.0));
#endif
  vec3 col = ground * (fill + (1.0 - fill) * bright);
  if (mapOn > 0.5) {
    // The traffic-light classes, already painted as colour and opacity (paint.ts paintClasses), over the ground.
    vec4 o = texture2D(tOverlay, vUv);
    vec3 c = o.rgb;
    // Ground that fails a NASA limit (rag.ts UNSAFE = 8; grey, no data, is 3) is hatched as well as red: never
    // colour alone. The hatch is fixed to the ground.
    float code = floor(texture2D(tCodes, vUv).r * 255.0 + 0.5);
    if (code >= 8.0 && o.a > 0.0 && fract((vUv.x + vUv.y) * hatchN) < 0.28) {
      c *= 0.35;
    }
    col = mix(col, c * (0.62 + 0.38 * bright) + ground * 0.04, o.a);
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
  /** The surface seen from 2 m: the field's own slopes (slopeTexture) and the detail tile of ground.ts. */
  detail?: { slopeTex: Texture; tex: Texture; tileM: number; big: number; bigK: number; bigOff: [number, number] };
}

export function terrainMaterial(o: TerrainMaterialOptions): ShaderMaterial {
  const D2R = Math.PI / 180;
  return new ShaderMaterial({
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    defines: { ...(o.cap ? { CAP: '' } : {}), ...(o.baked ? { BAKED: '' } : {}), ...(o.detail ? { DETAIL: '' } : {}) },
    // The cap blends into the globe at its edge; it is drawn after the globe and before every label.
    transparent: o.cap != null,
    uniforms: {
      tAlbedo: { value: null },
      hasAlbedo: { value: 0 },
      sizeM: { value: o.field.grid.size * o.field.grid.pixelM },
      capFade: { value: new Vector2((o.cap?.inDeg ?? 0) * D2R, (o.cap?.outDeg ?? 0) * D2R) },
      capInner: { value: (o.cap?.innerDeg ?? 0) * D2R },
      mapReach: { value: 6 * D2R },
      depthBias: { value: o.depthBias ?? 1 },
      tUp: { value: o.upTex },
      tShadow: { value: o.shadowTex },
      tOverlay: { value: o.shadowTex },
      texel: { value: 1 / o.field.grid.size },
      pixelM: { value: o.field.grid.pixelM },
      sunDir: { value: new Vector3(0, 1, 0) },
      baseColor: { value: new Color(PALETTE.terrain) },
      tCodes: { value: o.shadowTex },
      overlayOn: { value: 0 },
      hatchN: { value: 90 },
      ambient: { value: 0.06 },
      gain: { value: 11 },
      hole: { value: new Vector4(...(o.hole ?? [2, 2, 2, 2])) },
      tSlope: { value: o.detail?.slopeTex ?? null },
      tDetail: { value: o.detail?.tex ?? null },
      detailT: { value: o.detail?.tileM ?? 1 },
      detailS: { value: o.detail?.big ?? 1 },
      detailK: { value: o.detail?.bigK ?? 0 },
      detailOff: { value: new Vector2(...(o.detail?.bigOff ?? [0, 0])) },
      nearHole: { value: new Vector3(0, 0, -1) },
    },
  });
}

/** Draws the painted classes (RGBA) over the terrain, hatched where `codes` says a NASA limit fails. Null: no map. */
export function setOverlay(m: ShaderMaterial, rgba: Texture | null, codes: Texture | null): void {
  const u = m.uniforms;
  u.overlayOn.value = rgba && codes ? 1 : 0;
  if (rgba && codes) {
    u.tOverlay.value = rgba;
    u.tCodes.value = codes;
  }
}

/** An RGBA texture of painted map pixels (sRGB bytes), one texel per grid cell. */
export function rgbaTexture(data: Uint8ClampedArray, size: number): DataTexture {
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.minFilter = t.magFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
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
