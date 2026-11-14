// Width of a chart's container in CSS pixels, so charts draw at real size and text never shrinks on a phone.
import { useEffect, useState } from "react";

/** Returns [ref, width]. The ref is a callback ref, so it also works when the element appears after a loading state. */
export function useWidth<T extends HTMLElement>(initial = 1000, min = 300) {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    if (!el) return;
    const measure = () => setWidth(Math.max(min, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, min]);
  return [setEl, width] as const;
}
