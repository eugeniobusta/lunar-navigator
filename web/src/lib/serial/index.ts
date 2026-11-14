// MoonBox Web Serial link (owner: Ahmed). Protocol: docs/INTERFACES.md section 7.
// Lines: "SUN,<az>,<el>,<frac>"  "EARTH,<az>,<el>,<vis>"  "HELLO" -> board replies "MOONBOX,<version>".
export const MOONBOX_BAUD = 115200;
export const MOONBOX_MAX_HZ = 20;
