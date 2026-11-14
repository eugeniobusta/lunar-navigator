// The whole Moon: a sphere with the LROC colour map, raised and shaded by LOLA heights (NASA SVS CGI Moon Kit),
// lit by the same Sun direction and display curve as the south-pole relief, with a hole where that relief sits.
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Texture,
} from '@iwsdk/core';
import { parseHeightGrid, type HeightGrid, type HeightGridMeta } from '../../web/src/lib/analysis/demHorizon';
import { R_M } from './geo.js';
import { globeHeight, globeMesh, type GlobeHeights } from './moon.js';
import { LOGZ_PARS_FRAG, LOGZ_PARS_VERT, LOGZ_VERT, PALETTE } from './terrain.js';

/** xr/public/moon/moon.json (scripts/export_moon_globe.py). */
interface MoonMeta {
  color: Record<string, string>;
  relief: Record<string, string> & { slope_clamp: number };
  height: { file: string; cols: number; rows: number; unit_m: number; base_radius_m: number };
  polar?: HeightGridMeta & { file: string; reach_deg: number };
  credit: string;
}

export interface MoonKit {
  color: Texture;
  relief: Texture;
  slopeClamp: number;
  heights: GlobeHeights;
  /** LOLA heights round the south pole on a polar stereographic grid, out to `polarReachDeg` from the pole. */
  polar: HeightGrid | null;
  polarReachDeg: number;
}

/** True in a headset's own browser: it gets the 2K maps and the coarse globe. */
export const isHeadset = () => /OculusBrowser|Quest|Pico|VisionOS/i.test(navigator.userAgent);

/** Loads the globe's maps, 2K in a headset and 4K elsewhere. Null if they are not there: the globe is then plain. */
export async function loadMoonKit(): Promise<MoonKit | null> {
  const base = `${import.meta.env.BASE_URL}moon/`;
  try {
    const res = await fetch(`${base}moon.json`);
    if (!res.ok) {
      return null;
    }
    const meta = (await res.json()) as MoonMeta;
    const k = isHeadset() ? '2k' : '4k';
    const loader = new TextureLoader();
    const bytes = (file: string) => fetch(base + file).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(file))));
    const [color, relief, raw, polar] = await Promise.all([
      loader.loadAsync(base + meta.color[k]),
      loader.loadAsync(base + meta.relief[k]),
      bytes(meta.height.file),
      meta.polar ? bytes(meta.polar.file).catch(() => null) : null,
    ]);
    color.colorSpace = SRGBColorSpace;
    for (const t of [color, relief]) {
      t.wrapS = RepeatWrapping;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = 4;
    }
    const h = meta.height;
    if (raw.byteLength !== h.cols * h.rows * 2) {
      return null;
    }
    return {
      color,
      relief,
      slopeClamp: meta.relief.slope_clamp,
      heights: { data: new Uint16Array(raw), cols: h.cols, rows: h.rows, unitM: h.unit_m, baseRadiusM: h.base_radius_m },
      polar: meta.polar && polar ? parseHeightGrid(meta.polar, polar) : null,
      polarReachDeg: meta.polar?.reach_deg ?? 0,
    };
  } catch {
    return null;
  }
}

const GLOBE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
${LOGZ_PARS_VERT}
void main() {
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${LOGZ_VERT}
}`;

// The globe is drawn a little behind its true depth, so that where it meets the polar relief (whose heights are
// finer and differ by a few hundred metres) the relief always wins.
const GLOBE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tRelief;
uniform float hasMaps;
uniform float slopeClamp;
uniform vec3 plain;
uniform vec3 sunDir;
uniform vec3 centre;
uniform float holeV;      // uv.y below which the south-pole relief is drawn instead
uniform float ambient;
uniform float gain;
varying vec2 vUv;
varying vec3 vPos;
${LOGZ_PARS_FRAG}
void main() {
  if (vUv.y < holeV) discard;
  vec3 up = normalize(vPos - centre);
  vec3 n = up;
  vec3 base = plain;
  if (hasMaps > 0.5) {
    // East and north on the sphere; the Moon's north pole is -y in this frame.
    vec3 east = normalize(cross(vec3(0.0, -1.0, 0.0), up));
    vec3 north = cross(up, east);
    vec2 rise = (texture2D(tRelief, vUv).rg - 0.5) * 2.0 * slopeClamp;
    n = normalize(up - rise.x * east - rise.y * north);
    base = texture2D(tColor, vUv).rgb;
  }
  float lit = max(dot(n, sunDir), 0.0);
  float bright = 1.0 - exp(-gain * lit);
  float fill = ambient * (0.25 + 0.75 * pow(max(dot(n, up), 0.0), 8.0));
  gl_FragColor = vec4(base * (fill + (1.0 - fill) * bright), 1.0);
  gl_FragDepth = 0.5 + 0.5 * log2(1.0 + max(vW, 0.0) * 1.004) / 18.61;
  #include <colorspace_fragment>
}`;

export function globeMaterial(holeDeg: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: GLOBE_VERT,
    fragmentShader: GLOBE_FRAG,
    uniforms: {
      tColor: { value: null },
      tRelief: { value: null },
      hasMaps: { value: 0 },
      slopeClamp: { value: 0.5 },
      plain: { value: new Color(PALETTE.unmodelled) },
      sunDir: { value: new Vector3(0, 1, 0) },
      centre: { value: new Vector3(0, -R_M, 0) },
      holeV: { value: holeDeg / 180 },
      ambient: { value: 0.06 },
      gain: { value: 11 },
    },
  });
}

/** Gives the globe its maps (or leaves it plain without them). */
export function setGlobeMaps(m: ShaderMaterial, kit: MoonKit | null): void {
  const u = m.uniforms;
  u.hasMaps.value = kit ? 1 : 0;
  if (kit) {
    u.tColor.value = kit.color;
    u.tRelief.value = kit.relief;
    u.slopeClamp.value = kit.slopeClamp;
  }
}

/** The globe's mesh in the pole frame: `cols` x `cols / 2` quads, raised by the LOLA heights when they are there. */
export function globeGeometry(cols: number, heights: GlobeHeights | null): BufferGeometry {
  const m = globeMesh(cols, cols / 2, heights ? (lat, lon) => globeHeight(heights, lat, lon) : () => 0);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  g.setAttribute('uv', new BufferAttribute(m.uv, 2));
  g.setIndex(new BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** A black shell round the viewer's head, used to fade one scene into the next. opacity 0 = not drawn. */
export function fadeShell(): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(0.4, 16, 8),
    new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }),
  );
  mesh.renderOrder = 50;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
