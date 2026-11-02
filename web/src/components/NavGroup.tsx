import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

const KEY = "roadservice.navGroups";

function readState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * Collapsible sidebar section with an expand / collapse arrow. The open state is
 * remembered per browser; the group holding the current page always opens.
 */
export function NavGroup({ id, title, paths, children }: { id: string; title: string; paths: string[]; children: ReactNode }) {
  const { pathname } = useLocation();
  const hasActive = paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const [open, setOpen] = useState(() => readState()[id] ?? true);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...readState(), [id]: next }));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className={`nav-group${open ? " open" : ""}`}>
      <button type="button" className="nav-group-toggle" aria-expanded={open} onClick={toggle}>
        <span>{title}</span>
        <span className="nav-group-arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? <div className="nav-group-items">{children}</div> : null}
    </div>
  );
}
