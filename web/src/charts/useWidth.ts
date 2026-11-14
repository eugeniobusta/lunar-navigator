// Width of a chart's container in CSS pixels, so charts draw at real size and text never shrinks on a phone.
import { useEffect, useRef, useState } from "react";

export function useWidth<T extends HTMLElement>(initial = 1000, min = 300) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(min, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width] as const;
}
