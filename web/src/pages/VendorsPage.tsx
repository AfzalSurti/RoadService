import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { projectShortName } from "../lib/projectScope";
import { WORK_CATEGORIES, vendorCategory } from "../lib/workCategories";
import type { Project, Vendor } from "../types";

const empty = {
  name: "",
  project_id: "",
  brief: "",
  progress_notes: "",
  delay_notes: "",
  escalation_matrix: "",
  type_of_work: "",
  work_order_date: "",
  commencement_date: "",
  time_limit_completion: "",
  defects_liability_period: "",
  remarks: "",
};

type Filter = "all" | (typeof WORK_CATEGORIES)[number]["key"] | "other";

function vendorToForm(v: Vendor) {
  return {
    name: v.name,
    project_id: v.project_id ? String(v.project_id) : "",
    brief: v.brief || "",
    progress_notes: v.progress_notes || "",
    delay_notes: v.delay_notes || "",
    escalation_matrix: v.escalation_matrix || "",
    type_of_work: v.type_of_work || "",
    work_order_date: v.work_order_date || "",
    commencement_date: v.commencement_date || "",
    time_limit_completion: v.time_limit_completion || "",
    defects_liability_period: v.defects_liability_period || "",
    remarks: v.remarks || "",
  };
}

export function VendorsPage() {
  const { token, role, isReadonly } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(empty);
  const [workOrderFile, setWorkOrderFile] = useState<File | null>(null);
  const [loaFile, setLoaFile] = useState<File | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const canManage = role === "admin" && !isReadonly;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: vendors.length, other: 0 };
    for (const cat of WORK_CATEGORIES) c[cat.key] = 0;
    for (const v of vendors) c[vendorCategory(v) || "other"] += 1;
    return c;
  }, [vendors]);
  const shown = useMemo(
    () => (filter === "all" ? vendors : vendors.filter((v) => (vendorCategory(v) || "other") === filter)),
    [vendors, filter]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(empty);
    setShowForm(true);
  };
  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    setForm(vendorToForm(v));
    setShowForm(true);
  };

  const load = async () => {
    if (!token) return;
    try {
      const [v, p] = await Promise.all([api.vendors(token), api.projects(token)]);
      setVendors(v);
      setProjects(p);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load vendors");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Vendors";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        const opt = (x: string) => x.trim() || null;
        await api.updateVendor(token, editingId, {
          name: form.name.trim(),
          project_id: form.project_id ? Number(form.project_id) : null,
          type_of_work: opt(form.type_of_work),
          work_order_date: form.work_order_date || null,
          commencement_date: form.commencement_date || null,
          time_limit_completion: opt(form.time_limit_completion),
          defects_liability_period: opt(form.defects_liability_period),
          brief: opt(form.brief),
          remarks: opt(form.remarks),
          progress_notes: opt(form.progress_notes),
          delay_notes: opt(form.delay_notes),
          escalation_matrix: opt(form.escalation_matrix),
        });
        setEditingId(null);
        setForm(empty);
        setShowForm(false);
        await load();
        return;
      }
      const fd = new FormData();
      fd.append("name", form.name.trim());
      if (form.project_id) fd.append("project_id", form.project_id);
      if (form.brief.trim()) fd.append("brief", form.brief.trim());
      if (form.progress_notes.trim()) fd.append("progress_notes", form.progress_notes.trim());
      if (form.delay_notes.trim()) fd.append("delay_notes", form.delay_notes.trim());
      if (form.escalation_matrix.trim()) fd.append("escalation_matrix", form.escalation_matrix.trim());
      if (form.type_of_work.trim()) fd.append("type_of_work", form.type_of_work.trim());
      if (form.work_order_date) fd.append("work_order_date", form.work_order_date);
      if (form.commencement_date) fd.append("commencement_date", form.commencement_date);
      if (form.time_limit_completion.trim()) fd.append("time_limit_completion", form.time_limit_completion.trim());
      if (form.defects_liability_period.trim()) {
        fd.append("defects_liability_period", form.defects_liability_period.trim());
      }
      if (form.remarks.trim()) fd.append("remarks", form.remarks.trim());
      if (workOrderFile) fd.append("work_order_file", workOrderFile);
      if (loaFile) fd.append("loa_file", loaFile);
      await api.createVendor(token, fd);
      setForm(empty);
      setWorkOrderFile(null);
      setLoaFile(null);
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <section className="panel">
        <div className="panel-head-row">
          <h2>Vendor profiles</h2>
          {canManage ? (
            <button className="btn" type="button" onClick={openCreate}>
              Add vendor
            </button>
          ) : null}
        </div>

        <div className="works-tabs vendor-filter">
          {([{ key: "all", label: "All vendors" }, ...WORK_CATEGORIES, { key: "other", label: "Other / not set" }] as const).map(
            (c) => (
              <button
                key={c.key}
                type="button"
                className={`works-tab${filter === c.key ? " active" : ""}`}
                onClick={() => setFilter(c.key as Filter)}
              >
                <span className="works-tab-label">{c.label}</span>
                <span className="works-tab-count">{counts[c.key] ?? 0}</span>
              </button>
            )
          )}
        </div>

        <div className="card-list">
          {shown.map((v) => {
            const project = v.project_id ? projects.find((p) => p.id === v.project_id) : null;
            return (
            <article className="panel nested" key={v.id}>
              <div className="panel-head-row">
                <h3>{v.name}</h3>
                {canManage ? (
                  <button type="button" className="btn ghost" onClick={() => openEdit(v)}>
                    Edit
                  </button>
                ) : null}
              </div>
              <p className="muted">
                Project:{" "}
                {v.project_id ? (project ? projectShortName(project) : `#${v.project_id}`) : "All / unassigned"}
              </p>
              <p>
                <strong>Type of work:</strong>{" "}
                {v.type_of_work || <span className="muted">Not set — edit to place it under a work tab</span>}
              </p>
              {(v.work_order_date || v.commencement_date) && (
                <p className="muted">
                  WO date: {v.work_order_date || "—"} · Commencement: {v.commencement_date || "—"}
                </p>
              )}
              {(v.time_limit_completion || v.defects_liability_period) && (
                <p className="muted">
                  Time limit: {v.time_limit_completion || "—"} · DLP: {v.defects_liability_period || "—"}
                </p>
              )}
              {v.brief ? (
                <p>
                  <strong>Brief:</strong> {v.brief}
                </p>
              ) : null}
              {v.remarks ? (
                <p>
                  <strong>Remarks:</strong> {v.remarks}
                </p>
              ) : null}
              {v.progress_notes ? (
                <p>
                  <strong>Progress:</strong> {v.progress_notes}
                </p>
              ) : null}
              {v.delay_notes ? (
                <p>
                  <strong>Delays:</strong> {v.delay_notes}
                </p>
              ) : null}
              {v.escalation_matrix ? (
                <p>
                  <strong>Escalation:</strong> {v.escalation_matrix}
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {v.work_order_path ? (
                  <a className="btn ghost" href={mediaUrl(v.work_order_path)} target="_blank" rel="noreferrer">
                    Vendor Work Order
                  </a>
                ) : null}
                {v.loa_path ? (
                  <a className="btn ghost" href={mediaUrl(v.loa_path)} target="_blank" rel="noreferrer">
                    Letter of Acceptance (LOA)
                  </a>
                ) : null}
              </div>
            </article>
            );
          })}
          {!shown.length ? (
            <p className="muted">{vendors.length ? "No vendors in this category." : "No vendors yet."}</p>
          ) : null}
        </div>
      </section>

      {showForm ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowForm(false);
            setEditingId(null);
          }}
        >
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onCreate}>
            <h2>{editingId ? "Edit vendor" : "Add vendor"}</h2>
            <div className="form-grid">
              <label className="span-2">
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="span-2">
                Project
                <select
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                >
                  <option value="">Optional</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectShortName(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type of Work
                <select
                  value={form.type_of_work}
                  onChange={(e) => setForm({ ...form, type_of_work: e.target.value })}
                >
                  <option value="">Select work tab…</option>
                  {WORK_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.label}>
                      {c.label}
                    </option>
                  ))}
                  {form.type_of_work && !WORK_CATEGORIES.some((c) => c.label === form.type_of_work) ? (
                    <option value={form.type_of_work}>{form.type_of_work} (current)</option>
                  ) : null}
                </select>
              </label>
              <label>
                Work order Date
                <input
                  type="date"
                  value={form.work_order_date}
                  onChange={(e) => setForm({ ...form, work_order_date: e.target.value })}
                />
              </label>
              <label>
                Commencement Date
                <input
                  type="date"
                  value={form.commencement_date}
                  onChange={(e) => setForm({ ...form, commencement_date: e.target.value })}
                />
              </label>
              <label>
                Time Limit for Completion
                <input
                  value={form.time_limit_completion}
                  onChange={(e) => setForm({ ...form, time_limit_completion: e.target.value })}
                  placeholder="e.g. 18 months"
                />
              </label>
              <label>
                Defects Liability&apos;s Period
                <input
                  value={form.defects_liability_period}
                  onChange={(e) => setForm({ ...form, defects_liability_period: e.target.value })}
                  placeholder="e.g. 12 months"
                />
              </label>
              {!editingId ? (
              <>
              <label>
                Vendor Work Order (upload)
                <input type="file" onChange={(e) => setWorkOrderFile(e.target.files?.[0] || null)} />
              </label>
              <label>
                Letter of Acceptance — LOA (upload)
                <input type="file" onChange={(e) => setLoaFile(e.target.files?.[0] || null)} />
              </label>
              </>
              ) : null}
              <label className="span-2">
                Brief
                <textarea
                  value={form.brief}
                  onChange={(e) => setForm({ ...form, brief: e.target.value })}
                />
              </label>
              <label className="span-2">
                Remarks
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                />
              </label>
              <label className="span-2">
                Progress notes
                <textarea
                  value={form.progress_notes}
                  onChange={(e) => setForm({ ...form, progress_notes: e.target.value })}
                />
              </label>
              <label className="span-2">
                Delay notes
                <textarea
                  value={form.delay_notes}
                  onChange={(e) => setForm({ ...form, delay_notes: e.target.value })}
                />
              </label>
              <label className="span-2">
                Escalation matrix
                <textarea
                  value={form.escalation_matrix}
                  onChange={(e) => setForm({ ...form, escalation_matrix: e.target.value })}
                />
              </label>
            </div>
            <div className="btn-row">
              <button className="btn" type="submit" disabled={busy}>
                Save
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
