// "Back to the top": an arrow in a circle, bottom right. Shows once the reader is more than a screen down a page
// that is at least two screens long.
import { useEffect, useState } from "react";

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => {
      const long = document.documentElement.scrollHeight > 2 * window.innerHeight;
      setShow(long && window.scrollY > window.innerHeight);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, []);
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <button type="button" className={show ? "to-top on" : "to-top"} aria-label="Back to the top" tabIndex={show ? 0 : -1}
      aria-hidden={!show} onClick={() => window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" })}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
