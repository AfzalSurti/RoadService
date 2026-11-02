import { useCallback, useEffect, useState } from "react";
import { mediaUrl } from "../api";
import type { Project } from "../types";

/** Official title when set, else the short package name. */
export function projectTitle(p: Pick<Project, "name" | "title">): string {
  return p.title?.trim() || p.name;
}

/** Short tile label when set, else the package name. */
export function projectShortName(p: Pick<Project, "name" | "short_name">): string {
  return p.short_name?.trim() || p.name;
}

/** Tile photo URL: bundled web assets ("/packages/…") as-is, uploads via the API. */
export function projectImageUrl(p: Pick<Project, "image_url">): string | null {
  const src = p.image_url?.trim();
  if (!src) return null;
  return src.startsWith("/") && !src.startsWith("/uploads/") ? src : mediaUrl(src);
}

/*
 * Package scope, shared by every module: all packages (null), one, or several.
 * Picked in the sidebar or by opening a package on the dashboard. The single
 * "selected project" is the scope when exactly one package is chosen.
 */

const KEY = "roadservice.selectedProjectId";
const SCOPE_KEY = "roadservice.packageScope";
const SCOPE_EVENT = "roadservice:package-scope";

export function getPackageScope(): number[] | null {
  try {
    const raw = sessionStorage.getItem(SCOPE_KEY);
    if (!raw) return null;
    const ids = (JSON.parse(raw) as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

/** Set the scope (null = all packages) and tell every listening component. */
export function setPackageScope(ids: number[] | null) {
  const clean = ids && ids.length ? [...new Set(ids)].sort((a, b) => a - b) : null;
  try {
    if (clean) sessionStorage.setItem(SCOPE_KEY, JSON.stringify(clean));
    else sessionStorage.removeItem(SCOPE_KEY);
    if (clean && clean.length === 1) sessionStorage.setItem(KEY, String(clean[0]));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  // Deferred: callers may run during another component's render.
  window.setTimeout(() => window.dispatchEvent(new Event(SCOPE_EVENT)), 0);
}

/** Re-render when the package scope changes; `inScope` filters any project-linked row. */
export function usePackageScope() {
  const [ids, setIds] = useState<number[] | null>(getPackageScope);
  useEffect(() => {
    const sync = () => setIds(getPackageScope());
    window.addEventListener(SCOPE_EVENT, sync);
    return () => window.removeEventListener(SCOPE_EVENT, sync);
  }, []);
  const inScope = useCallback(
    (projectId: number | null | undefined) => !ids || (projectId != null && ids.includes(projectId)),
    [ids]
  );
  return { scopeIds: ids, isAll: !ids, inScope, setScope: setPackageScope };
}

export function getSelectedProjectId(): number | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Open one package (dashboard tile, ?project= link). Keeps a multi-package scope
 * that already contains it; otherwise narrows the scope to that package.
 */
export function setSelectedProjectId(id: number | null) {
  if (id == null) {
    setPackageScope(null);
    return;
  }
  const scope = getPackageScope();
  if (scope && scope.includes(id) && scope.length > 1) {
    try {
      sessionStorage.setItem(KEY, String(id));
    } catch {
      /* ignore */
    }
    return;
  }
  if (!(scope && scope.length === 1 && scope[0] === id)) setPackageScope([id]);
}

/** URL ?project= only — use for Issues nav (all issues when absent). */
export function projectIdFromUrl(searchProject: string | null): number | null {
  const fromUrl = Number(searchProject || 0);
  if (fromUrl > 0) {
    setSelectedProjectId(fromUrl);
    return fromUrl;
  }
  return null;
}

/** Prefer URL ?project= then session storage (forms / dashboard selection). */
export function resolveProjectId(searchProject: string | null): number | null {
  const fromUrl = projectIdFromUrl(searchProject);
  if (fromUrl) return fromUrl;
  return getSelectedProjectId();
}

export function withProjectQuery(path: string, projectId: number | null | undefined) {
  if (!projectId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}project=${projectId}`;
}
