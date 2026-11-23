import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { ProjectSelect } from "../components/ProjectSelect";
import { useSearchParams } from "react-router-dom";
import { projectIdFromUrl, projectShortName, usePackageScope } from "../lib/projectScope";
import type { MprReport, Project, Vendor } from "../types";

const empty = {
  package_name: "",
  project_id: "",
  vendor_id: "",
  report_month: new Date().toISOString().slice(0, 10),
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
  // MIS reports are daily: contractors and GMC Experts upload them; NHIPMPL views.
  const canEdit = (role === "contractor" || role === "admin") && !isReadonly;
  const [allProjects, setProjects] = useState<Project[]>([]);
  const [allVendors, setVendors] = useState<Vendor[]>([]);
  const [allRows, setRows] = useState<MprReport[]>([]);
  // Opening from a package (?project=) narrows the sidebar scope to it; only the
  // chosen packages' cards and reports are shown.
  const [params] = useSearchParams();
  projectIdFromUrl(params.get("project"));
  const { inScope } = usePackageScope();
  const projects = useMemo(() => allProjects.filter((x) => inScope(x.id)), [allProjects, inScope]);
  const vendors = useMemo(() => allVendors.filter((x) => x.project_id == null || inScope(x.project_id)), [allVendors, inScope]);
  const [dayFilter, setDayFilter] = useState("");
  const [importInfo, setImportInfo] = useState<{ text: string; errors: string[] } | null>(null);
  const rows = useMemo(
    () =>
      allRows
        .filter((x) => inScope(x.project_id) && (!dayFilter || String(x.report_month).slice(0, 10) === dayFilter))
        .sort((a, b) => String(b.report_month).localeCompare(String(a.report_month))),
    [allRows, inScope, dayFilter]
  );
  const fmtDay = (d: unknown) => String(d || "").slice(0, 10).split("-").reverse().join(".");
  const [form, setForm] = useState(empty);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState<"daily" | "weekly" | null>(null);
  const [preparedBy, setPreparedBy] = useState(fullName || "");
  const [reportProjectId, setReportProjectId] = useState("");
  const [review, setReview] = useState<
    Record<number, { status: NonNullable<MprReport["review_status"]>; remark: string }>
  >({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const isAdmin = role === "admin" && !isReadonly;

  const reviewLabel = (s: MprReport["review_status"]) =>
    s === "approved" ? "Approved" : s === "not_approved" ? "Not Approved" : "Pending";

  const saveReview = async (r: MprReport) => {
    if (!token) return;
    const rv = review[r.id] ?? {
      status: r.review_status ?? "pending",
      remark: r.review_remark ?? "",
    };
    setSavingId(r.id);
    setError(null);
    setMsg(null);
    try {
      await api.reviewMpr(token, r.id, { review_status: rv.status, review_remark: rv.remark });
      setMsg("MIS report review saved.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save review");
    } finally {
      setSavingId(null);
    }
  };

  // One MIS folder card per active project package (names come from Projects).
  const packageProjects = useMemo(
    () => [...projects].sort((a, b) => a.id - b.id).map((p) => ({ name: p.name, project: p })),
    [projects]
  );

  const linkedVendors = useMemo(() => {
    const pid = form.project_id ? Number(form.project_id) : null;
    if (!pid) return vendors;
    return vendors.filter((v) => !v.project_id || v.project_id === pid);
  }, [vendors, form.project_id]);

  const load = async () => {
    if (!token) return;
    try {
      const [p, v] = await Promise.all([
        api.projects(token).catch(() => [] as Project[]),
        api.vendors(token).catch(() => [] as Vendor[]),
      ]);
      setProjects(p);
      setVendors(v);
      if (!form.project_id) {
        const ordered = [...p].sort((a, b) => a.id - b.id);
        const first = ordered.find((x) => inScope(x.id)) || ordered[0];
        if (first) {
          setForm((f) => ({ ...f, project_id: String(first.id), package_name: first.name }));
        }
      }
      try {
        const m = await api.listMpr(token);
        setRows(m);
        setError(null);
      } catch (e: unknown) {
        setRows([]);
        setError(
          e instanceof Error
            ? `${e.message} — run NEON_SQL_FIX.sql for monthly_progress_reports if this persists.`
            : "Failed to load MIS reports"
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load MIS reports");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "MIS Report";
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
      setMsg("MIS report saved and linked to the package MIS folder (PDF imported when provided).");
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
          Merged here with the MIS Report — quick Excel downloads for today’s issues or the current week
          (Monday–Sunday).
        </p>
        <div className="form-grid" style={{ marginBottom: "0.75rem" }}>
          <label>
            Prepared by
            <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
          </label>
          <ProjectSelect
            label="Project (optional)"
            allowAll
            value={reportProjectId}
            onChange={setReportProjectId}
          />
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
        <h2>Package folders (MIS Reports)</h2>
        <p className="muted">
          Each corridor package has a Documents leaf folder: Civil Related → Project Documents → MIS Reports.
          Agency reports are interlinked with vendor profiles.
        </p>
        <div
          className="billing-status-grid"
          style={{ gridTemplateColumns: `repeat(${Math.min(packageProjects.length, 3) || 1}, minmax(0, 1fr))` }}
        >
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
                  project_id: String(pkg.project.id),
                }))
              }
            >
              <div>{projectShortName(pkg.project)}</div>
              <strong style={{ fontSize: "0.95rem" }}>MIS folder</strong>
              <span style={{ opacity: 0.9 }}>
                {`Project #${pkg.project.id}`}
              </span>
            </button>
          ))}
        </div>
      </section>

      {canEdit ? (
        <section className="panel">
          <h2>Add daily MIS report</h2>
          <form className="form-grid" onSubmit={onSubmit}>
            <ProjectSelect
              required
              label="Package / Project"
              value={form.project_id}
              onChange={(id) => {
                const hit = projects.find((p) => String(p.id) === id);
                setForm({
                  ...form,
                  project_id: id,
                  package_name: hit?.name || form.package_name,
                });
              }}
            />
            <label>
              Report date
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
              Upload MIS report PDF
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
                {busy ? "Saving…" : "Save MIS report"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        {!canEdit ? (
          <p className="muted">View only for NHIPMPL. Contractors and GMC Experts upload the daily MIS reports.</p>
        ) : null}
        <div className="panel-head-row">
          <h2>MIS reports</h2>
          <div className="btn-row">
            <label className="atms-upload-day">
              Day
              <input type="date" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} />
            </label>
            {dayFilter ? (
              <button type="button" className="btn ghost" onClick={() => setDayFilter("")}>
                All days
              </button>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
                const head = ["Date", "Package", "Vendor", "Physical Progress", "Financial Progress", "Rating / Performance",
                  "Timely Execution", "Pending Activity", "Critical Observation", "Remarks", "Status"];
                const lines = [head.map(cell).join(","), ...rows.map((r) => [
                  fmtDay(r.report_month), r.package_name, allVendors.find((v) => v.id === r.vendor_id)?.name || "",
                  r.physical_progress, r.financial_progress, r.rating_performance, r.timely_execution,
                  r.pending_activity, r.critical_observation, r.last_remarks, r.review_status,
                ].map(cell).join(","))];
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
                a.download = `MIS_report_${dayFilter || new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
              }}
            >
              Export to Excel
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    if (!token) return;
                    try {
                      const blob = await api.downloadMisTemplate(token);
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "mis_report_template.xlsx";
                      a.click();
                    } catch (e: unknown) {
                      setError(e instanceof Error ? e.message : "Download failed");
                    }
                  }}
                >
                  Excel template
                </button>
                <label className={`btn${busy ? " disabled" : ""}`} style={{ cursor: "pointer" }}>
                  {busy ? "Importing…" : "Import from Excel"}
                  <input
                    type="file"
                    accept=".xlsx,.xlsm"
                    hidden
                    disabled={busy}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!token || !f) return;
                      setBusy(true);
                      setError(null);
                      setImportInfo(null);
                      try {
                        const r = await api.importMis(token, f, projects.length === 1 ? projects[0].id : undefined);
                        setImportInfo({
                          text: `${r.added} added, ${r.updated} updated${r.error_count ? `, ${r.error_count} row(s) skipped` : ""}.`,
                          errors: r.errors,
                        });
                        await load();
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Import failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
              </>
            ) : null}
          </div>
        </div>
        {importInfo ? (
          <div className={importInfo.errors.length ? "error" : "ok"}>
            <strong>Excel import:</strong> {importInfo.text}
            {importInfo.errors.length ? (
              <ul style={{ margin: "0.4rem 0 0" }}>
                {importInfo.errors.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <table className="data">
          <thead>
            <tr>
              <th>Package</th>
              <th>Date</th>
              <th>Vendor</th>
              <th>Physical</th>
              <th>Financial</th>
              <th>PDF</th>
              <th>Status</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.package_name}</td>
                <td>{fmtDay(r.report_month)}</td>
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
                      <label className="upload-icon-btn" title="Upload MIS report PDF">
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
                              setMsg("MIS report PDF uploaded.");
                            } catch (err: unknown) {
                              setError(err instanceof Error ? err.message : "PDF upload failed");
                            }
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                </td>
                {(() => {
                  const rv =
                    review[r.id] ?? {
                      status: r.review_status ?? "pending",
                      remark: r.review_remark ?? "",
                    };
                  const setRv = (patch: Partial<typeof rv>) =>
                    setReview((m) => ({ ...m, [r.id]: { ...rv, ...patch } }));
                  return (
                    <>
                      <td>
                        {isAdmin ? (
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                            <select
                              value={rv.status}
                              onChange={(e) =>
                                setRv({ status: e.target.value as typeof rv.status })
                              }
                            >
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="not_approved">Not Approved</option>
                            </select>
                            <button
                              type="button"
                              className="btn ghost"
                              disabled={savingId === r.id}
                              onClick={() => void saveReview(r)}
                            >
                              {savingId === r.id ? "…" : "Save"}
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`badge${
                              r.review_status === "approved"
                                ? " status-closed"
                                : r.review_status === "not_approved"
                                  ? " status-under_review"
                                  : ""
                            }`}
                          >
                            {reviewLabel(r.review_status)}
                          </span>
                        )}
                      </td>
                      <td>
                        {isAdmin ? (
                          <input
                            value={rv.remark}
                            placeholder="Remark"
                            onChange={(e) => setRv({ remark: e.target.value })}
                          />
                        ) : (
                          r.review_remark || "—"
                        )}
                      </td>
                    </>
                  );
                })()}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="muted">
                  {dayFilter ? `No MIS report for ${fmtDay(dayFilter)}.` : "No MIS report submitted yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
