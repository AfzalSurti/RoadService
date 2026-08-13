import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import type { MprReport, Project, Vendor } from "../types";

const PACKAGES = ["Jabalpur - Lakhnadon", "Lakhnadon - Khawasa", "Bokhedi - Kelapur"];

const empty = {
  package_name: PACKAGES[0],
  project_id: "",
  vendor_id: "",
  report_month: new Date().toISOString().slice(0, 7) + "-01",
  physical_progress: "",
  financial_progress: "",
  rating_performance: "",
  timely_execution: "",
  pending_activity: "",
  critical_observation: "",
  last_remarks: "",
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function MprPage() {
  const { token, fullName, role, isReadonly } = useAuth();
  const canEdit = role === "contractor" && !isReadonly;
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rows, setRows] = useState<MprReport[]>([]);
  const [form, setForm] = useState(empty);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState<"daily" | "weekly" | null>(null);
  const [preparedBy, setPreparedBy] = useState(fullName || "");
  const [reportProjectId, setReportProjectId] = useState("");

  const packageProjects = useMemo(() => {
    const byName = new Map(projects.map((p) => [p.name, p]));
    return PACKAGES.map((name) => ({ name, project: byName.get(name) || null }));
  }, [projects]);

  const linkedVendors = useMemo(() => {
    const pid = form.project_id ? Number(form.project_id) : null;
    if (!pid) return vendors;
    return vendors.filter((v) => !v.project_id || v.project_id === pid);
  }, [vendors, form.project_id]);

  const load = async () => {
    if (!token) return;
    try {
      const [p, v, m] = await Promise.all([
        api.projects(token),
        api.vendors(token).catch(() => [] as Vendor[]),
        api.listMpr(token),
      ]);
      setProjects(p);
      setVendors(v);
      setRows(m);
      setError(null);
      if (!form.project_id) {
        const first = p.find((x) => x.name === PACKAGES[0]) || p[0];
        if (first) {
          setForm((f) => ({ ...f, project_id: String(first.id), package_name: first.name }));
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load MPR");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Monthly Progress Report";
  }, []);

  useEffect(() => {
    void load();
  }, [token]);

  const downloadPeriod = async (period: "daily" | "weekly") => {
    if (!token) return;
    setReportBusy(period);
    setError(null);
    setMsg(null);
    try {
      const blob = await api.exportExcel(token, {
        period_type: period,
        prepared_by: preparedBy.trim() || fullName || "RoadService user",
        project_id: reportProjectId ? Number(reportProjectId) : undefined,
      });
      downloadBlob(blob, `roadservice_${period}_report_${isoToday()}.xlsx`);
      setMsg(period === "daily" ? "Daily report downloaded." : "Weekly report downloaded.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Report download failed");
    } finally {
      setReportBusy(null);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canEdit) return;
    if (!form.project_id) {
      setError("Select a package / project");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("package_name", form.package_name);
      fd.append("project_id", form.project_id);
      fd.append("report_month", form.report_month);
      if (form.vendor_id) fd.append("vendor_id", form.vendor_id);
      if (form.physical_progress.trim()) fd.append("physical_progress", form.physical_progress.trim());
      if (form.financial_progress.trim()) fd.append("financial_progress", form.financial_progress.trim());
      if (form.pending_activity.trim()) fd.append("pending_activity", form.pending_activity.trim());
      if (form.critical_observation.trim()) fd.append("critical_observation", form.critical_observation.trim());
      if (form.last_remarks.trim()) fd.append("last_remarks", form.last_remarks.trim());
      if (pdfFile) fd.append("pdf_file", pdfFile);
      await api.createMpr(token, fd);
      setMsg("MPR saved and linked to the package MPR folder (PDF imported when provided).");
      setPdfFile(null);
      setForm((f) => ({
        ...empty,
        package_name: f.package_name,
        project_id: f.project_id,
        report_month: f.report_month,
      }));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <section className="panel">
        <h2>Daily &amp; Weekly reports</h2>
        <p className="muted">
          Merged here with MPR — quick Excel downloads for today’s issues or the current week
          (Monday–Sunday).
        </p>
        <div className="form-grid" style={{ marginBottom: "0.75rem" }}>
          <label>
            Prepared by
            <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
          </label>
          <label>
            Project (optional)
            <select value={reportProjectId} onChange={(e) => setReportProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="btn-row">
          <button className="btn" type="button" disabled={!!reportBusy} onClick={() => void downloadPeriod("daily")}>
            {reportBusy === "daily" ? "Preparing…" : "Download Daily Report"}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={!!reportBusy}
            onClick={() => void downloadPeriod("weekly")}
          >
            {reportBusy === "weekly" ? "Preparing…" : "Download Weekly Report"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Three package folders (MPR)</h2>
        <p className="muted">
          Each corridor package has a Documents leaf folder: Civil Related → Monthly Progress Report
          (MPR). Agency reports are interlinked with vendor profiles.
        </p>
        <div className="billing-status-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {packageProjects.map((pkg) => (
            <button
              key={pkg.name}
              type="button"
              className="billing-status-card"
              style={{ background: "var(--accent)" }}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  package_name: pkg.name,
                  project_id: pkg.project ? String(pkg.project.id) : f.project_id,
                }))
              }
            >
              <div>{pkg.name}</div>
              <strong style={{ fontSize: "0.95rem" }}>MPR folder</strong>
              <span style={{ opacity: 0.9 }}>
                {pkg.project ? `Project #${pkg.project.id}` : "Open Documents → Setup folders"}
              </span>
            </button>
          ))}
        </div>
      </section>

      {canEdit ? (
        <section className="panel">
          <h2>Fill Monthly Progress Report</h2>
          <form className="form-grid" onSubmit={onSubmit}>
            <label>
              Package
              <select
                value={form.package_name}
                onChange={(e) => {
                  const name = e.target.value;
                  const hit = projects.find((p) => p.name === name);
                  setForm({ ...form, package_name: name, project_id: hit ? String(hit.id) : "" });
                }}
              >
                {PACKAGES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Report month
              <input
                type="date"
                required
                value={form.report_month}
                onChange={(e) => setForm({ ...form, report_month: e.target.value })}
              />
            </label>
            <label className="span-2">
              Vendor / Agency (interlinked)
              <select
                value={form.vendor_id}
                onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
              >
                <option value="">Select vendor</option>
                {linkedVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.type_of_work ? ` · ${v.type_of_work}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Physical Progress
              <textarea
                value={form.physical_progress}
                onChange={(e) => setForm({ ...form, physical_progress: e.target.value })}
              />
            </label>
            <label className="span-2">
              Financial Progress
              <textarea
                value={form.financial_progress}
                onChange={(e) => setForm({ ...form, financial_progress: e.target.value })}
              />
            </label>
            <label className="span-2">
              Pending Activity
              <textarea
                value={form.pending_activity}
                onChange={(e) => setForm({ ...form, pending_activity: e.target.value })}
              />
            </label>
            <label className="span-2">
              Critical observation during this Month
              <textarea
                value={form.critical_observation}
                onChange={(e) => setForm({ ...form, critical_observation: e.target.value })}
              />
            </label>
            <label className="span-2">
              Last Remarks
              <textarea
                value={form.last_remarks}
                onChange={(e) => setForm({ ...form, last_remarks: e.target.value })}
              />
            </label>
            <label className="span-2">
              Upload MPR PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
              <small className="muted">
                {pdfFile ? pdfFile.name : "Choose a PDF file (optional but recommended)"}
              </small>
            </label>
            <div className="span-2">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save MPR"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        {!canEdit ? (
          <p className="muted">View only for GMC MIS Expert and NHIPMPL. Contractor fills the MPR.</p>
        ) : null}
        <h2>Submitted MPRs</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Package</th>
              <th>Month</th>
              <th>Vendor</th>
              <th>Physical</th>
              <th>Financial</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.package_name}</td>
                <td>{String(r.report_month).slice(0, 10)}</td>
                <td>
                  {vendors.find((v) => v.id === r.vendor_id)?.name ||
                    (r.vendor_id ? `#${r.vendor_id}` : "—")}
                </td>
                <td>{r.physical_progress || "—"}</td>
                <td>{r.financial_progress || "—"}</td>
                <td>
                  <div className="final-bill-cell">
                    {r.pdf_path ? (
                      <a href={mediaUrl(r.pdf_path)} target="_blank" rel="noreferrer">
                        Open PDF
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {(canEdit || role === "admin") && !isReadonly ? (
                      <label className="upload-icon-btn" title="Upload MPR PDF">
                        ⬆
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          hidden
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!token || !file) return;
                            try {
                              await api.uploadMprPdf(token, r.id, file);
                              await load();
                              setMsg("MPR PDF uploaded.");
                            } catch (err: unknown) {
                              setError(err instanceof Error ? err.message : "PDF upload failed");
                            }
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="muted">
                  No MPR submitted yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
