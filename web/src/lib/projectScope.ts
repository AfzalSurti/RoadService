/** Persist the active project across portal pages (dashboard → issues/RFI/…). */

const KEY = "roadservice.selectedProjectId";

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

export function setSelectedProjectId(id: number | null) {
  try {
    if (id == null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(id));
  } catch {
    /* ignore */
  }
}

/** Prefer URL ?project= then session storage. */
export function resolveProjectId(searchProject: string | null): number | null {
  const fromUrl = Number(searchProject || 0);
  if (fromUrl > 0) {
    setSelectedProjectId(fromUrl);
    return fromUrl;
  }
  return getSelectedProjectId();
}

export function withProjectQuery(path: string, projectId: number | null | undefined) {
  if (!projectId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}project=${projectId}`;
}
