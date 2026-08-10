import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Project } from "../types";

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

function isoWeekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: toIso(monday), to: toIso(sunday) };
}

export function ReportsPage() {
  const { token, fullName } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "daily" | "weekly" | "import" | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [periodType, setPeriodType] = useState<"custom" | "daily" | "weekly">("custom");
  const [form, setForm] = useState({
    report_title: "RoadService Issues Report",
    project_id: "",
    package_name: "",
    date_from: "",
    date_to: "",
    prepared_by: fullName || "",
    remarks: "",
  });

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Reports & Analytics";
  }, []);

  useEffect(() => {
    if (!token) return;
    api.projects(token).then(setProjects).catch(() => setProjects([]));
  }, [token]);

  useEffect(() => {
    if (periodType === "daily") {
      const t = isoToday();
      setForm((f) => ({
        ...f,
        date_from: t,
        date_to: t,
        report_title: `Daily Issues Report — ${t}`,
      }));
    } else if (periodType === "weekly") {
      const { from, to } = isoWeekRange();
      setForm((f) => ({
        ...f,
        date_from: from,
        date_to: to,
        report_title: `Weekly Issues Report — ${from} to ${to}`,
      }));
    }
  }, [periodType]);

  const commonParams = () => ({
    project_id: form.project_id ? Number(form.project_id) : undefined,
    package_name: form.package_name || undefined,
    prepared_by: form.prepared_by.trim() || fullName || "RoadService user",
    remarks: form.remarks || undefined,
  });

  const downloadPeriod = async (period: "daily" | "weekly" | "custom") => {
    if (!token) return;
    if (!form.prepared_by.trim() && period === "custom") {
      setError("Prepared by is required before download");
      return;
    }
    setBusy(period === "custom" ? "download" : period);
    setError(null);
    setMsg(null);
    try {
      const blob = await api.exportExcel(token, {
        ...commonParams(),
        period_type: period,
        report_title: form.report_title.trim() || undefined,
        date_from: period === "custom" ? form.date_from || undefined : undefined,
        date_to: period === "custom" ? form.date_to || undefined : undefined,
      });
      const day = isoToday();
      downloadBlob(blob, `roadservice_${period}_report_${day}.xlsx`);
      setMsg(
        period === "daily"
          ? "Daily report Excel downloaded (today’s issues + summary)."
          : period === "weekly"
            ? "Weekly report Excel downloaded (this week Mon–Sun + summary)."
            : "Excel downloaded. Edit the Issues sheet if needed, then import it below."
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.report_title.trim() || !form.prepared_by.trim()) {
      setError("Report title and Prepared by are required before download");
      return;
    }
    await downloadPeriod(periodType);
  };

  const onImport = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !importFile) {
      setError("Choose an Excel file to import");
      return;
    }
    setBusy("import");
    setError(null);
    setMsg(null);
    try {
      const result = await api.importExcel(token, importFile);
      setMsg(
        `Imported from ${result.filename}: updated ${result.updated}, skipped ${result.skipped}.` +
          (result.errors?.length ? ` Notes: ${result.errors.slice(0, 3).join("; ")}` : "")
      );
      setImportFile(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="panel">
        <h2>Daily &amp; Weekly reports</h2>
        <p className="muted">
          Quick Excel downloads for today’s issues or the current week (Monday–Sunday), including a
          status summary sheet.
        </p>
        {error ? <div className="error">{error}</div> : null}
        {msg ? <div className="ok">{msg}</div> : null}
        <div className="form-grid" style={{ marginBottom: "0.5rem" }}>
          <label>
            Prepared by
            <input
              value={form.prepared_by}
              onChange={(e) => setForm({ ...form, prepared_by: e.target.value })}
              placeholder="Your name / agency"
            />
          </label>
          <label>
            Project (optional)
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="btn"
            type="button"
            disabled={!!busy}
            onClick={() => void downloadPeriod("daily")}
          >
            {busy === "daily" ? "Preparing…" : "Download Daily Report"}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={!!busy}
            onClick={() => void downloadPeriod("weekly")}
          >
            {busy === "weekly" ? "Preparing…" : "Download Weekly Report"}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Excel report (custom / import)</h2>
        <p className="muted">
          Choose Daily, Weekly, or Custom period, fill details, download Excel, then import if you
          need to push edits back into the system.
        </p>

        <form className="form-grid" onSubmit={onDownload} style={{ marginBottom: "1.25rem" }}>
          <label>
            Report period
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as "custom" | "daily" | "weekly")}
            >
              <option value="custom">Custom date range</option>
              <option value="daily">Daily (today)</option>
              <option value="weekly">Weekly (this week)</option>
            </select>
          </label>
          <label>
            Report title *
            <input
              required
              value={form.report_title}
              onChange={(e) => setForm({ ...form, report_title: e.target.value })}
            />
          </label>
          <label>
            Prepared by *
            <input
              required
              value={form.prepared_by}
              onChange={(e) => setForm({ ...form, prepared_by: e.target.value })}
              placeholder="Your name / agency"
            />
          </label>
          <label>
            Project
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Package / Stretch
            <input
              value={form.package_name}
              onChange={(e) => setForm({ ...form, package_name: e.target.value })}
              placeholder="e.g. Jabalpur - Lakhnadon"
            />
          </label>
          <label>
            Period from
            <input
              type="date"
              value={form.date_from}
              disabled={periodType !== "custom"}
              onChange={(e) => setForm({ ...form, date_from: e.target.value })}
            />
          </label>
          <label>
            Period to
            <input
              type="date"
              value={form.date_to}
              disabled={periodType !== "custom"}
              onChange={(e) => setForm({ ...form, date_to: e.target.value })}
            />
          </label>
          <label className="span-2">
            Remarks
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="Optional notes shown on the Report Details sheet"
            />
          </label>
          <div className="span-2">
            <button className="btn" type="submit" disabled={!!busy}>
              {busy === "download" || busy === "daily" || busy === "weekly"
                ? "Preparing Excel…"
                : `Download ${periodType === "custom" ? "Excel" : periodType + " report"}`}
            </button>
          </div>
        </form>

        <form className="form-grid" onSubmit={onImport}>
          <label className="span-2">
            Import Excel (Issues sheet — data taken from this file)
            <input
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
          </label>
          <div className="span-2">
            <button className="btn secondary" type="submit" disabled={!!busy || !importFile}>
              {busy === "import" ? "Importing…" : "Import Excel"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
