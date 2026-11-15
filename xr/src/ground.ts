// The ground under the visitor's feet. The shape is NASA LOLA's (the site tile, 120 m per pixel, at 1:1); what is
// added here is small-scale detail that LOLA cannot see from orbit: small craters, roughness, rocks. It is
// ILLUSTRATIVE (the app says so on screen): a fixed, repeatable pattern, not measured, and no number shown is
// computed from it. The added relief never rises above the visitor's eyes (DETAIL_RANGE_M), so it cannot hide a
// Sun or an Earth that the numbers say are in view; only a rock can, as a rock would.
//   - a tile of detail heights (pure functions, tested), read by the terrain shader at three scales;
//   - its shadows for the Sun's direction, worked out on the GPU each time the Sun moves (long and sharp: the Sun
//     is a degree or two up and there is no air to soften them);
//   - a patch of real geometry round the visitor, so that craters have depth in stereo;
//   - rocks, with their shadows.
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DataUtils,
  Group,
  HalfFloatType,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Material,
  type Texture,
  type WebGLRenderer,
} from '@iwsdk/core';
import { fieldRowCol, meshUpAt, type Field, type V3 } from './geo.js';

/** The detail tile: metres across, and texels across. */
export const TILE_M = 96;
export const TILE_N = 512;
/** The tile is also laid this many times larger (craters of tens of metres), its relief scaled by BIG_K, shifted. */
export const BIG = 7.3;
export const BIG_K = 0.2;
export const BIG_OFF: [number, number] = [0.37, 0.61];
/** The patch of real geometry: metres between vertices, vertices across, and where its relief fades to the plain mesh. */
export const PATCH_STEP_M = 0.5;
export const PATCH_N = 129;
export const PATCH_FADE_M: [number, number] = [22, 29];
/** The plain terrain mesh is not drawn within this distance of the patch's centre, metres. */
export const PATCH_HOLE_M = 29.5;
/** The added relief stays within these, metres. The visitor's eyes are 2 m above the ground they stand on, so at
 *  least 0.5 m above the zero of the detail: higher than any rim it adds, wherever they stand. */
export const DETAIL_RANGE_M: [number, number] = [-1.5, 0.45];

// ------------------------------------------------------------------------------------------------ the detail (pure)

/** A repeatable number 0..1 for a cell of a lattice. */
export function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Craters: one per cell of each lattice with probability p, radius between rMin and rMax (mostly small), metres. */
const CRATERS = [
  { cell: 24, rMin: 3, rMax: 7, p: 0.55 },
  { cell: 8, rMin: 0.9, rMax: 2.6, p: 0.5 },
  { cell: 3, rMin: 0.3, rMax: 0.9, p: 0.45 },
];
/** Smooth roughness: lattice spacing and amplitude, metres. */
const ROUGH = [
  { cell: 6, amp: 0.07 },
  { cell: 2, amp: 0.018 },
  { cell: 0.75, amp: 0.006 },
];

/** A crater's height at `t` radii from its centre: a bowl 0.09 diameters deep (times `age`), a rim 0.02 high. */
export function craterProfile(t: number, radiusM: number, age: number): number {
  const d = 2 * radiusM * age;
  const rim = 0.02 * d * Math.exp(-(((t - 1) / 0.3) ** 2));
  return t < 1 ? rim - 0.09 * d * (1 - t * t) ** 2 : t < 1.6 ? rim : 0;
}

const wrap = (v: number, n: number) => ((v % n) + n) % n;
const fade = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const n = Math.round(TILE_M / cell);
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fade(fx - ix);
  const tz = fade(fz - iz);
  const v = (a: number, b: number) => hash(wrap(a, n), wrap(b, n), seed);
  return (v(ix, iz) * (1 - tx) + v(ix + 1, iz) * tx) * (1 - tz) + (v(ix, iz + 1) * (1 - tx) + v(ix + 1, iz + 1) * tx) * tz;
}

/** Height of the detail tile at x, z (metres); it repeats every TILE_M both ways. */
export function tileHeight(x: number, z: number): number {
  let h = 0;
  CRATERS.forEach((layer, k) => {
    const n = Math.round(TILE_M / layer.cell);
    const cx = Math.floor(x / layer.cell);
    const cz = Math.floor(z / layer.cell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = wrap(cx + dx, n);
        const iz = wrap(cz + dz, n);
        if (hash(ix, iz, 11 + k) > layer.p) {
          continue;
        }
        const r = layer.rMin * (layer.rMax / layer.rMin) ** (hash(ix, iz, 21 + k) ** 2);
        // The centre keeps the whole crater (to 1.6 radii) inside its own cell and the eight round it.
        const px = (cx + dx + 0.5 + (hash(ix, iz, 31 + k) - 0.5) * 0.9) * layer.cell;
        const pz = (cz + dz + 0.5 + (hash(ix, iz, 41 + k) - 0.5) * 0.9) * layer.cell;
        const t = Math.hypot(x - px, z - pz) / r;
        if (t < 1.6) {
          h += craterProfile(t, r, 0.45 + 0.55 * hash(ix, iz, 51 + k));
        }
      }
    }
  });
  ROUGH.forEach((layer, k) => {
    h += layer.amp * (2 * valueNoise(x, z, layer.cell, 61 + k) - 1);
  });
  return h;
}

/** The added relief at a point of the ground, metres: the tile, and the tile again BIG times larger. */
export function detailHeight(x: number, z: number): number {
  const h = tileHeight(x, z) + BIG_K * BIG * tileHeight(x / BIG + BIG_OFF[0] * TILE_M, z / BIG + BIG_OFF[1] * TILE_M);
  return Math.max(DETAIL_RANGE_M[0], Math.min(DETAIL_RANGE_M[1], h));
}

/** How much of the added relief the patch keeps at `d` metres from its centre: all of it near, none at its edge. */
export function patchWeight(d: number): number {
  return 1 - fade(Math.max(0, Math.min(1, (d - PATCH_FADE_M[0]) / (PATCH_FADE_M[1] - PATCH_FADE_M[0]))));
}

export interface Rock {
  x: number;
  z: number;
  /** Width and height, metres. */
  w: number;
  h: number;
  yaw: number;
}

/** The rocks within `reachM` of a point: one per 2.5 m cell with probability 0.5, mostly small, a few boulders. */
export function rocksNear(cx: number, cz: number, reachM: number): Rock[] {
  const cell = 2.5;
  const out: Rock[] = [];
  const i0 = Math.floor((cx - reachM) / cell);
  const i1 = Math.floor((cx + reachM) / cell);
  const j0 = Math.floor((cz - reachM) / cell);
  const j1 = Math.floor((cz + reachM) / cell);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (hash(i, j, 71) > 0.5) {
        continue;
      }
      const x = (i + hash(i, j, 72)) * cell;
      const z = (j + hash(i, j, 73)) * cell;
      if (Math.hypot(x - cx, z - cz) > reachM) {
        continue;
      }
      const u = hash(i, j, 74);
      const w = u > 0.97 ? 0.7 + 0.5 * hash(i, j, 75) : 0.06 + 0.45 * u ** 3;
      out.push({ x, z, w, h: w * (0.45 + 0.4 * hash(i, j, 76)), yaw: 2 * Math.PI * hash(i, j, 77) });
    }
  }
  return out.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
}

/** Length on flat ground of the shadow of something `heightM` high with the Sun `elevationRad` up; capped. */
export function shadowLength(heightM: number, elevationRad: number, capM = 18): number {
  return elevationRad <= 0 ? 0 : Math.min(capM, heightM / Math.tan(elevationRad));
}

/** The tile as texture data: slopes towards +x and +z, height (m), albedo variation 0..1; row = z, column = x. */
export function tileData(): Float32Array {
  const n = TILE_N;
  const px = TILE_M / n;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      h[j * n + i] = tileHeight((i + 0.5) * px, (j + 0.5) * px);
    }
  }
  const out = new Float32Array(4 * n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = 4 * (j * n + i);
      out[k] = (h[j * n + wrap(i + 1, n)] - h[j * n + wrap(i - 1, n)]) / (2 * px);
      out[k + 1] = (h[wrap(j + 1, n) * n + i] - h[wrap(j - 1, n) * n + i]) / (2 * px);
      out[k + 2] = h[j * n + i];
      out[k + 3] = valueNoise((i + 0.5) * px, (j + 0.5) * px, 12, 81);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ on the GPU

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// For every texel of the tile: is the Sun's disc above the detail's own skyline towards the Sun? The same test as
// the terrain's shadow pass (terrain.ts), on a tile that repeats.
const DETAIL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tTile;   // rg slopes, b height (m), a albedo
uniform vec2 sunXZ;        // unit horizontal direction to the Sun
uniform float tanEl;
uniform float semi;        // solar semi-diameter, radians
uniform float texelM;
uniform float tileM;
varying vec2 vUv;
void main() {
  vec4 d = texture2D(tTile, vUv);
  float maxTan = -1.0e9;
  float s = texelM;
  for (int i = 0; i < 40; i++) {
    float h = texture2D(tTile, vUv + sunXZ * (s / tileM)).b;
    maxTan = max(maxTan, (h - d.b) / s);
    s += s < 16.0 * texelM ? texelM : s * 0.09;   // 1-texel steps, then 9 % growth: out to 24 m
  }
  float m = clamp((atan(tanEl) - atan(maxTan)) / semi, -1.0, 1.0);
  float lit = 1.0 - (acos(m) - m * sqrt(1.0 - m * m)) / 3.14159265;
  gl_FragColor = vec4(d.rg, lit, d.a);
}`;

const ROCK_COLOR = 0x8d8375;

export class Ground {
  /** The patch, the rocks and their shadows; added to the site's scene. */
  readonly group = new Group();
  /** What the terrain shader reads (tDetail): slopes, sunlit fraction for the current Sun, albedo. */
  tex: Texture | null = null;
  readonly patch: Mesh;
  private rocks: InstancedMesh;
  private shadows: InstancedMesh;
  private rockList: Rock[] = [];
  private maxRocks = 256;
  private pass: { target: WebGLRenderTarget; material: ShaderMaterial; scene: Scene } | null = null;
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private field: Field | null = null;
  private step = 1;
  private centre: [number, number] = [0, 0];
  private extra: { x: number; z: number; w: number; h: number } | null = null;
  private dummy = new Object3D();
  private preparing: Promise<void> | null = null;

  constructor() {
    const n = PATCH_N;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * n * 3), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(n * n * 2), 2));
    const index = new Uint32Array((n - 1) * (n - 1) * 6);
    let t = 0;
    for (let a = 0; a < n - 1; a++) {
      for (let b = 0; b < n - 1; b++) {
        const k = a * n + b;
        index.set([k, k + n, k + 1, k + 1, k + n, k + n + 1], t);
        t += 6;
      }
    }
    geo.setIndex(new BufferAttribute(index, 1));
    this.patch = new Mesh(geo);
    this.patch.frustumCulled = false;
    this.patch.visible = false;
    // One rock shape, lumpy; every rock is that shape stretched and turned.
    const rock = new IcosahedronGeometry(1, 1);
    const p = rock.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = 0.72 + 0.5 * hash(Math.round(p.getX(i) * 50), Math.round(p.getY(i) * 50) * 131 + Math.round(p.getZ(i) * 50), 91);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    rock.computeVertexNormals();
    this.rocks = new InstancedMesh(rock, new MeshLambertMaterial({ color: ROCK_COLOR, flatShading: true }), this.maxRocks);
    // A shadow: a dark strip on the ground from the foot of a rock, away from the Sun, narrowing to its tip.
    const strip = new BufferGeometry();
    strip.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.18, 0, 1, -0.18, 0, 1]), 3));
    strip.setIndex([0, 2, 1, 0, 3, 2]);
    this.shadows = new InstancedMesh(strip, new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false }), this.maxRocks + 1);
    this.shadows.renderOrder = 1;
    this.rocks.frustumCulled = this.shadows.frustumCulled = false;
    this.rocks.count = this.shadows.count = 0;
    this.group.add(this.patch, this.shadows, this.rocks);
  }

  get ready(): boolean {
    return this.tex != null;
  }

  /** Builds the detail tile and its shadow pass (once; a fraction of a second, done during the opening view). */
  prepare(renderer: WebGLRenderer): Promise<void> {
    return (this.preparing ??= (async () => {
      await new Promise((r) => setTimeout(r, 0));
      const data = tileData();
      const half = new Uint16Array(data.length);
      const canRender = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
      for (let i = 0; i < data.length; i++) {
        // Without a float render target there is no shadow pass: the detail is then lit everywhere.
        half[i] = DataUtils.toHalfFloat(!canRender && i % 4 === 2 ? 1 : data[i]);
      }
      const tile = new DataTexture(half, TILE_N, TILE_N, RGBAFormat, HalfFloatType);
      tile.wrapS = tile.wrapT = RepeatWrapping;
      tile.magFilter = LinearFilter;
      tile.minFilter = canRender ? LinearFilter : LinearMipmapLinearFilter;
      tile.generateMipmaps = !canRender;
      tile.anisotropy = 4;
      tile.needsUpdate = true;
      if (!canRender) {
        this.tex = tile;
        return;
      }
      const target = new WebGLRenderTarget(TILE_N, TILE_N, { depthBuffer: false, type: HalfFloatType, format: RGBAFormat, generateMipmaps: true });
      const tt = target.texture;
      tt.wrapS = tt.wrapT = RepeatWrapping;
      tt.magFilter = LinearFilter;
      tt.minFilter = LinearMipmapLinearFilter;
      tt.anisotropy = 4;
      const material = new ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: DETAIL_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tTile: { value: tile },
          sunXZ: { value: new Vector2(1, 0) },
          tanEl: { value: 0.05 },
          semi: { value: 0.0046 },
          texelM: { value: TILE_M / TILE_N },
          tileM: { value: TILE_M },
        },
      });
      const scene = new Scene();
      scene.add(new Mesh(new PlaneGeometry(2, 2), material));
      this.pass = { target, material, scene };
      this.tex = tt;
      this.renderSun(renderer, [0.7, 0.05, 0.7], 0.27, 1);
    })());
  }

  /** The material of the patch: the site's terrain material with the detail (terrain.ts). */
  setPatchMaterial(m: Material | null): void {
    if (m) {
      this.patch.material = m;
    }
    this.patch.visible = m != null && this.field != null;
  }

  /** Fewer rocks at the lower detail levels of the headset. */
  setMaxRocks(n: number): void {
    this.maxRocks = Math.min(n, 256);
  }

  /** Height of the drawn ground at scene x, z: the terrain mesh plus what the patch adds there. */
  groundY(x: number, z: number): number {
    const f = this.field;
    if (!f) {
      return NaN;
    }
    const w = patchWeight(Math.hypot(x - this.centre[0], z - this.centre[1]));
    return meshUpAt(f, this.step, x, z) + (w > 0 ? w * detailHeight(x, z) : 0);
  }

  /**
   * Lays the patch and the rocks round scene point (x, z) of a field whose mesh has one vertex every `step`
   * pixels. `extra` is something else that casts a shadow (the lander). Returns the centre of the patch.
   */
  place(field: Field, step: number, x: number, z: number, extra: { x: number; z: number; w: number; h: number } | null): [number, number] {
    this.field = field;
    this.step = step;
    this.extra = extra;
    // Vertices stay on a fixed half-metre lattice, so the ground does not change shape when the patch moves.
    const cx = Math.round(x / PATCH_STEP_M) * PATCH_STEP_M;
    const cz = Math.round(z / PATCH_STEP_M) * PATCH_STEP_M;
    this.centre = [cx, cz];
    const n = PATCH_N;
    const size = field.grid.size;
    const pos = this.patch.geometry.getAttribute('position') as BufferAttribute;
    const uv = this.patch.geometry.getAttribute('uv') as BufferAttribute;
    const halfN = (n - 1) / 2;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const px = cx + (b - halfN) * PATCH_STEP_M;
        const pz = cz + (a - halfN) * PATCH_STEP_M;
        const k = a * n + b;
        const y = this.groundY(px, pz);
        pos.setXYZ(k, px, Number.isNaN(y) ? 0 : y, pz);
        const [fr, fc] = fieldRowCol(field, px, pz);
        uv.setXY(k, (fc + 0.5) / size, (fr + 0.5) / size);
      }
    }
    pos.needsUpdate = uv.needsUpdate = true;
    this.patch.visible = true;
    // Rocks, nearest first, none where the visitor stands or under the lander.
    this.rockList = rocksNear(cx, cz, PATCH_FADE_M[0] + 3)
      .filter((r) => Math.hypot(r.x - x, r.z - z) > 1.2 + r.w && (!extra || Math.hypot(r.x - extra.x, r.z - extra.z) > 3.2 + r.w))
      .slice(0, this.maxRocks);
    const d = this.dummy;
    this.rockList.forEach((r, i) => {
      d.position.set(r.x, this.groundY(r.x, r.z) + 0.2 * r.h, r.z);
      d.rotation.set(0, r.yaw, 0);
      d.scale.set(r.w * 0.5, r.h * 0.5, r.w * 0.42);
      d.updateMatrix();
      this.rocks.setMatrixAt(i, d.matrix);
    });
    this.rocks.count = this.rockList.length;
    this.rocks.instanceMatrix.needsUpdate = true;
    return this.centre;
  }

  /**
   * The Sun moved: the detail's shadows again, and the rocks'. `sun` is the unit direction to the Sun in the
   * scene, `sunFrac` how much of its disc the hills leave visible at the visitor's point (0: no shadows to cast).
   */
  renderSun(renderer: WebGLRenderer, sun: V3, semiDeg: number, sunFrac: number): void {
    const h = Math.hypot(sun[0], sun[2]) || 1e-9;
    const p = this.pass;
    if (p) {
      const u = p.material.uniforms;
      (u.sunXZ.value as Vector2).set(sun[0] / h, sun[2] / h);
      u.tanEl.value = sun[1] / h;
      u.semi.value = (semiDeg * Math.PI) / 180;
      const prev = renderer.getRenderTarget();
      const xr = renderer.xr.enabled;
      renderer.xr.enabled = false; // an off-screen pass must not use the headset's cameras
      renderer.setRenderTarget(p.target);
      renderer.render(p.scene, this.camera);
      renderer.setRenderTarget(prev);
      renderer.xr.enabled = xr;
    }
    const el = Math.atan2(sun[1], h);
    const casting = sunFrac > 0.02 && el > 0 && this.field != null;
    this.shadows.visible = casting;
    if (!casting) {
      return;
    }
    (this.shadows.material as MeshBasicMaterial).opacity = 0.85 * sunFrac;
    const ax = -sun[0] / h;
    const az = -sun[2] / h;
    const d = this.dummy;
    const cast = (x: number, z: number, w: number, height: number, i: number) => {
      const len = shadowLength(height, el);
      const y0 = this.groundY(x, z);
      const y1 = this.groundY(x + ax * len, z + az * len);
      const dy = Number.isNaN(y1) ? 0 : y1 - y0;
      d.position.set(x, y0 + 0.03, z);
      d.rotation.set(-Math.atan2(dy, len), Math.atan2(ax, az), 0, 'YXZ');
      d.scale.set(w, 1, Math.hypot(len, dy));
      d.updateMatrix();
      this.shadows.setMatrixAt(i, d.matrix);
    };
    this.rockList.forEach((r, i) => cast(r.x, r.z, r.w * 0.9, r.h * 0.8, i));
    let count = this.rockList.length;
    if (this.extra) {
      cast(this.extra.x, this.extra.z, this.extra.w, this.extra.h, count++);
    }
    this.shadows.count = count;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  /** Leaves the surface: nothing of the patch is drawn until it is placed again. */
  clear(): void {
    this.field = null;
    this.patch.visible = false;
    this.rocks.count = this.shadows.count = 0;
  }
}
