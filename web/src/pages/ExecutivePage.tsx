import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { projectIdFromUrl } from "../lib/projectScope";

type Row = Record<string, unknown>;

const emptyForm = {
  stretch_name: "",
  key_features: "",
  total_length_km: "",
  physical_progress_pct: "",
  planned_expenditure: "",
  actual_expenditure: "",
  toll_plazas_count: "",
  avg_lane_availability: "",
  notes: "",
};

function money(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function ExecutivePage() {
  const { token, role } = useAuth();
  const [searchParams] = useSearchParams();
  const scopedProjectId = projectIdFromUrl(searchParams.get("project"));
  const canEdit = role === "admin" || role === "government";

  const [overview, setOverview] = useState<Row | null>(null);
  const [snaps, setSnaps] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) {
      el.textContent = scopedProjectId
        ? `Project Overview · Project #${scopedProjectId}`
        : "Project Overview";
    }
  }, [scopedProjectId]);

  const load = async () => {
    if (!token) return;
    try {
      const [o, s] = await Promise.all([
        api.nhitGet<Row>(token, "/executive/overview").catch(() => null),
        api.nhitGet<Row[]>(token, "/executive").catch(() => [] as Row[]),
      ]);
      setOverview(o);
      setSnaps(s);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load executive summary");
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (r: Row) => {
    setEditingId(Number(r.id));
    setForm({
      stretch_name: String(r.stretch_name ?? ""),
      key_features: String(r.key_features ?? ""),
      total_length_km: r.total_length_km == null ? "" : String(r.total_length_km),
      physical_progress_pct: r.physical_progress_pct == null ? "" : String(r.physical_progress_pct),
      planned_expenditure: r.planned_expenditure == null ? "" : String(r.planned_expenditure),
      actual_expenditure: r.actual_expenditure == null ? "" : String(r.actual_expenditure),
      toll_plazas_count: r.toll_plazas_count == null ? "" : String(r.toll_plazas_count),
      avg_lane_availability:
        r.avg_lane_availability == null ? "" : String(r.avg_lane_availability),
      notes: String(r.notes ?? ""),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canEdit) return;
    if (!form.stretch_name.trim()) {
      setError("Stretch name is required");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    const payload = {
      stretch_name: form.stretch_name.trim(),
      key_features: form.key_features.trim() || null,
      total_length_km: form.total_length_km ? Number(form.total_length_km) : null,
      physical_progress_pct: Number(form.physical_progress_pct || 0),
      planned_expenditure: Number(form.planned_expenditure || 0),
      actual_expenditure: Number(form.actual_expenditure || 0),
      toll_plazas_count: Number(form.toll_plazas_count || 0),
      avg_lane_availability: Number(form.avg_lane_availability || 100),
      notes: form.notes.trim() || null,
    };
    try {
      if (editingId != null) {
        await api.nhitPatch(token, `/executive/${editingId}`, payload);
        setMsg("Stretch snapshot updated.");
      } else {
        await api.nhitPost(token, "/executive", payload);
        setMsg("Stretch snapshot added.");
      }
      resetForm();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!token || !canEdit) return;
    if (!window.confirm("Delete this stretch snapshot?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.nhitDelete(token, `/executive/${id}`);
      if (editingId === id) resetForm();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <h2 style={{ marginTop: 0 }}>Project Overview</h2>

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

      {canEdit ? (
        <section className="panel">
          <h2>{editingId != null ? "Edit stretch snapshot" : "Add stretch snapshot"}</h2>
          <p className="muted">
            These rows feed the Project Overview cards above (stretch count, average physical
            progress, planned and actual spend) and the Stretch snapshots table below.
          </p>
          <form className="form-grid" onSubmit={submit}>
            <label>
              Stretch name
              <input
                required
                value={form.stretch_name}
                onChange={(e) => setForm({ ...form, stretch_name: e.target.value })}
              />
            </label>
            <label>
              Length (km)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.total_length_km}
                onChange={(e) => setForm({ ...form, total_length_km: e.target.value })}
              />
            </label>
            <label>
              Physical progress (%)
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.physical_progress_pct}
                onChange={(e) => setForm({ ...form, physical_progress_pct: e.target.value })}
              />
            </label>
            <label>
              Planned expenditure (₹)
              <input
                type="number"
                step="1"
                min="0"
                value={form.planned_expenditure}
                onChange={(e) => setForm({ ...form, planned_expenditure: e.target.value })}
              />
            </label>
            <label>
              Actual expenditure (₹)
              <input
                type="number"
                step="1"
                min="0"
                value={form.actual_expenditure}
                onChange={(e) => setForm({ ...form, actual_expenditure: e.target.value })}
              />
            </label>
            <label>
              Toll plazas
              <input
                type="number"
                step="1"
                min="0"
                value={form.toll_plazas_count}
                onChange={(e) => setForm({ ...form, toll_plazas_count: e.target.value })}
              />
            </label>
            <label>
              Avg lane availability (%)
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.avg_lane_availability}
                onChange={(e) => setForm({ ...form, avg_lane_availability: e.target.value })}
              />
            </label>
            <label className="span-2">
              Key features
              <input
                value={form.key_features}
                onChange={(e) => setForm({ ...form, key_features: e.target.value })}
                placeholder="6-lane, ETC plazas, ATMS coverage…"
              />
            </label>
            <label className="span-2">
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <div className="btn-row span-2">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : editingId != null ? "Update snapshot" : "Add snapshot"}
              </button>
              {editingId != null ? (
                <button className="btn ghost" type="button" onClick={resetForm} disabled={busy}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>Stretch snapshots</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Stretch</th>
                <th>Length km</th>
                <th>Progress</th>
                <th>Toll plazas</th>
                <th>Lane avail.</th>
                {canEdit ? <th></th> : null}
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
                  {canEdit ? (
                    <td>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => startEdit(r)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => remove(Number(r.id))}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!snaps.length ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5}>
                    No stretch data yet.
                    {canEdit ? " Add a stretch snapshot with the form above." : ""}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
