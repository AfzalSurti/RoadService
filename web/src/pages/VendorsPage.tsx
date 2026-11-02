import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { projectShortName, usePackageScope } from "../lib/projectScope";
import { VendorDocumentsModal } from "../components/VendorDocumentsModal";
import {
  VENDOR_DOC_TYPES,
  WORK_CATEGORIES,
  daysInputValue,
  formatDays,
  vendorCategory,
} from "../lib/workCategories";
import type { Project, User, Vendor } from "../types";

const empty = {
  name: "",
  project_id: "",
  contractor_user_id: "",
  brief: "",
  progress_notes: "",
  delay_notes: "",
  escalation_matrix: "",
  type_of_work: "",
  work_order_date: "",
  commencement_date: "",
  time_limit_completion: "",
  defects_liability_period: "",
  extension_of_time: "",
  remarks: "",
};

type Filter = "all" | (typeof WORK_CATEGORIES)[number]["key"] | "other";

function vendorToForm(v: Vendor) {
  return {
    name: v.name,
    project_id: v.project_id ? String(v.project_id) : "",
    contractor_user_id: v.contractor_user_id ? String(v.contractor_user_id) : "",
    brief: v.brief || "",
    progress_notes: v.progress_notes || "",
    delay_notes: v.delay_notes || "",
    escalation_matrix: v.escalation_matrix || "",
    type_of_work: v.type_of_work || "",
    work_order_date: v.work_order_date || "",
    commencement_date: v.commencement_date || "",
    time_limit_completion: daysInputValue(v.time_limit_completion),
    defects_liability_period: daysInputValue(v.defects_liability_period),
    extension_of_time: daysInputValue(v.extension_of_time),
    remarks: v.remarks || "",
  };
}

export function VendorsPage() {
  const { token, role, isReadonly } = useAuth();
  const [allVendors, setVendors] = useState<Vendor[]>([]);
  const [allProjects, setProjects] = useState<Project[]>([]);
  // Sidebar package scope: only the chosen packages' rows are shown.
  const { inScope } = usePackageScope();
  const vendors = useMemo(() => allVendors.filter((x) => x.project_id == null || inScope(x.project_id)), [allVendors, inScope]);
  const projects = useMemo(() => allProjects.filter((x) => inScope(x.id)), [allProjects, inScope]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(empty);
  // Files picked in the form, per document type; uploaded after the vendor is saved.
  const [newFiles, setNewFiles] = useState<Record<string, File[]>>({});
  const [docsVendor, setDocsVendor] = useState<Vendor | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [contractors, setContractors] = useState<User[]>([]);
  // Old free-text values ("18 months") that do not fit the days inputs, shown as hints while editing.
  const [legacyDays, setLegacyDays] = useState<{ time: string; dlp: string; eot: string }>({
    time: "",
    dlp: "",
    eot: "",
  });
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

  // Deep link (global search): /vendors?id=ID
  const [params] = useSearchParams();
  const linkVendor = Number(params.get("id") || 0) || null;
  useEffect(() => {
    if (!linkVendor || !vendors.length) return;
    setFilter("all");
    window.setTimeout(
      () => document.getElementById(`vendor-${linkVendor}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50
    );
  }, [linkVendor, vendors.length]);

  const openCreate = () => {
    setEditingId(null);
    setForm(empty);
    setLegacyDays({ time: "", dlp: "", eot: "" });
    setNewFiles({});
    setShowForm(true);
  };
  const openEdit = (v: Vendor) => {
    setEditingId(v.id);
    setForm(vendorToForm(v));
    setLegacyDays({
      time: v.time_limit_completion && !daysInputValue(v.time_limit_completion) ? v.time_limit_completion : "",
      dlp: v.defects_liability_period && !daysInputValue(v.defects_liability_period) ? v.defects_liability_period : "",
      eot: v.extension_of_time && !daysInputValue(v.extension_of_time) ? v.extension_of_time : "",
    });
    setNewFiles({});
    setShowForm(true);
  };
  const contractorName = (id: number | null) =>
    id ? contractors.find((c) => c.id === id)?.full_name || `User #${id}` : null;

  const load = async () => {
    if (!token) return;
    try {
      const [v, p, c] = await Promise.all([
        api.vendors(token),
        api.projects(token),
        role === "admin" ? api.users(token, "contractor").catch(() => [] as User[]) : Promise.resolve([] as User[]),
      ]);
      setVendors(v);
      setProjects(p);
      setContractors(c);
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

  const uploadPicked = async (vendorId: number) => {
    if (!token) return;
    for (const t of VENDOR_DOC_TYPES) {
      const files = newFiles[t.key] || [];
      if (files.length) await api.uploadVendorDocuments(token, vendorId, t.key, files);
    }
    setNewFiles({});
  };

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
          contractor_user_id: form.contractor_user_id ? Number(form.contractor_user_id) : null,
          type_of_work: opt(form.type_of_work),
          work_order_date: form.work_order_date || null,
          commencement_date: form.commencement_date || null,
          time_limit_completion: opt(form.time_limit_completion),
          defects_liability_period: opt(form.defects_liability_period),
          extension_of_time: opt(form.extension_of_time),
          brief: opt(form.brief),
          remarks: opt(form.remarks),
          progress_notes: opt(form.progress_notes),
          delay_notes: opt(form.delay_notes),
          escalation_matrix: opt(form.escalation_matrix),
        });
        await uploadPicked(editingId);
        setEditingId(null);
        setForm(empty);
        setShowForm(false);
        await load();
        return;
      }
      const fd = new FormData();
      fd.append("name", form.name.trim());
      if (form.project_id) fd.append("project_id", form.project_id);
      if (form.contractor_user_id) fd.append("contractor_user_id", form.contractor_user_id);
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
      if (form.extension_of_time.trim()) fd.append("extension_of_time", form.extension_of_time.trim());
      if (form.remarks.trim()) fd.append("remarks", form.remarks.trim());
      const created = await api.createVendor(token, fd);
      await uploadPicked(created.id);
      setForm(empty);
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
            <article
              className={`panel nested${linkVendor === v.id ? " search-hit" : ""}`}
              key={v.id}
              id={`vendor-${v.id}`}
            >
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
              {canManage ? (
                <p className="muted">
                  Contractor login:{" "}
                  {contractorName(v.contractor_user_id) || "Not linked — edit to link its mobile-app login"}
                </p>
              ) : null}
              <p>
                <strong>Type of work:</strong>{" "}
                {v.type_of_work || <span className="muted">Not set — edit to place it under a work tab</span>}
              </p>
              {(v.work_order_date || v.commencement_date) && (
                <p className="muted">
                  WO date: {v.work_order_date || "—"} · Commencement: {v.commencement_date || "—"}
                </p>
              )}
              {(v.time_limit_completion || v.defects_liability_period || v.extension_of_time) && (
                <p className="muted">
                  Time limit: {formatDays(v.time_limit_completion)} · DLP: {formatDays(v.defects_liability_period)} ·
                  EOT: {formatDays(v.extension_of_time)}
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
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={() => setDocsVendor(v)}>
                  View details · Documents
                </button>
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
              <label className="span-2">
                Contractor login <small className="muted">(the vendor&apos;s mobile-app user — its issues, invoices and documents)</small>
                <select
                  value={form.contractor_user_id}
                  onChange={(e) => setForm({ ...form, contractor_user_id: e.target.value })}
                >
                  <option value="">Not linked</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.email}
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
                Time Limit for Completion (days)
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.time_limit_completion}
                  onChange={(e) => setForm({ ...form, time_limit_completion: e.target.value })}
                  placeholder="e.g. 540"
                />
                {legacyDays.time ? <small className="muted">Was: {legacyDays.time} — enter it in days</small> : null}
              </label>
              <label>
                Defects Liability Period (days)
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.defects_liability_period}
                  onChange={(e) => setForm({ ...form, defects_liability_period: e.target.value })}
                  placeholder="e.g. 365"
                />
                {legacyDays.dlp ? <small className="muted">Was: {legacyDays.dlp} — enter it in days</small> : null}
              </label>
              <label>
                EOT — Extension of Time (days)
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.extension_of_time}
                  onChange={(e) => setForm({ ...form, extension_of_time: e.target.value })}
                  placeholder="e.g. 90"
                />
                {legacyDays.eot ? <small className="muted">Was: {legacyDays.eot} — enter it in days</small> : null}
              </label>
              <h3 className="span-2 form-section">
                Documents <small className="muted">(several files allowed per type{editingId ? "; existing files are under View details" : ""})</small>
              </h3>
              {VENDOR_DOC_TYPES.map((t) => (
                <label key={t.key}>
                  {t.label} (upload)
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setNewFiles((prev) => ({ ...prev, [t.key]: files }));
                    }}
                  />
                  {newFiles[t.key]?.length ? (
                    <small className="muted">{newFiles[t.key].length} file(s) selected</small>
                  ) : null}
                </label>
              ))}
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
      {docsVendor ? <VendorDocumentsModal vendor={docsVendor} onClose={() => setDocsVendor(null)} /> : null}
    </>
  );
}
