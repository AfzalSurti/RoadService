import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { formatLabel } from "../components/StatusBadge";
import type { Issue, Project, SiteRfi } from "../types";

const empty = {
  project_id: "",
  subject: "",
  description: "",
  chainage: "",
  priority: "medium",
  related_issue_id: "",
  ae_name: "",
  contractor_name: "",
  category: "",
  inspection_date: "",
};

const REPORT_VIEWS = ["RFI View", "RFI ScheduleH View", "Stake Holder View"];

export function RfiPage() {
  const { token, role } = useAuth();
  const [rows, setRows] = useState<SiteRfi[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<SiteRfi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRaise, setShowRaise] = useState(false);
  const [form, setForm] = useState(empty);
  const [photo, setPhoto] = useState<File | null>(null);
  const [answer, setAnswer] = useState("");
  const [reportView, setReportView] = useState("RFI View");
  const [filters, setFilters] = useState({
    ae_name: "",
    project_id: "",
    contractor: "",
    status: "",
  });

  const isAdminViewOnly = role === "admin";
  const canRaise = role === "contractor" || role === "surveyor";
  const canAnswer = role === "government" || role === "surveyor";

  const aeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.ae_name) set.add(r.ae_name);
    return [...set];
  }, [rows]);
  const contractorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.contractor_name) set.add(r.contractor_name);
    return [...set];
  }, [rows]);

  const load = async () => {
    if (!token) return;
    try {
      const [list, proj, iss] = await Promise.all([
        api.rfis(token, {
          status: filters.status || undefined,
          project_id: filters.project_id ? Number(filters.project_id) : undefined,
          ae_name: filters.ae_name || undefined,
          contractor: filters.contractor || undefined,
        }),
        api.projects(token),
        api.issues(token).catch(() => [] as Issue[]),
      ]);
      setRows(list);
      setProjects(proj);
      setIssues(iss);
      setError(null);
      if (selected) {
        const fresh = list.find((r) => r.id === selected.id) || null;
        setSelected(fresh);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load RFIs");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = isAdminViewOnly ? "RFI — View only" : "RFI — Site Request for Information";
  }, [isAdminViewOnly]);

  useEffect(() => {
    void load();
  }, [token, filters.status, filters.project_id, filters.ae_name, filters.contractor]);

  const onRaise = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canRaise) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("project_id", form.project_id);
      fd.append("subject", form.subject.trim());
      fd.append("description", form.description.trim());
      if (form.chainage.trim()) fd.append("chainage", form.chainage.trim());
      fd.append("priority", form.priority);
      if (form.related_issue_id) fd.append("related_issue_id", form.related_issue_id);
      if (form.ae_name.trim()) fd.append("ae_name", form.ae_name.trim());
      if (form.contractor_name.trim()) fd.append("contractor_name", form.contractor_name.trim());
      if (form.category.trim()) fd.append("category", form.category.trim());
      if (form.inspection_date) fd.append("inspection_date", form.inspection_date);
      if (photo) fd.append("photo", photo);
      const created = await api.raiseRfi(token, fd);
      setShowRaise(false);
      setForm(empty);
      setPhoto(null);
      setMsg(`RFI ${created.rfi_no} raised`);
      setSelected(created);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Raise failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = () => {
    const headers = [
      "RFI No",
      "Project",
      "AE Name",
      "Contractor",
      "Category",
      "Subject",
      "Chainage",
      "Inspection date",
      "Status",
      "Priority",
    ];
    const lines = rows.map((r) =>
      [
        r.rfi_no,
        projects.find((p) => p.id === r.project_id)?.name || r.project_id,
        r.ae_name || "",
        r.contractor_name || "",
        r.category || "",
        r.subject,
        r.chainage || "",
        r.inspection_date || "",
        r.status,
        r.priority,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfi-${reportView.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <section className="panel">
        <div className="panel-head-row">
          <div>
            <h2>RFI (Request for Information)</h2>
            <p className="muted" style={{ margin: 0 }}>
              {isAdminViewOnly
                ? "GMC MIS Expert has view-only access. Download the RFI report — raise, answer and close are not available."
                : "Site inspection / clarification requests. Contractor raises; NHIPMPL / GMC representative answer."}
            </p>
          </div>
          {canRaise ? (
            <button className="btn" type="button" onClick={() => setShowRaise(true)}>
              Raise new RFI
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Select Report View</h2>
        <label>
          Report view
          <select value={reportView} onChange={(e) => setReportView(e.target.value)}>
            {REPORT_VIEWS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <h2>{reportView}</h2>
        <div className="form-grid">
          <label>
            AE Name
            <select
              value={filters.ae_name}
              onChange={(e) => setFilters({ ...filters, ae_name: e.target.value })}
            >
              <option value="">Select AE</option>
              {aeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project Code / EPC
            <select
              value={filters.project_id}
              onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
            >
              <option value="">Select Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contractor
            <select
              value={filters.contractor}
              onChange={(e) => setFilters({ ...filters, contractor: e.target.value })}
            >
              <option value="">Select Contractor</option>
              {contractorOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            RFI Status
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">Select Status</option>
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </div>
        <div className="btn-row" style={{ marginTop: "1rem" }}>
          <button className="btn" type="button" onClick={downloadReport}>
            Download Report
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setFilters({ ae_name: "", project_id: "", contractor: "", status: "" })}
          >
            Clear
          </button>
        </div>
      </section>

      <div className="docs-layout">
        <section className="panel">
          <table className="data">
            <thead>
              <tr>
                <th>RFI No</th>
                <th>Project</th>
                <th>AE</th>
                <th>Contractor</th>
                <th>Subject</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.rfi_no}</td>
                  <td>{projects.find((p) => p.id === r.project_id)?.name || `#${r.project_id}`}</td>
                  <td>{r.ae_name || "—"}</td>
                  <td>{r.contractor_name || "—"}</td>
                  <td>{r.subject}</td>
                  <td>{formatLabel(r.status)}</td>
                  <td>
                    <button className="btn ghost" type="button" onClick={() => setSelected(r)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No RFIs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <aside className="panel docs-sidebar">
          <h2>Details</h2>
          {!selected ? (
            <p className="muted">Select an RFI.</p>
          ) : (
            <>
              <p>
                <strong>{selected.rfi_no}</strong> · {formatLabel(selected.status)}
              </p>
              <p className="muted">
                {projects.find((p) => p.id === selected.project_id)?.name || `Project #${selected.project_id}`}
                {selected.chainage ? ` · Ch. ${selected.chainage}` : ""}
                {selected.ae_name ? ` · AE ${selected.ae_name}` : ""}
                {selected.contractor_name ? ` · ${selected.contractor_name}` : ""}
              </p>
              <h3 style={{ fontSize: "0.95rem" }}>{selected.subject}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>
              {selected.category ? <p>Category: {selected.category}</p> : null}
              {selected.inspection_date ? <p>Inspection date: {String(selected.inspection_date).slice(0, 10)}</p> : null}
              {selected.photo_path ? (
                <p>
                  <a href={mediaUrl(selected.photo_path)} target="_blank" rel="noreferrer">
                    Open attached photo
                  </a>
                </p>
              ) : null}
              {selected.related_issue_id ? (
                <p>
                  Related defect/issue: <Link to="/issues">{`#${selected.related_issue_id}`}</Link>
                </p>
              ) : null}
              {selected.answer_text ? (
                <p>
                  <strong>Answer:</strong> {selected.answer_text}
                </p>
              ) : null}

              {canAnswer && selected.can_answer ? (
                <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
                  <label>
                    Answer *
                    <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} />
                  </label>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || answer.trim().length < 3}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      try {
                        const updated = await api.answerRfi(token, selected.id, {
                          answer_text: answer.trim(),
                        });
                        setSelected(updated);
                        setAnswer("");
                        setMsg(`${updated.rfi_no} answered`);
                        await load();
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Answer failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Submit answer
                  </button>
                </div>
              ) : null}

              {selected.can_close && !isAdminViewOnly ? (
                <button
                  className="btn secondary"
                  type="button"
                  style={{ marginTop: "0.75rem" }}
                  disabled={busy}
                  onClick={async () => {
                    if (!token) return;
                    setBusy(true);
                    try {
                      const updated = await api.closeRfi(token, selected.id);
                      setSelected(updated);
                      setMsg(`${updated.rfi_no} closed`);
                      await load();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "Close failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Close RFI
                </button>
              ) : null}
            </>
          )}
        </aside>
      </div>

      {showRaise && canRaise ? (
        <div className="modal-backdrop" onClick={() => setShowRaise(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onRaise}>
            <h2>New inspection / RFI request</h2>
            <div className="form-grid">
              <label className="span-2">
                Project *
                <select
                  required
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value, related_issue_id: "" })}
                >
                  <option value="">Select</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                AE Name
                <input
                  value={form.ae_name}
                  onChange={(e) => setForm({ ...form, ae_name: e.target.value })}
                  placeholder="Authority Engineer"
                />
              </label>
              <label>
                Contractor
                <input
                  value={form.contractor_name}
                  onChange={(e) => setForm({ ...form, contractor_name: e.target.value })}
                />
              </label>
              <label>
                Category
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Pavement / Structure / ITS"
                />
              </label>
              <label>
                Inspection date
                <input
                  type="date"
                  value={form.inspection_date}
                  onChange={(e) => setForm({ ...form, inspection_date: e.target.value })}
                />
              </label>
              <label>
                Chainage start–end
                <input
                  value={form.chainage}
                  onChange={(e) => setForm({ ...form, chainage: e.target.value })}
                  placeholder="e.g. 12+500 to 12+650"
                />
              </label>
              <label>
                Priority
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="span-2">
                Related site defect / issue (optional)
                <select
                  value={form.related_issue_id}
                  onChange={(e) => setForm({ ...form, related_issue_id: e.target.value })}
                >
                  <option value="">None</option>
                  {issues
                    .filter((i) => !form.project_id || String(i.project_id) === form.project_id)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        #{i.id} · {i.issue_type} · {i.status}
                      </option>
                    ))}
                </select>
              </label>
              <label className="span-2">
                Subject *
                <input
                  required
                  minLength={3}
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </label>
              <label className="span-2">
                Work description / clarification needed *
                <textarea
                  required
                  minLength={5}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="span-2">
                Photo / screenshot
                <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit inspection request"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowRaise(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
