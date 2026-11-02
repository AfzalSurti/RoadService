import { useEffect, useRef, useState } from "react";
import { projectShortName } from "../lib/projectScope";
import type { Project } from "../types";

/**
 * Sidebar package picker: All packages, or tick one or more. The choice scopes
 * every module (Defects, RFI, Billing, Documents, MSR, Map…).
 */
export function PackageScopePicker({
  projects,
  scopeIds,
  onChange,
}: {
  projects: Project[];
  scopeIds: number[] | null;
  onChange: (ids: number[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sorted = [...projects].sort((a, b) => a.id - b.id);
  const chosen = scopeIds ? sorted.filter((p) => scopeIds.includes(p.id)) : [];
  const label = !scopeIds
    ? "All packages"
    : chosen.length === 1
      ? projectShortName(chosen[0])
      : `${chosen.length} packages`;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = (id: number) => {
    const current = scopeIds ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    // Ticking every package (or none) is the same as "All packages".
    onChange(next.length === 0 || next.length === sorted.length ? null : next);
  };

  return (
    <div className="nav-project" ref={ref}>
      <small>Package</small>
      <button
        type="button"
        className="nav-project-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={chosen.length > 1 ? chosen.map(projectShortName).join(", ") : undefined}
      >
        <strong>{label}</strong>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="nav-project-menu" role="group" aria-label="Choose packages">
          <label className="nav-project-option">
            <input type="checkbox" checked={!scopeIds} onChange={() => onChange(null)} />
            <span>All packages</span>
          </label>
          {sorted.map((p) => (
            <label key={p.id} className="nav-project-option">
              <input type="checkbox" checked={!!scopeIds && scopeIds.includes(p.id)} onChange={() => toggle(p.id)} />
              <span>{projectShortName(p)}</span>
            </label>
          ))}
        </div>
      ) : null}
      {scopeIds ? (
        <button type="button" className="linkish" onClick={() => onChange(null)}>
          Show all packages
        </button>
      ) : null}
    </div>
  );
}
