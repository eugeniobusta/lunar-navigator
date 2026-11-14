// Relief shading (homepage art): known answers on flat and tilted planes.
import { describe, expect, it } from "vitest";
import type { HeightGrid } from "./demHorizon";
import { downsample, shade, sunVector, surfaceNormals } from "./relief";

/** A size x size plane z = a*x + b*y (x east = +column, y north = -row), pixel 100 m. */
function plane(size: number, a: number, b: number): Float32Array {
  const h = new Float32Array(size * size);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) h[r * size + c] = a * c * 100 + b * -r * 100;
  return h;
}

describe("relief shading", () => {
  it("the Sun vector: azimuth clockwise from +y, elevation up from the ground", () => {
    const [x, y, z] = sunVector(90, 0);
    expect(x).toBeCloseTo(1, 12); expect(y).toBeCloseTo(0, 12); expect(z).toBeCloseTo(0, 12);
    expect(sunVector(0, 90)[2]).toBeCloseTo(1, 12);
    expect(sunVector(180, 30)[1]).toBeCloseTo(-Math.cos(Math.PI / 6), 12);
  });

  it("flat ground: brightness is sin(elevation) whatever the azimuth", () => {
    const n = surfaceNormals(plane(5, 0, 0), 5, 100);
    const out = new Float32Array(25);
    for (const az of [0, 77, 200]) {
      shade(n, az, 30, out);
      for (const v of out) expect(v).toBeCloseTo(0.5, 6);
    }
  });

  it("a 45 deg slope rising to the east: lit fully by a Sun 45 deg up in the west, dark with the Sun in the east", () => {
    // z = x: the slope faces west (its normal is (-1, 0, 1) / sqrt 2).
    const n = surfaceNormals(plane(5, 1, 0), 5, 100);
    expect(n[0]).toBeCloseTo(-Math.SQRT1_2, 6); expect(n[2]).toBeCloseTo(Math.SQRT1_2, 6);
    const out = new Float32Array(25);
    shade(n, 270, 45, out);
    for (const v of out) expect(v).toBeCloseTo(1, 6);
    shade(n, 90, 30, out);
    for (const v of out) expect(v).toBe(0);
  });

  it("a slope rising to the north faces south; exaggeration steepens it", () => {
    const n = surfaceNormals(plane(4, 0, 0.5), 4, 100, 2); // z = 0.5 y, doubled: slope 1, 45 deg
    expect(n[1]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(n[2]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("downsampling averages blocks and keeps the extent", () => {
    const g: HeightGrid = { size: 4, pixelM: 10, xMinM: 0, yMaxM: 40, heightMinM: 0, heightMaxM: 65535,
      data: new Uint16Array([0, 2, 4, 6, 2, 4, 6, 8, 10, 10, 0, 0, 10, 10, 0, 0]) };
    const d = downsample(g, 2);
    expect(d.size).toBe(2);
    expect(d.pixelM).toBe(20);
    expect(Array.from(d.h)).toEqual([2, 6, 10, 0]);
  });
});
