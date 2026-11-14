// The one icon set of the app: 16 px line icons, 1.5 px stroke, drawn in the current text colour.
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Chevron = ({ open }: { open: boolean }) => <svg {...base}><path d={open ? "M3.5 10L8 5.5l4.5 4.5" : "M3.5 6L8 10.5 12.5 6"} /></svg>;
export const Sky = () => <svg {...base}><path d="M1.5 12.5h13M3 12.5a5 5 0 0110 0" /><path d="M8 3V1.5M3 5l-1-1M13 5l1-1" /></svg>;
export const Calendar = () => <svg {...base}><rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M5 1.5v3M11 1.5v3" /></svg>;
export const Compare = () => <svg {...base}><path d="M2 4.5h9M8.5 2L11 4.5 8.5 7M14 11.5H5M7.5 9L5 11.5 7.5 14" /></svg>;
export const Cube = () => <svg {...base}><path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7zM8 8l5.5-3.5M8 8L2.5 4.5M8 8v6.5" /></svg>;
export const Arrow = () => <svg {...base}><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
export const Home = () => <svg {...base}><circle cx="8" cy="8" r="5.5" /><path d="M8 1v3M8 12v3M1 8h3M12 8h3" /></svg>;
