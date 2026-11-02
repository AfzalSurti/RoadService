import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

type LatLng = [number, number];
type Segment = { nh: string; from: number; to: number; color: string; label: string; coords: LatLng[] };
type Point = { label: string; nh: string; ch: number; kind: "start" | "end" | "toll" | "work" };
type Corridor = { key: string; title: string; highways: string; segments: Segment[]; points: Point[] };

const DURATION_MS = 14000;
const KIND_COLOR: Record<Point["kind"], string> = {
  start: "#34d399",
  end: "#34d399",
  toll: "#60a5fa",
  work: "#c084fc",
};

/** 880.6 -> "880+600" */
export function fmtCh(km: number): string {
  const whole = Math.floor(km + 1e-9);
  const m = Math.round((km - whole) * 1000);
  return m === 1000 ? `${whole + 1}+000` : `${whole}+${String(m).padStart(3, "0")}`;
}

function haversine(a: LatLng, b: LatLng): number {
  const r = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

type Prepared = Segment & { cum: number[]; len: number; offset: number };

function prepare(c: Corridor) {
  let offset = 0;
  const segs: Prepared[] = c.segments.map((s) => {
    const cum = [0];
    for (let i = 1; i < s.coords.length; i++) cum.push(cum[i - 1] + haversine(s.coords[i - 1], s.coords[i]));
    const p = { ...s, cum, len: cum[cum.length - 1], offset };
    offset += p.len;
    return p;
  });
  return { segs, total: offset };
}

/** Point `d` km along one segment, plus the polyline drawn up to it. */
function along(seg: Prepared, d: number): { at: LatLng; drawn: LatLng[] } {
  const dist = Math.max(0, Math.min(d, seg.len));
  let i = 1;
  while (i < seg.cum.length && seg.cum[i] < dist) i++;
  if (i >= seg.cum.length) return { at: seg.coords[seg.coords.length - 1], drawn: seg.coords };
  const span = seg.cum[i] - seg.cum[i - 1] || 1;
  const t = (dist - seg.cum[i - 1]) / span;
  const a = seg.coords[i - 1];
  const b = seg.coords[i];
  const at: LatLng = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return { at, drawn: [...seg.coords.slice(0, i), at] };
}

/** Distance along the whole corridor where a chainage point sits. */
function pointOffset(segs: Prepared[], p: Point): number {
  const seg =
    segs.find((s) => s.nh === p.nh && p.ch >= Math.min(s.from, s.to) - 1e-6 && p.ch <= Math.max(s.from, s.to) + 1e-6) ||
    segs.find((s) => s.nh === p.nh) ||
    segs[0];
  const f = (p.ch - seg.from) / (seg.to - seg.from || 1);
  return seg.offset + Math.max(0, Math.min(1, f)) * seg.len;
}

function FitRoute({ corridor }: { corridor: Corridor }) {
  const map = useMap();
  useEffect(() => {
    const all = corridor.segments.flatMap((s) => s.coords);
    if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [48, 48] });
  }, [corridor.key, map]);
  useEffect(() => {
    const onFs = () => window.setTimeout(() => map.invalidateSize(), 150);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [map]);
  return null;
}

const headIcon = L.divIcon({ className: "cm-head-icon", html: '<span class="cm-head"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
const ringIcon = L.divIcon({ className: "cm-ring-icon", html: '<span class="cm-ring"></span>', iconSize: [56, 56], iconAnchor: [28, 28] });

/**
 * Animated NH corridor map for a package: the route draws itself on a dark base
 * map, chainage signs pop up at Start / Toll / End points, with a chainage strip,
 * NH badge, point list and Play / Pause / Replay / Play all / Full screen.
 */
export function CorridorMap({ packageName }: { packageName: string }) {
  const [corridors, setCorridors] = useState<Corridor[] | null>(null);
  const [activeKey, setActiveKey] = useState(packageName);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [playAll, setPlayAll] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/corridors.json")
      .then((r) => r.json())
      .then(setCorridors)
      .catch(() => setCorridors([]));
  }, []);

  useEffect(() => setActiveKey(packageName), [packageName]);

  const corridor = corridors?.find((c) => c.key === activeKey) || null;
  const prep = useMemo(() => (corridor ? prepare(corridor) : null), [corridor]);
  const points = useMemo(
    () => (corridor && prep ? corridor.points.map((p) => ({ ...p, offset: pointOffset(prep.segs, p) })) : []),
    [corridor, prep]
  );

  // Restart whenever the corridor changes.
  useEffect(() => {
    setProgress(0);
    setPlaying(true);
  }, [activeKey]);

  // Animation loop.
  useEffect(() => {
    if (!playing || !prep) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      let finished = false;
      setProgress((p) => {
        const next = Math.min(prep.total, p + (prep.total * dt) / DURATION_MS);
        if (next >= prep.total) finished = true;
        return next;
      });
      if (finished) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, prep]);

  // "Play all": move on to the next corridor a moment after one completes.
  useEffect(() => {
    if (!playAll || playing || !prep || progress < prep.total || !corridors) return;
    const idx = corridors.findIndex((c) => c.key === activeKey);
    if (idx === corridors.length - 1) {
      setPlayAll(false);
      return;
    }
    const t = window.setTimeout(() => setActiveKey(corridors[idx + 1].key), 1400);
    return () => window.clearTimeout(t);
  }, [playAll, playing, progress, prep, corridors, activeKey]);

  useEffect(() => {
    const onFs = () => setIsFull(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (!corridors) return <p className="muted">Loading corridor map…</p>;
  if (!corridor || !prep) return null;

  // Current head position + chainage.
  const curSeg = prep.segs.find((s) => progress <= s.offset + s.len + 1e-9) || prep.segs[prep.segs.length - 1];
  const head = along(curSeg, progress - curSeg.offset);
  const curCh = curSeg.from + ((progress - curSeg.offset) / (curSeg.len || 1)) * (curSeg.to - curSeg.from);
  const done = progress >= prep.total - 1e-6;
  const reached = points.filter((p) => p.offset <= progress + 1e-6);
  const activePoint = reached[reached.length - 1] || null;

  // Chainage strip: one group per highway (consecutive segments of the same NH).
  const groups: { nh: string; from: number; to: number; segs: Prepared[] }[] = [];
  for (const s of prep.segs) {
    const g = groups[groups.length - 1];
    if (g && g.nh === s.nh) {
      g.to = s.to;
      g.segs.push(s);
    } else groups.push({ nh: s.nh, from: s.from, to: s.to, segs: [s] });
  }
  const groupLen = (g: (typeof groups)[number]) => Math.abs(g.to - g.from);
  const tolls = corridor.points.filter((p) => p.kind === "toll").length;

  const restart = () => {
    setProgress(0);
    setPlaying(true);
  };
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.current?.requestFullscreen();
    } catch {
      /* ignore */
    }
  };

  return (
    <div ref={wrap} className={`corridor-map${isFull ? " is-full" : ""}`}>
      <div className="cm-header">
        <span className="cm-eyebrow">
          PROJECT LOCATION · MAP {corridors.indexOf(corridor) + 1} OF {corridors.length}
        </span>
        <strong>{corridor.highways}</strong> <span className="cm-header-title">{corridor.title}</span>
      </div>
      <div className="cm-cards">
        {corridors.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`cm-card${c.key === activeKey ? " active" : ""}`}
            onClick={() => {
              setPlayAll(false);
              setActiveKey(c.key);
            }}
          >
            <span className="cm-card-line" style={{ background: c.segments[c.segments.length - 1].color }} />
            <span>
              <strong>{c.highways}</strong>
              <small>{c.title}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="cm-map">
        <MapContainer
          center={corridor.segments[0].coords[0]}
          zoom={9}
          zoomSnap={0.25}
          scrollWheelZoom={false}
          className="cm-leaflet"
        >
          {/* OpenStreetMap tiles, darkened in CSS for the night-map look */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRoute corridor={corridor} />
          {prep.segs.map((s, i) => (
            <Polyline key={`base-${i}`} positions={s.coords} pathOptions={{ color: "#94a3b8", weight: 3, opacity: 0.55, dashArray: "2 8" }} />
          ))}
          {prep.segs.map((s, i) => {
            if (progress <= s.offset) return null;
            const drawn = progress >= s.offset + s.len ? s.coords : along(s, progress - s.offset).drawn;
            return (
              <Polyline key={`draw-${i}`} positions={drawn} pathOptions={{ color: s.color, weight: 7, opacity: 0.95, lineCap: "round" }} />
            );
          })}
          <Marker position={corridor.segments[0].coords[0]} icon={ringIcon} interactive={false} />
          {points.map((p, i) => {
            const isReached = p.offset <= progress + 1e-6;
            const seg = prep.segs.find((s) => p.offset <= s.offset + s.len + 1e-6) || prep.segs[0];
            const pos = along(seg, p.offset - seg.offset).at;
            return (
              <CircleMarker
                key={`${p.label}-${i}`}
                center={pos}
                radius={isReached ? 7 : 5}
                pathOptions={{
                  color: "#0b1220",
                  weight: 2,
                  fillColor: isReached ? KIND_COLOR[p.kind] : "#475569",
                  fillOpacity: 1,
                }}
                eventHandlers={{
                  click: () => {
                    setPlaying(false);
                    setProgress(p.offset);
                  },
                }}
              >
                {activePoint === p ? (
                  <Tooltip key="sign" permanent direction="left" offset={[-14, 0]} className="cm-sign">
                    <span className="cm-sign-label">{p.label}</span>
                    <span className="cm-sign-ch">CH {fmtCh(p.ch)}</span>
                  </Tooltip>
                ) : (
                  <Tooltip key="hint" direction="top" offset={[0, -8]}>
                    {p.label} · {p.nh} {fmtCh(p.ch)}
                  </Tooltip>
                )}
              </CircleMarker>
            );
          })}
          {!done || progress > 0 ? <Marker position={head.at} icon={headIcon} interactive={false} /> : null}
        </MapContainer>
      </div>

      <div className="cm-controls">
        <button type="button" className={`cm-btn${playing ? " primary" : ""}`} onClick={() => (done ? restart() : setPlaying((p) => !p))}>
          {playing ? "❚❚ Pause" : done ? "▶ Play" : "▶ Resume"}
        </button>
        <button type="button" className="cm-btn" onClick={restart}>
          ↻ Replay
        </button>
        <button
          type="button"
          className={`cm-btn${playAll ? " primary" : ""}`}
          onClick={() => {
            setPlayAll(true);
            if (activeKey === corridors[0].key) restart();
            else setActiveKey(corridors[0].key);
          }}
        >
          ⏩ Play all
        </button>
        <button type="button" className="cm-btn" onClick={() => void toggleFull()} title="Full screen">
          {isFull ? "Exit full screen" : "⛶"}
        </button>
      </div>

      <div className="cm-strip">
        {groups.map((g) => {
          const len = groupLen(g) || 1;
          const inGroup = curSeg && g.segs.includes(curSeg);
          const handle = inGroup ? ((curCh - g.from) / (g.to - g.from || 1)) * 100 : done && g === groups[groups.length - 1] ? 100 : null;
          const step = len > 120 ? 20 : len > 30 ? 10 : 5;
          const ticks: number[] = [];
          for (let t = Math.ceil(Math.min(g.from, g.to) / step) * step; t <= Math.max(g.from, g.to); t += step) ticks.push(t);
          return (
            <div key={g.nh} className="cm-strip-group" style={{ flexGrow: Math.max(len, 12) }}>
              <span className="cm-strip-nh">{g.nh}</span>
              <div className="cm-strip-bar">
                {g.segs.map((s, i) => {
                  const left = ((s.from - g.from) / (g.to - g.from || 1)) * 100;
                  const width = ((s.to - s.from) / (g.to - g.from || 1)) * 100;
                  const fill = progress <= s.offset ? 0 : progress >= s.offset + s.len ? 100 : ((progress - s.offset) / s.len) * 100;
                  return (
                    <span key={i} className="cm-strip-part" style={{ left: `${left}%`, width: `${width}%` }}>
                      <span className="cm-strip-fill" style={{ width: `${fill}%`, background: s.color }} />
                    </span>
                  );
                })}
                {handle != null ? <span className="cm-strip-handle" style={{ left: `${Math.max(0, Math.min(100, handle))}%` }} /> : null}
              </div>
              <div className="cm-strip-ticks">
                {ticks.map((t) => (
                  <span key={t} style={{ left: `${((t - g.from) / (g.to - g.from || 1)) * 100}%` }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cm-now">
        <div className="cm-shield">
          <span className="cm-shield-nh">{curSeg.nh.replace("-", " ")}</span>
          <span className="cm-shield-body">
            <small>CHAINAGE</small>
            <strong>{fmtCh(curCh)}</strong>
          </span>
        </div>
        <div className="cm-now-text">
          <span className="cm-eyebrow">{done ? "CORRIDOR COMPLETE" : playing ? "TRAVELLING" : "PAUSED"}</span>
          <strong>{corridor.title}</strong>
          <span className="cm-now-sub">
            {groups.map((g) => `${g.nh} CH ${fmtCh(g.from)} to ${fmtCh(g.to)}`).join(" · ")}
          </span>
        </div>
      </div>

      <ul className="cm-points">
        {points.map((p, i) => (
          <li key={`${p.label}-${i}`} className={activePoint === p ? "active" : p.offset <= progress ? "reached" : undefined}>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setProgress(p.offset);
              }}
            >
              <span className="cm-dot" style={{ background: KIND_COLOR[p.kind] }} />
              <span className="cm-point-label">{p.label}</span>
              <span className="cm-point-ch">
                {p.nh} {fmtCh(p.ch)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="cm-stats">
        {groups.map((g) => (
          <div key={`len-${g.nh}`}>
            <small>{g.nh} length</small>
            <strong>{groupLen(g).toFixed(3)} km</strong>
          </div>
        ))}
        {groups.map((g) => (
          <div key={`ch-${g.nh}`}>
            <small>{g.nh} chainage</small>
            <strong>
              {fmtCh(g.from)} to {fmtCh(g.to)}
            </strong>
          </div>
        ))}
        <div>
          <small>Toll plazas</small>
          <strong>{tolls}</strong>
        </div>
      </div>
      <p className="cm-note">Route drawn on the road network to chainage scale. Base map © OpenStreetMap contributors.</p>
    </div>
  );
}
