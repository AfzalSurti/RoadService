import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { api } from "../api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
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

export function MapPage() {
  const { token } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="panel">
      {error ? <div className="error">{error}</div> : null}
      <div className="legend">
        {Object.keys(COLORS).map((k) => (
          <StatusBadge key={k} status={k} />
        ))}
      </div>
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
              radius={9}
              pathOptions={{
                color: COLORS[i.status],
                fillColor: COLORS[i.status],
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <strong>#{i.id}</strong> {i.issue_type}
                <br />
                {i.status}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </section>
  );
}
