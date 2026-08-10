import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { api } from "../api";
import { useAuth } from "../auth";
import { StatusBadge, formatLabel } from "../components/StatusBadge";
import type { Issue } from "../types";

const COLORS: Record<string, string> = {
  open: "#e11d48",
  in_progress: "#f59e0b",
  completed: "#3b82f6",
  verification_pending: "#8b5cf6",
  under_review: "#ea580c",
  closed: "#16a34a",
};

function FitBounds({ issues }: { issues: Issue[] }) {
  const map = useMap();
  useEffect(() => {
    if (!issues.length) return;
    const lats = issues.map((i) => i.before_lat);
    const lngs = issues.map((i) => i.before_lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [40, 40] }
    );
  }, [issues, map]);
  return null;
}

function historyLines(issue: Issue) {
  const status = [...(issue.status_history || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const rejects = [...(issue.rejection_history || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return { status, rejects };
}

export function MapPage() {
  const { token } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Map";
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .issues(token)
      .then(setIssues)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const center = useMemo<[number, number]>(() => {
    if (!issues.length) return [20.5937, 78.9629];
    const lat = issues.reduce((s, i) => s + i.before_lat, 0) / issues.length;
    const lng = issues.reduce((s, i) => s + i.before_lng, 0) / issues.length;
    return [lat, lng];
  }, [issues]);

  const openIssue = async (issue: Issue) => {
    if (!token) return;
    setSelected(issue);
    setLoadingDetail(true);
    setError(null);
    try {
      const full = await api.issue(token, issue.id);
      setSelected(full);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load issue history");
    } finally {
      setLoadingDetail(false);
    }
  };

  const hist = selected ? historyLines(selected) : null;

  return (
    <div className="docs-layout">
      <section className="panel" style={{ minWidth: 0 }}>
        {error ? <div className="error">{error}</div> : null}
        <div className="legend">
          {Object.keys(COLORS).map((k) => (
            <StatusBadge key={k} status={k} />
          ))}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Click a coloured marker to open issue / defect history for that location.
        </p>
        <div className="map-canvas">
          <MapContainer center={center} zoom={issues.length ? 12 : 5} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds issues={issues} />
            {issues.map((i) => (
              <CircleMarker
                key={i.id}
                center={[i.before_lat, i.before_lng]}
                radius={selected?.id === i.id ? 12 : 9}
                eventHandlers={{ click: () => void openIssue(i) }}
                pathOptions={{
                  color: COLORS[i.status] || "#64748b",
                  fillColor: COLORS[i.status] || "#64748b",
                  fillOpacity: 0.85,
                  weight: selected?.id === i.id ? 3 : 1,
                }}
              >
                <Popup>
                  <strong>
                    #{i.id} {i.issue_type}
                  </strong>
                  <br />
                  <StatusBadge status={i.status} />
                  <br />
                  <small>Click marker for full history</small>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </section>

      <aside className="panel docs-sidebar">
        <h2>Issue / defect history</h2>
        {!selected ? (
          <p className="muted">Select a coloured pin on the map.</p>
        ) : (
          <>
            <div className="panel-head-row">
              <div>
                <strong>
                  #{selected.id} · {selected.issue_type}
                </strong>
                <div className="muted">{selected.work_category}</div>
              </div>
              <StatusBadge status={selected.status} />
            </div>
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              Chainage: {selected.chainage || "—"} · Priority: {formatLabel(selected.priority)}
            </p>
            {loadingDetail ? <p className="muted">Loading history…</p> : null}
            <h3 style={{ fontSize: "0.95rem" }}>Status history</h3>
            <ul className="folder-tree" style={{ marginBottom: "1rem" }}>
              {(hist?.status || []).length ? (
                hist!.status.map((h) => (
                  <li key={h.id} style={{ marginBottom: "0.45rem", fontSize: "0.88rem" }}>
                    <strong>
                      {formatLabel(h.from_status || "—")} → {formatLabel(h.to_status)}
                    </strong>
                    <div className="muted">{new Date(h.created_at).toLocaleString()}</div>
                    {h.note ? <div>{h.note}</div> : null}
                  </li>
                ))
              ) : (
                <li className="muted">No status history yet.</li>
              )}
            </ul>
            <h3 style={{ fontSize: "0.95rem" }}>Rejection / rework history</h3>
            <ul className="folder-tree">
              {(hist?.rejects || []).length ? (
                hist!.rejects.map((r) => (
                  <li key={r.id} style={{ marginBottom: "0.45rem", fontSize: "0.88rem" }}>
                    <strong>{r.reason || "Rework"}</strong>
                    <div className="muted">{new Date(r.created_at).toLocaleString()}</div>
                    {r.comments ? <div>{r.comments}</div> : null}
                  </li>
                ))
              ) : (
                <li className="muted">No rejection / defect rework history.</li>
              )}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
