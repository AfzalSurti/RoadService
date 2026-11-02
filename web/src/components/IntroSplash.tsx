import { useEffect, useState } from "react";

const KEY = "roadservice.playIntro";
const DURATION_MS = 3600;
const REDUCED_MS = 1200;

/** Ask the portal to play the company intro once (set right before signing in). */
export function queueIntro(on = true) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function takeIntro(): boolean {
  try {
    const on = sessionStorage.getItem(KEY) === "1";
    sessionStorage.removeItem(KEY);
    return on;
  } catch {
    return false;
  }
}

/**
 * Geo Designs & Research brand scene: sage / blue split, GDR globe, company
 * name, rule and tagline. `animated` plays the intro sequence; otherwise it is
 * a still backdrop (sign-in page).
 */
export function BrandScene({ animated = false, className = "" }: { animated?: boolean; className?: string }) {
  return (
    <div className={`brand-scene${animated ? " animated" : ""}${className ? ` ${className}` : ""}`} aria-hidden="true">
      <div className="brand-top" />
      <div className="brand-bottom" />
      <div className="brand-since">
        SINCE
        <br />
        1991
      </div>
      <div className="brand-center">
        <div className="brand-globe-wrap">
          <img className="brand-globe" src="/gdr-globe.png" alt="" draggable={false} />
        </div>
        <div className="brand-name">GEO DESIGNS &amp; RESEARCH PVT. LTD.</div>
        <div className="brand-rule" />
        <div className="brand-tagline">
          <span>DESIGNING</span>
          <span className="brand-dot">•</span>
          <span>TESTING</span>
          <span className="brand-dot">•</span>
          <span>SUPERVISION</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Intro shown once after signing in: panels slide in, the globe spins into
 * place, then the name, rule and tagline appear. Click / Esc / Enter skips.
 */
export function IntroSplash() {
  const [show, setShow] = useState(takeIntro);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const total = reduced ? REDUCED_MS : DURATION_MS;
    const fade = window.setTimeout(() => setLeaving(true), total - 500);
    const done = window.setTimeout(() => setShow(false), total);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") setShow(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className={`intro-splash${leaving ? " leaving" : ""}`}
      role="presentation"
      title="Click to skip"
      onClick={() => setShow(false)}
    >
      <BrandScene animated />
      <span className="intro-skip">Click to skip</span>
    </div>
  );
}
