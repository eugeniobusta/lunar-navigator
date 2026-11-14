// Scene objects that are not terrain: Sun and Earth discs, labels, lander, rocket, markers.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Points,
  RingGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  BoxGeometry,
  type Texture,
} from '@iwsdk/core';
import {
  LOGZ_FRAG,
  LOGZ_PARS_FRAG,
  LOGZ_PARS_VERT,
  LOGZ_VERT,
  PALETTE,
} from './terrain.js';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
export const FONT = 'Barlow, system-ui, sans-serif';

/** A flat-colour material drawn in the far (terrain and sky) depth range, so terrain can hide it. */
export function farColorMaterial(color: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) } },
    side: DoubleSide,
    vertexShader: `${LOGZ_PARS_VERT}
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGZ_VERT} }`,
    fragmentShader: `precision highp float; uniform vec3 color; ${LOGZ_PARS_FRAG}
      void main() { gl_FragColor = vec4(color, 1.0); ${LOGZ_FRAG}
      #include <colorspace_fragment>
      }`,
  });
}

/** A sphere lit by the Sun only (ambient for the night side), in the far depth range; `sunDir` is in world axes. */
export function farLitMaterial(color: number, ambient: number, gain: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      color: { value: new Color(color) },
      map: { value: null },
      hasMap: { value: 0 },
      sunDir: { value: new Vector3(0, 1, 0) },
      ambient: { value: ambient },
      gain: { value: gain },
    },
    vertexShader: `varying vec3 vN; varying vec2 vUv; ${LOGZ_PARS_VERT}
      void main() { vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGZ_VERT} }`,
    fragmentShader: `precision highp float; uniform vec3 color; uniform vec3 sunDir; uniform float ambient; uniform float gain;
      uniform sampler2D map; uniform float hasMap; varying vec3 vN; varying vec2 vUv; ${LOGZ_PARS_FRAG}
      void main() {
        float lit = max(dot(normalize(vN), sunDir), 0.0);
        // A picture of the Earth is dark (oceans reflect a few per cent): it is drawn 1.8 times brighter to read.
        vec3 base = mix(color, min(texture2D(map, vUv).rgb * 1.8, 1.0), hasMap);
        gl_FragColor = vec4(base * (ambient + (1.0 - ambient) * (1.0 - exp(-gain * lit))), 1.0); ${LOGZ_FRAG}
        #include <colorspace_fragment>
      }`,
  });
}

/** How far the Sun's glow reaches, in radii of its disc. */
export const SUN_GLOW = 4;

/**
 * The Sun: a disc that faces the viewer, radius 1, carrying a picture of the real Sun when one is given, with a
 * glow round it (the only glow in the scene: there is no air to light up anything else). Far depth range, so the
 * hills hide the disc and its glow alike.
 */
export function sunDisc(): Mesh {
  const mat = new ShaderMaterial({
    uniforms: { map: { value: null }, hasMap: { value: 0 }, color: { value: new Color(PALETTE.sunlight) } },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 vP; ${LOGZ_PARS_VERT}
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGZ_VERT} }`,
    fragmentShader: `precision highp float; uniform sampler2D map; uniform float hasMap; uniform vec3 color; varying vec2 vP; ${LOGZ_PARS_FRAG}
      void main() {
        float r = length(vP);
        vec3 disc = mix(color, texture2D(map, clamp(vP * 0.5 + 0.5, 0.0, 1.0)).rgb, hasMap);
        float glow = 0.5 * exp(-1.7 * max(r - 1.0, 0.0)) * (1.0 - smoothstep(${(SUN_GLOW * 0.6).toFixed(1)}, ${SUN_GLOW.toFixed(1)}, r));
        float inDisc = 1.0 - smoothstep(0.97, 1.0, r);
        gl_FragColor = vec4(mix(color, disc, inDisc), mix(glow, 1.0, inDisc)); ${LOGZ_FRAG}
        #include <colorspace_fragment>
      }`,
  });
  const m = new Mesh(new PlaneGeometry(2 * SUN_GLOW, 2 * SUN_GLOW), mat);
  m.renderOrder = -3; // blended: before the terrain caps, which are nearer
  return m;
}

/** The Earth: a sphere lit by the Sun only, carrying a picture of the real Earth when one is given. */
export function earthBall(): Mesh {
  const mat = farLitMaterial(PALETTE.earth, 0.05, 6);
  return new Mesh(new SphereGeometry(1, 48, 24), mat);
}

/** Gives the Sun's disc or the Earth its picture. */
export function setMap(mesh: Mesh, tex: Texture | null): void {
  const u = (mesh.material as ShaderMaterial).uniforms;
  u.map.value = tex;
  u.hasMap.value = tex ? 1 : 0;
}

export interface Label {
  sprite: Sprite;
  /** Multiplies the label's size (larger inside the headset, where the field of view is wide). */
  zoom(k: number): void;
  /** Width over height of the current text box. */
  aspect(): number;
  set(text: string, color?: number): void;
}

/** Text that always faces the viewer at a constant angular size. heightFrac: text height as a fraction of 1 m at 1 m. */
export function makeLabel(text: string, color: number = PALETTE.text, heightFrac = 0.03): Label {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.minFilter = LinearFilter;
  tex.colorSpace = SRGBColorSpace;
  const mat = new SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
  const sprite = new Sprite(mat);
  sprite.renderOrder = 10;
  sprite.center.set(0.5, -0.4);
  let last = '';
  let k = 1;
  let aspect = 1;
  const apply = () => sprite.scale.set(heightFrac * aspect * k, heightFrac * k, 1);
  const set = (t: string, c: number = color) => {
    const key = `${t}|${c}`;
    if (key === last) {
      return;
    }
    last = key;
    const px = 44;
    ctx.font = `600 ${px}px ${FONT}`;
    const w = Math.ceil(ctx.measureText(t).width) + 28;
    const h = px + 22;
    if (canvas.width !== w || canvas.height !== h) {
      tex.dispose(); // GPU textures have a fixed size: a resized canvas needs a new one
    }
    canvas.width = w;
    canvas.height = h;
    ctx.font = `600 ${px}px ${FONT}`;
    ctx.fillStyle = 'rgba(36,32,27,0.82)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();
    ctx.fillStyle = hex(c);
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 14, h / 2 + 2);
    tex.needsUpdate = true;
    aspect = w / h;
    apply();
  };
  set(text);
  return {
    sprite,
    set,
    zoom(z) {
      k = z;
      apply();
    },
    aspect: () => aspect,
  };
}

const lambert = (color: number) => new MeshLambertMaterial({ color });

/**
 * A generic polar lander, about 3.5 m across: octagonal body, four legs, engine bell, a vertical solar panel on a
 * mast (panels stand upright at the poles because the Sun stays near the horizon) and a dish for the Earth link.
 * `panel` and `dish` are returned so the app can turn them to the real Sun and Earth azimuths.
 */
export function makeLander(): { group: Group; panel: Group; dish: Group } {
  const group = new Group();
  const foil = lambert(0xc9a24a);
  const metal = lambert(0xb8b2a6);
  const dark = lambert(0x3b352d);
  const body = new Mesh(new CylinderGeometry(1.25, 1.45, 1.2, 8), foil);
  body.position.y = 1.5;
  group.add(body);
  const deck = new Mesh(new CylinderGeometry(1.0, 1.25, 0.35, 8), metal);
  deck.position.y = 2.27;
  group.add(deck);
  const bell = new Mesh(new CylinderGeometry(0.25, 0.55, 0.6, 16, 1, true), dark);
  bell.position.y = 0.62;
  group.add(bell);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const leg = new Mesh(new CylinderGeometry(0.05, 0.05, 2.3, 8), metal);
    leg.position.set(Math.cos(a) * 1.75, 0.95, Math.sin(a) * 1.75);
    leg.rotation.set(0, -a, 0.62, 'YXZ');
    group.add(leg);
    const pad = new Mesh(new CylinderGeometry(0.32, 0.36, 0.08, 16), metal);
    pad.position.set(Math.cos(a) * 2.4, 0.04, Math.sin(a) * 2.4);
    group.add(pad);
  }
  const mast = new Mesh(new CylinderGeometry(0.04, 0.04, 2.6, 8), metal);
  mast.position.y = 3.7;
  group.add(mast);
  const panel = new Group();
  panel.position.y = 4.1;
  const cells = new Mesh(new BoxGeometry(2.4, 1.6, 0.04), lambert(0x24304a));
  panel.add(cells);
  const frame = new Mesh(new BoxGeometry(2.5, 1.7, 0.02), metal);
  frame.position.z = -0.02;
  panel.add(frame);
  group.add(panel);
  const dish = new Group();
  dish.position.set(0.7, 2.75, 0);
  const bowl = new Mesh(new ConeGeometry(0.42, 0.22, 24, 1, true), new MeshLambertMaterial({ color: 0xefe8dc, side: DoubleSide }));
  bowl.rotation.x = -Math.PI / 2; // opens towards +Z
  bowl.position.z = -0.11;
  dish.add(bowl);
  group.add(dish);
  return { group, panel, dish };
}

/** A small rocket pointing along +Y, 1 unit long. */
export function makeRocket(): Group {
  const g = new Group();
  const body = new MeshBasicMaterial({ color: PALETTE.text });
  const accent = new MeshBasicMaterial({ color: PALETTE.sunlight });
  const tube = new Mesh(new CylinderGeometry(0.09, 0.09, 0.6, 16), body);
  tube.position.y = 0.3;
  g.add(tube);
  const nose = new Mesh(new ConeGeometry(0.09, 0.3, 16), accent);
  nose.position.y = 0.75;
  g.add(nose);
  for (let i = 0; i < 3; i++) {
    const fin = new Mesh(new BoxGeometry(0.02, 0.2, 0.16), accent);
    const a = (i * 2 * Math.PI) / 3;
    fin.position.set(Math.cos(a) * 0.12, 0.1, Math.sin(a) * 0.12);
    fin.rotation.y = -a + Math.PI / 2;
    g.add(fin);
  }
  const flame = new Mesh(new ConeGeometry(0.07, 0.35, 12), new MeshBasicMaterial({ color: PALETTE.sunlight, transparent: true, opacity: 0.7 }));
  flame.rotation.x = Math.PI;
  flame.position.y = -0.17;
  g.add(flame);
  return g;
}

// Markers and lines ignore depth and are drawn in the blended pass, after the terrain caps that fade at their edge.
export function siteMarker(color: number): Mesh {
  const m = new Mesh(new SphereGeometry(1, 16, 12), new MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  m.renderOrder = 4;
  return m;
}

/** A flat ring on the ground (in the XZ plane), radius 1. */
export function groundRing(color: number, inner = 0.82): Mesh {
  const m = new Mesh(
    new RingGeometry(inner, 1, 48),
    new MeshBasicMaterial({ color, side: DoubleSide, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

export function polyline(points: number[], color: number, opacity = 1, closed = false): Line {
  const pts = closed ? [...points, points[0], points[1], points[2]] : points;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const line = new Line(geo, new LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
  line.frustumCulled = false;
  line.renderOrder = 2;
  return line;
}

/**
 * Real stars as points on a unit sphere in ICRF axes (the app rotates the object into the scene). Faint by design:
 * the brightest star is drawn at 30 % of the text colour.
 */
export function makeStars(stars: Float32Array, n: number): Points {
  const pos = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set(stars.subarray(4 * i, 4 * i + 3), 3 * i);
    mag[i] = stars[4 * i + 3];
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('mag', new Float32BufferAttribute(mag, 1));
  const mat = new ShaderMaterial({
    uniforms: { color: { value: new Color(PALETTE.text) }, px: { value: 1 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float mag; uniform float px; varying float vB; ${LOGZ_PARS_VERT}
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGZ_VERT}
        vB = 0.30 * clamp(1.0 - (mag + 1.46) / 6.5, 0.3, 1.0);
        gl_PointSize = px * clamp(3.4 - 0.5 * mag, 1.4, 4.2);
      }`,
    fragmentShader: `precision highp float; uniform vec3 color; varying float vB; ${LOGZ_PARS_FRAG}
      void main() {
        if (length(gl_PointCoord - 0.5) > 0.5) discard;
        gl_FragColor = vec4(color * vB, 1.0); ${LOGZ_FRAG}
        #include <colorspace_fragment>
      }`,
  });
  const p = new Points(geo, mat);
  p.frustumCulled = false;
  return p;
}
