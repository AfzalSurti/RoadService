import { useEffect, useState } from "react";

/** The bundle this tab is running, e.g. "/assets/index-BNoiE85X.js". */
function runningBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  return el ? new URL(el.src, location.href).pathname : null;
}

/**
 * Open tabs keep running the version they loaded. Every few minutes (and when the tab gets focus)
 * check whether a newer version has been published and, if so, offer a one-click reload.
 */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = runningBundle();
    if (!mine) return; // dev server
    let stop = false;
    const check = async () => {
      try {
        const html = await (await fetch(`/?v=${Date.now()}`, { cache: "no-store" })).text();
        const m = html.match(/src="(\/assets\/[^"]+\.js)"/);
        if (!stop && m && m[1] !== mine) setStale(true);
      } catch {
        /* offline: try again later */
      }
    };
    const timer = window.setInterval(check, 3 * 60 * 1000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    void check();
    return () => {
      stop = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of RoadService is available.</span>
      <button type="button" className="btn" onClick={() => location.reload()}>
        Reload now
      </button>
    </div>
  );
}
