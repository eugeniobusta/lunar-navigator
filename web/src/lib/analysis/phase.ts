// Earth's phase as seen from the Moon, for drawing Earth in the sky panorama.
// From the Moon, Earth is lit on the side facing the Sun. Its phase angle is 180 deg minus the elongation (the angle
// between the Sun and Earth on the observer's sky), so the lit fraction of the disc is (1 - cos(elongation)) / 2:
// full Earth when the Sun is behind the observer (elongation 180), new Earth when Earth is next to the Sun.
const D2R = Math.PI / 180;

/** Angle (deg) between two directions given as azimuth / elevation in degrees. */
export function separationDeg(az1: number, el1: number, az2: number, el2: number): number {
  const c = Math.sin(el1 * D2R) * Math.sin(el2 * D2R) + Math.cos(el1 * D2R) * Math.cos(el2 * D2R) * Math.cos((az1 - az2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
}

/** Lit fraction 0..1 of Earth's disc seen from the Moon, from the Sun's and Earth's azimuth and elevation. */
export function earthLitFraction(sunAz: number, sunEl: number, earthAz: number, earthEl: number): number {
  return (1 - Math.cos(separationDeg(sunAz, sunEl, earthAz, earthEl) * D2R)) / 2;
}

/** SVG path of the lit part of a disc of radius r centred on (0, 0), with the Sun towards +x (screen y down).
 *  The limb on the Sun's side, then back along the terminator, an ellipse of half-width r * |1 - 2f|. */
export function litPath(r: number, f: number): string {
  const k = Math.max(0, Math.min(1, f));
  const rx = r * Math.abs(1 - 2 * k);
  // Crescent (k < 0.5): the terminator bulges towards the Sun; gibbous: away from it.
  const sweep = k < 0.5 ? 0 : 1;
  return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${sweep} 0 ${-r}Z`;
}
