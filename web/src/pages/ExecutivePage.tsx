import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Row = Record<string, unknown>;
type DrawingItem = {
  id: number;
  project_code: string;
  project_name: string;
  region: string | null;
  ae_name: string | null;
  counts: Record<string, number>;
  total: number;
};

const LABELS: Record<string, string> = {
  pnp: "P&P",
  tcs: "TCS",
  drainage: "Drainage",
  mnb: "MNB",
  mjb: "MJB",
  rob: "ROB",
  rub: "RUB",
  fob: "FOB",
  cnc: "CNC",
  hpc: "HPC",
  bxc: "BXC",
  slc: "SLC",
  toe_wall: "Toe Wall",
  retaining_wall: "Retaining Wall",
  junction: "Junction",
  rcc_drain: "RCC Drain",
  safety_plan: "Safety Plan",
  others: "Others",
};

function money(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function ExecutivePage() {
  const { token, role } = useAuth();
  const [tab, setTab] = useState<"overview" | "itf" | "drawings">("drawings");
  const [overview, setOverview] = useState<Row | null>(null);
  const [snaps, setSnaps] = useState<Row[]>([]);
  const [its, setIts] = useState<Row[]>([]);
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [drawings, setDrawings] = useState<{
    items: DrawingItem[];
    totals: Record<string, number>;
    grand_total: number;
    regions: string[];
    aes: string[];
    keys: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [region, setRegion] = useState("");
  const [ae, setAe] = useState("");

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Executive Summary";
  }, []);

  const load = async () => {
    if (!token) return;
    try {
      const [o, s, d, devices, inc] = await Promise.all([
        api.nhitGet<Row>(token, "/executive/overview"),
        api.nhitGet<Row[]>(token, "/executive"),
        api.nhitGet<{
          items: DrawingItem[];
          totals: Record<string, number>;
          grand_total: number;
          regions: string[];
          aes: string[];
          keys: string[];
        }>(token, "/executive/drawings"),
        api.nhitGet<Row[]>(token, "/its").catch(() => [] as Row[]),
        api.nhitGet<Row[]>(token, "/incidents").catch(() => [] as Row[]),
      ]);
      setOverview(o);
      setSnaps(s);
      setDrawings(d);
      setIts(devices);
      setIncidents(inc);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load executive summary");
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const filtered = useMemo(() => {
    const items = drawings?.items || [];
    return items.filter((i) => {
      if (project && i.project_code !== project && i.project_name !== project) return false;
      if (region && i.region !== region) return false;
      if (ae && i.ae_name !== ae) return false;
      return true;
    });
  }, [drawings, project, region, ae]);

  const filteredTotals = useMemo(() => {
    const keys = drawings?.keys || Object.keys(LABELS);
    const totals: Record<string, number> = {};
    for (const k of keys) totals[k] = filtered.reduce((a, i) => a + (i.counts[k] || 0), 0);
    return { totals, grand: Object.values(totals).reduce((a, b) => a + b, 0) };
  }, [filtered, drawings]);

  const exportCsv = () => {
    const keys = drawings?.keys || [];
    const headers = ["Project Code", "Total", ...keys.map((k) => LABELS[k] || k)];
    const lines = filtered.map((i) =>
      [i.project_code, i.total, ...keys.map((k) => i.counts[k] || 0)].join(",")
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawing-portfolio.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <div className="btn-row" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <button className={tab === "overview" ? "btn" : "btn ghost"} type="button" onClick={() => setTab("overview")}>
          Project Overview
        </button>
        <button className={tab === "itf" ? "btn" : "btn ghost"} type="button" onClick={() => setTab("itf")}>
          ITF Portfolio
        </button>
        <button className={tab === "drawings" ? "btn" : "btn ghost"} type="button" onClick={() => setTab("drawings")}>
          Drawing Portfolio
        </button>
        {role === "admin" ? (
          <button
            className="btn secondary"
            type="button"
            onClick={async () => {
              if (!token) return;
              await api.seedNhitDemo(token);
              await load();
            }}
          >
            Load demo data
          </button>
        ) : null}
      </div>

      {tab === "overview" ? (
        <>
          {overview ? (
            <section className="stat-grid">
              <article className="stat">
                <span>Stretches</span>
                <strong>{String(overview.stretches)}</strong>
              </article>
              <article className="stat">
                <span>Avg physical progress</span>
                <strong>{Number(overview.avg_physical_progress || 0).toFixed(1)}%</strong>
              </article>
              <article className="stat">
                <span>Planned ₹</span>
                <strong>{money(Number(overview.planned_expenditure || 0))}</strong>
              </article>
              <article className="stat">
                <span>Actual ₹</span>
                <strong>{money(Number(overview.actual_expenditure || 0))}</strong>
              </article>
              <Link className="stat" to="/highway-incidents">
                <span>Active incidents</span>
                <strong>{String(overview.active_incidents)}</strong>
              </Link>
              <Link className="stat" to="/its">
                <span>ITS not online</span>
                <strong>{String(overview.its_not_online)}</strong>
              </Link>
            </section>
          ) : null}
          <section className="panel">
            <h2>Stretch snapshots</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Stretch</th>
                  <th>Length km</th>
                  <th>Progress</th>
                  <th>Toll plazas</th>
                  <th>Lane avail.</th>
                </tr>
              </thead>
              <tbody>
                {snaps.map((r) => (
                  <tr key={String(r.id)}>
                    <td>
                      {String(r.stretch_name)}
                      <div className="muted">{String(r.key_features || "")}</div>
                    </td>
                    <td>{String(r.total_length_km ?? "—")}</td>
                    <td>{Number(r.physical_progress_pct || 0)}%</td>
                    <td>{String(r.toll_plazas_count)}</td>
                    <td>{Number(r.avg_lane_availability || 0)}%</td>
                  </tr>
                ))}
                {!snaps.length ? (
                  <tr>
                    <td colSpan={5}>No stretch data yet. Admin can load demo data.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "itf" ? (
        <section className="panel">
          <h2>ITF / ITS portfolio</h2>
          <table className="data">
            <thead>
              <tr>
                <th>System</th>
                <th>Name</th>
                <th>Location</th>
                <th>Status</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {its.map((d) => (
                <tr key={String(d.id)}>
                  <td>{String(d.system_type || "ITS")}</td>
                  <td>{String(d.name)}</td>
                  <td>{String(d.location || "—")}</td>
                  <td>{String(d.status)}</td>
                  <td>{String(d.health_pct ?? "—")}%</td>
                </tr>
              ))}
              {!its.length ? (
                <tr>
                  <td colSpan={5}>No ITF devices yet. Open ATMS/TMS/ITS or load demo data.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: "0.75rem" }}>
            Active highway incidents in this portfolio: {incidents.filter((i) => i.status === "active").length}
          </p>
        </section>
      ) : null}

      {tab === "drawings" ? (
        <>
          <section className="panel">
            <div className="form-grid">
              <label>
                Project
                <select value={project} onChange={(e) => setProject(e.target.value)}>
                  <option value="">Select…</option>
                  {(drawings?.items || []).map((i) => (
                    <option key={i.id} value={i.project_code}>
                      {i.project_code} · {i.project_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Region
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">Select…</option>
                  {(drawings?.regions || []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                AE
                <select value={ae} onChange={(e) => setAe(e.target.value)}>
                  <option value="">Select…</option>
                  {(drawings?.aes || []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <div className="btn-row" style={{ alignItems: "end" }}>
                <button className="btn ghost" type="button" onClick={() => { setProject(""); setRegion(""); setAe(""); }}>
                  Clear
                </button>
              </div>
            </div>
          </section>

          <section className="stat-grid">
            <article className="stat">
              <span>Total Drawing</span>
              <strong>{filteredTotals.grand}</strong>
            </article>
            {(drawings?.keys || []).map((k) => (
              <article className="stat" key={k}>
                <span>{LABELS[k] || k}</span>
                <strong>{filteredTotals.totals[k] || 0}</strong>
              </article>
            ))}
          </section>

          <section className="panel">
            <div className="btn-row" style={{ marginBottom: "0.75rem" }}>
              <button className="btn ghost" type="button" onClick={exportCsv}>
                CSV
              </button>
              <button className="btn ghost" type="button" onClick={exportCsv}>
                Excel
              </button>
              <button className="btn ghost" type="button" onClick={() => window.print()}>
                Print
              </button>
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Project Code</th>
                    <th>Total</th>
                    {(drawings?.keys || []).map((k) => (
                      <th key={k}>{LABELS[k] || k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={i.id}>
                      <td title={i.project_name}>{i.project_code}</td>
                      <td>{i.total}</td>
                      {(drawings?.keys || []).map((k) => (
                        <td key={k}>{i.counts[k] || 0}</td>
                      ))}
                    </tr>
                  ))}
                  {!filtered.length ? (
                    <tr>
                      <td colSpan={20}>No drawing data. Admin can click Load demo data.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="muted">Showing {filtered.length} of {drawings?.items.length || 0} entries</p>
          </section>
        </>
      ) : null}
    </>
  );
}
