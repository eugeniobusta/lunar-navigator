/* PLAN opening: holographic Earth, pull back to the Moon, approach the south pole, then the real navigator.
 * Self-contained canvas prototype. No libraries, no network. Everything on screen is a pure function of one
 * number T (0..4), so Back and Reset always land on a clean state. Tune timings in CFG below. */
(() => {
  "use strict";

  /* ------------------------------ settings ------------------------------ */
  // Palette (HackAthlone site colours). Keep every colour here so scenes cannot drift.
  const PAL = { blue: "#0042A6", ink: "#111111", white: "#FFFFFF", yellow: "#EAFE07" };
  const BLUE = [0, 66, 166];

  const CFG = {
    // ms for each transition: 0 ready->1 Earth builds | 1->2 pull back to Moon | 2->3 approach south pole | 3->4 navigator
    durations: [5600, 5200, 5200, 6400],
    reducedMotionFadeMs: 380,
    demoUrl: "",                          // set to the live demo URL to show a discreet "Open demo" link on the last beat
    shot: "shots/orbit.png",              // supplied screenshot of the Orbit view (see README)
    shotSourceW: 1280, shotSourceH: 832,  // size the region boxes below were measured on
    shotCropTop: 104,                     // pixels removed from the top: macOS menu bar, window title bar and the emulator's Runtime/Editor overlay
    heading: "Lunar Landing Site Navigator",
    poleCaption: "LUNAR SOUTH POLE REGION",
    earthCenterLon: -8, earthCenterLat: 30,   // Ireland / Athlone side of the globe faces us
  };

  const W = 1920, H = 1080, F = 1500;          // logical stage and focal length
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const sm = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };       // smootherstep
  const eio = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------ small 3D kit ------------------------------ */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const matMul = (A, B) => { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; };
  const rotY = (b) => { const c = Math.cos(b), s = Math.sin(b); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rotX = (g) => { const c = Math.cos(g), s = Math.sin(g); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  // east = -z so (east x north = outward): a right-handed globe, not a mirror image
  const ll2v = (lon, lat) => { const p = lat * D2R, l = lon * D2R; return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)]; };

  function makeCam(P, T) {
    const f = norm(sub(T, P)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    return { P, f, r, u };
  }
  const mixCam = (A, B, t, tt = t) => makeCam(mix3(A.P, B.P, t), mix3(A.T, B.T, tt));

  /* ------------------------------ scene layout ------------------------------ */
  const EARTH = { c: [0, 0, 0], R: 6371 };
  // Moon placement is compressed and chosen for the camera move; it is NOT to scale (real mean distance is about 60 Earth radii).
  const MOON = { c: [-4200, -600, -62500], R: 1737 };
  // Earth faces the camera at the start; the Moon shows its near side toward Earth.
  const earthRot = (lon) => matMul(rotX(-CFG.earthCenterLat * D2R), rotY((90 - lon) * D2R));
  // Moon spin: nearside (the maria) turned toward the beat-2 camera so it reads as the Moon. Chosen for legibility, not as the view from Earth.
  MOON.M = null;
  const SUN = norm([0.55, 0.30, -0.78]);   // direction light comes from, for the Moon

  const CAMS = [
    { P: [0, 2000, -21500], T: [0, 0, 0] },                                // beat 1: Earth
    { P: [-1411, 874, -69462], T: [-12643, -6381, 2473] },                  // beat 2: pulled back; Earth upper-left and small, Moon lower-right (solved numerically)
    { P: [-3375, -3240, -64315], T: [-4200, -2250, -62500] },                 // beat 3: looking up at the south pole
  ];

  { const v = sub(CAMS[1].P, MOON.c); MOON.M = rotY(Math.atan2(-v[2], v[0])); }

  /* ------------------------------ geometry ------------------------------ */
  function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  const toVecs = (flat) => { const n = flat.length / 2, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = ll2v(flat[2 * i], flat[2 * i + 1]); a[3 * i] = v[0]; a[3 * i + 1] = v[1]; a[3 * i + 2] = v[2]; } return a; };
  const frag = (arr, t, d, w = 1) => ({ v: arr, n: arr.length / 3, t, d, w });

  // Earth
  const E = window.EARTH || { coast: [], inner: [] };
  const earth = {
    coast: E.coast.map((f) => frag(toVecs(f.p), f.t * 0.62, Math.max(0.02, f.d * 0.62))),
    inner: E.inner.map((f) => frag(toVecs(f.p), 0.42 + f.t * 0.5, 0.045)),
    grid: [],
  };
  (function gridLines(arr, step, extra) {
    for (let lon = -180; lon < 180; lon += step) { const p = []; for (let lat = -88; lat <= 88; lat += 4) p.push(lon, lat); arr.push(frag(toVecs(p), 0, 0.2)); }
    for (let lat = -75; lat <= 75; lat += step) { const p = []; for (let lon = -180; lon <= 180; lon += 4) p.push(lon, lat); arr.push(frag(toVecs(p), 0, 0.2)); }
  })(earth.grid, 15);

  // Moon (stylised: nearside maria as hatched fields, craters as broken rings. Not a lunar map.)
  const moon = { hatch: [], craters: [], rays: [], grid: [] };
  (function buildMoon() {
    const r = rng(77);
    const maria = [ // lon, lat, radius deg (approximate nearside positions, stylised)
      [-57, 18, 21, 1.0], [-16, 33, 16, 1], [18, 28, 8.5, 1], [31, 8, 10, 1], [59, 17, 6, 1], [52, -4, 8, 1],
      [34, -15, 5, 1], [-16, -21, 9, 1], [-39, -24, 5.5, 1], [-1, 56, 8, 0.9], [4, 41, 4.5, 0.9], [-30, 10, 4, 0.8],
    ];
    maria.forEach(([lon, lat, rad, k], mi) => {
      const rows = Math.round(rad * 1.5);
      for (let j = -rows; j <= rows; j++) {
        const dy = (j / rows) * rad; const half = Math.sqrt(Math.max(0, rad * rad - dy * dy)) * (0.82 + 0.25 * r());
        if (half < 0.4) continue;
        const c = Math.max(0.3, Math.cos((lat + dy) * D2R));
        let x = -half;
        while (x < half) {
          const seg = 0.8 + r() * 2.4; const x2 = Math.min(half, x + seg);
          const p = [lon + x / c, lat + dy, lon + x2 / c, lat + dy];
          moon.hatch.push(frag(toVecs(p), r() * 0.55 + mi * 0.01, 0.12));
          x = x2 + 0.35 + r() * 0.8;
        }
      }
    });
    const named = [ // lon, lat, radius deg, rays
      [-11.4, -43.3, 2.6, 1], [-20, 9.6, 1.9, 1], [-38, 8, 1.4, 0], [-47.4, 23.7, 1.4, 1], [-9.4, 51.6, 1.9, 0], [-14.4, -58.8, 3.4, 0], [3.2, 26.1, 1.1, 0],
    ];
    const ring = (lon, lat, rad, t) => {
      const n = ll2v(lon, lat); const e1 = norm(cross(n, [0, 1, 0.001])), e2 = cross(n, e1);
      const pts = (a0, a1) => { const a = []; for (let k = 0; k <= 9; k++) { const th = lerp(a0, a1, k / 9); const v = [0, 1, 2].map((i) => n[i] * Math.cos(rad * D2R) + Math.sin(rad * D2R) * (Math.cos(th) * e1[i] + Math.sin(th) * e2[i])); a.push(v[0], v[1], v[2]); } return new Float32Array(a); };
      let a0 = r() * TAU;
      for (let s = 0; s < 3; s++) { const span = 0.9 + r() * 1.1; moon.craters.push(frag(pts(a0, a0 + span), t, 0.1)); a0 += span + 0.5 + r() * 0.7; }
    };
    named.forEach(([lon, lat, rad, rays], i) => {
      ring(lon, lat, rad, 0.3 + r() * 0.5);
      ring(lon, lat, rad * 0.45, 0.4 + r() * 0.5);
      if (rays) for (let k = 0; k < (i === 0 ? 22 : 7); k++) {
        const ang = r() * TAU, l0 = rad * 1.3, l1 = rad * (2.5 + r() * (i === 0 ? 7 : 3));
        const n = ll2v(lon, lat); const e1 = norm(cross(n, [0, 1, 0.001])), e2 = cross(n, e1);
        const pt = (L) => [0, 1, 2].map((q) => n[q] * Math.cos(L * D2R) + Math.sin(L * D2R) * (Math.cos(ang) * e1[q] + Math.sin(ang) * e2[q]));
        const a = pt(l0), b = pt((l0 + l1) / 2), c = pt(l1);
        moon.rays.push(frag(new Float32Array([...a, ...b, ...c]), 0.5 + r() * 0.4, 0.1));
      }
    });
    for (let i = 0; i < 170; i++) { // small craters, anywhere
      const lon = (r() - 0.5) * 360, lat = Math.asin(r() * 2 - 1) / D2R, rad = 0.5 + Math.pow(r(), 3) * 3.2;
      ring(lon, lat, rad, r());
    }
    (function g(arr) {
      for (let lon = -180; lon < 180; lon += 30) { const p = []; for (let lat = -88; lat <= 88; lat += 4) p.push(lon, lat); arr.push(frag(toVecs(p), 0, 0.2)); }
      for (let lat = -60; lat <= 60; lat += 30) { const p = []; for (let lon = -180; lon <= 180; lon += 4) p.push(lon, lat); arr.push(frag(toVecs(p), 0, 0.2)); }
    })(moon.grid);
  })();

  // South-pole survey: concentric latitude arcs, spokes, a few contour-like lines, one focus marker. Illustrative only.
  const pole = { rings: [], spokes: [], contours: [], marker: [] };
  (function buildPole() {
    const r = rng(9);
    const dashed = (lon0, lon1, lat, step, outArr, t, dseg = 5) => {
      for (let lon = lon0; lon < lon1; lon += step) {
        const l2 = lon + step * (0.55 + r() * 0.3); const p = []; for (let q = 0; q <= 4; q++) p.push(lerp(lon, l2, q / 4), lat);
        outArr.push(frag(toVecs(p), t + r() * 0.35, 0.12));
      }
    };
    for (let k = 1; k <= 7; k++) dashed(-180, 180, -90 + k * 2.2, 11 - k * 0.7, pole.rings, k * 0.07);
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -89.5; lat < -74; lat += 3.2) { const p = [lon, lat, lon, lat + 1.9]; pole.spokes.push(frag(toVecs(p), 0.1 + (lat + 90) * 0.04 + r() * 0.2, 0.1)); }
    }
    // marching-squares contours of smooth noise in a polar-stereographic plane
    const NGR = 9, vals = Array.from({ length: NGR * NGR }, () => r());
    const noise = (x, y) => { const gx = (x * 0.5 + 0.5) * (NGR - 1), gy = (y * 0.5 + 0.5) * (NGR - 1); const xi = clamp(Math.floor(gx), 0, NGR - 2), yi = clamp(Math.floor(gy), 0, NGR - 2); const fx = sm(gx - xi), fy = sm(gy - yi); const g = (a, b) => vals[(yi + b) * NGR + xi + a]; return lerp(lerp(g(0, 0), g(1, 0), fx), lerp(g(0, 1), g(1, 1), fx), fy); };
    const N = 70, RMAX = 13; // degrees of latitude covered
    const f = (i, j) => { const x = (i / N) * 2 - 1, y = (j / N) * 2 - 1; return Math.hypot(x, y) > 1 ? -1 : noise(x, y); };
    const toLL = (x, y) => [(Math.atan2(y, x) / D2R), -90 + Math.hypot(x, y) * RMAX];
    [0.38, 0.5, 0.62].forEach((th, ti) => {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = f(i, j), b = f(i + 1, j), c = f(i + 1, j + 1), d = f(i, j + 1);
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        const pts = []; const edge = (p, q, vp, vq, xp, yp, xq, yq) => { if ((vp < th) !== (vq < th)) { const t = (th - vp) / (vq - vp); pts.push([lerp(xp, xq, t), lerp(yp, yq, t)]); } };
        const x0 = (i / N) * 2 - 1, x1 = ((i + 1) / N) * 2 - 1, y0 = (j / N) * 2 - 1, y1 = ((j + 1) / N) * 2 - 1;
        edge(0, 1, a, b, x0, y0, x1, y0); edge(1, 2, b, c, x1, y0, x1, y1); edge(2, 3, c, d, x1, y1, x0, y1); edge(3, 0, d, a, x0, y1, x0, y0);
        if (pts.length >= 2 && r() > 0.22) {
          const p = [...toLL(pts[0][0], pts[0][1]), ...toLL(pts[1][0], pts[1][1])];
          pole.contours.push(frag(toVecs(p), 0.15 + r() * 0.6, 0.1));
        }
      }
    });
    // focus marker: brackets and cross at an arbitrary spot near the pole (no real site implied)
    const mLon = 38, mLat = -87.2; const n = ll2v(mLon, mLat);
    const e1 = norm(cross(n, [0, 0, 1])), e2 = cross(n, e1);
    const at = (a, b) => { const v = [0, 1, 2].map((q) => n[q] + a * e1[q] + b * e2[q]); const l = Math.hypot(...v); return v.map((x) => x / l); };
    const S = 0.022, Lb = 0.008;
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], k) => {
      const p = [...at(sx * S, sy * (S - Lb)), ...at(sx * S, sy * S), ...at(sx * (S - Lb), sy * S)];
      pole.marker.push(frag(new Float32Array(p), 0.55 + k * 0.03, 0.1, 1.6));
    });
    pole.marker.push(frag(new Float32Array([...at(-0.007, 0), ...at(-0.0025, 0)]), 0.7, 0.1, 1.4), frag(new Float32Array([...at(0.0025, 0), ...at(0.007, 0)]), 0.7, 0.1, 1.4),
      frag(new Float32Array([...at(0, -0.007), ...at(0, -0.0025)]), 0.7, 0.1, 1.4), frag(new Float32Array([...at(0, 0.0025), ...at(0, 0.007)]), 0.7, 0.1, 1.4));
    pole.markerPos = n;
  })();

  // stars (static, dim)
  const stars = (() => { const r = rng(5), a = []; for (let i = 0; i < 260; i++) a.push([r() * W, r() * H, 0.4 + r() * 1.1, 0.15 + r() * 0.5]); return a; })();

  /* ------------------------------ canvas ------------------------------ */
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  let scale = 1;
  function resize() {
    const wrap = document.getElementById("wrap");
    const w = Math.min(innerWidth, (innerHeight * 16) / 9), h = (w * 9) / 16;
    wrap.style.width = w + "px"; wrap.style.height = h + "px";
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    scale = canvas.width / W;
    dirty = true;
  }
  let dirty = true;

  /* ------------------------------ line batching ------------------------------ */
  const LV = 7;
  let body, core, glow, hot;
  const newBatch = () => { body = Array.from({ length: LV }, () => new Path2D()); core = Array.from({ length: LV }, () => new Path2D()); hot = Array.from({ length: 3 }, () => new Path2D()); };
  let used = false;
  function flush(widthK = 1) {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let l = 0; l < LV; l++) {
      const a = (l + 0.6) / LV;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(BLUE, a * 0.17); ctx.lineWidth = 7 * widthK; ctx.stroke(body[l]);
      ctx.strokeStyle = rgba(BLUE, a); ctx.lineWidth = 2.1 * widthK; ctx.stroke(body[l]); ctx.stroke(body[l]);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = rgba([255, 255, 255], a * 0.5); ctx.lineWidth = 0.85 * widthK; ctx.stroke(core[l]);
    }
    for (let h = 0; h < 3; h++) { ctx.strokeStyle = rgba([255, 255, 255], (h + 1) / 3); ctx.lineWidth = 1.7 * widthK; ctx.stroke(hot[h]); }
  }

  /* ------------------------------ sphere drawing ------------------------------ */
  let CAM, SC; // current camera, sphere context
  const outp = [0, 0];
  function sphereCtx(S, cam) {
    const cs = sub(cam.P, S.c), d = len(cs);
    return { S, cam, cu: [cs[0] / d, cs[1] / d, cs[2] / d], k: S.R / d, d, M: S.M };
  }
  function drawFrags(SCx, frags, p, opts = {}) {
    const { S, cam, cu, k, M } = SCx;
    const { light = false, alpha = 1, minAlpha = 0, instant = false, dim = 1, w = 1 } = opts;
    const px = cam.P[0], py = cam.P[1], pz = cam.P[2];
    const R = S.R, cx = S.c[0], cy = S.c[1], cz = S.c[2];
    for (let fi = 0; fi < frags.length; fi++) {
      const fr = frags[fi];
      const pp = p * 1.1;   // headroom so every stroke has finished (and its flash faded) once p reaches 1
      let frac = instant ? 1 : clamp((pp - fr.t) / fr.d);
      if (frac <= 0) continue;
      const nseg = fr.n - 1; if (nseg < 1) continue;
      const showSeg = Math.max(1, Math.ceil(frac * nseg));
      const settle = instant ? 0 : clamp(1 - (pp - (fr.t + fr.d)) / 0.07); // hot flash after it completes
      let prevOk = false, sx0 = 0, sy0 = 0, f0 = 0, l0 = 0;
      for (let i = 0; i <= showSeg; i++) {
        const o = i * 3, nx = fr.v[o], ny = fr.v[o + 1], nz = fr.v[o + 2];
        const wx = M[0] * nx + M[1] * ny + M[2] * nz, wy = M[3] * nx + M[4] * ny + M[5] * nz, wz = M[6] * nx + M[7] * ny + M[8] * nz;
        const f = wx * cu[0] + wy * cu[1] + wz * cu[2];
        const vx = cx + R * wx - px, vy = cy + R * wy - py, vz = cz + R * wz - pz;
        const z = vx * cam.f[0] + vy * cam.f[1] + vz * cam.f[2];
        if (f <= k || z < 50) { prevOk = false; continue; }
        const X = W / 2 + (F * (vx * cam.r[0] + vy * cam.r[1] + vz * cam.r[2])) / z, Y = H / 2 - (F * (vx * cam.u[0] + vy * cam.u[1] + vz * cam.u[2])) / z;
        const lit = light ? clamp(wx * SUN[0] + wy * SUN[1] + wz * SUN[2]) : 1;
        const L = light ? 0.2 + 0.8 * sm(lit * 1.7) : 1;
        if (prevOk) {
          const fm = Math.min(f, f0), depth = clamp((fm - k) / (0.4 * (1 - k)));
          const a = clamp(alpha * dim * (0.28 + 0.72 * depth) * Math.min(L, l0 || L) * (fr.w > 1 ? 1.15 : 1));
          if (a > 0.012) {
            const bi = Math.min(LV - 1, (a * LV) | 0);
            const last = i === showSeg && frac < 1;
            if (last && !instant) { const hp = hot[2]; hp.moveTo(sx0, sy0); hp.lineTo(X, Y); }
            else {
              body[bi].moveTo(sx0, sy0); body[bi].lineTo(X, Y);
              if (depth > 0.25) { core[bi].moveTo(sx0, sy0); core[bi].lineTo(X, Y); }
              if (settle > 0.02) { const hp = hot[settle > 0.66 ? 2 : settle > 0.33 ? 1 : 0]; hp.moveTo(sx0, sy0); hp.lineTo(X, Y); }
            }
          }
        }
        prevOk = true; sx0 = X; sy0 = Y; f0 = f; l0 = L;
      }
    }
  }
  function globeEdge(SCx, a, widthK = 1) {
    const { S, cam, d, k } = SCx; if (a <= 0) return;
    const v = sub(S.c, cam.P); const z = dot(v, cam.f); if (z < 50) return;
    const X = W / 2 + (F * dot(v, cam.r)) / z, Y = H / 2 - (F * dot(v, cam.u)) / z;
    const rad = (F * S.R) / Math.sqrt(Math.max(1, d * d - S.R * S.R));
    if (rad < 4 || rad > 9000) return;
    const g = ctx.createRadialGradient(X, Y, rad * 0.9, X, Y, rad * 1.07);
    g.addColorStop(0, rgba(BLUE, 0)); g.addColorStop(0.55, rgba(BLUE, 0.2 * a)); g.addColorStop(1, rgba(BLUE, 0));
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, rad * 1.07, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba([255, 255, 255], 0.5 * a); ctx.beginPath(); ctx.arc(X, Y, rad, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(BLUE, 0.9 * a); ctx.globalCompositeOperation = "lighter"; ctx.beginPath(); ctx.arc(X, Y, rad, 0, TAU); ctx.stroke(); ctx.restore();
    return { X, Y, rad };
  }
  const batch = (fn, widthK) => { newBatch(); fn(); flush(widthK); };

  /* ------------------------------ screenshot ------------------------------ */
  const shot = { img: new Image(), ok: false };
  shot.img.onload = () => { shot.ok = true; dirty = true; };
  shot.img.src = CFG.shot;
  // regions measured on the 1280x832 screenshot: [x0,y0,x1,y1]
  const REG = { map: [285, 0, 1280, 720], panel: [0, 0, 285, 720], bar: [0, 720, 1280, 832] };

  function drawShot(u) {
    const sw = shot.ok ? shot.img.naturalWidth : CFG.shotSourceW, sh = shot.ok ? shot.img.naturalHeight : CFG.shotSourceH;
    const kx = sw / CFG.shotSourceW, ky = sh / CFG.shotSourceH;
    const top = CFG.shotCropTop, cropH = CFG.shotSourceH - top;
    const dw = 1360, dh = (dw * cropH) / CFG.shotSourceW, dx = (W - dw) / 2, dy = 176;
    const kd = dw / CFG.shotSourceW;
    const stage = (a, b) => sm((u - a) / (b - a));
    const sMap = stage(0.16, 0.46), sPan = stage(0.44, 0.7), sBar = stage(0.66, 0.9);
    const region = (name, s, ox, oy) => {
      if (s <= 0.001) return;
      let [x0, y0, x1, y1] = REG[name]; y0 = Math.max(y0, top);
      const rx = dx + x0 * kd + ox * (1 - s), ry = dy + (y0 - top) * kd + oy * (1 - s), rw = (x1 - x0) * kd, rh = (y1 - y0) * kd;
      ctx.save(); ctx.globalAlpha = s;
      ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
      if (shot.ok) ctx.drawImage(shot.img, x0 * kx, y0 * ky, (x1 - x0) * kx, (y1 - y0) * ky, rx, ry, rw, rh);
      else {
        ctx.fillStyle = name === "map" ? "#1b1b1b" : "#161616"; ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = rgba(BLUE, 0.9); ctx.setLineDash([10, 8]); ctx.lineWidth = 2; ctx.strokeRect(rx + 6, ry + 6, rw - 12, rh - 12); ctx.setLineDash([]);
        ctx.fillStyle = rgba([255, 255, 255], 0.75); ctx.font = "600 22px 'Fira Sans','Helvetica Neue',Arial,sans-serif"; ctx.textAlign = "center";
        ctx.fillText(name === "map" ? "PLACEHOLDER: map view" : name === "panel" ? "PLACEHOLDER: site list" : "PLACEHOLDER: time controls", rx + rw / 2, ry + rh / 2 - 8);
        ctx.font = "16px 'Helvetica Neue',Arial,sans-serif"; ctx.fillStyle = rgba([255, 255, 255], 0.5);
        ctx.fillText("drop shots/orbit.png next to index.html", rx + rw / 2, ry + rh / 2 + 22);
      }
      ctx.restore();
    };
    ctx.save();
    // frame
    const fa = stage(0.08, 0.3);
    ctx.globalAlpha = fa * 0.9; ctx.strokeStyle = rgba(BLUE, 1); ctx.lineWidth = 2; ctx.strokeRect(dx - 10, dy - 10, dw + 20, dh + 20);
    ctx.globalAlpha = fa * 0.5; ctx.strokeStyle = rgba([255, 255, 255], 1); ctx.lineWidth = 1; ctx.strokeRect(dx - 10.5, dy - 10.5, dw + 21, dh + 21);
    ctx.globalAlpha = 1;
    region("map", sMap, 0, 24); region("panel", sPan, -48, 0); region("bar", sBar, 0, 40);
    ctx.restore();
  }

  /* ------------------------------ frame ------------------------------ */
  function camAt(T) {
    if (T <= 1) return makeCam(CAMS[0].P, CAMS[0].T);
    if (T <= 2) { const t = sm(T - 1); return mixCam(CAMS[0], CAMS[1], t, sm((t - 0.5) / 0.5)); }   // pull back first, then yaw toward the Moon
    if (T <= 3) { const t = sm(T - 2); return mixCam(CAMS[1], CAMS[2], t); }
    return makeCam(CAMS[2].P, CAMS[2].T);
  }
  function drawText(txt, x, y, font, color, a, spacing = 0, align = "left") {
    if (a <= 0.003) return;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = spacing + "px";
    ctx.fillText(txt, x, y); ctx.restore();
  }

  function render(T, now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const u1 = clamp(T), u2 = clamp(T - 1), u3 = clamp(T - 2), u4 = clamp(T - 3);

    // sparse stars
    const sa = sm(u1 * 2.5) * (1 - 0.6 * sm(u3 * 2));
    if (sa > 0.01) { ctx.save(); for (const s of stars) { ctx.globalAlpha = s[3] * sa; ctx.fillStyle = "#fff"; ctx.fillRect(s[0], s[1], s[2], s[2]); } ctx.restore(); }

    const cam = camAt(T);
    const amb = Math.sin(now / 9000) * 2.6;   // subtle ambient drift, degrees
    const pE = T >= 1 ? 1 : Math.sin(u1 * Math.PI / 2);             // Earth build progress
    const Es = { c: EARTH.c, R: EARTH.R, M: earthRot(CFG.earthCenterLon + amb) };
    const Ms = { c: MOON.c, R: MOON.R, M: MOON.M };
    const dE = len(sub(cam.P, Es.c)), dM = len(sub(cam.P, Ms.c));
    const order = dE > dM ? ["E", "M"] : ["M", "E"];

    for (const which of order) {
      if (which === "E") {
        if (u1 <= 0) continue;
        const sc = sphereCtx(Es, cam);
        const dim = T <= 1 ? 1 : lerp(1, 0.55, sm(u2));
        const outAlpha = 1 - sm((u3 - 0.1) / 0.5);
        if (outAlpha <= 0.01) continue;
        const gA = sm(u1 * 1.6) * outAlpha * dim;
        const edge = pE > 0.05 ? sm((pE - 0.05) / 0.4) * outAlpha * (T > 1 ? 0.7 : 1) : 0;
        globeEdge(sc, edge);
        batch(() => drawFrags(sc, earth.grid, 1, { alpha: 0.13 * gA, instant: true }), 0.8);
        batch(() => { drawFrags(sc, earth.coast, pE, { alpha: dim * outAlpha }); drawFrags(sc, earth.inner, pE, { alpha: 0.9 * dim * outAlpha }); }, 1);
      } else {
        const mAppear = T < 1 ? 0 : sm((u2 - 0.55) / 0.3);
        if (mAppear <= 0.001 && T < 3) continue;
        const sc = sphereCtx(Ms, cam);
        const pM = T >= 2 ? 1 : sm((u2 - 0.6) / 0.4);
        const a = T >= 2 ? 1 : sm((u2 - 0.58) / 0.3);
        globeEdge(sc, a * 0.85);
        batch(() => drawFrags(sc, moon.grid, 1, { alpha: 0.1 * a, instant: true, light: true }), 0.8);
        batch(() => {
          drawFrags(sc, moon.hatch, pM, { alpha: 0.5 * a, light: true });
          drawFrags(sc, moon.craters, pM, { alpha: 0.8 * a, light: true });
          drawFrags(sc, moon.rays, pM, { alpha: 0.22 * a, light: true });
        }, 0.95);
        if (T > 2) {
          const pS = sm((u3 - 0.35) / 0.6), sA = 1 - sm((u4) / 0.35);
          if (pS > 0 && sA > 0.01) batch(() => {
            const o = { alpha: 0.95 * sA, light: false, dim: 1 };
            drawFrags(sc, pole.rings, pS, o); drawFrags(sc, pole.spokes, pS, { alpha: 0.7 * sA });
            drawFrags(sc, pole.contours, pS, { alpha: 0.75 * sA });
            drawFrags(sc, pole.marker, clamp((pS - 0.3) / 0.7) * 1.0, { alpha: 1 * sA });
          }, 1);
          if (pS > 0.6 && sA > 0.01) { // tiny yellow focus point
            const n = pole.markerPos, wv = [0, 1, 2].map((i) => Ms.c[i] + Ms.R * (Ms.M[i * 3] * n[0] + Ms.M[i * 3 + 1] * n[1] + Ms.M[i * 3 + 2] * n[2]));
            const v = sub(wv, cam.P), z = dot(v, cam.f);
            if (z > 50) { const X = W / 2 + (F * dot(v, cam.r)) / z, Y = H / 2 - (F * dot(v, cam.u)) / z; const pulse = 0.5 + 0.5 * Math.sin(now / 520);
              ctx.save(); ctx.globalAlpha = sm((pS - 0.6) / 0.4) * sA; ctx.fillStyle = PAL.yellow; ctx.beginPath(); ctx.arc(X, Y, 3.2 + pulse * 0.8, 0, TAU); ctx.fill(); ctx.restore(); }
          }
        }
      }
    }

    // beat 3 caption
    drawText(CFG.poleCaption, 120, 960, "600 22px 'Fira Sans','Helvetica Neue',Arial,sans-serif", PAL.white, 0.75 * sm((u3 - 0.7) / 0.3) * (1 - sm(u4 / 0.25)), 5);

    // beat 4: interface
    if (T > 3) {
      ctx.save(); ctx.fillStyle = PAL.ink; ctx.globalAlpha = 0.93 * sm(u4 / 0.5); ctx.fillRect(0, 0, W, H); ctx.restore();
      drawText(CFG.heading, 120, 112, "600 46px 'Fira Sans','Overpass','Helvetica Neue',Arial,sans-serif", PAL.white, sm((u4 - 0.04) / 0.2), 0.5);
      drawShot(u4);
    }
  }

  /* ------------------------------ presenter control ------------------------------ */
  let T = 0, beat = 0, locked = false, anim = null, fade = 0, clock = null;
  const nowMs = () => (clock === null ? performance.now() : clock);   // clock is only set by tests
  const hud = {};
  function setBeat(b) { beat = b; for (const el of document.querySelectorAll(".dot")) el.classList.toggle("on", +el.dataset.b <= b); updateButtons(); }
  function updateButtons() {
    hud.back.disabled = beat === 0 && !anim; hud.next.disabled = beat === 4 && !anim;
    hud.demo.style.display = CFG.demoUrl && beat === 4 && !anim ? "" : "none";
    document.getElementById("hint").classList.toggle("gone", beat > 0 || !!anim);
  }
  function go(to) {
    if (locked || to < 0 || to > 4 || to === beat) return;
    locked = true;
    const from = beat;
    const dur = CFG.durations[Math.min(from, to)];
    if (reduced) { anim = { type: "fade", to, t0: nowMs(), dur: CFG.reducedMotionFadeMs }; }
    else anim = { type: "move", from: T, to, t0: nowMs(), dur };
    updateButtons();
  }
  const advance = () => go(beat + 1), back = () => go(beat - 1);
  function reset() {
    anim = null; locked = false; fade = 0; T = 0; setBeat(0); dirty = true;
  }
  function frame(now) {
    if (anim) {
      if (anim.type === "move") {
        const p = clamp((now - anim.t0) / anim.dur);
        T = lerp(anim.from, anim.to, p);
        if (p >= 1) { T = anim.to; setBeat(anim.to); anim = null; locked = false; updateButtons(); }
      } else {
        const p = clamp((now - anim.t0) / anim.dur);
        fade = p < 0.5 ? p * 2 : 2 - p * 2;
        if (p >= 0.5 && T !== anim.to) T = anim.to;
        if (p >= 1) { setBeat(anim.to); anim = null; locked = false; fade = 0; updateButtons(); }
      }
    }
    render(T, now);
    if (fade > 0.001) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = PAL.ink; ctx.globalAlpha = fade; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; }
  }
  function tick(now) { frame(now); requestAnimationFrame(tick); }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  }
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " || e.key === "ArrowRight") { e.preventDefault(); if (!e.repeat) advance(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (!e.repeat) back(); }
    else if (e.key === "r" || e.key === "R") { if (!e.repeat) reset(); }
    else if (e.key === "f" || e.key === "F") { if (!e.repeat) toggleFullscreen(); }
  });
  addEventListener("resize", resize);

  // controls: discreet, fade away when the mouse is still
  hud.back = document.getElementById("b-back"); hud.next = document.getElementById("b-next");
  hud.demo = document.getElementById("b-demo");
  document.getElementById("b-back").onclick = back; document.getElementById("b-next").onclick = advance;
  document.getElementById("b-reset").onclick = reset; document.getElementById("b-full").onclick = toggleFullscreen;
  hud.demo.onclick = () => window.open(CFG.demoUrl, "_blank", "noopener");
  const ctrls = document.getElementById("controls"); let hideT;
  addEventListener("mousemove", () => { ctrls.classList.add("show"); clearTimeout(hideT); hideT = setTimeout(() => ctrls.classList.remove("show"), 2200); });

  resize(); setBeat(0);
  requestAnimationFrame(tick);

  // test hook (also handy for rehearsal): INTRO.state(), INTRO.jump(beat) for an instant clean jump
  window.INTRO = { CFG, frame, setClock: (v) => { clock = v; }, state: () => ({ T, beat, locked }), jump: (b) => { anim = null; locked = false; fade = 0; T = b; setBeat(b); }, advance, back, reset };
})();
