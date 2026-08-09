import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatLabel } from "../components/StatusBadge";

type Row = Record<string, unknown>;

function money(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function usePageTitle(title: string) {
  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = title;
  }, [title]);
}

export function ExecutivePage() {
  const { token, role } = useAuth();
  const [overview, setOverview] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  usePageTitle("Executive NHIT Summary");

  const load = async () => {
    if (!token) return;
    try {
      const [o, r] = await Promise.all([
        api.nhitGet<Row>(token, "/executive/overview"),
        api.nhitGet<Row[]>(token, "/executive"),
      ]);
      setOverview(o);
      setRows(r);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {role === "admin" ? (
        <div className="btn-row" style={{ marginBottom: "1rem" }}>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              if (!token) return;
              await api.seedNhitDemo(token);
              await load();
            }}
          >
            Load demo NHIT data
          </button>
        </div>
      ) : null}
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
          <article className="stat">
            <span>Active incidents</span>
            <strong>{String(overview.active_incidents)}</strong>
          </article>
          <article className="stat">
            <span>ITS not online</span>
            <strong>{String(overview.its_not_online)}</strong>
          </article>
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
            {rows.map((r) => (
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
            {!rows.length ? (
              <tr>
                <td colSpan={5}>No executive data yet. Admin can load demo data.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function AttendancePage() {
  const { token, role, isReadonly } = useAuth();
  const [summary, setSummary] = useState<Row | null>(null);
  const [people, setPeople] = useState<Row[]>([]);
  const [attendance, setAttendance] = useState<Row[]>([]);
  const [leaves, setLeaves] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_code: "",
    full_name: "",
    designation: "Engineer",
    deployment_location: "",
  });
  usePageTitle("Attendance & Manpower");

  const load = async () => {
    if (!token) return;
    try {
      const [s, p, a, l] = await Promise.all([
        api.nhitGet<Row>(token, "/attendance/summary").catch(() => null),
        api.nhitGet<Row[]>(token, "/personnel"),
        api.nhitGet<Row[]>(token, "/attendance"),
        api.nhitGet<Row[]>(token, "/leaves"),
      ]);
      setSummary(s);
      setPeople(p);
      setAttendance(a);
      setLeaves(l);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const addPerson = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly) return;
    await api.nhitPost(token, "/personnel", form);
    setForm({ employee_code: "", full_name: "", designation: "Engineer", deployment_location: "" });
    await load();
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {summary ? (
        <section className="stat-grid">
          <article className="stat">
            <span>Active personnel</span>
            <strong>{String(summary.active_personnel)}</strong>
          </article>
          <article className="stat">
            <span>Present today</span>
            <strong>{String(summary.present_today)}</strong>
          </article>
          <article className="stat">
            <span>Pending leaves</span>
            <strong>{String(summary.pending_leaves)}</strong>
          </article>
        </section>
      ) : null}

      {role === "admin" && !isReadonly ? (
        <section className="panel">
          <h2>Add personnel</h2>
          <form className="form-grid" onSubmit={addPerson}>
            <label>
              Emp code
              <input required value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
            </label>
            <label>
              Name
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </label>
            <label>
              Designation
              <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </label>
            <label>
              Location
              <input
                value={form.deployment_location}
                onChange={(e) => setForm({ ...form, deployment_location: e.target.value })}
              />
            </label>
            <div className="span-2">
              <button className="btn" type="submit">
                Save
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>Personnel</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={String(p.id)}>
                <td>{String(p.employee_code)}</td>
                <td>{String(p.full_name)}</td>
                <td>{String(p.designation)}</td>
                <td>{String(p.deployment_location || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Attendance (GPS / biometric flags)</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Person</th>
              <th>Status</th>
              <th>In/Out</th>
              <th>GPS</th>
              <th>Bio</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={String(a.id)}>
                <td>{String(a.work_date)}</td>
                <td>#{String(a.personnel_id)}</td>
                <td>{formatLabel(String(a.status))}</td>
                <td>
                  {String(a.in_time || "—")} / {String(a.out_time || "—")}
                </td>
                <td>
                  {a.latitude != null ? `${a.latitude}, ${a.longitude}` : "—"}
                </td>
                <td>{a.biometric_verified ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Leave requests</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Person</th>
              <th>From</th>
              <th>To</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={String(l.id)}>
                <td>#{String(l.personnel_id)}</td>
                <td>{String(l.from_date)}</td>
                <td>{String(l.to_date)}</td>
                <td>{formatLabel(String(l.status))}</td>
                <td>
                  {role === "admin" && l.status === "pending" ? (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={async () => {
                        await api.nhitPost(token!, `/leaves/${l.id}/decide?approve=true`, {});
                        await load();
                      }}
                    >
                      Approve
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function SecurityPage() {
  const { token } = useAuth();
  const [me, setMe] = useState<Row | null>(null);
  const [logs, setLogs] = useState<Row[]>([]);
  const [logins, setLogins] = useState<Row[]>([]);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  usePageTitle("Security & Access");

  const load = async () => {
    if (!token) return;
    try {
      const [m, a, l] = await Promise.all([
        api.nhitGet<Row>(token, "/security/me"),
        api.nhitGet<Row[]>(token, "/security/audit-logs").catch(() => []),
        api.nhitGet<Row[]>(token, "/security/login-history"),
      ]);
      setMe(m);
      setLogs(a);
      setLogins(l);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      <section className="panel">
        <h2>Security posture</h2>
        {me ? (
          <div className="detail-grid">
            <div>
              <strong>MFA</strong>
              <div>{me.mfa_enabled ? "Enabled" : "Off"}</div>
            </div>
            <div>
              <strong>SSO</strong>
              <div>{String(me.sso_status)}</div>
            </div>
            <div>
              <strong>WAF</strong>
              <div>{String(me.waf_status)}</div>
            </div>
            <div className="span-2">
              <strong>Encryption policy</strong>
              <div>{String(me.encryption_policy)}</div>
            </div>
          </div>
        ) : null}
        <div className="form-grid" style={{ marginTop: "1rem" }}>
          <label>
            Set MFA PIN (4–8 digits)
            <input value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>
        </div>
        <div className="btn-row">
          <button
            className="btn"
            type="button"
            onClick={async () => {
              if (!token || pin.length < 4) return;
              await api.nhitPost(token, "/security/mfa", { pin, enabled: true });
              setPin("");
              await load();
            }}
          >
            Enable MFA
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              if (!token) return;
              await api.nhitPost(token, "/security/mfa", { pin: "0000", enabled: false });
              await load();
            }}
          >
            Disable MFA
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Login history</h2>
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>OK</th>
              <th>MFA</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logins.map((l) => (
              <tr key={String(l.id)}>
                <td>{String(l.created_at)}</td>
                <td>#{String(l.user_id)}</td>
                <td>{l.success ? "Yes" : "No"}</td>
                <td>{l.mfa_used ? "Yes" : "No"}</td>
                <td>{String(l.ip_address || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Audit trail</h2>
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={String(l.id)}>
                <td>{String(l.created_at)}</td>
                <td>{String(l.action)}</td>
                <td>
                  {String(l.entity_type)} {String(l.entity_id || "")}
                </td>
                <td>{String(l.detail || "—")}</td>
              </tr>
            ))}
            {!logs.length ? (
              <tr>
                <td colSpan={4}>No audit rows (or not permitted).</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function TollPage() {
  const { token } = useAuth();
  const [dash, setDash] = useState<Row | null>(null);
  const [plazas, setPlazas] = useState<Row[]>([]);
  const [stats, setStats] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  usePageTitle("Toll Operations");

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.nhitGet<Row>(token, "/toll/dashboard"),
      api.nhitGet<Row[]>(token, "/toll/plazas"),
      api.nhitGet<Row[]>(token, "/toll/stats"),
    ])
      .then(([d, p, s]) => {
        setDash(d);
        setPlazas(p);
        setStats(s);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {dash ? (
        <section className="stat-grid">
          <article className="stat">
            <span>Plazas</span>
            <strong>{String(dash.plazas)}</strong>
          </article>
          <article className="stat">
            <span>Traffic</span>
            <strong>{Number(dash.total_traffic || 0).toLocaleString("en-IN")}</strong>
          </article>
          <article className="stat">
            <span>Revenue ₹</span>
            <strong>{money(Number(dash.total_revenue || 0))}</strong>
          </article>
          <article className="stat">
            <span>Avg FASTag %</span>
            <strong>{Number(dash.avg_fastag_pct || 0).toFixed(1)}</strong>
          </article>
        </section>
      ) : null}
      <section className="panel">
        <h2>Toll plazas</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Chainage</th>
              <th>Lanes</th>
              <th>ETC</th>
              <th>Tariff</th>
            </tr>
          </thead>
          <tbody>
            {plazas.map((p) => (
              <tr key={String(p.id)}>
                <td>{String(p.name)}</td>
                <td>{String(p.chainage || "—")}</td>
                <td>{String(p.lanes)}</td>
                <td>{p.has_etc ? "Yes" : "No"}</td>
                <td>{String(p.tariff_notes || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Daily traffic & revenue</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Plaza</th>
              <th>Traffic</th>
              <th>FASTag %</th>
              <th>Revenue</th>
              <th>Lane avail.</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={String(s.id)}>
                <td>{String(s.stat_date)}</td>
                <td>#{String(s.plaza_id)}</td>
                <td>{Number(s.total_traffic || 0).toLocaleString("en-IN")}</td>
                <td>{Number(s.fastag_pct || 0)}</td>
                <td>₹ {money(Number(s.revenue || 0))}</td>
                <td>{Number(s.avg_lane_availability || 0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function HighwayIncidentsPage() {
  const { token, role, isReadonly } = useAuth();
  const [kpis, setKpis] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [vehicles, setVehicles] = useState<Row[]>([]);
  const [form, setForm] = useState({ category: "accident", description: "", chainage: "", source_1033: true });
  const [error, setError] = useState<string | null>(null);
  usePageTitle("Incident & Route Ops");

  const load = async () => {
    if (!token) return;
    try {
      const [k, r, v] = await Promise.all([
        api.nhitGet<Row>(token, "/incidents/kpis"),
        api.nhitGet<Row[]>(token, "/incidents"),
        api.nhitGet<Row[]>(token, "/vehicles"),
      ]);
      setKpis(k);
      setRows(r);
      setVehicles(v);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {kpis ? (
        <section className="stat-grid">
          <article className="stat">
            <span>Active</span>
            <strong>{String(kpis.active)}</strong>
          </article>
          <article className="stat">
            <span>Cleared</span>
            <strong>{String(kpis.cleared)}</strong>
          </article>
          <article className="stat">
            <span>Response vehicles</span>
            <strong>{String(kpis.response_vehicles)}</strong>
          </article>
        </section>
      ) : null}

      {!isReadonly ? (
        <section className="panel">
          <h2>Report incident (incl. 1033)</h2>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!token) return;
              await api.nhitPost(token, "/incidents", form);
              setForm({ category: "accident", description: "", chainage: "", source_1033: true });
              await load();
            }}
          >
            <label>
              Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["accident", "breakdown", "fire", "medical", "security", "other"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Chainage
              <input value={form.chainage} onChange={(e) => setForm({ ...form, chainage: e.target.value })} />
            </label>
            <label className="span-2">
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="span-2">
              <button className="btn" type="submit">
                Create incident
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>Incidents</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Category</th>
              <th>Status</th>
              <th>Chainage</th>
              <th>1033</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.incident_code)}</td>
                <td>{String(r.category)}</td>
                <td>{formatLabel(String(r.status))}</td>
                <td>{String(r.chainage || "—")}</td>
                <td>{r.source_1033 ? "Yes" : "No"}</td>
                <td>
                  {(role === "admin" || role === "government") && r.status === "active" ? (
                    <div className="btn-row">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={async () => {
                          await api.nhitPost(token!, `/incidents/${r.id}/respond?vehicle=RV-01`, {});
                          await load();
                        }}
                      >
                        Respond
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={async () => {
                          await api.nhitPost(token!, `/incidents/${r.id}/clear`, {});
                          await load();
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Response vehicles</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Status</th>
              <th>Base</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={String(v.id)}>
                <td>{String(v.vehicle_code)}</td>
                <td>{String(v.vehicle_type)}</td>
                <td>{formatLabel(String(v.status))}</td>
                <td>{String(v.base_location || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function ItsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  usePageTitle("ATMS / TMS / MLFF / ITS");

  useEffect(() => {
    if (!token) return;
    api
      .nhitGet<Row[]>(token, "/its")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      <section className="panel">
        <h2>System health monitoring</h2>
        <table className="data">
          <thead>
            <tr>
              <th>System</th>
              <th>Name</th>
              <th>Location</th>
              <th>Status</th>
              <th>Health</th>
              <th>Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.system_type).toUpperCase()}</td>
                <td>{String(r.name)}</td>
                <td>{String(r.location || "—")}</td>
                <td>{formatLabel(String(r.status))}</td>
                <td>{Number(r.health_pct || 0)}%</td>
                <td>{String(r.last_heartbeat || "—")}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6}>No ITS devices yet. Use Executive → Load demo data.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function CivilAssetsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  usePageTitle("Civil Assets & GIS");

  useEffect(() => {
    if (!token) return;
    api
      .nhitGet<Row[]>(token, "/assets")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      <section className="panel">
        <h2>Asset inventory (with map coordinates)</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Name</th>
              <th>Chainage</th>
              <th>Condition</th>
              <th>Lat/Lng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.asset_code)}</td>
                <td>{String(r.asset_type)}</td>
                <td>{String(r.name)}</td>
                <td>
                  {String(r.chainage_from || "—")} → {String(r.chainage_to || "—")}
                </td>
                <td>{formatLabel(String(r.condition))}</td>
                <td>{r.latitude != null ? `${r.latitude}, ${r.longitude}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function IntegrationsPage() {
  const { token, role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  usePageTitle("Integrations");

  const load = async () => {
    if (!token) return;
    try {
      setRows(await api.nhitGet<Row[]>(token, "/integrations"));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      <section className="panel">
        <h2>External systems (NHAI CCC, ERP, e-Office, Data Lake, Rajmarg, 1033…)</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Status</th>
              <th>Last sync</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.name)}</td>
                <td>{String(r.system_code)}</td>
                <td>{formatLabel(String(r.status))}</td>
                <td>{String(r.last_sync_at || "—")}</td>
                <td>
                  {role === "admin" ? (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={async () => {
                        await api.nhitPost(token!, `/integrations/${r.id}/sync`, {});
                        await load();
                      }}
                    >
                      Sync now
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function BackupDrPage() {
  const { token, role } = useAuth();
  const [jobs, setJobs] = useState<Row[]>([]);
  const [bcp, setBcp] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  usePageTitle("Backup / DR / BCP");

  const load = async () => {
    if (!token) return;
    try {
      const [j, b] = await Promise.all([
        api.nhitGet<Row[]>(token, "/backup/jobs"),
        api.nhitGet<Row[]>(token, "/bcp"),
      ]);
      setJobs(j);
      setBcp(b);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      <section className="panel">
        <h2>Backup jobs</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Job</th>
              <th>Type</th>
              <th>Schedule</th>
              <th>Location</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={String(j.id)}>
                <td>{String(j.job_name)}</td>
                <td>{String(j.backup_type)}</td>
                <td>{String(j.schedule)}</td>
                <td>{String(j.location)}</td>
                <td>{formatLabel(String(j.last_status))}</td>
                <td>
                  {role === "admin" ? (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={async () => {
                        await api.nhitPost(token!, `/backup/jobs/${j.id}/run`, {});
                        await load();
                      }}
                    >
                      Run / test
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>BCP / DR checklist</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Owner</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bcp.map((b) => (
              <tr key={String(b.id)}>
                <td>{String(b.title)}</td>
                <td>{String(b.category)}</td>
                <td>{String(b.owner || "—")}</td>
                <td>{formatLabel(String(b.status))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
