import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { IssueDetailPanel } from "../components/IssueDetailPanel";
import { StatusBadge, formatLabel } from "../components/StatusBadge";
import { projectShortName, setSelectedProjectId, usePackageScope } from "../lib/projectScope";
import type { Issue, Project, Vendor } from "../types";

const COLORS: Record<string, string> = {
  open: "#e11d48",
  in_progress: "#f59e0b",
  completed: "#3b82f6",
  verification_pending: "#8b5cf6",
  under_review: "#ea580c",
  closed: "#16a34a",
};
const STATUSES = Object.keys(COLORS);
const INDIA: [number, number] = [20.5937, 78.9629];

const hasCoords = (i: Issue) =>
  Number.isFinite(i.before_lat) && Number.isFinite(i.before_lng) && !(i.before_lat === 0 && i.before_lng === 0);

/** Zoom to the visible pins whenever the filters change. */
function FitBounds({ issues }: { issues: Issue[] }) {
  const map = useMap();
  const key = issues.map((i) => i.id).join(",");
  useEffect(() => {
    if (!issues.length) return;
    if (issues.length === 1) {
      map.setView([issues[0].before_lat, issues[0].before_lng], 15);
      return;
    }
    const lats = issues.map((i) => i.before_lat);
    const lngs = issues.map((i) => i.before_lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [60, 60] }
    );
  }, [key, map]);
  return null;
}

/** Leaflet needs a size refresh after entering / leaving browser full screen. */
function ResizeOnFullscreen() {
  const map = useMap();
  useEffect(() => {
    const onChange = () => window.setTimeout(() => map.invalidateSize(), 150);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [map]);
  return null;
}

/**
 * Issue map: full-height map with Package → Vendor → Issue filters. A pin opens a
 * summary popup; "View more" opens the full issue side panel.
 */
export function MapPage() {
  const { token, role } = useAuth();
  const [params, setParams] = useSearchParams();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [defect, setDefect] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const canFilterVendor = role === "admin" || role === "government";

  // Package filter follows the sidebar scope: one package → that package; several →
  // pins from those packages; all → everything.
  const { scopeIds, inScope } = usePackageScope();
  const urlProject = Number(params.get("project") || 0) || null;
  const projectId = urlProject ?? (scopeIds && scopeIds.length === 1 ? scopeIds[0] : null);
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.id - b.id), [projects]);
  const project = projectId ? sortedProjects.find((p) => p.id === projectId) || null : null;

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = project ? `Map · ${projectShortName(project)}` : "Map";
  }, [project]);

  const load = () => {
    if (!token) return;
    api
      .issues(token, null, null)
      .then((rows) => {
        setIssues(rows);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    if (!token) return;
    load();
    api
      .projects(token)
      .then(setProjects)
      .catch(() => setProjects([]));
    if (canFilterVendor) {
      api
        .vendors(token)
        .then(setVendors)
        .catch(() => setVendors([]));
    }
  }, [token]);

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const pickProject = (id: string) => {
    setVendorId("");
    if (id) {
      setSelectedProjectId(Number(id));
      setParams({ project: id });
    } else {
      setSelectedProjectId(null);
      setParams({});
    }
  };

  // Vendor filter: vendors of the chosen package that are linked to a contractor login.
  const packageVendors = useMemo(
    () =>
      vendors.filter(
        (v) => v.contractor_user_id && (projectId ? v.project_id === projectId : inScope(v.project_id))
      ),
    [vendors, projectId, inScope]
  );
  const vendor = vendorId ? packageVendors.find((v) => String(v.id) === vendorId) || null : null;
  const vendorByContractor = useMemo(() => {
    const map = new Map<number, Vendor>();
    for (const v of vendors) if (v.contractor_user_id) map.set(v.contractor_user_id, v);
    return map;
  }, [vendors]);

  const scoped = useMemo(
    () =>
      issues.filter(
        (i) =>
          hasCoords(i) &&
          (projectId ? i.project_id === projectId : inScope(i.project_id)) &&
          (!vendor || i.assigned_contractor_id === vendor.contractor_user_id)
      ),
    [issues, projectId, vendor]
  );
  const defectOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const i of scoped) set.set(i.issue_type, i.issue_type_label || i.issue_type);
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [scoped]);
  const visible = useMemo(
    () =>
      scoped.filter(
        (i) => (!statuses.length || statuses.includes(i.status)) && (!defect || i.issue_type === defect)
      ),
    [scoped, statuses, defect]
  );
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of scoped) if (!defect || i.issue_type === defect) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }, [scoped, defect]);

  const toggleStatus = (s: string) =>
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const resetFilters = () => {
    setVendorId("");
    setStatuses([]);
    setDefect("");
  };
  const filtersActive = Boolean(vendorId || statuses.length || defect);

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* browser refused (e.g. iframe) — the page-height map still works */
    }
  };

  const projectName = (id: number) => {
    const p = projects.find((x) => x.id === id);
    return p ? projectShortName(p) : `Project #${id}`;
  };

  return (
    <div ref={wrapRef} className={`map-page${isFull ? " is-full" : ""}`}>
      <MapContainer center={INDIA} zoom={5} className="map-page-canvas">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds issues={visible} />
        <ResizeOnFullscreen />
        {visible.map((i) => {
          const v = vendorByContractor.get(i.assigned_contractor_id);
          return (
            <CircleMarker
              key={i.id}
              center={[i.before_lat, i.before_lng]}
              radius={detailId === i.id ? 12 : 9}
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: COLORS[i.status] || "#64748b",
                fillOpacity: 0.95,
              }}
            >
              <Popup className="map-popup" minWidth={240} maxWidth={300}>
                <div className="map-popup-body">
                  {i.before_photo_path ? (
                    <img src={mediaUrl(i.before_photo_path)} alt={`Issue #${i.id}`} className="map-popup-photo" />
                  ) : null}
                  <div className="map-popup-head">
                    <strong>
                      #{i.id} · {i.issue_type_label || i.issue_type}
                    </strong>
                    <StatusBadge status={i.status} />
                  </div>
                  <dl className="map-popup-meta">
                    <dt>Package</dt>
                    <dd>{projectName(i.project_id)}</dd>
                    {v ? (
                      <>
                        <dt>Vendor</dt>
                        <dd>{v.name}</dd>
                      </>
                    ) : null}
                    <dt>Chainage</dt>
                    <dd>{i.chainage || "—"}</dd>
                    <dt>Priority</dt>
                    <dd>{formatLabel(i.priority)}</dd>
                    <dt>Raised</dt>
                    <dd>{new Date(i.created_at).toLocaleDateString()}</dd>
                    <dt>Deadline</dt>
                    <dd>
                      {i.deadline_date}
                      {i.status !== "closed" && (i.remaining_days ?? 0) < 0 ? (
                        <span className="map-popup-late"> · {Math.abs(i.remaining_days ?? 0)}d late</span>
                      ) : null}
                    </dd>
                  </dl>
                  <button type="button" className="btn map-popup-more" onClick={() => setDetailId(i.id)}>
                    View more
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className={`map-filters${showFilters ? "" : " collapsed"}`}>
        <div className="map-filters-head">
          <strong>Filters</strong>
          <span className="muted">
            {visible.length} of {issues.filter(hasCoords).length} issues
          </span>
          <button type="button" className="linkish" onClick={() => setShowFilters((s) => !s)}>
            {showFilters ? "Hide" : "Show"}
          </button>
        </div>
        {showFilters ? (
          <>
            {error ? <div className="error">{error}</div> : null}
            <label>
              <span className="map-filter-step">1</span> Package
              <select value={projectId ? String(projectId) : ""} onChange={(e) => pickProject(e.target.value)}>
                <option value="">{scopeIds && scopeIds.length > 1 ? "Chosen packages" : "All packages"}</option>
                {sortedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {projectShortName(p)}
                  </option>
                ))}
              </select>
            </label>
            {canFilterVendor ? (
              <label>
                <span className="map-filter-step">2</span> Vendor
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">All vendors</option>
                  {packageVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {!projectId && v.project_id ? ` · ${projectName(v.project_id)}` : ""}
                    </option>
                  ))}
                </select>
                {!packageVendors.length ? (
                  <small className="muted">No vendors linked to a contractor login for this package.</small>
                ) : null}
              </label>
            ) : null}
            <div className="map-filter-group">
              <span>
                <span className="map-filter-step">{canFilterVendor ? 3 : 2}</span> Issue
              </span>
              <div className="map-status-chips">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`map-status-chip${statuses.includes(s) ? " active" : ""}`}
                    style={{ ["--chip" as string]: COLORS[s] }}
                    onClick={() => toggleStatus(s)}
                  >
                    <span className="map-status-dot" />
                    {formatLabel(s)}
                    <span className="map-status-count">{statusCounts[s] || 0}</span>
                  </button>
                ))}
              </div>
              <select value={defect} onChange={(e) => setDefect(e.target.value)}>
                <option value="">All defect types</option>
                {defectOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={resetFilters} disabled={!filtersActive}>
                Reset filters
              </button>
              <button type="button" className="btn ghost" onClick={() => void toggleFullscreen()}>
                {isFull ? "Exit full screen" : "⛶ Full screen"}
              </button>
            </div>
            {!visible.length ? (
              <p className="muted map-empty">No issues with a location match these filters.</p>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Rendered inside the map wrapper so it also shows in browser full screen. */}
      {detailId ? (
        <IssueDetailPanel
          issueId={detailId}
          fallback={issues.find((i) => i.id === detailId) || null}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}
