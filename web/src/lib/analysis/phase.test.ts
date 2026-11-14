// Earth's phase seen from the Moon: known answers.
import { describe, expect, it } from "vitest";
import { earthLitFraction, litPath, separationDeg } from "./phase";

describe("Earth's phase from the Moon", () => {
  it("separation on the sky", () => {
    expect(separationDeg(0, 0, 90, 0)).toBeCloseTo(90, 9);
    expect(separationDeg(10, 0, 190, 0)).toBeCloseTo(180, 9);
    expect(separationDeg(123, 90, 0, 0)).toBeCloseTo(90, 9);
    expect(separationDeg(45, 30, 45, 30)).toBeCloseTo(0, 6);
  });
  it("lit fraction: full with the Sun behind you, new beside the Sun, half at 90 degrees", () => {
    expect(earthLitFraction(180, 0, 0, 0)).toBeCloseTo(1, 9);
    expect(earthLitFraction(0, 1, 0, 1)).toBeCloseTo(0, 9);
    expect(earthLitFraction(90, 0, 0, 0)).toBeCloseTo(0.5, 9);
  });
  it("lit shape: half disc at quarter phase, crescent and gibbous bulge on opposite sides", () => {
    expect(litPath(10, 0.5)).toBe("M0 -10A10 10 0 0 1 0 10A0 10 0 0 1 0 -10Z");
    expect(litPath(10, 0.25)).toBe("M0 -10A10 10 0 0 1 0 10A5 10 0 0 0 0 -10Z");
    expect(litPath(10, 0.75)).toBe("M0 -10A10 10 0 0 1 0 10A5 10 0 0 1 0 -10Z");
    expect(litPath(10, 1)).toBe("M0 -10A10 10 0 0 1 0 10A10 10 0 0 1 0 -10Z");
  });
});
