// The experience, a journey in three stages (journey.ts): the whole Moon -> the south pole (six places to land)
// -> standing on the surface at 1:1, with the real Sun and Earth over the real skyline.
// Every number shown comes from /data/ or from web/src/lib/analysis (demHorizon, computeSeries, computeMetrics).
import {
  AmbientLight,
  DirectionalLight,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3,
  VisibilityState,
  createSystem,
  type BufferGeometry,
  type DataTexture,
  type Line,
  type MeshBasicMaterial,
  type Object3D,
  type Points,
  type ShaderMaterial,
  type Texture,
} from '@iwsdk/core';
import {
  computeMetrics,
  computeSeries,
  sliceSeries,
  type Ephemeris,
  type Horizon,
  type Metrics,
  type Series,
} from '../../web/src/lib/analysis';
import { demHorizon, heightAt, stereoXY } from '../../web/src/lib/analysis/demHorizon';
import { paintClasses } from '../../web/src/lib/analysis/paint';
import { classGrid } from '../../web/src/lib/analysis/rag';
import { presetSelection, type Selection } from '../../web/src/lib/analysis/suitability';
import {
  loadEphemeris,
  loadPoleLayers,
  loadPoleSuitability,
  loadPriorities,
  loadSiteTile,
  loadSites,
  loadSouthPole,
  loadStars,
  tileFromPole,
  type Site,
  type SiteTile,
  type SouthPole,
  type Stars,
  type Suitability,
} from './data.js';
import { mapLegend, nextSunUp, paintStyle, priorities, ragColors, type Priorities } from './guide.js';
import { LEVELS, QualityGovernor } from './perf.js';
import {
  R_M,
  azElToScene,
  buildField,
  dirToScene,
  earthKmAt,
  gridFrame,
  groundAt,
  meshRowCol,
  sunDirAt,
  unitOf,
  type Field,
  type Frame,
  type GroundHit,
  type V3,
} from './geo.js';
import { BIG, BIG_K, BIG_OFF, Ground, PATCH_HOLE_M, TILE_M } from './ground.js';
import { fadeShell, globeGeometry, globeMaterial, isHeadset, loadMoonKit, loadSkyKit, setGlobeMaps, type MoonKit } from './globe.js';
import {
  FASTER,
  JOURNEY_SITES,
  Journey,
  MOON_HOURS_PER_S,
  RECOMMENDED_SITE,
  SURFACE_HOURS_PER_S,
  WINDOW_H,
  dayOf,
  earthRotationAngle,
  skyMoment,
  stageView,
  type MomentFacts,
  type MomentId,
  type Stage,
  type StageView,
} from './journey.js';
import {
  ARROW_TO_LAT,
  COMPASS_RINGS,
  POLE_POS,
  capEdge,
  earthArrow,
  globeHeight,
  orbitCamera,
  orbitPose,
  parallel,
  poleDir,
  polePoint,
  rotX,
  stepZoom,
  toRoom,
  type OrbitPose,
} from './moon.js';
import { CREDITS, Hud } from './hud.js';
import { SUN_GLOW, earthBall, groundRing, makeLabel, makeLander, makeRocket, makeStars, polyline, setMap, siteMarker, sunDisc, type Label } from './objects.js';
import { PALETTE, ShadowPass, byteTexture, fieldGeometry, rgbaTexture, setOverlay, slopeTexture, supportsFloatLinear, terrainMaterial, upTexture } from './terrain.js';
import { VrPanel } from './vrpanel.js';

type Mode = 'loading' | 'orbit' | 'flight' | 'stand';
type Hand = 'left' | 'right';

const X_AXIS = new Vector3(1, 0, 0);
const NEAR_ZOOM = 0.55; // ORBIT zoom from which the places to land are marked
const DIVE = 4; // during the flight to a site the view closes in on it by this much more
const SKY_D = 250000; // distance at which the Sun and Earth are drawn on the surface, metres
const EYE_M = 2; // observer height, as in every horizon file
const EARTH_R_KM = 6378.137;
const D2R = Math.PI / 180;
const POINT_ID = 'point'; // the place id of a point given by ?lat=&lon= that no site tile covers
const TILE_REACH_M = 29000; // a point this close to a site's centre (in x and in y) is shown on that site's 120 m tile
const RECOMMEND_AFTER_S = 5; // at the pole, the recommended place is pointed out after this long without a pick
// ORBIT: the Sun and the Earth are drawn close to the Moon, in their real directions, far larger and nearer than
// to scale. Distance from the centre of the view and radius, metres, at the whole Moon and at the pole.
const SUN_NEAR = { dist: [1.25, 3.0], radius: [0.1, 0.17] };
const EARTH_NEAR = { dist: [1.05, 1.6], radius: [0.11, 0.16] };
/** The laptop camera's distance from the centre of the view, at the whole Moon and at the pole, metres. */
const ORBIT_DIST = [3.5, 2.7];
// The picture of the Earth is laid on a sphere whose +x is 0 deg E, +y the north pole and -z 90 deg E.
const EARTH_AXES = new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
const COARSE_NOTE = 'Terrain here is interpolated from the 430 m south-pole map';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerpAz = (a: number, b: number, t: number) => (((a + ((((b - a) % 360) + 540) % 360 - 180) * t) % 360) + 360) % 360;

/** Where the visitor stands, and the Sun and Earth over that exact point for the 30 days. */
interface Spot {
  hit: GroundHit;
  pos: Vector3;
  hz: Horizon;
  series: Series;
  metrics: Metrics;
}

interface Marker {
  id: string;
  obj: Object3D;
  label: Label;
  /** Position and outward direction in the pole frame (metres), and in the room for the zoom in use. */
  local: V3;
  localN: V3;
  pos: Vector3;
  normal: Vector3;
}

/** Where to go: a site's tile, or a tile cut from the south-pole grid around a point no site tile covers. */
interface Dest {
  site: Site;
  /** Stereographic centre of a tile to cut from the south-pole grid. */
  centre?: [number, number];
  /** Where to stand [lat, lon]; the site's own point if absent. */
  spot?: [number, number];
}

/** The traffic-light map of the pole: the class of every cell for all ten parameters, painted. */
interface ClassMap {
  codes: Uint8Array;
  rgba: Uint8ClampedArray;
  tex: DataTexture;
  codeTex: DataTexture;
  ready: boolean;
}

interface SiteScene {
  site: Site;
  tile: SiteTile;
  frame: Frame;
  field: Field;
  farField: Field;
  shadow: ShadowPass;
  farShadow: ShadowPass;
  mat: ShaderMaterial;
  farMat: ShaderMaterial;
  /** The same ground as `mat`, for the patch of real geometry round the visitor (ground.ts). */
  patchMat: ShaderMaterial;
  mesh: Mesh;
  farMesh: Mesh;
  geos: Record<number, BufferGeometry>;
  farGeos: Record<number, BufferGeometry>;
  group: Group;
  textures: Texture[];
}

export class ExperienceSystem extends createSystem({}) {
  // data
  private sites: Site[] = [];
  private eph!: Ephemeris;
  private pole!: SouthPole;
  private prio: Priorities = priorities(null);
  /** What the safe landing colours score: all ten parameters, as the website's "Everything". */
  private selection: Selection = this.prio.initial;
  private poleSuit: Suitability | null = null;
  private poleScore: ClassMap | null = null;
  private tiles = new Map<string, Promise<SiteTile>>();
  private starData: Stars | null = null;
  private stars: Points | null = null;
  private q1 = new Quaternion();
  private q2 = new Quaternion();
  private m4 = new Matrix4();
  private m4b = new Matrix4();

  // state
  private mode: Mode = 'loading';
  private message: string | null = 'Loading NASA terrain and ephemeris';
  private journey = new Journey();
  private siteId: string | null = null;
  private place: Site | null = null;
  private startIdx = 0;
  /** The sample index of "now"; with no ?t= in the URL, each site opens at its next sunrise after it. */
  private nowIdx = 0;
  private autoTime = true;
  private showStats = false;
  private help = false;
  private colours = false;
  private faster = false;
  /** Buttons pressed so far, for the first-time hints. */
  private pressed = new Set<string>();
  private quality = new QualityGovernor();
  private statsText = '';
  private tH = 0;
  private playing = false;
  private clock = 0;
  /** At the pole: when the recommended place is pointed out, seconds on `clock`; null once done or not due. */
  private recommendAt: number | null = null;
  private hadSunrise = false;
  /** On the way down to the pole after "South Pole" was pressed. */
  private descending = false;
  private spot: Spot | null = null;
  private embed = false;
  private dirtyHud = true;
  private dirtySun = true;
  private lastSunIdx = -1;
  private lastDay = 0;
  private frameNo = 0;
  private wasXR = false;
  private logPanel = false;
  private view: StageView | null = null;

  // scene
  private floatLinear = false;
  private orbitRoot = new Group();
  private orbitMarkers = new Group();
  private siteRoot = new Group();
  private sky = new Group();
  private poleFrame!: Frame;
  private poleField!: Field;
  private poleShadow!: ShadowPass;
  private poleMat!: ShaderMaterial;
  private poleMesh!: Mesh;
  private poleGeos: Record<number, BufferGeometry> = {};
  private globeMat!: ShaderMaterial;
  private markers: Marker[] = [];
  private hovered: Marker | null = null;
  private rocket = makeRocket();
  private flight: { t: number; from: Vector3; to: Vector3; local: V3; dest: Dest } | null = null;
  /** ORBIT zoom: 0 = the whole Moon, 1 = the south pole (moon.ts orbitPose). It runs towards its target. */
  private zoom = 0;
  private zoomTarget = 0;
  private zoomSeconds = 2.6;
  private pose: OrbitPose = orbitPose(0);
  private poseQ = new Quaternion();
  private orbitFar = true;
  /** A place picked before the view is down at the pole: flown to once it is. */
  private pendingDest: Dest | null = null;
  private moonKit: MoonKit | null = null;
  private globe!: Mesh;
  private midField: Field | null = null;
  private midShadow: ShadowPass | null = null;
  private midMat: ShaderMaterial | null = null;
  private midMesh: Mesh | null = null;
  private midGeos: Record<number, BufferGeometry> = {};
  private midTick = 0;
  private groundTick = 0;
  /** `?detail=high|medium|low`: the headset's detail level on the laptop view, to measure it (docs/XR.md). */
  private forcedLevel: number | null = null;
  private globeGeos: Record<number, BufferGeometry> = {};
  private compass = new Group();
  private compassLabels: { label: Label; local: V3; minZoom: number }[] = [];
  private fade = fadeShell();
  private fading: { dir: number; mid: (() => void | Promise<void>) | null } | null = null;
  private scene3: SiteScene | null = null;
  private sun = sunDisc();
  private earth = earthBall();
  private sunLabel = makeLabel('Sun', PALETTE.sunlight);
  private earthLabel = makeLabel('Earth', 0xdce8ff);
  private lander = makeLander();
  /** The illustrative detail of the surface: small craters, roughness, rocks (ground.ts). */
  private ground = new Ground();
  private hoverRing = groundRing(PALETTE.sunlight, 0.7);
  private light = new DirectionalLight(0xffffff, 0);
  private status: { sunUp: boolean; earthUp: boolean } | null = null;
  private sunScene: V3 = [0, 1, 0];
  /** Kept so that the programs compiled during the opening view stay compiled (warmUp). */
  private warm: Mesh[] = [];

  // desktop camera
  private cam = {
    /** `dist` multiplies the distance the zoom gives (ORBIT_DIST). */
    orbit: { ...orbitCamera(0), dist: 1 },
    stand: { yaw: 0, pitch: 0.05, fov: 60 },
  };
  private drag: { x: number; y: number; moved: number; id: number } | null = null;
  private pointer = { x: 0, y: 0, inside: false };

  // XR
  private panel = new VrPanel();
  private select: Record<Hand, { pressed: boolean }> = { left: { pressed: false }, right: { pressed: false } };
  private activeHand: Hand = 'right';
  private rays: Partial<Record<Hand, Line>> = {};
  private hookedSession: XRSession | null = null;
  private standLift = 0;

  private hud!: Hud;
  private v1 = new Vector3();
  private v2 = new Vector3();
  private v3 = new Vector3();
  private camPos = new Vector3();

  // ------------------------------------------------------------------------------------------------ setup

  init(): void {
    const params = new URLSearchParams(location.search);
    this.embed = params.get('embed') === '1';
    const level = LEVELS.findIndex((l) => l.name === params.get('detail'));
    this.forcedLevel = level < 0 ? null : level;
    const r = this.renderer;
    r.setClearColor(PALETTE.sky, 1);
    this.scene.background = null;
    this.floatLinear = supportsFloatLinear(r);
    this.camera.near = 0.05;
    this.camera.far = 400000;
    this.camera.updateProjectionMatrix();

    this.scene.add(new AmbientLight(0xffffff, 0.12));
    this.scene.add(this.light);
    this.world.createTransformEntity(this.orbitRoot);
    this.world.createTransformEntity(this.orbitMarkers);
    this.world.createTransformEntity(this.siteRoot);
    this.world.createTransformEntity(this.sky);
    this.scene.add(this.fade);
    this.sky.add(this.sun, this.earth, this.sunLabel.sprite, this.earthLabel.sprite);
    this.sun.frustumCulled = this.earth.frustumCulled = false;
    this.orbitMarkers.add(this.rocket);
    this.rocket.visible = false;
    this.siteRoot.visible = this.orbitRoot.visible = this.orbitMarkers.visible = this.sky.visible = false;
    this.siteRoot.add(this.lander.group, this.hoverRing, this.ground.group);
    this.hoverRing.visible = false;

    this.panel.mesh.position.set(-0.62, 1.25, -0.95);
    this.panel.mesh.rotation.y = 0.58;
    this.panel.mesh.visible = false;
    this.player.add(this.panel.mesh);
    for (const hand of ['left', 'right'] as Hand[]) {
      const ray = polyline([0, 0, 0, 0, 0, -1], PALETTE.text2, 0.8);
      ray.scale.z = 4;
      ray.renderOrder = 30; // over the panel
      ray.visible = false;
      this.player.raySpaces[hand].add(ray);
      this.rays[hand] = ray;
    }

    this.hud = new Hud({ press: (id) => this.press(id) }, this.embed);
    // The hook for a voice, or a log: every moment of the journey is announced on the window too.
    const log: object[] = [];
    this.journey.on((e) => {
      log.push({ id: e.id, caption: e.caption });
      if (import.meta.env.DEV) {
        console.info(`[moment] ${e.id}: ${e.caption}`);
      }
      window.dispatchEvent(new CustomEvent('lunar-moment', { detail: e }));
      this.dirtyHud = true;
    });
    // For the checks in docs/XR.md: what the renderer drew in the last frame, and the moments so far.
    Object.assign(window, {
      lunarStats: () => ({
        mode: this.mode,
        stage: this.stage(),
        zoom: this.zoom,
        tH: this.tH,
        playing: this.playing,
        fps: this.quality.fps,
        ms: this.quality.meanMs,
        worstMs: this.quality.worstMs,
        level: this.forcedLevel != null ? LEVELS[this.forcedLevel].name : this.inXR ? LEVELS[this.quality.level].name : 'full',
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        spot: this.spot ? { lat: this.spot.hit.lat, lon: this.spot.hit.lon } : null,
        // Where the markers are on the page, CSS pixels (laptop view).
        markers: this.markers
          .filter((m) => m.obj.visible)
          .map((m) => {
            const p = m.pos.clone().project(this.camera);
            const r = this.renderer.domElement.getBoundingClientRect();
            return { id: m.id, x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
          }),
      }),
      lunarMoments: () => log,
    });
    this.bindDesktopInput();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe(() => {
        this.dirtyHud = true;
      }),
    );
    this.load(params).catch((e: unknown) => {
      this.message = `Could not load the data: ${e instanceof Error ? e.message : String(e)}`;
      this.dirtyHud = true;
      console.error(e);
    });
  }

  private async load(params: URLSearchParams): Promise<void> {
    const [sites, eph, pole, score, stars, prio, moonKit, sky] = await Promise.all([
      loadSites(),
      loadEphemeris(),
      loadSouthPole(),
      loadPoleSuitability(1024),
      loadStars(),
      loadPriorities(),
      loadMoonKit(),
      loadSkyKit(),
    ]);
    this.moonKit = moonKit;
    if (stars) {
      this.starData = stars;
      this.stars = makeStars(stars.stars, stars.n);
      this.stars.scale.setScalar(SKY_D * 1.2);
      this.sky.add(this.stars);
    }
    if (sky) {
      setMap(this.sun, sky.sun);
      setMap(this.earth, sky.earth);
    }
    this.sites = sites;
    this.eph = eph;
    this.pole = pole;
    this.prio = prio;
    const all = prio.presets.find((p) => p.key === 'everything');
    this.selection = all ? presetSelection(all) : prio.initial;
    this.poleSuit = score;
    const t = Date.parse(params.get('t') ?? '');
    this.autoTime = !Number.isFinite(t);
    this.nowIdx = this.clampStart(Math.round(((this.autoTime ? Date.now() : t) - eph.startMs) / (eph.stepS * 1000)));
    this.startIdx = this.nowIdx;
    this.buildOrbit();
    this.message = null;
    const site = params.get('site');
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    const dem = site ? this.siteDest(site) : null;
    if (params.has('lat') && Number.isFinite(lat) && Number.isFinite(lon) && lat < -80 && lat >= -90) {
      // A point chosen on the website's map (web/src/routes/xr.ts).
      await this.enterSurface(this.pointDest(lat, lon, 'Chosen point', POINT_ID));
    } else if (dem) {
      await this.enterSurface(dem);
    } else {
      if (params.get('stage') === 'pole') {
        this.zoom = this.zoomTarget = 1;
        this.orbitFar = false;
        this.cam.orbit = { ...orbitCamera(1), dist: 1 };
      }
      this.enterOrbit();
      if (this.zoom < 0.5) {
        this.emit('moon-intro');
      } else {
        this.arriveAtPole();
      }
    }
    void this.warmUp();
  }

  /**
   * During the opening view: compiles the programs and uploads the pictures that the later stages need, so that
   * entering them does not stall a frame; then fetches the recommended place and works out the colours.
   */
  private async warmUp(): Promise<void> {
    const r = this.renderer;
    await this.ground.prepare(r);
    if (!this.scene3) {
      // The surface's terrain program (the pole's is the same shader with other switches).
      const upTex = this.poleMat.uniforms.tUp.value as Texture;
      const mat = terrainMaterial({ field: this.poleField, upTex, shadowTex: this.poleShadow.texture, detail: this.detailOf(upTex) });
      const dummy = new Mesh(new PlaneGeometry(1, 1), mat);
      dummy.visible = false;
      this.siteRoot.add(dummy);
      this.warm.push(dummy);
    }
    try {
      await r.compileAsync(this.scene, this.camera);
    } catch {
      // without the extension the programs compile when first drawn
    }
    for (const m of [this.sun, this.earth]) {
      const map = (m.material as ShaderMaterial).uniforms.map.value as Texture | null;
      if (map) {
        r.initTexture(map);
      }
    }
    this.panel.draw(this.stageModel(), CREDITS);
    r.initTexture(this.panel.map);
    if (!this.scene3) {
      const first = this.siteDest(RECOMMENDED_SITE);
      if (first) {
        void this.tile(first).catch(() => undefined);
      }
    }
    await this.classifyPole();
  }

  /** The surface detail a site's terrain material reads: the field's slopes and the detail tile. */
  private detailOf(slopeTex: Texture) {
    return { slopeTex, tex: this.ground.tex!, tileM: TILE_M, big: BIG, bigK: BIG_K, bigOff: BIG_OFF };
  }

  private clampStart(i: number): number {
    return Math.max(0, Math.min(this.eph.n - WINDOW_H - 2, i));
  }

  private get inXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  private get idx(): number {
    return this.startIdx + this.tH;
  }

  private stage(): Stage {
    return this.mode === 'loading' ? 'loading' : this.mode === 'stand' ? 'surface' : this.mode === 'flight' ? 'flight' : this.zoomTarget < 0.5 ? 'moon' : 'pole';
  }

  /** What the captions may quote about where the visitor is. */
  private facts(extra: MomentFacts = {}): MomentFacts {
    const m = this.spot?.metrics;
    return {
      siteName: this.placeName() ?? undefined,
      latDeg: this.spot?.hit.lat ?? this.place?.lat,
      sunPct: m?.sunPct,
      earthPct: m?.earthPct,
      longestDarkH: m?.longestDarkH,
      ...extra,
    };
  }

  private emit(id: MomentId, extra: MomentFacts = {}): void {
    this.journey.emit(id, this.facts(extra));
  }

  /** The name of the place as the panel has it (shorter than the data's for IM-2). */
  private placeName(): string | null {
    return JOURNEY_SITES.find((k) => k.id === this.place?.id)?.label ?? this.place?.name ?? null;
  }

  // ------------------------------------------------------------------------------------------------ ORBIT

  private buildOrbit(): void {
    const grid = this.pole.grid;
    this.poleFrame = gridFrame(0, 0);
    this.poleField = buildField(grid, this.poleFrame);
    const upTex = upTexture(this.poleField, this.floatLinear);
    const kit = this.moonKit;
    // Three pieces of the same ground, finest first: our 430 m grid as a round cap at the pole; the CGI Moon Kit's
    // LOLA heights round it (about 2 km per pixel, out to 35 deg from the pole), both with real shadows; and the
    // globe beyond, with the kit's colour map and relief. Each fades into the next at its edge.
    const edge = capEdge((grid.size * grid.pixelM) / 2);
    let globeHole = edge.holeDeg;
    if (kit?.polar) {
      const reach = kit.polarReachDeg;
      this.midField = buildField(kit.polar, this.poleFrame);
      const midUp = upTexture(this.midField, this.floatLinear);
      this.midShadow = new ShadowPass(this.midField, midUp, undefined, undefined, 512, 600000);
      this.midMat = terrainMaterial({
        field: this.midField,
        upTex: midUp,
        shadowTex: this.midShadow.texture,
        cap: { inDeg: reach - 1.5, outDeg: reach - 0.3, innerDeg: edge.holeDeg },
        depthBias: 1.002,
        baked: true, // it fills most of the view from the pole: one texture read per pixel instead of six
      });
      this.midMesh = new Mesh(this.midGeometry(4), this.midMat);
      this.midMesh.frustumCulled = false;
      this.midMesh.renderOrder = -2;
      this.orbitRoot.add(this.midMesh);
      globeHole = reach - 2;
      // Mountains outside our grid cast their shadows into it.
      this.poleShadow = new ShadowPass(this.poleField, upTex, this.midField, midUp, undefined, 320000);
    } else {
      this.poleShadow = new ShadowPass(this.poleField, upTex);
    }
    this.poleMat = terrainMaterial({ field: this.poleField, upTex, shadowTex: this.poleShadow.texture, cap: edge });
    this.poleMesh = new Mesh(this.poleGeometry(8), this.poleMat);
    this.poleMesh.frustumCulled = false;
    this.poleMesh.renderOrder = -1; // blended at its edge, so after what lies under it; before every label
    this.orbitRoot.add(this.poleMesh);
    for (const m of kit ? [this.poleMat, this.midMat] : []) {
      if (m) {
        m.uniforms.tAlbedo.value = kit!.color;
        m.uniforms.hasAlbedo.value = 1;
      }
    }
    this.globeMat = globeMaterial(globeHole);
    setGlobeMaps(this.globeMat, kit);
    this.globe = new Mesh(this.globeGeometryFor(this.globeCols()), this.globeMat);
    this.globe.frustumCulled = false;
    this.orbitRoot.add(this.globe, this.compass);
    this.buildCompass();
    if (this.poleSuit?.limits && grid.size === 1024) {
      const n = grid.size * grid.size;
      const codes = new Uint8Array(n);
      const rgba = new Uint8ClampedArray(4 * n);
      this.poleScore = { codes, rgba, tex: rgbaTexture(rgba, grid.size), codeTex: byteTexture(codes, grid.size), ready: false };
    }
    // The six places to land: large markers, the recommended one in the Sun's colour.
    for (const k of JOURNEY_SITES) {
      const s = this.sites.find((q) => q.id === k.id && q.terrain === 'dem');
      if (!s) {
        continue;
      }
      const local = this.poleLocal(s.lat, s.lon);
      const localN = poleDir(s.lat, s.lon);
      const obj = siteMarker(k.id === RECOMMENDED_SITE ? PALETTE.sunlight : PALETTE.text);
      const label = makeLabel(k.label, k.id === RECOMMENDED_SITE ? PALETTE.sunlight : PALETTE.text, 0.024);
      label.zoom(this.inXR ? 1.9 : 1);
      this.orbitMarkers.add(obj, label.sprite);
      this.markers.push({ id: k.id, obj, label, local, localN, pos: new Vector3(), normal: new Vector3() });
    }
    this.placeOrbit();
    this.applyQuality();
  }

  /** Quads round the globe's equator: coarse in a headset, fine on a laptop. */
  private globeCols(): number {
    return this.inXR || isHeadset() || this.forcedLevel != null ? 128 : 384;
  }

  private midGeometry(step: number): BufferGeometry {
    return (this.midGeos[step] ??= fieldGeometry(this.midField!, step));
  }

  private globeGeometryFor(cols: number): BufferGeometry {
    return (this.globeGeos[cols] ??= globeGeometry(cols, this.moonKit?.heights ?? null));
  }

  private poleGeometry(step: number): BufferGeometry {
    return (this.poleGeos[step] ??= fieldGeometry(this.poleField, step));
  }

  /** The compass on the pole: latitude rings, a ring at the pole and an arrow along 0 deg E, towards Earth. */
  private buildCompass(): void {
    const line = (pts: [number, number][], color: number, opacity: number, closed: boolean) => {
      const flat: number[] = [];
      for (const [lat, lon] of pts) {
        flat.push(...this.poleLocal(lat, lon, 500));
      }
      this.compass.add(polyline(flat, color, opacity, closed));
    };
    const label = (text: string, lat: number, lon: number, color: number, minZoom: number) => {
      const l = makeLabel(text, color, 0.02);
      this.orbitMarkers.add(l.sprite);
      this.compassLabels.push({ label: l, local: this.poleLocal(lat, lon, 500), minZoom });
    };
    for (const lat of COMPASS_RINGS) {
      line(parallel(-lat), PALETTE.text2, 0.6, true);
      label(`${lat}° S`, -lat, 90, PALETTE.text2, NEAR_ZOOM);
    }
    line(parallel(-89.85, 15), PALETTE.text, 1, true);
    for (const part of earthArrow()) {
      line(part, 0xdce8ff, 1, false);
    }
    label('towards Earth (0° E)', ARROW_TO_LAT, 0, 0xdce8ff, 0.3);
    label('South Pole', -90, 0, PALETTE.text, 0);
  }

  /** Height of the ground at a latitude / longitude, metres: our south-pole grid where it reaches, else the globe's. */
  private groundH(lat: number, lon: number): number {
    if (lat < -80) {
      const [x, y] = stereoXY(lat, lon);
      const h = heightAt(this.pole.grid, x, y);
      if (!Number.isNaN(h)) {
        return h;
      }
    }
    return this.moonKit ? globeHeight(this.moonKit.heights, lat, lon) : 0;
  }

  /** A point of the Moon in the pole frame, metres. */
  private poleLocal(lat: number, lon: number, liftM = 0): V3 {
    return polePoint(lat, lon, this.groundH(lat, lon) + liftM);
  }

  /**
   * Places the Moon, its markers and the compass for the zoom in use (moon.ts orbitPose). During the flight to a
   * site the view also closes in on that site.
   */
  private placeOrbit(): void {
    let p = orbitPose(this.zoom);
    const f = this.flight;
    if (f) {
      const e = smooth(f.t);
      const k = 1 + (DIVE - 1) * e;
      const site = toRoom(p, f.local);
      const c: V3 = [0, 1, 2].map((i) => site[i] + (POLE_POS[i] - site[i]) * e) as V3;
      p = { ...p, scale: p.scale * k, origin: [0, 1, 2].map((i) => c[i] + k * (p.origin[i] - site[i])) as V3 };
    }
    this.pose = p;
    this.poseQ.setFromAxisAngle(X_AXIS, p.tilt);
    this.orbitRoot.position.set(...p.origin);
    this.orbitRoot.quaternion.copy(this.poseQ);
    this.orbitRoot.scale.setScalar(p.scale);
    for (const m of this.markers) {
      m.pos.set(...toRoom(p, m.local));
      m.normal.set(...rotX(m.localN, p.tilt));
      m.obj.position.copy(m.pos);
      m.label.sprite.position.copy(m.pos);
    }
    const near = this.zoom >= NEAR_ZOOM;
    this.compass.children.forEach((o, i) => {
      o.visible = i >= COMPASS_RINGS.length || near; // the pole ring and the arrow from further out than the rings
    });
    for (const c of this.compassLabels) {
      c.label.sprite.position.set(...toRoom(p, c.local));
      c.label.sprite.visible = this.zoom >= c.minZoom;
    }
  }

  /** Moves the ORBIT zoom at once. The laptop camera keeps whatever the user turned it by. */
  private setZoom(z: number): void {
    z = Math.max(0, Math.min(1, z));
    if (z === this.zoom) {
      return;
    }
    const a = orbitCamera(this.zoom);
    const b = orbitCamera(z);
    const c = this.cam.orbit;
    c.az += b.az - a.az;
    c.pol = Math.max(0.05, Math.min(1.5, c.pol + b.pol - a.pol));
    this.zoom = z;
    this.placeOrbit();
    if (z < 0.5 !== this.orbitFar) {
      this.orbitFar = z < 0.5;
      this.applyQuality(); // the cap needs less detail from far away
    }
  }

  /** Runs the ORBIT zoom to 0 (the whole Moon) or 1 (the south pole). */
  private zoomTo(z: number, seconds = 2.6): void {
    if (this.mode !== 'orbit') {
      return;
    }
    this.zoomTarget = z;
    this.zoomSeconds = seconds;
    this.pendingDest = z < 1 ? null : this.pendingDest;
    this.dirtyHud = true;
  }

  private updateZoom(delta: number): void {
    if (this.mode !== 'orbit' || this.zoom === this.zoomTarget) {
      return;
    }
    this.setZoom(stepZoom(this.zoom, this.zoomTarget, delta, this.zoomSeconds));
    if (this.zoom !== 1) {
      return;
    }
    const d = this.pendingDest;
    if (d) {
      this.pendingDest = null;
      this.flyTo(d);
    } else if (this.descending) {
      this.arriveAtPole();
    }
  }

  private arriveAtPole(): void {
    this.descending = false;
    this.emit('pole-arrived');
    this.recommendAt = this.journey.fired('site-recommended') ? null : this.clock + RECOMMEND_AFTER_S;
  }

  /** Fades to black, does `mid`, fades back: every change of scene goes through it. */
  private fadeThrough(mid: () => void | Promise<void>): void {
    if (this.fading) {
      void mid();
      return;
    }
    this.fading = { dir: 1, mid };
    this.fade.visible = true;
  }

  private updateFade(delta: number): void {
    const f = this.fading;
    if (!f) {
      return;
    }
    const m = this.fade.material as MeshBasicMaterial;
    this.fade.position.copy(this.camPos);
    m.opacity = Math.max(0, Math.min(1, m.opacity + (f.dir * delta) / 0.28));
    if (f.dir === 1 && m.opacity >= 1) {
      f.dir = 0; // black: change the scene, then come back
      const mid = f.mid;
      f.mid = null;
      void Promise.resolve(mid?.())
        .catch((e: unknown) => console.error(e))
        .finally(() => {
          f.dir = -1;
        });
    } else if (f.dir === -1 && m.opacity <= 0) {
      this.fading = null;
      this.fade.visible = false;
    }
  }

  /** The safe landing colours: rag.ts classGrid on the published layers for all ten parameters, painted once. */
  private async classifyPole(): Promise<void> {
    const m = this.poleScore;
    const limits = this.poleSuit?.limits;
    if (!m || !limits || m.ready) {
      return;
    }
    const layers = await loadPoleLayers(this.pole.grid.size);
    if (!layers) {
      return;
    }
    classGrid(layers, limits, this.selection, m.codes, new Uint8Array(m.codes.length));
    paintClasses(m.codes, paintStyle(false, 1, 1), m.rgba);
    m.tex.needsUpdate = m.codeTex.needsUpdate = true;
    this.renderer.initTexture(m.tex);
    this.renderer.initTexture(m.codeTex);
    m.ready = true;
    this.applyOverlay();
    this.dirtyHud = true;
  }

  private applyOverlay(): void {
    const p = this.colours && this.poleScore?.ready ? this.poleScore : null;
    setOverlay(this.poleMat, p?.tex ?? null, p?.codeTex ?? null);
  }

  private enterOrbit(): void {
    this.mode = 'orbit';
    this.siteId = null;
    this.place = null;
    this.spot = null;
    this.status = null;
    this.flight = null;
    this.pendingDest = null;
    this.playing = false;
    this.zoomTarget = this.zoom;
    this.placeOrbit();
    this.rocket.visible = false;
    this.orbitRoot.visible = this.orbitMarkers.visible = this.sky.visible = true;
    this.siteRoot.visible = false;
    this.hoverRing.visible = false;
    this.applyOverlay();
    this.applyQuality();
    this.dirtySun = this.dirtyHud = true;
    this.syncUrl();
  }

  private siteDest(id: string): Dest | null {
    const site = this.sites.find((s) => s.id === id && s.terrain === 'dem');
    return site ? { site } : null;
  }

  /** A point is shown on the 120 m tile of the nearest site that contains it, else on a tile cut from the pole grid. */
  private pointDest(lat: number, lon: number, name: string, id: string): Dest {
    const [px, py] = stereoXY(lat, lon);
    let best: { site: Site; d: number } | null = null;
    for (const s of this.sites) {
      if (s.terrain !== 'dem') {
        continue;
      }
      const [sx, sy] = stereoXY(s.lat, s.lon);
      const d = Math.max(Math.abs(sx - px), Math.abs(sy - py));
      if (d < TILE_REACH_M && (!best || d < best.d)) {
        best = { site: s, d };
      }
    }
    const spot: [number, number] = [lat, lon];
    if (best) {
      return { site: best.site, spot };
    }
    const site: Site = { id, name, group: 'artemis', lat, lon, terrain: 'dem', note: '' };
    return { site, centre: [px, py], spot };
  }

  private flyTo(dest: Dest): void {
    if (this.mode !== 'orbit') {
      return;
    }
    void this.tile(dest).catch(() => undefined); // start the download during the descent and the flight
    this.recommendAt = null;
    if (this.zoom < 1) {
      // From further out: first down to the pole, then the flight.
      this.pendingDest = dest;
      this.zoomTarget = 1;
      this.zoomSeconds = 2.2;
      this.dirtyHud = true;
      return;
    }
    this.mode = 'flight';
    this.siteId = dest.site.id;
    this.place = dest.site;
    const from = new Vector3(...POLE_POS).add(this.v2.set(0.9, 0.75, 0.5));
    const [lat, lon] = dest.spot ?? [dest.site.lat, dest.site.lon];
    const local = this.poleLocal(lat, lon);
    this.flight = { t: 0, from, to: new Vector3(...toRoom(this.pose, local)), local, dest };
    this.rocket.visible = true;
    this.emit('flight', { latDeg: lat });
  }

  private updateFlight(delta: number): void {
    const f = this.flight;
    if (!f) {
      return;
    }
    f.t = Math.min(1, f.t + delta / 2.4);
    const e = smooth(f.t);
    this.placeOrbit(); // the view closes in on the site while the rocket flies
    f.to.set(...toRoom(this.pose, f.local));
    const mid = this.v1.copy(f.from).lerp(f.to, 0.5);
    mid.y += 0.55;
    const at = (u: number, out: Vector3) =>
      out
        .copy(f.from)
        .multiplyScalar((1 - u) * (1 - u))
        .addScaledVector(mid, 2 * u * (1 - u))
        .addScaledVector(f.to, u * u);
    at(e, this.rocket.position);
    const ahead = at(Math.min(1, e + 0.02), this.v2);
    const dir = ahead.sub(this.rocket.position);
    if (dir.lengthSq() > 1e-10) {
      this.rocket.quaternion.setFromUnitVectors(this.v3.set(0, 1, 0), dir.normalize());
    }
    this.rocket.scale.setScalar(0.1 * (1 - 0.6 * e));
    if (f.t >= 1 && !this.fading) {
      this.fadeThrough(async () => {
        this.flight = null;
        this.rocket.visible = false;
        try {
          await this.enterSurface(f.dest);
        } catch (e) {
          this.message = `Could not load the terrain of ${f.dest.site.name}`;
          this.enterOrbit();
          console.error(e);
        }
      });
    }
  }

  // ------------------------------------------------------------------------------------------------ on the surface

  private tile(dest: Dest): Promise<SiteTile> {
    const id = dest.site.id;
    let p = this.tiles.get(id);
    if (!p) {
      p = dest.centre ? Promise.resolve(tileFromPole(id, this.pole, this.poleSuit, dest.centre[0], dest.centre[1])) : loadSiteTile(id);
      this.tiles.set(id, p);
      p.catch(() => this.tiles.delete(id));
    }
    return p;
  }

  /** Lands at a place: builds its terrain (during the black of a fade), stands the visitor on it. */
  private async enterSurface(dest: Dest): Promise<void> {
    const site = dest.site;
    this.siteId = site.id;
    this.place = site;
    if (this.scene3?.site.id !== site.id) {
      this.message = `Loading the terrain around ${site.name}`;
      this.dirtyHud = true;
      await this.ground.prepare(this.renderer);
      const tile = await this.tile(dest);
      this.disposeSite();
      this.scene3 = this.buildSite(site, tile);
      this.message = null;
    }
    const s = this.scene3!;
    const g = s.tile.grid;
    let row = (g.yMaxM - s.tile.site.y_m) / g.pixelM - 0.5;
    let col = (s.tile.site.x_m - g.xMinM) / g.pixelM - 0.5;
    if (dest.spot) {
      const [x, y] = stereoXY(dest.spot[0], dest.spot[1]);
      row = (g.yMaxM - y) / g.pixelM - 0.5;
      col = (x - g.xMinM) / g.pixelM - 0.5;
    }
    this.orbitRoot.visible = this.orbitMarkers.visible = false;
    this.siteRoot.visible = this.sky.visible = true;
    this.mode = 'stand';
    this.playing = false;
    this.hadSunrise = false;
    // The lander stands 15 m from where the visitor lands, and stays there.
    const at = groundAt(s.field, row, col).pos;
    this.lander.group.position.set(at[0] + 9, at[1], at[2] - 12);
    this.setSpot(row, col);
    if (this.autoTime) {
      // No time was asked for: open at the next time the whole Sun is up at this point (computeSeries on its skyline).
      const up = nextSunUp(this.eph, this.spot!.hz, this.nowIdx);
      if (up != null) {
        this.startIdx = this.clampStart(up);
        this.tH = up - this.startIdx;
        this.refreshSeries();
      }
    }
    this.updateSun();
    // Start facing the Sun's azimuth.
    const d = this.sunScene;
    this.cam.stand.yaw = Math.atan2(-d[0], -d[2]);
    this.cam.stand.pitch = 0.06;
    this.standLift = this.camera.position.y - EYE_M;
    this.applyQuality();
    try {
      await this.renderer.compileAsync(this.siteRoot, this.camera);
    } catch {
      // compiled when first drawn
    }
    this.emit('landed');
    this.dirtySun = this.dirtyHud = true;
    this.syncUrl();
  }

  private buildSite(site: Site, tile: SiteTile): SiteScene {
    const g = tile.grid;
    const half = (g.size * g.pixelM) / 2;
    const frame = gridFrame(g.xMinM + half, g.yMaxM - half);
    const field = buildField(g, frame);
    const farField = buildField(tile.far, frame);
    const upTex = upTexture(field, this.floatLinear);
    const farUpTex = upTexture(farField, this.floatLinear);
    const res = this.detail().shadowRes;
    const shadow = new ShadowPass(field, upTex, farField, farUpTex, res);
    const farShadow = new ShadowPass(farField, farUpTex, undefined, undefined, res);
    // Seen from 2 m, the ground reads its normal from the field's slopes and adds the illustrative detail.
    const slopeTex = slopeTexture(field);
    const farSlopeTex = slopeTexture(farField);
    const mat = terrainMaterial({ field, upTex, shadowTex: shadow.texture, detail: this.detailOf(slopeTex) });
    const patchMat = terrainMaterial({ field, upTex, shadowTex: shadow.texture, detail: this.detailOf(slopeTex), depthBias: 0.9995 });
    // The far mesh is not drawn where the 120 m tile covers it (minus a margin so the two overlap).
    const k = half / (tile.far.size * tile.far.pixelM) - 1.5 / tile.far.size;
    const farMat = terrainMaterial({ field: farField, upTex: farUpTex, shadowTex: farShadow.texture, hole: [0.5 - k, 0.5 - k, 0.5 + k, 0.5 + k], detail: this.detailOf(farSlopeTex) });
    const step = this.detail().meshStep;
    const geos: Record<number, BufferGeometry> = { [step]: fieldGeometry(field, step) };
    const farGeos: Record<number, BufferGeometry> = { [step * 2]: fieldGeometry(farField, step * 2) };
    const mesh = new Mesh(geos[step], mat);
    const farMesh = new Mesh(farGeos[step * 2], farMat);
    mesh.frustumCulled = farMesh.frustumCulled = false;
    const group = new Group();
    group.add(farMesh, mesh);
    this.siteRoot.add(group);
    this.ground.setPatchMaterial(patchMat);
    return { site, tile, frame, field, farField, shadow, farShadow, mat, farMat, patchMat, mesh, farMesh, geos, farGeos, group, textures: [upTex, farUpTex, slopeTex, farSlopeTex] };
  }

  private disposeSite(): void {
    const s = this.scene3;
    if (!s) {
      return;
    }
    this.siteRoot.remove(s.group);
    s.shadow.dispose();
    s.farShadow.dispose();
    this.ground.clear();
    s.mat.dispose();
    s.farMat.dispose();
    s.patchMat.dispose();
    for (const geo of [...Object.values(s.geos), ...Object.values(s.farGeos)]) {
      geo.dispose();
    }
    for (const t of s.textures) {
      t.dispose();
    }
    this.scene3 = null;
  }

  /** Stands the visitor at fractional pixel (row, col) of the site tile and computes the Sun and Earth there. */
  private setSpot(row: number, col: number): void {
    const s = this.scene3!;
    const n = s.tile.grid.size;
    row = Math.max(1, Math.min(n - 2, row));
    col = Math.max(1, Math.min(n - 2, col));
    const hit = groundAt(s.field, row, col);
    const hz = demHorizon(s.tile.grid, [this.pole.grid, s.tile.far], hit.lat, hit.lon, { observerHM: EYE_M, siteId: s.site.id });
    const series = computeSeries(this.eph, hz, this.startIdx, this.startIdx + WINDOW_H + 2);
    const metrics = computeMetrics(sliceSeries(series, 0, WINDOW_H));
    this.spot = { hit, pos: new Vector3(hit.pos[0], hit.pos[1], hit.pos[2]), hz, series, metrics };
    this.placeGround();
    this.status = null;
    this.dirtySun = this.dirtyHud = true;
  }

  /**
   * Lays the patch of detailed ground and the rocks round the visitor, stands the visitor and the lander on the
   * drawn ground, and opens the plain mesh where the patch is.
   */
  private placeGround(): void {
    const s = this.scene3;
    const sp = this.spot;
    if (!s || !sp) {
      return;
    }
    const q = this.detail();
    this.ground.setMaxRocks(q.meshStep <= 2 ? 256 : q.meshStep <= 4 ? 150 : 80);
    const l = this.lander.group.position;
    const [cx, cz] = this.ground.place(s.field, q.meshStep, sp.pos.x, sp.pos.z, { x: l.x, z: l.z, w: 3.2, h: 4.2 });
    s.mat.uniforms.nearHole.value.set(cx, cz, PATCH_HOLE_M);
    const y = this.ground.groundY(sp.pos.x, sp.pos.z);
    if (!Number.isNaN(y)) {
      sp.pos.y = y;
    }
    const ly = this.ground.groundY(l.x, l.z);
    if (!Number.isNaN(ly)) {
      l.y = ly;
    }
    this.dirtySun = true;
  }

  /** Recompute the standing point's 30-day series after the window start moved. */
  private refreshSeries(): void {
    const sp = this.spot;
    if (sp) {
      sp.series = computeSeries(this.eph, sp.hz, this.startIdx, this.startIdx + WINDOW_H + 2);
      sp.metrics = computeMetrics(sliceSeries(sp.series, 0, WINDOW_H));
      this.dirtySun = this.dirtyHud = true;
    }
  }

  /** Moves the visitor to a point of the ground they pointed at, through a short fade (no sliding, no turning). */
  private teleport(hit: GroundHit): void {
    const from = this.spot;
    if (!from || this.fading) {
      return;
    }
    this.fadeThrough(() => {
      const movedM = Math.hypot(hit.pos[0] - from.pos.x, hit.pos[1] - from.pos.y, hit.pos[2] - from.pos.z);
      this.setSpot(hit.row, hit.col);
      this.hoverRing.visible = false;
      this.updateSun();
      this.emit('teleport', { movedM });
      this.syncUrl();
    });
  }

  private setTime(h: number): void {
    this.tH = Math.max(0, Math.min(WINDOW_H, h));
    this.playing = false;
    this.dirtyHud = true;
  }

  private syncUrl(): void {
    const p = new URLSearchParams(location.search);
    p.delete('site');
    p.delete('lat');
    p.delete('lon');
    p.delete('stage');
    const sp = this.spot;
    if (this.siteId && this.siteId !== POINT_ID) {
      p.set('site', this.siteId);
    }
    if (this.siteId && sp) {
      p.set('lat', sp.hit.lat.toFixed(5));
      p.set('lon', sp.hit.lon.toFixed(5));
    }
    p.set('t', new Date(this.eph.startMs + this.startIdx * this.eph.stepS * 1000).toISOString().slice(0, 13) + ':00Z');
    history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
  }

  // ------------------------------------------------------------------------------------------------ Sun, Earth, shadows

  private updateSun(): void {
    const eph = this.eph;
    const idx = this.idx;
    const semi = eph.sunSemiDiam[Math.min(eph.n - 1, Math.floor(idx))];
    const sunMoon = sunDirAt(eph, idx);
    if (this.mode === 'orbit' || this.mode === 'flight') {
      const d = (this.sunScene = dirToScene(this.poleFrame, sunMoon));
      this.poleShadow.render(this.renderer, d, semi);
      this.poleMat.uniforms.sunDir.value.set(d[0], d[1], d[2]);
      this.globeMat.uniforms.sunDir.value.set(d[0], d[1], d[2]);
      // The ring round the cap is 2 km per pixel and its shadows move slowly: one update in four while time runs.
      if (this.midShadow && (!this.playing || this.midTick++ % 4 === 0)) {
        this.midShadow.render(this.renderer, d, semi);
      }
      this.midMat?.uniforms.sunDir.value.set(d[0], d[1], d[2]);
      this.light.intensity = 2.5;
      this.status = null;
      return;
    }
    const s = this.scene3;
    const spot = this.spot;
    if (!s || !spot) {
      return;
    }
    const d = (this.sunScene = dirToScene(s.frame, sunMoon));
    // While time runs, the hills' shadows and the small detail's shadows take turns, so no frame pays for both.
    const turn = this.playing ? this.groundTick++ % 2 : -1;
    if (turn !== 1) {
      s.shadow.render(this.renderer, d, semi);
      s.farShadow.render(this.renderer, d, semi);
    }
    s.mat.uniforms.sunDir.value.set(d[0], d[1], d[2]);
    s.patchMat.uniforms.sunDir.value.set(d[0], d[1], d[2]);
    s.farMat.uniforms.sunDir.value.set(d[0], d[1], d[2]);
    // Sun and Earth at the standing point, from computeSeries, interpolated between the hourly samples.
    const i0 = Math.min(WINDOW_H, Math.floor(this.tH));
    const t = this.tH - i0;
    const q = spot.series;
    const now = { sunUp: lerp(q.sunMargin[i0], q.sunMargin[i0 + 1], t) > 0, earthUp: lerp(q.earthMargin[i0], q.earthMargin[i0 + 1], t) > 0 };
    const before = this.status;
    this.status = now;
    if (before && this.playing) {
      const moment = skyMoment(before, now, this.hadSunrise);
      if (moment) {
        this.hadSunrise ||= now.sunUp && !before.sunUp;
        this.emit(moment);
      }
    }
    if (!before || before.sunUp !== now.sunUp || before.earthUp !== now.earthUp) {
      this.dirtyHud = true;
    }
    const sunFrac = lerp(q.sunFrac[i0], q.sunFrac[i0 + 1], t);
    this.light.position.set(d[0], d[1], d[2]);
    this.light.intensity = 2.5 * sunFrac;
    if (turn !== 0) {
      this.ground.renderSun(this.renderer, d, semi, sunFrac);
    }
  }

  /** The rotation from the celestial frame (ICRF) to the scene of `frame` at the time shown, into this.m4. */
  private skyRotation(frame: Frame): boolean {
    const sd = this.starData;
    if (!sd) {
      return false;
    }
    const x = Math.max(0, Math.min(sd.nRot - 1.001, ((this.eph.startMs - sd.startMs) / 1000 + this.idx * this.eph.stepS) / sd.stepS));
    const i = Math.floor(x);
    this.q1.fromArray(sd.quat, 4 * i);
    this.q2.fromArray(sd.quat, 4 * i + 4);
    this.q1.slerp(this.q2, x - i);
    const { gx, gy, up } = frame;
    // ICRF -> MOON_ME (the Moon's orientation at this time) -> the scene frame.
    this.m4.set(gx[0], gx[1], gx[2], 0, up[0], up[1], up[2], 0, -gy[0], -gy[1], -gy[2], 0, 0, 0, 0, 1);
    this.m4.multiply(this.m4b.makeRotationFromQuaternion(this.q1));
    return true;
  }

  /** Real stars, and the Earth turned the way it really faces at this time (journey.ts earthRotationAngle). */
  private placeStars(frame: Frame, tilted: boolean): void {
    if (!this.skyRotation(frame)) {
      return;
    }
    const stars = this.stars!;
    stars.quaternion.setFromRotationMatrix(this.m4);
    stars.position.copy(this.camPos);
    (stars.material as ShaderMaterial).uniforms.px.value = this.renderer.getPixelRatio();
    const utcMs = this.eph.startMs + this.idx * this.eph.stepS * 1000;
    this.m4.multiply(this.m4b.makeRotationZ(earthRotationAngle(utcMs))).multiply(EARTH_AXES);
    this.earth.quaternion.setFromRotationMatrix(this.m4);
    if (tilted) {
      // In ORBIT the Moon is tipped by the zoom, and the sky turns with it.
      stars.quaternion.premultiply(this.poseQ);
      this.earth.quaternion.premultiply(this.poseQ);
    }
  }

  /** The Sun, the Earth and their labels, placed every frame. */
  private placeSky(): void {
    const eph = this.eph;
    const idx = this.idx;
    const cam = this.camPos;
    const semiSun = eph.sunSemiDiam[Math.min(eph.n - 1, Math.floor(idx))];
    const earthKm = earthKmAt(eph, idx);
    const orbit = this.mode === 'orbit' || this.mode === 'flight';
    const sunRoom = orbit ? rotX(this.sunScene, this.pose.tilt) : this.sunScene;
    (this.earth.material as ShaderMaterial).uniforms.sunDir.value.set(sunRoom[0], sunRoom[1], sunRoom[2]);
    this.placeStars(orbit || !this.scene3 ? this.poleFrame : this.scene3.frame, orbit);
    if (orbit) {
      this.light.position.set(sunRoom[0], sunRoom[1], sunRoom[2]);
      // The real directions of the Sun and the Earth from the Moon; sizes and distances are not to scale.
      const e = smooth(this.zoom);
      const centre = this.v1.set(...this.pose.room);
      const dist = Math.hypot(earthKm[0], earthKm[1], earthKm[2]);
      const ed = rotX(dirToScene(this.poleFrame, [earthKm[0] / dist, earthKm[1] / dist, earthKm[2] / dist]), this.pose.tilt);
      this.earth.position.copy(centre).addScaledVector(this.v2.set(ed[0], ed[1], ed[2]), lerp(EARTH_NEAR.dist[0], EARTH_NEAR.dist[1], e));
      this.earth.scale.setScalar(lerp(EARTH_NEAR.radius[0], EARTH_NEAR.radius[1], e));
      this.sun.position.copy(centre).addScaledVector(this.v2.set(sunRoom[0], sunRoom[1], sunRoom[2]), lerp(SUN_NEAR.dist[0], SUN_NEAR.dist[1], e));
      this.sun.scale.setScalar(lerp(SUN_NEAR.radius[0], SUN_NEAR.radius[1], e));
      this.sun.lookAt(cam);
      this.placeSkyLabels();
      return;
    }
    const s = this.scene3;
    const spot = this.spot;
    if (!s || !spot) {
      return;
    }
    const i0 = Math.min(WINDOW_H, Math.floor(this.tH));
    const t = this.tH - i0;
    const q = spot.series;
    const { lat, lon } = spot.hit;
    const sd = azElToScene(s.frame, lat, lon, lerpAz(q.sunAz[i0], q.sunAz[i0 + 1], t), lerp(q.sunEl[i0], q.sunEl[i0 + 1], t));
    const ed = azElToScene(s.frame, lat, lon, lerpAz(q.earthAz[i0], q.earthAz[i0 + 1], t), lerp(q.earthEl[i0], q.earthEl[i0 + 1], t));
    // At their real angular sizes: the Sun from its semi-diameter, the Earth from its real distance to this point.
    this.sun.position.copy(cam).addScaledVector(this.v2.set(sd[0], sd[1], sd[2]), SKY_D);
    this.sun.scale.setScalar(SKY_D * Math.tan(semiSun * D2R));
    this.sun.lookAt(cam);
    const up = unitOf(lat, lon);
    const rKm = (R_M + spot.hit.heightM) / 1000;
    const eDist = Math.hypot(earthKm[0] - up[0] * rKm, earthKm[1] - up[1] * rKm, earthKm[2] - up[2] * rKm);
    this.earth.position.copy(cam).addScaledVector(this.v2.set(ed[0], ed[1], ed[2]), SKY_D);
    this.earth.scale.setScalar(SKY_D * Math.tan(Math.asin(EARTH_R_KM / eDist)));
    this.placeSkyLabels();
    this.lander.panel.rotation.y = Math.atan2(sd[0], sd[2]);
    this.lander.dish.rotation.set(0, 0, 0);
    this.lander.dish.rotation.y = Math.atan2(ed[0], ed[2]);
    this.lander.dish.rotateX(-Math.asin(Math.max(-1, Math.min(1, ed[1]))));
  }

  /** "Sun" and "Earth", just above their discs. */
  private placeSkyLabels(): void {
    this.sunLabel.sprite.position.copy(this.sun.position).y += this.sun.scale.x * 1.25;
    this.earthLabel.sprite.position.copy(this.earth.position).y += this.earth.scale.x * 1.15;
  }

  // ------------------------------------------------------------------------------------------------ the buttons

  /** A button of the stage panel (journey.ts stageView), from the laptop panel or the headset's. */
  private press(id: string): void {
    const [kind, arg] = id.split(':');
    if (kind === 'vr') {
      this.world.launchXR();
      return;
    }
    if (this.mode === 'loading') {
      return;
    }
    this.pressed.add(kind);
    this.dirtyHud = true;
    if (kind === 'help') {
      this.help = !this.help;
    } else if (kind === 'close') {
      this.help = false;
    } else if (kind === 'stats') {
      this.showStats = !this.showStats;
    } else if (kind === 'exit') {
      this.world.exitXR();
    } else if (kind === 'moon') {
      if (this.mode === 'orbit' && this.zoomTarget !== 0) {
        this.recommendAt = null;
        this.descending = false;
        this.zoomTo(0);
        this.emit('back-to-moon');
      }
    } else if (kind === 'pole') {
      if (this.mode === 'stand') {
        this.fadeThrough(() => {
          this.zoom = this.zoomTarget = 1;
          this.orbitFar = false;
          this.cam.orbit = { ...orbitCamera(1), dist: 1 };
          this.enterOrbit();
          this.emit('back-to-pole');
        });
      } else if (this.mode === 'orbit' && this.zoomTarget !== 1) {
        this.playing = false;
        this.descending = true;
        this.zoomTo(1);
        this.emit('fly-to-pole');
      }
    } else if (kind === 'start' || kind === 'play') {
      this.togglePlay();
    } else if (kind === 'faster') {
      this.faster = !this.faster;
    } else if (kind === 'colours') {
      this.colours = !this.colours;
      this.applyOverlay();
      this.emit(this.colours ? 'colours-on' : 'colours-off');
    } else if (kind === 'site') {
      const d = this.siteDest(arg);
      if (d) {
        this.flyTo(d);
      }
    }
  }

  private togglePlay(): void {
    const stage = this.stage();
    if (stage !== 'moon' && stage !== 'surface') {
      return;
    }
    this.playing = !this.playing;
    this.emit(stage === 'moon' ? (this.playing ? 'start-motion' : 'pause-motion') : this.playing ? 'play' : 'pause');
  }

  // ------------------------------------------------------------------------------------------------ input: laptop

  private bindDesktopInput(): void {
    const el = this.renderer.domElement;
    const on = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanupFuncs.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(el, 'pointerdown', (e: PointerEvent) => {
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    });
    on(el, 'pointermove', (e: PointerEvent) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = true;
      const d = this.drag;
      if (!d) {
        return;
      }
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (this.mode === 'orbit' || this.mode === 'flight') {
        const c = this.cam.orbit;
        c.az -= dx * 0.005;
        c.pol = Math.max(0.05, Math.min(1.5, c.pol - dy * 0.005));
      } else if (this.mode === 'stand') {
        const c = this.cam.stand;
        const k = (0.0022 * c.fov) / 60;
        c.yaw += dx * k;
        c.pitch = Math.max(-1.2, Math.min(1.4, c.pitch + dy * k));
      }
    });
    on(el, 'pointerup', (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (d && d.moved < 6 && !this.inXR) {
        this.screenRay(e.clientX, e.clientY, this.v1, this.v2);
        this.activate(this.v1, this.v2);
      }
    });
    on(el, 'pointerleave', () => {
      this.pointer.inside = false;
    });
    on(
      el,
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        const f = Math.exp(e.deltaY * 0.0012);
        if (this.mode === 'orbit') {
          // One wheel: from close to the pole, out to the pole view, out to the whole Moon, then further away.
          const c = this.cam.orbit;
          const dz = -Math.log(f) * 0.6;
          if (f > 1 ? c.dist < 1 : c.dist > 1) {
            c.dist = f > 1 ? Math.min(1, c.dist * f) : Math.max(1, c.dist * f);
          } else if (f > 1 ? this.zoom > 0 : this.zoom < 1) {
            this.pendingDest = null;
            this.recommendAt = null;
            this.setZoom(this.zoom + dz);
            this.zoomTarget = this.zoom;
            this.dirtyHud = true;
          } else {
            c.dist = Math.max(0.2, Math.min(4, c.dist * f));
          }
        } else if (this.mode === 'stand') {
          this.cam.stand.fov = Math.max(4, Math.min(75, this.cam.stand.fov * f));
        }
      },
      { passive: false },
    );
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (this.mode === 'loading' || (e.target as HTMLElement).tagName === 'BUTTON') {
        return;
      }
      if (e.code === 'Space') {
        this.press(this.mode === 'stand' ? 'play' : 'start');
        e.preventDefault();
      } else if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && this.stage() !== 'pole') {
        this.setTime(this.tH + (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 24 : 1));
      } else if (e.code === 'Escape') {
        this.press(this.help ? 'close' : this.mode === 'stand' ? 'pole' : 'moon');
      }
    });
  }

  /** A ray from the laptop camera through a screen point, in world coordinates. */
  private screenRay(x: number, y: number, o: Vector3, d: Vector3): void {
    const el = this.renderer.domElement.getBoundingClientRect();
    o.copy(this.camPos);
    d.set(((x - el.left) / el.width) * 2 - 1, -((y - el.top) / el.height) * 2 + 1, 0.5)
      .unproject(this.camera)
      .sub(o)
      .normalize();
  }

  /** What a click, trigger press or pinch does with a world-space ray, outside the panel. */
  private activate(o: Vector3, d: Vector3): void {
    if (this.mode === 'orbit') {
      const m = this.pickMarker(o, d);
      if (m) {
        this.press(`site:${m.id}`);
      }
    } else if (this.mode === 'stand') {
      const hit = this.pickGround(o, d);
      if (hit) {
        this.teleport(hit);
      }
    }
  }

  /** The marker under a ray: its hit area is 2.2 times its radius, so it is easy to point at. */
  private pickMarker(o: Vector3, d: Vector3): Marker | null {
    let best: Marker | null = null;
    let bestT = Infinity;
    for (const m of this.markers) {
      if (!m.obj.visible) {
        continue;
      }
      const oc = this.v3.copy(m.pos).sub(o);
      const t = oc.dot(d);
      const miss = Math.sqrt(Math.max(0, oc.lengthSq() - t * t));
      if (t > 0 && miss < m.obj.scale.x * 2.2 && t < bestT) {
        best = m;
        bestT = t;
      }
    }
    return best;
  }

  /** Where a world-space ray meets the drawn ground (the mesh and what the patch adds), within the site's tile. */
  private pickGround(o: Vector3, d: Vector3): GroundHit | null {
    const s = this.scene3;
    if (!s || d.y > 0.2) {
      return null;
    }
    const off = this.siteRoot.position;
    const [ox, oy, oz] = [o.x - off.x, o.y - off.y, o.z - off.z];
    const above = (t: number) => oy + d.y * t - this.ground.groundY(ox + d.x * t, oz + d.z * t);
    // Steps grow with distance: 10 cm at the feet, 2 % of the distance further out, to 60 km.
    let prev = 0;
    for (let t = 0.1; t < 60000; t += Math.max(0.1, t * 0.02)) {
      const a = above(t);
      if (Number.isNaN(a)) {
        return null; // left the tile
      }
      if (a < 0) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 14; k++) {
          const mid = 0.5 * (lo + hi);
          if (above(mid) > 0) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        const rc = meshRowCol(s.field, ox + d.x * hi, oz + d.z * hi);
        const n = s.tile.grid.size;
        return rc && rc[0] >= 1 && rc[1] >= 1 && rc[0] <= n - 2 && rc[1] <= n - 2 ? groundAt(s.field, rc[0], rc[1]) : null;
      }
      prev = t;
    }
    return null;
  }

  private updateHover(o: Vector3, d: Vector3): void {
    if (this.mode === 'orbit') {
      const m = this.pickMarker(o, d);
      if (m !== this.hovered) {
        this.hovered = m;
        if (m?.id === RECOMMENDED_SITE && !this.journey.fired('site-recommended')) {
          this.recommendAt = null;
          this.emit('site-recommended');
        }
      }
      this.renderer.domElement.style.cursor = m ? 'pointer' : '';
    } else if (this.mode === 'stand') {
      // The ground marker: where a trigger pull, a pinch or a click would move you.
      const hit = this.fading ? null : this.pickGround(o, d);
      this.hoverRing.visible = hit != null;
      if (hit) {
        const dist = Math.hypot(hit.pos[0] - this.spot!.pos.x, hit.pos[2] - this.spot!.pos.z);
        this.hoverRing.position.set(hit.pos[0], this.ground.groundY(hit.pos[0], hit.pos[2]) + 0.05 + dist * 0.002, hit.pos[2]);
        this.hoverRing.scale.setScalar(Math.max(0.45, dist * 0.02));
      }
      this.renderer.domElement.style.cursor = hit ? 'pointer' : '';
    }
  }

  // ------------------------------------------------------------------------------------------------ input: VR

  private hookSession(): void {
    const session = this.world.session ?? null;
    if (session === this.hookedSession) {
      return;
    }
    this.hookedSession = session;
    if (!session) {
      return;
    }
    // A trigger pull and a hand pinch both arrive as "select".
    session.addEventListener('selectstart', (e) => {
      const h = e.inputSource.handedness;
      if (h === 'left' || h === 'right') {
        this.select[h].pressed = true;
        this.activeHand = h;
      }
    });
  }

  private handRay(hand: Hand, o: Vector3, d: Vector3): void {
    const space = this.player.raySpaces[hand];
    space.getWorldPosition(o);
    space.getWorldDirection(d).negate();
  }

  private updateXRInput(): void {
    this.hookSession();
    let hoverButton: string | null = null;
    for (const hand of ['left', 'right'] as Hand[]) {
      const sel = this.select[hand];
      const o = this.v1;
      const d = this.v2;
      this.handRay(hand, o, d);
      const hit = this.panel.hit(o, d);
      const ray = this.rays[hand]!;
      ray.visible = true;
      ray.scale.z = hit ? hit.point.distanceTo(o) : 4;
      if (hit && hand === this.activeHand) {
        hoverButton = hit.button;
      }
      if (sel.pressed) {
        sel.pressed = false;
        if (hit?.button) {
          this.press(hit.button);
        } else if (!hit) {
          this.activate(o.clone(), d.clone());
        }
      }
      if (!hit && hand === this.activeHand) {
        this.updateHover(o.clone(), d.clone());
      } else if (hit && hand === this.activeHand) {
        this.hoverRing.visible = false;
      }
    }
    this.panel.setHover(hoverButton);
  }

  // ------------------------------------------------------------------------------------------------ views

  private updateView(): void {
    const cam = this.camera;
    const xr = this.inXR;
    if (xr !== this.wasXR) {
      this.wasXR = xr;
      this.onXRChange(xr);
    }
    if (this.mode === 'orbit' || this.mode === 'flight') {
      if (!xr) {
        const c = this.cam.orbit;
        const dist = c.dist * lerp(ORBIT_DIST[0], ORBIT_DIST[1], smooth(this.zoom));
        const [tx, ty, tz] = this.pose.room;
        cam.position.set(tx + dist * Math.sin(c.pol) * Math.sin(c.az), ty + dist * Math.cos(c.pol), tz + dist * Math.sin(c.pol) * Math.cos(c.az));
        cam.lookAt(tx, ty, tz);
        this.setFov(50);
      }
    } else if (this.scene3 && this.spot) {
      const p = this.spot.pos;
      if (xr) {
        // The rig stays at the room origin; the Moon is moved under it.
        this.siteRoot.position.set(-p.x, -p.y + this.standLift, -p.z);
      } else {
        const c = this.cam.stand;
        this.siteRoot.position.set(-p.x, -p.y, -p.z);
        cam.position.set(0, EYE_M, 0);
        cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
        this.setFov(c.fov);
      }
    }
    cam.getWorldPosition(this.camPos);
  }

  private setFov(fov: number): void {
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private onXRChange(xr: boolean): void {
    this.panel.mesh.visible = xr;
    for (const ray of Object.values(this.rays)) {
      ray!.visible = xr;
    }
    const zoom = xr ? 1.9 : 1;
    for (const l of [this.sunLabel, this.earthLabel, ...this.markers.map((m) => m.label), ...this.compassLabels.map((c) => c.label)]) {
      l.zoom(zoom);
    }
    this.quality.reset();
    this.applyQuality();
    this.logPanel = xr;
    if (xr) {
      this.world.session?.updateTargetFrameRate?.(72)?.catch?.(() => undefined);
      this.standLift = 0;
    }
    this.dirtySun = this.dirtyHud = true;
  }

  /** Terrain and shadow detail: full on the laptop, the automatic level in the headset (perf.ts). */
  private detail(): { meshStep: number; shadowRes: number; shadowEvery: number; foveation: number } {
    if (this.forcedLevel != null) {
      return LEVELS[this.forcedLevel];
    }
    return this.inXR ? LEVELS[this.quality.level] : { meshStep: 1, shadowRes: 512, shadowEvery: 1, foveation: 0 };
  }

  private applyQuality(): void {
    const q = this.detail();
    // From the whole-Moon view the cap is a few centimetres across: a quarter of the mesh and half the shadow map.
    this.poleMesh.geometry = this.poleGeometry(q.meshStep * 2 * (this.orbitFar ? 4 : 1));
    this.poleShadow.setResolution((q.shadowRes * 2) / (this.orbitFar ? 2 : 1));
    this.globe.geometry = this.globeGeometryFor(this.globeCols());
    if (this.midMesh) {
      this.midMesh.geometry = this.midGeometry(q.meshStep * 4);
      this.midShadow!.setResolution(q.shadowRes * 2);
    }
    const s = this.scene3;
    if (s) {
      s.mesh.geometry = s.geos[q.meshStep] ??= fieldGeometry(s.field, q.meshStep);
      s.farMesh.geometry = s.farGeos[q.meshStep * 2] ??= fieldGeometry(s.farField, q.meshStep * 2);
      s.shadow.setResolution(q.shadowRes);
      s.farShadow.setResolution(q.shadowRes);
      this.placeGround(); // the patch sits on the mesh, whose triangles just changed
    }
    if (this.inXR) {
      this.renderer.xr.setFoveation(q.foveation);
    }
    this.dirtySun = this.dirtyHud = true;
  }

  /** The six markers: a constant apparent size, a soft pulse on the recommended one, labels that do not overlap. */
  private updateMarkers(): void {
    const hot = this.hovered;
    const xr = this.inXR;
    const near = this.zoom >= NEAR_ZOOM && this.mode === 'orbit';
    const rank = (m: Marker) => (m === hot ? 0 : m.id === RECOMMENDED_SITE ? 1 : 2);
    const order = [...this.markers].sort((a, b) => rank(a) - rank(b));
    const boxes: number[] = [];
    const hNdc = (0.024 * (xr ? 1.9 : 1)) / Math.tan((this.camera.fov * D2R) / 2);
    const wNdc = hNdc / this.camera.aspect;
    const pulse = 1 + 0.16 * Math.sin((this.clock * 2 * Math.PI) / 1.6);
    for (const m of order) {
      const flying = this.mode === 'flight' && m.id === this.siteId;
      if (!near && !flying) {
        m.obj.visible = m.label.sprite.visible = false;
        continue;
      }
      const toCam = this.v1.copy(this.camPos).sub(m.pos);
      const dist = toCam.length();
      const facing = toCam.dot(m.normal) > 0;
      m.obj.visible = facing;
      m.obj.scale.setScalar(dist * 0.014 * (m === hot ? 1.3 : m.id === RECOMMENDED_SITE ? pulse : 1));
      let show = facing;
      if (show && !xr) {
        const p = this.v2.copy(m.pos).project(this.camera);
        const half = (wNdc * m.label.aspect()) / 2;
        const x0 = p.x - half;
        const x1 = p.x + half;
        const y0 = p.y;
        const y1 = p.y + hNdc * 1.5;
        for (let i = 0; i < boxes.length; i += 4) {
          if (x0 < boxes[i + 1] && x1 > boxes[i] && y0 < boxes[i + 3] && y1 > boxes[i + 2]) {
            show = false;
            break;
          }
        }
        if (show) {
          boxes.push(x0, x1, y0, y1);
        }
      }
      m.label.sprite.visible = show;
    }
  }

  // ------------------------------------------------------------------------------------------------ the panel

  /** The stage panel, the same for the laptop and the headset (journey.ts stageView). */
  private stageModel(): StageView {
    const date = this.eph ? new Date(this.eph.startMs + this.idx * this.eph.stepS * 1000).toISOString().slice(0, 10) : '';
    return stageView({
      stage: this.stage(),
      message: this.message,
      caption: this.journey.caption,
      playing: this.playing,
      faster: this.faster,
      colours: this.colours,
      coloursReady: this.poleScore?.ready === true,
      siteId: this.siteId,
      siteName: this.placeName(),
      sunUp: this.status?.sunUp ?? null,
      earthUp: this.status?.earthUp ?? null,
      date,
      tH: this.tH,
      legend: { lines: mapLegend(this.selection, this.prio).lines, colors: ragColors(false) },
      pressed: this.pressed,
      help: this.help,
      stats: this.showStats ? this.statsText || 'Measuring the frame rate' : null,
      inXR: this.inXR,
      extraNote: this.mode === 'stand' && this.scene3?.tile.coarse ? COARSE_NOTE : null,
    });
  }

  // ------------------------------------------------------------------------------------------------ frame

  update(delta: number): void {
    this.frameNo++;
    this.clock += delta;
    // Ordinary objects use the near half of the depth range; terrain and sky write the far half (terrain.ts).
    this.renderer.getContext().depthRange(0, 0.5);
    const xr = this.inXR;
    if (this.mode === 'loading') {
      if (this.dirtyHud) {
        this.dirtyHud = false;
        this.hud.render({ view: this.stageModel(), xrOffered: false, inXR: xr });
      }
      return;
    }
    const stage = this.stage();
    if (this.playing && stage !== 'moon' && stage !== 'surface') {
      this.playing = false; // time only runs where there is a button to stop it
      this.dirtyHud = true;
    }
    if (this.playing) {
      this.tH += delta * (stage === 'moon' ? MOON_HOURS_PER_S : SURFACE_HOURS_PER_S * (this.faster ? FASTER : 1));
      if (this.tH >= WINDOW_H) {
        this.tH = 0;
      }
    }
    if (dayOf(this.tH) !== this.lastDay) {
      this.lastDay = dayOf(this.tH);
      this.dirtyHud = true;
    }
    if (this.recommendAt != null && this.clock >= this.recommendAt) {
      this.recommendAt = null;
      if (stage === 'pole') {
        this.emit('site-recommended');
      }
    }
    const before = this.quality.meanMs;
    if (this.quality.sample(delta * 1000, xr)) {
      this.applyQuality();
    }
    if (this.quality.meanMs !== before) {
      const q = this.quality;
      this.statsText = `${q.fps.toFixed(0)} fps, ${q.meanMs.toFixed(1)} ms per frame, longest ${q.worstMs.toFixed(1)} ms. Detail: ${xr ? `${LEVELS[q.level].name} (automatic)` : 'full'}`;
      this.dirtyHud ||= this.showStats;
    }
    if (xr) {
      this.updateXRInput();
    }
    this.updateZoom(delta);
    this.updateFlight(delta);
    this.updateView();
    this.updateFade(delta);
    if (!xr && this.pointer.inside && !this.drag) {
      this.screenRay(this.pointer.x, this.pointer.y, this.v1, this.v2);
      this.updateHover(this.v1.clone(), this.v2.clone());
    }
    // Shadows are recomputed when time moves; in the headset every few frames (perf.ts).
    if (this.dirtySun || (Math.abs(this.idx - this.lastSunIdx) > 0.004 && this.frameNo % this.detail().shadowEvery === 0)) {
      this.dirtySun = false;
      this.lastSunIdx = this.idx;
      this.updateSun();
    }
    this.placeSky();
    if (this.mode === 'orbit' || this.mode === 'flight') {
      this.updateMarkers();
    }
    if (this.dirtyHud) {
      this.dirtyHud = false;
      this.view = this.stageModel();
      this.hud.render({ view: this.view, xrOffered: this.world.xrEnabled !== false && 'xr' in navigator, inXR: xr });
    }
    if (xr && this.view) {
      if ((this.panel.draw(this.view, CREDITS) || this.logPanel) && import.meta.env.DEV) {
        console.info(`[panel] ${JSON.stringify(this.panel.targets())}`); // where the emulator checks aim
      }
      this.logPanel = false;
      this.panel.tick(this.clock);
    }
  }
}
