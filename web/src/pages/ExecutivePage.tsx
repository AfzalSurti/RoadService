import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { projectIdFromUrl, usePackageScope } from "../lib/projectScope";

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
  // Figures follow the sidebar package picker (or the ?project= link).
  const { scopeIds } = usePackageScope();
  const scopeKey = scopedProjectId ? String(scopedProjectId) : (scopeIds || []).join(",");
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
        api.nhitGet<Row>(token, `/executive/overview${scopeKey ? `?project_ids=${scopeKey}` : ""}`).catch(() => null),
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
  }, [token, scopeKey]);

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
        <>
          <section className="stat-grid">
            <article className="stat">
              <span>Contract value (BOQ) ₹</span>
              <strong>{money(Number(overview.contract_value || 0))}</strong>
            </article>
            <article className="stat">
              <span>Work done ₹</span>
              <strong>{money(Number(overview.work_done || 0))}</strong>
            </article>
            <article className="stat">
              <span>Balance ₹</span>
              <strong>{money(Number(overview.balance || 0))}</strong>
            </article>
            <article className="stat">
              <span>Physical progress</span>
              <strong>{Number(overview.physical_progress || 0).toFixed(2)}%</strong>
            </article>
            <Link className="stat" to="/vendors">
              <span>Vendors / work orders</span>
              <strong>{String(overview.vendors ?? 0)}</strong>
            </Link>
            <Link className="stat" to="/rates">
              <span>BOQ items</span>
              <strong>{String(overview.boq_items ?? 0)}</strong>
            </Link>
            <Link className="stat" to="/highway-incidents">
              <span>Active incidents</span>
              <strong>{String(overview.active_incidents ?? 0)}</strong>
            </Link>
            <Link className="stat" to="/its">
              <span>ITS not online</span>
              <strong>{String(overview.its_not_online ?? 0)}</strong>
            </Link>
          </section>

          <section className="panel">
            <h2>Vendor-wise contract value and progress</h2>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Package</th>
                    <th>Work tab</th>
                    <th>BOQ items</th>
                    <th>Contract value ₹</th>
                    <th>Work done ₹</th>
                    <th>Balance ₹</th>
                    <th>Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {((overview.vendor_rows as Row[] | undefined) || []).map((v) => (
                    <tr key={String(v.id)}>
                      <td>
                        <Link to={`/vendors?id=${v.id}`}>{String(v.name)}</Link>
                      </td>
                      <td>{String(v.package || "—")}</td>
                      <td>{String(v.type_of_work || "—")}</td>
                      <td>{String(v.boq_items)}</td>
                      <td>{money(Number(v.contract_value || 0))}</td>
                      <td className="boq-done">{money(Number(v.work_done || 0))}</td>
                      <td className="boq-remaining">{money(Number(v.balance || 0))}</td>
                      <td>{v.progress == null ? "—" : `${Number(v.progress).toFixed(1)}%`}</td>
                      <td>{String(v.status || "—")}</td>
                    </tr>
                  ))}
                  {!((overview.vendor_rows as Row[] | undefined) || []).length ? (
                    <tr>
                      <td colSpan={9} className="muted">
                        No vendors for the chosen package(s) yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
