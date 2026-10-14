"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Horizontal product rail that advances by one card every few seconds and loops back to the start.
 * Stops while the visitor hovers, touches or focuses inside it, when the tab is hidden, when everything already
 * fits, and entirely for visitors who ask for reduced motion. Manual swiping keeps working.
 */
export function AutoRail({ children, intervalMs = 3500 }: { children: ReactNode; intervalMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let paused = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const pause = () => {
      paused = true;
      clearTimeout(resumeTimer);
    };
    // After a touch or focus, resume a little later so the visitor can finish reading.
    const resumeSoon = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => (paused = false), 4000);
    };
    const resume = () => (paused = false);

    const tick = setInterval(() => {
      if (paused || document.hidden) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4) return; // nothing to scroll
      const first = el.firstElementChild as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
      const step = (first?.offsetWidth ?? el.clientWidth * 0.8) + gap;
      const atEnd = el.scrollLeft >= max - 4;
      el.scrollTo({ left: atEnd ? 0 : Math.min(el.scrollLeft + step, max), behavior: "smooth" });
    }, intervalMs);

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resumeSoon, { passive: true });
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resumeSoon);
    return () => {
      clearInterval(tick);
      clearTimeout(resumeTimer);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resumeSoon);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resumeSoon);
    };
  }, [intervalMs]);

  return (
    <div ref={ref} className="sf-rail-track" role="list">
      {children}
    </div>
  );
}
