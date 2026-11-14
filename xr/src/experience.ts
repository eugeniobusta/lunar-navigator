// The experience: ORBIT (south pole relief, sites, zones, past landings) -> LAND (1:1 site tile, heat maps,
// choose the landing point) -> STAND (2 m above that point, real Sun and Earth over the real skyline).
// Every number shown comes from /data/ or from web/src/lib/analysis (demHorizon, computeSeries, computeMetrics).
import {
  AmbientLight,
  DirectionalLight,
  Group,
  InputComponent,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
  VisibilityState,
  createSystem,
  type BufferGeometry,
  type DataTexture,
  type Line,
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
import { demHorizon, heightAt, stereoLatLon, stereoXY } from '../../web/src/lib/analysis/demHorizon';
import type { CriterionRow } from '../../web/src/lib/analysis/explain';
import type { Preset } from '../../web/src/lib/analysis/suitability';
import {
  loadCriteria,
  loadEphemeris,
  LIMIT_NAMES,
  loadMissions,
  loadPoleLayers,
  loadPresets,
  loadSiteLayers,
  loadSiteValues,
  loadSummary,
  resampleBytes,
  tileFromPole,
  loadPoleSuitability,
  loadSiteTile,
  loadSites,
  loadSouthPole,
  loadStars,
  loadZones,
  type Mission,
  type Site,
  type SiteTile,
  type SouthPole,
  type Stars,
  type Suitability,
} from './data.js';
import {
  FALLBACK_PRESETS,
  TOUR_PLAY_H,
  TOUR_PLAY_RATE,
  TOUR_STOPS,
  captionGoldilocks,
  captionPole,
  captionStand,
  captionZone,
  longRunMetrics,
  nextSunUp,
  rankAll,
  rescore,
  why,
  whyFromRow,
  type Summary,
  type Why,
  type ZoneRow,
} from './guide.js';
import { LEVELS, QualityGovernor } from './perf.js';
import {
  R_M,
  azElToScene,
  buildField,
  dirToScene,
  earthKmAt,
  fieldUpAt,
  gridFrame,
  groundAt,
  landingSlopeDeg,
  latLonToScene,
  raycastField,
  sunDirAt,
  unitOf,
  type Field,
  type Frame,
  type GroundHit,
  type V3,
} from './geo.js';
import { CREDITS, Hud, statusText, type Actions, type HudModel, type SpotView, type StatusView } from './hud.js';
import {
  earthBall,
  farLitMaterial,
  groundRing,
  makeLabel,
  makeLander,
  makeRocket,
  makeSightLine,
  makeStars,
  missionMarker,
  polyline,
  siteMarker,
  sunDisc,
  type Label,
} from './objects.js';
import {
  OVERLAYS,
  PALETTE,
  ShadowPass,
  byteTexture,
  fieldGeometry,
  setOverlay,
  supportsFloatLinear,
  terrainMaterial,
  upTexture,
  type OverlayId,
} from './terrain.js';
import { VrPanel, type PanelModel } from './vrpanel.js';

type Mode = 'loading' | 'orbit' | 'flight' | 'land' | 'stand';
type Hand = 'left' | 'right';

const WINDOW_H = 720; // the time scrubber covers 30 days
const POLE_SCALE = 1.6 / 440000; // ORBIT: the 440 km relief is 1.6 m across
const GLOBE_POS = new Vector3(0, 0.9, -1.3); // where the south pole sits in the room, metres
const SKY_D = 250000; // distance at which the Sun and Earth discs are drawn in the 1:1 scenes, metres
const RAISE_M = 2000; // VR raised viewpoint above the landing point, metres
const EYE_M = 2; // observer height, as in every horizon file
const ENLARGE = 5;
const EARTH_R_KM = 6378.137;
const D2R = Math.PI / 180;
const ORBIT_ZONES = 40; // zones ringed on the relief
const LISTED_ZONES = 10; // zones with a marker and a button
const POINT_ID = 'point'; // the place id of a point given by ?lat=&lon= that no site tile covers
const TILE_REACH_M = 29000; // a zone this close to a site's centre (in x and in y) is shown on that site's 120 m tile

/** A circle of [lat, lon] with the zone's area around its best cell. */
function zoneRing(z: ZoneRow): [number, number][] {
  const r = Math.max(250, Math.sqrt((z.areaKm2 * 1e6) / Math.PI));
  const [x, y] = stereoXY(z.lat, z.lon);
  const out: [number, number][] = [];
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * 2 * Math.PI;
    out.push(stereoLatLon(x + r * Math.cos(a), y + r * Math.sin(a)));
  }
  return out;
}

interface Spot {
  hit: GroundHit;
  pos: Vector3;
  slopeDeg: number | null;
  nasaSun: number | null;
  nasaEarth: number | null;
  score: number | null;
  /** Index of the cell in the tile's grids. */
  cell: number;
  /** Hard limits that fail at this cell (docs/criteria.csv). */
  failed: string[];
  why: Why;
  hz: Horizon;
  series: Series;
  metrics: Metrics;
}

interface Marker {
  kind: 'site' | 'mission' | 'zone';
  id: string;
  obj: Object3D;
  label: Label;
  pos: Vector3;
  normal: Vector3;
  title: string;
  info: string;
}

/** Where to go: a site's tile, or a tile cut from the south-pole grid around a zone no site tile covers. */
interface Dest {
  site: Site;
  /** Stereographic centre of a tile to cut from the south-pole grid. */
  centre?: [number, number];
  /** Landing point [lat, lon]; the site's own point if absent. */
  spot?: [number, number];
  zone?: ZoneRow;
}

/** A Goldilocks heat map that can be recoloured under other priorities. */
interface ScoreMap {
  /** The published score bytes (docs/INTERFACES.md section 10). */
  raw: Uint8Array;
  /** What the texture shows: the score where every hard limit passes, 255 elsewhere. */
  shown: Uint8Array;
  /** The score of every cell under the priorities in use. */
  all: Uint8Array;
  tex: DataTexture;
  layers: () => Promise<Uint8Array[] | null>;
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
  mesh: Mesh;
  farMesh: Mesh;
  geos: Record<number, BufferGeometry>;
  farGeos: Record<number, BufferGeometry>;
  overlays: Partial<Record<OverlayId, Texture>>;
  scoreMap: ScoreMap | null;
  zoneGroup: Group;
  group: Group;
  textures: Texture[];
}

const COARSE_NOTE = 'Terrain here is interpolated from the 430 m south-pole map: no 120 m tile and no slope map for this zone yet.';
const VERDICT_COLOR = { good: 'ok', acceptable: 'sun', rejected: 'alert' } as const;
const byteOrNull = (v: number) => (v === 255 ? null : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAz = (a: number, b: number, t: number) => (((a + ((((b - a) % 360) + 540) % 360 - 180) * t) % 360) + 360) % 360;

export class ExperienceSystem extends createSystem({}) {
  // data
  private sites: Site[] = [];
  private eph!: Ephemeris;
  private pole!: SouthPole;
  /** Every zone, best first under the priorities in use. */
  private zones: ZoneRow[] = [];
  private criteria: CriterionRow[] = [];
  private siteValues = new Map<string, Record<string, string>>();
  private presets: Preset[] = FALLBACK_PRESETS;
  private preset: Preset = FALLBACK_PRESETS[0];
  private summary: Summary | null = null;
  private poleLayers: Promise<Uint8Array[] | null> | null = null;
  private poleScore: ScoreMap | null = null;
  private missions: Mission[] = [];
  private poleSuit: Suitability | null = null;
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
  private siteId: string | null = null;
  private place: Site | null = null;
  private startIdx = 0;
  /** The sample index of "now"; with no ?t= in the URL, each site opens at its next sunrise after it. */
  private nowIdx = 0;
  private autoTime = true;
  private tour: { stop: number; caption: string; why: Why | null; playFrom: number | null } | null = null;
  private showStats = false;
  private showWhy = false;
  private quality = new QualityGovernor();
  private statsText = '';
  private zoneObjs: Line[] = [];
  private tH = 0;
  private playing = false;
  private speed = 10;
  private overlayOrbit: OverlayId = 'sun';
  private overlaySite: OverlayId = 'off';
  private enlarge = false;
  private spot: Spot | null = null;
  private info: string | null = null;
  private embed = false;
  private dirtyHud = true;
  private dirtySun = true;
  private lastSunIdx = -1;
  private frameNo = 0;
  private wasXR = false;

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
  private poleOverlays: Partial<Record<OverlayId, Texture>> = {};
  private globeMat!: ShaderMaterial;
  private markers: Marker[] = [];
  private hovered: Marker | null = null;
  private rocket = makeRocket();
  private flight: { t: number; from: Vector3; to: Vector3; dest: Dest } | null = null;
  private scene3: SiteScene | null = null;
  private sun = sunDisc();
  private earth = earthBall();
  private sunLabel = makeLabel('Sun', PALETTE.sunlight);
  private earthLabel = makeLabel('Earth', 0xdce8ff);
  private sunLine = makeSightLine(PALETTE.sunlight);
  private earthLine = makeSightLine(PALETTE.earth);
  private lander = makeLander();
  private spotRing = groundRing(PALETTE.text);
  private hoverRing = groundRing(PALETTE.sunlight, 0.7);
  private spotPin!: Line;
  private spotLabel = makeLabel('Landing point', PALETTE.text, 0.026);
  private siteLabel = makeLabel('', PALETTE.text2, 0.024);
  private platform = groundRing(PALETTE.text2, 0.96);
  private light = new DirectionalLight(0xffffff, 0);
  private status: StatusView | null = null;
  private sunScene: V3 = [0, 1, 0];

  // desktop camera
  private cam = {
    orbit: { az: 0.5, pol: 0.72, dist: 2.7 },
    land: { az: 0.6, pol: 0.95, dist: 42000 },
    stand: { yaw: 0, pitch: 0.05, fov: 60 },
  };
  private drag: { x: number; y: number; moved: number; id: number } | null = null;
  private pointer = { x: 0, y: 0, inside: false };

  // XR
  private panel = new VrPanel();
  private select: Record<Hand, { down: boolean; pressed: boolean; onPanel: boolean }> = {
    left: { down: false, pressed: false, onPanel: false },
    right: { down: false, pressed: false, onPanel: false },
  };
  private activeHand: Hand = 'right';
  private rays: Partial<Record<Hand, Line>> = {};
  private hookedSession: XRSession | null = null;
  private standLift = 0;

  private hud!: Hud;
  private actions!: Actions;
  private v1 = new Vector3();
  private v2 = new Vector3();
  private v3 = new Vector3();
  private camPos = new Vector3();

  // ------------------------------------------------------------------------------------------------ setup

  init(): void {
    const params = new URLSearchParams(location.search);
    this.embed = params.get('embed') === '1';
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
    this.orbitRoot.position.copy(GLOBE_POS);
    this.orbitRoot.scale.setScalar(POLE_SCALE);
    this.sky.add(this.sun, this.earth, this.sunLabel.sprite, this.earthLabel.sprite);
    this.sun.frustumCulled = this.earth.frustumCulled = false;
    this.orbitMarkers.add(this.rocket);
    this.rocket.visible = false;
    this.siteRoot.visible = this.orbitRoot.visible = this.orbitMarkers.visible = this.sky.visible = false;

    this.spotPin = polyline([0, 0, 0, 0, 1, 0], PALETTE.text);
    this.siteRoot.add(this.lander.group, this.spotRing, this.hoverRing, this.spotPin, this.spotLabel.sprite, this.siteLabel.sprite);
    this.siteRoot.add(this.sunLine.line, this.earthLine.line);
    this.hoverRing.visible = false;
    this.platform.scale.setScalar(1.4);
    this.platform.position.y = 0.01;
    this.platform.visible = false;
    this.scene.add(this.platform);

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

    this.actions = {
      pickSite: (id) => this.pickSite(id),
      pickZone: (id) => this.pickZone(id),
      setPreset: (key) => this.setPreset(key),
      tourStart: () => this.tourGo(1),
      tourNext: () => this.tourNext(),
      tourEnd: () => this.tourEnd(),
      toggleStats: () => {
        this.showStats = !this.showStats;
        this.dirtyHud = true;
      },
      setOverlay: (o) => this.setOverlayChoice(o),
      goOrbit: () => this.enterOrbit(),
      goLand: () => this.setMode('land'),
      goStand: () => this.setMode('stand'),
      toggleRaised: () => this.setMode(this.mode === 'stand' ? 'land' : 'stand'),
      toggleEnlarge: () => {
        this.enlarge = !this.enlarge;
        this.dirtyHud = true;
      },
      setTime: (h) => this.setTime(h, true),
      togglePlay: () => {
        this.playing = !this.playing;
        this.dirtyHud = true;
      },
      setSpeed: (s) => {
        this.speed = s;
        this.playing = true;
        this.dirtyHud = true;
      },
      enterVR: () => this.world.launchXR(),
    };
    this.hud = new Hud(this.actions, this.embed);
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
    const [sites, eph, pole, zones, missions, score, stars, criteria, siteValues, presets, summary] = await Promise.all([
      loadSites(),
      loadEphemeris(),
      loadSouthPole(),
      loadZones(),
      loadMissions(),
      loadPoleSuitability(1024),
      loadStars(),
      loadCriteria(),
      loadSiteValues(),
      loadPresets(),
      loadSummary(),
    ]);
    if (stars) {
      this.starData = stars;
      this.stars = makeStars(stars.stars, stars.n);
      this.stars.scale.setScalar(SKY_D * 1.2);
      this.sky.add(this.stars);
    }
    this.sites = sites;
    this.eph = eph;
    this.pole = pole;
    this.criteria = criteria;
    this.siteValues = siteValues;
    this.presets = presets;
    this.preset = presets[0];
    this.summary = summary;
    this.zones = rankAll(zones ?? [], this.preset.weights);
    this.missions = missions ?? [];
    this.poleSuit = score;
    const t = Date.parse(params.get('t') ?? '');
    this.autoTime = !Number.isFinite(t);
    this.nowIdx = this.clampStart(Math.round(((this.autoTime ? Date.now() : t) - eph.startMs) / (eph.stepS * 1000)));
    this.startIdx = this.nowIdx;
    this.buildOrbit();
    this.message = null;
    const site = params.get('site');
    const zone = this.zones.find((z) => z.id === Number(params.get('zone')));
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    if (params.get('demo') === '1') {
      // The demo opens in Orbit with the Goldilocks heat map on.
      if (this.poleScore) {
        this.overlayOrbit = 'score';
      }
      this.enterOrbit();
    } else if (zone) {
      await this.enterLand(this.zoneDest(zone));
    } else if (params.has('lat') && Number.isFinite(lat) && Number.isFinite(lon) && lat < -80 && lat >= -90) {
      // A point chosen on the website's map (web/src/routes/xr.ts).
      await this.enterLand(this.pointDest(lat, lon, 'Chosen point', POINT_ID));
    } else if (site && this.sites.some((s) => s.id === site && s.terrain === 'dem')) {
      await this.enterLand(this.siteDest(site)!);
    } else {
      this.enterOrbit();
    }
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

  private dateLabel(): string {
    const d = new Date(this.eph.startMs + this.idx * this.eph.stepS * 1000);
    return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }

  // ------------------------------------------------------------------------------------------------ ORBIT

  private buildOrbit(): void {
    const grid = this.pole.grid;
    this.poleFrame = gridFrame(0, 0);
    this.poleField = buildField(grid, this.poleFrame);
    const upTex = upTexture(this.poleField, this.floatLinear);
    this.poleShadow = new ShadowPass(this.poleField, upTex);
    this.poleMat = terrainMaterial({ field: this.poleField, upTex, shadowTex: this.poleShadow.texture });
    this.poleMesh = new Mesh(this.poleGeometry(2), this.poleMat);
    this.poleMesh.frustumCulled = false;
    this.orbitRoot.add(this.poleMesh);
    // The rest of the Moon: a plain sphere, a little under the lowest relief. Terrain there is not modelled.
    this.globeMat = farLitMaterial(PALETTE.unmodelled, 0.035, 11);
    const globe = new Mesh(new SphereGeometry(R_M - 6500, 160, 80), this.globeMat);
    globe.position.set(0, -R_M, 0);
    globe.frustumCulled = false;
    this.orbitRoot.add(globe);
    this.poleOverlays.sun = byteTexture(this.pole.sun, grid.size);
    this.poleOverlays.earth = byteTexture(this.pole.earth, grid.size);
    if (this.poleSuit && grid.size === 1024) {
      this.poleScore = this.scoreMap(this.poleSuit, grid.size, () => (this.poleLayers ??= loadPoleLayers(grid.size)));
      this.poleOverlays.score = this.poleScore.tex;
    }

    const add = this.addMarker.bind(this);
    for (const s of this.sites) {
      if (s.terrain !== 'dem') {
        continue;
      }
      add(
        { kind: 'site', id: s.id, obj: siteMarker(s.group === 'artemis' ? PALETTE.sunlight : PALETTE.text), title: s.name, info: s.note },
        s.lat,
        s.lon,
        PALETTE.text,
      );
    }
    const outcomeColor = { landed: PALETTE.ok, tipped: PALETTE.sunlight, crashed: PALETTE.alert };
    this.missions.forEach((m, i) => {
      add(
        {
          kind: 'mission',
          id: `mission-${i}`,
          obj: missionMarker(outcomeColor[m.outcome]),
          title: `${m.name}${m.year ? ` ${m.year}` : ''}`,
          info: `<b>${m.name}</b>${m.year ? `, ${m.year}` : ''}: ${m.outcome}.<br>${m.lesson}`,
        },
        m.lat,
        m.lon,
        outcomeColor[m.outcome],
      );
    });
    this.rebuildOrbitZones();
  }

  /** Height of the south-pole relief at a latitude / longitude, metres (0 off the grid). */
  private groundH(lat: number, lon: number): number {
    const [x, y] = stereoXY(lat, lon);
    const h = lat < -60 ? heightAt(this.pole.grid, x, y) : NaN;
    return Number.isNaN(h) ? 0 : h;
  }

  /** Room position of a point of the Moon on the ORBIT relief. */
  private globePos(lat: number, lon: number, liftM = 0): Vector3 {
    const p = latLonToScene(this.poleFrame, lat, lon, this.groundH(lat, lon) + liftM);
    return new Vector3(p[0], p[1], p[2]).multiplyScalar(POLE_SCALE).add(GLOBE_POS);
  }

  private addMarker(m: Omit<Marker, 'pos' | 'normal' | 'label'>, lat: number, lon: number, labelColor: number): void {
    const pos = this.globePos(lat, lon);
    const n = dirToScene(this.poleFrame, unitOf(lat, lon));
    const label = makeLabel(m.title, labelColor, 0.022);
    label.zoom(this.inXR ? 1.9 : 1);
    m.obj.position.copy(pos);
    label.sprite.position.copy(pos);
    this.orbitMarkers.add(m.obj, label.sprite);
    this.markers.push({ ...m, pos, normal: new Vector3(n[0], n[1], n[2]), label });
  }

  /** Goldilocks zones on the relief under the priorities in use: a ring with the zone's area around its best
   *  cell for the best 40 (the heat map shows the true shapes), a marker for the best 10. */
  private rebuildOrbitZones(): void {
    for (const o of this.zoneObjs) {
      this.orbitMarkers.remove(o);
      o.geometry.dispose();
    }
    this.zoneObjs = [];
    this.markers = this.markers.filter((m) => {
      if (m.kind !== 'zone') {
        return true;
      }
      this.orbitMarkers.remove(m.obj, m.label.sprite);
      m.label.sprite.material.map?.dispose();
      return false;
    });
    this.hovered = null;
    for (const z of this.zones.slice(0, ORBIT_ZONES)) {
      const pts: number[] = [];
      for (const [lat, lon] of zoneRing(z)) {
        const p = this.globePos(lat, lon, 400);
        pts.push(p.x, p.y, p.z);
      }
      const ring = polyline(pts, PALETTE.ok, Math.max(0.45, 1 - 0.03 * (z.rank - 1)), true);
      this.zoneObjs.push(ring);
      this.orbitMarkers.add(ring);
      if (z.rank <= LISTED_ZONES) {
        this.addMarker(
          {
            kind: 'zone',
            id: String(z.id),
            obj: missionMarker(PALETTE.ok),
            title: `#${z.rank}`,
            info: `Goldilocks zone #${z.rank} for "${this.preset.label}"${z.near ? `, nearest region ${z.near}` : ''}: score ${z.score}, ${z.areaKm2.toFixed(1)} km2, NASA sunlight ${z.row.sun_pct} %, Earth ${z.row.earth_pct} %.`,
          },
          z.lat,
          z.lon,
          PALETTE.ok,
        );
      }
    }
  }

  /** A heat map of the published score that setPreset can recolour. */
  private scoreMap(suit: Suitability, size: number, layers: () => Promise<Uint8Array[] | null>): ScoreMap {
    const shown = Uint8Array.from(suit.passScore);
    return { raw: suit.raw, shown, all: suit.raw.map((v) => (v <= 100 || v === 255 ? v : v - 101)), tex: byteTexture(shown, size), layers };
  }

  /** Recolours one heat map for the priorities in use (suitability.ts's mapScoreGrid on the published layers). */
  private async rescoreMap(m: ScoreMap): Promise<void> {
    const p = this.preset;
    if (p.key === 'balanced') {
      // The published grid is the balanced score.
      for (let i = 0; i < m.raw.length; i++) {
        const v = m.raw[i];
        m.all[i] = v <= 100 || v === 255 ? v : v - 101;
        m.shown[i] = v <= 100 ? v : 255;
      }
    } else {
      const layers = await m.layers();
      if (!layers || this.preset !== p) {
        return;
      }
      rescore(layers, m.raw, p.weights, m.shown, m.all);
    }
    m.tex.needsUpdate = true;
    const sp = this.spot;
    if (sp && m === this.scene3?.scoreMap) {
      sp.score = m.raw[sp.cell] === 255 ? null : m.all[sp.cell];
    }
    this.dirtyHud = true;
  }

  /** "Your priorities": re-rank the zones and recolour the Goldilocks maps. */
  private setPreset(key: string): void {
    const p = this.presets.find((k) => k.key === key);
    if (!p || p === this.preset) {
      return;
    }
    this.preset = p;
    this.zones = rankAll(this.zones, p.weights);
    this.rebuildOrbitZones();
    if (this.scene3) {
      this.rebuildSiteZones(this.scene3);
    }
    for (const m of [this.poleScore, this.scene3?.scoreMap]) {
      if (m) {
        void this.rescoreMap(m);
      }
    }
    this.dirtyHud = true;
  }

  private poleGeometry(step: number): BufferGeometry {
    return (this.poleGeos[step] ??= fieldGeometry(this.poleField, step));
  }

  private enterOrbit(): void {
    this.mode = 'orbit';
    this.siteId = null;
    this.place = null;
    this.showWhy = false;
    this.spot = null;
    this.status = null;
    this.info = null;
    this.flight = null;
    this.rocket.visible = false;
    this.orbitRoot.visible = this.orbitMarkers.visible = this.sky.visible = true;
    this.siteRoot.visible = false;
    this.platform.visible = false;
    this.applyOverlay();
    this.dirtySun = this.dirtyHud = true;
    this.syncUrl();
  }

  private siteDest(id: string): Dest | null {
    const site = this.sites.find((s) => s.id === id && s.terrain === 'dem');
    return site ? { site } : null;
  }

  /** A point is shown on the 120 m tile of the nearest site that contains it, else on a tile cut from the pole grid. */
  private pointDest(lat: number, lon: number, name: string, id: string, zone?: ZoneRow): Dest {
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
      return { site: best.site, spot, zone };
    }
    const site: Site = { id, name, group: 'artemis', lat, lon, terrain: 'dem', note: '' };
    return { site, centre: [px, py], spot, zone };
  }

  private zoneDest(z: ZoneRow): Dest {
    return this.pointDest(z.lat, z.lon, `Zone ${z.id}${z.near ? `, near ${z.near}` : ''}`, `zone-${z.id}`, z);
  }

  private zoneHasTile(z: ZoneRow): boolean {
    return this.zoneDest(z).centre == null;
  }

  private pickSite(id: string): void {
    const d = this.siteDest(id);
    if (d) {
      this.flyTo(d);
    }
  }

  private pickZone(id: number): void {
    const z = this.zones.find((k) => k.id === id);
    if (z) {
      this.flyTo(this.zoneDest(z));
    }
  }

  private flyTo(dest: Dest): void {
    if (this.mode === 'flight' || this.mode === 'loading') {
      return;
    }
    if (this.mode !== 'orbit') {
      void this.enterLand(dest);
      return;
    }
    void this.tile(dest); // start the download during the flight
    this.mode = 'flight';
    this.siteId = dest.site.id;
    this.place = dest.site;
    const from = this.v1.copy(GLOBE_POS).add(this.v2.set(0.9, 0.75, 0.5)).clone();
    const [lat, lon] = dest.spot ?? [dest.site.lat, dest.site.lon];
    this.flight = { t: 0, from, to: this.globePos(lat, lon), dest };
    this.rocket.visible = true;
    this.dirtyHud = true;
  }

  private updateFlight(delta: number): void {
    const f = this.flight;
    if (!f) {
      return;
    }
    f.t = Math.min(1, f.t + delta / 2.4);
    const e = f.t * f.t * (3 - 2 * f.t);
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
    if (f.t >= 1) {
      this.flight = null;
      this.rocket.visible = false;
      void this.enterLand(f.dest);
    }
  }

  // ------------------------------------------------------------------------------------------------ LAND / STAND

  private tile(dest: Dest): Promise<SiteTile> {
    const id = dest.site.id;
    let p = this.tiles.get(id);
    if (!p) {
      p = dest.centre
        ? Promise.resolve(tileFromPole(id, this.pole, this.poleSuit, dest.centre[0], dest.centre[1]))
        : loadSiteTile(id);
      this.tiles.set(id, p);
    }
    return p;
  }

  private async enterLand(dest: Dest): Promise<void> {
    const site = dest.site;
    this.siteId = site.id;
    this.place = site;
    if (this.scene3?.site.id !== site.id) {
      this.message = `Loading the terrain around ${site.name}`;
      this.dirtyHud = true;
      const tile = await this.tile(dest);
      this.disposeSite();
      this.scene3 = this.buildSite(site, tile);
      this.message = null;
      if (this.scene3.scoreMap && this.preset.key !== 'balanced') {
        void this.rescoreMap(this.scene3.scoreMap);
      }
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
    this.mode = 'land';
    this.info = null;
    this.showWhy = false;
    // "Why here?" for a zone or a site's own point uses the published row; any other point, what is known there.
    const values = dest.zone?.row ?? (dest.spot ? undefined : this.siteValues.get(site.id));
    this.setSpot(row, col, values ? { title: dest.zone ? `zone #${dest.zone.rank}` : site.name, row: values } : undefined);
    if (this.autoTime || this.tour) {
      // No time was asked for: open at the next time the whole Sun is up at this point (computeSeries on its skyline).
      const up = nextSunUp(this.eph, this.spot!.hz, this.autoTime ? this.nowIdx : Math.floor(this.idx));
      if (up != null) {
        this.startIdx = this.clampStart(up);
        this.tH = up - this.startIdx;
        this.refreshSeries();
      }
    }
    this.applyOverlay();
    this.setMode('land');
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
    const mat = terrainMaterial({ field, upTex, shadowTex: shadow.texture });
    // The far mesh is not drawn where the 120 m tile covers it (minus a margin so the two overlap).
    const k = half / (tile.far.size * tile.far.pixelM) - 1.5 / tile.far.size;
    const farMat = terrainMaterial({ field: farField, upTex: farUpTex, shadowTex: farShadow.texture, hole: [0.5 - k, 0.5 - k, 0.5 + k, 0.5 + k] });
    const step = this.detail().meshStep;
    const geos: Record<number, BufferGeometry> = { [step]: fieldGeometry(field, step) };
    const farGeos: Record<number, BufferGeometry> = { [step * 2]: fieldGeometry(farField, step * 2) };
    const mesh = new Mesh(geos[step], mat);
    const farMesh = new Mesh(farGeos[step * 2], farMat);
    mesh.frustumCulled = farMesh.frustumCulled = false;
    const group = new Group();
    group.add(farMesh, mesh);
    const overlays: Partial<Record<OverlayId, Texture>> = {
      sun: byteTexture(tile.sun, g.size),
      earth: byteTexture(tile.earth, g.size),
      slope: byteTexture(tile.slope, g.size),
    };
    let scoreMap: ScoreMap | null = null;
    if (tile.suitability) {
      let layers: Promise<Uint8Array[] | null> | null = null;
      const centre: [number, number] = [g.xMinM + half, g.yMaxM - half];
      scoreMap = this.scoreMap(tile.suitability, g.size, () =>
        (layers ??= tile.coarse
          ? (this.poleLayers ??= loadPoleLayers(this.pole.grid.size)).then(
              (l) => l && l.map((b) => resampleBytes(b, this.pole.grid, centre[0], centre[1], g.size, g.pixelM)),
            )
          : loadSiteLayers(site.id, g.size)),
      );
      overlays.score = scoreMap.tex;
    }
    const zoneGroup = new Group();
    group.add(zoneGroup);
    this.siteRoot.add(group);
    const centre = groundAt(field, (g.yMaxM - tile.site.y_m) / g.pixelM - 0.5, (tile.site.x_m - g.xMinM) / g.pixelM - 0.5);
    this.siteLabel.set(`${site.name} (${site.id})`);
    this.siteLabel.sprite.position.set(centre.pos[0], centre.pos[1], centre.pos[2]);
    const scene: SiteScene = {
      site, tile, frame, field, farField, shadow, farShadow, mat, farMat, mesh, farMesh, geos, farGeos, overlays, scoreMap, zoneGroup, group,
      textures: [upTex, farUpTex, ...Object.values(overlays)],
    };
    this.rebuildSiteZones(scene);
    return scene;
  }

  /** Rings and rank labels of the zones on a site tile, under the priorities in use. */
  private rebuildSiteZones(s: SiteScene): void {
    for (const o of [...s.zoneGroup.children]) {
      s.zoneGroup.remove(o);
      (o as Line).geometry?.dispose();
      (o as Label['sprite']).material?.map?.dispose();
    }
    const g = s.tile.grid;
    const half = (g.size * g.pixelM) / 2;
    for (const z of this.zones) {
      const [zx, zy] = stereoXY(z.lat, z.lon);
      if (Math.abs(zx - (g.xMinM + half)) > half - 1500 || Math.abs(zy - (g.yMaxM - half)) > half - 1500) {
        continue;
      }
      const pts: number[] = [];
      for (const [lat, lon] of zoneRing(z)) {
        const [x, y] = stereoXY(lat, lon);
        const h = heightAt(g, x, y);
        pts.push(...latLonToScene(s.frame, lat, lon, (Number.isNaN(h) ? 0 : h) + 30));
      }
      s.zoneGroup.add(polyline(pts, PALETTE.ok, Math.max(0.45, 1 - 0.004 * (z.rank - 1)), true));
      if (z.rank <= 100) {
        const label = makeLabel(`#${z.rank}`, PALETTE.ok, 0.02);
        const h = heightAt(g, zx, zy);
        label.sprite.position.set(...latLonToScene(s.frame, z.lat, z.lon, (Number.isNaN(h) ? 0 : h) + 30));
        s.zoneGroup.add(label.sprite);
      }
    }
  }

  private disposeSite(): void {
    const s = this.scene3;
    if (!s) {
      return;
    }
    this.siteRoot.remove(s.group);
    s.shadow.dispose();
    s.farShadow.dispose();
    s.mat.dispose();
    s.farMat.dispose();
    for (const geo of [...Object.values(s.geos), ...Object.values(s.farGeos)]) {
      geo.dispose();
    }
    for (const t of s.textures) {
      t.dispose();
    }
    this.scene3 = null;
  }

  /** Choose the landing point at fractional pixel (row, col) of the site tile and compute its numbers. */
  private setSpot(row: number, col: number, published?: { title: string; row: Record<string, string> }): void {
    const s = this.scene3!;
    const n = s.tile.grid.size;
    row = Math.max(1, Math.min(n - 2, row));
    col = Math.max(1, Math.min(n - 2, col));
    const hit = groundAt(s.field, row, col);
    const i = Math.round(row) * n + Math.round(col);
    const suit = s.tile.suitability;
    const map = s.scoreMap;
    const hz = demHorizon(s.tile.grid, [this.pole.grid, s.tile.far], hit.lat, hit.lon, { observerHM: EYE_M, siteId: s.site.id });
    const series = computeSeries(this.eph, hz, this.startIdx, this.startIdx + WINDOW_H + 2);
    const metrics = computeMetrics(sliceSeries(series, 0, WINDOW_H));
    this.spot = {
      hit,
      pos: new Vector3(hit.pos[0], hit.pos[1], hit.pos[2]),
      slopeDeg: byteOrNull(s.tile.slope[i]),
      nasaSun: byteOrNull(s.tile.sun[i]),
      nasaEarth: byteOrNull(s.tile.earth[i]),
      score: map && map.raw[i] !== 255 ? map.all[i] : null,
      cell: i,
      why: published
        ? whyFromRow(published.title, published.row, this.criteria)
        : why(
            'this landing point',
            {
              latDeg: hit.lat,
              // No landing slope on a tile interpolated from the 430 m map: its heights are too smooth.
              landingSlopeDeg: s.tile.coarse ? undefined : landingSlopeDeg(s.tile.grid, Math.round(row), Math.round(col)),
              sunPct: byteOrNull(s.tile.sun[i]) ?? undefined,
              earthPct: byteOrNull(s.tile.earth[i]) ?? undefined,
              ...longRunMetrics(this.eph, hz),
            },
            this.criteria,
          ),
      failed: suit && suit.raw[i] !== 255 && suit.raw[i] > 100 ? (suit.limits ? LIMIT_NAMES.filter(([bit]) => suit.limits![i] & bit).map(([, n]) => n) : ['a hard limit']) : [],
      hz,
      series,
      metrics,
    };
    const p = this.spot.pos;
    // The lander stands 15 m from the observer, so the view from the landing point itself stays clear.
    const lx = p.x + 9;
    const lz = p.z - 12;
    const ly = fieldUpAt(s.field, lx, lz);
    this.lander.group.position.set(lx, Number.isNaN(ly) ? p.y : ly, lz);
    this.spotRing.position.copy(p).setY(p.y + 1);
    this.spotPin.position.copy(p);
    this.spotLabel.sprite.position.copy(p);
    this.dirtySun = this.dirtyHud = true;
  }

  /** Recompute the landing point's 30-day series after the window start moved. */
  private refreshSeries(): void {
    const sp = this.spot;
    if (sp) {
      sp.series = computeSeries(this.eph, sp.hz, this.startIdx, this.startIdx + WINDOW_H + 2);
      sp.metrics = computeMetrics(sliceSeries(sp.series, 0, WINDOW_H));
      this.dirtySun = this.dirtyHud = true;
    }
  }

  private setMode(mode: 'land' | 'stand'): void {
    if (!this.scene3 || !this.spot) {
      return;
    }
    this.mode = mode;
    this.playing = this.playing && mode === 'stand';
    if (mode === 'stand') {
      // Start facing the Sun's azimuth.
      const d = this.sunScene;
      this.cam.stand.yaw = Math.atan2(-d[0], -d[2]);
      this.cam.stand.pitch = 0.06;
      this.standLift = this.camera.position.y - EYE_M;
    }
    this.hoverRing.visible = false;
    this.dirtySun = this.dirtyHud = true;
  }

  private setOverlayChoice(o: OverlayId): void {
    if (this.mode === 'orbit' || this.mode === 'flight') {
      this.overlayOrbit = o;
    } else {
      this.overlaySite = o;
    }
    this.applyOverlay();
    this.dirtyHud = true;
  }

  private applyOverlay(): void {
    const ramp = (o: OverlayId) => (o === 'off' ? undefined : OVERLAYS[o]);
    setOverlay(this.poleMat, this.poleOverlays[this.overlayOrbit] ?? null, ramp(this.overlayOrbit));
    if (this.scene3) {
      setOverlay(this.scene3.mat, this.scene3.overlays[this.overlaySite] ?? null, ramp(this.overlaySite));
    }
  }

  private setTime(h: number, pause: boolean): void {
    this.tH = Math.max(0, Math.min(WINDOW_H, h));
    if (pause) {
      this.playing = false;
    }
  }

  private syncUrl(): void {
    const p = new URLSearchParams(location.search);
    p.delete('site');
    p.delete('zone');
    p.delete('lat');
    p.delete('lon');
    if (this.siteId) {
      p.delete('demo');
    }
    if (this.siteId?.startsWith('zone-')) {
      p.set('zone', this.siteId.slice(5));
    } else if (this.siteId === POINT_ID && this.spot) {
      p.set('lat', this.spot.hit.lat.toFixed(5));
      p.set('lon', this.spot.hit.lon.toFixed(5));
    } else if (this.siteId) {
      p.set('site', this.siteId);
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
      this.light.position.set(d[0], d[1], d[2]);
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
    s.shadow.render(this.renderer, d, semi);
    s.farShadow.render(this.renderer, d, semi);
    s.mat.uniforms.sunDir.value.set(d[0], d[1], d[2]);
    s.farMat.uniforms.sunDir.value.set(d[0], d[1], d[2]);
    // Status at the landing point, from computeSeries, interpolated between the hourly samples.
    const i0 = Math.min(WINDOW_H, Math.floor(this.tH));
    const t = this.tH - i0;
    const q = spot.series;
    const sunMargin = lerp(q.sunMargin[i0], q.sunMargin[i0 + 1], t);
    const earthMargin = lerp(q.earthMargin[i0], q.earthMargin[i0 + 1], t);
    this.status = { sunUp: sunMargin > 0, sunMargin, earthUp: earthMargin > 0, earthMargin };
    this.light.position.set(d[0], d[1], d[2]);
    this.light.intensity = 2.5 * lerp(q.sunFrac[i0], q.sunFrac[i0 + 1], t);
  }

  /** Real stars: ICRF -> MOON_ME (the Moon's orientation at this time) -> the scene frame. */
  private placeStars(frame: Frame): void {
    const sd = this.starData;
    const stars = this.stars;
    if (!sd || !stars) {
      return;
    }
    const x = Math.max(0, Math.min(sd.nRot - 1.001, ((this.eph.startMs - sd.startMs) / 1000 + this.idx * this.eph.stepS) / sd.stepS));
    const i = Math.floor(x);
    this.q1.fromArray(sd.quat, 4 * i);
    this.q2.fromArray(sd.quat, 4 * i + 4);
    this.q1.slerp(this.q2, x - i);
    const { gx, gy, up } = frame;
    this.m4.set(gx[0], gx[1], gx[2], 0, up[0], up[1], up[2], 0, -gy[0], -gy[1], -gy[2], 0, 0, 0, 0, 1);
    this.m4.multiply(this.m4b.makeRotationFromQuaternion(this.q1));
    stars.quaternion.setFromRotationMatrix(this.m4);
    stars.position.copy(this.camPos);
    (stars.material as ShaderMaterial).uniforms.px.value = this.renderer.getPixelRatio();
  }

  /** Sun and Earth discs, labels, sight lines and the lander's panel and dish, placed every frame around the viewer. */
  private placeSky(): void {
    const eph = this.eph;
    const idx = this.idx;
    const cam = this.camPos;
    const k = this.enlarge ? ENLARGE : 1;
    const semiSun = eph.sunSemiDiam[Math.min(eph.n - 1, Math.floor(idx))];
    const earthKm = earthKmAt(eph, idx);
    (this.earth.material as ShaderMaterial).uniforms.sunDir.value.set(this.sunScene[0], this.sunScene[1], this.sunScene[2]);
    this.placeStars(this.mode === 'orbit' || this.mode === 'flight' || !this.scene3 ? this.poleFrame : this.scene3.frame);
    if (this.mode === 'orbit' || this.mode === 'flight') {
      // To scale with the globe: the Earth at its true distance and size, the Sun at its true angular size.
      const dist = Math.hypot(earthKm[0], earthKm[1], earthKm[2]);
      const e = dirToScene(this.poleFrame, [earthKm[0] / dist, earthKm[1] / dist, earthKm[2] / dist]);
      const centre = this.v1.copy(GLOBE_POS).setY(GLOBE_POS.y - R_M * POLE_SCALE);
      this.earth.position.copy(centre).addScaledVector(this.v2.set(e[0], e[1], e[2]), dist * 1000 * POLE_SCALE);
      this.earth.scale.setScalar(EARTH_R_KM * 1000 * POLE_SCALE * k);
      this.sun.position.copy(cam).addScaledVector(this.v2.set(this.sunScene[0], this.sunScene[1], this.sunScene[2]), SKY_D);
      this.sun.scale.setScalar(SKY_D * Math.tan(semiSun * D2R) * k);
      this.sun.lookAt(cam);
      this.sunLabel.set('Sun');
      this.earthLabel.set('Earth, to scale');
      this.sunLabel.sprite.position.copy(this.sun.position);
      this.earthLabel.sprite.position.copy(this.earth.position);
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
    this.sun.position.copy(cam).addScaledVector(this.v2.set(sd[0], sd[1], sd[2]), SKY_D);
    this.sun.scale.setScalar(SKY_D * Math.tan(semiSun * D2R) * k);
    this.sun.lookAt(cam);
    // Earth's angular radius from its real distance to this site at this time.
    const up = unitOf(lat, lon);
    const rKm = (R_M + spot.hit.heightM) / 1000;
    const eDist = Math.hypot(earthKm[0] - up[0] * rKm, earthKm[1] - up[1] * rKm, earthKm[2] - up[2] * rKm);
    this.earth.position.copy(cam).addScaledVector(this.v2.set(ed[0], ed[1], ed[2]), SKY_D);
    this.earth.scale.setScalar(SKY_D * Math.tan(Math.asin(EARTH_R_KM / eDist)) * k);
    const st = this.status;
    if (st) {
      const txt = statusText(st);
      this.sunLabel.set(txt.sun, st.sunUp ? PALETTE.sunlight : PALETTE.alert);
      this.earthLabel.set(txt.earth, st.earthUp ? 0xdce8ff : PALETTE.alert);
    }
    this.sunLabel.sprite.position.copy(this.sun.position);
    this.earthLabel.sprite.position.copy(this.earth.position);
    // Sight lines run from the top of the lander's mast, in the site's own coordinates.
    const mast = this.v1.copy(this.lander.group.position);
    mast.y += 4.1;
    const off = this.siteRoot.position;
    this.sunLine.set(mast, this.v2.copy(this.sun.position).sub(off), st?.sunUp ?? true);
    this.earthLine.set(mast, this.v3.copy(this.earth.position).sub(off), st?.earthUp ?? true);
    this.lander.panel.rotation.y = Math.atan2(sd[0], sd[2]);
    this.lander.dish.rotation.set(0, 0, 0);
    this.lander.dish.rotation.y = Math.atan2(ed[0], ed[2]);
    this.lander.dish.rotateX(-Math.asin(Math.max(-1, Math.min(1, ed[1]))));
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
      } else if (this.mode === 'land') {
        const c = this.cam.land;
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
        this.click(e.clientX, e.clientY);
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
        if (this.mode === 'orbit' || this.mode === 'flight') {
          this.cam.orbit.dist = Math.max(0.5, Math.min(40, this.cam.orbit.dist * f));
        } else if (this.mode === 'land') {
          this.cam.land.dist = Math.max(400, Math.min(110000, this.cam.land.dist * f));
        } else if (this.mode === 'stand') {
          this.cam.stand.fov = Math.max(4, Math.min(75, this.cam.stand.fov * f));
        }
      },
      { passive: false },
    );
    on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || this.mode === 'loading') {
        return;
      }
      if (e.code === 'Space') {
        this.actions.togglePlay();
        e.preventDefault();
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        this.setTime(this.tH + (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 24 : 1), true);
      } else if (e.code === 'Escape') {
        if (this.mode === 'stand') {
          this.setMode('land');
        } else if (this.mode === 'land') {
          this.enterOrbit();
        }
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

  private click(x: number, y: number): void {
    this.screenRay(x, y, this.v1, this.v2);
    this.activate(this.v1, this.v2);
  }

  /** What a click, trigger press or pinch does with a world-space ray, outside the VR panel. */
  private activate(o: Vector3, d: Vector3): void {
    if (this.mode === 'orbit') {
      const m = this.pickMarker(o, d);
      if (m?.kind === 'site') {
        this.pickSite(m.id);
      } else if (m?.kind === 'zone') {
        this.pickZone(Number(m.id));
      } else if (m) {
        this.info = m.info;
        this.dirtyHud = true;
      }
    } else if (this.mode === 'land') {
      const hit = this.pickGround(o, d);
      if (hit) {
        this.setSpot(hit.row, hit.col);
      }
    }
  }

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
      if (t > 0 && miss < m.obj.scale.x * 2.6 && t < bestT) {
        best = m;
        bestT = t;
      }
    }
    return best;
  }

  private pickGround(o: Vector3, d: Vector3): GroundHit | null {
    const s = this.scene3;
    if (!s) {
      return null;
    }
    const off = this.siteRoot.position;
    return raycastField(s.field, [o.x - off.x, o.y - off.y, o.z - off.z], [d.x, d.y, d.z], 120000);
  }

  private updateHover(o: Vector3, d: Vector3): void {
    if (this.mode === 'orbit') {
      const m = this.pickMarker(o, d);
      if (m !== this.hovered) {
        this.hovered = m;
        this.info = m ? (m.kind === 'mission' ? m.info : `<b>${m.title}</b><br>${m.info}`) : null;
        this.dirtyHud = true;
      }
      this.renderer.domElement.style.cursor = m && m.kind !== 'mission' ? 'pointer' : '';
    } else if (this.mode === 'land') {
      const hit = this.pickGround(o, d);
      this.hoverRing.visible = hit != null;
      if (hit) {
        this.hoverRing.position.set(hit.pos[0], hit.pos[1] + 1, hit.pos[2]);
      }
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
    const mark = (e: XRInputSourceEvent, down: boolean) => {
      const h = e.inputSource.handedness;
      if (h === 'left' || h === 'right') {
        this.select[h].down = down;
        this.select[h].pressed = down;
        if (down) {
          this.activeHand = h;
        } else {
          this.select[h].onPanel = false;
        }
      }
    };
    session.addEventListener('selectstart', (e) => mark(e, true));
    session.addEventListener('selectend', (e) => mark(e, false));
  }

  private handRay(hand: Hand, o: Vector3, d: Vector3): void {
    const space = this.player.raySpaces[hand];
    space.getWorldPosition(o);
    space.getWorldDirection(d).negate();
  }

  private updateXRInput(delta: number): void {
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
        sel.onPanel = hit != null;
        if (hit?.button) {
          this.pressPanel(hit.button);
        } else if (!hit) {
          this.activate(o, d);
        }
      }
      if (sel.down && sel.onPanel && hit?.scrub != null) {
        this.setTime(hit.scrub * WINDOW_H, true); // pinch or trigger, then drag along the time bar
      }
      if (!hit && hand === this.activeHand) {
        this.updateHover(o, d);
      }
      const pad = this.input.xr.gamepads[hand];
      const axes = pad?.getAxesValues(InputComponent.Thumbstick);
      if (axes && Math.abs(axes.x) > 0.25) {
        this.setTime(this.tH + axes.x * delta * 36, true); // thumbstick: up to 36 hours per second
      }
      if (pad?.getButtonDown(InputComponent.A_Button) || pad?.getButtonDown(InputComponent.X_Button)) {
        if (this.mode === 'land' || this.mode === 'stand') {
          this.actions.toggleRaised();
        }
      }
    }
    this.panel.setHover(hoverButton);
  }

  private pressPanel(id: string): void {
    const a = this.actions;
    const [kind, arg] = id.split(':');
    if (kind === 'site') a.pickSite(arg);
    else if (kind === 'ov') a.setOverlay(arg as OverlayId);
    else if (kind === 'speed') a.setSpeed(Number(arg));
    else if (kind === 'play') a.togglePlay();
    else if (kind === 'orbit') a.goOrbit();
    else if (kind === 'raised') a.toggleRaised();
    else if (kind === 'enlarge') a.toggleEnlarge();
    else if (kind === 'exit') this.world.exitXR();
    else if (kind === 'zone') a.pickZone(Number(arg));
    else if (kind === 'preset') a.setPreset(arg);
    else if (kind === 'tour') a.tourStart();
    else if (kind === 'next') a.tourNext();
    else if (kind === 'endtour') a.tourEnd();
    else if (kind === 'stats') a.toggleStats();
    else if (kind === 'why') this.showWhy = !this.showWhy;
    this.dirtyHud = true;
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
        cam.position.set(
          GLOBE_POS.x + c.dist * Math.sin(c.pol) * Math.sin(c.az),
          GLOBE_POS.y + c.dist * Math.cos(c.pol),
          GLOBE_POS.z + c.dist * Math.sin(c.pol) * Math.cos(c.az),
        );
        cam.lookAt(GLOBE_POS);
        this.setFov(50);
      }
    } else if (this.scene3 && this.spot) {
      const p = this.spot.pos;
      if (xr) {
        // The rig stays at the room origin; the Moon is moved under it.
        if (this.mode === 'land') {
          this.siteRoot.position.set(-p.x, -(p.y + RAISE_M), -p.z);
        } else {
          this.siteRoot.position.set(-p.x, -p.y + this.standLift, -p.z);
        }
      } else if (this.mode === 'land') {
        const c = this.cam.land;
        const centre = this.siteLabel.sprite.position;
        this.siteRoot.position.set(-centre.x, -centre.y, -centre.z);
        cam.position.set(c.dist * Math.sin(c.pol) * Math.sin(c.az), c.dist * Math.cos(c.pol), c.dist * Math.sin(c.pol) * Math.cos(c.az));
        cam.lookAt(0, 0, 0);
        this.setFov(50);
      } else {
        const c = this.cam.stand;
        this.siteRoot.position.set(-p.x, -p.y, -p.z);
        cam.position.set(0, EYE_M, 0);
        cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
        this.setFov(c.fov);
      }
    }
    this.platform.visible = xr && this.mode === 'land';
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
    for (const l of [this.sunLabel, this.earthLabel, this.spotLabel, this.siteLabel, ...this.markers.map((m) => m.label)]) {
      l.zoom(zoom);
    }
    this.quality.reset();
    this.applyQuality();
    if (xr) {
      this.world.session?.updateTargetFrameRate?.(72)?.catch?.(() => undefined);
      this.standLift = 0;
    }
    this.dirtySun = this.dirtyHud = true;
  }

  /** Terrain and shadow detail: full on the laptop, the automatic level in the headset (perf.ts). */
  private detail(): { meshStep: number; shadowRes: number; shadowEvery: number; foveation: number } {
    return this.inXR ? LEVELS[this.quality.level] : { meshStep: 1, shadowRes: 512, shadowEvery: 1, foveation: 0 };
  }

  private applyQuality(): void {
    const q = this.detail();
    this.poleMesh.geometry = this.poleGeometry(q.meshStep * 2);
    this.poleShadow.setResolution(q.shadowRes * 2);
    const s = this.scene3;
    if (s) {
      s.mesh.geometry = s.geos[q.meshStep] ??= fieldGeometry(s.field, q.meshStep);
      s.farMesh.geometry = s.farGeos[q.meshStep * 2] ??= fieldGeometry(s.farField, q.meshStep * 2);
      s.shadow.setResolution(q.shadowRes);
      s.farShadow.setResolution(q.shadowRes);
    }
    if (this.inXR) {
      this.renderer.xr.setFoveation(q.foveation);
    }
    this.dirtySun = this.dirtyHud = true;
  }

  // ------------------------------------------------------------------------------------------------ tour

  /** The guided tour: four stops, each with a caption made of numbers from the data, each waiting for "Next". */
  private tourGo(stop: number): void {
    if (this.mode === 'loading' || this.mode === 'flight') {
      return;
    }
    const t = (this.tour = { stop, caption: '', why: null as Why | null, playFrom: null as number | null });
    this.playing = false;
    if (stop === 1) {
      this.overlayOrbit = 'off';
      this.cam.orbit = { az: 0.5, pol: 0.72, dist: 2.7 };
      this.enterOrbit();
      t.caption = captionPole(this.eph);
    } else if (stop === 2) {
      this.overlayOrbit = this.poleScore ? 'score' : 'sun';
      this.enterOrbit();
      t.caption = captionGoldilocks(this.summary);
    } else if (stop === 3) {
      const z = this.zones[0];
      if (!z) {
        this.tourEnd();
        return;
      }
      t.why = whyFromRow(`zone #${z.rank}`, z.row, this.criteria);
      t.caption = captionZone(z, this.preset.label, t.why);
      this.overlaySite = 'score';
      this.flyTo(this.zoneDest(z));
    } else if (this.spot) {
      this.overlaySite = 'off';
      this.applyOverlay();
      this.setMode('stand');
      t.playFrom = Math.min(Math.floor(this.tH), WINDOW_H - TOUR_PLAY_H);
      this.tH = t.playFrom;
      t.caption = captionStand(sliceSeries(this.spot.series, t.playFrom, t.playFrom + TOUR_PLAY_H + 1), TOUR_PLAY_H);
    }
    this.dirtyHud = true;
  }

  private tourNext(): void {
    const t = this.tour;
    if (!t || this.mode === 'flight' || this.message) {
      return; // still flying or loading: "Next" waits
    }
    if (t.stop >= TOUR_STOPS) {
      this.tourEnd();
    } else {
      this.tourGo(t.stop + 1);
    }
  }

  private tourEnd(): void {
    this.tour = null;
    this.playing = false;
    this.enterOrbit();
  }

  private updateMarkers(): void {
    const hot = this.hovered;
    const xr = this.inXR;
    // Labels that would overlap a more important one are hidden (hovered first, then sites, zones, past landings).
    const order = [...this.markers].sort((a, b) => this.markerRank(a) - this.markerRank(b));
    const boxes: number[] = [];
    const hNdc = (0.022 * (xr ? 1.9 : 1)) / Math.tan((this.camera.fov * D2R) / 2);
    const wNdc = hNdc / this.camera.aspect;
    for (const m of order) {
      const toCam = this.v1.copy(this.camPos).sub(m.pos);
      const dist = toCam.length();
      const facing = toCam.dot(m.normal) > 0;
      m.obj.visible = facing;
      m.obj.scale.setScalar(dist * (m === hot ? 0.011 : 0.007) * (m.kind === 'site' ? 1 : 0.8));
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

  private markerRank(m: Marker): number {
    return m === this.hovered ? 0 : m.id === this.siteId ? 1 : m.kind === 'site' ? 2 : m.kind === 'zone' ? 3 : 4;
  }

  // ------------------------------------------------------------------------------------------------ interface models

  private spotView(): SpotView | null {
    const sp = this.spot;
    if (!sp) {
      return null;
    }
    const h = sp.hit;
    return {
      title: 'Landing point',
      elevationM: h.heightM,
      slopeDeg: sp.slopeDeg,
      nasaSunPct: sp.nasaSun,
      nasaEarthPct: sp.nasaEarth,
      scorePct: sp.score,
      failed: sp.failed,
      ourSunPct: sp.metrics.sunPct,
      ourEarthPct: sp.metrics.earthPct,
      longestDarkH: sp.metrics.longestDarkH,
      latLon: `${Math.abs(h.lat).toFixed(3)} S, ${Math.abs(h.lon).toFixed(3)} ${h.lon >= 0 ? 'E' : 'W'}`,
    };
  }

  private windowLabel(): string {
    if (!this.eph) {
      return '';
    }
    const d = new Date(this.eph.startMs + this.startIdx * this.eph.stepS * 1000);
    return `30 days from ${d.toISOString().slice(0, 10)}; 1x = 1 hour per second`;
  }

  private hudModel(): HudModel {
    const site = this.place;
    const inSite = this.mode === 'land' || this.mode === 'stand';
    const coarse = inSite && this.scene3?.tile.coarse === true;
    const overlays: OverlayId[] = !inSite || coarse ? ['sun', 'earth'] : ['sun', 'earth', 'slope'];
    if (inSite ? this.scene3?.scoreMap : this.poleScore) {
      overlays.push('score');
    }
    overlays.push('off');
    let info = this.info;
    if (!info && this.mode === 'orbit' && this.missions.length) {
      info = 'Past landings: <span style="color:#8FC28A">landed</span>, <span style="color:#F6B93B">tipped</span>, <span style="color:#E0457B">crashed</span>. Point at one for its lesson.';
    }
    if (!info && coarse) {
      info = COARSE_NOTE;
    }
    return {
      presets: this.presets.map((p) => ({ key: p.key, label: p.label })),
      preset: this.preset.key,
      why: inSite ? (this.spot?.why ?? null) : null,
      tour: this.tour ? { stop: this.tour.stop, of: TOUR_STOPS, caption: this.tour.caption, why: this.tour.why } : null,
      stats: this.showStats ? this.statsText || 'measuring' : null,
      mode: this.mode,
      message: this.message,
      siteName: site?.name ?? null,
      sites: this.sites.filter((s) => s.terrain === 'dem').map((s) => ({ id: s.id, name: s.name, group: s.group })),
      zones: this.zones.slice(0, LISTED_ZONES).map((z) => ({ id: z.id, rank: z.rank, name: z.near ? `near ${z.near}` : '', score: z.score, areaKm2: z.areaKm2, detail: this.zoneHasTile(z) })),
      overlay: inSite ? this.overlaySite : this.overlayOrbit,
      overlays,
      spot: inSite ? this.spotView() : null,
      status: this.status,
      enlarge: this.enlarge,
      enlargeFactor: ENLARGE,
      info,
      windowLabel: this.windowLabel(),
      missionsLoaded: this.missions.length > 0,
      zonesLoaded: this.zones.length > 0,
      xrOffered: this.world.xrEnabled !== false && 'xr' in navigator,
      raised: this.mode === 'land',
      inXR: this.inXR,
    };
  }

  private panelModel(): PanelModel {
    const site = this.place;
    const date = this.eph ? this.dateLabel() : '';
    const speedRow = [
      { id: 'play', label: this.playing ? 'Pause' : 'Play', on: this.playing },
      ...[1, 10, 100].map((s) => ({ id: `speed:${s}`, label: `${s}x`, on: this.playing && this.speed === s })),
    ];
    if (this.mode === 'loading' || !this.eph) {
      return { title: 'Lunar Landing Site Navigator', subtitle: '', lines: [{ text: this.message ?? 'Loading' }], rows: [], timeFrac: null, credits: CREDITS };
    }
    const stats: PanelModel['lines'] = this.showStats ? [{ text: this.statsText || 'measuring', color: 'text2' }] : [];
    const statsButton = { id: 'stats', label: 'Stats', on: this.showStats };
    const st = this.status;
    const statusLines: PanelModel['lines'] = [];
    if (st) {
      const txt = statusText(st);
      statusLines.push({ text: txt.sun, color: st.sunUp ? 'sun' : 'alert', big: true });
      statusLines.push({ text: txt.earth, color: st.earthUp ? 'cloud' : 'alert', big: true });
    }
    const presetRow = this.presets.length > 1 ? [this.presets.map((p) => ({ id: `preset:${p.key}`, label: p.label, on: p === this.preset }))] : [];
    const t = this.tour;
    if (t) {
      return {
        title: `Tour: stop ${t.stop} of ${TOUR_STOPS}`,
        subtitle: date,
        lines: [
          { text: this.mode === 'flight' ? `Flying to ${site?.name ?? ''}` : (this.message ?? t.caption), big: true },
          ...(t.why?.lines.map((l) => ({ text: l.head, color: VERDICT_COLOR[l.verdict] })) ?? []),
          ...(t.stop === TOUR_STOPS ? statusLines : []),
          ...stats,
        ],
        rows: [[{ id: 'next', label: t.stop === TOUR_STOPS ? 'Finish' : 'Next', primary: true }, { id: 'endtour', label: 'End tour' }, statsButton]],
        timeFrac: this.tH / WINDOW_H,
        credits: CREDITS,
      };
    }
    if (this.mode === 'orbit' || this.mode === 'flight') {
      const dem = this.sites.filter((s) => s.terrain === 'dem');
      const rows = [[{ id: 'tour', label: 'Tour: 4 stops', primary: true }, statsButton, { id: 'exit', label: 'Exit VR' }]];
      for (let i = 0; i < dem.length; i += 3) {
        rows.push(dem.slice(i, i + 3).map((s) => ({ id: `site:${s.id}`, label: s.name, on: s.id === this.siteId })));
      }
      rows.push(...presetRow);
      const top = this.zones.slice(0, LISTED_ZONES);
      for (let i = 0; i < top.length; i += 2) {
        rows.push(top.slice(i, i + 2).map((z) => ({ id: `zone:${z.id}`, label: `#${z.rank} ${z.near ? `near ${z.near}` : 'zone'}, score ${z.score}`, on: this.siteId === `zone-${z.id}` })));
      }
      const ov: OverlayId[] = this.poleScore ? ['sun', 'earth', 'score', 'off'] : ['sun', 'earth', 'off'];
      rows.push(ov.map((o) => ({ id: `ov:${o}`, label: o === 'off' ? 'Map off' : o === 'score' ? 'Goldilocks' : OVERLAYS[o].label, on: this.overlayOrbit === o })));
      return {
        title: this.mode === 'flight' ? `Flying to ${site?.name ?? ''}` : 'Choose a landing site',
        subtitle: date,
        lines: [{ text: 'Sites, then your priorities and the 10 best zones for them. Trigger or pinch to choose.', color: 'text2' }, ...stats],
        rows,
        timeFrac: this.tH / WINDOW_H,
        credits: CREDITS,
      };
    }
    const sp = this.spot;
    if (this.showWhy && sp) {
      return {
        title: 'Why here?',
        subtitle: sp.why.title,
        lines: [
          { text: sp.why.summary },
          ...sp.why.lines.flatMap((l) => [
            { text: l.head, color: VERDICT_COLOR[l.verdict] },
            { text: l.detail, color: 'text2' as const, small: true },
          ]),
        ],
        rows: [[{ id: 'why', label: 'Back', primary: true }]],
        timeFrac: null,
        credits: CREDITS,
      };
    }
    const lines: PanelModel['lines'] = [...statusLines];
    if (sp) {
      const steep = sp.slopeDeg != null && sp.slopeDeg > 10;
      lines.push({
        text: `Elevation ${Math.round(sp.hit.heightM)} m.  Slope ${sp.slopeDeg == null ? 'no data' : `${sp.slopeDeg} deg`}${steep ? ': too steep to land' : ''}${sp.score == null ? '' : `.  Goldilocks map score ${sp.score}${sp.failed.length ? ' (fails a limit)' : ''}`}`,
        color: steep ? 'alert' : 'text',
      });
      lines.push({ text: `NASA map (18.6-year average): sunlit ${sp.nasaSun ?? '?'} %, Earth ${sp.nasaEarth ?? '?'} %`, color: 'text2' });
      lines.push({
        text: `Our model (these 30 days): sunlit ${Math.round(sp.metrics.sunPct)} %, Earth ${Math.round(sp.metrics.earthPct)} %, dark up to ${Math.round(sp.metrics.longestDarkH)} h`,
      });
      lines.push({ text: sp.why.summary, color: 'text2' });
    }
    const coarse = this.scene3?.tile.coarse === true;
    if (coarse) {
      lines.push({ text: COARSE_NOTE, color: 'text2', small: true });
    }
    const ovs: OverlayId[] = ['sun', 'earth', ...(coarse ? [] : ['slope' as const]), ...(this.scene3?.scoreMap ? ['score' as const] : []), 'off'];
    const short: Record<OverlayId, string> = { sun: 'Sunlight', earth: 'Earth', slope: 'Slope', score: 'Goldilocks', off: 'Off' };
    return {
      title: site?.name ?? '',
      subtitle: date,
      lines: [...lines, ...stats],
      rows: [
        [
          { id: 'orbit', label: 'Orbit' },
          { id: 'raised', label: this.mode === 'land' ? 'Stand here' : 'Raised view', primary: this.mode === 'land' },
          { id: 'enlarge', label: `Enlarge ${ENLARGE}x`, on: this.enlarge },
          { id: 'exit', label: 'Exit VR' },
        ],
        [{ id: 'why', label: 'Why here?' }, statsButton],
        ovs.map((o) => ({ id: `ov:${o}`, label: short[o], on: this.overlaySite === o })),
        ...presetRow,
        speedRow,
      ],
      timeFrac: this.tH / WINDOW_H,
      credits: CREDITS,
    };
  }

  // ------------------------------------------------------------------------------------------------ frame

  update(delta: number): void {
    this.frameNo++;
    // Ordinary objects use the near half of the depth range; terrain and sky write the far half (terrain.ts).
    this.renderer.getContext().depthRange(0, 0.5);
    if (this.mode === 'loading') {
      if (this.dirtyHud) {
        this.dirtyHud = false;
        this.hud.render(this.hudModel());
      }
      return;
    }
    if (this.playing) {
      this.tH += delta * this.speed;
      if (this.tH >= WINDOW_H) {
        this.tH = 0;
      }
    } else if (this.tour?.playFrom != null && this.mode === 'stand') {
      // Tour stop 4: the same two days, again and again.
      this.tH += delta * TOUR_PLAY_RATE;
      if (this.tH > this.tour.playFrom + TOUR_PLAY_H) {
        this.tH = this.tour.playFrom;
      }
    }
    const xr = this.inXR;
    const before = this.quality.meanMs;
    if (this.quality.sample(delta * 1000, xr)) {
      this.applyQuality();
    }
    if (this.quality.meanMs !== before) {
      const q = this.quality;
      this.statsText = `${q.fps.toFixed(0)} fps, ${q.meanMs.toFixed(1)} ms per frame. Detail: ${xr ? `${LEVELS[q.level].name} (automatic)` : 'full'}`;
      this.dirtyHud ||= this.showStats;
    }
    if (xr) {
      this.updateXRInput(delta);
    }
    this.updateFlight(delta);
    this.updateView();
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
    } else if (this.spot) {
      // Markers keep a constant apparent size; from the surface the ring and pin are hidden.
      const d = this.v1.copy(this.spot.pos).add(this.siteRoot.position).distanceTo(this.camPos);
      const far = this.mode === 'land';
      this.spotRing.visible = this.spotPin.visible = this.spotLabel.sprite.visible = far;
      this.siteLabel.sprite.visible = far && this.siteLabel.sprite.position.distanceTo(this.spot.pos) > d * 0.06;
      this.spotRing.scale.setScalar(Math.max(40, d * 0.012));
      this.hoverRing.scale.setScalar(Math.max(30, d * 0.009));
      this.spotPin.scale.setScalar(Math.max(60, d * 0.05));
      this.sunLine.line.visible = this.earthLine.line.visible = true;
    }
    if (this.dirtyHud) {
      this.dirtyHud = false;
      this.hud.render(this.hudModel());
    }
    if (xr) {
      this.panel.draw(this.panelModel());
    } else {
      this.hud.tick(this.dateLabel(), this.tH, this.playing, this.speed, this.mode === 'land' || this.mode === 'stand' ? this.status : null);
    }
  }
}
