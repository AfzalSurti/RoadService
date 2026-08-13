import { useEffect } from "react";

/** Reload list data when the tab becomes visible again (create → see it on the list). */
export function useRefreshOnFocus(load: () => void | Promise<void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onFocus = () => void load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, enabled]);
}
